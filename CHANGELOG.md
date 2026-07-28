# Changelog

<!-- The release workflow turns the section of the version in manifest.json into
the GitHub release notes, so every released version needs a `## <version>`
heading here spelled exactly as in manifest.json. Rename `## Unreleased` to the
new version number in the same commit that bumps manifest.json and
package.json. -->

## Unreleased

### Initial release of the the plugin

We build on top of the other project, but we change literally verthing. This release reworks how an extraction is asked for and what it writes. The choice of what to extract moved out of the settings and into the moment you ask for it, templates are now per annotation type, and the annotations can be grouped by the day they were made:

* **Extract annotations with advanced settings.** A command opening a modal that asks what to extract: the annotation types, the PDF, the pages, the dates and where the notes go.
* **Any PDF, from the modal.** The file field searches the vault's PDFs and takes a path from outside it as well; a path already in the clipboard is filled in when it names a readable PDF.
* **Pages by range or by label.** Type `25-50`, `25, 26, 30`, `25-50, 55, 88` or `i-viii`. *Look for page labels, not physical pages* reads them as the labels the author gave, so an arabic range never matches a roman label.
* **Extract only certain days.** *Select dates for extraction* lists every day the file's annotations were made on, each of which can be left out. Undated annotations are their own entry.
* **A template for every annotation type.** One card with a picker: *Default* writes every type, and picking a type writes that type instead. Emptying a type's template hands it back to the default.
* **Group by creation date.** Keeps the annotations made on the same day together, with *Heading above each date* writing the day above them. Off by default.
* **Name a note after its annotation's topic.** *Put the topic of the annotation to the note name* names each note per annotation after its comment's first line, and leaves that line out of the note.
* **Ordering and headings are separate settings.** *Group by folder* decides the order, *Heading above each file* decides what is written between the annotations.

Please note: the fork has a plugin id of its own, so it starts from its own settings rather than reading those of the plugin it forked from. Set it up once in its settings tab.

### New features

* **`{{type}}` template variable.** The annotation's type as the PDF names it: `Highlight`, `Underline`, `Squiggly`, `StrikeOut`, `Text` or `FreeText`.
* **`{{created}}` template variable.** The day the annotation was made.
* **`{{topic}}` template variable.** The first line of the comment. It was reachable before but undocumented, and is now read whether or not grouping by topic is on.
* **`{{filelink}}` template variable.** A `[[wiki link]]` for a PDF in the vault and the `file://` path for one outside it, with `{{isExternal}}` for templates that word the two cases differently.
* **`StrikeOut` annotations can be extracted.** The fourth text markup type, capturing the struck out text. Not enabled by default.
* **Commands for a note per annotation.** *Extract from the current file into a note per annotation* and *Extract from the file path in the clipboard into a note per annotation*, replacing the setting that decided this for every command at once.
* **Extract a PDF outside the vault into a new note.** *Extract from the file path in the clipboard into a new note*, which needs no note open, alongside the command that inserts into the one being edited.
* **A subfolder named by a template.** Set *Notes export subfolder* to `{{filename}}` and every PDF's notes go in a folder of their own. Missing folders are created.
* **Russian translation.** The interface follows Obsidian's own language, English otherwise. Dates in the list read as *25 июля 2026*, and the default templates write their notes in Russian too.
* **Tag extraction is a choice of four.** *Never*, *always*, *single note extraction* or *extraction to separate notes* — a tag means the PDF's subject on a note holding every annotation, and the one comment's subject on a note per annotation.

### UI/UX enhancements and bug fixes

