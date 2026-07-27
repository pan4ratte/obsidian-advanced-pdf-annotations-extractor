/**
 * A panel that shows and hides with the motion the settings tab's accordion
 * opens with: height and opacity over the same 180ms. Returns the function that
 * puts it one way or the other, which takes `animate` — the first showing, when
 * the panel is drawn, has nothing to animate from.
 *
 * Hidden is `display: none` once the animation has finished rather than a height
 * of zero, so a hidden panel leaves nothing behind: no gap between what it sits
 * among, and nothing for a tab key to land in. Reversing mid-animation picks up
 * from the height on screen, and anyone who has asked for less motion is simply
 * shown the panel or not.
 *
 * The panel itself must set no `display` of its own: `pdf-annotations-collapsed`
 * is a single class like any other, so a `display` on the panel would be read
 * after it and win. Put the layout on an element inside the panel instead.
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

		// Already where it is being asked to go, and standing still. Animating
		// anyway would show the panel to measure it and hide it again, which is
		// a flash of a panel that was never meant to open — and the callers that
		// say how things stand after every change say it far more often than
		// they say anything has changed.
		const collapsed = panel.hasClass("pdf-annotations-collapsed");
		if (animation === null && collapsed === !shown) return;

		// Measured before cancelling, while it is still the height on screen
		// rather than the natural one.
		const interrupted = animation !== null;
		const onScreen = interrupted ? panel.getBoundingClientRect().height : 0;
		animation?.cancel();

		// Shown before it is measured: `display: none` has no height. The
		// animation writes no style of its own, so what is measured is the
		// natural height either way.
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
