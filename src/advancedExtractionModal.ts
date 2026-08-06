import {
	AbstractInputSuggest,
	App,
	ButtonComponent,
	MarkdownView,
	Modal,
	moment,
	normalizePath,
	Notice,
	Platform,
	SearchComponent,
	Setting,
	TFile,
	ToggleComponent,
} from "obsidian";
import { t } from "lang/helpers";
import PDFAnnotationPlugin from "src/main";
import { createCollapsible } from "src/collapsible";
import {
	daysOfAnnotations,
	filterAnnotations,
	PageSelection,
} from "src/extractionFilter";
import { SUPPORTED_ANNOTS } from "src/settings";
import { LoadedAnnotations } from "src/types";

/**
 * A place on the machine rather than in the vault. Only tells the two apart —
 * whether the path leads to a readable PDF is the loader's answer to give.
 */
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/|~[\\/])/;

/** The PDF an extraction is to read, once the field has been made sense of. */
type ExtractionSource =
	| { kind: "vault"; file: TFile }
	| { kind: "external"; path: string };

/**
 * Where an extraction puts what it gathered, which the ordinary commands each
 * decide for themselves. Separate notes first: a reader who has narrowed one
 * down is picking annotations apart, not filing them together.
 */
const EXTRACTION_TARGETS = {
	separate: t.MODAL_TARGET_SEPARATE,
	single: t.MODAL_TARGET_SINGLE,
	current: t.MODAL_TARGET_CURRENT,
};

type ExtractionTarget = keyof typeof EXTRACTION_TARGETS;

/** Tells one source from another, so a PDF already read is not read again. */
function sourceKey(source: ExtractionSource): string {
	return source.kind === "vault"
		? `vault:${source.file.path}`
		: `external:${source.path}`;
}

