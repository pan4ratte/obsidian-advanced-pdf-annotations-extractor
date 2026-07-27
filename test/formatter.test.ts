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
  settings.topicHeading = false;
  settings.fileHeading = 'none';
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

describe('headings', () => {
  const OTHER = {name: 'Other.pdf', basename: 'Other', path: 'refs/Other.pdf'};

  function format(over: Partial<PDFAnnotationPluginSetting>, annotations: PDFAnnotation[]) {
    const settings = new PDFAnnotationPluginSetting();
    settings.noteTemplate = '-\n';
    Object.assign(settings, over);
    return new PDFAnnotationPluginFormatter(settings).format(annotations, false);
  }

  function headingsFor(over: Partial<PDFAnnotationPluginSetting> = {}) {
    return format(over, [
      annotation({topic: 'Method'}),
      annotation({topic: 'Method', folder: 'refs', file: OTHER}),
    ]);
  }

  test('the folder name collapses every PDF in it under one heading', () => {
    expect(headingsFor({fileHeading: 'folder'})).toBe('# refs\n\n## Method\n\n-\n-\n');
  });

  test('a PDF in the vault root is headed as such, not with an empty heading', () => {
    expect(format({fileHeading: 'folder'}, [annotation({folder: '', topic: 'A'})]))
      .toBe('# Vault root\n\n## A\n\n-\n');
  });

  test('the file name gives each PDF its own heading, extension included', () => {
    expect(headingsFor({fileHeading: 'file'})).toBe(
      '# Method\n\n## Paper.pdf\n\n-\n## Other.pdf\n\n-\n'
    );
  });

  test('no heading leaves the topic heading standing on its own', () => {
    expect(headingsFor({fileHeading: 'none'})).toBe('# Method\n\n-\n-\n');
  });

  test('a file heading with no topic heading around it takes the first level', () => {
    expect(headingsFor({topicHeading: false, fileHeading: 'file'})).toBe(
      '# Paper.pdf\n\n-\n# Other.pdf\n\n-\n'
    );
  });

  test('turning both off leaves nothing but the templates', () => {
    expect(headingsFor({topicHeading: false, fileHeading: 'none'})).toBe('-\n-\n');
  });

  test('a file heading that never changes is written once, not under every topic', () => {
    // Every annotation is its own topic as soon as the comments differ, which
    // used to put a heading saying 'refs' above every one of them.
    expect(
      format({fileHeading: 'folder'}, [
        annotation({topic: 'A'}),
        annotation({topic: 'B'}),
        annotation({topic: 'C', file: OTHER}),
      ])
    ).toBe('# refs\n\n## A\n\n-\n## B\n\n-\n## C\n\n-\n');
  });

  test('a file heading that varies still opens each topic, one level down', () => {
    // Here it says which of the two the topic is reading from, so each topic
    // gets its own copy, nested under the topic rather than over it.
    expect(
      format({fileHeading: 'file'}, [
        annotation({topic: 'A'}),
        annotation({topic: 'A', file: OTHER}),
        annotation({topic: 'B'}),
      ])
    ).toBe('# A\n\n## Paper.pdf\n\n-\n## Other.pdf\n\n-\n# B\n\n## Paper.pdf\n\n-\n');
  });

  test('without topic headings a file heading only marks where the file changes', () => {
    expect(
      format({topicHeading: false, fileHeading: 'file'}, [
        annotation({topic: 'A'}),
        annotation({topic: 'B'}),
        annotation({topic: 'C', file: OTHER}),
      ])
    ).toBe('# Paper.pdf\n\n-\n-\n# Other.pdf\n\n-\n');
  });

  test('no topic heading is written when there is no topic to write', () => {
    expect(headingsFor({sortByTopic: false, fileHeading: 'none'})).toBe('-\n-\n');
    expect(headingsFor({sortByTopic: false, fileHeading: 'folder'})).toBe('# refs\n\n-\n-\n');
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
    settings.topicHeading = false;
  settings.fileHeading = 'none';
    const formatter = new PDFAnnotationPluginFormatter(settings);
    expect(formatter.format([annotation()], false)).toContain('[[refs/Paper.pdf]]');
    expect(formatter.format([annotation()], true)).toContain(' on refs/Paper.pdf');
  });
});
