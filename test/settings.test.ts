import {describe, expect, test} from '@jest/globals';
import {t} from '../lang/helpers';
import {
  ANNOTS_TREATED_AS_HIGHLIGHTS,
  cleanNoteName,
  DEFAULT_DESIRED_ANNOTATIONS,
  PDFAnnotationPluginSetting,
  resolveNotePath,
  SUPPORTED_ANNOTS,
} from '../src/settings';

describe('supported annotation types', () => {
  test('offers the text bearing subtypes and nothing graphical', () => {
    expect(SUPPORTED_ANNOTS.map((a) => a.subtype)).toEqual([
      'Highlight', 'Underline', 'Squiggly', 'StrikeOut', 'Text', 'FreeText',
    ]);
  });

  test('excludes types whose content cannot become markdown', () => {
    const subtypes = SUPPORTED_ANNOTS.map((a) => a.subtype);
    for (const graphical of [
      'Ink', 'Square', 'Circle', 'Line', 'Polygon', 'PolyLine', 'Stamp',
      'Caret', 'FileAttachment', 'Link', 'Widget', 'Popup',
    ]) {
      expect(subtypes).not.toContain(graphical);
    }
  });

  test('the text markup types are exactly the ones carrying QuadPoints', () => {
    expect(ANNOTS_TREATED_AS_HIGHLIGHTS).toEqual([
      'Highlight', 'Underline', 'Squiggly', 'StrikeOut',
    ]);
  });

  test('every type has a description and a unique subtype', () => {
    const subtypes = SUPPORTED_ANNOTS.map((a) => a.subtype);
    expect(new Set(subtypes).size).toBe(subtypes.length);
    for (const annotation of SUPPORTED_ANNOTS) {
      expect(annotation.description.length).toBeGreaterThan(0);
    }
  });
});

describe('desired annotation checkboxes', () => {
  test('defaults to notes, highlights and underlines', () => {
    const s = new PDFAnnotationPluginSetting();
    expect(s.desiredAnnotations).toEqual(['Highlight', 'Underline', 'Text']);
    expect(s.desiredAnnotations).toEqual(DEFAULT_DESIRED_ANNOTATIONS);
    expect(s.isAnnotationDesired('Text')).toBe(true);
    expect(s.isAnnotationDesired('StrikeOut')).toBe(false);
  });

  test('the default array is not shared between instances', () => {
    const a = new PDFAnnotationPluginSetting();
    a.setAnnotationDesired('Squiggly', true);
    const b = new PDFAnnotationPluginSetting();
    expect(b.isAnnotationDesired('Squiggly')).toBe(false);
    expect(DEFAULT_DESIRED_ANNOTATIONS).not.toContain('Squiggly');
  });

  test('checking a box keeps the listed type order', () => {
    const s = new PDFAnnotationPluginSetting();
    s.setAnnotationDesired('FreeText', true);
    s.setAnnotationDesired('StrikeOut', true);
    expect(s.desiredAnnotations).toEqual([
      'Highlight', 'Underline', 'StrikeOut', 'Text', 'FreeText',
    ]);
  });

  test('unchecking removes only that type', () => {
    const s = new PDFAnnotationPluginSetting();
    s.setAnnotationDesired('Highlight', false);
    expect(s.desiredAnnotations).toEqual(['Underline', 'Text']);
  });

  test('checking a box twice does not duplicate it', () => {
    const s = new PDFAnnotationPluginSetting();
    s.setAnnotationDesired('Squiggly', true);
    s.setAnnotationDesired('Squiggly', true);
    expect(s.desiredAnnotations.filter((t) => t === 'Squiggly')).toHaveLength(1);
  });

  test('unchecking everything yields an empty selection', () => {
    const s = new PDFAnnotationPluginSetting();
    for (const {subtype} of SUPPORTED_ANNOTS) s.setAnnotationDesired(subtype, false);
    expect(s.desiredAnnotations).toEqual([]);
    s.setAnnotationDesired('FreeText', true);
    expect(s.desiredAnnotations).toEqual(['FreeText']);
  });

  test('a subtype added to data.json by hand survives a checkbox change', () => {
    const s = new PDFAnnotationPluginSetting();
    s.desiredAnnotations = ['Text', 'Redact'];
    s.setAnnotationDesired('Highlight', true);
    expect(s.desiredAnnotations).toEqual(['Highlight', 'Text', 'Redact']);
  });
});

