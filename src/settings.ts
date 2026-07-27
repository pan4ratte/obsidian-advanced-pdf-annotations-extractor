import {
	AbstractTextComponent,
	App,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	setIcon,
	Setting,
	setTooltip,
} from "obsidian";
import PDFAnnotationPlugin from "src/main";
import { asIndexable } from "src/types";

// The whole annotation is available as {{annotation}} too, for fields that have
// no shortcut of their own.
export const TEMPLATE_VARIABLES = {
	highlightedText: "Highlighted text from PDF",
	folder: "Folder of the PDF file",
	filename: "File name of the PDF (without the extension)",
	filepath: "Path to the PDF file",
	filelink: "A [[wikilink]] for PDFs in the vault and a file:// path for PDFs outside",
	pageNumber: "Page number of annotation (relative to number of physical pages)",
	pageLabel: "Page label of annotation (relative to number of defined page indexes)",
	author: "Author of the annotation",
	body: "Body of the annotation",
	topic: "First line of the body, when sorting by topic is enabled",
	isExternal: "True for PDFs outside the vault, for {{#if isExternal}} in a template",
};

export interface SupportedAnnotation {
	/** PDF annotation subtype, as reported by pdf.js. */
	subtype: string;
	description: string;
	/**
	 * True for the text markup annotations, which carry QuadPoints: the PDF text
	 * underneath them is extracted into {{highlightedText}} and they are rendered
	 * with the highlight templates. The rest only contribute their own comment
	 * and are rendered with the note templates.
	 */
	marksUpText?: boolean;
	/** Part of the default selection. */
	desiredByDefault?: boolean;
}

// The annotation types that carry text an exported note can actually show:
// either the PDF text they mark up, or text the reader typed themselves.
//
// Deliberately absent are the graphical markup types — Ink, Square, Circle,
// Line, Polygon, PolyLine, Stamp, Caret and FileAttachment. Their content is a
// drawing, a stamp or an attached file, none of which survives a conversion to
// markdown, and their Contents entry is empty unless a comment happens to be
// attached. Extracting them yields mostly blank entries. Link, Widget and Popup
// are absent too: they are not annotations the reader made.
export const SUPPORTED_ANNOTS: SupportedAnnotation[] = [
	{
		subtype: "Highlight",
		description: "Highlighted text",
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Underline",
		description: "Underlined text",
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Squiggly",
		description: "Squiggly underlined text",
		marksUpText: true,
	},
	{
		subtype: "StrikeOut",
		description: "Struck out text",
		marksUpText: true,
	},
	{
		subtype: "Text",
		description: "Sticky note comment",
		desiredByDefault: true,
	},
	{ subtype: "FreeText", description: "Free text on the page" },
];

export const ANNOTS_TREATED_AS_HIGHLIGHTS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.marksUpText
).map((annotation) => annotation.subtype);

export const DEFAULT_DESIRED_ANNOTATIONS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.desiredByDefault
).map((annotation) => annotation.subtype);

/**
 * Until {{filelink}} existed, each kind of annotation had two templates that
 * differed only in how they linked the PDF: a wiki link for the vault, a plain
 * path for everything else. `migrateTemplates` folds a data.json written by
 * those versions into the single template per kind.
 */
const LEGACY_TEMPLATE_PAIRS = [
	{
		field: "noteTemplate",
		internalKey: "noteTemplateInternalPDFs",
		externalKey: "noteTemplateExternalPDFs",
		label: "notes",
		internalDefault:
			"{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n\n",
		externalDefault:
			"{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on {{filepath}}*\n\n",
	},
	{
		field: "highlightTemplate",
		internalKey: "highlightTemplateInternalPDFs",
		externalKey: "highlightTemplateExternalPDFs",
		label: "highlights",
		internalDefault:
			"> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n\n",
		externalDefault:
			"> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on {{filepath}}*\n\n",
	},
] as const;

