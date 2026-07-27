import {
	AbstractInputSuggest,
	AbstractTextComponent,
	App,
	DropdownComponent,
	Notice,
	PluginSettingTab,
	setIcon,
	Setting,
	setTooltip,
	TextComponent,
	ToggleComponent,
} from "obsidian";
import { t } from "lang/helpers";
import PDFAnnotationPlugin from "src/main";
import { asIndexable } from "src/types";

// The variable names are the interface — what a template types — so they live
// here; only their descriptions are translated. The whole annotation is
// available as {{annotation}} too, for fields that have no shortcut of their own.
export const TEMPLATE_VARIABLES: Record<string, string> = {
	highlightedText: t.VAR_HIGHLIGHTED_TEXT,
	folder: t.VAR_FOLDER,
	filename: t.VAR_FILENAME,
	filepath: t.VAR_FILEPATH,
	filelink: t.VAR_FILELINK,
	pageNumber: t.VAR_PAGE_NUMBER,
	pageLabel: t.VAR_PAGE_LABEL,
	author: t.VAR_AUTHOR,
	body: t.VAR_BODY,
	topic: t.VAR_TOPIC,
	created: t.VAR_CREATED,
	isExternal: t.VAR_IS_EXTERNAL,
};

export interface SupportedAnnotation {
	/** PDF annotation subtype, as reported by pdf.js. */
	subtype: string;
	description: string;
	/**
	 * True for the text markup annotations, which carry QuadPoints: the PDF text
	 * underneath them is extracted into {{highlightedText}} and they are rendered
	 * with the highlight templates. The rest only contribute their own comment
	 * and are rendered with the note templates.
	 */
	marksUpText?: boolean;
	/** Part of the default selection. */
	desiredByDefault?: boolean;
}

// The annotation types that carry text an exported note can actually show:
// either the PDF text they mark up, or text the reader typed themselves.
//
// Deliberately absent are the graphical markup types — Ink, Square, Circle,
// Line, Polygon, PolyLine, Stamp, Caret and FileAttachment. Their content is a
// drawing, a stamp or an attached file, none of which survives a conversion to
// markdown, and their Contents entry is empty unless a comment happens to be
// attached. Extracting them yields mostly blank entries. Link, Widget and Popup
// are absent too: they are not annotations the reader made.
export const SUPPORTED_ANNOTS: SupportedAnnotation[] = [
	{
		subtype: "Highlight",
		description: t.ANNOT_HIGHLIGHT,
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Underline",
		description: t.ANNOT_UNDERLINE,
		marksUpText: true,
		desiredByDefault: true,
	},
	{
		subtype: "Squiggly",
		description: t.ANNOT_SQUIGGLY,
		marksUpText: true,
	},
	{
		subtype: "StrikeOut",
		description: t.ANNOT_STRIKEOUT,
		marksUpText: true,
	},
	{
		subtype: "Text",
		description: t.ANNOT_TEXT,
		desiredByDefault: true,
	},
	{ subtype: "FreeText", description: t.ANNOT_FREE_TEXT },
];

export const ANNOTS_TREATED_AS_HIGHLIGHTS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.marksUpText
).map((annotation) => annotation.subtype);

export const DEFAULT_DESIRED_ANNOTATIONS = SUPPORTED_ANNOTS.filter(
	(annotation) => annotation.desiredByDefault
).map((annotation) => annotation.subtype);

/**
 * Until {{filelink}} existed, each kind of annotation had two templates that
 * differed only in how they linked the PDF: a wiki link for the vault, a plain
 * path for everything else. `migrateTemplates` folds a data.json written by
 * those versions into the single template per kind.
 *
 * The two defaults per pair are history, not wording: they are compared against
 * what an old data.json holds, to tell an untouched default from an edit. They
 * do not belong in the locale and must never be reworded or translated — doing
 * so makes every unedited template look customised.
 */
const LEGACY_TEMPLATE_PAIRS = [
	{
		field: "noteTemplate",
		internalKey: "noteTemplateInternalPDFs",
		externalKey: "noteTemplateExternalPDFs",
		kind: "notes",
		internalDefault:
			"{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n\n",
		externalDefault:
			"{{body}}\n\n* *noted by {{author}} at page {{pageNumber}} on {{filepath}}*\n\n",
	},
	{
		field: "highlightTemplate",
		internalKey: "highlightTemplateInternalPDFs",
		externalKey: "highlightTemplateExternalPDFs",
		kind: "highlights",
		internalDefault:
			"> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on [[{{filepath}}]]*\n\n",
		externalDefault:
			"> {{highlightedText}}\n\n{{body}}\n\n* *highlighted by {{author}} at page {{pageNumber}} on {{filepath}}*\n\n",
	},
] as const;

/**
 * What the second level heading above each group of annotations shows. Purely
 * what is written into the note: the order the annotations come in is
 * `sortByTopic` and `groupByFolder`, so `none` leaves an otherwise identical
 * note without its file headings.
 */
export const FILE_HEADINGS = ["folder", "file", "none"] as const;
export type FileHeading = (typeof FILE_HEADINGS)[number];

