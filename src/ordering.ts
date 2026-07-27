import { PDFAnnotationPluginSetting } from "./settings";
import { PDFAnnotation } from "./types";

/**
 * Text in the order a reader would put it in, rather than the order its code
 * points happen to fall in. `>` and `<` compare UTF-16 units, which reads every
 * alphabet as if it were ASCII: `ё` would come after `я` instead of in the
 * middle of the Russian alphabet it belongs to, `ä` after `z`, and every
 * capital before every small letter, so `Ясность` would sort above `апория`.
 *
 * Numbers are read as numbers while it is at it, so a topic numbered 452 comes
 * before one numbered 1200 rather than after it.
 */
const collator = new Intl.Collator(undefined, { numeric: true });

/** Text, either of which may be missing, in that order. */
function compareText(one: string | undefined, other: string | undefined): number {
	return collator.compare(one ?? "", other ?? "");
}

/**
 * The order the annotations are written in, outermost grouping first: the day
 * they were made, then the topic, then the folder, then the file, and within a
 * file the page and the place on it. Kept out of the plugin class so it can be
 * checked on its own.
 */
export function compareAnnotations(
	settings: PDFAnnotationPluginSetting
): (a1: PDFAnnotation, a2: PDFAnnotation) => number {
	return function (a1: PDFAnnotation, a2: PDFAnnotation): number {
		if (settings.groupByDate) {
			// The day the annotation was made, outside every other grouping. A
			// PDF need not date its annotations at all, and the ones it left
			// undated belong after those it dated rather than before the
			// earliest of them. Days are `YYYY-MM-DD`, which sorts as text.
			const d1 = a1.created ?? "";
			const d2 = a2.created ?? "";
			if (d1 != d2) {
				if (!d1) return 1;
				if (!d2) return -1;
				return d1 < d2 ? -1 : 1;
			}
		}

		if (settings.sortByTopic) {
			const byTopic = compareText(a1.topic, a2.topic);
			if (byTopic != 0) return byTopic;
		}

		if (settings.groupByFolder) {
			const byFolder = compareText(a1.folder, a2.folder);
			if (byFolder != 0) return byFolder;
		}

		const byFile = compareText(a1.file.name, a2.file.name);
		if (byFile != 0) return byFile;

		if (a1.pageNumber > a2.pageNumber) return 1;
		if (a1.pageNumber < a2.pageNumber) return -1;

		// They are on the same page: down it, by the top of the annotation.
		// `rect` is used rather than the quad points, which an annotation need
		// not carry.
		if (a1.rect[1] > a2.rect[1]) return -1;
		if (a1.rect[1] < a2.rect[1]) return 1;
		return 0;
	};
}
