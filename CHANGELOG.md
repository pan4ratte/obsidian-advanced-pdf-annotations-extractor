# Changelog

The release workflow turns the section of the version in `manifest.json` into the
GitHub release notes, so every released version needs a `## <version>` heading
here spelled exactly as in `manifest.json`. Rename `## Unreleased` to the new
version number in the same commit that bumps `manifest.json` and `package.json`.

## Unreleased

### Added

- Grouping by the day an annotation was made. *Group by creation date* keeps
  the annotations made on the same day together, outside every other grouping,
  with *Heading above each date* writing the day above them as `YYYY-MM-DD`.
  Off by default, so an upgrade reorders nothing. The day comes from the PDF's
  own `CreationDate` on the annotation, which a reader is free to leave out —
  those annotations come last, under `No date`. The time of day and the time
  zone are deliberately not read: a zone would move an annotation to the day
  before or after depending on where the note is read.
- `{{created}}` template variable, holding that same day.
- *Extract from the current file into a note per annotation* and *Extract from
  the file path in the clipboard into a note per annotation*, replacing the
  setting that used to decide this for every command at once.
- A command for writing a PDF from outside the vault to a note of its own:
  *Extract from the file path in the clipboard into a new note*. The command
  that was there inserts into the note being edited, so it needs one open and
  offers nothing to a reader who wants a note per PDF; this one needs no editor
  at all. Its name says which of the two it is now, rather than leaving that to
  a setting.
- A subfolder for the exported notes, named by a template. With
  *Notes export subfolder* set to `{{filename}}`, every PDF's notes go in a
  folder of its own under the export folder. Missing folders are created, which
  the export did not do before — a path that did not exist was reported as
  invalid instead. A template may render a nested path; characters a vault path
  cannot hold are dropped.

- `{{topic}}` template variable, holding the first line of the annotation body
  when grouping by topic is enabled. It was already reachable but undocumented.
- `StrikeOut` annotations can now be extracted. It is the fourth text markup
  type, so it captures the struck out text the way highlights, underlines and
  squigglies do. Not enabled by default — tick it in the settings.

### Changed

- The settings that decide where a note goes and what it is called no longer
  call it an export. Nothing leaves Obsidian: the annotations are read out of a
  PDF and the notes are written into the vault, so *Note export* is now simply
  *Notes*, holding *Note location*, *Note folder*, *Note subfolder* and *Note
  name*. The descriptions that said a note would be "exported to" a note say
  what they set instead, and the one for the clipboard command says it writes a
  note rather than exporting to a file. The names in `data.json` follow —
  `exportName` is `noteName`, `exportClipboardExtraction` is
  `clipboardSavesToNote`, and so on — read back under their new names on first
  load, with every value kept. A `data.json` edited by hand keeps whichever of
  the two names this version writes.
- **Breaking:** *Notes export path* is now *Note location*, a choice
  between writing the notes beside their PDF and writing them into a folder of
  the vault, with the folder named in a field of its own that offers the vault's
  folders as you type. The one path field before it meant both things at once
  through a literal `./`, needed a trailing slash to work, and gave no hint that
  a folder had to already exist. On first load an existing path is split into
  the two: `./` becomes *Beside the PDF*, anything else the folder it named.
  The folder and subfolder fields are greyed out while the notes go beside their
  PDF, which has no folder of the vault to put them in.

- Grouping by topic no longer depends on the headings setting. The first line of
  a comment was only split off into `{{topic}}` while headings were enabled, so
  with them off the topic sort key was empty and did nothing. The two settings
  are now independent, the way folder grouping already was. If you had grouping
  by topic on and headings off, the first line of each comment now moves out of
  `{{body}}` and into `{{topic}}`.
- **How annotations are ordered is now separate from what is written above
  them.** *Use folder name* did both jobs at once: it was a boolean that chose
  between the folder name and the file name, so a note could not be grouped by
  folder without repeating the folder name in every heading, and could not be
  grouped by topic alone without losing the heading level too. It is now
  *Group by folder*, a toggle that only affects the order, and *Heading above
  each file*, a choice of folder name, file name or no heading that only affects
  what the note says. An existing setting is split into the two on first load
  and keeps the order and the headings it produced before.
- Each heading level says for itself whether it is written. *Use structuring
  headlines* was a master switch over both of them, so the only way to drop one
  heading was to drop the other with it. It is gone, replaced by *Heading above
  each topic*; the file heading already had a *No heading* choice of its own.
  Switching the old setting off migrates to both levels off, which is what it
  did.
