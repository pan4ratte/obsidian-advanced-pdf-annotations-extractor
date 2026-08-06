import {describe, expect, test, jest, beforeEach} from '@jest/globals';
import {
  extractHighlight,
  pdfDateToDay,
  pdfDateToTime,
} from '../src/extractHighlight';

jest.mock('src/settings', () => {
  return {
    ANNOTS_TREATED_AS_HIGHLIGHTS: ['Highlight', 'Underline', 'Squiggly'],
  };
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('pdfDateToDay', () => {
  test('reads the day out of a full PDF date string', () => {
    expect(pdfDateToDay("D:20240115143000+01'00'")).toBe('2024-01-15');
    expect(pdfDateToDay('D:20240115143000Z')).toBe('2024-01-15');
  });

  test('the zone is ignored rather than moving the annotation a day', () => {
    // Same instant, two zones: both belong to the day the reader's PDF says.
    expect(pdfDateToDay("D:20240115233000+05'00'")).toBe('2024-01-15');
    expect(pdfDateToDay("D:20240115013000-05'00'")).toBe('2024-01-15');
  });

  test('accepts the parts the spec leaves optional', () => {
    expect(pdfDateToDay('D:2024')).toBe('2024-01-01');
    expect(pdfDateToDay('D:202403')).toBe('2024-03-01');
    expect(pdfDateToDay('D:20240307')).toBe('2024-03-07');
  });

  test('accepts a date written without the D: prefix', () => {
    expect(pdfDateToDay('20240115143000')).toBe('2024-01-15');
  });

  test('gives no day for a missing date, so it stays tellable from a real one', () => {
    expect(pdfDateToDay(null)).toBeUndefined();
    expect(pdfDateToDay(undefined)).toBeUndefined();
    expect(pdfDateToDay('')).toBeUndefined();
  });

  test('gives no day for a date that cannot be read', () => {
    expect(pdfDateToDay('yesterday')).toBeUndefined();
    expect(pdfDateToDay('D:20241315')).toBeUndefined();
    expect(pdfDateToDay('D:20240100')).toBeUndefined();
    expect(pdfDateToDay('D:20240132')).toBeUndefined();
  });
});

describe('pdfDateToTime', () => {
  test('reads the time out of a full PDF date string', () => {
    expect(pdfDateToTime("D:20240115143000+01'00'")).toBe('14:30');
    expect(pdfDateToTime('D:20240115143000Z')).toBe('14:30');
    expect(pdfDateToTime('20240115143000')).toBe('14:30');
  });

  test('the zone is ignored, so the time is the one the writer saw', () => {
    // Same instant in two zones, each reading as its own writer's clock.
    expect(pdfDateToTime("D:20240115233000+05'00'")).toBe('23:30');
    expect(pdfDateToTime("D:20240115013000-05'00'")).toBe('01:30');
  });

  test('minutes are optional, seconds are not read', () => {
    expect(pdfDateToTime('D:2024011514')).toBe('14:00');
    expect(pdfDateToTime('D:20240115143059')).toBe('14:30');
  });

  test('gives no time when the date carries none', () => {
    expect(pdfDateToTime('D:2024')).toBeUndefined();
    expect(pdfDateToTime('D:202403')).toBeUndefined();
    expect(pdfDateToTime('D:20240307')).toBeUndefined();
  });

  test('gives no time for a missing or unreadable date', () => {
    expect(pdfDateToTime(null)).toBeUndefined();
    expect(pdfDateToTime(undefined)).toBeUndefined();
    expect(pdfDateToTime('')).toBeUndefined();
    expect(pdfDateToTime('this afternoon')).toBeUndefined();
    expect(pdfDateToTime('D:2024011525')).toBeUndefined();
    expect(pdfDateToTime('D:202401151460')).toBeUndefined();
  });
});

describe('extractHighlight - simple text', () => {
	const items = [
		{ str: 'diese', transform: [12.000000267999969, 0, 0, 12.000000267999969, 71.50000108483317, 715.2499987979169], width: 28.68748864068716 },
		{ str: '(S. 1)', transform: [12.000000267999969, 0, 0, 12.000000267999969, 52.00000064933322, 685.2499981279169], width: 29.33788865521276 },
		{ str: 'Word,', transform: [12.000000267999969, 0, 0, 12.000000267999969, 71.50000108483317, 655.2499974579171], width: 31.78710370991189 },
		{ str: '(S. 1)', transform: [12.000000267999969, 0, 0, 12.000000267999969, 52.00000064933322, 625.2499967879171], width: 29.33788865521276 },
		{ str: 'Lesen', transform: [12.000000267999969, 0, 0, 12.000000267999969, 71.50000108483317, 595.2499961179171], width: 32.69529673019486 },
		{ str: '(S. 1)', transform: [12.000000267999969, 0, 0, 12.000000267999969, 52.00000064933322, 565.2499954479173], width: 29.33788865521276 },
	];
	test('should extract the trailing part of a partly highlighted item', () => {
    const annot = {
      quadPoints: [70.636, 634.118, 81.304, 634.118, 70.636, 622.742, 81.304, 622.742],
    };
		const result = extractHighlight(annot, items);
		expect(result).toBe('1)');
	});
  test('should extract a fully highlighted word', () => {
    const annot = {
      quadPoints: [71.5, 603.974, 104.188, 603.974, 71.5, 595.118, 104.188, 595.118],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('Lesen');
  });
  test('should extract a fully highlighted item containing spaces', () => {
    const annot = {
      quadPoints: [52, 694.118, 81.304, 694.118, 52, 682.742, 81.304, 682.742],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('(S. 1)');
  });

  test('should extract highlighted text over multiple lines', () => {
    const annot = {
      quadPoints: [93.508, 723.974, 100.180, 723.974, 93.508, 715.118, 100.180, 715.118, 52.000, 694.118, 63.988, 694.118, 52.000, 682.742, 63.988, 682.742],
      
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('e (S');
  });

  test('should extract the highlighted wide letter W', () => {
    const annot = {
      quadPoints: [71.5, 663.974, 82.816, 663.974, 71.5, 653.558, 82.816, 653.558],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('W');
  });

  test('should extract the highlighted letter o', () => {
    const annot = {
      quadPoints: [82.609, 663.974, 89.281, 663.974, 82.609, 653.558, 89.281, 653.558],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('o');
  });
  
  test('should extract the highlighted slim letter r', () => {
    const annot = {
      quadPoints: [89.281, 663.974, 93.445, 663.974, 89.281, 653.558, 93.445, 653.558],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('r');
  });

  
  test('should extract the highlighted letter d', () => {
    const annot = {
      quadPoints: [93.277, 663.974, 99.949, 663.974, 93.277, 653.558, 99.949, 653.558],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('d');
  });

  
  test('should extract the highlighted trailing comma', () => {
    const annot = {
      quadPoints: [99.949, 663.974, 103.273, 663.974, 99.949, 653.558, 103.273, 653.558],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe(',');
  });

  test('should extract underlined word', () => {
    const annot = {
      quadPoints: [71.5, 603.974, 104.188, 603.974, 71.5, 594.118, 104.188, 594.118],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('Lesen');
  });

  test('should extract underlined letter', () => {
    const annot = {
      quadPoints: [55.996, 634.118, 63.988, 634.118, 55.996, 621.742, 63.988, 621.742],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('S');
  });

  test('should extract swiggled letter', () => {
    const annot = {
      quadPoints: [71.5, 663.974, 82.816, 663.974, 71.5, 652.558, 82.816, 652.558],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('W');
  });

  test('should extract squiggled word', () => {
    const annot = {
      quadPoints: [71.5, 723.974, 87.508, 723.974, 71.5, 714.118, 87.508, 714.118],
    };
    const result = extractHighlight(annot, items);
    expect(result).toBe('die');
  });
});
describe('extractHighlight - the order the quads arrive in', () => {
  // Three lines of a page, 20 units apart. PDF y grows upwards, so the first
  // of them is the highest number.
  const items = [
    {str: 'first line', transform: [12, 0, 0, 12, 70, 700], width: 55},
    {str: 'second line', transform: [12, 0, 0, 12, 70, 680], width: 60},
    {str: 'third line', transform: [12, 0, 0, 12, 70, 660], width: 55},
  ];

  /** One quad, corner by corner: tL, tR, bL, bR. */
  const quad = (x1: number, x2: number, top: number, bottom: number) =>
    [x1, top, x2, top, x1, bottom, x2, bottom];

  const one = quad(70, 125, 706, 698);
  const two = quad(70, 130, 686, 678);
  const three = quad(70, 125, 666, 658);

  test('reads the lines down the page when the quads already are', () => {
    expect(extractHighlight({quadPoints: [...one, ...two, ...three]}, items))
      .toBe('first line second line third line');
  });

  test('reads them down the page when the quads run bottom to top', () => {
    // What some writers produce for a highlight dragged upwards. Read in the
    // order given, this used to come out with the lines reversed.
    expect(extractHighlight({quadPoints: [...three, ...two, ...one]}, items))
      .toBe('first line second line third line');
  });

  test('reads them down the page when the quads are in no order at all', () => {
    expect(extractHighlight({quadPoints: [...two, ...three, ...one]}, items))
      .toBe('first line second line third line');
  });

  test('a quad drawn from its right edge covers the same text', () => {
    // tR, tL, bR, bL — the same rectangle as `one`, corners the other way.
    const backwards = [125, 706, 70, 706, 125, 698, 70, 698];
    expect(extractHighlight({quadPoints: backwards}, items)).toBe('first line');
  });

  test('two quads on one line are read left to right, whichever came first', () => {
    const left = quad(70, 95, 706, 698);
    const right = quad(95, 125, 706, 698);
    expect(extractHighlight({quadPoints: [...right, ...left]}, items))
      .toBe(extractHighlight({quadPoints: [...left, ...right]}, items));
  });
});

describe('extractHighlight - the line index', () => {
  /** One quad, corner by corner: tL, tR, bL, bR. */
  const quad = (x1: number, x2: number, top: number, bottom: number) =>
    [x1, top, x2, top, x1, bottom, x2, bottom];

  // Three lines of a page, sorted down it, as loadPage hands them over.
  const items = [
    {str: 'first line', transform: [12, 0, 0, 12, 70, 700], width: 55},
    {str: 'second line', transform: [12, 0, 0, 12, 70, 680], width: 60},
    {str: 'third line', transform: [12, 0, 0, 12, 70, 660], width: 55},
  ];
  /** What loadPage passes beside them: each baseline, in the items' order. */
  const tops = new Float64Array(items.map((item) => item.transform[5]));

  test('reads the lines a quad covers', () => {
    expect(extractHighlight({quadPoints: quad(70, 130, 686, 678)}, items, tops))
      .toBe('second line');
    expect(
      extractHighlight(
        {quadPoints: [...quad(70, 125, 706, 698), ...quad(70, 130, 686, 678)]},
        items,
        tops
      )
    ).toBe('first line second line');
  });

  // The index only narrows which items are looked at, so every quad has to
  // read exactly what walking the whole page reads — including the ones
  // falling off either end of it, where the search runs out of items.
  test('reads what walking every item of the page reads', () => {
    const cases = [
      quad(70, 125, 706, 698), // the first line alone
      quad(70, 130, 686, 678), // one in the middle
      quad(70, 125, 666, 658), // the last line alone
      quad(70, 130, 706, 658), // one quad over all three
      quad(70, 130, 706, 678), // the top two
      quad(70, 130, 686, 658), // the bottom two
      quad(70, 130, 640, 620), // below every line
      quad(70, 130, 760, 740), // above every line
      quad(70, 130, 700, 700), // no height at all, on a baseline
      [...quad(70, 125, 666, 658), ...quad(70, 125, 706, 698)], // bottom first
    ];
    for (const quadPoints of cases) {
      expect(extractHighlight({quadPoints}, items, tops))
        .toBe(extractHighlight({quadPoints}, items));
    }
  });

  test('reads a whole line split across several items', () => {
    // What a page really looks like: one line written as a run of items, and
    // another below it that the quad must not reach.
    const split = [
      {str: 'alpha ', transform: [12, 0, 0, 12, 70, 700], width: 30},
      {str: 'beta ', transform: [12, 0, 0, 12, 100, 700], width: 25},
      {str: 'gamma', transform: [12, 0, 0, 12, 125, 700], width: 30},
      {str: 'below', transform: [12, 0, 0, 12, 70, 680], width: 30},
    ];
    const baselines = new Float64Array(split.map((item) => item.transform[5]));
    const covering = {quadPoints: quad(70, 155, 706, 698)};
    expect(extractHighlight(covering, split, baselines)).toBe('alpha beta gamma');
    expect(extractHighlight(covering, split, baselines))
      .toBe(extractHighlight(covering, split));
  });
});

describe('extractHighlight - malformed annotations', () => {
  test('returns no text when pdf.js reports no usable quadPoints', () => {
    expect(extractHighlight({quadPoints: null}, [])).toBe('');
    expect(extractHighlight({}, [])).toBe('');
  });
});
