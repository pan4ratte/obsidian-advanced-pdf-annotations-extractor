import {describe, expect, test} from '@jest/globals';
import {t} from '../lang/helpers';
import {
  ANNOTS_TREATED_AS_HIGHLIGHTS,
  cleanNoteName,
  DEFAULT_DESIRED_ANNOTATIONS,
  FILE_HEADINGS,
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

describe('normalizeLegacySettings', () => {
  const normalize = (loaded: Record<string, unknown>) =>
    PDFAnnotationPluginSetting.normalizeLegacySettings(loaded);

  test('every renamed setting is read back under its new name', () => {
    const {data, changed} = normalize({
      exportLocation: 'pdf',
      exportFolder: 'Notes',
      exportSubfolder: '{{filename}}',
      exportName: 'Annotations for {{filename}}',
      oneNotePerAnnotationExportName: '{{filename}}-{{counter}}',
    });
    expect(changed).toBe(true);
    expect(data).toEqual({
      noteLocation: 'pdf',
      noteFolder: 'Notes',
      noteSubfolder: '{{filename}}',
      noteName: 'Annotations for {{filename}}',
      oneNotePerAnnotationName: '{{filename}}-{{counter}}',
    });
  });

  test('a value carries over as it is, whatever it holds', () => {
    expect(normalize({exportName: ''}).data.noteName).toBe('');
    expect(normalize({exportSubfolder: false}).data.noteSubfolder).toBe(false);
  });

  test('the old names are gone, so data.json stops carrying them', () => {
    const {data} = normalize({exportName: 'x'});
    expect('exportName' in data).toBe(false);
  });

  test('the settings their commands replaced are dropped, under every name', () => {
    for (const gone of [
      {exportClipboardExtraction: true},
      {clipboardSavesToNote: true},
      {oneNotePerAnnotation: true},
    ]) {
      expect(normalize(gone)).toEqual({data: {}, changed: true});
    }
  });

  test('settings that were not renamed are left alone', () => {
    const {data, changed} = normalize({sortByTopic: false, noteTemplate: '{{body}}'});
    expect(changed).toBe(false);
    expect(data).toEqual({sortByTopic: false, noteTemplate: '{{body}}'});
  });

  test('a name this version writes wins over the one it replaced', () => {
    // Only reachable by editing data.json by hand, but the newer name is the
    // one this version would have written.
    const {data} = normalize({exportName: 'old', noteName: 'new'});
    expect(data.noteName).toBe('new');
    expect('exportName' in data).toBe(false);
  });

  test('the data.json it was given is not changed underneath the caller', () => {
    const loaded = {exportName: 'x'};
    normalize(loaded);
    expect(loaded).toEqual({exportName: 'x'});
  });

  test('the export path is left for the migration that splits it', () => {
    const {data, changed} = normalize({exportPath: './'});
    expect(changed).toBe(false);
    expect(data.exportPath).toBe('./');
  });
});

describe('migrateNotePath', () => {
  const migrate = (loaded: Record<string, unknown>) => {
    const settings = new PDFAnnotationPluginSetting();
    const migrated = PDFAnnotationPluginSetting.migrateNotePath(loaded, settings);
    return {
      location: settings.noteLocation,
      folder: settings.noteFolder,
      migrated,
    };
  };

  test('defaults to the vault root, as the empty path before it did', () => {
    const defaults = new PDFAnnotationPluginSetting();
    expect(defaults.noteLocation).toBe('vault');
    expect(defaults.noteFolder).toBe('');
    expect(defaults.noteSubfolder).toBe('');
  });

  test("the old './' becomes writing beside the current file", () => {
    expect(migrate({exportPath: './'})).toEqual({
      location: 'current', folder: '', migrated: true,
    });
  });

  test('a location that followed the PDF now follows the current file', () => {
    // The PDF is the current file whenever one in the vault is open, so this
    // is the same folder for everyone it was already working for.
    expect(migrate({noteLocation: 'pdf'})).toEqual({
      location: 'current', folder: '', migrated: true,
    });
  });

  test('an old vault path keeps its folder, without the trailing slash', () => {
    expect(migrate({exportPath: 'Notes/PDFs/'})).toEqual({
      location: 'vault', folder: 'Notes/PDFs', migrated: true,
    });
  });

  test('an old empty path is the vault root', () => {
    expect(migrate({exportPath: ''})).toEqual({
      location: 'vault', folder: '', migrated: true,
    });
  });

  test('a data.json that already names a location is left alone', () => {
    expect(migrate({noteLocation: 'current', exportPath: 'Notes/'})).toEqual({
      location: 'current', folder: '', migrated: false,
    });
  });

  test('a location this version does not know falls back to the vault', () => {
    expect(migrate({noteLocation: 'desktop'})).toEqual({
      location: 'vault', folder: '', migrated: true,
    });
  });

  test('a data.json from before either field gets the defaults', () => {
    expect(migrate({sortByTopic: false})).toEqual({
      location: 'vault', folder: '', migrated: false,
    });
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

  // The collapsed pair is written back into the loaded data.json, which is
  // where the migration to a template per type reads it from.
  const migrate = (loaded: Record<string, unknown>) => {
    const settings = new PDFAnnotationPluginSetting();
    const result = PDFAnnotationPluginSetting.migrateTemplates(loaded, settings);
    return {settings, loaded, ...result};
  };

  test('leaves a data.json without the old fields alone', () => {
    const {loaded, migrated, dropped} = migrate({sortByTopic: false});
    expect(migrated).toBe(false);
    expect(dropped).toEqual([]);
    expect(loaded.noteTemplate).toBeUndefined();
    expect(loaded.highlightTemplate).toBeUndefined();
  });

  test('untouched old defaults are left for the new defaults to cover', () => {
    const {loaded, migrated, dropped, settings} = migrate({...LEGACY_DEFAULTS});
    expect(migrated).toBe(true);
    expect(dropped).toEqual([]);
    expect(loaded.noteTemplate).toBeUndefined();
    expect(loaded.highlightTemplate).toBeUndefined();
    expect(settings.legacyExternalTemplates).toEqual({});
  });

  test('a customised internal template keeps its edit, with the link folded in', () => {
    const {loaded, dropped} = migrate({
      ...LEGACY_DEFAULTS,
      noteTemplateInternalPDFs: '{{body}} — [[{{filepath}}]] p{{pageNumber}}',
    });
    expect(loaded.noteTemplate).toBe('{{body}} — {{filelink}} p{{pageNumber}}');
    expect(dropped).toEqual([]);
  });

  test('a customised external template is adopted when the internal one is untouched', () => {
    const {loaded, dropped} = migrate({
      ...LEGACY_DEFAULTS,
      highlightTemplateExternalPDFs: '> {{highlightedText}} ({{filepath}})',
    });
    expect(loaded.highlightTemplate).toBe('> {{highlightedText}} ({{filelink}})');
    expect(dropped).toEqual([]);
  });

  test('a pair edited the same way apart from the link loses nothing', () => {
    const {loaded, dropped, settings} = migrate({
      ...LEGACY_DEFAULTS,
      noteTemplateInternalPDFs: '{{body}} @[[{{filepath}}]]',
      noteTemplateExternalPDFs: '{{body}} @{{filepath}}',
    });
    expect(loaded.noteTemplate).toBe('{{body}} @{{filelink}}');
    expect(dropped).toEqual([]);
    expect(settings.legacyExternalTemplates).toEqual({});
  });

  test('an external template saying something else is stashed, not discarded', () => {
    const {loaded, migrated, dropped, settings} = migrate({
      ...LEGACY_DEFAULTS,
      noteTemplateInternalPDFs: '{{body}} @[[{{filepath}}]]',
      noteTemplateExternalPDFs: 'EXTERNAL {{body}} @{{filepath}}',
    });
    expect(migrated).toBe(true);
    expect(loaded.noteTemplate).toBe('{{body}} @{{filelink}}');
    expect(dropped).toEqual(['notes']);
    expect(settings.legacyExternalTemplates).toEqual({
      noteTemplateExternalPDFs: 'EXTERNAL {{body}} @{{filepath}}',
    });
  });

  test('does not run twice over an already collapsed data.json', () => {
    const {loaded, migrated} = migrate({
      noteTemplate: 'mine {{filelink}}',
      highlightTemplate: 'mine too {{filelink}}',
      noteTemplateInternalPDFs: '{{body}} stale [[{{filepath}}]]',
    });
    // The collapsed fields are what the next migration reads; the leftovers of
    // the four they came from must not overwrite them.
    expect(migrated).toBe(false);
    expect(loaded.noteTemplate).toBe('mine {{filelink}}');
  });
});

describe('migrateTemplateTypes', () => {
  const migrate = (loaded: Record<string, unknown>) => {
    const settings = new PDFAnnotationPluginSetting();
    const migrated = PDFAnnotationPluginSetting.migrateTemplateTypes(
      loaded,
      settings
    );
    return {settings, migrated};
  };

  test('leaves a data.json without the old pair alone', () => {
    const defaults = new PDFAnnotationPluginSetting();
    const {settings, migrated} = migrate({sortByTopic: false});
    expect(migrated).toBe(false);
    expect(settings.defaultTemplate).toBe(defaults.defaultTemplate);
    expect(settings.annotationTemplates).toEqual(defaults.annotationTemplates);
  });

  test('the note template becomes the default every type falls back on', () => {
    const {settings, migrated} = migrate({
      noteTemplate: 'NOTE {{body}}',
      highlightTemplate: 'HIGH {{highlightedText}}',
    });
    expect(migrated).toBe(true);
    expect(settings.defaultTemplate).toBe('NOTE {{body}}');
  });

  test('the highlight template becomes the template of the types marking up text', () => {
    const {settings} = migrate({
      noteTemplate: 'NOTE {{body}}',
      highlightTemplate: 'HIGH {{highlightedText}}',
    });
    expect(settings.annotationTemplates).toEqual({
      Highlight: 'HIGH {{highlightedText}}',
      Underline: 'HIGH {{highlightedText}}',
      Squiggly: 'HIGH {{highlightedText}}',
      StrikeOut: 'HIGH {{highlightedText}}',
      Text: '',
      FreeText: '',
    });
  });

  test('a pair saying the same thing leaves every type on the default', () => {
    const {settings} = migrate({
      noteTemplate: 'BOTH {{body}}',
      highlightTemplate: 'BOTH {{body}}',
    });
    expect(settings.defaultTemplate).toBe('BOTH {{body}}');
    expect(Object.values(settings.annotationTemplates)).toEqual(
      Object.values(settings.annotationTemplates).map(() => '')
    );
  });

  test('a highlight template on its own is kept over the untouched default', () => {
    const defaults = new PDFAnnotationPluginSetting();
    const {settings, migrated} = migrate({highlightTemplate: 'HIGH'});
    expect(migrated).toBe(true);
    expect(settings.defaultTemplate).toBe(defaults.defaultTemplate);
    expect(settings.annotationTemplates.Highlight).toBe('HIGH');
    expect(settings.annotationTemplates.Text).toBe('');
  });

  test('does not run over a data.json this version has already written', () => {
    const {settings, migrated} = migrate({
      defaultTemplate: 'MINE {{body}}',
      noteTemplate: 'stale',
      highlightTemplate: 'stale too',
    });
    // The loader copies defaultTemplate itself; the leftovers of the pair it
    // replaced must not overwrite it.
    expect(migrated).toBe(false);
    expect(settings.defaultTemplate).not.toContain('stale');
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
