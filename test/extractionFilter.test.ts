import {describe, expect, test} from '@jest/globals';
import {
	colorsOfAnnotations,
	daysOfAnnotations,
	filterAnnotations,
	NO_COLOR,
	NO_DATE,
	PageSelection,
	romanToArabic,
} from '../src/extractionFilter';
import {PDFAnnotation} from '../src/types';

/** Only the fields the filter reads. */
function annotation(
	pageNumber: number,
	pageLabel: string,
	created?: string,
	subtype = 'Highlight',
	colorHex?: string
): PDFAnnotation {
	return {
		subtype,
		rect: [],
		contentsObj: {str: ''},
		titleObj: {str: ''},
		folder: '',
		file: {name: 'a.pdf', basename: 'a', path: 'a.pdf'},
		filepath: 'a.pdf',
		pageNumber,
		pageLabel,
		author: '',
		body: 'body',
		created,
		colorHex,
	};
}

/** Which of the given pages the expression selects, by physical page. */
function pagesSelected(
	expression: string,
	pages: number[],
	byLabel = false,
	labels: string[] = []
): number[] {
	const {selection} = PageSelection.parse(expression);
	return pages.filter((page, index) =>
		selection.matches(page, labels[index] ?? String(page), byLabel)
	);
}

describe('romanToArabic', () => {
	test.each([
		['i', 1],
		['iv', 4],
		['viii', 8],
		['xxv', 25],
		['XLII', 42],
		['mcmxciv', 1994],
	])('reads %s as %i', (roman, expected) => {
		expect(romanToArabic(roman)).toBe(expected);
	});

	test.each(['', '25', 'iiii', 'vv', 'ix i', 'appendix'])(
		'does not read %p as a numeral',
		(token) => {
			expect(romanToArabic(token)).toBeNull();
		}
	);
});

describe('PageSelection.parse', () => {
	test('an empty expression selects every page', () => {
		const {selection, invalid} = PageSelection.parse('   ');
		expect(selection.isEmpty).toBe(true);
		expect(invalid).toEqual([]);
		expect(selection.matches(7, '7', false)).toBe(true);
	});

	test('reads a range', () => {
		expect(pagesSelected('25-50', [24, 25, 40, 50, 51])).toEqual([
			25, 40, 50,
		]);
	});

	test('reads single pages', () => {
		expect(pagesSelected('25, 26, 30', [24, 25, 26, 27, 30])).toEqual([
			25, 26, 30,
		]);
	});

	test('reads ranges and single pages together', () => {
		expect(
			pagesSelected('25-50, 55, 88', [24, 25, 50, 54, 55, 87, 88])
		).toEqual([25, 50, 55, 88]);
	});

	test('a range typed backwards still covers the pages between', () => {
		expect(pagesSelected('50-25', [24, 25, 50, 51])).toEqual([25, 50]);
	});

	test('an en dash separates a range as well as a hyphen', () => {
		expect(pagesSelected('25–27', [24, 25, 26, 27, 28])).toEqual([
			25, 26, 27,
		]);
	});

	test('a trailing comma is not an entry', () => {
		const {selection, invalid} = PageSelection.parse('25, ');
		expect(invalid).toEqual([]);
		expect(selection.matches(25, '25', false)).toBe(true);
	});

	test('a half-written range is handed back rather than read', () => {
		const {invalid} = PageSelection.parse('25-, 30');
		expect(invalid).toEqual(['25-']);
	});

	test('a roman range means the pages it spells, physically', () => {
		expect(pagesSelected('i-viii', [1, 8, 9])).toEqual([1, 8]);
	});
});

