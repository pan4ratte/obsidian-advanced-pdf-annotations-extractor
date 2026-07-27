/**
 * Shows and hides a panel over 180ms of height and opacity. Returns the
 * function that puts it one way or the other; pass `animate: false` when the
 * panel is first drawn and has nothing to animate from.
 *
 * Hidden is `display: none` rather than zero height, so a closed panel leaves
 * no gap and nothing for a tab key to land in.
 *
 * The panel must set no `display` of its own — `pdf-annotations-collapsed` is a
 * plain class and would lose to it. Put the layout on a child instead.
 */
export function createCollapsible(
	panel: HTMLElement
): (shown: boolean, animate: boolean) => void {
	let animation: Animation | null = null;

	return (shown: boolean, animate: boolean) => {
		const reduceMotion = window.matchMedia(
			"(prefers-reduced-motion: reduce)"
		).matches;

		if (!animate || reduceMotion) {
			animation?.cancel();
			animation = null;
			panel.toggleClass("pdf-annotations-collapsed", !shown);
			return;
		}

		// Already there and standing still. Animating anyway would show the
		// panel to measure it and hide it again — a flash of a panel that was
		// never meant to open, on every call that reports no change.
		const collapsed = panel.hasClass("pdf-annotations-collapsed");
		if (animation === null && collapsed === !shown) return;

		// Measured while it is still the height on screen, not the natural one.
		const interrupted = animation !== null;
		const onScreen = interrupted ? panel.getBoundingClientRect().height : 0;
		animation?.cancel();

		// Shown before measuring: `display: none` has no height.
		panel.removeClass("pdf-annotations-collapsed");
		const full = panel.scrollHeight;
		const from = interrupted ? onScreen : shown ? 0 : full;
		const to = shown ? full : 0;

		animation = panel.animate(
			{
				height: [`${from}px`, `${to}px`],
				opacity: shown ? [0, 1] : [1, 0],
			},
			{ duration: 180, easing: "ease-in-out" }
		);
		animation.onfinish = () => {
			animation = null;
			if (!shown) panel.addClass("pdf-annotations-collapsed");
		};
	};
}
