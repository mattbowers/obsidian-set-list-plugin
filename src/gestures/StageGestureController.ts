export interface PointerSample {
	x: number;
	y: number;
	t: number;
}

export interface StageGestureControllerOptions {
	onSwipeLeft: () => void;
	onSwipeRight: () => void;
	onLongPress: () => void;
	/** Minimum horizontal travel, in px, to count as a swipe rather than an incidental drag. */
	swipeMinDistance?: number;
	/** Vertical travel must stay under this fraction of horizontal travel, so a scroll/diagonal drag doesn't register as a swipe. */
	swipeMaxVerticalRatio?: number;
	longPressDuration?: number;
	longPressMaxMovement?: number;
}

type ResolvedOptions = Required<StageGestureControllerOptions>;

const DEFAULTS: Omit<ResolvedOptions, "onSwipeLeft" | "onSwipeRight" | "onLongPress"> = {
	swipeMinDistance: 60,
	swipeMaxVerticalRatio: 0.6,
	longPressDuration: 600,
	longPressMaxMovement: 10,
};

/**
 * Classifies gestures on the Stage view's gesture overlay: a horizontal swipe
 * moves to the previous/next song, a stationary long press returns to the
 * Edit view. Vertical scrolling is left to the browser (CSS `touch-action:
 * pan-y`) and never reaches this controller.
 */
export class StageGestureController {
	private readonly options: ResolvedOptions;
	private start: PointerSample | null = null;
	/** Most recent onPointerMove sample — the trustworthy fallback for a cancel's own
	 *  position, which (per Obsidian's own edge-swipe recognizer) is often stale/start-like
	 *  regardless of how far the finger actually travelled. */
	private last: PointerSample | null = null;
	/** Largest distance from `start` seen via onPointerMove, used to tell a real drag apart from a cancel that reports stale (start-like) coordinates. */
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

	/** Exposed so callers can size live swipe-progress feedback against the same threshold. */
	get swipeMinDistance(): number {
		return this.options.swipeMinDistance;
	}

	/** Exposed so callers can cancel live swipe-progress feedback once it rules out a swipe. */
	get swipeMaxVerticalRatio(): number {
		return this.options.swipeMaxVerticalRatio;
	}

	onPointerDown(sample: PointerSample): void {
		this.start = sample;
		this.last = sample;
		this.maxMovement = 0;
	}

	/** Passive tracking only — never suppresses the browser's native scroll handling. */
	onPointerMove(sample: PointerSample): void {
		if (!this.start) return;
		this.last = sample;
		const distance = Math.hypot(sample.x - this.start.x, sample.y - this.start.y);
		if (distance > this.maxMovement) this.maxMovement = distance;
	}

	onPointerUp(sample: PointerSample): void {
		if (!this.start) return;
		this.classify(sample);
		this.reset();
	}

	/**
	 * A cancel usually means Obsidian's own edge-swipe gesture recognizer stole the touch
	 * (it still happens even though `sidebarSwipeGuard` stops the sidebar from actually
	 * opening). Its own coordinates are often stale/start-like regardless of how far the
	 * finger actually travelled, so position comes from the last real onPointerMove sample
	 * instead — but its timestamp is still real, so a stationary long press that gets stolen
	 * partway through is still classified correctly.
	 */
	onPointerCancel(sample?: PointerSample): void {
		if (this.start) {
			const position = this.last ?? this.start;
			const t = sample?.t ?? this.last?.t ?? this.start.t;
			this.classify({ x: position.x, y: position.y, t });
		}
		this.reset();
	}

	private classify(end: PointerSample): void {
		if (!this.start) return;

		const dt = end.t - this.start.t;
		const dx = end.x - this.start.x;
		const dy = end.y - this.start.y;
		const distance = Math.max(Math.hypot(dx, dy), this.maxMovement);

		if (distance <= this.options.longPressMaxMovement && dt >= this.options.longPressDuration) {
			this.options.onLongPress();
			return;
		}

		const horizontal = Math.abs(dx);
		const vertical = Math.abs(dy);
		if (horizontal >= this.options.swipeMinDistance && vertical <= horizontal * this.options.swipeMaxVerticalRatio) {
			if (dx < 0) {
				this.options.onSwipeLeft();
			} else {
				this.options.onSwipeRight();
			}
		}
	}

	private reset(): void {
		this.start = null;
		this.last = null;
		this.maxMovement = 0;
	}
}
