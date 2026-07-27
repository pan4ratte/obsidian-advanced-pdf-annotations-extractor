import {describe, expect, test} from '@jest/globals';
import {PDFAnnotationPluginFormatter} from '../src/formatter';
import {PDFAnnotationPluginSetting} from '../src/settings';
import {PDFAnnotation} from '../src/types';

function annotation(over: Partial<PDFAnnotation> = {}): PDFAnnotation {
  return {
    subtype: 'Text',
    rect: [0, 0, 10, 10],
    titleObj: {str: 'Mark'},
    contentsObj: {str: 'a comment'},
    folder: 'refs',
    file: {name: 'Paper.pdf', basename: 'Paper', path: 'refs/Paper.pdf'},
    filepath: 'refs/Paper.pdf',
    pageNumber: 4,
    pageLabel: 'iv',
    author: 'Mark',
    body: 'a comment',
    ...over,
  };
}

function formatterWith(template: string) {
  const settings = new PDFAnnotationPluginSetting();
  settings.useStructuringHeadlines = false;
  settings.noteTemplate = template;
  settings.highlightTemplate = `HIGHLIGHT ${template}`;
  return new PDFAnnotationPluginFormatter(settings);
}

describe('template variables', () => {
  test('every documented shortcut resolves to a value, not [object Object]', () => {
    const formatter = formatterWith(
      '{{filename}}|{{filepath}}|{{folder}}|{{author}}|{{body}}|{{topic}}|{{pageNumber}}|{{pageLabel}}'
    );
    const out = formatter.format([annotation({topic: 'Method'})], false);
    expect(out).toBe('Paper|refs/Paper.pdf|refs|Mark|a comment|Method|4|iv');
    expect(out).not.toContain('[object Object]');
  });

  test('filename is the PDF name without its extension', () => {
    const formatter = formatterWith('{{filename}}');
    expect(formatter.format([annotation()], false)).toBe('Paper');
  });

  test('topic renders empty when not sorting by topic', () => {
    const formatter = formatterWith('[{{topic}}]');
    expect(formatter.format([annotation({topic: undefined})], false)).toBe('[]');
  });

  test('the whole annotation stays reachable for fields without a shortcut', () => {
    const formatter = formatterWith('{{annotation.subtype}}/{{annotation.file.name}}');
    expect(formatter.format([annotation()], false)).toBe('Text/Paper.pdf');
  });

  test('highlighted text uses the highlight template, comments the note template', () => {
    const formatter = formatterWith('{{body}}');
    expect(formatter.format([annotation()], false)).toBe('a comment');
    expect(
      formatter.format([annotation({subtype: 'StrikeOut', highlightedText: 'gone'})], false)
    ).toBe('HIGHLIGHT a comment');
  });

  test('reports when there is nothing to render', () => {
    expect(formatterWith('{{body}}').format([], false)).toBe('*No annotations*');
  });
});

describe('filelink', () => {
  test('is a wiki link for a PDF in the vault, the plain path for one outside', () => {
    const formatter = formatterWith('{{filelink}}');
    expect(formatter.format([annotation()], false)).toBe('[[refs/Paper.pdf]]');
    expect(
      formatter.format([annotation({filepath: 'file://C:/Books/Paper.pdf'})], true)
    ).toBe('file://C:/Books/Paper.pdf');
  });

  test('isExternal lets one template still word the two cases differently', () => {
    const formatter = formatterWith('{{#if isExternal}}outside{{else}}inside{{/if}}');
    expect(formatter.format([annotation()], false)).toBe('inside');
    expect(formatter.format([annotation()], true)).toBe('outside');
  });

  test('the defaults link the PDF both ways without being edited', () => {
    const settings = new PDFAnnotationPluginSetting();
    settings.useStructuringHeadlines = false;
    const formatter = new PDFAnnotationPluginFormatter(settings);
    expect(formatter.format([annotation()], false)).toContain('[[refs/Paper.pdf]]');
    expect(formatter.format([annotation()], true)).toContain(' on refs/Paper.pdf');
  });
});
