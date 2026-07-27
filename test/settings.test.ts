import {describe, expect, test} from '@jest/globals';
import {
  ANNOTS_TREATED_AS_HIGHLIGHTS,
  DEFAULT_DESIRED_ANNOTATIONS,
  PDFAnnotationPluginSetting,
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

describe('migrateTemplates', () => {
  // The four fields as the versions before {{filelink}} wrote them.
  const LEGACY_DEFAULTS = {
    noteTemplateInternalPDFs:
      '{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n\n',
    noteTemplateExternalPDFs:
      '{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on {{filepath}}*\n\n',
    highlightTemplateInternalPDFs:
      '> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n\n',
    highlightTemplateExternalPDFs:
      '> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on {{filepath}}*\n\n',
  };

  const migrate = (loaded: Record<string, unknown>) => {
    const settings = new PDFAnnotationPluginSetting();
    const result = PDFAnnotationPluginSetting.migrateTemplates(loaded, settings);
    return {settings, ...result};
  };

  test('leaves a data.json without the old fields alone', () => {
    const defaults = new PDFAnnotationPluginSetting();
    const {settings, migrated, dropped} = migrate({sortByTopic: false});
    expect(migrated).toBe(false);
    expect(dropped).toEqual([]);
    expect(settings.noteTemplate).toBe(defaults.noteTemplate);
    expect(settings.highlightTemplate).toBe(defaults.highlightTemplate);
  });

  test('untouched old defaults become the new defaults', () => {
    const defaults = new PDFAnnotationPluginSetting();
    const {settings, migrated, dropped} = migrate({...LEGACY_DEFAULTS});
    expect(migrated).toBe(true);
    expect(dropped).toEqual([]);
    expect(settings.noteTemplate).toBe(defaults.noteTemplate);
    expect(settings.highlightTemplate).toBe(defaults.highlightTemplate);
    expect(settings.legacyExternalTemplates).toEqual({});
  });

  test('a customised internal template keeps its edit, with the link folded in', () => {
    const {settings, dropped} = migrate({
      ...LEGACY_DEFAULTS,
      noteTemplateInternalPDFs: '{{body}} — [[{{filepath}}]] p{{pageNumber}}',
    });
    expect(settings.noteTemplate).toBe('{{body}} — {{filelink}} p{{pageNumber}}');
    expect(dropped).toEqual([]);
  });

  test('a customised external template is adopted when the internal one is untouched', () => {
    const {settings, dropped} = migrate({
      ...LEGACY_DEFAULTS,
      highlightTemplateExternalPDFs: '> {{highlightedText}} ({{filepath}})',
    });
    expect(settings.highlightTemplate).toBe('> {{highlightedText}} ({{filelink}})');
    expect(dropped).toEqual([]);
  });

  test('a pair edited the same way apart from the link loses nothing', () => {
    const {settings, dropped} = migrate({
      ...LEGACY_DEFAULTS,
      noteTemplateInternalPDFs: '{{body}} @[[{{filepath}}]]',
      noteTemplateExternalPDFs: '{{body}} @{{filepath}}',
    });
    expect(settings.noteTemplate).toBe('{{body}} @{{filelink}}');
    expect(dropped).toEqual([]);
    expect(settings.legacyExternalTemplates).toEqual({});
  });

  test('an external template saying something else is stashed, not discarded', () => {
    const {settings, migrated, dropped} = migrate({
      ...LEGACY_DEFAULTS,
      noteTemplateInternalPDFs: '{{body}} @[[{{filepath}}]]',
      noteTemplateExternalPDFs: 'EXTERNAL {{body}} @{{filepath}}',
    });
    expect(migrated).toBe(true);
    expect(settings.noteTemplate).toBe('{{body}} @{{filelink}}');
    expect(dropped).toEqual(['notes']);
    expect(settings.legacyExternalTemplates).toEqual({
      noteTemplateExternalPDFs: 'EXTERNAL {{body}} @{{filepath}}',
    });
  });

  test('does not run twice over an already collapsed data.json', () => {
    const {settings, migrated} = migrate({
      noteTemplate: 'mine {{filelink}}',
      highlightTemplate: 'mine too {{filelink}}',
      noteTemplateInternalPDFs: '{{body}} stale [[{{filepath}}]]',
    });
    // The loader copies the collapsed fields itself; migration must not
    // overwrite them with the leftovers of the old ones.
    expect(migrated).toBe(false);
    expect(settings.noteTemplate).not.toContain('stale');
  });
});

describe('normalizeDesiredAnnotations', () => {
  const normalize = (value: unknown) =>
    PDFAnnotationPluginSetting.normalizeDesiredAnnotations(value);

  test('accepts a list of subtypes unchanged', () => {
    expect(normalize(['Text', 'FreeText'])).toEqual(['Text', 'FreeText']);
    expect(normalize([])).toEqual([]);
  });

  test('converts the comma separated string older versions stored', () => {
    expect(normalize('Text, Highlight, Underline')).toEqual([
      'Text', 'Highlight', 'Underline',
    ]);
    expect(normalize(' Text ,, Highlight , ')).toEqual(['Text', 'Highlight']);
    expect(normalize('')).toEqual([]);
  });

  test('rejects anything that is not a list of subtypes', () => {
    expect(normalize(undefined)).toBeNull();
    expect(normalize(null)).toBeNull();
    expect(normalize(42)).toBeNull();
    expect(normalize(['Text', 7])).toBeNull();
    expect(normalize({Text: true})).toBeNull();
  });
});
