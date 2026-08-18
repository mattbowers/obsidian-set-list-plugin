import { describe, expect, it, vi } from "vitest";
import { StageGestureController } from "../gestures/StageGestureController";

function makeController() {
	const onSwipeLeft = vi.fn();
	const onSwipeRight = vi.fn();
	const onLongPress = vi.fn();
	const controller = new StageGestureController({
		onSwipeLeft,
		onSwipeRight,
		onLongPress,
	});
	return { controller, onSwipeLeft, onSwipeRight, onLongPress };
}

describe("StageGestureController", () => {
	it("fires onSwipeLeft for a leftward horizontal drag", () => {
		const { controller, onSwipeLeft, onSwipeRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 300, y: 200, t: 0 });
		controller.onPointerUp({ x: 200, y: 205, t: 150 });

		expect(onSwipeLeft).toHaveBeenCalledOnce();
		expect(onSwipeRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires onSwipeRight for a rightward horizontal drag", () => {
		const { controller, onSwipeLeft, onSwipeRight } = makeController();
		controller.onPointerDown({ x: 100, y: 200, t: 0 });
		controller.onPointerUp({ x: 200, y: 195, t: 150 });

		expect(onSwipeRight).toHaveBeenCalledOnce();
		expect(onSwipeLeft).not.toHaveBeenCalled();
	});

	it("fires nothing for a quick tap with negligible movement", () => {
		const { controller, onSwipeLeft, onSwipeRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 202, y: 201, t: 80 });

		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onSwipeRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires nothing for a drag that stays under the minimum swipe distance", () => {
		const { controller, onSwipeLeft, onSwipeRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 230, y: 200, t: 150 });

		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onSwipeRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires nothing for a mostly-vertical drag, even with enough horizontal distance", () => {
		const { controller, onSwipeLeft, onSwipeRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 270, y: 400, t: 150 });

		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onSwipeRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires onLongPress for a stationary long hold", () => {
		const { controller, onLongPress, onSwipeLeft, onSwipeRight } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 202, y: 199, t: 700 });

		expect(onLongPress).toHaveBeenCalledOnce();
		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onSwipeRight).not.toHaveBeenCalled();
	});

	it("fires nothing for a hold that exceeds the long-press movement threshold", () => {
		const { controller, onLongPress, onSwipeLeft, onSwipeRight } = makeController();
		controller.onPointerDown({ x: 200, y: 200, t: 0 });
		controller.onPointerUp({ x: 230, y: 200, t: 700 });

		expect(onLongPress).not.toHaveBeenCalled();
		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onSwipeRight).not.toHaveBeenCalled();
	});

	it("resets cleanly on a cancel with no position, ignoring a subsequent up with no matching down", () => {
		const { controller, onSwipeLeft, onLongPress } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerCancel();
		controller.onPointerUp({ x: 20, y: 200, t: 700 });

		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires onSwipeLeft when a leftward drag is cancelled instead of released", () => {
		// Mirrors Obsidian's own edge-swipe gesture recognizer stealing the touch near the
		// screen edge and delivering a cancel instead of an up.
		const { controller, onSwipeLeft, onSwipeRight, onLongPress } = makeController();
		controller.onPointerDown({ x: 300, y: 200, t: 0 });
		controller.onPointerMove({ x: 220, y: 202, t: 100 });
		controller.onPointerCancel({ x: 300, y: 200, t: 150 });

		expect(onSwipeLeft).toHaveBeenCalledOnce();
		expect(onSwipeRight).not.toHaveBeenCalled();
		expect(onLongPress).not.toHaveBeenCalled();
	});

	it("fires onLongPress when a stationary hold is cancelled instead of released, using the cancel's real timestamp", () => {
		const { controller, onLongPress, onSwipeLeft, onSwipeRight } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerCancel({ x: 20, y: 200, t: 700 });

		expect(onLongPress).toHaveBeenCalledOnce();
		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onSwipeRight).not.toHaveBeenCalled();
	});

	it("does not treat a cancel as a swipe when no real movement was observed first, even over a long duration", () => {
		const { controller, onSwipeLeft, onSwipeRight } = makeController();
		controller.onPointerDown({ x: 20, y: 200, t: 0 });
		controller.onPointerCancel({ x: 400, y: 200, t: 80 });

		expect(onSwipeLeft).not.toHaveBeenCalled();
		expect(onSwipeRight).not.toHaveBeenCalled();
	});
});