/** A path is pasted with the file manager's quotes as often as without. */
function unquote(raw: string): string {
	return raw.trim().replace(/^["']|["']$/g, "");
}

/**
 * A day as the reader's language writes one. Days are held and sorted as
 * `YYYY-MM-DD` and only spelled out here, so the list stays in calendar order
 * whatever the format puts first. Obsidian sets moment's locale to the app's,
 * so a Russian interface reads Russian months without a translation here.
 */
/** The slice of a moment object a day is rendered through. */
interface FormattedDate {
	isValid(): boolean;
	format(format: string): string;
}

// Narrowed to the one call and two methods used rather than typed as
// `moment.Moment`: `moment` reaches us through Obsidian's re-export of the
// moment package, and an `any` here would spread into everything the day is
// written into. The cast is also what keeps this compiling under TypeScript 6,
// which makes esModuleInterop mandatory — Obsidian declares the re-export as
// `typeof Moment` off a namespace import, and a namespace import of a package
// that exports by assignment no longer carries its call signatures.
const parseDay = moment as unknown as (
	value: string,
	format: string,
	strict: boolean,
) => FormattedDate;

function readableDay(day: string): string {
	const date = parseDay(day, "YYYY-MM-DD", true);
	return date.isValid() ? date.format(t.DATE_FORMAT) : day;
}

/** Type-ahead over the PDFs in the vault, for the field that names one. */
class PDFFileSuggest extends AbstractInputSuggest<TFile> {
	getSuggestions(query: string): TFile[] {
		const wanted = query.toLowerCase();
		return this.app.vault
			.getFiles()
			.filter(
				(file) =>
					file.extension.toLowerCase() === "pdf" &&
					file.path.toLowerCase().includes(wanted)
			);
	}

	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}
}

/**
 * The extraction a reader sets up rather than one a command already decided.
 * The PDF is read once and kept — the list of dates can only be made from the
 * annotations themselves, so extracting filters what is already in hand.
 */
export class AdvancedExtractionModal extends Modal {
	private readonly plugin: PDFAnnotationPlugin;

	/** What the file field says, before anything has been made of it. */
	private path = "";
	private pages = "";
	private byPageLabel = false;
	private byDate = false;
	private target: ExtractionTarget = "separate";

	/**
	 * The days still ticked. Null until the list is built and again whenever
	 * the field names a different PDF; every day starts ticked, since the list
	 * is there to leave days out.
	 */
	private chosenDays: Set<string> | null = null;

	/**
	 * The types ticked for this extraction, starting as the settings have them.
	 * Ticking one here settles this extraction only, never the setting behind
	 * every other command.
	 */
	private readonly chosenSubtypes = new Set<string>();

	/** The PDF read so far, under the key of the source it was read from. */
	private loaded: { key: string; result: LoadedAnnotations } | null = null;
	private reading = false;

	private fileInput: SearchComponent | null = null;
	private dateToggle: ToggleComponent | null = null;
	private extractButton: ButtonComponent | null = null;
	private dateListEl: HTMLElement | null = null;
	/** Puts the list of dates one way or the other, with the motion. */
	private showDateList: ((shown: boolean, animate: boolean) => void) | null =
		null;

	constructor(app: App, plugin: PDFAnnotationPlugin) {
		super(app);
		this.plugin = plugin;
	}

	/** One card, in the bordered style the settings tab groups its own into. */
	private card(): HTMLElement {
		return this.contentEl.createDiv({ cls: "pdf-annotations-modal-card" });
	}

	/** The settings tab's grid, answering the same question for this run. */
	private addSubtypes(): void {
		const setting = new Setting(this.card())
			.setName(t.SETTING_ANNOTATIONS_NAME)
			.setClass("pdf-annotations-stacked-setting");

		const grid = setting.controlEl.createDiv({
			cls: "pdf-annotations-annotation-grid",
		});
		for (const { subtype, description } of SUPPORTED_ANNOTS) {
			if (this.plugin.settings.isAnnotationDesired(subtype)) {
				this.chosenSubtypes.add(subtype);
			}

			const option = grid.createEl("label", {
				cls: "pdf-annotations-annotation-option",
			});
			const box = option.createEl("input", { type: "checkbox" });
			box.checked = this.chosenSubtypes.has(subtype);
			box.addEventListener("change", () => {
				if (box.checked) {
					this.chosenSubtypes.add(subtype);
				} else {
					this.chosenSubtypes.delete(subtype);
				}
			});
			option.createSpan({ text: description });
		}
	}

	onOpen(): void {
		this.setTitle(t.MODAL_ADVANCED_TITLE);

		this.addSubtypes();

		new Setting(this.card())
			.setName(t.MODAL_FILE_NAME)
			.setClass("pdf-annotations-stacked-setting")
			.addSearch((search) => {
				this.fileInput = search;
				search.setPlaceholder(t.MODAL_FILE_PLACEHOLDER);
				search.onChange((value) => this.setPath(value));

				const suggest = new PDFFileSuggest(this.app, search.inputEl);
				suggest.onSelect((file) => {
					search.setValue(file.path);
					this.setPath(file.path);
					// Registering a callback takes the selection over,
					// closing the popover included.
					suggest.close();
				});
			});

		// One question, one card: the toggle says what the field above it
		// means. The placeholder shows the shape of an answer, so neither
		// needs a description.
		const pagesCard = this.card();
		new Setting(pagesCard)
			.setName(t.MODAL_PAGES_NAME)
			.setClass("pdf-annotations-stacked-setting")
			.addText((text) => {
				text.setPlaceholder(t.MODAL_PAGES_PLACEHOLDER);
				text.onChange((value) => {
					this.pages = value;
				});
			});
		new Setting(pagesCard)
			.setName(t.MODAL_PAGE_LABELS_NAME)
			.addToggle((toggle) =>
				toggle.setValue(this.byPageLabel).onChange((value) => {
					this.byPageLabel = value;
				})
			);

		const datesCard = this.card();
		datesCard.addClass("pdf-annotations-dates-card");
		new Setting(datesCard)
			.setName(t.MODAL_DATES_NAME)
			.setDesc(t.MODAL_DATES_DESC)
			.addToggle((toggle) => {
				this.dateToggle = toggle;
				toggle.setValue(this.byDate).onChange((value) => {
					this.byDate = value;
					this.refresh();
					if (value) void this.prepare();
				});
			});

		// The panel opens and closes and carries no layout of its own: a
		// `display` on it would outrank `pdf-annotations-collapsed` and keep a
		// closed panel on screen. The column lives on the list inside.
		const datePanel = datesCard.createDiv({
			cls: "pdf-annotations-collapsible pdf-annotations-collapsed",
		});
		this.dateListEl = datePanel.createDiv({
			cls: "pdf-annotations-date-list",
		});
		this.showDateList = createCollapsible(datePanel);

		new Setting(this.card())
			.setName(t.MODAL_TARGET_NAME)
			.addDropdown((dropdown) => {
				dropdown
					.addOptions(EXTRACTION_TARGETS)
					.setValue(this.target)
					.onChange((value) => {
						this.target = value as ExtractionTarget;
					});
			});

		// A plain row: a setting row draws a rule and pads for a name and
		// description this one does not have.
		const actions = this.contentEl.createDiv({
			cls: "pdf-annotations-modal-actions",
		});
		this.extractButton = new ButtonComponent(actions)
			.setButtonText(t.MODAL_EXTRACT)
			.setCta()
			.onClick(() => void this.extract());

		this.refresh(false);
		this.releaseFocus();
		void this.prefillFromClipboard();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	/**
	 * Obsidian focuses a modal's first field, which here opens the type-ahead
	 * over the whole vault unasked. Given up once that focus is handed out.
	 */
	private releaseFocus(): void {
		const input = this.fileInput?.inputEl;
		if (!input) return;

		// `input.doc` rather than the global one, so the check still holds for a
		// modal opened in a window popped out of the main one.
		window.requestAnimationFrame(() => {
			if (input.doc.activeElement === input) input.blur();
		});
	}

	/**
	 * A path in the clipboard is most likely the one to extract, so it is filled
	 * in — but only when it names a readable PDF. Anything else is the reader's
	 * own and would just have to be cleared out again.
	 */
	private async prefillFromClipboard(): Promise<void> {
		try {
			const clipped = unquote(await navigator.clipboard.readText());
			if (this.path || !this.resolveSource(clipped)) return;

			this.fileInput?.setValue(clipped);
			this.setPath(clipped);
		} catch (error) {
			// No clipboard to read, which is a setup question rather than
			// anything this extraction went wrong at.
			console.error(error);
		}
	}

	/** The PDF the field names, or null while it names none this can read. */
	private resolveSource(raw: string = this.path): ExtractionSource | null {
		const path = unquote(raw);
		if (!path) return null;

		// The vault first: a vault path is what the type-ahead offers and the
		// shorter of the two, so it is also what gets typed by hand.
		const inVault = this.app.vault.getFileByPath(normalizePath(path));
		if (inVault && inVault.extension.toLowerCase() === "pdf") {
			return { kind: "vault", file: inVault };
		}

		if (Platform.isDesktopApp && ABSOLUTE_PATH.test(path)) {
			return { kind: "external", path };
		}
		return null;
	}

	private setPath(value: string): void {
		this.path = value;
		const source = this.resolveSource();

		// What was read belongs to the PDF it was read from: pointed elsewhere,
		// or cleared, the annotations and the ticked days both go.
		if (!source || (this.loaded && sourceKey(source) !== this.loaded.key)) {
			this.loaded = null;
			this.chosenDays = null;
			this.dateListEl?.empty();
		}

		this.refresh();
		// Read as soon as there is something to read, asked for or not: reading
		// is the slow part, and the list should be there when it opens.
		if (source) void this.prepare();
	}

	/** Whatever the field says now decides what can be done about it. */
	private refresh(animate = true): void {
		const ready = this.resolveSource() !== null;

		this.dateToggle?.setDisabled(!ready);
		this.extractButton?.setDisabled(!ready || this.reading);
		this.showDateList?.(this.byDate && ready, animate);
	}

	private async load(
		source: ExtractionSource
	): Promise<LoadedAnnotations | null> {
		// Every type, whichever are ticked, so ticking one off needs no second
		// read of the PDF.
		const everyType = SUPPORTED_ANNOTS.map(({ subtype }) => subtype);

		if (source.kind === "vault") {
			return this.plugin.loadAnnotationsFromVaultFile(
				source.file,
				everyType
			);
		}

		// One file: the pages and the days this window filters by are a single
		// PDF's, so a path naming a folder is a path it cannot use. The loader
		// has told the reader what was wrong with it already.
		return this.plugin.loadAnnotationsFromExternalFile(
			source.path,
			everyType
		);
	}

	/** Read on first ask and kept; the dates and the extraction both want them. */
	private async ensureLoaded(): Promise<LoadedAnnotations | null> {
		const source = this.resolveSource();
		if (!source) return null;

		const key = sourceKey(source);
		if (this.loaded?.key === key) return this.loaded.result;

		this.reading = true;
		this.refresh();
		this.showMessage(t.MODAL_READING);
		try {
			const result = await this.load(source);
			if (!result) return null;

			// Typed on while the PDF was being read: what came back is no
			// longer what the field asks for.
			const still = this.resolveSource();
			if (!still || sourceKey(still) !== key) return null;

			this.loaded = { key, result };
			return result;
		} catch (error) {
			console.error(error);
			new Notice(t.NOTICE_EXTRACTION_FAILED);
			return null;
		} finally {
			this.reading = false;
			this.refresh();
		}
	}

	private showMessage(message: string): void {
		this.dateListEl?.empty();
		this.dateListEl?.createDiv({
			cls: "pdf-annotations-date-message",
			text: message,
		});
	}

	/**
	 * Reads the PDF and fills the list of days. Started as soon as one is named
	 * rather than when the list opens, into a panel still closed until then.
	 */
	private async prepare(): Promise<void> {
		const loaded = await this.ensureLoaded();
		if (loaded) this.showDays(loaded);
	}

	private showDays(loaded: LoadedAnnotations): void {
		const days = daysOfAnnotations(loaded.annotations);
		this.chosenDays ??= new Set(days);

		if (days.length === 0) {
			this.showMessage(t.MODAL_DATES_NONE);
			return;
		}

		const list = this.dateListEl;
		if (!list) return;
		list.empty();
		for (const day of days) {
			const option = list.createEl("label", {
				cls: "pdf-annotations-date-option",
			});
			const box = option.createEl("input", { type: "checkbox" });
			box.checked = this.chosenDays.has(day);
			box.addEventListener("change", () => {
				if (box.checked) {
					this.chosenDays?.add(day);
				} else {
					this.chosenDays?.delete(day);
				}
			});
			// The PDF dated it not at all, which is a thing a reader may want
			// to leave out like any other day.
			option.createSpan({ text: day ? readableDay(day) : t.NOTE_NO_DATE });
		}
	}

	private async extract(): Promise<void> {
		const { selection, invalid } = PageSelection.parse(this.pages);
		// Extracting only the pages that were understood is the wrong
		// extraction, not a smaller one.
		if (invalid.length > 0) {
			new Notice(`${t.NOTICE_PAGES_UNREADABLE}: ${invalid.join(", ")}`);
			return;
		}

		const loaded = await this.ensureLoaded();
		if (!loaded) return;

		const annotations = filterAnnotations(loaded.annotations, {
			pages: selection,
			byPageLabel: this.byPageLabel,
			days: this.byDate ? this.chosenDays : null,
			subtypes: this.chosenSubtypes,
		});
		// Here an empty note would mean the filters were narrowed too far,
		// which is worth saying rather than filing.
		if (annotations.length === 0) {
			new Notice(t.NOTICE_NOTHING_SELECTED);
			return;
		}

		// Asked for from the palette, so no note need be open. Checked before
		// closing: it is a choice to change, not an extraction to lose.
		const view =
			this.target === "current"
				? this.app.workspace.getActiveViewOfType(MarkdownView)
				: null;
		if (this.target === "current" && !view) {
			new Notice(t.NOTICE_NO_NOTE_TO_INSERT_INTO);
			return;
		}

		this.close();
		const extraction = { ...loaded, annotations };
		if (view) {
			await this.plugin.insertLoadedAnnotations(extraction, view);
		} else {
			await this.plugin.writeLoadedAnnotations(
				extraction,
				this.target === "separate"
			);
		}
	}
}
