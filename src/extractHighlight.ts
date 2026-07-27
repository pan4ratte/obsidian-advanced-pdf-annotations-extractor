import { PDFAnnotation, PDFFile, PDFJsLib, RawPDFAnnotation } from "src/types";
import { ANNOTS_TREATED_AS_HIGHLIGHTS } from "src/settings";
import {
	PDFDocumentProxy,
	PDFPageProxy,
	TextContent,
	TextItem,
} from "pdfjs-dist/types/src/display/api";

/** A corner of a quad, in PDF user space. */
interface QuadPoint {
	x: number;
	y: number;
}

/**
 * `D:YYYYMMDD` and whatever follows it. Everything after the year is optional
 * in the PDF spec, and the `D:` prefix is missing from some writers' output.
 * The time and zone are deliberately not read: the day is what the annotations
 * are grouped by, and a zone would move an annotation to the day before or
 * after depending on where the note is read.
 */
const PDF_DATE = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?/;

/**
 * The day a PDF date string names, as `YYYY-MM-DD`. Undefined for a missing or
 * unreadable date, so an annotation with no date of its own stays
 * distinguishable from one made at the epoch.
 */
export function pdfDateToDay(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const parsed = PDF_DATE.exec(raw.trim());
	if (!parsed) return undefined;

	const [, year, month = "01", day = "01"] = parsed;
	// A writer that pads a date out with zeroes, or gets it wrong, would
	// otherwise sort under a month that does not exist.
	if (Number(month) < 1 || Number(month) > 12) return undefined;
	if (Number(day) < 1 || Number(day) > 31) return undefined;

	return `${year}-${month}-${day}`;
}

/**
 * The fields of a pdf.js text item the extraction reads. A full `TextItem`
 * satisfies this; it types `transform` as `any[]`, which is why the matrix is
 * restated here.
 */
export interface PositionedText {
	str: string;
	width: number;
	/** pdf.js transform matrix; [4] and [5] are the item's x and y. */
	transform: number[];
}

// return text between min and max, x and y
function searchQuad(
	minx: number,
	maxx: number,
	miny: number,
	maxy: number,
	items: PositionedText[]
) {
	const mycontent = items.reduce(function (txt: string, x: PositionedText) {
		if (x.width == 0) return txt; // eliminate empty stuff
		if (!(miny <= x.transform[5] && x.transform[5] <= maxy)) return txt; // y coordinate not in box
		if (x.transform[4] + x.width < minx) return txt; // end of txt before highlight starts
		if (x.transform[4] > maxx) return txt; // start of text after highlight ends

		// snap both edges of the highlight to the nearest estimated glyph border
		const borders = glyphBorders(x.str, x.transform[4], x.width);
		const start = nearestBorder(borders, minx);
		const end = nearestBorder(borders, maxx);
		return txt + x.str.substring(start, end);
	}, "");
	return mycontent.trim();
}

// iterate over all QuadPoints and join retrieved lines
export function extractHighlight(
	annot: Pick<RawPDFAnnotation, "quadPoints">,
	items: PositionedText[]
): string {
	// pdf.js reports null when a text markup annotation carries no usable
	// QuadPoints. There is no text to pick up then, only the comment on the
	// annotation itself, so don't let one malformed annotation fail the file.
	if (!annot.quadPoints) return "";

	const quadPoints = annot.quadPoints;
	const legacyQuadPoints: QuadPoint[][] = [];
	// Recreate legacy quadPoints array, with the form [[{x: 1, y: 2}, {x: 3, y: 4}, {x: 5, y: 6}, {x: 7, y: 8}], ...]
	// One quad is 4 points (x,y) in the order tL, tR, bL, bR, multiple quads for multiple lines
	for (let i = 0; i < quadPoints.length / 8; i++) {
		const oneQuad: QuadPoint[] = [];
		for (let j = 0; j < 8; j = j + 2) {
			oneQuad.push({
				x: quadPoints[j + i * 8],
				y: quadPoints[j + 1 + i * 8],
			});
		}
		legacyQuadPoints.push(oneQuad);
	}
	const highlight = legacyQuadPoints.reduce((txt: string, quad: QuadPoint[]) => {
		const minx = quad.reduce(
			(prev: number, curr: QuadPoint) => Math.min(prev, curr.x),
			quad[0].x
		);
		const maxx = quad.reduce(
			(prev: number, curr: QuadPoint) => Math.max(prev, curr.x),
			quad[0].x
		);
		const miny = quad.reduce(
			(prev: number, curr: QuadPoint) => Math.min(prev, curr.y),
			quad[0].y
		);
		const maxy = quad.reduce(
			(prev: number, curr: QuadPoint) => Math.max(prev, curr.y),
			quad[0].y
		);
		const res = searchQuad(minx, maxx, miny, maxy, items);
		// if the last character of txt (previous lines) is not a hyphen, we concatenate the lines, by adding a blank
		if (txt != "" && txt.substring(txt.length - 1) != "-") {
			return txt + " " + res;
		} else if (
			txt.substring(txt.length - 2).toLowerCase() ==
				txt.substring(txt.length - 2) && // end by lowercase-
			res.substring(0, 1).toLowerCase() == res.substring(0, 1)
		) {
			// and start with lowercase
			return txt.substring(0, txt.length - 1) + res; // remove hyphon
		} else {
			return txt + res; // keep hyphon or if the previous text is empty, return the whole result
		}
	}, "");
	return highlight;
}

