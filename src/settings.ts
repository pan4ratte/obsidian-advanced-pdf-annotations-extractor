import {
	AbstractInputSuggest,
	AbstractTextComponent,
	App,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	setIcon,
	Setting,
	setTooltip,
	TextAreaComponent,
	ToggleComponent,
} from "obsidian";
import { t } from "lang/helpers";
import PDFAnnotationPlugin from "src/main";
import { createCollapsible } from "src/collapsible";
import { asIndexable } from "src/types";

// The variable names are the interface — what a template types — so they live
// here; only their descriptions are translated. The whole annotation is
// available as {{annotation}} too, for fields that have no shortcut of their own.
export const TEMPLATE_VARIABLES: Record<string, string> = {
	highlightedText: t.VAR_HIGHLIGHTED_TEXT,
	folder: t.VAR_FOLDER,
	filename: t.VAR_FILENAME,
	filepath: t.VAR_FILEPATH,
	filelink: t.VAR_FILELINK,
	pageNumber: t.VAR_PAGE_NUMBER,
	pageLabel: t.VAR_PAGE_LABEL,
	author: t.VAR_AUTHOR,
	body: t.VAR_BODY,
	type: t.VAR_TYPE,
	topic: t.VAR_TOPIC,
	created: t.VAR_CREATED,
	isExternal: t.VAR_IS_EXTERNAL,
};

export interface SupportedAnnotation {
	/** PDF annotation subtype, as reported by pdf.js. */
	subtype: string;
	description: string;
	/**
	 * True for the text markup types, which carry QuadPoints: the PDF text
	 * under them is extracted into {{highlightedText}}. The rest contribute
	 * only their own comment.
	 */
	marksUpText?: boolean;
	/** Part of the default selection. */
	desiredByDefault?: boolean;
}

// The types carrying text a note can show: the PDF text they mark up, or text
// the reader typed. The graphical types (Ink, Square, Stamp, …) are left out on
// purpose — their content is a drawing and their Contents is usually empty, so
// extracting them yields blank entries. Link, Widget and Popup are not the
// reader's annotations at all.
export const SUPPORTED_ANNOTS: SupportedAnnotation[] = [
	{
		subtype: "Highlight",
		description: t.ANNOT_HIGHLIGHT,
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Underline",
		description: t.ANNOT_UNDERLINE,
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Squiggly",
		description: t.ANNOT_SQUIGGLY,
		marksUpText: true,
	},
	{
		subtype: "StrikeOut",
		description: t.ANNOT_STRIKEOUT,
		marksUpText: true,
	},
	{
		subtype: "Text",
		description: t.ANNOT_TEXT,
		desiredByDefault: true,
	},
	{ subtype: "FreeText", description: t.ANNOT_FREE_TEXT },
];

export const ANNOTS_TREATED_AS_HIGHLIGHTS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.marksUpText
).map((annotation) => annotation.subtype);

/**
 * The template picker's entry for the template every annotation type falls back
 * on. Not a subtype, so it cannot collide with one.
 */
export const DEFAULT_TEMPLATE_KEY = "default";

/**
 * Nothing to begin with, so `defaultTemplate` covers every type. It carries a
 * `{{highlightedText}}` of its own, which renders empty for the types that mark
 * up nothing, so none of them needs a template to start on.
 */
export function defaultAnnotationTemplates(): Record<string, string> {
	return Object.fromEntries(
		SUPPORTED_ANNOTS.map(({ subtype }) => [subtype, ""])
	);
}

/**
 * This type's own template, or the default. Blank counts as none, so clearing
 * one hands the type back to the default rather than writing nothing.
 */
export function templateForAnnotation(
	settings: PDFAnnotationPluginSetting,
	subtype: string
): string {
	const own = settings.annotationTemplates?.[subtype] ?? "";
	return own.trim().length > 0 ? own : settings.defaultTemplate;
}

export const DEFAULT_DESIRED_ANNOTATIONS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.desiredByDefault
).map((annotation) => annotation.subtype);

/**
 * Which extractions move the tags in the comments to the note's properties. The
 * two kinds differ in what a tag means: on one note holding every annotation it
 * is the PDF's subject, on a note per annotation only that comment's. Inserting
 * into the note being edited counts as a single note.
 */
