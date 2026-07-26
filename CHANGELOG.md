# Changelog

The release workflow turns the section of the version in `manifest.json` into the
GitHub release notes, so every released version needs a `## <version>` heading
here spelled exactly as in `manifest.json`. Rename `## Unreleased` to the new
version number in the same commit that bumps `manifest.json` and `package.json`.

## Unreleased

### Added

- `{{topic}}` template variable, holding the first line of the annotation body
  when sorting by topic is enabled. It was already reachable but undocumented.
- `StrikeOut` annotations can now be extracted. It is the fourth text markup
  type, so it captures the struck out text the way highlights, underlines and
  squigglies do. Not enabled by default — tick it in the settings.

### Changed

- The desired annotation types are picked from a grid of checkboxes instead of
  being typed into a text field, so the type names can no longer be misspelled.
  Hover a type for what it means.
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
  `Desired annotations`, `Styling`, `Templates`, `Structure` and `Note export`.
- Text area sizing moved out of inline styles into `styles.css`, so themes can
  restyle it. `styles.css` is a new release asset.
- Failures of the clipboard path command are reported with a notice instead of a
  console message.
- Releases are cut automatically when the `manifest.json` version changes, with
  build provenance attestation and notes taken from this file.

### Removed

- `versions.json`, `version-bump.mjs`, the `npm run version` script and `.npmrc`.
  Versions are now bumped by editing `manifest.json` and `package.json` together;
  the release workflow tags from `manifest.json`.

### Fixed

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
