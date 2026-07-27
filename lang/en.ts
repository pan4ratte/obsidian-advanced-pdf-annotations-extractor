export default {
    // ─── Plugin ──────────────────────────────────────────────────────────────────
    // Also in manifest.json, which the plugin browser reads and no translation
    // can reach. Change both together.
    PLUGIN_NAME: "Advanced PDF Annotations Extractor",
    PLUGIN_DESCRIPTION: "Extract annotations from PDFs with advanced settings and user-friendly features.",

    // ─── Commands ────────────────────────────────────────────────────────────────
    COMMAND_EXTRACT_CURRENT_FILE: "Extract from the current file",
    COMMAND_EXTRACT_CLIPBOARD_PATH: "Extract from the file path in the clipboard",
    COMMAND_EXTRACT_CURRENT_FOLDER: "Extract from every PDF in the current folder",

    // ─── Notices ─────────────────────────────────────────────────────────────────
    NOTICE_CLIPBOARD_DESKTOP_ONLY: "Reading a PDF from a path outside the vault is only available in the desktop app.",
    NOTICE_CLIPBOARD_NOT_A_FILE: "The path in the clipboard is not a file.",
    NOTICE_CLIPBOARD_UNREADABLE: "The clipboard does not contain a readable file path.",
    NOTICE_EXTRACTION_FAILED: "Could not extract the annotations of this PDF.",
    NOTICE_EXPORT_PATH_INVALID: "Error creating note with annotations, because the notes export path is invalid. Please check the file path in the settings. Folders must exist.",
    NOTICE_COPIED: "Copied to the clipboard",
    NOTICE_COPY_FAILED: "Could not copy to the clipboard.",
    NOTICE_TEMPLATES_COLLAPSED: "The templates for PDFs inside and outside the vault are now one per annotation kind — {{filelink}} links whichever the PDF is. A template of yours for PDFs outside the vault differed by more than the link, so it was kept in data.json under legacyExternalTemplates instead of being merged.",

    // ─── Written into exported notes ─────────────────────────────────────────────
    // The {{variables}} are names the formatter resolves; only the words around
    // them may be translated.
    NOTE_NO_ANNOTATIONS: "*No annotations*",
    DEFAULT_HIGHLIGHT_TEMPLATE: "> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on {{filelink}}*\n\n",
    DEFAULT_NOTE_TEMPLATE: "{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on {{filelink}}*\n\n",
    DEFAULT_EXPORT_NAME: "Annotations for {{filename}}",
    DEFAULT_ONE_NOTE_EXPORT_NAME: "Annotations for {{filename}}-{{counter}}",

    // ─── Annotation types ────────────────────────────────────────────────────────
    ANNOT_HIGHLIGHT: "Highlighted text",
    ANNOT_UNDERLINE: "Underlined text",
    ANNOT_SQUIGGLY: "Squiggly underlined text",
    ANNOT_STRIKEOUT: "Struck out text",
    ANNOT_TEXT: "Sticky note comment",
    ANNOT_FREE_TEXT: "Free text on the page",

    // ─── Template variables ──────────────────────────────────────────────────────
    VAR_HIGHLIGHTED_TEXT: "Highlighted text from PDF",
    VAR_FOLDER: "Folder of the PDF file",
    VAR_FILENAME: "File name of the PDF (without the extension)",
    VAR_FILEPATH: "Path to the PDF file",
    VAR_FILELINK: "A [[wikilink]] for PDFs in the vault and a file:// path for PDFs outside",
    VAR_PAGE_NUMBER: "Page number of annotation (relative to number of physical pages)",
    VAR_PAGE_LABEL: "Page label of annotation (relative to number of defined page indexes)",
    VAR_AUTHOR: "Author of the annotation",
    VAR_BODY: "Body of the annotation",
    VAR_TOPIC: "First line of the body, when sorting by topic is enabled",
    VAR_IS_EXTERNAL: "True for PDFs outside the vault, for {{#if isExternal}} in a template",

    // ─── Settings: annotations ───────────────────────────────────────────────────
    SETTING_ANNOTATIONS_NAME: "Annotations to extract",
    SETTING_ANNOTATIONS_DESC: "Choose, which annotation types will be extracted. Highlight, underline, squiggly and strikeout also capture the PDF text underneath them — others contribute their own comment only.",

    // ─── Settings: templates ─────────────────────────────────────────────────────
    // One sentence, not the pieces either side of the link: the link is woven in
    // by looking for HANDLEBARS_LINK inside it, so a translation can put that
    // word where its own grammar wants it.
    SECTION_TEMPLATES: "Extraction templates",
    SECTION_TEMPLATES_DESC: "Use templates to define the look of the extracted annotations. Variables reference table below lists available Handlebars syntax options: on extraction those variables will be replaced with their corresponding values.",
    HANDLEBARS_LINK: "Handlebars",
    SHOW_VARIABLES_TABLE: "Show variables reference table",
    HIDE_VARIABLES_TABLE: "Hide variables reference table",
    TABLE_VARIABLE: "Variable (click to copy)",
    TABLE_DESCRIPTION: "Description",
    COPY_TOOLTIP: "Copy to clipboard",
    SETTING_HIGHLIGHT_TEMPLATE_NAME: "Template for highlights",
    SETTING_HIGHLIGHT_TEMPLATE_DESC: "Used for the annotation types that mark up PDF text, so {{highlightedText}} holds what they mark up.",
    SETTING_NOTE_TEMPLATE_NAME: "Template for notes",
    SETTING_NOTE_TEMPLATE_DESC: "Used for the annotation types that only carry a comment, so {{highlightedText}} is empty.",

    // ─── Settings: structure ─────────────────────────────────────────────────────
    SECTION_STRUCTURE: "Structure",
    SETTING_HEADLINES_NAME: "Use structuring headlines",
    SETTING_HEADLINES_DESC: "If disabled, no structuring headlines will be shown. Just the annotations in the specified template style.",
    SETTING_FOLDER_NAMES_NAME: "Use folder name",
    SETTING_FOLDER_NAMES_DESC: "If enabled, uses the PDF's folder name (instead of the PDF-filename) for sorting",
    SETTING_SORT_BY_TOPIC_NAME: "Sort by topic",
    SETTING_SORT_BY_TOPIC_DESC: "If enabled, uses the notes first line as topic for primary sorting",

    // ─── Settings: note export ───────────────────────────────────────────────────
    SECTION_NOTE_EXPORT: "Note export",
    SETTING_EXPORT_PATH_NAME: "Notes export path",
    SETTING_EXPORT_PATH_DESC: "The path to which the notes, including the extracted annotations, will be exported. The path can be dynamic './' to create a note next to the PDF or it has to be relative to the vault root. Paths must end with a '/'. Leave blank to export to the vault root.",
    SETTING_EXPORT_NAME_NAME: "Notes export name",
    SETTING_EXPORT_NAME_DESC: "The name of the note to which the notes, including the extracted annotations, will be exported. You can use the variable '{{filename}}' to use the PDF's filename and combine it with prefix or suffix. If you don't use the variable all notes will be exported to the same file until you change the name.",
    SETTING_ONE_NOTE_NAME: "One note per annotation",
    SETTING_ONE_NOTE_DESC: "If enabled, every annotation is exported to a separate note.",
    SETTING_ONE_NOTE_EXPORT_NAME_NAME: "One note per annotation - export name",
    SETTING_ONE_NOTE_EXPORT_NAME_DESC: "The name of the notes to which each extracted annotation will be exported. You can use the variable '{{filename}}' to use the PDF's filename and combine it with prefix or suffix. Additionally you should use the variable '{{counter}}' to add the index of the exported annotation.",
    SETTING_OVERWRITE_NAME: "Overwrite existing note",
    SETTING_OVERWRITE_DESC: "If enabled, the plugin will overwrite the content of an existing note with the same name.",
    SETTING_EXTRACT_TAGS_NAME: "Extract tags in annotations as Obsidian tags",
    SETTING_EXTRACT_TAGS_DESC: "If enabled, the plugin will extract tags from the annotations and add them as Obsidian tags to the note's header.",
    SETTING_CLIPBOARD_EXPORT_NAME: "Export annotations from clipboard path to file",
    SETTING_CLIPBOARD_EXPORT_DESC: "When enabled, the clipboard path command saves annotations to a file using the export settings above, instead of inserting them into the note you are editing.",
};