/**
 * Where the notes go: beside whatever is open, or somewhere in the vault the
 * reader picked.
 *
 * `current` follows the file being looked at rather than the PDF, which is the
 * same folder when a PDF in the vault is open and the only one there is when
 * the PDF is not in the vault at all.
 */
export const NOTE_LOCATIONS = ["current", "vault"] as const;
export type NoteLocation = (typeof NOTE_LOCATIONS)[number];

/**
 * Settings renamed when the ones deciding where a note goes stopped calling it
 * an export — nothing leaves Obsidian, the notes are written into the vault.
 * Old name to new. Only the names changed; every value carries over as it is.
 */
const RENAMED_SETTINGS: Record<string, string> = {
	exportLocation: "noteLocation",
	exportFolder: "noteFolder",
	exportSubfolder: "noteSubfolder",
	exportName: "noteName",
	oneNotePerAnnotationExportName: "oneNotePerAnnotationName",
};

/**
 * Settings this version no longer has, cleared out of data.json rather than
 * left behind for a reader to wonder about. Whether the clipboard command
 * wrote a note is a command of its own now, so there is nothing left to carry
 * the old value over to.
 */
const REMOVED_SETTINGS = [
	"exportClipboardExtraction",
	"clipboardSavesToNote",
	"oneNotePerAnnotation",
];

