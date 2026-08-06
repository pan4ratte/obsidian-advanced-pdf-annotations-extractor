import {
	compile as compileTemplate,
	TemplateDelegate as Template,
} from "handlebars";
import {
	Editor,
	FileSystemAdapter,
	loadPdfJs,
	MarkdownView,
	Platform,
	Plugin,
	TFile,
	Vault,
	Notice,
} from "obsidian";
import { t } from "lang/helpers";
import { loadPDFFile } from "src/extractHighlight";
import {
	cleanNoteName,
	DEFAULT_DESIRED_ANNOTATIONS,
	PDFAnnotationPluginSetting,
	PDFAnnotationPluginSettingTab,
	resolveNotePath,
} from "src/settings";
import { compareAnnotations } from "src/ordering";
import { takeTagsFromAnnotations } from "src/tags";
import { assignTopics, takeTopicForNoteName } from "src/topics";
import {
	asIndexable,
	FileMeta,
	LoadedAnnotations,
	PDFAnnotation,
	PDFFile,
	PDFJsLib,
} from "src/types";
import { AdvancedExtractionModal } from "src/advancedExtractionModal";

import { PDFAnnotationPluginFormatter } from "./formatter";

/**
 * The one thing this plugin asks of Node's `fs`: whether a path the reader
 * pasted names a file.
 *
 * Described here rather than taken from `typeof import("fs")`, which is only a
 * type where `@types/node` is installed. It is a devDependency, so a checkout
 * that installs none — a reviewer's, a CI job that lints without building —
 * resolves it to `any`, and that `any` then spreads through every call made on
 * it. Naming the one method used costs four lines and depends on nothing.
 */
interface NodeFileSystem {
	statSync(path: string): { isFile(): boolean };
}

/**
 * The loader Obsidian's CommonJS bundle is handed. Declared for the same
 * reason as the interface above: without `@types/node` the name resolves to
 * nothing at all, and a call on an unresolved name is unsafe by definition.
 * Declaring it emits nothing — at run time this is Electron's own `require`,
 * reached only behind the desktop guard that precedes every use.
 */
declare const require: (id: string) => unknown;

/** When a name template and the PDF's own name both render nothing usable. */
const FALLBACK_NOTE_NAME = "Annotations";

export default class PDFAnnotationPlugin extends Plugin {
	public settings: PDFAnnotationPluginSetting;
	public formatter: PDFAnnotationPluginFormatter;

	// Template compilation options
	private templateSettings = {
		noEscape: true,
	};

	sort(grandtotal: PDFAnnotation[]) {
		const settings = this.settings;

		// Independent of the headings: grouping decides whether the line stays
		// in the body, not whether it is read.
		assignTopics(grandtotal, settings.sortByTopic);

		grandtotal.sort(compareAnnotations(settings, grandtotal));
	}

	/**
	 * Reads one PDF in the vault without writing anything — the advanced
	 * extraction needs the annotations long before it knows which to write.
	 * It asks for every type, so ticking one off needs no second read.
	 */
	async loadAnnotationsFromVaultFile(
		pdfFile: TFile,
		desiredAnnotations: string[] = this.settings.desiredAnnotations
	): Promise<LoadedAnnotations> {
		const pdfjsLib = (await loadPdfJs()) as PDFJsLib;
		const containingFolder = pdfFile.parent.name;
		const grandtotal: PDFAnnotation[] = [];
		const content = await this.app.vault.readBinary(pdfFile);
		await loadPDFFile(
			PDFFile.convertTFileToPDFFile(pdfFile, content),
			pdfjsLib,
			containingFolder,
			grandtotal,
			desiredAnnotations
		);
		return {
			fileMeta: pdfFile,
			annotations: grandtotal,
			isExternalFile: false,
		};
	}

	/**
	 * Into the note being edited, for the advanced extraction — which is asked
	 * for from the palette and so reaches this without an editor of its own.
	 */
	async insertLoadedAnnotations(
		loaded: LoadedAnnotations,
		view: MarkdownView
	): Promise<void> {
		this.sort(loaded.annotations);
		await this.insertIntoNote(
			view.editor,
			view,
			loaded.annotations,
			loaded.isExternalFile
		);
	}

	/** Sorts and files what an extraction gathered, however it was gathered. */
	async writeLoadedAnnotations(
		loaded: LoadedAnnotations,
		onePerAnnotation = false
	): Promise<void> {
		this.sort(loaded.annotations);
		await this.writeNotes(
			loaded.fileMeta,
			loaded.annotations,
			loaded.isExternalFile,
			onePerAnnotation
		);
	}