* A setting another setting has taken the question out of is hidden rather than shown disabled, opening and closing with the same motion as the *Template variables* panel.
* The annotation types are picked from a grid of checkboxes labelled with what each type means, instead of being typed into a text field.
* The template variables are a table, each with a button that copies the variable.
* Each template field is a full-width monospaced box with a numbered gutter, and no soft wrapping, so a number always means a line.
* The settings tab uses Obsidian's own heading style and opens with the plugin name and description.
* The settings that say where a note goes no longer call it an export: nothing leaves Obsidian.
* Notes per annotation are written without the headings that group — a note holding one annotation has nothing to group by them.
* `No topic 1`, `No topic 2` and so on name the notes whose annotation has no comment to name them from.
* Extracting tags is heeded by the commands that insert into the note being edited, which ignored it altogether.
* Extracting tags moves the tags rather than copying them, so a tag stands in the note's properties instead of in two places.
* Commands no longer repeat the plugin name. The command IDs are unchanged, so existing hotkeys keep working.
* Every user-facing string moved to `lang/en.ts`, so the plugin can be translated without touching its logic.
* Fixed a bug where a command asked to write beside the current file with no file open put the notes in the vault root without a word.
* Fixed sorting of topics, folders and file names, which read every alphabet as if it were ASCII — `ё` fell after `я`, `ä` after `z`. Numbers in them are read as numbers, so `Chapter 2.pdf` comes before `Chapter 10.pdf`.
* Fixed a bug where extracting tags matched Latin letters only, so a tag in Cyrillic, Greek, Hebrew, Arabic or Chinese was not a tag at all.
* Fixed a bug where tags on a comment's first line reached no note's properties when sorting by topic split that line off.
* Fixed a bug where *Name of a note per annotation* rendered only `{{filename}}` and `{{counter}}`, so a template of anything else wrote a hidden `.md` or nothing at all.
* Fixed a bug where a note name was cut inside a character rather than between two, so a name of emoji could end in half a character no file system would take.
* Fixed a bug where characters Obsidian rejects were left in a note name, so a topic of `Chapter 1: a study?` was refused as a path.
* Fixed a bug where a file heading that says the same thing throughout a note was repeated above every annotation instead of written once at the top.
* Fixed a bug where a PDF in the vault root produced an empty heading; it is headed `Vault root` now.
* Fixed heading levels, which put an `h2` over the `h1`s in a note headed by its file. Whichever heading encloses the other takes the first level now.
* Fixed a bug where `{{file}}` rendered `[object Object]`. Replaced by `{{filename}}`; `{{annotation.file}}` still holds the file itself.
* Fixed a bug where highlights covering one or two characters returned the neighbouring letter — `Word,` highlighted on `o` yielded `r`.
* Fixed a bug where a highlight spanning several lines came out with its lines reversed. Some readers write the quads of a highlight dragged upwards bottom line first, and they were joined in the order given; they are now put into reading order — down the page, then left to right along each line.
* Fixed a bug where a text markup annotation with `QuadPoints` pdf.js cannot use failed the extraction of the whole file.
* Fixed a bug where notes were written without being awaited for a note per annotation, so concurrent writes could race and failures were swallowed.
* Fixed a bug where reading a PDF from a path outside the vault tried to use Node's `fs` on mobile instead of reporting the command as desktop only.
* Annotations with nothing to show — no comment and no text marked up — are no longer written as blank entries.
* Every heading is followed by a blank line.
* Failures of the clipboard path command are reported with a notice instead of a console message.
* Removed *Export annotations from clipboard path to file* and *One note per annotation*, both of which changed what a command did from somewhere else. Each is a command of its own now.
* Removed `versions.json`, `version-bump.mjs`, the `npm run version` script and `.npmrc`. Versions are bumped by editing `manifest.json` and `package.json` together.
* `styles.css` is a new release asset, so themes can restyle the settings tab.
* Releases are cut automatically when the `manifest.json` version changes, with build provenance attestation and notes taken from this file.
* The pdf.js annotation shape is typed instead of being passed around as `any`, taking the lint warnings from 215 to 1; ESLint moved to flat config with the official Obsidian ruleset.
* Dependencies updated; no known vulnerabilities in the shipped dependencies.


## 1.9.5

### New features

* **Export clipboard path extraction to file.** Enables one note per annotation and tag extraction for PDFs outside the vault.


## 1.9.4

### UI/UX enhancements and bug fixes

* Extraction from a file path in the clipboard now handles single quotes.


## 1.9.3

### UI/UX enhancements and bug fixes

* Switched to `pdfjs-dist`, the way Obsidian loads it.


## 1.9.2

### New features

* **`{{pageLabel}}` template variable.** The page label the author gave the page.


## 1.9.1

### UI/UX enhancements and bug fixes

* Fixed duplicate tags when extracting tags from the annotation body.


## 1.9.0

### UI/UX enhancements and bug fixes

* Updated dependencies.


## 1.8.2

### UI/UX enhancements and bug fixes

* Removed the `Extracting PDF Comments from...` placeholder text from *Extract from every PDF in the current folder*.


## 1.8.1

### New features

* **Extract tags from the annotation body.**
* **Overwrite an existing export note.**


## 1.8.0

### New features

* **One note per extracted annotation.**


## 1.7.0

### New features

* **Dynamic export path and export name.** The notes can be written beside the PDF, under a name of your own.


## 1.6.0

### UI/UX enhancements and bug fixes

* Fixed a bug after a pdf.js API change.


## 1.5.0

### New features

* **Export path setting.**


## 1.4.0

### New features

* **Squiggly annotation support.**


## 1.3.2

### UI/UX enhancements and bug fixes

* Fixed free text annotations, which are now treated the same way as notes.


## 1.3.1

### UI/UX enhancements and bug fixes

* Fixed the desired annotations setting.


## 1.3.0

### New features

* **Free text annotation support.**


## 1.2.1

### UI/UX enhancements and bug fixes

* Improved annotation extraction.


## 1.2.0

### New features

* **Template settings.**


## 1.1.0

### New features

* **Extract from the file path in the clipboard.** Extracts annotations from PDFs outside the Obsidian vault.


## 1.0.4

### UI/UX enhancements and bug fixes

* Cleaned up [hyphenation](https://github.com/munach/obsidian-extract-pdf-annotations/issues/5).


## 1.0.3

### UI/UX enhancements and bug fixes

* Highlight fetching uses `QuadPoints` instead of rectangles.
