export default {
    // ─── Plugin ──────────────────────────────────────────────────────────────────
    // Also in manifest.json, which the plugin browser reads and no translation
    // can reach. Change both together.
    PLUGIN_NAME: "Advanced PDF Extractor",
    PLUGIN_DESCRIPTION: "Import all types of annotations from PDFs inside and outside your vault with advanced settings and templates.",

    // ─── Commands ────────────────────────────────────────────────────────────────
    COMMAND_EXTRACT_CURRENT_FILE: "Extract annotations from the current file",
    COMMAND_EXTRACT_CURRENT_FILE_PER_ANNOTATION: "Extract annotations from the current file into separate notes",
    COMMAND_EXTRACT_CLIPBOARD_PATH: "Extract annotations from the clipboard path into the current note",
    COMMAND_EXTRACT_CLIPBOARD_PATH_TO_NOTE: "Extract annotations from the clipboard path into a new note",
    COMMAND_EXTRACT_CLIPBOARD_PATH_PER_ANNOTATION: "Extract annotations from the clipboard path into separate notes",
    COMMAND_EXTRACT_CURRENT_FOLDER: "Extract annotations from every PDF in the current folder",
    COMMAND_EXTRACT_ADVANCED: "Extract annotations with advanced settings",

    // ─── Advanced extraction modal ───────────────────────────────────────────────
    MODAL_ADVANCED_TITLE: "Advanced extraction settings",
    MODAL_FILE_NAME: "Search for PDF or paste the path",
    MODAL_FILE_PLACEHOLDER: "Search the vault, or paste full path if outside the vault",
    MODAL_PAGES_NAME: "Specify pages for extraction",
    // The field carries no description, so the example is where the shape of an
    // answer is shown: single pages, ranges, roman numerals, all at once.
    MODAL_PAGES_PLACEHOLDER: "Examples: 25-50, 55 or i-viii (leave empty for all pages)",
    MODAL_PAGE_LABELS_NAME: "Look for page labels, not physical pages",
    MODAL_DATES_NAME: "Select dates for extraction",
    MODAL_DATES_DESC: "Lists every day the annotations inside the file were created.",
    MODAL_DATES_NONE: "There is nothing to extract from this file.",
    MODAL_READING: "Reading the file…",
    MODAL_TARGET_NAME: "Extraction type",
    MODAL_TARGET_CURRENT: "To the current note",
    MODAL_TARGET_SINGLE: "To a new note",
    MODAL_TARGET_SEPARATE: "To separate notes",
    MODAL_EXTRACT: "Extract annotations",
    /**
     * How a day is spelled in the list of dates, as a moment format. `LL` is
     * moment's own long date for the locale, which is "July 25, 2026" here and
     * the right word order and month name in every language it knows. A
     * translation may spell it some other way; the days are sorted as
     * `YYYY-MM-DD` whatever this says.
     */
    DATE_FORMAT: "LL",

    // ─── Notices ─────────────────────────────────────────────────────────────────
    // A path reaches these from the clipboard and from the advanced extraction's
    // own field alike, so neither says where it came from.
    NOTICE_PATH_DESKTOP_ONLY: "Reading a PDF from a path outside the vault is only available in the desktop app.",
    NOTICE_PATH_NOT_A_FILE: "The path that was given is not a file.",
    NOTICE_PATH_UNREADABLE: "The path that was given could not be read as a file.",
    NOTICE_EXTRACTION_FAILED: "Could not extract the annotations of this PDF.",
    NOTICE_NOTE_PATH_INVALID: "Could not create the note with the annotations: the vault will not take that path. Check the note folder, subfolder and name in the settings.",
    NOTICE_NO_CURRENT_FILE: "Could not create the note with the annotations: no file is open for it to be put beside. Open one, or choose a specific folder in the vault as the created notes destination.",
    NOTICE_PAGES_UNREADABLE: "Could not read part of the pages that were given",
    NOTICE_NOTHING_SELECTED: "No annotations were found on the pages and dates that were selected.",
    NOTICE_NO_NOTE_TO_INSERT_INTO: "Could not insert the annotations: no note is open for them to go into. Open one, or extract to a new note instead.",
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
    /** Names a note whose annotation has no comment to take a topic from. */
    NAME_NO_TOPIC: "No topic {{counter}}",

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
    VAR_TYPE: "Annotation type, as the PDF names it: Highlight, Underline, Squiggly, StrikeOut, Text or FreeText",
    VAR_TOPIC: "First line of the body. Grouping by topic also takes it out of {{body}}, since it is written as a heading instead",
    VAR_CREATED: "Day the annotation was made, like 2024-01-15, empty when the PDF gives no date",
    VAR_IS_EXTERNAL: "True for PDFs outside the vault, for {{#if isExternal}} in a template",

    // ─── Settings: annotations ───────────────────────────────────────────────────
    SETTING_ANNOTATIONS_NAME: "Select annotation types to be extracted",

    // ─── Settings: templates ─────────────────────────────────────────────────────
    // One sentence, not the pieces either side of the link: the link is woven in
    // by looking for HANDLEBARS_LINK inside it, so a translation can put that
    // word where its own grammar wants it.
    SECTION_TEMPLATES: "Import templates",
    SECTION_TEMPLATES_DESC: "Templates allow you to define the look of the imported annotations. Variables reference table below lists available Handlebars syntax options: on import those variables will be replaced with their corresponding values.",
    HANDLEBARS_LINK: "Handlebars",
    SHOW_VARIABLES_TABLE: "Show variables reference table",
    HIDE_VARIABLES_TABLE: "Hide variables reference table",
    TABLE_VARIABLE: "Variable (click to copy)",
    TABLE_DESCRIPTION: "Description",
    COPY_TOOLTIP: "Copy to clipboard",
    SETTING_TEMPLATE_NAME: "Formatting template",
    SETTING_TEMPLATE_DESC: "The default template applies to every annotation type if no specific template is defined. Empty templates use the default one.",
    OPTION_TEMPLATE_DEFAULT: "Default (applies to all types)",
    PLACEHOLDER_TEMPLATE_DEFAULT: "Empty — this annotation type is written with the default template.",

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
    SECTION_NOTES: "Notes creations",
    SETTING_NOTE_LOCATION_NAME: "Created notes destination",
    SETTING_NOTE_LOCATION_DESC: "Choose where the created notes will be placed.",
    OPTION_NOTE_LOCATION_CURRENT: "Same folder as current file",
    OPTION_NOTE_LOCATION_VAULT: "Specififc folder in the vault",
    SETTING_NOTE_FOLDER_NAME: "Specify a folder in the vault",
    SETTING_NOTE_FOLDER_DESC: "Start typing to view autosuggest or leave blank to use the vault root.",
    SETTING_NOTE_SUBFOLDER_NAME: "Subfolder (optional)",
    SETTING_NOTE_SUBFOLDER_DESC: "When filled, this naming template will be used to create a subfolder to put the notes in.",
    PLACEHOLDER_VAULT_ROOT: "For example, {{filename}} or other variable with any prefix or suffix",
    PLACEHOLDER_NO_SUBFOLDER: "If empty, no subfolder will be created",
    SETTING_TOPIC_TO_NAME_NAME: "Put the topic of the annotation to the note name",
    SETTING_TOPIC_TO_NAME_DESC: "Enable if you want to avoid duplication of the {{topic}} if your template has it. The notes made by the 'note per annotation' will be named after the annotation's topic.",
    SETTING_ONE_NOTE_NAME_NAME: "Naming pattern for annotations imported to separate notes",
    SETTING_ONE_NOTE_NAME_DESC: "Use unique variables, such as {{counter}} or all annotation will be put in the same note.",
    SETTING_EXTRACT_TAGS_NAME: "Extract tags from annotations to the tags property",
    SETTING_EXTRACT_TAGS_DESC: "Tags found in the annotations will be automatically moved to the note's tags property. Choose which extractions this happens for.",
    OPTION_EXTRACT_TAGS_NEVER: "Never",
    OPTION_EXTRACT_TAGS_ALWAYS: "Always",
    OPTION_EXTRACT_TAGS_SINGLE: "Single note extraction",
    OPTION_EXTRACT_TAGS_SEPARATE: "Extraction to separate notes",
    SETTING_NOTE_NAME_NAME: "Naming pattern for annotations imported to a single note",
    SETTING_NOTE_NAME_DESC: "Use unique variables, such as {{filename}} or every PDF will write annotations to the same note.",
    SETTING_OVERWRITE_NAME: "Allow to overwrite",
    SETTING_OVERWRITE_DESC: "If a note has the same name, it will be replaced rather than appended.",

};