	async loadSinglePDFFile(pdfFile: TFile, onePerAnnotation = false) {
		const loaded = await this.loadAnnotationsFromVaultFile(pdfFile);
		await this.writeLoadedAnnotations(loaded, onePerAnnotation);
	}
	/**
	 * Into the note's own properties rather than a front matter block in its
	 * text, which further down a note is text like any other. Existing tags
	 * are kept.
	 */
	private async addTagsToNoteProperties(
		note: TFile,
		tags: string[]
	): Promise<void> {
		if (tags.length === 0) return;

		await this.app.fileManager.processFrontMatter(note, (frontmatter) => {
			const properties = frontmatter as Record<string, unknown>;
			const existing = properties.tags;
			const kept = Array.isArray(existing)
				? existing.map(String)
				: typeof existing === "string" && existing.length > 0
					? [existing]
					: [];

			properties.tags = [...new Set([...kept, ...tags])];
		});
	}

	/**
	 * Inserts at the cursor instead of making a note. The tags go to that
	 * note's properties, so what was inserted is saved first — properties are
	 * written to the note on disk, over anything still unsaved in the editor.
	 */
	private async insertIntoNote(
		editor: Editor,
		view: MarkdownView,
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean
	): Promise<void> {
		// Everything gathered goes into the one note being edited, which is a
		// single note as far as the setting is concerned.
		const tags = this.settings.extractsTags(false)
			? takeTagsFromAnnotations(grandtotal)
			: [];

		editor.replaceSelection(
			this.formatter.format(grandtotal, isExternalFile)
		);

		const note = view.file;
		if (tags.length === 0 || !note) return;

		await view.save();
		await this.addTagsToNoteProperties(note, tags);
	}

	private async writeNotes(
		fileMeta: FileMeta,
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean,
		onePerAnnotation = false
	): Promise<void> {
		// Notes following the current file need one to follow, and the
		// clipboard commands need nothing open. Falling back to the vault root
		// would quietly scatter notes nobody asked for.
		if (
			this.settings.noteLocation === "current" &&
			!this.app.workspace.getActiveFile()
		) {
			new Notice(t.NOTICE_NO_CURRENT_FILE);
			return;
		}

		const currentFolder = this.currentFolder();
		const extractTags = this.settings.extractsTags(onePerAnnotation);

		// Every annotation of one read came out of the same PDF, so the first
		// of them speaks for the file. A read with nothing in it still writes
		// its note, and that note's name has no folder to go by.
		const pdfFolder = grandtotal[0]?.folder ?? "";

		/** Taken out before rendering, so a tag lands in the properties only. */
		const takeTags = (annotations: PDFAnnotation[]) =>
			extractTags ? takeTagsFromAnnotations(annotations) : [];

		if (onePerAnnotation) {
			// Written one after another: concurrent writes to the same note (when
			// the note name lacks {{counter}}) would race each other.
			for (const [index, anno] of grandtotal.entries()) {
				const counter = index + 1;
				const tags = takeTags([anno]);
				// What names the note it need not also say inside. Grouping by
				// topic has already taken the line out of the body.
				const topic = this.settings.topicToNoteName
					? takeTopicForNoteName(anno, !this.settings.sortByTopic)
					: null;
				const note = this.formatter.format(
					[anno],
					isExternalFile,
					true
				);
				const fileNameOfNote =
					(topic === null
						? this.getResolvedOneNotePerAnnotationName(
								fileMeta,
								counter,
								anno,
								isExternalFile
							)
						: this.usableNoteName(
								topic,
								this.getResolvedNoTopicName(fileMeta, counter)
							)) + ".md";
				const filePathOfNote = this.getResolvedNotePath(fileMeta, currentFolder, fileNameOfNote, pdfFolder);
				// A note per annotation is a great many notes; opening each of
				// them buries whatever the reader was looking at.
				const written = await this.saveHighlightsToFile(filePathOfNote, note, this.settings.overwriteExistingNote, false);
				if (written) {
					await this.addTagsToNoteProperties(written, tags);
				}
			}
		} else {
			const tags = takeTags(grandtotal);
			const finalMarkdown = this.formatter.format(grandtotal, isExternalFile);
			const fileNameOfNote =
				this.getResolvedNoteName(fileMeta, pdfFolder) + ".md";
			const filePathOfNote = this.getResolvedNotePath(fileMeta, currentFolder, fileNameOfNote, pdfFolder);
			const written = await this.saveHighlightsToFile(filePathOfNote, finalMarkdown, this.settings.overwriteExistingNote, true);
			if (written) {
				await this.addTagsToNoteProperties(written, tags);
			}
		}
	}

