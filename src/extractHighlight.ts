import {
	PDFAnnotation,
	PDFFile,
	PDFJsLib,
	PDFSection,
	RawPDFAnnotation,
	RawPDFOutlineItem,
} from "src/types";
import { ANNOTS_TREATED_AS_HIGHLIGHTS } from "src/settings";
import {
	PDFDocumentProxy,
	PDFPageProxy,
	RefProxy,
	TextContent,
	TextItem,
} from "pdfjs-dist/types/src/display/api";

/** The box one quad covers, in PDF user space. */
interface QuadBounds {
	minx: number;
	maxx: number;
	miny: number;
	maxy: number;
}

/**
 * The box of quad `index`. A quad is four corners, which the spec orders
 * tL, tR, bL, bR — but writers disagree, so the box is taken from the extremes
 * rather than from named corners. That is what makes a highlight dragged right
 * to left read the same as one dragged left to right.
 */
function quadBounds(quadPoints: ArrayLike<number>, index: number): QuadBounds {
	const xs: number[] = [];
	const ys: number[] = [];
	for (let corner = 0; corner < 8; corner += 2) {
		xs.push(quadPoints[index * 8 + corner]);
		ys.push(quadPoints[index * 8 + corner + 1]);
	}
	return {
		minx: Math.min(...xs),
		maxx: Math.max(...xs),
		miny: Math.min(...ys),
		maxy: Math.max(...ys),
	};
}

/**
 * The quads in reading order: down the page, then left to right along each
 * line. A PDF need not list them that way — a highlight dragged upwards is
 * written bottom line first by some writers, which would otherwise join the
 * lines back to front.
 *
 * Grouped into lines before being sorted within one, rather than compared
 * pairwise against a tolerance: a comparator whose idea of "the same line"
 * depends on the pair it is given is not transitive, and sorts by it come out
 * arbitrary.
 */
function inReadingOrder(quads: QuadBounds[]): QuadBounds[] {
	if (quads.length < 2) return quads;

	// PDF y grows upwards, so the top of the page is the largest.
	const down = [...quads].sort((a, b) => b.maxy - a.maxy);
	// Half a line of the tallest quad: enough to keep the lines apart, loose
	// enough that two quads on one line are not read as two.
	const line = Math.max(...quads.map((quad) => quad.maxy - quad.miny)) / 2;

	const lines: QuadBounds[][] = [];
	for (const quad of down) {
		const current = lines[lines.length - 1];
		if (current && current[0].maxy - quad.maxy <= line) {
			current.push(quad);
		} else {
			lines.push([quad]);
		}
	}

	const ordered: QuadBounds[] = [];
	for (const one of lines) {
		ordered.push(...one.sort((a, b) => a.minx - b.minx));
	}
	return ordered;
}

/**
 * `D:YYYYMMDD` and whatever follows. Everything after the year is optional, and
 * some writers omit the `D:`. Time and zone are deliberately not read — a zone
 * would move an annotation a day either way depending on where it is read.
 */
const PDF_DATE = /^(?:D:)?(\d{4})(\d{2})?(\d{2})?/;

/**
 * The day a PDF date names, as `YYYY-MM-DD`. Undefined when missing or
 * unreadable, so an undated annotation stays apart from one made at the epoch.
 */
export function pdfDateToDay(raw: string | null | undefined): string | undefined {
	if (!raw) return undefined;
	const parsed = PDF_DATE.exec(raw.trim());
	if (!parsed) return undefined;

	const [, year, month = "01", day = "01"] = parsed;
	// A writer padding with zeroes would otherwise sort under month 00.
	if (Number(month) < 1 || Number(month) > 12) return undefined;
	if (Number(day) < 1 || Number(day) > 31) return undefined;

	return `${year}-${month}-${day}`;
}

/**
 * The hours and minutes following a whole `D:YYYYMMDD`. Nothing shorter is
 * read: in a date cut off before the day, four more digits would be the day
 * and month of something else, not a time.
 */
const PDF_TIME = /^(?:D:)?\d{8}(\d{2})(\d{2})?/;

/**
 * The time of day a PDF date names, as `HH:mm`, read as the writer wrote it.
 * The zone that may follow is left alone for the reason the day leaves it
 * alone: applying it would move the annotation depending on where it is read,
 * and then the time would no longer be the one on the reader's own screen when
 * they made the note. Undefined when the date carries no time, which many
 * writers omit.
 */