- The settings under Structure are now two sections, Grouping and Headings, each
  listing its settings in the order they take effect: *Group by annotation
  topic*, *Group by folder*, then *Heading above each topic*, *Heading above
  each file*. Grouping decides the order the annotations come in, headings
  decide what is written between them, and nothing sits in both groups any more.
  *Heading above each topic* switches off and greys out while grouping by topic
  is off, the one setting that still depends on another: without a topic split
  off the body there is nothing for it to head. It stays in view, and the choice
  it was switched off from comes back when the grouping does.
- The template variables in the settings tab are a table now, each with a button
  that copies the variable to the clipboard.
- Each template field is a full-width monospaced box with a numbered gutter.
  Lines are no longer soft wrapped, so a number always means a line.
- Every user-facing string moved to `lang/en.ts`, so the plugin can be
  translated without touching its logic — add a language by copying that file
  and listing it in `lang/helpers.ts`. The whole file is held to the Obsidian
  sentence-case rule. The only wording that changed is the line written
  into a note when a PDF has no annotations, now `*No annotations*`.

- **Breaking:** the four templates are now two. The separate templates for PDFs
  inside and outside the vault differed only in how they linked the PDF, so that
  job moved to a new `{{filelink}}` variable — a `[[wiki link]]` for a PDF in the
  vault, the `file://` path for one outside it. What is left is one template for
  annotations that mark up PDF text and one for annotations that only carry a
  comment. `{{isExternal}}` is there for templates that need to word the two
  cases differently.
  On first load, `data.json` is folded into the new pair: your template for PDFs
  inside the vault wins, with `[[{{filepath}}]]` rewritten to `{{filelink}}`. A
  template for external PDFs that was customised on its own is adopted instead;
  one that disagreed with a customised internal template is kept under
  `legacyExternalTemplates` and reported with a notice, rather than dropped.
  `{{filepath}}` still works everywhere it did.

- The annotation types to extract are picked from a grid of checkboxes instead
  of being typed into a text field, so the type names can no longer be
  misspelled. Each checkbox is labelled with what the type means
  (`Highlighted text`, `Sticky note comment`, …) rather than its PDF subtype.
- **Breaking:** `desiredAnnotations` in `data.json` is now a list of subtypes
  (`["Highlight", "Underline", "Text"]`) rather than a comma separated string.
  A string left over from an earlier version is converted on load.
- Commands no longer repeat the plugin name, following the Obsidian plugin
  guidelines. The command IDs are unchanged, so existing hotkeys keep working:
  - `Extract PDF Annotations` → `Extract from every PDF in the current folder`
  - `Extract PDF Annotations on single file` → `Extract from the current file`
  - `Extract PDF Annotations on single file from path in clipboard` →
    `Extract from the file path in the clipboard`
- Settings tab uses Obsidian's own heading style, and its section names are now
  `Annotations to extract`, `Styling`, `Templates`, `Structure` and
  `Note export`. It opens with the plugin name and description, taken from
  `manifest.json`.
- The `Annotations to extract` heading, its description and the checkbox grid
  are one card now, stacked: the text above, the checkboxes below it in up to
  three columns, dropping to two and then one on a narrow settings tab.
- Text area sizing moved out of inline styles into `styles.css`, so themes can
  restyle it. `styles.css` is a new release asset.
- Failures of the clipboard path command are reported with a notice instead of a
  console message.
- Releases are cut automatically when the `manifest.json` version changes, with
  build provenance attestation and notes taken from this file.

### Removed

- *Export annotations from clipboard path to file*, which changed what the
  clipboard command did behind its own name. The two things it chose between
  are two commands now, each saying which it is. Its value is dropped from
  `data.json`.
- *One note per annotation*, for the same reason: it changed what every
  extraction command did, from somewhere else and before the fact. Both
  extraction commands have a *note per annotation* counterpart now, so the
  choice is made where the extraction is asked for. *Name of a note per
  annotation* stays, and is no longer hidden behind the toggle. The old value
  is dropped from `data.json`.

- `versions.json`, `version-bump.mjs`, the `npm run version` script and `.npmrc`.
  Versions are now bumped by editing `manifest.json` and `package.json` together;
  the release workflow tags from `manifest.json`.

### Fixed

