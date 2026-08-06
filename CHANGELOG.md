# Changelog

<!-- The release workflow turns the section of the version in manifest.json into
the GitHub release notes, so every released version needs a `## <version>`
heading here spelled exactly as in manifest.json. Rename `## Unreleased` to the
new version number in the same commit that bumps manifest.json and
package.json. -->

## Unreleased

### A clipboard path may name a folder

* **A folder in the clipboard extracts every PDF in it.** All three clipboard commands take a folder path as well as a file path: into the current note they arrive as one insertion, and into new notes as a note per PDF — the note name is a template over the file it was read from. The folder itself is read, not the folders under it, and a PDF that will not open is named and skipped rather than taking the rest of the folder with it.
* **Nothing is opened when a folder wrote more than one note**, which would otherwise bury whatever you were looking at.

### The settings are split by the kind of extraction they apply to

The tab now has three sections in place of four, and every setting sits in the one that says when it takes effect. Nothing about how an extraction behaves has changed — only where it is asked for.

* **"General extraction rules"** — what every extraction obeys: reading the topic of each comment and heading the annotations that share it, where the notes go, whether tags move to the properties, and whether an existing note is overwritten.
* **"Extraction to separate notes"** — a note of its own for each annotation: naming it after its comment's topic, the pattern that stands in when there is no topic, and the subfolder.
* **"Extraction to shared notes"** — one note for all the annotations of a PDF. Grouping by folder, by file and by creation date live here with the headings they write, since a note holding a single annotation has nothing to gather and never carried those headings.
* **Each grouping now sits directly above the heading it controls**, so a greyed-out heading toggle has its reason on the row above it. The separate "Annotation grouping" and "Headings" sections are gone.
* **The subfolder now applies to an extraction into separate notes only** — that is the extraction whose notes it keeps together — and it applies under either destination, the folder of the open file as well as a folder of the vault. An extraction into one note ignores it.

### Grouping reads from the outside in

* **Grouping by file.** A new setting gathers every annotation of the same PDF together, on by default. Switched off, annotations from several PDFs are read page by page across all of them.
* **The groupings nest widest first:** folder, file, creation date, topic — the order they are now listed in and applied in. Headings follow the same order, so the outline pane reads the note as the grouping built it.
* **Grouping by folder and by file applies only to an extraction that spans several of them.** One folder or one file is what the ordinary extraction reads, and it has nothing to separate.
* **A heading toggle per grouping.** The "add file headings" dropdown is now two toggles, "add folder headings" and "add file headings", so a note can carry both — the folder around the file it holds. Each heading toggle follows the grouping it heads and greys out while that grouping is off, as the date and topic headings already did, and the four are listed in the order they nest: folder, file, date, topic.


## 1.1.0

### Settings could be searched now

* **Requires Obsidian 1.13.0.** The settings tab is now declared through the API that version introduced. Earlier releases stay available to earlier versions of Obsidian.
* **The settings are searchable.** Every section of the tab is indexed — its name, its description, the settings inside it and the template variables — so searching Obsidian's settings for a folder, a tag rule or `{{topic}}` lands on the section that holds it.


## 1.0.0

### Initial release

* **Every annotation type.** Highlights, underlines, squiggly and struck out text bring the PDF text beneath them; sticky notes and free text bring what you typed. Pick the types from a grid of checkboxes.
* **PDFs inside and outside the vault.** Extract from the file you are reading, from every PDF in the current folder, or from a path in the clipboard.
* **Extraction with advanced settings.** One command opens a window that asks what to extract: the annotation types, the PDF, the pages, the days and where the notes go.
* **Pages by range or by label.** Type `25-50`, `25, 26, 30` or `i-viii`, read either as physical pages or as the labels the author gave them.
* **Extract only certain days.** Every day the file's annotations were made on is listed and can be left out. Undated annotations are their own entry.
* **A template for every annotation type.** The default template writes every type, and any type given a template of its own is written with that instead.
* **Fourteen template variables.** `{{highlightedText}}`, `{{body}}`, `{{topic}}`, `{{type}}`, `{{created}}`, `{{createdTime}}`, `{{author}}`, `{{pageNumber}}`, `{{pageLabel}}`, `{{filename}}`, `{{filepath}}`, `{{folder}}`, `{{filelink}}` and `{{isExternal}}`, listed in a table that copies them on click.
* **A warning before the hole appears.** A template asking a type for something it never carries — `{{highlightedText}}` on a sticky note — marks the variable in the editor and says why on hover.
* **Notes where you want them.** Into the note being edited, into a new note, or into a note per annotation. The subfolder takes a template, so `{{filename}}` gives every PDF a folder of its own.
* **Note names from a template or from the topic.** A note per annotation can be named after its comment's first line, which is then left out of the note.
* **Grouping by topic, date and folder.** Each independent of the others, with a separate choice of what gets a heading. Heading levels follow what encloses what, so the outline pane reads the note correctly.
* **Tags into note properties.** Tags written in your comments move into the note's `tags` property, in any script. Choose never, always, extractions into one note, or extractions into separate notes.
* **English and Russian interface.** The plugin follows Obsidian's own language and falls back to English. Dates and the default templates are translated too.
