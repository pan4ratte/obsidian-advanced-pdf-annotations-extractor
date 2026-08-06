import { Notice } from "obsidian";
import { t } from "lang/helpers";

/**
 * How long the finished notice stays before it takes itself away. Long enough
 * to be read by someone who looked up at the end of a long extraction, short
 * enough not to be dismissed by hand after a quick one.
 */
const DONE_VISIBLE_MS = 4000;

/** Ratio to the percentage a track is filled to. */
function percent(done: number, total: number): string {
	if (total <= 0) return "0%";
	const share = Math.min(1, Math.max(0, done / total));
	return `${Math.round(share * 100)}%`;
}

/**
 * The notice an extraction runs behind: a line saying what is being done, and a
 * bar saying how far along it is.
 *
 * One notice for the whole run rather than one per step. An extraction reads
 * the PDF and then writes the notes, and both are the same wait to whoever
 * asked for it — a notice per step would flash three times and leave nothing on
 * screen in between.
 *
 * Every step is optional to count. The reading knows how many pages it has to
 * get through and the writing how many notes, but neither can say so before it
 * starts, and the steps between them are over too quickly to measure. A step
 * with nothing to count animates instead, which says the same thing a bar
 * standing still would not: that the extraction is still going.
 */
export class ExtractionProgress {
	private readonly notice: Notice;
	private readonly labelEl: HTMLElement;
	private readonly barEl: HTMLElement;

	/** Set once the run is over, whether it finished or gave up. */
	private ended = false;

	constructor() {
		// 0 keeps it on screen: an extraction takes as long as the PDF is
		// large, and a notice that timed out halfway would be saying the run
		// had ended when it had not.
		this.notice = new Notice("", 0);

		// Obsidian lays a notice out as a column on the desktop and as a row on
		// a phone, and it is this element — `notice-message` — that is the item
		// in either. Left alone, the row leaves it as wide as its contents, and
		// the bar would sit short in a notice spanning the screen. Named here so
		// only this plugin's own notice is told to fill one.
		this.notice.messageEl.addClass("pdf-annotations-progress-message");

		const root = this.notice.messageEl.createDiv({
			cls: "pdf-annotations-progress",
		});
		this.labelEl = root.createDiv({
			cls: "pdf-annotations-progress-label",
			text: t.PROGRESS_EXTRACTING,
		});
		const track = root.createDiv({
			cls: "pdf-annotations-progress-track",
		});
		this.barEl = track.createDiv({
			cls: "pdf-annotations-progress-bar pdf-annotations-progress-waiting",
		});
	}

	/**
	 * `done` of `total` through the step `label` names. Left out, the step is
	 * one with nothing to count and the bar goes back to animating.
	 */
	private update(label: string, done?: number, total?: number): void {
		if (this.ended) return;
		this.labelEl.setText(label);

		if (done === undefined || total === undefined || total <= 0) {
			this.barEl.addClass("pdf-annotations-progress-waiting");
			return;
		}

		this.barEl.removeClass("pdf-annotations-progress-waiting");
		// The width is a custom property rather than a width of its own, so the
		// stylesheet keeps the bar's own rules and this says only how far.
		this.barEl.setCssProps({
			"--pdf-annotations-progress": percent(done, total),
		});
	}

	/**
	 * Reading `name`: `done` of `total` — the pages of one PDF, or the PDFs of
	 * one folder. Both are read the same way and waited on the same way, so
	 * both say the same thing.
	 */
	reading(name: string, done: number, total: number): void {
		this.update(`${t.PROGRESS_READING}: ${name}`, done, total);
	}

	/** Writing the notes; counted only by the extraction that writes many. */
	writing(done?: number, total?: number): void {
		this.update(t.PROGRESS_WRITING, done, total);
	}

	/** The run finished: what it came to, and the notice bows out by itself. */
	succeed(annotations: number): void {
		if (this.ended) return;
		this.ended = true;

		this.labelEl.setText(`${t.PROGRESS_EXTRACTED}: ${annotations}`);
		this.barEl.removeClass("pdf-annotations-progress-waiting");
		this.barEl.addClass("pdf-annotations-progress-done");
		this.barEl.setCssProps({ "--pdf-annotations-progress": "100%" });

		// `window` and not `activeWindow`, which is where the notice itself was
		// put: the plugin guidelines have timers on `window`, and the two share
		// a context, so a timer set here reaches a notice in a popped-out
		// window all the same.
		window.setTimeout(() => this.notice.hide(), DONE_VISIBLE_MS);
	}

	/**
	 * The run stopped short. Taken off screen and nothing said: what went wrong
	 * is the caller's to report, and a bar left standing at a third of the way
	 * would go on claiming the extraction was still running.
	 */
	stop(): void {
		if (this.ended) return;
		this.ended = true;
		this.notice.hide();
	}
}