	/** Folder of the file being looked at; empty for the root or nothing open. */
	private currentFolder(): string {
		return this.app.workspace.getActiveFile()?.parent?.path ?? "";
	}

	private noticeClipboardPathIsDesktopOnly(): {
		grandtotal: PDFAnnotation[];
		pdfFile: PDFFile | null;
	} {
		new Notice(t.NOTICE_PATH_DESKTOP_ONLY);
		return { grandtotal: [], pdfFile: null };
	}

	async loadAnnotationsFromSinglePDFFileFromClipboardPath(
		filePathFromClipboard: string,
		desiredAnnotations: string[] = this.settings.desiredAnnotations
	): Promise<{ grandtotal: PDFAnnotation[]; pdfFile: PDFFile | null }> {
		if (!Platform.isDesktop) {
			return this.noticeClipboardPathIsDesktopOnly();
		}
		// isDesktop only means the UI is in desktop mode; Node's fs exists solely
		// in the Electron app.
		if (!Platform.isDesktopApp) {
			return this.noticeClipboardPathIsDesktopOnly();
		}
		const grandtotal: PDFAnnotation[] = [];
		let pdfFile: PDFFile | null = null;
		try {
			// Behind the desktop guard above, since mobile has no fs.
			// require() because esbuild leaves a bare import() in the CJS
			// bundle, which Obsidian's loader cannot always resolve.
			const fs = require("fs") as NodeFileSystem;
			const filePathWithoutBeginningAndEndQuotes = filePathFromClipboard.replace(
				/^["']|["']$/g,
				""
			);
			const stats = fs.statSync(filePathWithoutBeginningAndEndQuotes);
			if (stats.isFile()) {
				const pdfjsLib = (await loadPdfJs()) as PDFJsLib;
				const binaryContent = await FileSystemAdapter.readLocalFile(
					filePathWithoutBeginningAndEndQuotes
				);
				const filePathWithSlashs: string =
					filePathWithoutBeginningAndEndQuotes.replace(/\\/g, "/");
				const filePathSplits: string[] = filePathWithSlashs.split("/");
				const fileName = filePathSplits.last();
				const extension = fileName.split(".").last();
				const encodedFilePath = encodeURI(
					"file://" + filePathWithoutBeginningAndEndQuotes
				);
				pdfFile = new PDFFile(
					fileName,
					binaryContent,
					extension,
					encodedFilePath
				);
				const containingFolder = filePathWithSlashs.slice(
					0,
					filePathWithSlashs.lastIndexOf("/")
				);
				await loadPDFFile(
					pdfFile,
					pdfjsLib,
					containingFolder,
					grandtotal,
					desiredAnnotations
				);
			} else {
				new Notice(t.NOTICE_PATH_NOT_A_FILE);
			}
		} catch (error) {
			new Notice(t.NOTICE_PATH_UNREADABLE);
			console.error(error);
		}
		return { grandtotal, pdfFile };
	}

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new PDFAnnotationPluginSettingTab(this.app, this));

		this.formatter = new PDFAnnotationPluginFormatter(this.settings);

