import { PDFAnnotation } from "./types";

/** Every line ending a PDF may have written a comment with. */
const LINE_ENDING = /\r\n|\n\r|\n|\r/;

/**
 * The topic of each annotation: the first line of its comment, which is where a
 * reader writes what the comment is about. Always read, so a template that asks
 * for `{{topic}}` is answered whether or not the annotations are grouped by it.
 *
 * Grouping by topic takes that line out of the body as well, since the topic is
 * then written as a heading above the annotations sharing it and would be read
 * twice otherwise. With the grouping off nothing writes it anywhere on its own,
 * so the comment is left whole and a template may write the line itself.
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
 * The annotation's topic, taken out of it and given back to be used as the name
 * of the note being written from it: a note that carries its topic in its name
 * would otherwise write it a second time inside itself, as a heading or as a
 * `{{topic}}` a template asks for.
 *
 * Grouping by topic has taken the line out of the body already. Without it the
 * body still holds the line, and only then is it dropped — and only while it is
 * still the line the topic was read from, since taking the tags out of a
 * comment can have shortened or removed it in the meantime.
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
