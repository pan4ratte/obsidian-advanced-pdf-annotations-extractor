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
	DEFAULT_DESIRED_ANNOTATIONS,
	PDFAnnotationPluginSetting,
	PDFAnnotationPluginSettingTab,
	resolveNotePath,
} from "src/settings";
import {
	asIndexable,
	FileMeta,
	PDFAnnotation,
	PDFFile,
	PDFJsLib,
} from "src/types";

import { PDFAnnotationPluginFormatter } from "./formatter";

export default class PDFAnnotationPlugin extends Plugin {
	public settings: PDFAnnotationPluginSetting;
	public formatter: PDFAnnotationPluginFormatter;

	// Template compilation options
	private templateSettings = {
		noEscape: true,
	};

	sort(grandtotal: PDFAnnotation[]) {
		const settings = this.settings;

		// Independent of the headings: the topic is a sort key and a template
		// variable in its own right, just like the folder name.
		if (settings.sortByTopic) {
			grandtotal.forEach((anno) => {
				const lines = anno.body.split(/\r\n|\n\r|\n|\r/); // split by:     \r\n  \n\r  \n  or  \r
				anno.topic = lines[0]; // First line of contents
				anno.body = lines.slice(1).join("\r\n");
			});
		}

		grandtotal.sort(function (a1, a2) {
			if (settings.groupByDate) {
				// The day the annotation was made, outside every other
				// grouping. A PDF need not date its annotations at all, and
				// the ones it left undated belong after those it dated rather
				// than before the earliest of them.
				const d1 = a1.created ?? "";
				const d2 = a2.created ?? "";
				if (d1 != d2) {
					if (!d1) return 1;
					if (!d2) return -1;
					return d1 < d2 ? -1 : 1;
				}
			}

			if (settings.sortByTopic) {
				// sort by topic
				if (a1.topic > a2.topic) return 1;
				if (a1.topic < a2.topic) return -1;
			}

			if (settings.groupByFolder) {
				// then sort by folder
				if (a1.folder > a2.folder) return 1;
				if (a1.folder < a2.folder) return -1;
			}

			// then sort by file.name
			if (a1.file.name > a2.file.name) return 1;
			if (a1.file.name < a2.file.name) return -1;

			// then sort by page
			if (a1.pageNumber > a2.pageNumber) return 1;
			if (a1.pageNumber < a2.pageNumber) return -1;

			// they are on the same, page, sort (descending) by minY
			// if quadPoints are undefined, use minY from the rect-angle
			if (a1.rect[1] > a2.rect[1]) return -1;
			if (a1.rect[1] < a2.rect[1]) return 1;
			return 0;
		});
	}

	async loadSinglePDFFile(pdfFile: TFile, onePerAnnotation = false) {
		const pdfjsLib = (await loadPdfJs()) as PDFJsLib;
		const containingFolder = pdfFile.parent.name;
		const grandtotal: PDFAnnotation[] = [];
		const desiredAnnotations = this.settings.desiredAnnotations;
		const content = await this.app.vault.readBinary(pdfFile);
		await loadPDFFile(
			PDFFile.convertTFileToPDFFile(pdfFile, content),
			pdfjsLib,
			containingFolder,
			grandtotal,
			desiredAnnotations
		);
		this.sort(grandtotal);
		await this.writeNotes(pdfFile, grandtotal, false, onePerAnnotation);
	}
	private tagsInAnnotations(annotations: PDFAnnotation[]): string[] {
		// Use Set instead of Array to eliminate duplicates
		const extractedTagsFromAnnotations = new Set<string>();
		annotations.forEach((annotation) => {
			const tagPattern = /#([\wöäü_/-]*[A-Za-zöäü][\wöäü_/-]*)/g;
			let match: RegExpExecArray | null;
			while ((match = tagPattern.exec(annotation.body)) !== null) {
				extractedTagsFromAnnotations.add(match[1]);
			}
		});
		return [...extractedTagsFromAnnotations];
	}

