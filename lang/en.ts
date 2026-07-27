export default {
    // ─── Plugin ──────────────────────────────────────────────────────────────────
    // Also in manifest.json, which the plugin browser reads and no translation
    // can reach. Change both together.
    PLUGIN_NAME: "Advanced PDF Annotations Extractor",
    PLUGIN_DESCRIPTION: "Extract annotations from PDFs with advanced settings and user-friendly features.",

    // ─── Commands ────────────────────────────────────────────────────────────────
    COMMAND_EXTRACT_CURRENT_FILE: "Extract from the current file",
    COMMAND_EXTRACT_CURRENT_FILE_PER_ANNOTATION: "Extract from the current file into a note per annotation",
    COMMAND_EXTRACT_CLIPBOARD_PATH: "Extract from the file path in the clipboard into the current note",
    COMMAND_EXTRACT_CLIPBOARD_PATH_TO_NOTE: "Extract from the file path in the clipboard into a new note",
    COMMAND_EXTRACT_CLIPBOARD_PATH_PER_ANNOTATION: "Extract from the file path in the clipboard into a note per annotation",
    COMMAND_EXTRACT_CURRENT_FOLDER: "Extract from every PDF in the current folder",

    // ─── Notices ─────────────────────────────────────────────────────────────────
    NOTICE_CLIPBOARD_DESKTOP_ONLY: "Reading a PDF from a path outside the vault is only available in the desktop app.",
    NOTICE_CLIPBOARD_NOT_A_FILE: "The path in the clipboard is not a file.",
    NOTICE_CLIPBOARD_UNREADABLE: "The clipboard does not contain a readable file path.",
    NOTICE_EXTRACTION_FAILED: "Could not extract the annotations of this PDF.",
    NOTICE_NOTE_PATH_INVALID: "Could not create the note with the annotations: the vault will not take that path. Check the note folder, subfolder and name in the settings.",
    NOTICE_COPIED: "Copied to the clipboard",
    NOTICE_COPY_FAILED: "Could not copy to the clipboard.",
    NOTICE_TEMPLATES_COLLAPSED: "The templates for PDFs inside and outside the vault are now one per annotation kind — {{filelink}} links whichever the PDF is. A template of yours for PDFs outside the vault differed by more than the link, so it was kept in data.json under legacyExternalTemplates instead of being merged.",

    // ─── Written into exported notes ─────────────────────────────────────────────
    // The {{variables}} are names the formatter resolves; only the words around
    // them may be translated.
    NOTE_NO_ANNOTATIONS: "*No annotations*",
    NOTE_VAULT_ROOT: "Vault root",
    NOTE_NO_DATE: "No date",
    DEFAULT_HIGHLIGHT_TEMPLATE: "> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on {{filelink}}*\n\n",
    DEFAULT_NOTE_TEMPLATE: "{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on {{filelink}}*\n\n",
    DEFAULT_NOTE_NAME: "Annotations for {{filename}}",
    DEFAULT_ONE_NOTE_NAME: "Annotations for {{filename}}-{{counter}}",

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
    VAR_TOPIC: "First line of the body. Grouping by topic also takes it out of {{body}}, since it is written as a heading instead",
    VAR_CREATED: "Day the annotation was made, like 2024-01-15, empty when the PDF gives no date",
    VAR_IS_EXTERNAL: "True for PDFs outside the vault, for {{#if isExternal}} in a template",

    // ─── Settings: annotations ───────────────────────────────────────────────────
    SETTING_ANNOTATIONS_NAME: "Choose, which annotation types will be extracted",

    // ─── Settings: templates ─────────────────────────────────────────────────────
    // One sentence, not the pieces either side of the link: the link is woven in
    // by looking for HANDLEBARS_LINK inside it, so a translation can put that
    // word where its own grammar wants it.
    SECTION_TEMPLATES: "Import formatting templates",
    SECTION_TEMPLATES_DESC: "Use templates to define the look of the imported annotations. Variables reference table below lists available Handlebars syntax options: on import those variables will be replaced with their corresponding values.",
    HANDLEBARS_LINK: "Handlebars",
    SHOW_VARIABLES_TABLE: "Show variables reference table",
    HIDE_VARIABLES_TABLE: "Hide variables reference table",
    TABLE_VARIABLE: "Variable (click to copy)",
    TABLE_DESCRIPTION: "Description",
    COPY_TOOLTIP: "Copy to clipboard",
    SETTING_HIGHLIGHT_TEMPLATE_NAME: "Formatting template for highlights",
    SETTING_HIGHLIGHT_TEMPLATE_DESC: "Used for the annotation types: highlight, underline, squiggly and strikeout.",
    SETTING_NOTE_TEMPLATE_NAME: "Formatting template for notes",
    SETTING_NOTE_TEMPLATE_DESC: "Used for the annotation types: sticky note comment and free text.",

    // ─── Settings: grouping ──────────────────────────────────────────────────────
    SECTION_GROUPING: "Annotations grouping",
    SETTING_SORT_BY_TOPIC_NAME: "Group by topic",
    SETTING_SORT_BY_TOPIC_DESC: "Treats the first line of each comment as its topic and groups by it first, above folder and file.",
    SETTING_GROUP_BY_DATE_NAME: "Group by creation date",
    SETTING_GROUP_BY_DATE_DESC: "Groups annotations by the day of creation — annotations without a date come last.",
    SETTING_GROUP_BY_FOLDER_NAME: "Group by folder",
    SETTING_GROUP_BY_FOLDER_DESC: "Keeps every PDF that is in the same folder together, before the annotations are ordered file by file.",

    // ─── Settings: headings ──────────────────────────────────────────────────────
    SECTION_HEADINGS: "Headings",
    SETTING_DATE_HEADING_NAME: "Add date headings",
    SETTING_DATE_HEADING_DESC: "Adds a heading for each date when annotations are grouped by creation date.",
    SETTING_TOPIC_HEADING_NAME: "Collect notes with the same topic under a shared heading",
    SETTING_TOPIC_HEADING_DESC: "Adds a heading for each topic and collects notes with the same topic under it.",
    SETTING_FILE_HEADING_NAME: "Add file headings",
    SETTING_FILE_HEADING_DESC: "Adds a heading before each file's annotations start.",
    OPTION_FILE_HEADING_FOLDER: "Add folder name",
    OPTION_FILE_HEADING_FILE: "Add file name",
    OPTION_FILE_HEADING_NONE: "No heading",

    // ─── Settings: notes ─────────────────────────────────────────────────────────
    SECTION_NOTES: "Import to separate notes",
    SETTING_NOTE_LOCATION_NAME: "Notes destination",
    SETTING_NOTE_LOCATION_DESC: "Choose where the created notes will be placed.",
    OPTION_NOTE_LOCATION_CURRENT: "Same folder as current file",
    OPTION_NOTE_LOCATION_VAULT: "Specified folder in the vault",
    SETTING_NOTE_FOLDER_NAME: "Select a folder in the vault",
    SETTING_NOTE_FOLDER_DESC: "Start typing to view autosuggest or leave blank to use the vault root.",
    SETTING_NOTE_SUBFOLDER_NAME: "Optional subfolder",
    SETTING_NOTE_SUBFOLDER_DESC: "If filled, specified naming template will be used to create a folder inside the one above to put the notes in. For example, if the template is '{{filename}}', the PDF file name will be used.",
    PLACEHOLDER_VAULT_ROOT: "If empty, goes to the vault root",
    PLACEHOLDER_NO_SUBFOLDER: "If empty, no subfolder will be created",
    SETTING_NOTE_NAME_NAME: "Note name",
    SETTING_NOTE_NAME_DESC: "What the note is called, as a template. '{{filename}}' is the PDF's name, so a note can be named after the PDF it came from and given a prefix or suffix. Without it every PDF writes to the same note.",
    SETTING_ONE_NOTE_NAME_NAME: "Name of a note per annotation",
    SETTING_ONE_NOTE_NAME_DESC: "What the notes made by the 'note per annotation' commands are called, as a template. '{{filename}}' is the PDF's name; add '{{counter}}' for the annotation's number, without which they would all be the same note. The annotation's own variables work here too, '{{topic}}' among them — it holds the annotation's first line, and only when 'Sort by topic' is on. Whenever a template renders nothing a note can be called, the PDF's name and the number are used instead.",
    SETTING_OVERWRITE_NAME: "Overwrite existing note",
    SETTING_OVERWRITE_DESC: "If enabled, a note of the same name is replaced rather than added to.",
    SETTING_EXTRACT_TAGS_NAME: "Extract tags in annotations as Obsidian tags",
    SETTING_EXTRACT_TAGS_DESC: "If enabled, tags written in the annotations are moved to the note's tags property: they are taken out of the extracted text, so each tag stands in one place rather than two. Tags the note already has are kept.",
};