export const TAG_EXTRACTION_MODES = {
	never: t.OPTION_EXTRACT_TAGS_NEVER,
	always: t.OPTION_EXTRACT_TAGS_ALWAYS,
	single: t.OPTION_EXTRACT_TAGS_SINGLE,
	separate: t.OPTION_EXTRACT_TAGS_SEPARATE,
};

export type TagExtraction = keyof typeof TAG_EXTRACTION_MODES;

/**
 * What the heading above each group of annotations shows. Only what is written:
 * the order is `sortByTopic` and `groupByFolder`.
 */
export const FILE_HEADINGS = ["folder", "file", "none"] as const;
export type FileHeading = (typeof FILE_HEADINGS)[number];

/**
 * Where the notes go. `current` follows the file being looked at rather than
 * the PDF — the same folder when the PDF is open, and the only one there is
 * when the PDF lives outside the vault.
 */
export const NOTE_LOCATIONS = ["current", "vault"] as const;
export type NoteLocation = (typeof NOTE_LOCATIONS)[number];

/** Characters Obsidian will not take in a path, whatever a template renders. */
const ILLEGAL_PATH_CHARS = /[\\:*?"<>|]/g;

/**
 * A folder as a path can use it: no stray slashes, no characters Obsidian
 * rejects, every part trimmed. A nested path survives, an empty one stays empty.
 */
function cleanFolderPath(value: string): string {
	return value
		.replace(ILLEGAL_PATH_CHARS, "")
		.split("/")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join("/");
}

/**
 * Long enough for a `{{topic}}` sentence, short enough that the path around it
 * still fits. Counted in characters, not storage units, so no cut falls inside
 * one.
 */
const MAX_NOTE_NAME_LENGTH = 100;

/**
 * A note name a vault will take: rejected characters out, line breaks collapsed
 * to spaces, no leading dot (a note nobody sees) or trailing one. Empty when
 * nothing usable is left, for the caller to name instead.
 */
export function cleanNoteName(value: string): string {
	const collapsed = value
		.replace(ILLEGAL_PATH_CHARS, "")
		// A name is one path part: a slash in it would write the note somewhere
		// else, which is what the subfolder setting is for.
		.replace(/\//g, " ")
		.replace(/\s+/g, " ")
		.trim();
	// Spread rather than `slice`, which counts UTF-16 units and would cut an
	// emoji — or anything else written outside the basic plane — in half,
	// leaving a name no file system will take.
	const cut = [...collapsed].slice(0, MAX_NOTE_NAME_LENGTH).join("");

	return cut
		.replace(/^\.+/, "")
		.replace(/[. ]+$/, "")
		.trim();
}

/**
 * Where one note is written. `currentFolder` is the folder of the file being
 * looked at; `subfolder` arrives already rendered.
 */
export function resolveNotePath(
	settings: PDFAnnotationPluginSetting,
	currentFolder: string,
	fileNameOfNote: string,
	subfolder = ""
): string {
	const folder =
		settings.noteLocation === "current"
			? cleanFolderPath(currentFolder)
			: [settings.noteFolder, subfolder]
					.map(cleanFolderPath)
					.filter((part) => part.length > 0)
					.join("/");

	return folder ? `${folder}/${fileNameOfNote}` : fileNameOfNote;
}

const HANDLEBARS_DOCS = "https://handlebarsjs.com/guide/expressions.html";

export class PDFAnnotationPluginSetting {
	public topicHeading: boolean;
	public dateHeading: boolean;
	public fileHeading: FileHeading;
	public groupByFolder: boolean;
	public groupByDate: boolean;
	public sortByTopic: boolean;
	public noteLocation: NoteLocation;
	/** Vault-relative folder the notes go in, empty for the vault root. */
	public noteFolder: string;
	/**
	 * Template for a folder under `noteFolder` to put the notes in. Empty to
	 * put them straight into it.
	 */
	public noteSubfolder: string;
	public noteName: string;
	public desiredAnnotations: string[];
	/** Written for every annotation type that has no template of its own. */
	public defaultTemplate: string;
	/**
	 * A template per annotation subtype, empty where the type has none of its
	 * own and is written with `defaultTemplate` instead.
	 */
	public annotationTemplates: Record<string, string>;
	public oneNotePerAnnotationName: string;
	/**
	 * Name a note per annotation after its topic instead of using
	 * `oneNotePerAnnotationName`, and leave the topic out of the note.
	 */
	public topicToNoteName: boolean;
	public overwriteExistingNote: boolean;
	public extractTags: TagExtraction;

	constructor() {
		this.topicHeading = true;
		this.dateHeading = true;
		this.fileHeading = "folder";
		this.groupByFolder = true;
		// Off, so an upgrade does not reorder notes nobody asked to reorder.
		this.groupByDate = false;
		this.sortByTopic = true;
		this.noteLocation = "vault";
		this.noteFolder = "";
		this.noteSubfolder = "";
		this.noteName = t.DEFAULT_NOTE_NAME;
		this.desiredAnnotations = [...DEFAULT_DESIRED_ANNOTATIONS];
		this.defaultTemplate = t.DEFAULT_NOTE_TEMPLATE;
		this.annotationTemplates = defaultAnnotationTemplates();
		this.oneNotePerAnnotationName =
			t.DEFAULT_ONE_NOTE_NAME;
		// Off, so the name template keeps naming the notes it named before.
		this.topicToNoteName = false;
		this.overwriteExistingNote = false;
		this.extractTags = "never";
	}

	/**
	 * `onePerAnnotation` tells the two kinds apart; inserting into the note
	 * being edited asks with false, being a single note like any other.
	 */
	public extractsTags(onePerAnnotation: boolean): boolean {
		switch (this.extractTags) {
			case "always":
				return true;
			case "single":
				return !onePerAnnotation;
			case "separate":
				return onePerAnnotation;
			default:
				return false;
		}
	}

	public isAnnotationDesired(annotationType: string): boolean {
		return this.desiredAnnotations.includes(annotationType);
	}

	public setAnnotationDesired(
		annotationType: string,
		desired: boolean
	): void {
		const selected = new Set(this.desiredAnnotations);
		if (desired) {
			selected.add(annotationType);
		} else {
			selected.delete(annotationType);
		}

		// Keep the order the types are listed in, then any subtype added to
		// data.json by hand that this version does not offer a checkbox for.
		const known = new Set(SUPPORTED_ANNOTS.map((a) => a.subtype));
		this.desiredAnnotations = [
			...SUPPORTED_ANNOTS.map((a) => a.subtype).filter((type) =>
				selected.has(type)
			),
			...[...selected].filter((type) => !known.has(type)),
		];
	}

	/**
	 * A heading this version knows. Anything else would silence the heading
	 * through the `none` branch by accident.
	 */
	public static normalizeFileHeading(value: unknown): FileHeading {
		return FILE_HEADINGS.includes(value as FileHeading)
			? (value as FileHeading)
			: "folder";
	}

	/** A location this version knows, for a data.json edited by hand. */
	public static normalizeNoteLocation(value: unknown): NoteLocation {
		return NOTE_LOCATIONS.includes(value as NoteLocation)
			? (value as NoteLocation)
			: "vault";
	}

	/** A mode this version knows, so the dropdown never shows nothing. */
	public static normalizeTagExtraction(value: unknown): TagExtraction {
		return typeof value === "string" && value in TAG_EXTRACTION_MODES
			? (value as TagExtraction)
			: "never";
	}

	/** Null for anything data.json holds that is not a list of subtypes. */
	public static normalizeDesiredAnnotations(value: unknown): string[] | null {
		if (!Array.isArray(value)) return null;

		const entries: unknown[] = value;
		const subtypes = entries.filter(
			(subtype): subtype is string => typeof subtype === "string"
		);
		return subtypes.length === entries.length ? subtypes : null;
	}

	/**
	 * One entry per supported type. A string is kept, blank included — that is
	 * a type handed back to the default — and anything else read as none.
	 */
	public static normalizeAnnotationTemplates(
		value: unknown
	): Record<string, string> {
		const held = (
			value && typeof value === "object" ? value : {}
		) as Record<string, unknown>;

		return Object.fromEntries(
			SUPPORTED_ANNOTS.map(({ subtype }) => [
				subtype,
				typeof held[subtype] === "string" ? held[subtype] : "",
			])
		);
	}
}

/**
 * Type-ahead over the vault's folders. Every folder is offered on an empty
 * query, so the field can be browsed as well as typed into.
 */
class FolderSuggest extends AbstractInputSuggest<string> {
	getSuggestions(query: string): string[] {
		const wanted = query.toLowerCase();
		return this.app.vault
			.getAllFolders(true)
			.map((folder) => folder.path)
			.filter((path) => path.toLowerCase().includes(wanted));
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}
}

export class PDFAnnotationPluginSettingTab extends PluginSettingTab {
	plugin: PDFAnnotationPlugin;

	constructor(app: App, plugin: PDFAnnotationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	addValueChangeCallback<T extends HTMLTextAreaElement | HTMLInputElement>(
		component: AbstractTextComponent<T> | DropdownComponent,
		settingsKey: string,
		cb?: (value: string) => void
	): void {
		component.onChange(async (value) => {
			asIndexable(this.plugin.settings)[settingsKey] = value;
			await this.plugin.saveSettings();
			if (cb) {
				cb(value);
			}
		});
	}

	buildValueInput<T extends HTMLTextAreaElement | HTMLInputElement>(
		component: AbstractTextComponent<T> | DropdownComponent,
		settingsKey: string,
		cb?: (value: string) => void
	): void {
		component.setValue(
			asIndexable(this.plugin.settings)[settingsKey] as string
		);
		this.addValueChangeCallback(component, settingsKey, cb);
	}

	/**
	 * A collapsible panel, closed to begin with; returns the element its
	 * contents go in. <details> has no transition of its own, so opening
	 * reveals the content to measure it and animates up to that height, and
	 * closing only marks the element closed once the animation has finished.
	 * A toggle mid-animation picks up from the height on screen.
	 */
	createAccordion(
		parent: HTMLElement,
		showText: string,
		hideText: string
	): HTMLElement {
		const details = parent.createEl("details", {
			cls: "pdf-annotations-accordion",
		});
		const summary = details.createEl("summary", {
			cls: "pdf-annotations-accordion-summary",
		});
		const chevron = summary.createSpan({
			cls: "pdf-annotations-accordion-chevron",
		});
		setIcon(chevron, "chevron-right");
		const label = summary.createSpan({ text: showText });
		const content = details.createDiv({
			cls: "pdf-annotations-accordion-content",
		});

		let animation: Animation | null = null;

		summary.addEventListener("click", (event) => {
			const opening = !details.open;
			chevron.toggleClass("is-open", opening);
			label.setText(opening ? hideText : showText);

			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
				return;
			}
			event.preventDefault();

			// Measured before cancelling, while it is still the height on
			// screen rather than the natural one.
			const interrupted = animation !== null;
			const onScreen = interrupted
				? content.getBoundingClientRect().height
				: 0;
			animation?.cancel();

			if (opening) details.open = true;
			const full = content.scrollHeight;
			const from = interrupted ? onScreen : opening ? 0 : full;
			const to = opening ? full : 0;

			animation = content.animate(
				{
					height: [`${from}px`, `${to}px`],
					opacity: opening ? [0, 1] : [1, 0],
				},
				{ duration: 180, easing: "ease-in-out" }
			);
			animation.onfinish = () => {
				animation = null;
				if (!opening) details.open = false;
			};
		});

		return content;
	}

	/**
	 * A numbered gutter beside a template's text area, redrawn as lines come and
	 * go and scrolled in step. Soft wrapping is off: a wrapped line is still one
	 * line, with no honest number for its second row.
	 *
	 * Returns the box the two share and the redraw — needed for text put in by
	 * anything other than typing, such as switching template, which fires no
	 * input event.
	 */
	addLineNumbers(textarea: HTMLTextAreaElement): {
		editorEl: HTMLElement | null;
		redraw: () => void;
	} {
		const parent = textarea.parentElement;
		if (!parent) return { editorEl: null, redraw: () => undefined };

		const editor = createDiv({ cls: "pdf-annotations-template-editor" });
		parent.insertBefore(editor, textarea);
		const gutter = editor.createDiv({
			cls: "pdf-annotations-template-gutter",
		});
		editor.appendChild(textarea);
		textarea.setAttr("wrap", "off");

		const drawLineNumbers = () => {
			const lines = textarea.value.split("\n").length;
			gutter.setText(
				Array.from({ length: lines }, (_, i) => i + 1).join("\n")
			);
		};

		textarea.addEventListener("input", drawLineNumbers);
		textarea.addEventListener("scroll", () => {
			gutter.scrollTop = textarea.scrollTop;
		});
		drawLineNumbers();

		return { editorEl: editor, redraw: drawLineNumbers };
	}

	/**
	 * Appends `text`, turning the first `linkText` into a link. Keeps the
	 * paragraph one translatable sentence rather than the fragments either side
	 * of an anchor.
	 */
	appendTextWithLink(
		parent: HTMLElement,
		text: string,
		linkText: string,
		href: string
	): void {
		const at = text.indexOf(linkText);
		if (at < 0) {
			parent.createSpan({ text });
			return;
		}
		parent.createSpan({ text: text.slice(0, at) });
		parent.createEl("a", { text: linkText, href });
		parent.createSpan({ text: text.slice(at + linkText.length) });
	}

	/**
	 * Makes `pill` copy a template variable, with the icon button that says so.
	 * The listener is on the pill so the whole of it is the target; the button
	 * is real, which is what makes the pill reachable by keyboard.
	 */
	addCopyAction(pill: HTMLElement, variable: string): void {
		const button = pill.createEl("button", {
			cls: ["clickable-icon", "pdf-annotations-copy-button"],
			attr: {
				type: "button",
				"aria-label": `${t.COPY_TOOLTIP}: ${variable}`,
			},
		});
		setIcon(button, "copy");
		setTooltip(pill, t.COPY_TOOLTIP);

		pill.addEventListener("click", () => {
			navigator.clipboard
				.writeText(variable)
				.then(() => {
					new Notice(`${t.NOTICE_COPIED}: ${variable}`);
					setIcon(button, "check");
					window.setTimeout(() => setIcon(button, "copy"), 1500);
				})
				.catch((error) => {
					new Notice(t.NOTICE_COPY_FAILED);
					console.error(error);
				});
		});
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const header = new Setting(containerEl)
			.setName(t.PLUGIN_NAME)
			.setDesc(t.PLUGIN_DESCRIPTION)
			.setHeading();
		header.settingEl.addClass("pdf-annotations-settings-header");

		// Name, description and checkboxes form one card, stacked: the grid
		// goes into the setting's control element, which styles.css widens to
		// the full row underneath the text.
		const annotationSetting = new Setting(containerEl)
			.setName(t.SETTING_ANNOTATIONS_NAME)
			.setHeading();
		annotationSetting.settingEl.addClass(
			"pdf-annotations-annotation-setting"
		);

		const annotationGrid = annotationSetting.controlEl.createDiv({
			cls: "pdf-annotations-annotation-grid",
		});
		SUPPORTED_ANNOTS.forEach(({ subtype, description }) => {
			const option = annotationGrid.createEl("label", {
				cls: "pdf-annotations-annotation-option",
			});
			const checkbox = option.createEl("input", { type: "checkbox" });
			checkbox.checked =
				this.plugin.settings.isAnnotationDesired(subtype);
			option.createSpan({ text: description });

			checkbox.addEventListener("change", () => {
				this.plugin.settings.setAnnotationDesired(
					subtype,
					checkbox.checked
				);
				this.plugin
					.saveSettings()
					.catch((error) => console.error(error));
			});
		});

		// The heading's description rather than a paragraph after it, so the
		// section reads as one block. Through descEl, since setDesc takes text
		// and this has a link in the middle.
		const templatesHeading = new Setting(containerEl)
			.setName(t.SECTION_TEMPLATES)
			.setHeading();
		templatesHeading.descEl.addClass("pdf-annotations-template-instructions");
		this.appendTextWithLink(
			templatesHeading.descEl,
			t.SECTION_TEMPLATES_DESC,
			t.HANDLEBARS_LINK,
			HANDLEBARS_DOCS
		);

		// Folded away by default: the table is a reference to look something up
		// in, not something to read past on the way to the templates.
		const variablesContent = this.createAccordion(
			containerEl,
			t.SHOW_VARIABLES_TABLE,
			t.HIDE_VARIABLES_TABLE
		);
		const templateVariableTable = variablesContent.createEl("table", {
			cls: "pdf-annotations-variable-table",
		});
		const templateVariableHead = templateVariableTable
			.createEl("thead")
			.createEl("tr");
		templateVariableHead.createEl("th", {
			text: t.TABLE_VARIABLE,
		});
		templateVariableHead.createEl("th", {
			text: t.TABLE_DESCRIPTION,
		});

		const templateVariableBody = templateVariableTable.createEl("tbody");
		Object.entries(TEMPLATE_VARIABLES).forEach((variableData) => {
			const [key, description] = variableData,
				templateVariableRow = templateVariableBody.createEl("tr"),
				nameCell = templateVariableRow.createEl("td", {
					cls: "pdf-annotations-variable-name",
				}),
				variable = "{{" + key + "}}";

			// The variable and its copy button share a pill, so hovering either
			// of them lights up the whole thing.
			const pill = nameCell.createSpan({
				cls: "pdf-annotations-variable",
			});
			pill.createSpan({ cls: "text-monospace", text: variable });
			this.addCopyAction(pill, variable);

			templateVariableRow.createEl("td", { text: description });
		});

		// One card whose picker says which template is being written. Editing
		// them one at a time keeps the card one template tall.
		const templateColumns = containerEl.createDiv({
			cls: "pdf-annotations-template-columns",
		});

		let editing = DEFAULT_TEMPLATE_KEY;
		let editor!: TextAreaComponent;
		let editorEl: HTMLElement | null = null;
		let redrawLineNumbers: () => void = () => undefined;

		const templateOf = (target: string) =>
			target === DEFAULT_TEMPLATE_KEY
				? this.plugin.settings.defaultTemplate
				: (this.plugin.settings.annotationTemplates[target] ?? "");

		// The default is the one template that is always written from, so it is
		// the one that says nothing when left empty; a type's own says what
		// happens to it instead.
		const showTemplate = (target: string) => {
			editor.setValue(templateOf(target));
			editor.setPlaceholder(
				target === DEFAULT_TEMPLATE_KEY
					? ""
					: t.PLACEHOLDER_TEMPLATE_DEFAULT
			);
			redrawLineNumbers();
		};

		const card = new Setting(templateColumns)
			.setName(t.SETTING_TEMPLATE_NAME)
			.setDesc(t.SETTING_TEMPLATE_DESC)
			.addDropdown((dropdown) => {
				dropdown.addOption(
					DEFAULT_TEMPLATE_KEY,
					t.OPTION_TEMPLATE_DEFAULT
				);
				for (const { subtype, description } of SUPPORTED_ANNOTS) {
					dropdown.addOption(subtype, description);
				}
				dropdown.setValue(editing);
				dropdown.onChange((value) => {
					editing = value;
					showTemplate(editing);
				});
				dropdown.selectEl.addClass("pdf-annotations-template-picker");
			})
			.addTextArea((input) => {
				editor = input;
				input.inputEl.addClass("pdf-annotations-template-input");
				const numbered = this.addLineNumbers(input.inputEl);
				redrawLineNumbers = numbered.redraw;
				// Out of the control the picker sits in and into the card
				// itself, so the picker can sit beside the description while
				// the editor keeps the whole width under both.
				if (numbered.editorEl) editorEl = numbered.editorEl;
				input.onChange(async (value) => {
					if (editing === DEFAULT_TEMPLATE_KEY) {
						this.plugin.settings.defaultTemplate = value;
					} else {
						this.plugin.settings.annotationTemplates[editing] =
							value;
					}
					await this.plugin.saveSettings();
				});
				showTemplate(editing);
			});
		card.settingEl.addClass("pdf-annotations-template-setting");
		// Last child of the card, not of the picker's control: text and picker
		// share a row with the editor across the width beneath them.
		if (editorEl) card.settingEl.appendChild(editorEl);

		// Two groups, in the order they take effect: where an annotation lands,
		// then what is written above it.
		// The topic heading has nothing to head until a topic is split off, so
		// it follows the setting that splits it — greyed out but still in view,
		// and remembering the choice it was switched off from.
		// Assigned as the settings below are built, before anything can call it.
		let topicHeadingToggle!: ToggleComponent;
		let dateHeadingToggle!: ToggleComponent;
		let syncingHeadings = false;
		const syncHeading = (
			toggle: ToggleComponent,
			enabled: boolean,
			remembered: boolean
		) => {
			// setValue calls onChange, which would take this for an edit and
			// write the remembered choice away.
			syncingHeadings = true;
			toggle.setValue(enabled && remembered);
			toggle.setDisabled(!enabled);
			syncingHeadings = false;
		};
		const syncTopicHeading = () =>
			syncHeading(
				topicHeadingToggle,
				this.plugin.settings.sortByTopic,
				this.plugin.settings.topicHeading
			);
		const syncDateHeading = () =>
			syncHeading(
				dateHeadingToggle,
				this.plugin.settings.groupByDate,
				this.plugin.settings.dateHeading
			);

		new Setting(containerEl)
			.setName(t.SECTION_GROUPING)
			.setHeading();
		new Setting(containerEl)
			.setName(t.SETTING_SORT_BY_TOPIC_NAME)
			.setDesc(t.SETTING_SORT_BY_TOPIC_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sortByTopic)
					.onChange(async (value) => {
						this.plugin.settings.sortByTopic = value;
						syncTopicHeading();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SETTING_GROUP_BY_DATE_NAME)
			.setDesc(t.SETTING_GROUP_BY_DATE_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupByDate)
					.onChange(async (value) => {
						this.plugin.settings.groupByDate = value;
						syncDateHeading();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SETTING_GROUP_BY_FOLDER_NAME)
			.setDesc(t.SETTING_GROUP_BY_FOLDER_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupByFolder)
					.onChange(async (value) => {
						this.plugin.settings.groupByFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SECTION_HEADINGS)
			.setHeading();
		new Setting(containerEl)
			.setName(t.SETTING_DATE_HEADING_NAME)
			.setDesc(t.SETTING_DATE_HEADING_DESC)
			.addToggle((toggle) => {
				dateHeadingToggle = toggle;
				toggle
					.setValue(this.plugin.settings.dateHeading)
					.onChange(async (value) => {
						if (syncingHeadings) return;
						this.plugin.settings.dateHeading = value;
						await this.plugin.saveSettings();
					});
			});
		syncDateHeading();

		new Setting(containerEl)
			.setName(t.SETTING_TOPIC_HEADING_NAME)
			.setDesc(t.SETTING_TOPIC_HEADING_DESC)
			.addToggle((toggle) => {
				topicHeadingToggle = toggle;
				toggle
					.setValue(this.plugin.settings.topicHeading)
					.onChange(async (value) => {
						if (syncingHeadings) return;
						this.plugin.settings.topicHeading = value;
						await this.plugin.saveSettings();
					});
			});
		syncTopicHeading();

		new Setting(containerEl)
			.setName(t.SETTING_FILE_HEADING_NAME)
			.setDesc(t.SETTING_FILE_HEADING_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						folder: t.OPTION_FILE_HEADING_FOLDER,
						file: t.OPTION_FILE_HEADING_FILE,
						none: t.OPTION_FILE_HEADING_NONE,
					})
					.setValue(this.plugin.settings.fileHeading)
					.onChange(async (value) => {
						this.plugin.settings.fileHeading = value as FileHeading;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SECTION_NOTES)
			.setHeading();
		// A note beside its PDF has no vault folder to go in and no subfolder
		// under it, so both fields open and close from the one panel.
		let showNoteTarget!: (shown: boolean, animate: boolean) => void;
		const syncNoteTarget = (animate: boolean) => {
			showNoteTarget(
				this.plugin.settings.noteLocation === "vault",
				animate
			);
		};

		new Setting(containerEl)
			.setName(t.SETTING_NOTE_LOCATION_NAME)
			.setDesc(t.SETTING_NOTE_LOCATION_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						current: t.OPTION_NOTE_LOCATION_CURRENT,
						vault: t.OPTION_NOTE_LOCATION_VAULT,
					})
					.setValue(this.plugin.settings.noteLocation)
					.onChange(async (value) => {
						this.plugin.settings.noteLocation =
							value as NoteLocation;
						syncNoteTarget(true);
						await this.plugin.saveSettings();
					})
			);

		const noteTargetPanel = containerEl.createDiv({
			cls: "pdf-annotations-collapsible",
		});
		showNoteTarget = createCollapsible(noteTargetPanel);
		const noteFolderSetting = new Setting(noteTargetPanel)
			.setName(t.SETTING_NOTE_FOLDER_NAME)
			.setDesc(t.SETTING_NOTE_FOLDER_DESC)
			.addText((input) => {
				input.setPlaceholder(t.PLACEHOLDER_VAULT_ROOT);
				this.buildValueInput(input, "noteFolder");
				const suggest = new FolderSuggest(this.app, input.inputEl);
				suggest.onSelect(async (folder) => {
					input.setValue(folder);
					this.plugin.settings.noteFolder = folder;
					await this.plugin.saveSettings();
					// Registering a callback takes the selection over, closing
					// the popover included: left to itself it stays open over
					// the field it has just answered.
					suggest.close();
				});
			});
		noteFolderSetting.settingEl.addClass("pdf-annotations-stacked-setting");
		const noteSubfolderSetting = new Setting(noteTargetPanel)
			.setName(t.SETTING_NOTE_SUBFOLDER_NAME)
			.setDesc(t.SETTING_NOTE_SUBFOLDER_DESC)
			.addText((input) => {
				input.setPlaceholder(t.PLACEHOLDER_NO_SUBFOLDER);
				this.buildValueInput(input, "noteSubfolder");
			});
		noteSubfolderSetting.settingEl.addClass(
			"pdf-annotations-stacked-setting"
		);
		syncNoteTarget(false);

		// The switch above the field it governs: once the topic names the
		// notes, the name template has nothing left to name.
		let showOneNoteName!: (shown: boolean, animate: boolean) => void;
		const syncOneNoteName = (animate: boolean) => {
			showOneNoteName(!this.plugin.settings.topicToNoteName, animate);
		};

		new Setting(containerEl)
			.setName(t.SETTING_TOPIC_TO_NAME_NAME)
			.setDesc(t.SETTING_TOPIC_TO_NAME_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.topicToNoteName)
					.onChange(async (value) => {
						this.plugin.settings.topicToNoteName = value;
						syncOneNoteName(true);
						await this.plugin.saveSettings();
					})
			);

		const oneNoteNamePanel = containerEl.createDiv({
			cls: "pdf-annotations-collapsible",
		});
		showOneNoteName = createCollapsible(oneNoteNamePanel);
		const oneNoteNameSetting = new Setting(oneNoteNamePanel)
			.setName(t.SETTING_ONE_NOTE_NAME_NAME)
			.setDesc(t.SETTING_ONE_NOTE_NAME_DESC)
			.addText((input) =>
				this.buildValueInput(input, "oneNotePerAnnotationName")
			);
		oneNoteNameSetting.settingEl.addClass(
			"pdf-annotations-stacked-setting"
		);
		syncOneNoteName(false);

		new Setting(containerEl)
			.setName(t.SETTING_EXTRACT_TAGS_NAME)
			.setDesc(t.SETTING_EXTRACT_TAGS_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions(TAG_EXTRACTION_MODES)
					.setValue(this.plugin.settings.extractTags)
					.onChange(async (value) => {
						this.plugin.settings.extractTags =
							value as TagExtraction;
						await this.plugin.saveSettings();
					})
			);
		const noteNameSetting = new Setting(containerEl)
			.setName(t.SETTING_NOTE_NAME_NAME)
			.setDesc(t.SETTING_NOTE_NAME_DESC)
			.addText((input) => this.buildValueInput(input, "noteName"));
		noteNameSetting.settingEl.addClass("pdf-annotations-stacked-setting");
		new Setting(containerEl)
			.setName(t.SETTING_OVERWRITE_NAME)
			.setDesc(t.SETTING_OVERWRITE_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.overwriteExistingNote)
					.onChange(async (value) => {
						this.plugin.settings.overwriteExistingNote = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