export function pdfDateToTime(
	raw: string | null | undefined
): string | undefined {
	if (!raw) return undefined;
	const parsed = PDF_TIME.exec(raw.trim());
	if (!parsed) return undefined;

	const [, hour, minute = "00"] = parsed;
	// 24 is midnight in some writers' output, but not a time to print.
	if (Number(hour) > 23) return undefined;
	if (Number(minute) > 59) return undefined;

	return `${hour}:${minute}`;
}

/** One channel of a colour, as the two hex digits it is written with. */
function hexByte(value: number): string {
	const bounded = Math.min(255, Math.max(0, Math.round(value)));
	return bounded.toString(16).padStart(2, "0");
}

/** What pdf.js fills a missing `/C` in with, and what it means here. */
const PDFJS_DEFAULT_COLOR = "#000000";

/**
 * The colour of an annotation, as `#rrggbb`. pdf.js hands `/C` over already
 * converted to RGB — the PDF format lets it be written in grey, RGB or CMYK,
 * and none of that reaches here.
 *
 * Undefined for an annotation the file gives no colour to read: pdf.js reports
 * null for one explicitly transparent, and nothing at all for a subtype that
 * carries no colour entry.
 *
 * Black is the awkward one. pdf.js fills a *missing* `/C` in with it rather
 * than leaving it out, so black and unset are the same answer, and which one it
 * is has to be read from the kind of annotation asking. A reader picks black to
 * underline or strike out with, so a markup annotation keeps it — while `/C` on
 * a sticky note or a free text box is the icon or the border, routinely absent,
 * and a black nobody chose would fill the colour list of every PDF with a
 * bucket that means "the file said nothing".
 */
export function annotationColor(
	color: ArrayLike<number> | null | undefined,
	marksUpText: boolean
): string | undefined {
	if (!color || color.length < 3) return undefined;

	const channels = [color[0], color[1], color[2]];
	if (!channels.every((channel) => Number.isFinite(channel))) return undefined;

	const hex = `#${channels.map(hexByte).join("")}`;
	if (hex === PDFJS_DEFAULT_COLOR && !marksUpText) return undefined;
	return hex;
}

/**
 * What the extraction reads off a pdf.js text item. A `TextItem` satisfies it;
 * the matrix is restated because pdf.js types `transform` as `any[]`.
 */
export interface PositionedText {
	str: string;
	width: number;
	/** pdf.js transform matrix; [4] and [5] are the item's x and y. */
	transform: number[];
}

/** The text falling inside one quad. */
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

		// snap both edges to the nearest estimated glyph border
		const borders = glyphBorders(x.str, x.transform[4], x.width);
		const start = nearestBorder(borders, minx);
		const end = nearestBorder(borders, maxx);
		return txt + x.str.substring(start, end);
	}, "");
	return mycontent.trim();
}

