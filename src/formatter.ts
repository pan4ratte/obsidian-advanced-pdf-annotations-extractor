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

/**
 * The `#` prefix for each heading in a note, given which of them are written,
 * outermost first. A heading that is not written takes no level with it, so the
 * ones under it move up and the note still reads as an outline with no gap in
 * its levels.
 */
export function headingLevels(written: boolean[]): string[] {
	let depth = 0;
	return written.map((isWritten) =>
		isWritten ? "#".repeat(++depth) : ""
	);
}

export class PDFAnnotationPluginFormatter {
	private settings: PDFAnnotationPluginSetting;

	// Template compilation options
	private templateSettings = {
		noEscape: true,
	};

	constructor(settings: PDFAnnotationPluginSetting) {
		this.settings = settings;
	}

	/**
	 * `onePerNote` says the note being written holds this one annotation and
	 * nothing else, as the 'note per annotation' commands write them. The
	 * headings that group have nothing to group there — a day, a folder and a
	 * file heading over a single annotation say what the note is, one line at a
	 * time, before it has said anything itself — so they are left out. The topic
	 * heading is not: a topic is what the annotation is about rather than where
	 * it came from, and it has a setting of its own for going into the name.
	 */
	format(
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean,
		onePerNote = false
	): string {
		// now iterate over the annotations printing topics, then folder, then comments...
		let text = "";
		let topic = "";
		let currentLabel = "";

		let date = "";

		// A new group starts the headings under it over, so a topic reading
		// from several files says which one each of its annotations came from.
		// When they all came from the same place that heading has nothing left
		// to tell apart, and repeating it under every topic — one per
		// annotation, where the topics are the annotations' own first lines —
		// buries the note in a heading that always says the same thing. So a
		// heading is only started over when it has more than one thing to say.
		const labelFor = (anno: PDFAnnotation) => {
			if (this.settings.fileHeading === "file") return anno.file.name;
			// A PDF sitting in the vault root has no folder to name.
			return anno.folder || t.NOTE_VAULT_ROOT;
		};
		const dateFor = (anno: PDFAnnotation) => anno.created || t.NOTE_NO_DATE;
		const labelVaries = new Set(grandtotal.map(labelFor)).size > 1;
		const topicVaries = new Set(grandtotal.map((a) => a.topic)).size > 1;

		// Nothing to head a topic or a day with unless the annotations were
		// grouped by one in the first place.
		const headingTopics =
			this.settings.topicHeading && this.settings.sortByTopic;
		const headingDates =
			this.settings.dateHeading &&
			this.settings.groupByDate &&
			!onePerNote;
		const headingFiles =
			this.settings.fileHeading !== "none" && !onePerNote;

		// So one unchanging label heads the note rather than marking a place
		// inside it: written once, above everything rather than under the first
		// of them.
		const headsTheNote = !labelVaries && headingFiles;

		// Whichever heading encloses the others takes the first level, so the
		// note reads as an outline whichever of them are written: the one file
		// the annotations came from, then the days, then the topics within each
		// day, then the files when they came from several.
		const [noteLevel, dateLevel, topicLevel, fileLevel] = headingLevels([
			headsTheNote,
			headingDates,
			headingTopics,
			!headsTheNote && headingFiles,
		]);

		if (headsTheNote && grandtotal.length > 0) {
			currentLabel = labelFor(grandtotal[0]);
			text += `${noteLevel} ${currentLabel}\n\n`;
		}

		// console.log("all annots", grandtotal)
		grandtotal.forEach((anno) => {
			if (headingDates) {
				if (date != dateFor(anno)) {
					date = dateFor(anno);
					if (topicVaries) topic = "";
					if (labelVaries) currentLabel = "";
					text += `${dateLevel} ${date}\n\n`;
				}
			}

			// print main Title when Topic changes (and settings allow)
			if (headingTopics) {
				if (topic != anno.topic) {
					topic = anno.topic;
					if (labelVaries) currentLabel = "";
					text += `${topicLevel} ${topic}\n\n`;
				}
			}

			if (headingFiles) {
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
