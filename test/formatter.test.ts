import {describe, expect, test} from '@jest/globals';
import {t} from '../lang/helpers';
import {PDFAnnotationPluginFormatter} from '../src/formatter';
import {PDFAnnotationPluginSetting, SUPPORTED_ANNOTS} from '../src/settings';
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
  settings.defaultTemplate = template;
  settings.annotationTemplates = {
    ...settings.annotationTemplates,
    Highlight: `HIGHLIGHT ${template}`,
    Underline: '',
    Squiggly: '',
    StrikeOut: '',
  };
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

  test('a type with a template of its own is written with it', () => {
    const formatter = formatterWith('{{body}}');
    expect(
      formatter.format([annotation({subtype: 'Highlight', highlightedText: 'marked'})], false)
    ).toBe('HIGHLIGHT a comment');
  });

  test('a type without one is written with the default', () => {
    const formatter = formatterWith('{{body}}');
    expect(formatter.format([annotation()], false)).toBe('a comment');
    // Blanked above, so it falls back however it used to be written.
    expect(
      formatter.format([annotation({subtype: 'StrikeOut', highlightedText: 'gone'})], false)
    ).toBe('a comment');
  });

  test('the annotation type is a variable of its own', () => {
    const formatter = formatterWith('{{type}}');
    expect(formatter.format([annotation({subtype: 'FreeText'})], false))
      .toBe('FreeText');
  });

  test('reports when there is nothing to render', () => {
    expect(formatterWith('{{body}}').format([], false))
      .toBe(t.NOTE_NO_ANNOTATIONS);
  });
});

