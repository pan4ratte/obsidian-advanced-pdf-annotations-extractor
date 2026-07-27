import { PDFAnnotation } from "./types";

/**
 * A tag as a reader writes one in a comment: `#` and then a word with at least
 * one letter in it, so a `#1` numbering a point is not taken for one. Nested
 * tags and the dashes and underscores Obsidian allows are kept. The space in
 * front goes with the tag when it is taken out, so no gap is left where it
 * stood.
 */
const TAG_PATTERN = /[ \t]*#([\wöäü_/-]*[A-Za-zöäü][\wöäü_/-]*)/g;

/** The tags in one piece of text, without their `#`, in writing order. */
function tagsIn(text: string): string[] {
	const found: string[] = [];
	let match: RegExpExecArray | null;

	TAG_PATTERN.lastIndex = 0;
	while ((match = TAG_PATTERN.exec(text)) !== null) {
		found.push(match[1]);
	}

	return found;
}

/**
 * The text with its tags taken out. A line left with nothing but the tags it
 * held goes with them, rather than opening a hole in the comment; the lines
 * that keep something are trimmed, since a tag is as often written at the
 * beginning of one as at the end.
 */
function withoutTags(text: string): string {
	const kept: string[] = [];

	for (const line of text.split(/\r\n|\n\r|\n|\r/)) {
		if (tagsIn(line).length === 0) {
			kept.push(line);
			continue;
		}

		const remainder = line.replace(TAG_PATTERN, "").trim();
		if (remainder.length > 0) kept.push(remainder);
	}

	return kept.join("\n");
}

/**
 * The tags written in the annotations' comments, without their `#` and with no
 * repeats — taken out of the comments as they are read, so that each tag ends
 * up in the note's properties rather than in both the properties and the text.
 *
 * The topic is read along with the body: sorting by topic splits the comment's
 * first line off into `topic` before ever a note is written, and the first line
 * is exactly where a reader puts a tag — beside the title, or as the whole of a
 * one-line comment. Reading the body alone would find none of those.
 */
export function takeTagsFromAnnotations(annotations: PDFAnnotation[]): string[] {
	const tags = new Set<string>();

	for (const annotation of annotations) {
		const inTopic = tagsIn(annotation.topic ?? "");
		const inBody = tagsIn(annotation.body);
		for (const tag of [...inTopic, ...inBody]) tags.add(tag);

		// Left as they were when they hold no tag, so a comment nobody tagged
		// is written exactly as it was made.
		if (inTopic.length > 0) {
			annotation.topic = withoutTags(annotation.topic ?? "");
		}
		if (inBody.length > 0) {
			annotation.body = withoutTags(annotation.body);
		}
	}

	return [...tags];
}