describe('naming a note per annotation after its topic', () => {
  test('is off, so the name template keeps naming what it named', () => {
    expect(new PDFAnnotationPluginSetting().topicToNoteName).toBe(false);
  });

  test('names a note whose annotation has no comment by number', () => {
    // Rendered by the plugin against {{counter}}; the counter is what keeps
    // the untitled notes of one PDF apart.
    expect(t.NAME_NO_TOPIC).toContain('{{counter}}');
  });

  test('is a field of its own, which is what makes it load', () => {
    // The plugin reads back every field the settings object declares, so a
    // setting that is declared cannot be one that silently never loads.
    expect(Object.keys(new PDFAnnotationPluginSetting()))
      .toContain('topicToNoteName');
  });
});

describe('cleanNoteName', () => {
  test('a name a vault already takes is left alone', () => {
    expect(cleanNoteName('Annotations for Paper-1')).toBe(
      'Annotations for Paper-1'
    );
  });

  test('characters a vault name cannot hold are dropped', () => {
    expect(cleanNoteName('Chapter 1: what "counts"?')).toBe(
      'Chapter 1 what counts'
    );
  });

  test('a slash names no folder, since the subfolder setting does that', () => {
    expect(cleanNoteName('Part 1/Chapter 2')).toBe('Part 1 Chapter 2');
  });

  test('the line breaks a topic carries in become spaces', () => {
    expect(cleanNoteName('First line\r\nsecond line')).toBe(
      'First line second line'
    );
  });

  test('a name that renders nothing usable comes back empty', () => {
    expect(cleanNoteName('')).toBe('');
    expect(cleanNoteName('   ')).toBe('');
    expect(cleanNoteName('???')).toBe('');
    expect(cleanNoteName('...')).toBe('');
  });

  test('no leading dot, which would write a note nobody sees', () => {
    expect(cleanNoteName('.hidden')).toBe('hidden');
  });

  test('no trailing dot or space, which a file system would refuse', () => {
    expect(cleanNoteName('Ibid. ')).toBe('Ibid');
  });

  test('a topic of a whole paragraph is cut to a name of a length', () => {
    const cleaned = cleanNoteName('word '.repeat(60));
    expect(cleaned.length).toBeLessThanOrEqual(100);
    expect(cleaned.endsWith(' ')).toBe(false);
  });

  test('the cut falls between characters, never inside one', () => {
    // Counted as they are read: 120 emoji are 240 UTF-16 units, and cutting by
    // those would leave half of one behind — a name no file system takes.
    expect(cleanNoteName('😀'.repeat(120))).toBe('😀'.repeat(100));
  });

  test('a name is as long in any alphabet', () => {
    expect([...cleanNoteName('я'.repeat(120))]).toHaveLength(100);
  });
});

