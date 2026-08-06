import {
	compile as compileTemplate,
	TemplateDelegate as Template,
} from "handlebars";
import { t } from "../lang/helpers";
import { groupsByFile, groupsByFolder } from "./ordering";
import {
	PDFAnnotationPluginSetting,
	templateForAnnotation,
} from "./settings";
import { PDFAnnotation } from "./types";

/**
 * The `#` prefix for each heading, outermost first. A heading that is not
 * written takes no level with it, so the note keeps an unbroken outline.
 */
export function headingLevels(written: boolean[]): string[] {
	let depth = 0;
	return written.map((isWritten) =>
		isWritten ? "#".repeat(++depth) : ""
	);
}

export class PDFAnnotationPluginFormatter {
	private settings: PDFAnnotationPluginSetting;

	private templateSettings = {
		noEscape: true,
	};

	constructor(settings: PDFAnnotationPluginSetting) {
		this.settings = settings;
	}

	/**
	 * `onePerNote` for the notes holding a single annotation: the headings that
	 * group have nothing to group there, so only the topic heading is written —
	 * a topic is what the annotation is about, not where it came from.
	 */
	format(
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean,
		onePerNote = false
	): string {
		let text = "";
		let topic = "";
		let currentLabel = "";

		let date = "";

		// A new group restarts the headings under it, so a day read from
		// several files says which each annotation came from. A heading with
		// only one thing to say is not restarted, or it would repeat down the
		// whole note.
		const labelFor = (anno: PDFAnnotation) => {
			if (this.settings.fileHeading === "file") return anno.file.name;
			// A PDF in the vault root has no folder to name.
			return anno.folder || t.NOTE_VAULT_ROOT;
		};
		const dateFor = (anno: PDFAnnotation) => anno.created || t.NOTE_NO_DATE;
		const labelVaries = new Set(grandtotal.map(labelFor)).size > 1;
		const dateVaries = new Set(grandtotal.map(dateFor)).size > 1;
		const topicVaries = new Set(grandtotal.map((a) => a.topic)).size > 1;

		// Nothing to head a topic or day with unless they were grouped by one.
		const headingTopics =
			this.settings.topicHeading && this.settings.sortByTopic;
		const headingDates =
			this.settings.dateHeading &&
			this.settings.groupByDate &&
			!onePerNote;
		const headingFiles =
			this.settings.fileHeading !== "none" && !onePerNote;

		// One unchanging label heads the note instead of marking a place in it.
		const headsTheNote = !labelVaries && headingFiles;
		// Marking places takes the grouping that gathered them: unsorted, the
		// files interleave and a heading naming one repeats down the note.
		const labelGroups =
			headingFiles &&
			(this.settings.fileHeading === "folder"
				? groupsByFolder(this.settings, grandtotal)
				: groupsByFile(this.settings, grandtotal));

		// Whichever heading encloses the others takes the first level, and the
		// rest follow the order the annotations were grouped in.
		const [noteLevel, fileLevel, dateLevel, topicLevel] = headingLevels([
			headsTheNote,
			labelGroups,
			headingDates,
			headingTopics,
		]);

		if (headsTheNote && grandtotal.length > 0) {
			text += `${noteLevel} ${labelFor(grandtotal[0])}\n\n`;
		}

		grandtotal.forEach((anno) => {
			if (labelGroups) {
				const label = labelFor(anno);
				if (currentLabel != label) {
					currentLabel = label;
					if (dateVaries) date = "";
					if (topicVaries) topic = "";
					text += `${fileLevel} ${label}\n\n`;
				}
			}

			if (headingDates) {
				if (date != dateFor(anno)) {
					date = dateFor(anno);
					if (topicVaries) topic = "";
					text += `${dateLevel} ${date}\n\n`;
				}
			}

			if (headingTopics) {
				if (topic != anno.topic) {
					topic = anno.topic;
					text += `${topicLevel} ${topic}\n\n`;
				}
			}

			text += this.getContentFor(anno, isExternalFile);
		});

		if (grandtotal.length == 0) return t.NOTE_NO_ANNOTATIONS;
		else return text;
	}

	/** The template of this annotation's type, or the default. */
	templateFor(annotation: PDFAnnotation): Template {
		return compileTemplate(
			templateForAnnotation(this.settings, annotation.subtype),
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
			// One template, both locations: a wiki link inside the vault, a
			// file:// URL outside it.
			filelink: isExternalFile
				? annotation.filepath
				: `[[${annotation.filepath}]]`,
			isExternal: isExternalFile,
			pageNumber: annotation.pageNumber,
			pageLabel: annotation.pageLabel,
			author: annotation.author,
			body: annotation.body,
			// As pdf.js names it, which a {{#if}} can be written against.
			type: annotation.subtype,
			topic: annotation.topic,
			// The day and the time of day apart, so a template can write either
			// without the other. The PDF's own timestamp, down to the second,
			// stays on `annotation.creationDate` in the shape the file wrote it.
			created: annotation.created,
			createdTime: annotation.createdTime,
		};

		return { annotation: annotation, ...shortcuts };
	}

	getContentFor(annotation: PDFAnnotation, isExternalFile: boolean): string {
		return this.templateFor(annotation)(
			this.getTemplateVariablesForAnnotation(annotation, isExternalFile)
		);
	}
}