// load the PDFpage, then get all Annotations
// we look only at desiredAnnotations from the user's settings
// if its a underline, squiggle or highlight, extract Highlight of the Annotation
// accumulate all annotations in the array total
async function loadPage(
	page: PDFPageProxy,
	pagenum: number,
	pageLabel: string,
	file: PDFFile,
	containingFolder: string,
	total: PDFAnnotation[],
	desiredAnnotations: string[]
) {
	const rawAnnotations = (await page.getAnnotations()) as RawPDFAnnotation[];

	const annotations = rawAnnotations.filter(
		(anno) => desiredAnnotations.indexOf(anno.subtype) >= 0
	);

	// pdf.js normalizes whitespace by default since v3; the normalizeWhitespace
	// option this used to pass was removed from its API.
	const content: TextContent = await page.getTextContent();

	// TextContent also carries marked-content markers, which have no position
	const textItems = content.items.filter(
		(item): item is TextItem => "str" in item
	);

	// sort text elements
	textItems.sort(function (a1: TextItem, a2: TextItem) {
		if (a1.transform[5] > a2.transform[5]) return -1; // y coord. descending
		if (a1.transform[5] < a2.transform[5]) return 1;
		if (a1.transform[4] > a2.transform[4]) return 1; // x coord. ascending
		if (a1.transform[4] < a2.transform[4]) return -1;
		return 0;
	});

	for (const raw of annotations) {
		const anno: PDFAnnotation = {
			...raw,
			folder: containingFolder,
			file: file,
			filepath: file.path, // we need a direct string property in the templates
			pageNumber: pagenum,
			pageLabel: pageLabel, // Real page number defined by author
			author: raw.titleObj.str,
			body: raw.contentsObj.str,
			created: pdfDateToDay(raw.creationDate),
		};

		if (ANNOTS_TREATED_AS_HIGHLIGHTS.includes(anno.subtype)) {
			anno.highlightedText = extractHighlight(anno, textItems);
		}

		// Nothing a note could show: no comment, and no text marked up. Skip it
		// rather than exporting a blank entry.
		if (!anno.body.trim() && !anno.highlightedText?.trim()) continue;

		total.push(anno);
	}
}

export async function loadPDFFile(
	file: PDFFile,
	pdfjsLib: PDFJsLib,
	containingFolder: string,
	total: PDFAnnotation[],
	desiredAnnotations: string[]
) {
	const pdf: PDFDocumentProxy = await pdfjsLib.getDocument(file.content)
		.promise;
	const pageLabels = await pdf.getPageLabels();
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		// if no page label is defined, use the page number
		let pageLabel = '';
		if (pageLabels && pageLabels[i - 1]) {
			pageLabel = pageLabels[i - 1];
		} else {
			pageLabel = i.toString();
		}
		await loadPage(
			page,
			i,
			pageLabel,
			file,
			containingFolder,
			total,
			desiredAnnotations
		);
	}
}

const WIDE_LETTERS = ['w', 'm', 'W', 'M', 'D', 'O', 'Q', 'G', 'S', 'B', 'C', 'P', 'E', 'R', 'A', 'N', 'U', 'V', 'X', 'Y', 'Z', 'K', 'H'];
const SLIM_LETTERS = ['i', 'r', 'l', 't', 'f', 'j', 'I', '1', '.', ',', '(', ')', '"', '\''];

// Width of a glyph relative to the average character width of its text item.
// The values approximate what the PDF highlight rectangles of a proportional
// font imply: wide letters run about 1.75x the average, slim ones about 0.6x.
const WIDE_LETTER_WEIGHT = 1.75;
const SLIM_LETTER_WEIGHT = 0.6;
const NORMAL_LETTER_WEIGHT = 1;

function letterWeight(letter: string): number {
	if (WIDE_LETTERS.includes(letter)) return WIDE_LETTER_WEIGHT;
	if (SLIM_LETTERS.includes(letter)) return SLIM_LETTER_WEIGHT;
	return NORMAL_LETTER_WEIGHT;
}

// pdf.js reports one width for a whole text item, not per glyph. Estimate where
// every character begins by splitting that width up according to the letter
// weights above: borders[i] is the x position where character i starts, and the
// last entry is where the item ends. Distributing the width evenly instead makes
// highlights of a single character land on the neighbouring letter.
function glyphBorders(
	str: string,
	itemStartX: number,
	itemWidth: number
): number[] {
	const weights = str.split("").map(letterWeight);
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	const borders = [itemStartX];
	if (totalWeight === 0) return borders;

	let position = itemStartX;
	for (const weight of weights) {
		position += (weight * itemWidth) / totalWeight;
		borders.push(position);
	}
	return borders;
}

// index of the glyph border closest to the given x position
function nearestBorder(borders: number[], x: number): number {
	let nearest = 0;
	for (let i = 1; i < borders.length; i++) {
		if (Math.abs(borders[i] - x) < Math.abs(borders[nearest] - x)) {
			nearest = i;
		}
	}
	return nearest;
}