	/**
	 * Add the tags to the note's own properties, rather than writing a block of
	 * front matter into its text: a note the annotations were appended to
	 * already has its properties at the top, and a second block further down is
	 * text like any other. Existing tags are kept.
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

	private async writeNotes(
		fileMeta: FileMeta,
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean,
		onePerAnnotation = false
	): Promise<void> {
		const currentFolder = this.currentFolder();

		if (onePerAnnotation) {
			// Written one after another: concurrent writes to the same note (when
			// the note name lacks {{counter}}) would race each other.
			for (const [index, anno] of grandtotal.entries()) {
				const note = this.formatter.format([anno], isExternalFile);
				const fileNameOfNote =
					this.getResolvedOneNotePerAnnotationName(fileMeta, index + 1) + ".md";
				const filePathOfNote = this.getResolvedNotePath(fileMeta, currentFolder, fileNameOfNote);
				// A note per annotation is a great many notes; opening each of
				// them buries whatever the reader was looking at.
				const written = await this.saveHighlightsToFile(filePathOfNote, note, this.settings.overwriteExistingNote, false);
				if (written && this.settings.extractTagsFromAnnotationsAsObsidianTags) {
					await this.addTagsToNoteProperties(written, this.tagsInAnnotations([anno]));
				}
			}
		} else {
			const finalMarkdown = this.formatter.format(grandtotal, isExternalFile);
			const fileNameOfNote =
				this.getResolvedNoteName(fileMeta) + ".md";
			const filePathOfNote = this.getResolvedNotePath(fileMeta, currentFolder, fileNameOfNote);
			const written = await this.saveHighlightsToFile(filePathOfNote, finalMarkdown, this.settings.overwriteExistingNote, true);
			if (written && this.settings.extractTagsFromAnnotationsAsObsidianTags) {
				await this.addTagsToNoteProperties(written, this.tagsInAnnotations(grandtotal));
			}
		}
	}

	/**
	 * The folder of the file being looked at, which the notes follow when they
	 * are not going to a folder of their own. Empty for the vault root, and for
	 * a command run with nothing open at all.
	 */
	private currentFolder(): string {
		return this.app.workspace.getActiveFile()?.parent?.path ?? "";
	}

	private noticeClipboardPathIsDesktopOnly(): {
		grandtotal: PDFAnnotation[];
		pdfFile: PDFFile | null;
	} {
		new Notice(t.NOTICE_CLIPBOARD_DESKTOP_ONLY);
		return { grandtotal: [], pdfFile: null };
	}

