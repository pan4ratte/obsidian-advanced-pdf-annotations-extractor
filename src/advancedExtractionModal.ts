import {
	AbstractInputSuggest,
	App,
	ButtonComponent,
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
 * A path that names a place on the machine rather than in the vault: a drive
 * letter, a UNC share, a unix root, or a home directory. Only used to tell the
 * two apart in the field — whether the path leads to a readable PDF is the
 * loader's answer to give.
 */
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\|\/|~[\\/])/;

/** The PDF an extraction is to read, once the field has been made sense of. */
type ExtractionSource =
	| { kind: "vault"; file: TFile }
	| { kind: "external"; path: string };

/**
 * Tells one source from another, so a PDF already read is not read again and a
 * field pointed somewhere else drops what was read from where it pointed
 * before.
 */
function sourceKey(source: ExtractionSource): string {
	return source.kind === "vault"
		? `vault:${source.file.path}`
		: `external:${source.path}`;
}

/**
 * A path is pasted with the quotes the file manager copied it in as often as
 * without them.
 */
function unquote(raw: string): string {
	return raw.trim().replace(/^["']|["']$/g, "");
}

/**
 * A day as the reader's language writes one — "July 25, 2026", and the same day
 * in the months and word order of whatever language Obsidian is in. The days
 * are held and sorted as `YYYY-MM-DD` throughout and only spelled out here, so
 * the order of the list stays the order of the calendar whatever the format
 * puts first.
 *
 * Obsidian sets moment's locale to the app's own, so a Russian interface reads
 * Russian months even where this plugin has no translation of its own yet.
 * Anything that is not a day is left as it stands rather than shown as an
 * invalid date.
 */
function readableDay(day: string): string {
	const date = moment(day, "YYYY-MM-DD", true);
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
 * The extraction a reader sets up rather than one a command already decided:
 * which PDF, which pages, and which of the days its annotations were made on.
 *
 * The PDF is read once and kept, since the list of dates can only be made from
 * the annotations themselves — so extracting filters what is already in hand
 * instead of reading the file a second time.
 */
export class AdvancedExtractionModal extends Modal {
	private readonly plugin: PDFAnnotationPlugin;

	/** What the file field says, before anything has been made of it. */
	private path = "";
	private pages = "";
	private byPageLabel = false;
	private byDate = false;

	/**
	 * The days still ticked in the list. Null until the list has been built,
	 * and back to null whenever the field names a different PDF — every day is
	 * ticked to begin with, since the list is there to leave days out.
	 */
	private chosenDays: Set<string> | null = null;

	/**
	 * The annotation types ticked for this extraction, which start as the ones
	 * the settings ask for. Ticking one here settles this extraction and no
	 * other: the modal is where an extraction is decided, not where the setting
	 * behind every other command is changed.
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

	/**
	 * One card, in the bordered style the settings tab groups its own settings
	 * into. Every question the modal asks is a card, so the three of them read
	 * as three questions rather than as one column of rows.
	 */
	private card(): HTMLElement {
		return this.contentEl.createDiv({ cls: "pdf-annotations-modal-card" });
	}

	/**
	 * The annotation types this extraction is to write, ticked as the settings
	 * have them: the same grid as the settings tab, answering the same question,
	 * for this extraction only.
	 */
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
					// Registering a callback takes the selection over, closing
					// the popover included: left to itself it stays open over
					// the field it has just answered.
					suggest.close();
				});
			});

		// The pages and how to read them are one question, so they share a card:
		// the toggle says what the field above it means, and neither carries a
		// description — the placeholder shows the shape of an answer, and the
		// toggle's own wording is the whole of what it does.
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

		// The panel is what opens and closes, and it carries no layout of its
		// own: `pdf-annotations-collapsed` is a plain class, so a `display` on
		// the panel would be read after it and keep a closed panel on screen.
		// The list inside it is where the column lives.
		const datePanel = datesCard.createDiv({
			cls: "pdf-annotations-collapsible pdf-annotations-collapsed",
		});
		this.dateListEl = datePanel.createDiv({
			cls: "pdf-annotations-date-list",
		});
		this.showDateList = createCollapsible(datePanel);

		// A plain row rather than a setting: a setting row draws a rule above
		// itself and pads for a name and description this one does not have, all
		// of which would only have to be taken back off again.
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
	 * Obsidian hands a modal's focus to the first field in it, which here opens
	 * the type-ahead over every PDF in the vault before anything has been asked
	 * of it. Given up on the next frame, once that focus has been handed out.
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
	 * A path already in the clipboard is most likely the one the reader came
	 * here to extract, so it is filled in — but only when it names a PDF this
	 * plugin can read. Anything else in the clipboard is the reader's own, and
	 * dropping it into the field would only have to be cleared out again.
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

		// What was read belongs to the PDF it was read from. Pointed at another
		// one — or at nothing, the field having been cleared — the annotations
		// and the days ticked from them both go, list and all.
		if (!source || (this.loaded && sourceKey(source) !== this.loaded.key)) {
			this.loaded = null;
			this.chosenDays = null;
			this.dateListEl?.empty();
		}

		this.refresh();
		// Read as soon as there is something to read, whether or not the dates
		// have been asked for: reading is the slow part, and a reader who turns
		// the list on then waits for what could have been read already.
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
		// Every type is read, whichever are ticked: ticking one off is then
		// answered out of what is already in hand rather than by reading the
		// whole PDF over again.
		const everyType = SUPPORTED_ANNOTS.map(({ subtype }) => subtype);

		if (source.kind === "vault") {
			return this.plugin.loadAnnotationsFromVaultFile(
				source.file,
				everyType
			);
		}

		const { grandtotal, pdfFile } =
			await this.plugin.loadAnnotationsFromSinglePDFFileFromClipboardPath(
				source.path,
				everyType
			);
		// The loader has told the reader what was wrong with the path already.
		if (!pdfFile) return null;
		return {
			fileMeta: pdfFile,
			annotations: grandtotal,
			isExternalFile: true,
		};
	}

	/**
	 * The annotations of the PDF the field names, read the first time they are
	 * asked for and kept afterwards: the list of dates and the extraction
	 * itself both want them, and a PDF is slow enough to read once.
	 */
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
	 * Reads the PDF the field names and puts its days in the list. Started as
	 * soon as a PDF is named rather than when the list is asked for, so the list
	 * is already there when it opens; the panel it fills is closed until then.
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
		// Extracting the pages that were understood would quietly leave out the
		// ones that were not, which is the wrong extraction rather than a
		// smaller one.
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
		// A note saying it holds no annotations is what the ordinary commands
		// write for a PDF that has none. Here it would mean the pages or dates
		// were narrowed too far, which is worth saying instead of filing.
		if (annotations.length === 0) {
			new Notice(t.NOTICE_NOTHING_SELECTED);
			return;
		}

		this.close();
		await this.plugin.writeLoadedAnnotations({ ...loaded, annotations });
	}
}
