/**
 * Every string this plugin shows a user, in one place: command names, notices,
 * the settings tab and the one line the formatter writes when a PDF turns out
 * to have nothing in it.
 *
 * Strings that need a value in the middle are functions rather than templates
 * with placeholders, so a translation cannot lose an argument silently.
 *
 * Not here: the annotation subtypes (`Highlight`, `FreeText`, …), which are
 * spelled the way the PDF format spells them, and the template variables
 * (`{{body}}`, …), which are typed into templates and so are part of the
 * plugin's interface rather than its wording.
 */
export const STRINGS = {
	/**
	 * The heading the settings tab opens with. `manifest.json` carries the same
	 * two strings for the plugin browser, which cannot be translated — keep them
	 * in step when either changes.
	 */
	plugin: {
		name: "Advanced PDF Annotations Extractor",
		description:
			"Extract annotations from PDFs with advanced settings and user-friendly features.",
	},

	commands: {
		extractCurrentFile: "Extract from the current file",
		extractClipboardPath: "Extract from the file path in the clipboard",
		extractCurrentFolder: "Extract from every PDF in the current folder",
	},

	notices: {
		clipboardPathIsDesktopOnly:
			"Reading a PDF from a path outside the vault is only available in the desktop app.",
		clipboardPathIsNotAFile: "The path in the clipboard is not a file.",
		clipboardPathUnreadable:
			"The clipboard does not contain a readable file path.",
		extractionFailed: "Could not extract the annotations of this PDF.",
		exportPathInvalid:
			"Error creating note with annotations, because the notes export path is invalid. Please check the file path in the settings. Folders must exist.",
		copied: (variable: string) => `Copied ${variable} to the clipboard.`,
		copyFailed: "Could not copy to the clipboard.",
		/**
		 * One whole sentence per outcome rather than one sentence with the kind
		 * spliced in: a fragment like "notes" cannot be translated on its own,
		 * since the case it takes depends on the sentence around it.
		 */
		templatesCollapsed: {
			notes: "The templates for PDFs inside and outside the vault are now one per annotation kind — {{filelink}} links whichever the PDF is. Your template for notes of PDFs outside the vault differed by more than the link, so it was kept in data.json under legacyExternalTemplates instead of being merged.",
			highlights:
				"The templates for PDFs inside and outside the vault are now one per annotation kind — {{filelink}} links whichever the PDF is. Your template for highlights of PDFs outside the vault differed by more than the link, so it was kept in data.json under legacyExternalTemplates instead of being merged.",
			both: "The templates for PDFs inside and outside the vault are now one per annotation kind — {{filelink}} links whichever the PDF is. Your templates for notes and highlights of PDFs outside the vault differed by more than the link, so they were kept in data.json under legacyExternalTemplates instead of being merged.",
		},
	},

	/** Written into the exported note, not shown in the interface. */
	output: {
		noAnnotations: "*No annotations*",
	},

	/**
	 * What the settings hold before anyone edits them. Wording, not mechanism:
	 * these end up in exported notes, so "noted by" and "Annotations for" are
	 * as much this plugin's English as any label is.
	 *
	 * The `{{variables}}` are not translatable — they are the names the
	 * formatter resolves. Only the words around them may change.
	 */
	defaults: {
		noteTemplate:
			"{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on {{filelink}}*\n\n",
		highlightTemplate:
			"> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on {{filelink}}*\n\n",
		exportName: "Annotations for {{filename}}",
		oneNotePerAnnotationExportName:
			"Annotations for {{filename}}-{{counter}}",
	},

	/** What each annotation type is, as its checkbox is labelled. */
	annotationTypes: {
		Highlight: "Highlighted text",
		Underline: "Underlined text",
		Squiggly: "Squiggly underlined text",
		StrikeOut: "Struck out text",
		Text: "Sticky note comment",
		FreeText: "Free text on the page",
	},

	/** What each template variable resolves to. */
	templateVariables: {
		highlightedText: "Highlighted text from PDF",
		folder: "Folder of the PDF file",
		filename: "File name of the PDF (without the extension)",
		filepath: "Path to the PDF file",
		filelink:
			"A [[wikilink]] for PDFs in the vault and a file:// path for PDFs outside",
		pageNumber:
			"Page number of annotation (relative to number of physical pages)",
		pageLabel:
			"Page label of annotation (relative to number of defined page indexes)",
		author: "Author of the annotation",
		body: "Body of the annotation",
		topic: "First line of the body, when sorting by topic is enabled",
		isExternal:
			"True for PDFs outside the vault, for {{#if isExternal}} in a template",
	},

	settings: {
		annotations: {
			name: "Annotations to extract",
			desc: "Choose, which annotation types will be extracted. Highlight, underline, squiggly and strikeout also capture the PDF text underneath them — others contribute their own comment only.",
		},

		templates: {
			heading: "Templates",
			/**
			 * One paragraph rather than the pieces around the link: the link is
			 * woven in at render time by looking for `handlebarsLink` inside
			 * it, so a translation can put that word where its own grammar
			 * wants it instead of where English left a gap.
			 */
			instructions:
				"The following settings determine how the highlights and notes created by the plugin will be rendered. There are two, because annotations that mark up PDF text carry the text they mark up and the others do not. Both are used for PDFs inside and outside the vault alike: {{filelink}} links the PDF the way its location calls for. Templates are interpreted using Handlebars syntax. The following variables are available:",
			handlebarsLink: "Handlebars",
			variableColumn: "Variable",
			descriptionColumn: "Description",
			copyTooltip: "Copy to clipboard",
			copyLabel: (variable: string) => `Copy ${variable}`,
			highlightName: "Template for highlights",
			highlightDesc:
				"Used for the annotation types that mark up PDF text, so {{highlightedText}} holds what they mark up.",
			noteName: "Template for notes",
			noteDesc:
				"Used for the annotation types that only carry a comment, so {{highlightedText}} is empty.",
		},

		structure: {
			heading: "Structure",
			useStructuringHeadlinesName: "Use structuring headlines",
			useStructuringHeadlinesDesc:
				"If disabled, no structuring headlines will be shown. Just the annotations in the specified template style.",
			useFolderNamesName: "Use folder name",
			useFolderNamesDesc:
				"If enabled, uses the PDF's folder name (instead of the PDF-filename) for sorting",
			sortByTopicName: "Sort by topic",
			sortByTopicDesc:
				"If enabled, uses the notes first line as topic for primary sorting",
		},

		noteExport: {
			heading: "Note export",
			exportPathName: "Notes export path",
			exportPathDesc:
				"The path to which the notes, including the extracted annotations, will be exported. The path can be dynamic './' to create a note next to the PDF or it has to be relative to the vault root. Paths must end with a '/'. Leave blank to export to the vault root.",
			exportNameName: "Notes export name",
			exportNameDesc:
				"The name of the note to which the notes, including the extracted annotations, will be exported. You can use the variable '{{filename}}' to use the PDF's filename and combine it with prefix or suffix. If you don't use the variable all notes will be exported to the same file until you change the name.",
			oneNotePerAnnotationName: "One note per annotation",
			oneNotePerAnnotationDesc:
				"If enabled, every annotation is exported to a separate note.",
			oneNotePerAnnotationExportNameName:
				"One note per annotation - export name",
			oneNotePerAnnotationExportNameDesc:
				"The name of the notes to which each extracted annotation will be exported. You can use the variable '{{filename}}' to use the PDF's filename and combine it with prefix or suffix. Additionally you should use the variable '{{counter}}' to add the index of the exported annotation.",
			overwriteExistingNoteName: "Overwrite existing note",
			overwriteExistingNoteDesc:
				"If enabled, the plugin will overwrite the content of an existing note with the same name.",
			extractTagsName: "Extract tags in annotations as Obsidian tags",
			extractTagsDesc:
				"If enabled, the plugin will extract tags from the annotations and add them as Obsidian tags to the note's header.",
			exportClipboardExtractionName:
				"Export annotations from clipboard path to file",
			exportClipboardExtractionDesc:
				"When enabled, the clipboard path command saves annotations to a file using the export settings above, instead of inserting them into the note you are editing.",
		},
	},
};
