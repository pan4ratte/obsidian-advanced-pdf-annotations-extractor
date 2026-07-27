import {describe, expect, test} from '@jest/globals';
import {compareAnnotations} from '../src/ordering';
import {PDFAnnotationPluginSetting} from '../src/settings';
import {PDFAnnotation} from '../src/types';

const settings = (over: Partial<PDFAnnotationPluginSetting> = {}) => {
  const s = new PDFAnnotationPluginSetting();
  Object.assign(s, over);
  return s;
};

/** An annotation with only what the ordering reads from it. */
const annotation = (over: Partial<PDFAnnotation>): PDFAnnotation =>
  ({
    topic: '',
    folder: '',
    file: {name: 'A.pdf'},
    pageNumber: 1,
    rect: [0, 0, 0, 0],
    ...over,
  } as PDFAnnotation);

/** The topics in the order they come out in, which is what a note reads as. */
const topicsInOrder = (
  topics: string[],
  over: Partial<PDFAnnotationPluginSetting> = {}
) =>
  topics
    .map((topic) => annotation({topic}))
    .sort(compareAnnotations(settings({sortByTopic: true, ...over})))
    .map((a) => a.topic);

describe('ordering by topic', () => {
  test('Russian is read in the Russian alphabet, not in code points', () => {
    // `ё` is U+0451, past `я` — by code point it would come last of the three.
    expect(topicsInOrder(['яблоко', 'ёлка', 'апория']))
      .toEqual(['апория', 'ёлка', 'яблоко']);
  });

  test('`ё` sorts beside the `е` it is written from', () => {
    expect(topicsInOrder(['ёлка', 'елка'])).toEqual(['елка', 'ёлка']);
  });

  test('a capital does not sort a whole word above every small one', () => {
    expect(topicsInOrder(['Ясность', 'апория'])).toEqual(['апория', 'Ясность']);
    expect(topicsInOrder(['Zenith', 'apple'])).toEqual(['apple', 'Zenith']);
  });

  test('German umlauts sort with the letters they are written from', () => {
    // `Ü` is U+00DC, past `Z`, so by code point it would come last.
    expect(topicsInOrder(['Zeit', 'Über'])).toEqual(['Über', 'Zeit']);
  });

  test('numbers in a topic are read as numbers', () => {
    // The page a topic is numbered by, which text ordering puts in the wrong
    // order as soon as the numbers differ in length.
    expect(topicsInOrder(['1200 - Later', '452 - Earlier']))
      .toEqual(['452 - Earlier', '1200 - Later']);
  });

  test('the topic is left alone when nothing is grouped by it', () => {
    expect(topicsInOrder(['яблоко', 'апория'], {sortByTopic: false}))
      .toEqual(['яблоко', 'апория']);
  });
});

describe('ordering by everything else', () => {
  const sorted = (
    annotations: PDFAnnotation[],
    over: Partial<PDFAnnotationPluginSetting> = {}
  ) => [...annotations].sort(compareAnnotations(settings(over)));

  test('the day comes before every other grouping, undated last', () => {
    const [first, second, third] = sorted(
      [
        annotation({created: undefined, topic: 'a'}),
        annotation({created: '2024-03-01', topic: 'b'}),
        annotation({created: '2024-01-15', topic: 'a'}),
      ],
      {groupByDate: true, sortByTopic: true}
    );
    expect([first.created, second.created, third.created])
      .toEqual(['2024-01-15', '2024-03-01', undefined]);
  });

  test('the folder groups before the file when asked for', () => {
    const [first, second] = sorted(
      [
        annotation({folder: 'Ясность', file: {name: 'A.pdf'}} as never),
        annotation({folder: 'апория', file: {name: 'Z.pdf'}} as never),
      ],
      {groupByFolder: true}
    );
    expect([first.folder, second.folder]).toEqual(['апория', 'Ясность']);
  });

  test('within a file the page comes first and the page top after it', () => {
    const [first, second, third] = sorted([
      annotation({pageNumber: 2, rect: [0, 700, 0, 0]}),
      annotation({pageNumber: 1, rect: [0, 100, 0, 0]}),
      annotation({pageNumber: 1, rect: [0, 700, 0, 0]}),
    ]);
    expect([first.pageNumber, second.pageNumber, third.pageNumber])
      .toEqual([1, 1, 2]);
    // Down the page: the higher on it, the earlier.
    expect(first.rect[1]).toBe(700);
    expect(second.rect[1]).toBe(100);
  });

  test('files are ordered by name, numbers read as numbers', () => {
    const [first, second] = sorted([
      annotation({file: {name: 'Chapter 10.pdf'}} as never),
      annotation({file: {name: 'Chapter 2.pdf'}} as never),
    ]);
    expect([first.file.name, second.file.name])
      .toEqual(['Chapter 2.pdf', 'Chapter 10.pdf']);
  });
});
