import {
	compile as compileTemplate,
	TemplateDelegate as Template,
} from "handlebars";
import { t } from "../lang/helpers";
import {
	ANNOTS_TREATED_AS_HIGHLIGHTS,
	PDFAnnotationPluginSetting,
} from "./settings";
import { PDFAnnotation } from "./types";

export class PDFAnnotationPluginFormatter {
	private settings: PDFAnnotationPluginSetting;

	// Template compilation options
	private templateSettings = {
		noEscape: true,
	};

	constructor(settings: PDFAnnotationPluginSetting) {
		this.settings = settings;
	}

	format(grandtotal: PDFAnnotation[], isExternalFile: boolean): string {
		// now iterate over the annotations printing topics, then folder, then comments...
		let text = "";
		let topic = "";
		let currentFolder = "";
		// console.log("all annots", grandtotal)
		grandtotal.forEach((anno) => {
			// print main Title when Topic changes (and settings allow)
			if (this.settings.useStructuringHeadlines) {
				if (this.settings.sortByTopic) {
					if (topic != anno.topic) {
						topic = anno.topic;
						currentFolder = "";
						text += `# ${topic}\n`;
					}
				}

				if (this.settings.useFolderNames) {
					if (currentFolder != anno.folder) {
						currentFolder = anno.folder;
						text += `## ${currentFolder}\n`;
					}
				} else {
					if (currentFolder != anno.file.name) {
						currentFolder = anno.file.name;
						text += `## ${currentFolder}\n`;
					}
				}
			}

			if (ANNOTS_TREATED_AS_HIGHLIGHTS.includes(anno.subtype)) {
				text += this.getContentForHighlight(anno, isExternalFile);
			} else {
				text += this.getContentForNote(anno, isExternalFile);
			}
		});

		if (grandtotal.length == 0) return t.NOTE_NO_ANNOTATIONS;
		else return text;
	}

	get noteTemplate(): Template {
		return compileTemplate(
			this.settings.noteTemplate,
			this.templateSettings
		);
	}

	get highlightTemplate(): Template {
		return compileTemplate(
			this.settings.highlightTemplate,
			this.templateSettings
		);
	}

	getTemplateVariablesForAnnotation(
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): Record<string, unknown> {
		const shortcuts = {
			highlightedText: annotation.highlightedText,
			folder: annotation.folder,
			filename: annotation.file.basename,
			filepath: annotation.filepath,
			// One template serves both locations: a PDF in the vault is worth a
			// wiki link, one outside it is already a file:// URL.
			filelink: isExternalFile
				? annotation.filepath
				: `[[${annotation.filepath}]]`,
			isExternal: isExternalFile,
			pageNumber: annotation.pageNumber,
			pageLabel: annotation.pageLabel,
			author: annotation.author,
			body: annotation.body,
			topic: annotation.topic,
		};

		return { annotation: annotation, ...shortcuts };
	}

	getContentForNote(
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): string {
		return this.noteTemplate(
			this.getTemplateVariablesForAnnotation(annotation, isExternalFile)
		);
	}

	getContentForHighlight(
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): string {
		return this.highlightTemplate(
			this.getTemplateVariablesForAnnotation(annotation, isExternalFile)
		);
	}
}
