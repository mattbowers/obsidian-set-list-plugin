import { describe, expect, it, vi } from "vitest";
import { StageGestureController } from "../gestures/StageGestureController";

function makeController(containerWidth = 400) {
	const onTapLeft = vi.fn();
	const onTapRight = vi.fn();
	const onLongPress = vi.fn();
	const controller = new StageGestureController({
		onTapLeft,
		onTapRight,
		onLongPress,
		getContainerWidth: () => containerWidth,
	});
	return { controller, onTapLeft, onTapRight, onLongPress };
}

describe("StageGestureController", () => {
	it("fires onTapLeft for a quick tap near the left edge", () => {
		const { controller, onTapLeft, onTapRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerUp({ x: 22, y: 201, t: 80 });

		expect(onTapLeft).toHaveBeenCalledOnce();
		expect(onTapRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires onTapRight for a quick tap near the right edge", () => {
		const { controller, onTapLeft, onTapRight } = makeController();
		controller.onPointerDown({ x: 385, y: 200, t: 0 });
		controller.onPointerUp({ x: 383, y: 199, t: 80 });

		expect(onTapRight).toHaveBeenCalledOnce();
		expect(onTapLeft).not.toHaveBeenCalled();
	});

	it("fires nothing for a quick tap in the middle", () => {
		const { controller, onTapLeft, onTapRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 200, y: 200, t: 80 });

		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onTapRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires nothing for a tap that exceeds the tap duration window without qualifying as a long press", () => {
		const { controller, onTapLeft, onTapRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerUp({ x: 20, y: 200, t: 450 });

		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onTapRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires nothing for a drag near the edge, even if it ends there quickly", () => {
		const { controller, onTapLeft, onTapRight } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 20, y: 200, t: 80 });

		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onTapRight).not.toHaveBeenCalled();
	});

	it("fires onLongPress for a stationary long hold in the middle", () => {
		const { controller, onLongPress, onTapLeft, onTapRight } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 202, y: 199, t: 700 });

		expect(onLongPress).toHaveBeenCalledOnce();
		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onTapRight).not.toHaveBeenCalled();
	});

	it("fires onLongPress for a stationary long hold near an edge, not a tap", () => {
		const { controller, onLongPress, onTapLeft, onTapRight } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerUp({ x: 20, y: 200, t: 700 });

		expect(onLongPress).toHaveBeenCalledOnce();
		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onTapRight).not.toHaveBeenCalled();
	});

	it("resets cleanly on a cancel with no position, ignoring a subsequent up with no matching down", () => {
		const { controller, onTapLeft, onLongPress } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerCancel();
		controller.onPointerUp({ x: 20, y: 200, t: 700 });

		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires onTapLeft when a quick, near-edge touch is cancelled instead of released", () => {
		// Mirrors Obsidian's own edge-swipe gesture recognizer stealing the touch
		// near the screen edge and delivering a cancel instead of an up.
		const { controller, onTapLeft, onTapRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerCancel({ x: 20, y: 200, t: 80 });

		expect(onTapLeft).toHaveBeenCalledOnce();
		expect(onTapRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("does not treat a cancel as a tap once it exceeds the tap duration window", () => {
		const { controller, onTapLeft, onLongPress } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerCancel({ x: 20, y: 200, t: 700 });

		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("does not treat a cancel as a tap when real movement was observed first, even if the cancel itself reports start-like coordinates", () => {
		// Regression: a vertical scroll starting inside the edge zone gets handed off to
		// native scrolling via a pointercancel, and that cancel's own coordinates are often
		// stale (close to the down position) regardless of how far the finger actually moved.
		// Without tracking real onPointerMove distance, this was misclassified as an edge tap
		// and every scroll inside the edge zone incorrectly changed songs.
		const { controller, onTapLeft, onTapRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerMove({ x: 22, y: 260, t: 40 });
		controller.onPointerCancel({ x: 20, y: 200, t: 60 });

		expect(onTapLeft).not.toHaveBeenCalled();
		expect(onTapRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("uses the container width at tap time to size edge zones", () => {
		const onTapLeft = vi.fn();
		const onTapRight = vi.fn();
		const onLongPress = vi.fn();
		let width = 400;
		const controller = new StageGestureController({
			onTapLeft,
			onTapRight,
			onLongPress,
			getContainerWidth: () => width,
		});

		// x=100 is inside the left 25% zone (< 125) once the container widens to 500.
		width = 500;
		controller.onPointerDown({ x: 100, y: 200, t: 0 });
		controller.onPointerUp({ x: 100, y: 200, t: 80 });

		expect(onTapLeft).toHaveBeenCalledOnce();
	});
});