describe('PageSelection over page labels', () => {
	const labels = ['i', 'iv', 'viii', 'ix', '1', '25', 'A-1'];
	const pages = [1, 2, 3, 4, 5, 6, 7];

	function labelled(expression: string): string[] {
		const {selection} = PageSelection.parse(expression);
		return labels.filter((label, index) =>
			selection.matches(pages[index], label, true)
		);
	}

	test('a roman range matches the labels it covers', () => {
		expect(labelled('i-viii')).toEqual(['i', 'iv', 'viii']);
	});

	test('an arabic range does not match roman labels', () => {
		expect(labelled('1-8')).toEqual(['1']);
	});

	test('a roman range does not match arabic labels', () => {
		expect(labelled('xxiv-xxvi')).toEqual([]);
	});

	test('a label with a dash in it is matched whole', () => {
		expect(labelled('A-1')).toEqual(['A-1']);
	});

	test('a single roman numeral matches only its own label', () => {
		expect(labelled('iv')).toEqual(['iv']);
	});

	test('a single label of letters matches only itself', () => {
		expect(labelled('A-1, ix')).toEqual(['ix', 'A-1']);
	});

	test('a label that is neither a number nor a numeral is still a label', () => {
		const {selection, invalid} = PageSelection.parse('cover');
		expect(invalid).toEqual([]);
		expect(selection.matches(1, 'Cover', true)).toBe(true);
		expect(selection.matches(1, 'i', true)).toBe(false);
		// Physical pages have no labels for it to name.
		expect(selection.matches(1, 'Cover', false)).toBe(false);
	});

	test('labels are matched whatever their case', () => {
		expect(labelled('a-1')).toEqual(['A-1']);
	});

	test('the physical pages of the same PDF read differently', () => {
		expect(pagesSelected('1-8', pages, true, labels)).toEqual([5]);
	});
});

describe('daysOfAnnotations', () => {
	test('lists each day once, earliest first, undated last', () => {
		const annotations = [
			annotation(2, '2', '2024-03-02'),
			annotation(1, '1'),
			annotation(3, '3', '2024-01-15'),
			annotation(4, '4', '2024-03-02'),
		];
		expect(daysOfAnnotations(annotations)).toEqual([
			'2024-01-15',
			'2024-03-02',
			NO_DATE,
		]);
	});
});

describe('colorsOfAnnotations', () => {
	test('lists each colour once, first met first, colourless last', () => {
		const annotations = [
			annotation(1, '1', undefined, 'Highlight', '#ffd400'),
			annotation(2, '2', undefined, 'Text'),
			annotation(3, '3', undefined, 'Highlight', '#2ea8e5'),
			annotation(4, '4', undefined, 'Highlight', '#ffd400'),
		];
		expect(colorsOfAnnotations(annotations)).toEqual([
			'#ffd400',
			'#2ea8e5',
			NO_COLOR,
		]);
	});
});

describe('filterAnnotations', () => {
	const annotations = [
		annotation(1, 'i', '2024-01-15', 'Highlight', '#ffd400'),
		annotation(25, '25', '2024-03-02', 'Highlight', '#2ea8e5'),
		annotation(88, '88', undefined, 'Text'),
	];
	const everyPage = PageSelection.parse('').selection;
	/** Everything the filter can be asked to leave alone. */
	const everything = {
		pages: everyPage,
		byPageLabel: false,
		days: null,
		colors: null,
		subtypes: null,
	};

	test('keeps the pages the selection names', () => {
		const kept = filterAnnotations(annotations, {
			...everything,
			pages: PageSelection.parse('25, 88').selection,
		});
		expect(kept.map((a) => a.pageNumber)).toEqual([25, 88]);
	});

	test('keeps only the days that were ticked', () => {
		const kept = filterAnnotations(annotations, {
			...everything,
			days: new Set(['2024-01-15', NO_DATE]),
		});
		expect(kept.map((a) => a.pageNumber)).toEqual([1, 88]);
	});

	test('keeps only the annotation types that were ticked', () => {
		const kept = filterAnnotations(annotations, {
			...everything,
			subtypes: new Set(['Text']),
		});
		expect(kept.map((a) => a.pageNumber)).toEqual([88]);
	});

	test('keeps only the colours that were ticked', () => {
		const kept = filterAnnotations(annotations, {
			...everything,
			colors: new Set(['#ffd400', NO_COLOR]),
		});
		expect(kept.map((a) => a.pageNumber)).toEqual([1, 88]);
	});

	test('pages and days both have to match', () => {
		const kept = filterAnnotations(annotations, {
			...everything,
			pages: PageSelection.parse('1-30').selection,
			days: new Set(['2024-03-02']),
		});
		expect(kept.map((a) => a.pageNumber)).toEqual([25]);
	});

	test('leaves the annotations it filtered untouched', () => {
		const kept = filterAnnotations(annotations, everything);
		// Sorting and naming a note both take the topic out of the body, so a
		// second extraction from the same reading has to start from the same
		// annotations the first one did.
		kept[0].body = 'rewritten';
		expect(annotations[0].body).toBe('body');
	});
});
