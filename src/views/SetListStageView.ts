import { Component, setIcon, TFile, ViewStateResult } from "obsidian";
import { BaseSetListView } from "./BaseSetListView";
import { renderSong } from "../render/renderSong";
import { findFirstSongIndex, findNextSongIndex, findPrevSongIndex } from "../setlist/navigation";
import { StageGestureController, type PointerSample } from "../gestures/StageGestureController";
import { renderBuildBadge } from "../ui/buildBadge";
import { SET_LIST_EDIT_VIEW_TYPE, SET_LIST_STAGE_VIEW_TYPE } from "./viewTypes";
import type { SongEntry } from "../setlist/types";

export { SET_LIST_STAGE_VIEW_TYPE };

function pointerSample(evt: PointerEvent): PointerSample {
	return { x: evt.clientX, y: evt.clientY, t: evt.timeStamp };
}

// How many px of the swipe indicator circle's bottom is left poking out below the touch point
// (i.e. still under the finger) rather than being shifted fully clear of it — a fixed amount
// regardless of the circle's current size, so the label near its center stays legible without
// the whole circle disappearing off above the fingertip.
const SWIPE_INDICATOR_FINGER_OVERLAP = 24;

export class SetListStageView extends BaseSetListView {
	private currentIndex = 0;
	// Set when Edit view's "Direct open song" jumps here for a song that isn't (necessarily) on
	// the set list; overrides what's shown at currentIndex without touching `parsed`/the
	// underlying note, and is cleared by the next navigation so swiping away from it resumes the
	// real set list where it left off.
	private adHocFile: TFile | null = null;
	private stageContent: HTMLElement | null = null;
	private songArea: HTMLElement | null = null;
	// Owns the currently-rendered song's Obsidian-side state (markdown post-processors, the open
	// pdf.js document) — a fresh Component per render(), added as a child of this view so it's
	// unloaded automatically if the whole view closes, and explicitly unloaded (via removeChild)
	// right before the next one is created so navigating away always tears down what the previous
	// song's render registered instead of accumulating it for the life of the view.
	private songComponent: Component | null = null;
	// The last file whose title was sent as a MIDI SysEx message, so re-rendering the same song
	// (e.g. a metadata-cache refresh of the set list note itself) doesn't resend it.
	private lastSentSongPath: string | null = null;
	private overlay: HTMLElement | null = null;
	private longPressIndicator: HTMLElement | null = null;
	private swipeIndicator: HTMLElement | null = null;
	private swipeIndicatorDirection: "left" | "right" | null = null;
	// Shared by both indicators: the raw pointerdown position, kept for the whole gesture
	// (unlike the long-press indicator's own visibility, which drops out early once
	// movement rules out a long press — the swipe indicator still needs this origin).
	private gestureStart: { x: number; y: number } | null = null;
	private readonly gestureController = new StageGestureController({
		// Swiping left drags the next song into view, like turning a page forward.
		onSwipeLeft: () => this.goToNext(),
		onSwipeRight: () => this.goToPrev(),
		onLongPress: () => this.exitToEditView(),
	});

	getViewType(): string {
		return SET_LIST_STAGE_VIEW_TYPE;
	}

