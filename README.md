# Obsidian Extract PDF Annotations Plugin

This is a plugin for [Obsidian](https://obsidian.md). It extracts all types of annotations (highlight, underline, squiggle, note, free text, etc.) from PDF files inside and outside the Obsidian Vault.
It can be used on single PDF files (see [`Extract from the current file` and `Extract from the file path in the clipboard`](#commands)) or even on a whole directory containing PDFs (see [`Extract from every PDF in the current folder`](#commands)) for batch extraction.

## Features
* `Extract from every PDF in the current folder` Works when editing a markdown note. Searches all PDF files in current Folder for annotations, and inserts them at the current position of the open note. 
* `Extract from the current file` Works while displaying a PDF file inside the Obsidian PDF-Viewer. Extracts annotations from this file and writes them to the note `Annotations for <filename>`
* `Extract from the file path in the clipboard` Works when editing a markdown note. Looks for a file path of a PDF in clipboard, extracts annotations from it and inserts them at the current position of the open note. This command can be used for external PDF files, which are not part of the Obsidian Vault. Helpful, if you do not want to copy your PDFs inside your vault. Desktop only, since it reads a file from outside the vault.

## Plugin Settings
* Annotations to extract
	* A grid of checkboxes, one per annotation type, so you can pick exactly what gets extracted:
		- Text markup, which also captures the PDF text underneath it: `Highlight`, `Underline`, `Squiggly`, `StrikeOut`
		- Typed text: `Text` (sticky note), `FreeText`
	* `Highlight`, `Underline` and `Text` are enabled by default
	* Purely graphical annotations (drawings, shapes, stamps, attachments) are not offered — there is nothing in them a markdown note could show
* Styling
	* One template card with a picker: the default template, which writes every annotation type, and a template of its own for any type you give one — chosen from the same picker, and left empty to hand the type back to the default. Templates are used for PDFs inside and outside the vault alike — `{{filelink}}` renders a `[[wiki link]]` for a PDF in the vault and the `file://` path for one outside it. The following template variables are available and can be used by following the [Handlebars]('https://handlebarsjs.com/guide/expressions.html') syntax: 
		- {{highlightedText}}: 'Highlighted text from PDF' (empty for the types that mark up nothing),
		- {{folder}}: 'Folder of PDF file',
		- {{filename}}: 'File name of the PDF, without the extension',
		- {{filepath}}: 'Path of PDF file',
		- {{filelink}}: 'Link to the PDF, bracketed for the vault and plain for outside it',
		- {{pageNumber}}: 'Page number of annotation with reference to PDF pages',
		- {{pageLabel}}: 'Page label (page number defined by author)',
		- {{author}}: 'Author of annotation',
		- {{body}}: 'Body of annotation',
		- {{type}}: 'Annotation type as the PDF names it: `Highlight`, `Underline`, `Squiggly`, `StrikeOut`, `Text` or `FreeText`',
		- {{topic}}: 'First line of the body. Grouping by topic also takes it out of `{{body}}`, since it is written as a heading instead',
		- {{isExternal}}: 'True for PDFs outside the vault, for `{{#if isExternal}}`'
		
		The annotation itself is available as `{{annotation}}` for anything without a shortcut, e.g. `{{annotation.subtype}}`.
		
		Upgrading from a version with four templates: the two you had for PDFs inside the vault are carried over, with `[[{{filepath}}]]` rewritten to `{{filelink}}`. An external template you had customised differently is kept in `data.json` under `legacyExternalTemplates` so you can copy it back.

		Upgrading from a version with two templates: the one that wrote plain comments becomes the default, and the one that wrote text markup becomes the template of `Highlight`, `Underline`, `Squiggly` and `StrikeOut` — unless the two said the same thing, in which case the default covers everything and no type needs one.
	* Structure
		* Use structuring headlines or not, if you only want to display annotations in the specified template
		* Use the first line of the comment as 'Topic' (and sort accordingly), or not
		* Use folder name or PDF-filename for sorting
* Note export
	* Specify the export path for the command
	* Specify the export name for the command
	* Create one note per annotation
	* Specify the export name for each note per annotation

## How it works
`Extract from every PDF in the current folder`

This command visits all PDF files in the current directory and extracts comments and highlights from the PDF files into the open note. It treats the first line of every comment as *Topic* for grouping the comments. 

Assume we have in a folder in our Vault containing PDF files, e.g: 

![vault_folder](https://github.com/munach/obsidian-pdf-annotations/blob/master/img/vault_folder.jpg?raw=true)

and we have highlighted the Julia Hello World Programm with a note 'Hello World': 

![pdf_note](https://github.com/munach/obsidian-pdf-annotations/blob/master/img/pdf_note.jpg?raw=true)

In the editor (e.g. \_Extract) we run the plugin's command  `Extract from every PDF in the current folder` (Hotkey Ctrl-P for all Commands). This will fetch all annotations in the PDF files in the current folder and sort them by *Topic*: 

![extracted_annotations](https://github.com/munach/obsidian-pdf-annotations/blob/master/img/extracted_annotations.jpg?raw=true)

As such, you can relate comments for your topics (here 'Hello World') from several PDF files.

## Versions

See [CHANGELOG.md](CHANGELOG.md).

## Installation / Build

Fetch repository: 
```bash
$ git clone https://github.com/munach/obsidian-extract-pdf-annotations.git
$ cd obsidian-extract-pdf-annotations
```
Install dependencies: 
```
$ npm i
```

Transpile `main.ts`: 
```
$ npm run build
```

Then create the plugin directory and copy the files `main.js`, `manifest.json` and `styles.css`, e.g.; 
```
$ mkdir ~/MyVault/.obsidian/plugins/obsidian-extract-pdf-annotations
$ cp main.js manifest.json styles.css ~/MyVault/.obsidian/plugins/obsidian-extract-pdf-annotations/
```

Enable the plugin in Obsidan's setting. 

## Issues / Bugs

[] works only on left-to-right highlights 

## Credits

This plugin builds on ideas from Alexis Rondeaus Plugin https://github.com/akaalias/obsidian-extract-pdf-highlights, but uses obsidians build-in pdf.js library. 

## Author

Franz Achermann and Florian Stöckl



