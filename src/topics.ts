import { PDFAnnotation } from "./types";

/** Every line ending a PDF may have written a comment with. */
const LINE_ENDING = /\r\n|\n\r|\n|\r/;

/**
 * The first line of each comment. Always read, so `{{topic}}` is answered
 * whether or not the annotations are grouped by it.
 *
 * `takeFromBody` when grouping: the topic is then written as a heading above
 * the annotations sharing it, and would otherwise be read twice.
 */
export function assignTopics(
	annotations: PDFAnnotation[],
	takeFromBody: boolean
): void {
	for (const annotation of annotations) {
		const lines = annotation.body.split(LINE_ENDING);
		annotation.topic = lines[0];
		if (takeFromBody) {
			annotation.body = lines.slice(1).join("\r\n");
		}
	}
}

/**
 * The topic, taken out of the annotation to name the note written from it: a
 * note carrying its topic in its name should not repeat it inside.
 *
 * `stillInBody` when grouping by topic has not already removed the line. It is
 * only dropped while it is still the line the topic was read from — taking the
 * tags out can have shortened it in the meantime.
 */
export function takeTopicForNoteName(
	annotation: PDFAnnotation,
	stillInBody: boolean
): string {
	const topic = annotation.topic ?? "";
	annotation.topic = "";

	if (stillInBody && topic.length > 0) {
		const lines = annotation.body.split(LINE_ENDING);
		if (lines[0] === topic) {
			annotation.body = lines.slice(1).join("\r\n");
		}
	}

	return topic;
}
