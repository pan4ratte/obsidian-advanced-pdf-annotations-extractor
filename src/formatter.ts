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
		let currentLabel = "";

		// A new topic starts the file headings over, so a topic reading from
		// several files says which one each of its annotations came from. When
		// they all came from the same place that heading has nothing left to
		// tell apart, and repeating it under every topic — one per annotation,
		// where the topics are the annotations' own first lines — buries the
		// note in a heading that always says the same thing.
		const labelFor = (anno: PDFAnnotation) => {
			if (this.settings.fileHeading === "file") return anno.file.name;
			// A PDF sitting in the vault root has no folder to name.
			return anno.folder || t.NOTE_VAULT_ROOT;
		};
		const labelVaries = new Set(grandtotal.map(labelFor)).size > 1;

		// Nothing to head a topic with unless the topic was split off the body
		// in the first place.
		const headingTopics =
			this.settings.topicHeading && this.settings.sortByTopic;

		// So one unchanging label heads the note rather than marking a place
		// inside it: written once, above the topics rather than under the first
		// of them.
		const headsTheNote =
			!labelVaries && this.settings.fileHeading !== "none";

		// Whichever heading encloses the other is the first level, so the note
		// reads as an outline either way round: topics within the one file the
		// annotations came from, or files within each topic when they came from
		// several.
		const topicLevel = headsTheNote ? "##" : "#";
		const fileLevel = headingTopics && !headsTheNote ? "##" : "#";

		if (headsTheNote && grandtotal.length > 0) {
			currentLabel = labelFor(grandtotal[0]);
			text += `${fileLevel} ${currentLabel}\n\n`;
		}

		// console.log("all annots", grandtotal)
		grandtotal.forEach((anno) => {
			// print main Title when Topic changes (and settings allow)
			if (headingTopics) {
				if (topic != anno.topic) {
					topic = anno.topic;
					if (labelVaries) currentLabel = "";
					text += `${topicLevel} ${topic}\n\n`;
				}
			}

			if (this.settings.fileHeading !== "none") {
				const label = labelFor(anno);
				if (currentLabel != label) {
					currentLabel = label;
					text += `${fileLevel} ${label}\n\n`;
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
