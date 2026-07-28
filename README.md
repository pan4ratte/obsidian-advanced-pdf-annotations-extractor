# Classy PDF Extractor plugin

Extract every kind of annotation — highlights, underlines, squiggly and struck out text, sticky notes and free text — from PDFs inside and outside your vault, and write them into notes you have shaped yourself. Pick the annotation types, choose the pages and the days they were made on, format each type with its own Handlebars template, group them by topic, date and folder, and send them to the current note, a new one, or a note per annotation. The interface is available in English and Russian.

> This plugin started as a fork of [Extract PDF Annotations](https://github.com/munach/obsidian-extract-pdf-annotations). It keeps the idea and very little else: the extraction was rebuilt, a long list of bugs was fixed — sorting outside the Latin alphabet, tags in any script, note names the vault refused, heading levels, single-character highlights — and every part of the interface was reworked. Treat it as a different plugin rather than a newer version of that one.

## Features

### 1. Every annotation type, chosen with checkboxes

Highlights, underlines, squiggly and struck out text bring the PDF text underneath them along; sticky notes and free text bring what you typed. Pick the types from a grid of checkboxes instead of typing their names. Purely graphical annotations — drawings, shapes, stamps, attachments — are not offered, because there is nothing in them a markdown note could show.

### 2. PDFs inside and outside the vault

Extract from the file you are reading, from every PDF in the current folder, or from a path in the clipboard for PDFs you would rather not copy into the vault. `{{filelink}}` links whichever it is: a `[[wiki link]]` inside the vault, the `file://` path outside it.

### 3. Extraction with advanced settings

One command opens a window that asks what to extract rather than deciding beforehand. Search the vault's PDFs or paste a path — a path already in the clipboard is filled in for you. Narrow the extraction to certain pages (`25-50`, `25, 26, 30`, `i-viii`), read against physical pages or the labels the author gave them. Tick off the days the annotations were made on, listed from the file itself. Then choose where the result goes: the current note, a new note, or a note per annotation.

### 4. A template for every annotation type

One card with a picker: the default template writes every type, and any type you give a template of its own is written with that instead. Empty a type's template and it goes back to the default. A table of variables sits above the editor, each one clickable to copy, and the editor itself is monospaced with a numbered gutter.

### 5. Grouping, headings and note naming

Group the annotations by topic — the first line of each comment — by the day they were made, and by folder, each independently of the others. Headings are a separate question from grouping, and their levels follow what encloses what, so a note reads as an outline and the outline pane follows it. Notes can be named from a template, or after the annotation's own topic.

### 6. Tags into note properties

Tags written in your comments are moved into the note's `tags` property rather than left in its text, in any script you annotate in. Choose whether that happens never, always, only for extractions into one note, or only for extractions into separate notes.

### 7. English and Russian interface

The plugin follows Obsidian's own language, falling back to English. Dates in the extraction window, the notes it writes and every setting are translated.

## Credits

A fork of [Extract PDF Annotations](https://github.com/munach/obsidian-extract-pdf-annotations) by Franz Achermann and Florian Stöckl, which in turn built on ideas from [Alexis Rondeau's plugin](https://github.com/akaalias/obsidian-extract-pdf-highlights). Like both of them, it reads PDFs with the pdf.js library Obsidian already ships.

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for the build. Release notes are in [CHANGELOG.md](CHANGELOG.md).
