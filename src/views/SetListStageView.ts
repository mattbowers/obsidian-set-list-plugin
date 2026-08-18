import { setIcon, ViewStateResult } from "obsidian";
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

export class SetListStageView extends BaseSetListView {
	private currentIndex = 0;
	private stageContent: HTMLElement | null = null;
	private songArea: HTMLElement | null = null;
	private overlay: HTMLElement | null = null;
	private longPressIndicator: HTMLElement | null = null;
	private pressStart: { x: number; y: number } | null = null;
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
		if (state && typeof state === "object" && "index" in state && typeof state.index === "number") {
			this.currentIndex = state.index;
		}
		await super.setState(state, result);
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), index: this.currentIndex };
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
		}
	}

	private goToNext(): void {
		const next = findNextSongIndex(this.parsed, this.currentIndex);
		if (next !== null) {
			this.currentIndex = next;
			this.render();
		}
	}

	private goToPrev(): void {
		const prev = findPrevSongIndex(this.parsed, this.currentIndex);
		if (prev !== null) {
			this.currentIndex = prev;
			this.render();
		}
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

		this.registerDomEvent(overlay, "pointerdown", (evt) => {
			evt.stopPropagation();
			this.showLongPressIndicator(evt);
			this.gestureController.onPointerDown(pointerSample(evt));
		});
		this.registerDomEvent(overlay, "pointermove", (evt) => {
			this.updateLongPressIndicator(evt);
			this.gestureController.onPointerMove(pointerSample(evt));
		});
		this.registerDomEvent(overlay, "pointerup", (evt) => {
			evt.stopPropagation();
			this.hideLongPressIndicator();
			this.gestureController.onPointerUp(pointerSample(evt));
		});
		this.registerDomEvent(overlay, "pointercancel", (evt) => {
			evt.stopPropagation();
			this.hideLongPressIndicator();
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
		this.pressStart = { x: evt.clientX, y: evt.clientY };
		this.longPressIndicator.style.left = `${evt.clientX - rect.left}px`;
		this.longPressIndicator.style.top = `${evt.clientY - rect.top}px`;
		this.longPressIndicator.style.transitionDuration = `${this.gestureController.longPressDuration}ms`;
		this.longPressIndicator.addClass("is-active");
	}

	/** Movement beyond the controller's own long-press threshold means this can no longer
	 *  classify as a long press (it's most likely becoming a scroll) — hide the indicator
	 *  rather than let it keep filling toward a press that won't fire. */
	private updateLongPressIndicator(evt: PointerEvent): void {
		if (!this.pressStart) return;
		const distance = Math.hypot(evt.clientX - this.pressStart.x, evt.clientY - this.pressStart.y);
		if (distance > this.gestureController.longPressMaxMovement) {
			this.hideLongPressIndicator();
		}
	}

	private hideLongPressIndicator(): void {
		this.pressStart = null;
		this.longPressIndicator?.removeClass("is-active");
	}

	protected render(): void {
		if (!this.stageContent || !this.songArea) {
			this.initScaffold();
		}
		const songArea = this.songArea as HTMLElement;
		songArea.empty();

		const entry = this.parsed.entries[this.currentIndex];
		const songEntry = entry?.type === "song" ? entry : this.fallbackToFirstSong();
		if (!songEntry) {
			songArea.createDiv({ cls: "set-list-song-missing", text: "No songs in this set list" });
			return;
		}

		if (this.file) {
			this.plugin.lastStageIndexByFile.set(this.file.path, this.currentIndex);
		}

		const readingView = songArea.createDiv({ cls: "set-list-song-container markdown-reading-view" });
		const previewView = readingView.createDiv({ cls: "markdown-preview-view" });
		void renderSong(this.app, this, previewView, songEntry.file);
	}

	private fallbackToFirstSong(): SongEntry | null {
		const first = findFirstSongIndex(this.parsed);
		if (first === null) return null;

		this.currentIndex = first;
		return this.parsed.entries[first] as SongEntry;
	}
}
