import {describe, expect, test} from '@jest/globals';
import {loadPDFFile} from '../src/extractHighlight';
import {PDFAnnotation, PDFFile, PDFJsLib} from '../src/types';

// One text item, "Word," at x 71.5 spanning 31.787 units, as pdf.js reports it.
const textItems = [
  {str: 'Word,', transform: [12, 0, 0, 12, 71.50000108483317, 655.2499974579171], width: 31.78710370991189},
];

// Quad covering the whole word.
const wholeWord = [71.5, 663.974, 103.287, 663.974, 71.5, 653.558, 103.287, 653.558];

function pdfjsReturning(annotations: unknown[]): PDFJsLib {
  const page = {
    getAnnotations: () => Promise.resolve(annotations),
    getTextContent: () => Promise.resolve({items: textItems}),
  };
  const pdf = {
    numPages: 1,
    getPageLabels: () => Promise.resolve(null),
    getPage: () => Promise.resolve(page),
  };
  return {getDocument: () => ({promise: Promise.resolve(pdf)})} as unknown as PDFJsLib;
}

function annotation(over: Record<string, unknown>) {
  return {
    subtype: 'Text',
    rect: [0, 0, 10, 10],
    titleObj: {str: 'Mark'},
    contentsObj: {str: 'a comment'},
    ...over,
  };
}

const file = new PDFFile('Paper.pdf', new ArrayBuffer(0), 'pdf', 'refs/Paper.pdf');

async function extract(annotations: unknown[], desired = ['Text', 'Highlight']) {
  const total: PDFAnnotation[] = [];
  await loadPDFFile(file, pdfjsReturning(annotations), 'refs', total, desired);
  return total;
}

describe('loadPDFFile', () => {
  test('fills in the fields the templates use', async () => {
    const [anno] = await extract([annotation({})]);
    expect(anno.body).toBe('a comment');
    expect(anno.author).toBe('Mark');
    expect(anno.folder).toBe('refs');
    expect(anno.filepath).toBe('refs/Paper.pdf');
    expect(anno.file.basename).toBe('Paper');
    expect(anno.pageNumber).toBe(1);
    // no page labels in the document, so the page number stands in
    expect(anno.pageLabel).toBe('1');
  });

  test('keeps only the desired subtypes', async () => {
    const total = await extract(
      [annotation({}), annotation({subtype: 'Highlight', quadPoints: wholeWord})],
      ['Highlight']
    );
    expect(total.map((a) => a.subtype)).toEqual(['Highlight']);
  });

  test('extracts the text under a markup annotation', async () => {
    const [anno] = await extract([
      annotation({subtype: 'Highlight', quadPoints: wholeWord, contentsObj: {str: ''}}),
    ]);
    expect(anno.highlightedText).toBe('Word,');
    // kept even though it has no comment of its own
    expect(anno.body).toBe('');
  });

  test('does not extract text for a non-markup annotation', async () => {
    const [anno] = await extract([annotation({quadPoints: wholeWord})]);
    expect(anno.highlightedText).toBeUndefined();
  });

  test('skips an annotation with neither a comment nor marked up text', async () => {
    expect(await extract([annotation({contentsObj: {str: ''}})])).toEqual([]);
    expect(await extract([annotation({contentsObj: {str: '   \n  '}})])).toEqual([]);
  });

  test('skips a markup annotation whose quadPoints are unusable', async () => {
    expect(
      await extract([
        annotation({subtype: 'Highlight', quadPoints: null, contentsObj: {str: ''}}),
      ])
    ).toEqual([]);
  });

  test('keeps a markup annotation with no text under it but a comment on it', async () => {
    const [anno] = await extract([
      annotation({subtype: 'Highlight', quadPoints: null, contentsObj: {str: 'why?'}}),
    ]);
    expect(anno.body).toBe('why?');
    expect(anno.highlightedText).toBe('');
  });
});
