import { PDFAnnotation } from "./types";

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
		const lines = annotation.body.split(/\r\n|\n\r|\n|\r/);
		annotation.topic = lines[0];
		if (takeFromBody) {
			annotation.body = lines.slice(1).join("\r\n");
		}
	}
}