/** The marked up text, read quad by quad and joined line by line. */
export function extractHighlight(
	annot: Pick<RawPDFAnnotation, "quadPoints">,
	items: PositionedText[]
): string {
	// No usable QuadPoints: only the comment is left to show, and one
	// malformed annotation must not fail the whole file.
	if (!annot.quadPoints) return "";

	const quadPoints = annot.quadPoints;
	// One quad per line of marked up text, four corners each.
	const quads: QuadBounds[] = [];
	for (let index = 0; index < quadPoints.length / 8; index++) {
		quads.push(quadBounds(quadPoints, index));
	}

	const highlight = inReadingOrder(quads).reduce((txt: string, quad) => {
		const res = searchQuad(
			quad.minx,
			quad.maxx,
			quad.miny,
			quad.maxy,
			items
		);
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

/**
 * Where in a destination array the top of the view sits, by the kind of
 * destination it is: `[pageRef, {name}, ...arguments]`. The kinds left out —
 * `Fit`, `FitB`, `FitV`, `FitBV` — name a page or a width and no height on it,
 * so a section jumping to one of them starts at the top of its page.
 */
const TOP_IN_DESTINATION: Record<string, number> = {
	// left, top, zoom
	XYZ: 3,
	// top
	FitH: 2,
	FitBH: 2,
	// left, bottom, right, top
	FitR: 5,
};

/** A pdf.js object reference, which is what an explicit destination points at. */
function isPageReference(value: unknown): value is RefProxy {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as RefProxy).num === "number" &&
		typeof (value as RefProxy).gen === "number"
	);
}

/** The `{name}` an explicit destination carries second, or nothing usable. */
function destinationKind(destination: unknown[]): string {
	const kind = destination[1];
	if (typeof kind !== "object" || kind === null) return "";
	const name = (kind as { name?: unknown }).name;
	return typeof name === "string" ? name : "";
}

/**
 * The page a destination lands on and how far down it, or nothing when it
 * cannot be resolved — a named destination the document does not define, or a
 * reference to a page that is not there. One unusable bookmark is not the
 * whole outline.
 */
async function startOfDestination(
	pdf: PDFDocumentProxy,
	dest: string | unknown[] | null
): Promise<{ pageNumber: number; top: number } | null> {
	if (!dest) return null;

	try {
		const destination =
			typeof dest === "string"
				? ((await pdf.getDestination(dest)) as unknown[] | null)
				: dest;
		if (!destination || destination.length === 0) return null;

		// Usually a reference to the page; some writers put its index there.
		const target = destination[0];
		const pageIndex = isPageReference(target)
			? await pdf.getPageIndex(target)
			: typeof target === "number"
				? target
				: null;
		if (pageIndex === null) return null;

		const at = TOP_IN_DESTINATION[destinationKind(destination)];
		const top = at === undefined ? undefined : destination[at];

		return {
			pageNumber: pageIndex + 1,
			// A destination may leave any of its arguments null, which means
			// "whatever the view already shows" — no height of its own either.
			top: typeof top === "number" ? top : Infinity,
		};
	} catch (error) {
		console.error(error);
		return null;
	}
}

/**
 * A heading as a folder may be named after it. A slash would open a folder of
 * its own, and the nesting of the outline is what says which folder holds
 * which — so the title keeps none of its own.
 */
function sectionName(title: string): string {
	return typeof title === "string"
		? title.replace(/[\\/]+/g, " ").replace(/\s+/g, " ").trim()
		: "";
}

/**
 * The PDF's own outline, flattened into the sections it names and sorted into
 * document order: down the pages, and down each page.
 *
 * A bookmark keeps its ancestors, so a section is the whole path to it. One
 * that names nothing to jump to still passes its title down to the bookmarks
 * beneath it — that is a heading over a part of the document, not a place in
 * it.
 */
export async function readSections(
	pdf: PDFDocumentProxy
): Promise<PDFSection[]> {
	// Typed as an array by pdf.js and null in a document that has no outline,
	// which is most of them.
	const outline = (await pdf.getOutline()) as RawPDFOutlineItem[] | null;
	if (!outline || outline.length === 0) return [];

	const sections: PDFSection[] = [];

	const visit = async (
		items: RawPDFOutlineItem[],
		ancestors: string[]
	): Promise<void> => {
		for (const item of items) {
			const name = sectionName(item.title);
			const path = name ? [...ancestors, name] : ancestors;

			const start = await startOfDestination(pdf, item.dest);
			if (start && path.length > 0) {
				sections.push({ ...start, path });
			}

			if (item.items?.length) await visit(item.items, path);
		}
	};
	await visit(outline, []);

	sections.sort((one, other) => {
		if (one.pageNumber !== other.pageNumber) {
			return one.pageNumber - other.pageNumber;
		}
		// Down the page, so the higher of the two comes first. Compared rather
		// than subtracted: two sections at the top of one page are both at
		// Infinity, and the difference of those is not a number.
		if (one.top === other.top) return 0;
		return one.top > other.top ? -1 : 1;
	});
	return sections;
}

/**
 * The section an annotation falls in: the last one beginning at or above it.
 * Nothing for an annotation standing before the first heading — a title page
 * belongs to no section of the document.
 */
export function sectionAt(
	sections: PDFSection[],
	pageNumber: number,
	top: number
): string[] | undefined {
	let found: PDFSection | undefined;
	// In document order, so the first section past the annotation ends it.
	for (const section of sections) {
		if (section.pageNumber > pageNumber) break;
		if (section.pageNumber === pageNumber && section.top < top) break;
		found = section;
	}
	return found?.path;
}

/** Reads one page's wanted annotations into `total`. */
async function loadPage(
	page: PDFPageProxy,
	pagenum: number,
	pageLabel: string,
	file: PDFFile,
	containingFolder: string,
	total: PDFAnnotation[],
	desiredAnnotations: string[],
	sections: PDFSection[]
) {
	const rawAnnotations = (await page.getAnnotations()) as RawPDFAnnotation[];

	const annotations = rawAnnotations.filter(
		(anno) => desiredAnnotations.indexOf(anno.subtype) >= 0
	);

	// pdf.js normalizes whitespace by default since v3.
	const content: TextContent = await page.getTextContent();

	// TextContent also carries marked-content markers, which have no position.
	const textItems = content.items.filter(
		(item): item is TextItem => "str" in item
	);

	textItems.sort(function (a1: TextItem, a2: TextItem) {
		if (a1.transform[5] > a2.transform[5]) return -1; // y coord. descending
		if (a1.transform[5] < a2.transform[5]) return 1;
		if (a1.transform[4] > a2.transform[4]) return 1; // x coord. ascending
		if (a1.transform[4] < a2.transform[4]) return -1;
		return 0;
	});

	for (const raw of annotations) {
		// Decides both what is read off the page under the annotation and how
		// its colour is read, so it is settled once before either.
		const marksUpText = ANNOTS_TREATED_AS_HIGHLIGHTS.includes(raw.subtype);

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
			createdTime: pdfDateToTime(raw.creationDate),
			colorHex: annotationColor(raw.color, marksUpText),
		};

		if (marksUpText) {
			anno.highlightedText = extractHighlight(anno, textItems);
		}

		if (sections.length > 0) {
			// The top of the annotation, whichever corner the rectangle names
			// first: a section starting between its top and its bottom is one
			// the annotation has already begun before.
			anno.section = sectionAt(
				sections,
				pagenum,
				Math.max(raw.rect[1], raw.rect[3])
			);
		}

		// Nothing a note could show, so nothing worth a blank entry.
		if (!anno.body.trim() && !anno.highlightedText?.trim()) continue;

		total.push(anno);
	}
}