/** `[[{{filepath}}]]` as the internal templates wrote it, spacing included. */
const FILEPATH_WIKILINK = /\[\[\s*\{\{\s*filepath\s*\}\}\s*\]\]/g;
const FILEPATH_PLAIN = /\{\{\s*filepath\s*\}\}/g;

export interface TemplateMigration {
	/** True when data.json still held the pre-{{filelink}} template fields. */
	migrated: boolean;
	/**
	 * Kinds whose external template said something its internal counterpart did
	 * not, so folding the pair would have thrown an edit away. Stashed in
	 * `legacyExternalTemplates` instead.
	 */
	dropped: string[];
}

export class PDFAnnotationPluginSetting {
	public useStructuringHeadlines: boolean;
	public useFolderNames: boolean;
	public sortByTopic: boolean;
	public exportPath: string;
	public exportName: string;
	public desiredAnnotations: string[];
	public noteTemplate: string;
	public highlightTemplate: string;
	/**
	 * Templates for PDFs outside the vault that `migrateTemplates` could not
	 * fold in, keyed by the setting they came from. Nothing reads them; they are
	 * kept so an edit made before the collapse can still be copied back by hand.
	 */
	public legacyExternalTemplates: Record<string, string>;
	public oneNotePerAnnotation: boolean;
	public oneNotePerAnnotationExportName: string;
	public overwriteExistingNote: boolean;
	public extractTagsFromAnnotationsAsObsidianTags: boolean;
	public exportClipboardExtraction: boolean;