- A file heading that says the same thing throughout a note is written once, at
  the top, instead of above every annotation. Each topic started the file
  headings over, so that a topic reading from several files says which one each
  annotation came from — but the topics are the annotations' own first lines, so
  as soon as the comments differ every annotation is its own topic, and a note
  extracted from a single PDF repeated one unchanging heading all the way down.
  Such a heading now heads the note, above the topics rather than under the
  first of them. It is still repeated per topic when the annotations really do
  come from more than one folder or file, which is the case it was there for.
- A PDF in the vault root is headed `Vault root` under *Heading above each
  file* → *Folder name*. It has no folder to name, and the empty heading it
  produced was indistinguishable from no heading at all.
- Headings are levelled by what encloses what, so a note reads as an outline and
  the outline pane follows it. The topic heading was always a first-level one
  and the file heading always a second-level one, which put an `h2` over the
  `h1`s in a note headed by its file. Whichever of the two encloses the other
  takes the first level now: the file when one unchanging heading heads the
  note, the topic when the files vary and each topic lists the ones it reads
  from, and whichever is on its own when only one of them is written.
- Every heading is followed by a blank line.
- The `{{file}}` template variable was documented as the file's binary content
  but rendered `[object Object]`. Replaced by `{{filename}}`, the PDF's name
  without its extension. `{{annotation.file}}` still holds the file itself.
- Annotations with nothing to show — no comment, and no text marked up — are no
  longer exported as blank entries.
- A text markup annotation whose `QuadPoints` pdf.js cannot use no longer fails
  the extraction of the whole file.
- `getTextContent` was still being passed `normalizeWhitespace`, an option pdf.js
  removed in v3. Whitespace normalization is its default, so behaviour is
  unchanged.
- Highlights covering only one or two characters returned the neighbouring
  letter (`Word,` highlighted on `o` yielded `r`). Glyph positions inside a text
  item are now estimated from per-letter widths instead of splitting the item
  width evenly.
- Notes were written without awaiting them when exporting one note per
  annotation, so concurrent writes to the same note could race, and failures
  were silently swallowed.
- Settings changes were saved without awaiting the write.
- Reading a PDF from a path outside the vault no longer tries to use Node's `fs`
  on mobile; it reports that the command is desktop only.
- `beforeEach` in the test suite was imported from `node:test`, so
  `jest.clearAllMocks()` never ran between tests.

### Internal

- ESLint migrated to flat config (`eslint.config.mjs`) with the official
  `eslint-plugin-obsidianmd` ruleset; `npm run lint` is clean.
- The pdf.js annotation shape is typed (`RawPDFAnnotation` / `PDFAnnotation` in
  `src/types.ts`) instead of being passed around as `any`, which took the lint
  warnings from 215 to 1.
- `loadSettings` derives the settings it loads from the settings object, so a new
  setting can no longer be forgotten and silently never load.
- Dependencies updated; no known vulnerabilities in the shipped dependencies.

## 1.9.5

add setting to export clipboard path extraction to file, enabling
one-note-per-annotation and tag extraction for external PDFs

## 1.9.4

extract from file path on clipboard can handle single quotes

## 1.9.3

use pdfjs-dist like Obsidian does

## 1.9.2

add new template attribute for page labels

## 1.9.1

avoid duplicate tags, when using option to extract tags from annotation body

## 1.9.0

update packages

## 1.8.2

remove placeholder text `Extracting PDF Comments from...` for
`Extract from every PDF in the current folder`

## 1.8.1

add option to extract tags from annotation body and setting to overwrite
existing export note

## 1.8.0

add option to export each extracted annotation to a separate note

## 1.7.0

add settings for dynamic export path (next to PDF) and export name

## 1.6.0

fix bug after pdfjs api change

## 1.5.0

add setting for export path

## 1.4.0

add support for squiggle annotations

## 1.3.2

bugfix for free text, which is now treated in the same way as a note

## 1.3.1

bugfix for desired annotations setting

## 1.3.0

add support for free text annotations

## 1.2.1

improved annotation extraction

## 1.2.0

added template settings

## 1.1.0

add new function `Extract from the file path in the clipboard` to extract
annotations from PDFs outside Obsidian vault

## 1.0.4

clean up hyphenation
https://github.com/munach/obsidian-extract-pdf-annotations/issues/5

## 1.0.3

updated highlight fetching to use QuadPoints instead of Rectangles
