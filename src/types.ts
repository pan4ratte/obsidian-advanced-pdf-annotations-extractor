import { TFile } from "obsidian";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

export interface FileMeta {
	name: string;
	basename: string;
	path: string;
}

export class PDFFile implements FileMeta {
	extension: string;
	path: string;
	content: ArrayBuffer;
	name: string;

	constructor(
		name: string,
		binaryContent: ArrayBuffer,
		extension: string,
		path: string
	) {
		this.name = name;
		this.content = binaryContent;
		this.extension = extension;
		this.path = path;
	}

	get basename(): string {
		return this.name ? this.name.replace(/\.[^/.]+$/, "") : "";
	}

	public static convertTFileToPDFFile(
		tFile: TFile,
		binaryContent: ArrayBuffer
	): PDFFile {
		return new PDFFile(
			tFile.name,
			binaryContent,
			tFile.extension,
			tFile.path
		);
	}
}

/** One PDF, read: everything writing the notes needs. */
export interface LoadedAnnotations {
	fileMeta: FileMeta;
	annotations: PDFAnnotation[];
	isExternalFile: boolean;
}

/** Index access for the settings object, which is keyed by setting name. */
export interface IIndexable {
	[key: string]: unknown;
}

/**
 * View an object as indexable by name. Reads come back as `unknown`
 * deliberately, so the caller has to say what it expects.
 */
export function asIndexable(value: object): IIndexable {
	return value as unknown as IIndexable;
}

/**
 * The slice of pdf.js this plugin uses. Obsidian's `loadPdfJs()` is typed as
 * `any` — cast to this at that boundary rather than spreading `any` onwards.
 */
export interface PDFJsLib {
	getDocument(source: ArrayBuffer): { promise: Promise<PDFDocumentProxy> };
}

/** A pdf.js string, which pairs the text with its writing direction. */
export interface PDFString {
	str: string;
	dir?: string;
}

/**
 * What this plugin reads off a pdf.js annotation. pdf.js hands them over as
 * plain data with no type of its own, so only the fields used are modelled.
 */
export interface RawPDFAnnotation {
	subtype: string;
	/** [x1, y1, x2, y2] in PDF user space. */
	rect: number[];
	/** The comment on the annotation. */
	contentsObj: PDFString;
	/** The annotation's author. */
	titleObj: PDFString;
	/**
	 * Corners of the marked up text, four points per line. Text markup subtypes
	 * only, and null when pdf.js finds them unusable.
	 */
	quadPoints?: ArrayLike<number> | null;
	/** `D:YYYYMMDDHHmmSS` and an optional zone; null when the PDF omits it. */
	creationDate?: string | null;
}

/** A pdf.js annotation once the extraction has filled in the note's fields. */
export interface PDFAnnotation extends RawPDFAnnotation {
	/** The PDF text underneath the annotation; markup subtypes only. */
	highlightedText?: string;
	/** Folder containing the PDF, used for grouping. */
	folder: string;
	file: FileMeta;
	/** `file.path`, so templates can use it directly. */
	filepath: string;
	pageNumber: number;
	/** Page number as labelled by the document's author. */
	pageLabel: string;
	author: string;
	body: string;
	/** First line of the body, read once the annotations are gathered. */
	topic?: string;
	/** The day `creationDate` names, as `YYYY-MM-DD`. */
	created?: string;
}