/**
 * `withSections` reads the PDF's own outline and tells each annotation which
 * section of the document it falls in. Asked for rather than always done: it
 * resolves the destination of every bookmark, which a document with a long
 * outline makes a great many of, and nothing needs the answer unless the notes
 * are to be filed by section.
 */
export async function loadPDFFile(
	file: PDFFile,
	pdfjsLib: PDFJsLib,
	containingFolder: string,
	total: PDFAnnotation[],
	desiredAnnotations: string[],
	withSections = false
) {
	const pdf: PDFDocumentProxy = await pdfjsLib.getDocument(file.content)
		.promise;
	const sections = withSections ? await readSections(pdf) : [];
	const pageLabels = await pdf.getPageLabels();
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
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
			desiredAnnotations,
			sections
		);
	}
}

const WIDE_LETTERS = ['w', 'm', 'W', 'M', 'D', 'O', 'Q', 'G', 'S', 'B', 'C', 'P', 'E', 'R', 'A', 'N', 'U', 'V', 'X', 'Y', 'Z', 'K', 'H'];
const SLIM_LETTERS = ['i', 'r', 'l', 't', 'f', 'j', 'I', '1', '.', ',', '(', ')', '"', '\''];

// Glyph width relative to the average for the text item, as the highlight
// rectangles of a proportional font imply.
const WIDE_LETTER_WEIGHT = 1.75;
const SLIM_LETTER_WEIGHT = 0.6;
const NORMAL_LETTER_WEIGHT = 1;

function letterWeight(letter: string): number {
	if (WIDE_LETTERS.includes(letter)) return WIDE_LETTER_WEIGHT;
	if (SLIM_LETTERS.includes(letter)) return SLIM_LETTER_WEIGHT;
	return NORMAL_LETTER_WEIGHT;
}

// pdf.js reports one width per text item, not per glyph. borders[i] is where
// character i starts, the last entry where the item ends. Splitting the width
// evenly instead lands a single-character highlight on its neighbour.
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

/** Index of the glyph border closest to `x`. */
function nearestBorder(borders: number[], x: number): number {
	let nearest = 0;
	for (let i = 1; i < borders.length; i++) {
		if (Math.abs(borders[i] - x) < Math.abs(borders[nearest] - x)) {
			nearest = i;
		}
	}
	return nearest;
}

