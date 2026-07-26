import {
	AbstractTextComponent,
	App,
	DropdownComponent,
	PluginSettingTab,
	Setting,
} from "obsidian";
import PDFAnnotationPlugin from "src/main";
import { asIndexable } from "src/types";

// The whole annotation is available as {{annotation}} too, for fields that have
// no shortcut of their own.
export const TEMPLATE_VARIABLES = {
	highlightedText: "Highlighted text from PDF",
	folder: "Folder of PDF file",
	filename: "File name of the PDF, without the extension",
	filepath: "Path of PDF file",
	pageNumber: "Page number of annotation with reference to PDF pages",
	pageLabel: "Page label (page number defined by author) of annotation with reference to PDF pages",
	author: "Author of annotation",
	body: "Body of annotation",
	topic: "First line of the body, when sorting by topic is enabled",
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

export class PDFAnnotationPluginSetting {
	public useStructuringHeadlines: boolean;
	public useFolderNames: boolean;
	public sortByTopic: boolean;
	public exportPath: string;
	public exportName: string;
	public desiredAnnotations: string[];
	public noteTemplateExternalPDFs: string;
	public noteTemplateInternalPDFs: string;
	public highlightTemplateExternalPDFs: string;
	public highlightTemplateInternalPDFs: string;
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
		this.noteTemplateExternalPDFs =
			"{{body}}\n" +
			"\n" +
			"* *noted by {{author}} at page {{pageNumber}} on {{filepath}}*\n" +
			"\n";
		this.noteTemplateInternalPDFs =
			"{{body}}\n" +
			"\n" +
			"* *noted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n" +
			"\n";
		this.highlightTemplateExternalPDFs =
			"> {{highlightedText}}\n" +
			"\n" +
			"{{body}}\n" +
			"\n" +
			"* *highlighted by {{author}} at page {{pageNumber}} on {{filepath}}*\n" +
			"\n";
		this.highlightTemplateInternalPDFs =
			"> {{highlightedText}}\n" +
			"\n" +
			"{{body}}\n" +
			"\n" +
			"* *highlighted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n" +
			"\n";
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
				"Choose whichannotation types that will be extracted. Highlight, Underline, Squiggly and Strikeout also capture the PDF text underneath them, others contribute their own comment only."
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
					"the plugin will be rendered. There are four types that you can specify, " +
					"because you might want to have other templates for highlights and notes " +
					"which include links to external files. Templates are interpreted using ",
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

		const templateVariableUl = containerEl.createEl("ul");
		Object.entries(TEMPLATE_VARIABLES).forEach((variableData) => {
			const [key, description] = variableData,
				templateVariableItem = templateVariableUl.createEl("li");

			templateVariableItem.createSpan({
				cls: "text-monospace",
				text: "{{" + key + "}}",
			});

			templateVariableItem.createSpan({
				text: description ? ` — ${description}` : "",
			});
		});

		new Setting(containerEl)
			.setName("Template for notes of PDFs outside Obsidian:")
			.addTextArea((input) => {
				input.inputEl.addClass("pdf-annotations-template-input");
				this.buildValueInput(input, "noteTemplateExternalPDFs");
			});
		new Setting(containerEl)
			.setName("Template for notes of PDFs inside Obsidian:")
			.addTextArea((input) => {
				input.inputEl.addClass("pdf-annotations-template-input");
				this.buildValueInput(input, "noteTemplateInternalPDFs");
			});
		new Setting(containerEl)
			.setName("Template for highlights of PDFs outside Obsidian:")
			.addTextArea((input) => {
				input.inputEl.addClass("pdf-annotations-template-input");
				this.buildValueInput(input, "highlightTemplateExternalPDFs");
			});
		new Setting(containerEl)
			.setName("Template for highlights of PDFs inside Obsidian:")
			.addTextArea((input) => {
				input.inputEl.addClass("pdf-annotations-template-input");
				this.buildValueInput(input, "highlightTemplateInternalPDFs");
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
