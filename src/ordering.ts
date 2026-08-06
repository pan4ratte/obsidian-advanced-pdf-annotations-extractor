import { PDFAnnotationPluginSetting } from "./settings";
import { PDFAnnotation } from "./types";

/**
 * Reader's order, not code point order: `>` and `<` read every alphabet as
 * ASCII, putting `ё` after `я` and `ä` after `z`. `numeric` so 452 sorts before
 * 1200.
 */
const collator = new Intl.Collator(undefined, { numeric: true });

function compareText(one: string | undefined, other: string | undefined): number {
	return collator.compare(one ?? "", other ?? "");
}

/** Whether the set holds more than one of whatever `key` reads off it. */
function varies(
	annotations: PDFAnnotation[],
	key: (annotation: PDFAnnotation) => string
): boolean {
	return new Set(annotations.map(key)).size > 1;
}

/**
 * Where the PDF sits groups nothing when every annotation came from the same
 * place, so the two placement groupings are read off the set being written and
 * not from the setting alone: one folder, or one file, is the ordinary
 * extraction, and it has nothing to separate from anything.
 */
export function groupsByFolder(
	settings: PDFAnnotationPluginSetting,
	annotations: PDFAnnotation[]
): boolean {
	return settings.groupByFolder && varies(annotations, (a) => a.folder);
}

export function groupsByFile(
	settings: PDFAnnotationPluginSetting,
	annotations: PDFAnnotation[]
): boolean {
	return settings.groupByFile && varies(annotations, (a) => a.file.name);
}

/**
 * Outermost grouping first, widest to narrowest: folder, file, day, topic,
 * then the page and the place on it.
 */
export function compareAnnotations(
	settings: PDFAnnotationPluginSetting,
	annotations: PDFAnnotation[]
): (a1: PDFAnnotation, a2: PDFAnnotation) => number {
	// Read before a single comparison is made: the comparator is called while
	// the array is half sorted, and what it groups by cannot be decided from
	// an order that is still moving.
	const byFolder = groupsByFolder(settings, annotations);
	const byFile = groupsByFile(settings, annotations);

	return function (a1: PDFAnnotation, a2: PDFAnnotation): number {
		if (byFolder) {
			const folders = compareText(a1.folder, a2.folder);
			if (folders != 0) return folders;
		}

		if (byFile) {
			const files = compareText(a1.file.name, a2.file.name);
			if (files != 0) return files;
		}

		if (settings.groupByDate) {
			// `YYYY-MM-DD` sorts as text; the undated come last, not first.
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

		if (a1.pageNumber > a2.pageNumber) return 1;
		if (a1.pageNumber < a2.pageNumber) return -1;

		// Same page: down it. `rect`, not quad points, which not every
		// annotation carries.
		if (a1.rect[1] > a2.rect[1]) return -1;
		if (a1.rect[1] < a2.rect[1]) return 1;

		// Files nobody grouped still come out in a settled order rather than
		// in whichever one the reads happened to finish in.
		return compareText(a1.file.name, a2.file.name);
	};
}
