import { PDFAnnotation } from "src/types";

/**
 * What an advanced extraction narrows its annotations down by: the pages the
 * reader named, and the days they ticked. Both are optional — an empty page
 * selection is every page, and no set of days is every day.
 */
export interface ExtractionFilter {
	pages: PageSelection;
	/** Match the pages against the author's labels rather than their position. */
	byPageLabel: boolean;
	/** Days to keep, as `created` spells them; null for every day. */
	days: Set<string> | null;
	/**
	 * Annotation subtypes to keep; null for every one that was read. Filtered
	 * here rather than while the PDF is being read, so ticking a type off is
	 * answered at once instead of by reading the whole file again.
	 */
	subtypes: Set<string> | null;
}

/**
 * Stands for an annotation the PDF gave no date, which is a key a day can never
 * be: `created` is `YYYY-MM-DD` whenever it is there at all.
 */
export const NO_DATE = "";

/** A range separator. Readers and PDFs spell one several ways. */
const RANGE_SEPARATOR = /[-–—]/;

const ARABIC = /^\d+$/;

/**
 * Roman numerals up to `mmmcmxcix`, in the subtractive spelling PDF page labels
 * use. Matches the empty string too, so callers check for that first.
 */
const ROMAN = /^m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

const ROMAN_DIGITS: Record<string, number> = {
	i: 1,
	v: 5,
	x: 10,
	l: 50,
	c: 100,
	d: 500,
	m: 1000,
};

/** The number a roman numeral spells, or null for anything that is not one. */
export function romanToArabic(token: string): number | null {
	const roman = token.toLowerCase();
	if (roman.length === 0 || !ROMAN.test(roman)) return null;

	let total = 0;
	for (let i = 0; i < roman.length; i++) {
		const digit = ROMAN_DIGITS[roman[i]];
		const next = ROMAN_DIGITS[roman[i + 1]] ?? 0;
		// A digit before a larger one is subtracted: the `iv` of `i-viii`.
		total += digit < next ? -digit : digit;
	}
	return total;
}

function arabicToNumber(token: string): number | null {
	if (!ARABIC.test(token)) return null;
	const page = Number(token);
	return Number.isSafeInteger(page) ? page : null;
}

/**
 * One entry of a page expression. Arabic and roman are kept apart rather than
 * both reduced to a number, because a PDF that labels its front matter `xxv`
 * and its body `25` means two different pages by them — which is the whole
 * reason page labels exist.
 */
type PageMatcher =
	| { kind: "arabic"; from: number; to: number }
	| { kind: "roman"; from: number; to: number }
	| { kind: "label"; label: string };

function readRange(
	start: string,
	end: string,
	read: (token: string) => number | null
): { from: number; to: number } | null {
	const from = read(start);
	const to = read(end);
	if (from === null || to === null) return null;
	// Typed the other way round is still a range, and the pages between it are
	// still what was meant.
	return { from: Math.min(from, to), to: Math.max(from, to) };
}

function readSinglePage(token: string): PageMatcher {
	const page = arabicToNumber(token);
	if (page !== null) return { kind: "arabic", from: page, to: page };

	const roman = romanToArabic(token);
	if (roman !== null) return { kind: "roman", from: roman, to: roman };

	// Neither, so it names a page label spelled some other way — `A` and `B` of
	// an appendix, say. It matches nothing unless the labels are being read.
	return { kind: "label", label: token };
}

function readToken(token: string): PageMatcher | null {
	const sides = token.split(RANGE_SEPARATOR).map((side) => side.trim());
	if (sides.length === 1) return readSinglePage(token);
	// A half-written range: `25-` is a reader mid-thought, not a page label.
	if (sides.length !== 2 || !sides[0] || !sides[1]) return null;

	const [start, end] = sides;
	const numbers = readRange(start, end, arabicToNumber);
	if (numbers) return { kind: "arabic", ...numbers };

	const romans = readRange(start, end, romanToArabic);
	if (romans) return { kind: "roman", ...romans };

	// The dash belongs to the label rather than separating two of them: `A-1`
	// is a page label a real PDF uses.
	return { kind: "label", label: token };
}

function matchesPageNumber(matcher: PageMatcher, pageNumber: number): boolean {
	// A physical page is a position and nothing else, so a roman numeral means
	// the number it spells and a label of letters names no position at all.
	if (matcher.kind === "label") return false;
	return matcher.from <= pageNumber && pageNumber <= matcher.to;
}

function matchesPageLabel(matcher: PageMatcher, pageLabel: string): boolean {
	const label = pageLabel.trim();
	if (matcher.kind === "label") {
		return label.toLowerCase() === matcher.label.toLowerCase();
	}

	const value =
		matcher.kind === "arabic"
			? arabicToNumber(label)
			: romanToArabic(label);
	return value !== null && matcher.from <= value && value <= matcher.to;
}

/**
 * The pages an expression like `25-50, 55, 88` or `i-viii` names. Held as the
 * entries it was written from rather than as a list of pages, so a range over
 * page labels stays a range: which pages it covers is only known once there is
 * a PDF to ask.
 */
export class PageSelection {
	private constructor(private readonly matchers: PageMatcher[]) {}

	/**
	 * Reads a page expression. Entries it could not read are handed back rather
	 * than dropped, so the reader can be told which part of what they typed is
	 * being ignored instead of quietly extracting the wrong pages.
	 */
	static parse(expression: string): {
		selection: PageSelection;
		invalid: string[];
	} {
		const matchers: PageMatcher[] = [];
		const invalid: string[] = [];

		for (const entry of expression.split(",")) {
			const token = entry.trim();
			// A trailing comma, typed on the way to the next page.
			if (!token) continue;

			const matcher = readToken(token);
			if (matcher) {
				matchers.push(matcher);
			} else {
				invalid.push(token);
			}
		}

		return { selection: new PageSelection(matchers), invalid };
	}

	/** Nothing was named, which is every page rather than none of them. */
	get isEmpty(): boolean {
		return this.matchers.length === 0;
	}

	matches(pageNumber: number, pageLabel: string, byLabel: boolean): boolean {
		if (this.isEmpty) return true;
		return this.matchers.some((matcher) =>
			byLabel
				? matchesPageLabel(matcher, pageLabel)
				: matchesPageNumber(matcher, pageNumber)
		);
	}
}

/**
 * Every day the annotations were made on, earliest first, with the undated ones
 * last — the order the list of dates is offered in, and the same order grouping
 * by date writes them in.
 */
export function daysOfAnnotations(annotations: PDFAnnotation[]): string[] {
	const days = new Set(
		annotations.map((annotation) => annotation.created ?? NO_DATE)
	);
	const dated = [...days].filter((day) => day !== NO_DATE).sort();
	return days.has(NO_DATE) ? [...dated, NO_DATE] : dated;
}

/**
 * The annotations the filter keeps.
 *
 * Copied one by one, because sorting and naming a note both take the topic out
 * of the annotation's body: the extraction they were filtered from is kept
 * whole, so extracting a second time from the same modal reads the same
 * annotations the first one did.
 */
export function filterAnnotations(
	annotations: PDFAnnotation[],
	filter: ExtractionFilter
): PDFAnnotation[] {
	return annotations
		.filter(
			(annotation) =>
				(filter.subtypes === null ||
					filter.subtypes.has(annotation.subtype)) &&
				filter.pages.matches(
					annotation.pageNumber,
					annotation.pageLabel,
					filter.byPageLabel
				) &&
				(filter.days === null ||
					filter.days.has(annotation.created ?? NO_DATE))
		)
		.map((annotation) => ({ ...annotation }));
}