	async loadAnnotationsFromSinglePDFFileFromClipboardPath(
		filePathFromClipboard: string
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
			// Node's fs is unavailable on mobile, so it is loaded behind the
			// desktop guard above. require() rather than import(), because
			// esbuild leaves a bare import() in the CJS bundle, which Obsidian's
			// plugin loader cannot always resolve.
			const fs = require("fs") as typeof import("fs");
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
				const desiredAnnotations = this.settings.desiredAnnotations;
				await loadPDFFile(
					pdfFile,
					pdfjsLib,
					containingFolder,
					grandtotal,
					desiredAnnotations
				);
			} else {
				new Notice(t.NOTICE_CLIPBOARD_NOT_A_FILE);
			}
		} catch (error) {
			new Notice(t.NOTICE_CLIPBOARD_UNREADABLE);
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

		// One note per annotation is a command rather than a setting, so the
		// choice is made where the extraction is asked for instead of somewhere
		// else, before the fact.
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

		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const result = await this.loadAnnotationsFromSinglePDFFileFromClipboardPath(clipText);
				if (result.pdfFile) {
					this.sort(result.grandtotal);
					editor.replaceSelection(this.formatter.format(result.grandtotal, true));
				}
			},
		});

		// A command of its own rather than a setting on the one above, so a PDF
		// outside the vault can be written to a note without a note open to
		// insert it into first — and without the other command quietly doing
		// something else than its name says.
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
				editor.replaceSelection(
					this.formatter.format(grandtotal, false)
				);
			},
		});
	}

	async loadSettings(): Promise<void> {
		this.settings = new PDFAnnotationPluginSetting();
		const loadedSettings = (await this.loadData()) as
			| Record<string, unknown>
			| null;
		if (loadedSettings) {
			// Several settings were renamed and one dropped. Read them back
			// under the names this version knows first, so the copy below and
			// every migration after it see one set of names rather than two.
			const { data: settingsData, changed: legacyNames } =
				PDFAnnotationPluginSetting.normalizeLegacySettings(
					loadedSettings
				);

			// Every field the settings object declares, so a new setting cannot be
			// forgotten here and silently never load.
			Object.keys(this.settings).forEach((setting) => {
				if (setting in settingsData) {
					asIndexable(this.settings)[setting] = settingsData[setting];
				}
			});

			// The selection is a list of subtypes. Keep whatever data.json holds
			// usable, and fall back to the defaults if it is neither a list nor
			// the comma separated string an older version wrote.
			const desiredAnnotations =
				PDFAnnotationPluginSetting.normalizeDesiredAnnotations(
					this.settings.desiredAnnotations
				);
			this.settings.desiredAnnotations =
				desiredAnnotations ?? [...DEFAULT_DESIRED_ANNOTATIONS];

			// Grouping and heading used to be one boolean. Runs against the raw
			// data.json, since the field it reads is not one of the keys copied
			// across above.
			const structureMigrated =
				PDFAnnotationPluginSetting.migrateStructure(
					settingsData,
					this.settings
				);

			// Where a note goes used to be one string with a magic './' in it.
			const pathMigrated = PDFAnnotationPluginSetting.migrateNotePath(
				settingsData,
				this.settings
			);

			// Written back at once, so data.json stops carrying the four
			// template fields this version no longer reads.
			const migration = PDFAnnotationPluginSetting.migrateTemplates(
				settingsData,
				this.settings
			);
			if (
				migration.migrated ||
				structureMigrated ||
				pathMigrated ||
				legacyNames
			) {
				await this.saveSettings();
			}
			if (migration.dropped.length > 0) {
				new Notice(t.NOTICE_TEMPLATES_COLLAPSED, 15000);
			}
		}
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

	getTemplateVariablesForNoteName(
		file: FileMeta
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename
		};

		return { file: file, ...shortcuts };
	}

	getTemplateVariablesForOneNotePerAnnotationName(
		file: FileMeta,
		counter: number
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename,
			counter: counter,
		};

		return { file: file, ...shortcuts };
	}

	getResolvedNoteName(file: FileMeta): string {
		return this.noteNameTemplate(
			this.getTemplateVariablesForNoteName(file)
		);
	}

	getResolvedOneNotePerAnnotationName(
		file: FileMeta,
		counter: number
	): string {
		return this.oneNotePerAnnotationNameTemplate(
			this.getTemplateVariablesForOneNotePerAnnotationName(file, counter)
		);
	}

	get noteSubfolderTemplate(): Template {
		return compileTemplate(
			this.settings.noteSubfolder,
			this.templateSettings
		);
	}

	getResolvedNoteSubfolder(file: FileMeta): string {
		if (!this.settings.noteSubfolder.trim()) return "";
		return this.noteSubfolderTemplate(
			this.getTemplateVariablesForNoteName(file)
		);
	}

	getResolvedNotePath(
		pdfFile: FileMeta,
		currentFolder: string,
		fileNameOfNote: string
	): string {
		return resolveNotePath(
			this.settings,
			currentFolder,
			fileNameOfNote,
			this.getResolvedNoteSubfolder(pdfFile)
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
			// something this vault will not take. `vault.create` reports the
			// second case to the reader.
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