describe('headings', () => {
  const OTHER = {name: 'Other.pdf', basename: 'Other', path: 'refs/Other.pdf'};

  function format(over: Partial<PDFAnnotationPluginSetting>, annotations: PDFAnnotation[]) {
    const settings = new PDFAnnotationPluginSetting();
    settings.defaultTemplate = '-\n';
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

  test('the date heads the note above the topics it groups', () => {
    expect(
      format({groupByDate: true, fileHeading: 'none'}, [
        annotation({topic: 'A', created: '2024-01-15'}),
        annotation({topic: 'B', created: '2024-01-15'}),
        annotation({topic: 'C', created: '2024-03-02'}),
      ])
    ).toBe('# 2024-01-15\n\n## A\n\n-\n## B\n\n-\n# 2024-03-02\n\n## C\n\n-\n');
  });

  test('an annotation the PDF gave no date is headed as such', () => {
    expect(
      format({groupByDate: true, sortByTopic: false, fileHeading: 'none'}, [
        annotation({created: '2024-01-15'}),
        annotation({created: undefined}),
      ])
    ).toBe('# 2024-01-15\n\n-\n# No date\n\n-\n');
  });

  test('all three headings nest, outermost first', () => {
    expect(
      format({groupByDate: true, fileHeading: 'file'}, [
        annotation({topic: 'A', created: '2024-01-15'}),
        annotation({topic: 'A', created: '2024-01-15', file: OTHER}),
        annotation({topic: 'B', created: '2024-03-02'}),
      ])
    ).toBe(
      '# 2024-01-15\n\n## A\n\n### Paper.pdf\n\n-\n### Other.pdf\n\n-\n' +
        '# 2024-03-02\n\n## B\n\n### Paper.pdf\n\n-\n'
    );
  });

  test('a constant file heading still heads the note, above the dates', () => {
    expect(
      format({groupByDate: true, fileHeading: 'folder'}, [
        annotation({topic: 'A', created: '2024-01-15'}),
        annotation({topic: 'B', created: '2024-03-02'}),
      ])
    ).toBe('# refs\n\n## 2024-01-15\n\n### A\n\n-\n## 2024-03-02\n\n### B\n\n-\n');
  });

  test('a new date starts the topics under it over', () => {
    // A topic spanning two days is named under each of them, so neither day's
    // annotations sit under a heading belonging to the other.
    expect(
      format({groupByDate: true, fileHeading: 'none'}, [
        annotation({topic: 'A', created: '2024-01-15'}),
        annotation({topic: 'B', created: '2024-01-15'}),
        annotation({topic: 'A', created: '2024-03-02'}),
      ])
    ).toBe('# 2024-01-15\n\n## A\n\n-\n## B\n\n-\n# 2024-03-02\n\n## A\n\n-\n');
  });

  test('a topic that never changes is not repeated under each date', () => {
    // Same rule as the file heading: one that says the same thing throughout
    // is written where it first applies and not again.
    expect(
      format({groupByDate: true, fileHeading: 'none'}, [
        annotation({topic: 'A', created: '2024-01-15'}),
        annotation({topic: 'A', created: '2024-03-02'}),
      ])
    ).toBe('# 2024-01-15\n\n## A\n\n-\n# 2024-03-02\n\n-\n');
  });

  test('grouping by date without its heading only affects the order', () => {
    expect(
      format({groupByDate: true, dateHeading: false, fileHeading: 'none'}, [
        annotation({topic: 'A', created: '2024-01-15'}),
        annotation({topic: 'B', created: '2024-03-02'}),
      ])
    ).toBe('# A\n\n-\n# B\n\n-\n');
  });

  test('no date heading is written when the annotations are not grouped by date', () => {
    expect(
      format({groupByDate: false, fileHeading: 'none'}, [
        annotation({topic: 'A', created: '2024-01-15'}),
        annotation({topic: 'B', created: '2024-03-02'}),
      ])
    ).toBe('# A\n\n-\n# B\n\n-\n');
  });

  test('no topic heading is written when there is no topic to write', () => {
    expect(headingsFor({sortByTopic: false, fileHeading: 'none'})).toBe('-\n-\n');
    expect(headingsFor({sortByTopic: false, fileHeading: 'folder'})).toBe('# refs\n\n-\n-\n');
  });
});

describe('a note holding one annotation and nothing else', () => {
  /** As the 'note per annotation' commands write one. */
  function alone(
    over: Partial<PDFAnnotationPluginSetting>,
    anno: PDFAnnotation
  ) {
    const settings = new PDFAnnotationPluginSetting();
    settings.defaultTemplate = '-\n';
    Object.assign(settings, over);
    return new PDFAnnotationPluginFormatter(settings).format(
      [anno],
      false,
      true
    );
  }

  const dated = annotation({topic: 'Method', created: '2024-01-15'});

  test('is headed by neither the day nor the folder it was grouped by', () => {
    expect(alone({groupByDate: true, fileHeading: 'folder'}, dated))
      .toBe('# Method\n\n-\n');
  });

  test('is headed by neither the day nor the file it came from', () => {
    expect(alone({groupByDate: true, fileHeading: 'file'}, dated))
      .toBe('# Method\n\n-\n');
  });

  test('keeps the topic heading, which says what it is about', () => {
    expect(alone({fileHeading: 'none'}, dated)).toBe('# Method\n\n-\n');
  });

  test('takes the first heading level once the groupings are gone', () => {
    // The topic was a third-level heading under the day and the folder.
    expect(alone({groupByDate: true, fileHeading: 'folder'}, dated))
      .not.toContain('###');
  });

  test('is nothing but the template when the topic heads it no more', () => {
    expect(
      alone({groupByDate: true, fileHeading: 'folder', topicHeading: false}, dated)
    ).toBe('-\n');
  });

  test('is written with every heading when it is not that kind of note', () => {
    const settings = new PDFAnnotationPluginSetting();
    settings.defaultTemplate = '-\n';
    Object.assign(settings, {groupByDate: true, fileHeading: 'folder'});
    expect(
      new PDFAnnotationPluginFormatter(settings).format([dated], false)
    ).toBe('# refs\n\n## 2024-01-15\n\n### Method\n\n-\n');
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

  test('every annotation type starts on the default template', () => {
    // Nothing is pinned to a template of its own, so editing the default is
    // enough to change how every type is written.
    const settings = new PDFAnnotationPluginSetting();
    settings.topicHeading = false;
    settings.fileHeading = 'none';
    settings.defaultTemplate = '{{type}} {{filelink}}\n';
    const formatter = new PDFAnnotationPluginFormatter(settings);

    for (const {subtype} of SUPPORTED_ANNOTS) {
      expect(settings.annotationTemplates[subtype]).toBe('');
      expect(formatter.format([annotation({subtype})], false))
        .toBe(`${subtype} [[refs/Paper.pdf]]\n`);
    }
  });
});