	constructor() {
		this.useStructuringHeadlines = true;
		this.useFolderNames = true;
		this.sortByTopic = true;
		this.exportPath = "";
		this.exportName = "Annotations for {{filename}}";
		this.desiredAnnotations = [...DEFAULT_DESIRED_ANNOTATIONS];
		this.noteTemplate =
			"{{body}}\n" +
			"\n" +
			"* *noted by {{author}} at page {{pageNumber}} on {{filelink}}*\n" +
			"\n";
		this.highlightTemplate =
			"> {{highlightedText}}\n" +
			"\n" +
			"{{body}}\n" +
			"\n" +
			"* *highlighted by {{author}} at page {{pageNumber}} on {{filelink}}*\n" +
			"\n";
		this.legacyExternalTemplates = {};
		this.oneNotePerAnnotation = false;
		this.oneNotePerAnnotationExportName = "Annotations for {{filename}}-{{counter}}";
		this.overwriteExistingNote = false;
		this.extractTagsFromAnnotationsAsObsidianTags = false;
		this.exportClipboardExtraction = false;
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
	 * Fold the four templates older versions stored into the two this version
	 * has. The internal template wins, because a vault is where most PDFs are
	 * read; its `[[{{filepath}}]]` becomes `{{filelink}}`, which renders the
	 * same way. An external template that was customised on its own is adopted
	 * instead, and one that disagrees with a customised internal template is
	 * stashed rather than discarded.
	 *
	 * `loaded` is the raw data.json, since the fields being read no longer exist
	 * on this class. Templates already collapsed are left alone.
	 */
	public static migrateTemplates(
		loaded: Record<string, unknown>,
		settings: PDFAnnotationPluginSetting
	): TemplateMigration {
		const migration: TemplateMigration = { migrated: false, dropped: [] };

		for (const pair of LEGACY_TEMPLATE_PAIRS) {
			if (typeof loaded[pair.field] === "string") continue;

			const internal = loaded[pair.internalKey];
			const external = loaded[pair.externalKey];
			if (typeof internal !== "string" && typeof external !== "string") {
				continue;
			}
			migration.migrated = true;

			const customInternal =
				typeof internal === "string" && internal !== pair.internalDefault
					? internal.replace(FILEPATH_WIKILINK, "{{filelink}}")
					: null;
			const customExternal =
				typeof external === "string" && external !== pair.externalDefault
					? external.replace(FILEPATH_PLAIN, "{{filelink}}")
					: null;

			const collapsed = customInternal ?? customExternal;
			if (collapsed) {
				asIndexable(settings)[pair.field] = collapsed;
			}

			// Both were edited, and not into the same thing: the difference is
			// more than the link, so it is not ours to throw away.
			if (customInternal && customExternal && customExternal !== collapsed) {
				settings.legacyExternalTemplates[pair.externalKey] =
					external as string;
				migration.dropped.push(pair.label);
			}
		}

		return migration;
	}

	/**
	 * data.json is written by users and by older versions of this plugin, which
	 * stored the selection as a comma separated string. Accept both, and drop
	 * anything that is not a list of subtypes.
	 */
	public static normalizeDesiredAnnotations(value: unknown): string[] | null {
		if (typeof value === "string") {
			return value
				.split(",")
				.map((subtype) => subtype.trim())
				.filter((subtype) => subtype.length > 0);
		}
		if (Array.isArray(value)) {
			const entries: unknown[] = value;
			const subtypes = entries.filter(
				(subtype): subtype is string => typeof subtype === "string"
			);
			return subtypes.length === entries.length ? subtypes : null;
		}
		return null;
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
	 * Make `pill` copy one template variable to the clipboard when clicked, and
	 * give it the icon button that says so. The listener sits on the pill rather
	 * than the button, so the whole pill is the target — and a click on the icon
	 * bubbles up to that same listener instead of copying twice. The button is
	 * still a real one, which is what makes the pill reachable by keyboard.
	 */
	addCopyAction(pill: HTMLElement, variable: string): void {
		const button = pill.createEl("button", {
			cls: ["clickable-icon", "pdf-annotations-copy-button"],
			attr: { type: "button", "aria-label": `Copy ${variable}` },
		});
		setIcon(button, "copy");
		setTooltip(pill, "Copy to clipboard");

		pill.addEventListener("click", () => {
			navigator.clipboard
				.writeText(variable)
				.then(() => {
					new Notice(`Copied ${variable} to the clipboard.`);
					setIcon(button, "check");
					window.setTimeout(() => setIcon(button, "copy"), 1500);
				})
				.catch((error) => {
					new Notice("Could not copy to the clipboard.");
					console.error(error);
				});
		});
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const header = new Setting(containerEl)
			.setName(this.plugin.manifest.name)
			.setDesc(this.plugin.manifest.description)
			.setHeading();
		header.settingEl.addClass("pdf-annotations-settings-header");

		// Name, description and checkboxes form one card, stacked: the grid
		// goes into the setting's control element, which styles.css widens to
		// the full row underneath the text.
		const annotationSetting = new Setting(containerEl)
			.setName("Annotations to extract")
			.setDesc(
				"Choose, which annotation types will be extracted. Highlight, underline, squiggly and strikeout also capture the PDF text underneath them — others contribute their own comment only."
			)
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

		new Setting(containerEl).setName("Templates").setHeading();
		const templateInstructionsEl = containerEl.createEl("p");
		templateInstructionsEl.append(
			createSpan({
				text:
					"The following settings determine how the highlights and notes created by " +
					"the plugin will be rendered. There are two, because annotations that " +
					"mark up PDF text carry the text they mark up and the others do not. " +
					"Both are used for PDFs inside and outside the vault alike: " +
					"{{filelink}} links the PDF the way its location calls for. " +
					"Templates are interpreted using ",
			})
		);
		templateInstructionsEl.append(
			createEl("a", {
				text: "Handlebars",
				href: "https://handlebarsjs.com/guide/expressions.html",
			})
		);
		templateInstructionsEl.append(
			createSpan({
				text: " syntax. The following variables are available:",
			})
		);

		const templateVariableTable = containerEl.createEl("table", {
			cls: "pdf-annotations-variable-table",
		});
		const templateVariableHead = templateVariableTable
			.createEl("thead")
			.createEl("tr");
		templateVariableHead.createEl("th", { text: "Variable" });
		templateVariableHead.createEl("th", { text: "Description" });

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

		new Setting(containerEl)
			.setName("Template for highlights")
			.setDesc(
				"Used for the annotation types that mark up PDF text, so {{highlightedText}} holds what they mark up."
			)
			.addTextArea((input) => {
				input.inputEl.addClass("pdf-annotations-template-input");
				this.buildValueInput(input, "highlightTemplate");
			});
		new Setting(containerEl)
			.setName("Template for notes")
			.setDesc(
				"Used for the annotation types that only carry a comment, so {{highlightedText}} is empty."
			)
			.addTextArea((input) => {
				input.inputEl.addClass("pdf-annotations-template-input");
				this.buildValueInput(input, "noteTemplate");
			});

		new Setting(containerEl).setName("Structure").setHeading();
		new Setting(containerEl)
			.setName("Use structuring headlines")
			.setDesc(
				"If disabled, no structuring headlines will be shown. Just the annotations in the specified template style."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useStructuringHeadlines)
					.onChange(async (value) => {
						this.plugin.settings.useStructuringHeadlines = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Use folder name")
			.setDesc(
				"If enabled, uses the PDF's folder name (instead of the PDF-filename) for sorting"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.useFolderNames)
					.onChange(async (value) => {
						this.plugin.settings.useFolderNames = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Sort by topic")
			.setDesc(
				"If enabled, uses the notes first line as topic for primary sorting"
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sortByTopic)
					.onChange(async (value) => {
						this.plugin.settings.sortByTopic = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl).setName("Note export").setHeading();
		new Setting(containerEl)
			.setName("Notes export path")
			.setDesc(
				"The path to which the notes, including the extracted annotations, will be exported. The path can be dynamic './' to create a note next to the PDF or it has to be relative to the vault root. Paths must end with a '/'. Leave blank to export to the vault root."
			)
			.addText((input) => this.buildValueInput(input, "exportPath"));
		new Setting(containerEl)
			.setName("Notes export name")
			.setDesc(
				"The name of the note to which the notes, including the extracted annotations, will be exported. You can use the variable '{{filename}}' to use the PDF's filename and combine it with prefix or suffix. If you don't use the variable all notes will be exported to the same file until you change the name."
			)
			.addText((input) => this.buildValueInput(input, "exportName"));
		new Setting(containerEl)
			.setName("One note per annotation")
			.setDesc(
				"If enabled, every annotation is exported to a separate note."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.oneNotePerAnnotation)
					.onChange(async (value) => {
						this.plugin.settings.oneNotePerAnnotation = value;
						oneNotePerAnnotationExportName.settingEl.toggleVisibility(value);
						await this.plugin.saveSettings();
					})
			);
		const oneNotePerAnnotationExportName = new Setting(containerEl)
			.setName("One note per annotation - export name")
			.setDesc(
				"The name of the notes to which each extracted annotation will be exported. You can use the variable '{{filename}}' to use the PDF's filename and combine it with prefix or suffix. Additionally you should use the variable '{{counter}}' to add the index of the exported annotation."
			)
			.addText((input) => this.buildValueInput(input, "oneNotePerAnnotationExportName"));
		oneNotePerAnnotationExportName.settingEl.toggleVisibility(
			this.plugin.settings.oneNotePerAnnotation
		);
		new Setting(containerEl)
			.setName("Overwrite existing note")
			.setDesc(
				"If enabled, the plugin will overwrite the content of an existing note with the same name."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.overwriteExistingNote)
					.onChange(async (value) => {
						this.plugin.settings.overwriteExistingNote = value;
						await this.plugin.saveSettings();
					})
			);
			new Setting(containerEl)
			.setName("Extract tags in annotations as Obsidian tags")
			.setDesc(
				"If enabled, the plugin will extract tags from the annotations and add them as Obsidian tags to the note's header."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.extractTagsFromAnnotationsAsObsidianTags)
					.onChange(async (value) => {
						this.plugin.settings.extractTagsFromAnnotationsAsObsidianTags = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("Export annotations from clipboard path to file")
			.setDesc(
				"When enabled, the clipboard path command saves annotations to a file using the export settings above, instead of inserting them into the note you are editing."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.exportClipboardExtraction)
					.onChange(async (value) => {
						this.plugin.settings.exportClipboardExtraction = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
