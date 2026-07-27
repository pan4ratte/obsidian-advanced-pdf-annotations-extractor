import { PDFAnnotation } from "./types";

/**
 * `#` and a word holding at least one letter, so `#1` numbering a point is not
 * a tag. `\p{L}` rather than `\w`: `#ключевое` is as much a tag as `#key`. The
 * leading space is taken with the tag, leaving no gap behind it.
 */
const TAG_PATTERN = /[ \t]*#([\p{L}\p{N}_/-]*\p{L}[\p{L}\p{N}_/-]*)/gu;

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
 * The text with its tags taken out. A line left holding nothing but tags goes
 * with them rather than opening a hole in the comment.
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
 * The tags in the comments, deduplicated and taken out of them, so each ends up
 * in the note's properties rather than in both properties and text.
 *
 * The topic is read with the body: sorting by topic splits the comment's first
 * line off into `topic` before a note is written, and that line is exactly
 * where a reader puts a tag.
 */
export function takeTagsFromAnnotations(annotations: PDFAnnotation[]): string[] {
	const tags = new Set<string>();

	for (const annotation of annotations) {
		const inTopic = tagsIn(annotation.topic ?? "");
		const inBody = tagsIn(annotation.body);
		for (const tag of [...inTopic, ...inBody]) tags.add(tag);

		// Untouched when there is no tag, so an untagged comment is written
		// exactly as it was made.
		if (inTopic.length > 0) {
			annotation.topic = withoutTags(annotation.topic ?? "");
		}
		if (inBody.length > 0) {
			annotation.body = withoutTags(annotation.body);
		}
	}

	return [...tags];
}
