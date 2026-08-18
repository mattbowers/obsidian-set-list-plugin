export interface PointerSample {
	x: number;
	y: number;
	t: number;
}

export interface StageGestureControllerOptions {
	onTapLeft: () => void;
	onTapRight: () => void;
	onLongPress: () => void;
	/** Width of the tappable area, used to size the left/right edge zones. */
	getContainerWidth: () => number;
	/** Fraction of the container width, on each side, counted as an edge zone. */
	edgeZoneRatio?: number;
	tapMaxDuration?: number;
	tapMaxMovement?: number;
	longPressDuration?: number;
	longPressMaxMovement?: number;
}

type ResolvedOptions = Required<StageGestureControllerOptions>;

const DEFAULTS: Omit<ResolvedOptions, "onTapLeft" | "onTapRight" | "onLongPress" | "getContainerWidth"> = {
	edgeZoneRatio: 0.25,
	tapMaxDuration: 300,
	tapMaxMovement: 10,
	longPressDuration: 600,
	longPressMaxMovement: 10,
};

/**
 * Classifies taps on the Stage view's gesture overlay: a quick tap near the
 * left/right edge moves to the previous/next song, a stationary long press
 * returns to the Edit view. Vertical scrolling is left to the browser
 * (CSS `touch-action: pan-y`) and never reaches this controller.
 */
export class StageGestureController {
	private readonly options: ResolvedOptions;
	private start: PointerSample | null = null;
	/** Largest distance from `start` seen via onPointerMove, used to tell a real drag/scroll apart from a cancel that reports stale (start-like) coordinates. */
	private maxMovement = 0;

	constructor(options: StageGestureControllerOptions) {
		this.options = { ...DEFAULTS, ...options };
	}

	/** Exposed so callers can time visual long-press feedback to match this exactly. */
	get longPressDuration(): number {
		return this.options.longPressDuration;
	}

	/** Exposed so callers can cancel visual long-press feedback once movement rules it out. */
	get longPressMaxMovement(): number {
		return this.options.longPressMaxMovement;
	}

	onPointerDown(sample: PointerSample): void {
		this.start = sample;
		this.maxMovement = 0;
	}

	/** Passive tracking only — never suppresses the browser's native scroll handling. */
	onPointerMove(sample: PointerSample): void {
		if (!this.start) return;
		const distance = Math.hypot(sample.x - this.start.x, sample.y - this.start.y);
		if (distance > this.maxMovement) this.maxMovement = distance;
	}

	onPointerUp(sample: PointerSample): void {
		if (!this.start) return;

		const dt = sample.t - this.start.t;
		const distance = Math.max(Math.hypot(sample.x - this.start.x, sample.y - this.start.y), this.maxMovement);
		const startX = this.start.x;

		if (distance <= this.options.tapMaxMovement && dt <= this.options.tapMaxDuration) {
			this.handleTap(startX);
		} else if (distance <= this.options.longPressMaxMovement && dt >= this.options.longPressDuration) {
			this.options.onLongPress();
		}

		this.reset();
	}

	/**
	 * A cancel fired quickly, with no real movement observed via onPointerMove,
	 * usually means Obsidian's own edge-swipe gesture recognizer stole the
	 * touch near the screen edge (it still happens even though
	 * `sidebarSwipeGuard` stops the sidebar from actually opening) — treat
	 * that as a completed tap rather than silently dropping it. A cancel that
	 * followed real movement (e.g. the start of a vertical scroll, which the
	 * browser can also resolve via a cancel) must NOT be treated as a tap,
	 * since the cancel event's own coordinates are often stale/start-like
	 * regardless of how far the finger actually travelled — that's why this
	 * relies on `maxMovement` instead of the cancel sample's own distance.
	 */
	onPointerCancel(sample?: PointerSample): void {
		if (this.start && sample && this.maxMovement <= this.options.tapMaxMovement) {
			const dt = sample.t - this.start.t;
			if (dt <= this.options.tapMaxDuration) {
				this.handleTap(this.start.x);
			}
		}

		this.reset();
	}

	private handleTap(x: number): void {
		const width = this.options.getContainerWidth();
		const edgeZoneWidth = width * this.options.edgeZoneRatio;

		if (x < edgeZoneWidth) {
			this.options.onTapLeft();
		} else if (x > width - edgeZoneWidth) {
			this.options.onTapRight();
		}
	}

	private reset(): void {
		this.start = null;
		this.maxMovement = 0;
	}
}