describe('resolveNotePath', () => {
  const resolve = (
    over: Partial<PDFAnnotationPluginSetting>,
    subfolder = '',
    currentFolder = 'Papers/2024'
  ) => {
    const settings = new PDFAnnotationPluginSetting();
    Object.assign(settings, over);
    return resolveNotePath(
      settings, currentFolder, 'Annotations for Paper.md', subfolder
    );
  };

  test('beside the current file puts the note in the folder it is in', () => {
    expect(resolve({noteLocation: 'current'}))
      .toBe('Papers/2024/Annotations for Paper.md');
  });

  test('beside a file at the vault root writes to the root', () => {
    // Obsidian gives the root folder the path '/'.
    expect(resolve({noteLocation: 'current'}, '', '/'))
      .toBe('Annotations for Paper.md');
    // Nothing open at all.
    expect(resolve({noteLocation: 'current'}, '', ''))
      .toBe('Annotations for Paper.md');
  });

  test('the note folder and subfolder are ignored beside the current file', () => {
    expect(resolve({noteLocation: 'current', noteFolder: 'Notes'}, 'Paper'))
      .toBe('Papers/2024/Annotations for Paper.md');
  });

  test('an empty vault folder is the vault root', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: ''}))
      .toBe('Annotations for Paper.md');
  });

  test('the note goes in the named vault folder', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes/PDFs'}))
      .toBe('Notes/PDFs/Annotations for Paper.md');
  });

  test('a rendered subfolder goes under the folder', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, 'Paper'))
      .toBe('Notes/Paper/Annotations for Paper.md');
  });

  test('a subfolder without a folder sits at the vault root', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: ''}, 'Paper'))
      .toBe('Paper/Annotations for Paper.md');
  });

  test('a subfolder template may render a nested path', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, '2024/Paper'))
      .toBe('Notes/2024/Paper/Annotations for Paper.md');
  });

  test('stray slashes and spaces do not double up or dangle', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: '/Notes/'}, ' Paper '))
      .toBe('Notes/Paper/Annotations for Paper.md');
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes//PDFs'}))
      .toBe('Notes/PDFs/Annotations for Paper.md');
    // What the folder suggester offers for the vault root.
    expect(resolve({noteLocation: 'vault', noteFolder: '/'}))
      .toBe('Annotations for Paper.md');
  });

  test('characters a vault path cannot hold are dropped, not passed on', () => {
    expect(resolve({noteLocation: 'vault', noteFolder: 'Notes'}, 'Paper: a study?'))
      .toBe('Notes/Paper a study/Annotations for Paper.md');
  });
});

describe('tag extraction', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeTagExtraction(value);

  test('starts off', () => {
    expect(new PDFAnnotationPluginSetting().extractTags).toBe('never');
  });

  test('a mode this version knows is kept', () => {
    expect(normalize('separate')).toBe('separate');
    expect(normalize('always')).toBe('always');
  });

  test('anything else falls back to never', () => {
    expect(normalize('sometimes')).toBe('never');
    expect(normalize(true)).toBe('never');
    expect(normalize(undefined)).toBe('never');
  });

  const asks = (mode: string, onePerAnnotation: boolean) => {
    const settings = new PDFAnnotationPluginSetting();
    (settings as unknown as Record<string, unknown>).extractTags = mode;
    return settings.extractsTags(onePerAnnotation);
  };

  test.each([
    ['never', false, false],
    ['never', true, false],
    ['always', false, true],
    ['always', true, true],
    // A note being inserted into is a single note, and asks with false.
    ['single', false, true],
    ['single', true, false],
    ['separate', false, false],
    ['separate', true, true],
  ])('%s, one note per annotation %p: %p', (mode, onePerAnnotation, expected) => {
    expect(asks(mode, onePerAnnotation)).toBe(expected);
  });
});

describe('normalizeAnnotationTemplates', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeAnnotationTemplates(value);

  test('keeps the templates data.json holds, blanks and all', () => {
    expect(normalize({Highlight: 'H', Text: ''})).toEqual({
      Highlight: 'H',
      Underline: '',
      Squiggly: '',
      StrikeOut: '',
      Text: '',
      FreeText: '',
    });
  });

  test('a type this version knows and the file does not has none of its own', () => {
    expect(normalize({}).FreeText).toBe('');
  });

  test('anything that is not a template is read as none', () => {
    expect(normalize({Highlight: 42, Text: null}).Highlight).toBe('');
    expect(normalize(null).Text).toBe('');
    expect(normalize('a template').Highlight).toBe('');
  });

  test('a type the file knows and this version does not is dropped', () => {
    expect(normalize({Ink: 'drawn'})).not.toHaveProperty('Ink');
  });
});

describe('normalizeDesiredAnnotations', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeDesiredAnnotations(value);

  test('accepts a list of subtypes unchanged', () => {
    expect(normalize(['Text', 'FreeText'])).toEqual(['Text', 'FreeText']);
    expect(normalize([])).toEqual([]);
  });

  test('rejects anything that is not a list of subtypes', () => {
    expect(normalize(undefined)).toBeNull();
    expect(normalize(null)).toBeNull();
    expect(normalize(42)).toBeNull();
    expect(normalize('Text, Highlight')).toBeNull();
    expect(normalize(['Text', 7])).toBeNull();
    expect(normalize({Text: true})).toBeNull();
  });
});