		this.addCommand({
			id: "extract-annotations-single",
			name: t.COMMAND_EXTRACT_CURRENT_FILE,
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file != null && file.extension === "pdf") {
					if (!checking) {
						// load file if (not only checking) && conditions are valid
						this.loadSinglePDFFile(file).catch((error) => {
							console.error(error);
							new Notice(t.NOTICE_EXTRACTION_FAILED);
						});
					}
					return true;
				} else {
					return false;
				}
			},
		});

		// A command rather than a setting, so the choice is made where the
		// extraction is asked for.
		this.addCommand({
			id: "extract-annotations-single-per-annotation",
			name: t.COMMAND_EXTRACT_CURRENT_FILE_PER_ANNOTATION,
			checkCallback: (checking: boolean) => {
				const file = this.app.workspace.getActiveFile();
				if (file != null && file.extension === "pdf") {
					if (!checking) {
						this.loadSinglePDFFile(file, true).catch((error) => {
							console.error(error);
							new Notice(t.NOTICE_EXTRACTION_FAILED);
						});
					}
					return true;
				} else {
					return false;
				}
			},
		});

		// Nothing need be open: which PDF to read is one of the modal's
		// questions rather than something decided before the command ran.
		this.addCommand({
			id: "extract-annotations-advanced",
			name: t.COMMAND_EXTRACT_ADVANCED,
			callback: () => {
				new AdvancedExtractionModal(this.app, this).open();
			},
		});

		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const result = await this.loadAnnotationsFromSinglePDFFileFromClipboardPath(clipText);
				if (result.pdfFile) {
					this.sort(result.grandtotal);
					await this.insertIntoNote(
						editor,
						view,
						result.grandtotal,
						true
					);
				}
			},
		});

		// A command of its own, so a PDF outside the vault reaches a new note
		// without one open to insert into first.
		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path-to-note",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH_TO_NOTE,
			callback: async () => {
				const clipText = await navigator.clipboard.readText();
				const result = await this.loadAnnotationsFromSinglePDFFileFromClipboardPath(clipText);
				if (result.pdfFile) {
					this.sort(result.grandtotal);
					await this.writeNotes(result.pdfFile, result.grandtotal, true);
				}
			},
		});

		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path-per-annotation",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH_PER_ANNOTATION,
			callback: async () => {
				const clipText = await navigator.clipboard.readText();
				const result = await this.loadAnnotationsFromSinglePDFFileFromClipboardPath(clipText);
				if (result.pdfFile) {
					this.sort(result.grandtotal);
					await this.writeNotes(result.pdfFile, result.grandtotal, true, true);
				}
			},
		});

		this.addCommand({
			id: "extract-annotations",
			name: t.COMMAND_EXTRACT_CURRENT_FOLDER,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const file = this.app.workspace.getActiveFile();
				if (file == null) return;
				const folder = file.parent;
				const grandtotal: PDFAnnotation[] = []; // array that will contain all fetched Annotations
				const desiredAnnotations = this.settings.desiredAnnotations;

				const pdfjsLib = (await loadPdfJs()) as PDFJsLib;

				const promises: Promise<void>[] = []; // when all Promises will be resolved.

				Vault.recurseChildren(folder, async (file) => {
					// visit all Childern of parent folder of current active File
					if (file instanceof TFile) {
						if (file.extension === "pdf") {
							promises.push(
								this.app.vault
									.readBinary(file)
									.then((content) =>
										loadPDFFile(
											PDFFile.convertTFileToPDFFile(
												file,
												content
											),
											pdfjsLib,
											file.parent.name,
											grandtotal,
											desiredAnnotations
										)
									)
							);
						}
					}
				});
				await Promise.all(promises);
				this.sort(grandtotal);
				await this.insertIntoNote(editor, view, grandtotal, false);
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = new PDFAnnotationPluginSetting();
		const loadedSettings = (await this.loadData()) as
			| Record<string, unknown>
			| null;
		if (!loadedSettings) return;

		// Every field the settings object declares, so a new setting cannot be
		// forgotten here and silently never load.
		Object.keys(this.settings).forEach((setting) => {
			if (!(setting in loadedSettings)) return;
			// A field this version declares as a toggle and data.json holds as
			// something else keeps the default: 1.1 wrote `fileHeading` as the
			// dropdown the folder and file toggles replaced, and every string
			// it could have written — `"none"` included — is truthy.
			if (
				typeof asIndexable(this.settings)[setting] === "boolean" &&
				typeof loadedSettings[setting] !== "boolean"
			) {
				return;
			}
			asIndexable(this.settings)[setting] = loadedSettings[setting];
		});

		// data.json is a file a reader may edit, so nothing loaded from it is
		// taken on trust: a value none of these knows falls back to the default.
		const settings = PDFAnnotationPluginSetting;
		this.settings.desiredAnnotations =
			settings.normalizeDesiredAnnotations(
				this.settings.desiredAnnotations
			) ?? [...DEFAULT_DESIRED_ANNOTATIONS];
		this.settings.annotationTemplates =
			settings.normalizeAnnotationTemplates(
				this.settings.annotationTemplates
			);
		this.settings.noteLocation = settings.normalizeNoteLocation(
			this.settings.noteLocation
		);
		this.settings.extractTags = settings.normalizeTagExtraction(
			this.settings.extractTags
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	onunload() {}

	get noteNameTemplate(): Template {
		return compileTemplate(this.settings.noteName, this.templateSettings);
	}

	get oneNotePerAnnotationNameTemplate(): Template {
		return compileTemplate(this.settings.oneNotePerAnnotationName, this.templateSettings);
	}

	/**
	 * `folder` is the annotations' own, so `{{folder}}` names the same place
	 * here as it does inside a template. It is empty when the read found
	 * nothing to say where it came from.
	 */
	getTemplateVariablesForNoteName(
		file: FileMeta,
		folder = ""
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename,
			folder: folder,
		};

		return { file: file, ...shortcuts };
	}

	getTemplateVariablesForOneNotePerAnnotationName(
		file: FileMeta,
		counter: number,
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename,
			counter: counter,
		};

		// The note holds one annotation, so its own variables name it as well
		// as the PDF's do — {{topic}} above all.
		return {
			...this.formatter.getTemplateVariablesForAnnotation(
				annotation,
				isExternalFile
			),
			file: file,
			...shortcuts,
		};
	}

	/**
	 * A name the vault will take, whatever the template rendered. An empty one
	 * would write a hidden `.md` nobody finds, so a fallback stands in.
	 */
	private usableNoteName(rendered: string, fallback: string): string {
		return (
			cleanNoteName(rendered) ||
			cleanNoteName(fallback) ||
			FALLBACK_NOTE_NAME
		);
	}

	getResolvedNoteName(file: FileMeta, folder = ""): string {
		return this.usableNoteName(
			this.noteNameTemplate(
				this.getTemplateVariablesForNoteName(file, folder)
			),
			file.basename
		);
	}

	/**
	 * For an annotation with no comment to take a topic from — a highlight
	 * marked without a word. Numbered, or they would all be the one note.
	 */
	getResolvedNoTopicName(file: FileMeta, counter: number): string {
		return compileTemplate(t.NAME_NO_TOPIC, this.templateSettings)({
			filename: file.basename,
			counter: counter,
		});
	}

	getResolvedOneNotePerAnnotationName(
		file: FileMeta,
		counter: number,
		annotation: PDFAnnotation,
		isExternalFile: boolean
	): string {
		return this.usableNoteName(
			this.oneNotePerAnnotationNameTemplate(
				this.getTemplateVariablesForOneNotePerAnnotationName(
					file,
					counter,
					annotation,
					isExternalFile
				)
			),
			// Renders nothing when what it asks of the annotation is absent —
			// `{{topic}}` for a highlight marked without a comment.
			this.getResolvedNoTopicName(file, counter)
		);
	}

	get noteSubfolderTemplate(): Template {
		return compileTemplate(
			this.settings.noteSubfolder,
			this.templateSettings
		);
	}

	getResolvedNoteSubfolder(file: FileMeta, folder = ""): string {
		if (!this.settings.noteSubfolder.trim()) return "";
		return this.noteSubfolderTemplate(
			this.getTemplateVariablesForNoteName(file, folder)
		);
	}

	getResolvedNotePath(
		pdfFile: FileMeta,
		currentFolder: string,
		fileNameOfNote: string,
		folder = ""
	): string {
		return resolveNotePath(
			this.settings,
			currentFolder,
			fileNameOfNote,
			this.getResolvedNoteSubfolder(pdfFile, folder)
		);
	}

	/**
	 * The subfolder a template names need not exist yet, and `vault.create`
	 * will not make it. Anything already there is left alone.
	 */
	private async createMissingFolders(filePath: string): Promise<void> {
		const lastSlash = filePath.lastIndexOf("/");
		if (lastSlash < 0) return;

		const folder = filePath.slice(0, lastSlash);
		if (!folder || this.app.vault.getFolderByPath(folder)) return;

		try {
			await this.app.vault.createFolder(folder);
		} catch (error) {
			// Made in the meantime by another note of the same run, or named
			// something the vault refuses — which `vault.create` reports.
			console.error(error);
		}
	}

	/**
	 * Returns the note it wrote, so its properties can be filled in afterwards,
	 * or null when the vault would not take the path.
	 */
	async saveHighlightsToFile(
		filePath: string,
		mdString: string,
		overwriteExistingNote: boolean,
		openIt: boolean
	): Promise<TFile | null> {
		await this.createMissingFolders(filePath);
		const fileExists = await this.app.vault.adapter.exists(filePath);
		if (fileExists) {
			if (overwriteExistingNote) {
				await this.app.vault.adapter.write(filePath, mdString);
			} else {
				await this.appendHighlightsToFile(filePath, mdString);
			}
			if (openIt) {
				await this.app.workspace.openLinkText(filePath, "", true);
			}
			return this.app.vault.getFileByPath(filePath);
		}

		try {
			const created = await this.app.vault.create(filePath, mdString);
			if (openIt) {
				await this.app.workspace.openLinkText(filePath, "", true);
			}
			return created;
		} catch (error) {
			console.error(error);
			new Notice(t.NOTICE_NOTE_PATH_INVALID);
			return null;
		}
	}

	async appendHighlightsToFile(filePath: string, note: string) {
		let existingContent = await this.app.vault.adapter.read(filePath);
		if (existingContent.length > 0) {
			existingContent = existingContent + "\r\r";
		}
		await this.app.vault.adapter.write(filePath, existingContent + note);
	}
}
