import {describe, expect, test} from '@jest/globals';
import {
  ANNOTS_TREATED_AS_HIGHLIGHTS,
  DEFAULT_DESIRED_ANNOTATIONS,
  FILE_HEADINGS,
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

describe('migrateStructure', () => {
  const migrate = (loaded: Record<string, unknown>) => {
    const settings = new PDFAnnotationPluginSetting();
    const migrated = PDFAnnotationPluginSetting.migrateStructure(loaded, settings);
    return {heading: settings.fileHeading, byFolder: settings.groupByFolder, migrated};
  };

  const migrateHeadings = (loaded: Record<string, unknown>) => {
    const settings = new PDFAnnotationPluginSetting();
    PDFAnnotationPluginSetting.migrateStructure(loaded, settings);
    return {topic: settings.topicHeading, file: settings.fileHeading};
  };

  test('the three choices are the ones the formatter branches on', () => {
    expect(FILE_HEADINGS).toEqual(['folder', 'file', 'none']);
  });

  test('defaults to grouping by folder and saying so in the heading', () => {
    const defaults = new PDFAnnotationPluginSetting();
    expect(defaults.fileHeading).toBe('folder');
    expect(defaults.groupByFolder).toBe(true);
  });

  test('the old boolean splits into the order and the label it used to mean', () => {
    expect(migrate({useFolderNames: true})).toEqual({
      heading: 'folder', byFolder: true, migrated: true,
    });
    expect(migrate({useFolderNames: false})).toEqual({
      heading: 'file', byFolder: false, migrated: true,
    });
  });

  test('a data.json holding both fields is left alone', () => {
    for (const heading of FILE_HEADINGS) {
      for (const byFolder of [true, false]) {
        expect(migrate({fileHeading: heading, groupByFolder: byFolder})).toEqual({
          heading, byFolder, migrated: false,
        });
      }
    }
  });

  test('the two are independent once split: a folder order under file headings', () => {
    expect(migrate({fileHeading: 'file', groupByFolder: true})).toEqual({
      heading: 'file', byFolder: true, migrated: false,
    });
  });

  test('a heading from before the split carries the order it used to imply', () => {
    // Only the folder heading grouped by folder; file and none did not.
    expect(migrate({fileHeading: 'folder'})).toEqual({
      heading: 'folder', byFolder: true, migrated: true,
    });
    expect(migrate({fileHeading: 'file'})).toEqual({
      heading: 'file', byFolder: false, migrated: true,
    });
    expect(migrate({fileHeading: 'none'})).toEqual({
      heading: 'none', byFolder: false, migrated: true,
    });
  });

  test('the newer fields win over a boolean an older version left behind', () => {
    expect(migrate({fileHeading: 'none', useFolderNames: true})).toEqual({
      heading: 'none', byFolder: false, migrated: true,
    });
    expect(migrate({groupByFolder: false, useFolderNames: true})).toEqual({
      heading: 'folder', byFolder: false, migrated: true,
    });
  });

  test('a heading this version does not know falls back to the folder name', () => {
    // Not 'none': a typo must not silently suppress the heading.
    expect(migrate({fileHeading: 'Folder'})).toEqual({
      heading: 'folder', byFolder: true, migrated: true,
    });
    expect(migrate({fileHeading: ''}).heading).toBe('folder');
  });

  test('the master switch off silences both heading levels', () => {
    expect(migrateHeadings({useStructuringHeadlines: false, useFolderNames: true}))
      .toEqual({topic: false, file: 'none'});
    expect(migrateHeadings({useStructuringHeadlines: false, fileHeading: 'file'}))
      .toEqual({topic: false, file: 'none'});
  });

  test('the master switch on leaves the file heading as it was', () => {
    expect(migrateHeadings({useStructuringHeadlines: true, useFolderNames: false}))
      .toEqual({topic: true, file: 'file'});
  });

  test('silencing the headings does not change the order they were in', () => {
    // The heading said 'folder' before the switch overrode it, and the order
    // that implied outlives the heading.
    expect(migrate({useStructuringHeadlines: false, fileHeading: 'folder'})).toEqual({
      heading: 'none', byFolder: true, migrated: true,
    });
    expect(migrate({useStructuringHeadlines: false, useFolderNames: true}).byFolder).toBe(true);
  });

  test('a data.json holding the split fields keeps them', () => {
    expect(migrateHeadings({topicHeading: false, fileHeading: 'folder'}))
      .toEqual({topic: false, file: 'folder'});
    expect(migrateHeadings({topicHeading: true, useStructuringHeadlines: false}))
      .toEqual({topic: true, file: 'folder'});
  });

  test('a data.json from before any of the fields gets the defaults', () => {
    expect(migrateHeadings({})).toEqual({topic: true, file: 'folder'});
    expect(migrate({sortByTopic: false})).toEqual({
      heading: 'folder', byFolder: true, migrated: false,
    });
    expect(migrate({useFolderNames: 'yes'})).toEqual({
      heading: 'folder', byFolder: true, migrated: false,
    });
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
