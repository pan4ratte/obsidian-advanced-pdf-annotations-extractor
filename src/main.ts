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

		if (settings.sortByTopic && settings.useStructuringHeadlines) {
			grandtotal.forEach((anno) => {
				const lines = anno.body.split(/\r\n|\n\r|\n|\r/); // split by:     \r\n  \n\r  \n  or  \r
				anno.topic = lines[0]; // First line of contents
				anno.body = lines.slice(1).join("\r\n");
			});
		}

		grandtotal.sort(function (a1, a2) {
			if (settings.sortByTopic) {
				// sort by topic
				if (a1.topic > a2.topic) return 1;
				if (a1.topic < a2.topic) return -1;
			}

			if (settings.useFolderNames) {
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

	async loadSinglePDFFile(pdfFile: TFile) {
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
		await this.exportAnnotations(pdfFile, grandtotal, false);
	}
	private extractTagsFromAnnotationsAndAddHeaderToNote(note: string, annotations: PDFAnnotation[]): string {
		// Use Set instead of Array to eliminate duplicates
		const extractedTagsFromAnnotations = new Set<string>();
		annotations.forEach((annotation) => {
			const tagPattern = /#([\wöäü_/-]*[A-Za-zöäü][\wöäü_/-]*)/g;
			let match: RegExpExecArray | null;
			while ((match = tagPattern.exec(annotation.body)) !== null) {
				extractedTagsFromAnnotations.add(match[1]);
			}
		});
		let obsidianHeaderWithTags = "---\ntags:\n";
		extractedTagsFromAnnotations.forEach((tag) => {
			obsidianHeaderWithTags += " - " + tag + "\n";
		});
		obsidianHeaderWithTags += "---";
		note = obsidianHeaderWithTags + "\n" + note;
		return note;
	}

	private async exportAnnotations(
		fileMeta: FileMeta,
		grandtotal: PDFAnnotation[],
		isExternalFile: boolean
	): Promise<void> {
		if (this.settings.oneNotePerAnnotation) {
			// Written one after another: concurrent writes to the same note (when
			// the export name lacks {{counter}}) would race each other.
			for (const [index, anno] of grandtotal.entries()) {
				let note = this.formatter.format([anno], isExternalFile);
				const fileNameOfExportNote =
					this.getResolvedOneNotePerAnnotationExportName(fileMeta, index + 1) + ".md";
				const filePathOfExportNote = this.getResolvedExportPath(fileMeta, fileNameOfExportNote);
				if (this.settings.extractTagsFromAnnotationsAsObsidianTags) {
					note = this.extractTagsFromAnnotationsAndAddHeaderToNote(note, [anno]);
				}
				await this.saveHighlightsToFileAndOpenIt(filePathOfExportNote, note, this.settings.overwriteExistingNote);
			}
		} else {
			let finalMarkdown = this.formatter.format(grandtotal, isExternalFile);
			const fileNameOfExportNote =
				this.getResolvedExportName(fileMeta) + ".md";
			const filePathOfExportNote = this.getResolvedExportPath(fileMeta, fileNameOfExportNote);
			if (this.settings.extractTagsFromAnnotationsAsObsidianTags) {
				finalMarkdown = this.extractTagsFromAnnotationsAndAddHeaderToNote(finalMarkdown, grandtotal);
			}
			await this.saveHighlightsToFileAndOpenIt(filePathOfExportNote, finalMarkdown, this.settings.overwriteExistingNote);
		}
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

		this.addCommand({
			id: "extract-annotations-single-from-clipboard-path",
			name: t.COMMAND_EXTRACT_CLIPBOARD_PATH,
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const clipText = await navigator.clipboard.readText();
				const result = await this.loadAnnotationsFromSinglePDFFileFromClipboardPath(clipText);
				if (result.pdfFile) {
					this.sort(result.grandtotal);
					if (this.settings.exportClipboardExtraction) {
						await this.exportAnnotations(result.pdfFile, result.grandtotal, true);
					} else {
						editor.replaceSelection(this.formatter.format(result.grandtotal, true));
					}
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
			// Every field the settings object declares, so a new setting cannot be
			// forgotten here and silently never load.
			Object.keys(this.settings).forEach((setting) => {
				if (setting in loadedSettings) {
					asIndexable(this.settings)[setting] = loadedSettings[setting];
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

			// Written back at once, so data.json stops carrying the four
			// template fields this version no longer reads.
			const migration = PDFAnnotationPluginSetting.migrateTemplates(
				loadedSettings,
				this.settings
			);
			if (migration.migrated) {
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

	get exportNameTemplate(): Template {
		return compileTemplate(this.settings.exportName, this.templateSettings);
	}

	get oneNotePerAnnotationExportNameTemplate(): Template {
		return compileTemplate(this.settings.oneNotePerAnnotationExportName, this.templateSettings);
	}

	getTemplateVariablesForExportName(
		file: FileMeta
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename
		};

		return { file: file, ...shortcuts };
	}

	getTemplateVariablesForOneNotePerAnnotationExportName(
		file: FileMeta,
		counter: number
	): Record<string, unknown> {
		const shortcuts = {
			filename: file.basename,
			counter: counter,
		};

		return { file: file, ...shortcuts };
	}

	getResolvedExportName(file: FileMeta): string {
		return this.exportNameTemplate(
			this.getTemplateVariablesForExportName(file)
		);
	}

	getResolvedOneNotePerAnnotationExportName(
		file: FileMeta,
		counter: number
	): string {
		return this.oneNotePerAnnotationExportNameTemplate(
			this.getTemplateVariablesForOneNotePerAnnotationExportName(file, counter)
		);
	}

	getResolvedExportPath(pdfFile: FileMeta, fileNameOfExportNote: string): string {
		const exportPath = this.settings.exportPath;
		let filePathOfExportNote = "";
		if (exportPath === "./") {
			if (pdfFile.path.startsWith("file://")) {
				filePathOfExportNote = fileNameOfExportNote;
			} else {
				filePathOfExportNote = pdfFile.path.replace(
					pdfFile.name,
					fileNameOfExportNote
				);
			}
		} else {
			filePathOfExportNote = exportPath + fileNameOfExportNote;
		}
		return filePathOfExportNote;
	}

	async saveHighlightsToFileAndOpenIt(filePath: string, mdString: string, overwriteExistingNote: boolean) {
		const fileExists = await this.app.vault.adapter.exists(filePath);
		if (fileExists) {
			if (overwriteExistingNote) {
				await this.app.vault.adapter.write(filePath, mdString);
			} else {
				await this.appendHighlightsToFile(filePath, mdString);
			}
			await this.app.workspace.openLinkText(filePath, "", true);
		} else {
			try {
				await this.app.vault.create(filePath, mdString);
				await this.app.workspace.openLinkText(filePath, "", true);
			} catch (error) {
				console.error(error);
				new Notice(t.NOTICE_EXPORT_PATH_INVALID);
			}
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
