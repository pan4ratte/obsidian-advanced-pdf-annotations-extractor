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

/**
 * Outermost grouping first: day, topic, folder, file, then page and the place
 * on it.
 */
export function compareAnnotations(
	settings: PDFAnnotationPluginSetting
): (a1: PDFAnnotation, a2: PDFAnnotation) => number {
	return function (a1: PDFAnnotation, a2: PDFAnnotation): number {
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

		if (settings.groupByFolder) {
			const byFolder = compareText(a1.folder, a2.folder);
			if (byFolder != 0) return byFolder;
		}

		const byFile = compareText(a1.file.name, a2.file.name);
		if (byFile != 0) return byFile;

		if (a1.pageNumber > a2.pageNumber) return 1;
		if (a1.pageNumber < a2.pageNumber) return -1;

		// Same page: down it. `rect`, not quad points, which not every
		// annotation carries.
		if (a1.rect[1] > a2.rect[1]) return -1;
		if (a1.rect[1] < a2.rect[1]) return 1;
		return 0;
	};
}