	getIcon(): string {
		return "presentation";
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		if (state && typeof state === "object") {
			if ("index" in state && typeof state.index === "number") {
				this.currentIndex = state.index;
			}
			if ("adHocPath" in state && typeof state.adHocPath === "string") {
				const file = this.app.vault.getAbstractFileByPath(state.adHocPath);
				this.adHocFile = file instanceof TFile ? file : null;
			} else {
				this.adHocFile = null;
			}
		}
		await super.setState(state, result);
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), index: this.currentIndex, adHocPath: this.adHocFile?.path ?? null };
	}

	async onOpen(): Promise<void> {
		await super.onOpen();
		this.registerDomEvent(document, "keydown", (evt) => this.handleKeydown(evt));
	}

	private handleKeydown(evt: KeyboardEvent): void {
		if (evt.key === "ArrowRight") {
			evt.preventDefault();
			this.goToNext();
		} else if (evt.key === "ArrowLeft") {
			evt.preventDefault();
			this.goToPrev();
		} else if (evt.key === "Escape") {
			evt.preventDefault();
			this.exitToEditView();
		}
	}

	// Public: also invoked directly by main.ts's "Next/Previous song" commands.
	goToNext(): void {
		if (this.adHocFile) {
			// The ad hoc song stands in for whatever's at currentIndex, as if inserted right
			// before it — moving forward reveals that song, so currentIndex itself doesn't move.
			this.adHocFile = null;
			this.render();
			return;
		}

		const next = findNextSongIndex(this.parsed, this.currentIndex);
		if (next !== null) {
			this.currentIndex = next;
			this.render();
		}
	}

	goToPrev(): void {
		// Mirrors goToNext's framing: with the ad hoc song standing in front of currentIndex,
		// "previous" means whatever came before currentIndex in the real set list.
		const prev = findPrevSongIndex(this.parsed, this.currentIndex);
		if (prev !== null) {
			this.adHocFile = null;
			this.currentIndex = prev;
			this.render();
		}
	}

	/** Pages a rendered PDF song forward/back by one spread — driven by main.ts's MidiInputController
	 *  on a Control Change page-turn message. A no-op when the current song isn't a PDF (or its
	 *  spreads haven't rendered yet): there's simply nothing matching `.set-list-pdf-spread` to page
	 *  between, so this doesn't need its own file-type check. */
	pageBySpread(direction: "up" | "down"): void {
		const spreads = Array.from(this.contentEl.querySelectorAll<HTMLElement>(".set-list-pdf-spread"));
		if (spreads.length === 0) return;

		// Each spread's top offset in contentEl's own scrollable content coordinate space —
		// via getBoundingClientRect rather than offsetTop, since offsetTop is relative to the
		// nearest positioned ancestor (.set-list-stage-content), not necessarily contentEl itself.
		const containerTop = this.contentEl.getBoundingClientRect().top;
		const scrollTop = this.contentEl.scrollTop;
		const spreadTops = spreads.map((el) => el.getBoundingClientRect().top - containerTop + scrollTop);

		let currentIndex = 0;
		for (let i = 0; i < spreadTops.length; i++) {
			if (spreadTops[i] <= scrollTop + 1) currentIndex = i;
		}

		const targetIndex =
			direction === "down" ? Math.min(currentIndex + 1, spreads.length - 1) : Math.max(currentIndex - 1, 0);
		this.contentEl.scrollTo({ top: spreadTops[targetIndex] });
	}

	private exitToEditView(): void {
		if (!this.file) return;
		void this.leaf.setViewState({
			type: SET_LIST_EDIT_VIEW_TYPE,
			state: { file: this.file.path },
		});
	}

	private initScaffold(): void {
		const root = this.contentEl;
		root.empty();
		root.addClass("set-list-stage-view");

		const stageContent = root.createDiv({ cls: "set-list-stage-content" });
		this.songArea = stageContent.createDiv({ cls: "set-list-song-area" });

		const overlay = stageContent.createDiv({ cls: "set-list-gesture-overlay" });
		this.longPressIndicator = overlay.createDiv({ cls: "set-list-longpress-indicator" });
		// "list-ordered" mirrors SetListEditView.getIcon() — this is where a long press takes you.
		setIcon(this.longPressIndicator, "list-ordered");
		this.swipeIndicator = overlay.createDiv({ cls: "set-list-swipe-indicator" });

		this.registerDomEvent(overlay, "pointerdown", (evt) => {
			evt.stopPropagation();
			this.gestureStart = { x: evt.clientX, y: evt.clientY };
			this.showLongPressIndicator(evt);
			this.gestureController.onPointerDown(pointerSample(evt));
		});
		this.registerDomEvent(overlay, "pointermove", (evt) => {
			this.updateLongPressIndicator(evt);
			this.updateSwipeIndicator(evt);
			this.gestureController.onPointerMove(pointerSample(evt));
		});
		this.registerDomEvent(overlay, "pointerup", (evt) => {
			evt.stopPropagation();
			this.resetGestureIndicators();
			this.gestureController.onPointerUp(pointerSample(evt));
		});
		this.registerDomEvent(overlay, "pointercancel", (evt) => {
			evt.stopPropagation();
			this.resetGestureIndicators();
			this.gestureController.onPointerCancel(pointerSample(evt));
		});

		renderBuildBadge(stageContent, this.plugin);

		this.stageContent = stageContent;
		this.overlay = overlay;
	}

	/** Fills in over `longPressDuration`, mirroring StageGestureController's own timing, so the
	 *  user gets feedback that a long press is being registered before it actually fires. */
	private showLongPressIndicator(evt: PointerEvent): void {
		if (!this.longPressIndicator || !this.overlay) return;
		const rect = this.overlay.getBoundingClientRect();
		this.longPressIndicator.style.left = `${evt.clientX - rect.left}px`;
		this.longPressIndicator.style.top = `${evt.clientY - rect.top}px`;
		this.longPressIndicator.style.transitionDuration = `${this.gestureController.longPressDuration}ms`;
		this.longPressIndicator.addClass("is-active");
	}

	/** Movement beyond the controller's own long-press threshold means this can no longer
	 *  classify as a long press (it's most likely becoming a scroll) — hide the indicator
	 *  rather than let it keep filling toward a press that won't fire. */
	private updateLongPressIndicator(evt: PointerEvent): void {
		if (!this.gestureStart || !this.longPressIndicator) return;
		const distance = Math.hypot(evt.clientX - this.gestureStart.x, evt.clientY - this.gestureStart.y);
		if (distance > this.gestureController.longPressMaxMovement) {
			this.longPressIndicator.removeClass("is-active");
		}
	}

	/** Grows and fades in as the drag approaches StageGestureController's own swipe distance
	 *  threshold — arriving at full brightness right as release would actually trigger the
	 *  swipe, so there's no doubt the gesture registered before letting go. Uses the same
	 *  distance/vertical-ratio rules as the controller's own classification so it never
	 *  promises a swipe that won't fire. */
	private updateSwipeIndicator(evt: PointerEvent): void {
		if (!this.gestureStart || !this.swipeIndicator || !this.overlay) return;

		const dx = evt.clientX - this.gestureStart.x;
		const dy = evt.clientY - this.gestureStart.y;
		const horizontal = Math.abs(dx);
		const vertical = Math.abs(dy);
		const isMostlyHorizontal = vertical <= horizontal * this.gestureController.swipeMaxVerticalRatio;

		if (horizontal <= this.gestureController.longPressMaxMovement || !isMostlyHorizontal) {
			this.swipeIndicator.removeClass("is-active");
			this.swipeIndicator.removeClass("is-armed");
			return;
		}

		const direction = dx < 0 ? "left" : "right";
		if (this.swipeIndicatorDirection !== direction) {
			this.renderSwipeIndicatorContent(direction);
			this.swipeIndicatorDirection = direction;
		}

		const progress = Math.min(horizontal / this.gestureController.swipeMinDistance, 1);
		const rect = this.overlay.getBoundingClientRect();
		// Anchored above the touch point rather than centered on it, so the finger doesn't sit
		// right over the title once the circle grows large enough to show one — but only shifted
		// up by the circle's own current radius minus a fixed overlap, so part of the circle
		// (just not its labeled center) still pokes out under the fingertip. Mirrors the CSS
		// ring's own real width/height growth formula (see .set-list-swipe-indicator: width is
		// 10px + progress * 350px, so radius is half that) so the offset grows in step with the
		// circle instead of drifting off it.
		const circleRadius = 5 + progress * 175;
		const verticalOffset = Math.max(circleRadius - SWIPE_INDICATOR_FINGER_OVERLAP, 0);
		this.swipeIndicator.style.left = `${evt.clientX - rect.left}px`;
		this.swipeIndicator.style.top = `${evt.clientY - rect.top - verticalOffset}px`;
		this.swipeIndicator.style.setProperty("--set-list-swipe-progress", String(progress));
		this.swipeIndicator.toggleClass("is-armed", progress >= 1);
		this.swipeIndicator.addClass("is-active");
	}

	/** Both directions name the song a completed swipe would reveal, right inside the growing
	 *  circle, so the title is legible before the swipe even completes — falls back to a stop
	 *  sign if there's nothing to name in that direction (e.g. already on the first/last song),
	 *  since the swipe wouldn't go anywhere. */
	private renderSwipeIndicatorContent(direction: "left" | "right"): void {
		if (!this.swipeIndicator) return;
		this.swipeIndicator.empty();
		this.swipeIndicator.removeClass("is-title");

		const title = direction === "left" ? this.getNextSongTitle() : this.getPrevSongTitle();
		if (title) {
			this.swipeIndicator.addClass("is-title");
			this.swipeIndicator.createSpan({ cls: "set-list-swipe-indicator-label", text: title });
			return;
		}
		// Nothing to swipe to (already on the last/first song) — a stop sign reads more clearly
		// as "this gesture won't do anything" than a chevron implying a direction that goes nowhere.
		setIcon(this.swipeIndicator, "octagon-x");
	}

	/** Mirrors goToNext()'s own logic for which song a swipe-left would reveal, without actually
	 *  navigating there. */
	private getNextSongTitle(): string | null {
		const entry = this.adHocFile
			? this.parsed.entries[this.currentIndex]
			: (() => {
					const next = findNextSongIndex(this.parsed, this.currentIndex);
					return next !== null ? this.parsed.entries[next] : null;
				})();
		if (!entry || entry.type !== "song") return null;
		return entry.file?.basename ?? entry.displayText;
	}

	/** Mirrors goToPrev()'s own logic for which song a swipe-right would reveal, without actually
	 *  navigating there. Unlike goToNext, goToPrev ignores any ad hoc file, so this does too. */
	private getPrevSongTitle(): string | null {
		const prev = findPrevSongIndex(this.parsed, this.currentIndex);
		const entry = prev !== null ? this.parsed.entries[prev] : null;
		if (!entry || entry.type !== "song") return null;
		return entry.file?.basename ?? entry.displayText;
	}

	private resetGestureIndicators(): void {
		this.gestureStart = null;
		this.longPressIndicator?.removeClass("is-active");
		this.swipeIndicator?.removeClass("is-active");
		this.swipeIndicator?.removeClass("is-armed");
		this.swipeIndicatorDirection = null;
	}

	protected render(): void {
		if (!this.stageContent || !this.songArea) {
			this.initScaffold();
		}
		const songArea = this.songArea as HTMLElement;
		songArea.empty();

		let file: TFile | null;
		if (this.adHocFile) {
			file = this.adHocFile;
		} else {
			const entry = this.parsed.entries[this.currentIndex];
			const songEntry = entry?.type === "song" ? entry : this.fallbackToFirstSong();
			if (!songEntry) {
				songArea.createDiv({ cls: "set-list-song-missing", text: "No songs in this set list" });
				return;
			}

			if (this.file) {
				this.plugin.lastStageIndexByFile.set(this.file.path, this.currentIndex);
			}
			file = songEntry.file;
		}

		if (file && file.path !== this.lastSentSongPath) {
			this.lastSentSongPath = file.path;
			void this.plugin.midi.sendSongTitle(file.basename);
		}

		if (this.songComponent) {
			this.removeChild(this.songComponent);
		}
		const songComponent = new Component();
		this.addChild(songComponent);
		this.songComponent = songComponent;

		const readingView = songArea.createDiv({ cls: "set-list-song-container markdown-reading-view" });
		const previewView = readingView.createDiv({ cls: "markdown-preview-view" });
		void renderSong(this.app, songComponent, previewView, file);
	}

	private fallbackToFirstSong(): SongEntry | null {
		const first = findFirstSongIndex(this.parsed);
		if (first === null) return null;

		this.currentIndex = first;
		return this.parsed.entries[first] as SongEntry;
	}
}