/** Characters Obsidian will not take in a path, whatever a template renders. */
const ILLEGAL_PATH_CHARS = /[\\:*?"<>|]/g;

/**
 * A folder as a path can use it: no leading, trailing or doubled slashes, no
 * characters Obsidian rejects, and every part trimmed. A nested path survives —
 * a subfolder template is allowed to render one — an empty one comes back empty.
 */
function cleanFolderPath(value: string): string {
	return value
		.replace(ILLEGAL_PATH_CHARS, "")
		.split("/")
		.map((part) => part.trim())
		.filter((part) => part.length > 0)
		.join("/");
}

/**
 * Long enough for a sentence a `{{topic}}` can hold, short enough that the path
 * around it still fits what the file system will take. Counted in characters as
 * they are read rather than in the units they are stored in, so that a cut
 * never falls inside one.
 */
const MAX_NOTE_NAME_LENGTH = 100;

/**
 * A note name a vault will take: the characters Obsidian rejects taken out, the
 * line breaks a variable like `{{topic}}` carries in collapsed to spaces, and
 * neither a leading dot — which would write a hidden note nobody sees — nor a
 * trailing one left behind. Comes back empty when nothing usable is left, so the
 * caller can put a name of its own in its place.
 */
export function cleanNoteName(value: string): string {
	const collapsed = value
		.replace(ILLEGAL_PATH_CHARS, "")
		// A name is one path part: a slash in it would write the note somewhere
		// else, which is what the subfolder setting is for.
		.replace(/\//g, " ")
		.replace(/\s+/g, " ")
		.trim();
	// Spread rather than `slice`, which counts UTF-16 units and would cut an
	// emoji — or anything else written outside the basic plane — in half,
	// leaving a name no file system will take.
	const cut = [...collapsed].slice(0, MAX_NOTE_NAME_LENGTH).join("");

	return cut
		.replace(/^\.+/, "")
		.replace(/[. ]+$/, "")
		.trim();
}

/**
 * Where one note is written. Kept out of the plugin class so it can be checked
 * on its own: `currentFolder` is the folder of the file being looked at and
 * `subfolder` arrives already rendered, since the templates are compiled there.
 */
export function resolveNotePath(
	settings: PDFAnnotationPluginSetting,
	currentFolder: string,
	fileNameOfNote: string,
	subfolder = ""
): string {
	const folder =
		settings.noteLocation === "current"
			? cleanFolderPath(currentFolder)
			: [settings.noteFolder, subfolder]
					.map(cleanFolderPath)
					.filter((part) => part.length > 0)
					.join("/");

	return folder ? `${folder}/${fileNameOfNote}` : fileNameOfNote;
}

const HANDLEBARS_DOCS = "https://handlebarsjs.com/guide/expressions.html";

/** `[[{{filepath}}]]` as the internal templates wrote it, spacing included. */
const FILEPATH_WIKILINK = /\[\[\s*\{\{\s*filepath\s*\}\}\s*\]\]/g;
const FILEPATH_PLAIN = /\{\{\s*filepath\s*\}\}/g;

/** Which pair of templates something is about. Not shown to anyone as is. */
export type TemplateKind = (typeof LEGACY_TEMPLATE_PAIRS)[number]["kind"];

export interface TemplateMigration {
	/** True when data.json still held the pre-{{filelink}} template fields. */
	migrated: boolean;
	/**
	 * Kinds whose external template said something its internal counterpart did
	 * not, so folding the pair would have thrown an edit away. Stashed in
	 * `legacyExternalTemplates` instead.
	 */
	dropped: TemplateKind[];
}

export class PDFAnnotationPluginSetting {
	public topicHeading: boolean;
	public dateHeading: boolean;
	public fileHeading: FileHeading;
	public groupByFolder: boolean;
	public groupByDate: boolean;
	public sortByTopic: boolean;
	public noteLocation: NoteLocation;
	/** Vault-relative folder the notes go in, empty for the vault root. */
	public noteFolder: string;
	/**
	 * Template for a folder under `noteFolder` to put the notes in. Empty to
	 * put them straight into it.
	 */
	public noteSubfolder: string;
	public noteName: string;
	public desiredAnnotations: string[];
	public noteTemplate: string;
	public highlightTemplate: string;
	/**
	 * Templates for PDFs outside the vault that `migrateTemplates` could not
	 * fold in, keyed by the setting they came from. Nothing reads them; they are
	 * kept so an edit made before the collapse can still be copied back by hand.
	 */
	public legacyExternalTemplates: Record<string, string>;
	public oneNotePerAnnotationName: string;
	/**
	 * Name the notes made by the 'note per annotation' commands after the
	 * annotation's topic, in place of `oneNotePerAnnotationName`, and leave the
	 * topic out of the note itself.
	 */
	public topicToNoteName: boolean;
	public overwriteExistingNote: boolean;
	public extractTagsFromAnnotationsAsObsidianTags: boolean;

	constructor() {
		this.topicHeading = true;
		this.dateHeading = true;
		this.fileHeading = "folder";
		this.groupByFolder = true;
		// Off, so an upgrade does not reorder notes nobody asked to reorder.
		this.groupByDate = false;
		this.sortByTopic = true;
		this.noteLocation = "vault";
		this.noteFolder = "";
		this.noteSubfolder = "";
		this.noteName = t.DEFAULT_NOTE_NAME;
		this.desiredAnnotations = [...DEFAULT_DESIRED_ANNOTATIONS];
		this.noteTemplate = t.DEFAULT_NOTE_TEMPLATE;
		this.highlightTemplate = t.DEFAULT_HIGHLIGHT_TEMPLATE;
		this.legacyExternalTemplates = {};
		this.oneNotePerAnnotationName =
			t.DEFAULT_ONE_NOTE_NAME;
		// Off, so the name template keeps naming the notes it named before.
		this.topicToNoteName = false;
		this.overwriteExistingNote = false;
		this.extractTagsFromAnnotationsAsObsidianTags = false;
	}

	public isAnnotationDesired(annotationType: string): boolean {
		return this.desiredAnnotations.includes(annotationType);
	}

	public setAnnotationDesired(
		annotationType: string,
		desired: boolean
	): void {
		const selected = new Set(this.desiredAnnotations);
		if (desired) {
			selected.add(annotationType);
		} else {
			selected.delete(annotationType);
		}

		// Keep the order the types are listed in, then any subtype added to
		// data.json by hand that this version does not offer a checkbox for.
		const known = new Set(SUPPORTED_ANNOTS.map((a) => a.subtype));
		this.desiredAnnotations = [
			...SUPPORTED_ANNOTS.map((a) => a.subtype).filter((type) =>
				selected.has(type)
			),
			...[...selected].filter((type) => !known.has(type)),
		];
	}

	/**
	 * Fold the four templates older versions stored into the two this version
	 * has. The internal template wins, because a vault is where most PDFs are
	 * read; its `[[{{filepath}}]]` becomes `{{filelink}}`, which renders the
	 * same way. An external template that was customised on its own is adopted
	 * instead, and one that disagrees with a customised internal template is
	 * stashed rather than discarded.
	 *
	 * `loaded` is the raw data.json, since the fields being read no longer exist
	 * on this class. Templates already collapsed are left alone.
	 */
	public static migrateTemplates(
		loaded: Record<string, unknown>,
		settings: PDFAnnotationPluginSetting
	): TemplateMigration {
		const migration: TemplateMigration = { migrated: false, dropped: [] };

		for (const pair of LEGACY_TEMPLATE_PAIRS) {
			if (typeof loaded[pair.field] === "string") continue;

			const internal = loaded[pair.internalKey];
			const external = loaded[pair.externalKey];
			if (typeof internal !== "string" && typeof external !== "string") {
				continue;
			}
			migration.migrated = true;

			const customInternal =
				typeof internal === "string" && internal !== pair.internalDefault
					? internal.replace(FILEPATH_WIKILINK, "{{filelink}}")
					: null;
			const customExternal =
				typeof external === "string" && external !== pair.externalDefault
					? external.replace(FILEPATH_PLAIN, "{{filelink}}")
					: null;

			const collapsed = customInternal ?? customExternal;
			if (collapsed) {
				asIndexable(settings)[pair.field] = collapsed;
			}

			// Both were edited, and not into the same thing: the difference is
			// more than the link, so it is not ours to throw away.
			if (customInternal && customExternal && customExternal !== collapsed) {
				settings.legacyExternalTemplates[pair.externalKey] =
					external as string;
				migration.dropped.push(pair.kind);
			}
		}

		return migration;
	}

	/**
	 * Older versions stored one `useFolderNames` boolean that both ordered the
	 * annotations and labelled their heading, so a note could not be grouped by
	 * folder without saying so in every heading, nor grouped by topic alone.
	 * Split it into the two settings that do those jobs: `groupByFolder` for the
	 * order and `fileHeading` for the label.
	 *
	 * `useStructuringHeadlines` sat above both as a master switch. Each heading
	 * level says whether it is written itself now, so switching it off becomes
	 * both of them off.
	 *
	 * `loaded` is the raw data.json, since neither field exists on this class
	 * any more. Returns whether anything was migrated, so the caller can write
	 * the settings back.
	 */
	public static migrateStructure(
		loaded: Record<string, unknown>,
		settings: PDFAnnotationPluginSetting
	): boolean {
		let migrated = false;

		const heading = loaded.fileHeading;
		if (typeof heading === "string") {
			// A value this version does not know is worse than the default: it
			// would suppress the heading through the `none` branch by accident.
			const known = FILE_HEADINGS.includes(heading as FileHeading);
			settings.fileHeading = known ? (heading as FileHeading) : "folder";
			migrated = !known;
		} else if (typeof loaded.useFolderNames === "boolean") {
			settings.fileHeading = loaded.useFolderNames ? "folder" : "file";
			migrated = true;
		} else {
			settings.fileHeading = "folder";
		}

		// What the heading said before the master switch below could silence it.
		// The order it implied survives being silenced, so it is read from here
		// rather than from the field.
		const headingBeforeSwitch = settings.fileHeading;

		if (typeof loaded.topicHeading === "boolean") {
			settings.topicHeading = loaded.topicHeading;
		} else if (typeof loaded.useStructuringHeadlines === "boolean") {
			settings.topicHeading = loaded.useStructuringHeadlines;
			// The master switch suppressed every heading, the file one
			// included, whatever the setting below it said.
			if (!loaded.useStructuringHeadlines) settings.fileHeading = "none";
			migrated = true;
		}

		if (typeof loaded.groupByFolder === "boolean") {
			settings.groupByFolder = loaded.groupByFolder;
		} else if (typeof heading === "string") {
			// Before the split the heading carried the order too, and only the
			// folder heading grouped by folder — `file` and `none` both left the
			// annotations ordered file by file.
			settings.groupByFolder = headingBeforeSwitch === "folder";
			migrated = true;
		} else if (typeof loaded.useFolderNames === "boolean") {
			settings.groupByFolder = loaded.useFolderNames;
			migrated = true;
		} else {
			settings.groupByFolder = true;
		}

		return migrated;
	}

	/**
	 * A data.json under the names those settings used to have, read back under
	 * the ones they have now, and without the ones this version dropped.
	 * Returns a copy, so the migrations that follow and the load itself all see
	 * one set of names, along with whether anything was read that way — the
	 * settings are written back if so, and the old names leave data.json for
	 * good.
	 *
	 * A name this version already writes wins over the one it replaced, which
	 * can only both be there if a data.json was edited by hand.
	 */
	public static normalizeLegacySettings(loaded: Record<string, unknown>): {
		data: Record<string, unknown>;
		changed: boolean;
	} {
		const data = { ...loaded };
		let changed = false;

		for (const [was, is] of Object.entries(RENAMED_SETTINGS)) {
			if (!(was in data)) continue;
			if (!(is in data)) {
				data[is] = data[was];
			}
			delete data[was];
			changed = true;
		}

		for (const gone of REMOVED_SETTINGS) {
			if (!(gone in data)) continue;
			delete data[gone];
			changed = true;
		}

		return { data, changed };
	}

	/**
	 * Older versions stored one `exportPath` string, where the literal `./`
	 * meant "beside the PDF" and anything else was a vault folder that had to
	 * end in a slash. Split it into the location it was choosing between and
	 * the folder it named.
	 *
	 * `loaded` is the raw data.json, since `exportPath` no longer exists on this
	 * class. Returns whether anything was migrated, so the caller can write the
	 * settings back.
	 */
	public static migrateNotePath(
		loaded: Record<string, unknown>,
		settings: PDFAnnotationPluginSetting
	): boolean {
		const location = loaded.noteLocation;
		if (typeof location === "string") {
			// `pdf` was this setting following the PDF rather than the file
			// being looked at, which is the same folder whenever the PDF is
			// the file being looked at.
			if (location === "pdf") {
				settings.noteLocation = "current";
				return true;
			}
			const known = NOTE_LOCATIONS.includes(location as NoteLocation);
			settings.noteLocation = known
				? (location as NoteLocation)
				: "vault";
			return !known;
		}

		if (typeof loaded.exportPath !== "string") return false;

		if (loaded.exportPath.trim() === "./") {
			settings.noteLocation = "current";
			settings.noteFolder = "";
		} else {
			// Anything else was a vault folder, written with the trailing
			// slash the old setting demanded.
			settings.noteLocation = "vault";
			settings.noteFolder = cleanFolderPath(loaded.exportPath);
		}
		return true;
	}

	/**
	 * data.json is written by users and by older versions of this plugin, which
	 * stored the selection as a comma separated string. Accept both, and drop
	 * anything that is not a list of subtypes.
	 */
	public static normalizeDesiredAnnotations(value: unknown): string[] | null {
		if (typeof value === "string") {
			return value
				.split(",")
				.map((subtype) => subtype.trim())
				.filter((subtype) => subtype.length > 0);
		}
		if (Array.isArray(value)) {
			const entries: unknown[] = value;
			const subtypes = entries.filter(
				(subtype): subtype is string => typeof subtype === "string"
			);
			return subtypes.length === entries.length ? subtypes : null;
		}
		return null;
	}
}

/**
 * Type-ahead over the vault's folders, for the setting that names one. Every
 * folder is offered on an empty query, so the field can be browsed as well as
 * typed into; the root is offered as `/`, which resolves to the vault root the
 * same way an empty field does.
 */
class FolderSuggest extends AbstractInputSuggest<string> {
	getSuggestions(query: string): string[] {
		const wanted = query.toLowerCase();
		return this.app.vault
			.getAllFolders(true)
			.map((folder) => folder.path)
			.filter((path) => path.toLowerCase().includes(wanted));
	}

	renderSuggestion(path: string, el: HTMLElement): void {
		el.setText(path);
	}
}

export class PDFAnnotationPluginSettingTab extends PluginSettingTab {
	plugin: PDFAnnotationPlugin;

	constructor(app: App, plugin: PDFAnnotationPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	addValueChangeCallback<T extends HTMLTextAreaElement | HTMLInputElement>(
		component: AbstractTextComponent<T> | DropdownComponent,
		settingsKey: string,
		cb?: (value: string) => void
	): void {
		component.onChange(async (value) => {
			asIndexable(this.plugin.settings)[settingsKey] = value;
			await this.plugin.saveSettings();
			if (cb) {
				cb(value);
			}
		});
	}

	buildValueInput<T extends HTMLTextAreaElement | HTMLInputElement>(
		component: AbstractTextComponent<T> | DropdownComponent,
		settingsKey: string,
		cb?: (value: string) => void
	): void {
		component.setValue(
			asIndexable(this.plugin.settings)[settingsKey] as string
		);
		this.addValueChangeCallback(component, settingsKey, cb);
	}

	/**
	 * A collapsible panel, closed to begin with. Returns the element its
	 * contents go in.
	 *
	 * <details> has no open and close transition of its own, so it is animated
	 * here: opening reveals the content first, so its height can be measured,
	 * then animates up to it; closing runs the reverse and only marks the
	 * element closed once the animation has finished, or the content would
	 * vanish on the first frame.
	 *
	 * A toggle mid-animation picks up from the height currently on screen
	 * rather than restarting, and anyone who has asked for less motion gets the
	 * plain instant toggle the element does by itself.
	 */
	createAccordion(
		parent: HTMLElement,
		showText: string,
		hideText: string
	): HTMLElement {
		const details = parent.createEl("details", {
			cls: "pdf-annotations-accordion",
		});
		const summary = details.createEl("summary", {
			cls: "pdf-annotations-accordion-summary",
		});
		const chevron = summary.createSpan({
			cls: "pdf-annotations-accordion-chevron",
		});
		setIcon(chevron, "chevron-right");
		const label = summary.createSpan({ text: showText });
		const content = details.createDiv({
			cls: "pdf-annotations-accordion-content",
		});

		let animation: Animation | null = null;

		summary.addEventListener("click", (event) => {
			const opening = !details.open;
			chevron.toggleClass("is-open", opening);
			label.setText(opening ? hideText : showText);

			if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
				return;
			}
			event.preventDefault();

			// Measured before cancelling, while it is still the height on
			// screen rather than the natural one.
			const interrupted = animation !== null;
			const onScreen = interrupted
				? content.getBoundingClientRect().height
				: 0;
			animation?.cancel();

			if (opening) details.open = true;
			const full = content.scrollHeight;
			const from = interrupted ? onScreen : opening ? 0 : full;
			const to = opening ? full : 0;

			animation = content.animate(
				{
					height: [`${from}px`, `${to}px`],
					opacity: opening ? [0, 1] : [1, 0],
				},
				{ duration: 180, easing: "ease-in-out" }
			);
			animation.onfinish = () => {
				animation = null;
				if (!opening) details.open = false;
			};
		});

		return content;
	}

	/**
	 * Put a numbered gutter beside a template's text area. The text area is
	 * wrapped in a box it now shares with the gutter, which is redrawn as lines
	 * come and go and scrolled in step with it.
	 *
	 * Soft wrapping is turned off for this: a wrapped line occupies two rows on
	 * screen but is still one line, and there is no honest number to put beside
	 * the second row. Long template lines scroll sideways instead.
	 */
	addLineNumbers(textarea: HTMLTextAreaElement): void {
		const parent = textarea.parentElement;
		if (!parent) return;

		const editor = createDiv({ cls: "pdf-annotations-template-editor" });
		parent.insertBefore(editor, textarea);
		const gutter = editor.createDiv({
			cls: "pdf-annotations-template-gutter",
		});
		editor.appendChild(textarea);
		textarea.setAttr("wrap", "off");

		const drawLineNumbers = () => {
			const lines = textarea.value.split("\n").length;
			gutter.setText(
				Array.from({ length: lines }, (_, i) => i + 1).join("\n")
			);
		};

		textarea.addEventListener("input", drawLineNumbers);
		textarea.addEventListener("scroll", () => {
			gutter.scrollTop = textarea.scrollTop;
		});
		drawLineNumbers();
	}

	/**
	 * Append `text` to `parent`, turning the first occurrence of `linkText`
	 * into a link. Keeps the paragraph one translatable sentence instead of the
	 * fragments either side of an anchor; a translation that drops the word
	 * simply renders without the link rather than losing the sentence.
	 */
	appendTextWithLink(
		parent: HTMLElement,
		text: string,
		linkText: string,
		href: string
	): void {
		const at = text.indexOf(linkText);
		if (at < 0) {
			parent.createSpan({ text });
			return;
		}
		parent.createSpan({ text: text.slice(0, at) });
		parent.createEl("a", { text: linkText, href });
		parent.createSpan({ text: text.slice(at + linkText.length) });
	}

	/**
	 * Make `pill` copy one template variable to the clipboard when clicked, and
	 * give it the icon button that says so. The listener sits on the pill rather
	 * than the button, so the whole pill is the target — and a click on the icon
	 * bubbles up to that same listener instead of copying twice. The button is
	 * still a real one, which is what makes the pill reachable by keyboard.
	 */
	addCopyAction(pill: HTMLElement, variable: string): void {
		const button = pill.createEl("button", {
			cls: ["clickable-icon", "pdf-annotations-copy-button"],
			attr: {
				type: "button",
				"aria-label": `${t.COPY_TOOLTIP}: ${variable}`,
			},
		});
		setIcon(button, "copy");
		setTooltip(pill, t.COPY_TOOLTIP);

		pill.addEventListener("click", () => {
			navigator.clipboard
				.writeText(variable)
				.then(() => {
					new Notice(`${t.NOTICE_COPIED}: ${variable}`);
					setIcon(button, "check");
					window.setTimeout(() => setIcon(button, "copy"), 1500);
				})
				.catch((error) => {
					new Notice(t.NOTICE_COPY_FAILED);
					console.error(error);
				});
		});
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		const header = new Setting(containerEl)
			.setName(t.PLUGIN_NAME)
			.setDesc(t.PLUGIN_DESCRIPTION)
			.setHeading();
		header.settingEl.addClass("pdf-annotations-settings-header");

		// Name, description and checkboxes form one card, stacked: the grid
		// goes into the setting's control element, which styles.css widens to
		// the full row underneath the text.
		const annotationSetting = new Setting(containerEl)
			.setName(t.SETTING_ANNOTATIONS_NAME)
			.setHeading();
		annotationSetting.settingEl.addClass(
			"pdf-annotations-annotation-setting"
		);

		const annotationGrid = annotationSetting.controlEl.createDiv({
			cls: "pdf-annotations-annotation-grid",
		});
		SUPPORTED_ANNOTS.forEach(({ subtype, description }) => {
			const option = annotationGrid.createEl("label", {
				cls: "pdf-annotations-annotation-option",
			});
			const checkbox = option.createEl("input", { type: "checkbox" });
			checkbox.checked =
				this.plugin.settings.isAnnotationDesired(subtype);
			option.createSpan({ text: description });

			checkbox.addEventListener("change", () => {
				this.plugin.settings.setAnnotationDesired(
					subtype,
					checkbox.checked
				);
				this.plugin
					.saveSettings()
					.catch((error) => console.error(error));
			});
		});

		// The instructions are this heading's description rather than a
		// paragraph after it, so the section reads as one block. They go in
		// through descEl because setDesc takes text, and this text has a link
		// in the middle of it.
		const templatesHeading = new Setting(containerEl)
			.setName(t.SECTION_TEMPLATES)
			.setHeading();
		templatesHeading.descEl.addClass("pdf-annotations-template-instructions");
		this.appendTextWithLink(
			templatesHeading.descEl,
			t.SECTION_TEMPLATES_DESC,
			t.HANDLEBARS_LINK,
			HANDLEBARS_DOCS
		);

		// Folded away by default: the table is a reference to look something up
		// in, not something to read past on the way to the templates.
		const variablesContent = this.createAccordion(
			containerEl,
			t.SHOW_VARIABLES_TABLE,
			t.HIDE_VARIABLES_TABLE
		);
		const templateVariableTable = variablesContent.createEl("table", {
			cls: "pdf-annotations-variable-table",
		});
		const templateVariableHead = templateVariableTable
			.createEl("thead")
			.createEl("tr");
		templateVariableHead.createEl("th", {
			text: t.TABLE_VARIABLE,
		});
		templateVariableHead.createEl("th", {
			text: t.TABLE_DESCRIPTION,
		});

		const templateVariableBody = templateVariableTable.createEl("tbody");
		Object.entries(TEMPLATE_VARIABLES).forEach((variableData) => {
			const [key, description] = variableData,
				templateVariableRow = templateVariableBody.createEl("tr"),
				nameCell = templateVariableRow.createEl("td", {
					cls: "pdf-annotations-variable-name",
				}),
				variable = "{{" + key + "}}";

			// The variable and its copy button share a pill, so hovering either
			// of them lights up the whole thing.
			const pill = nameCell.createSpan({
				cls: "pdf-annotations-variable",
			});
			pill.createSpan({ cls: "text-monospace", text: variable });
			this.addCopyAction(pill, variable);

			templateVariableRow.createEl("td", { text: description });
		});

		// A card per template, one above the other, each with its text above
		// its input.
		const templateColumns = containerEl.createDiv({
			cls: "pdf-annotations-template-columns",
		});
		const templateCards = [
			{
				name: t.SETTING_HIGHLIGHT_TEMPLATE_NAME,
				desc: t.SETTING_HIGHLIGHT_TEMPLATE_DESC,
				settingsKey: "highlightTemplate",
			},
			{
				name: t.SETTING_NOTE_TEMPLATE_NAME,
				desc: t.SETTING_NOTE_TEMPLATE_DESC,
				settingsKey: "noteTemplate",
			},
		];
		templateCards.forEach(({ name, desc, settingsKey }) => {
			const card = new Setting(templateColumns)
				.setName(name)
				.setDesc(desc)
				.addTextArea((input) => {
					input.inputEl.addClass("pdf-annotations-template-input");
					this.buildValueInput(input, settingsKey);
					this.addLineNumbers(input.inputEl);
				});
			card.settingEl.addClass("pdf-annotations-template-setting");
		});

		// Two groups, in the order they take effect: what decides where an
		// annotation lands, then what gets written above it.
		// The topic heading has nothing to head until a topic is split off the
		// annotation, so it follows the setting that does the splitting: off and
		// out of reach while that one is. It stays in view either way, and the
		// setting it is switched off from is remembered, so switching the
		// grouping back on brings the heading back with it.
		// Assigned as the settings below are built, before anything can call it.
		let topicHeadingToggle!: ToggleComponent;
		let dateHeadingToggle!: ToggleComponent;
		let syncingHeadings = false;
		const syncHeading = (
			toggle: ToggleComponent,
			enabled: boolean,
			remembered: boolean
		) => {
			// setValue calls onChange, which would take this for an edit and
			// write the remembered choice away.
			syncingHeadings = true;
			toggle.setValue(enabled && remembered);
			toggle.setDisabled(!enabled);
			syncingHeadings = false;
		};
		const syncTopicHeading = () =>
			syncHeading(
				topicHeadingToggle,
				this.plugin.settings.sortByTopic,
				this.plugin.settings.topicHeading
			);
		const syncDateHeading = () =>
			syncHeading(
				dateHeadingToggle,
				this.plugin.settings.groupByDate,
				this.plugin.settings.dateHeading
			);

		new Setting(containerEl)
			.setName(t.SECTION_GROUPING)
			.setHeading();
		new Setting(containerEl)
			.setName(t.SETTING_SORT_BY_TOPIC_NAME)
			.setDesc(t.SETTING_SORT_BY_TOPIC_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.sortByTopic)
					.onChange(async (value) => {
						this.plugin.settings.sortByTopic = value;
						syncTopicHeading();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SETTING_GROUP_BY_DATE_NAME)
			.setDesc(t.SETTING_GROUP_BY_DATE_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupByDate)
					.onChange(async (value) => {
						this.plugin.settings.groupByDate = value;
						syncDateHeading();
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SETTING_GROUP_BY_FOLDER_NAME)
			.setDesc(t.SETTING_GROUP_BY_FOLDER_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.groupByFolder)
					.onChange(async (value) => {
						this.plugin.settings.groupByFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SECTION_HEADINGS)
			.setHeading();
		new Setting(containerEl)
			.setName(t.SETTING_DATE_HEADING_NAME)
			.setDesc(t.SETTING_DATE_HEADING_DESC)
			.addToggle((toggle) => {
				dateHeadingToggle = toggle;
				toggle
					.setValue(this.plugin.settings.dateHeading)
					.onChange(async (value) => {
						if (syncingHeadings) return;
						this.plugin.settings.dateHeading = value;
						await this.plugin.saveSettings();
					});
			});
		syncDateHeading();

		new Setting(containerEl)
			.setName(t.SETTING_TOPIC_HEADING_NAME)
			.setDesc(t.SETTING_TOPIC_HEADING_DESC)
			.addToggle((toggle) => {
				topicHeadingToggle = toggle;
				toggle
					.setValue(this.plugin.settings.topicHeading)
					.onChange(async (value) => {
						if (syncingHeadings) return;
						this.plugin.settings.topicHeading = value;
						await this.plugin.saveSettings();
					});
			});
		syncTopicHeading();

		new Setting(containerEl)
			.setName(t.SETTING_FILE_HEADING_NAME)
			.setDesc(t.SETTING_FILE_HEADING_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						folder: t.OPTION_FILE_HEADING_FOLDER,
						file: t.OPTION_FILE_HEADING_FILE,
						none: t.OPTION_FILE_HEADING_NONE,
					})
					.setValue(this.plugin.settings.fileHeading)
					.onChange(async (value) => {
						this.plugin.settings.fileHeading = value as FileHeading;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName(t.SECTION_NOTES)
			.setHeading();
		// The folder and the subfolder are only somewhere to put a note when
		// the note is going into the vault rather than beside its PDF.
		let noteFolderInput!: TextComponent;
		let noteSubfolderInput!: TextComponent;
		const syncNoteTarget = () => {
			const intoVault = this.plugin.settings.noteLocation === "vault";
			noteFolderInput.setDisabled(!intoVault);
			noteSubfolderInput.setDisabled(!intoVault);
			// Faded as well as disabled: a note going beside its PDF has no
			// folder of the vault to be put in and no subfolder under it, so
			// neither field has anything to say until that changes.
			for (const setting of [noteFolderSetting, noteSubfolderSetting]) {
				setting.settingEl.classList.toggle(
					"pdf-annotations-setting-disabled",
					!intoVault
				);
			}
		};

		new Setting(containerEl)
			.setName(t.SETTING_NOTE_LOCATION_NAME)
			.setDesc(t.SETTING_NOTE_LOCATION_DESC)
			.addDropdown((dropdown) =>
				dropdown
					.addOptions({
						current: t.OPTION_NOTE_LOCATION_CURRENT,
						vault: t.OPTION_NOTE_LOCATION_VAULT,
					})
					.setValue(this.plugin.settings.noteLocation)
					.onChange(async (value) => {
						this.plugin.settings.noteLocation =
							value as NoteLocation;
						syncNoteTarget();
						await this.plugin.saveSettings();
					})
			);
		const noteFolderSetting = new Setting(containerEl)
			.setName(t.SETTING_NOTE_FOLDER_NAME)
			.setDesc(t.SETTING_NOTE_FOLDER_DESC)
			.addText((input) => {
				noteFolderInput = input;
				input.setPlaceholder(t.PLACEHOLDER_VAULT_ROOT);
				this.buildValueInput(input, "noteFolder");
				new FolderSuggest(this.app, input.inputEl).onSelect(
					async (folder) => {
						input.setValue(folder);
						this.plugin.settings.noteFolder = folder;
						await this.plugin.saveSettings();
					}
				);
			});
		noteFolderSetting.settingEl.addClass("pdf-annotations-stacked-setting");
		const noteSubfolderSetting = new Setting(containerEl)
			.setName(t.SETTING_NOTE_SUBFOLDER_NAME)
			.setDesc(t.SETTING_NOTE_SUBFOLDER_DESC)
			.addText((input) => {
				noteSubfolderInput = input;
				input.setPlaceholder(t.PLACEHOLDER_NO_SUBFOLDER);
				this.buildValueInput(input, "noteSubfolder");
			});
		noteSubfolderSetting.settingEl.addClass(
			"pdf-annotations-stacked-setting"
		);
		syncNoteTarget();
		new Setting(containerEl)
			.setName(t.SETTING_NOTE_NAME_NAME)
			.setDesc(t.SETTING_NOTE_NAME_DESC)
			.addText((input) => this.buildValueInput(input, "noteName"));
		// The name template has nothing left to name once the topic names the
		// notes, so it is shown as the setting it is: one of the two, not both.
		// Faded and its field disabled, rather than merely faded — a field that
		// looks spent but still takes what is typed into it is worse than one
		// that plainly does nothing.
		let oneNoteNameInput!: TextComponent;
		let oneNoteNameSetting!: Setting;
		const syncOneNoteName = () => {
			const named = this.plugin.settings.topicToNoteName;
			oneNoteNameInput.setDisabled(named);
			oneNoteNameSetting.settingEl.classList.toggle(
				"pdf-annotations-setting-disabled",
				named
			);
		};

		oneNoteNameSetting = new Setting(containerEl)
			.setName(t.SETTING_ONE_NOTE_NAME_NAME)
			.setDesc(t.SETTING_ONE_NOTE_NAME_DESC)
			.addText((input) => {
				oneNoteNameInput = input;
				this.buildValueInput(input, "oneNotePerAnnotationName");
			});
		new Setting(containerEl)
			.setName(t.SETTING_TOPIC_TO_NAME_NAME)
			.setDesc(t.SETTING_TOPIC_TO_NAME_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.topicToNoteName)
					.onChange(async (value) => {
						this.plugin.settings.topicToNoteName = value;
						syncOneNoteName();
						await this.plugin.saveSettings();
					})
			);
		syncOneNoteName();
		new Setting(containerEl)
			.setName(t.SETTING_OVERWRITE_NAME)
			.setDesc(t.SETTING_OVERWRITE_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.overwriteExistingNote)
					.onChange(async (value) => {
						this.plugin.settings.overwriteExistingNote = value;
						await this.plugin.saveSettings();
					})
			);
			new Setting(containerEl)
			.setName(t.SETTING_EXTRACT_TAGS_NAME)
			.setDesc(t.SETTING_EXTRACT_TAGS_DESC)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.extractTagsFromAnnotationsAsObsidianTags)
					.onChange(async (value) => {
						this.plugin.settings.extractTagsFromAnnotationsAsObsidianTags = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
