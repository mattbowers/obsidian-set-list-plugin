import { Component, setIcon, TFile, ViewStateResult } from "obsidian";
import { BaseSetListView } from "./BaseSetListView";
import { renderSong } from "../render/renderSong";
import { findFirstSongIndex, findNextSongIndex, findPrevSongIndex } from "../setlist/navigation";
import { renderBuildBadge } from "../ui/buildBadge";
import { SET_LIST_EDIT_VIEW_TYPE, SET_LIST_STAGE_VIEW_TYPE } from "./viewTypes";
import type { SongEntry } from "../setlist/types";

export { SET_LIST_STAGE_VIEW_TYPE };

export class SetListStageView extends BaseSetListView {
	private currentIndex = 0;
	// Set when Edit view's "Direct open song" jumps here for a song that isn't (necessarily) on
	// the set list; overrides what's shown at currentIndex without touching `parsed`/the
	// underlying note, and is cleared by the next navigation so swiping away from it resumes the
	// real set list where it left off.
	private adHocFile: TFile | null = null;
	// The view's own scroll container — contentEl itself stays non-scrolling so the nav button
	// cluster (a sibling of this, absolutely positioned against contentEl) stays pinned to the
	// bottom-right of the visible view rather than scrolling away with the song.
	private stageScrollEl: HTMLElement | null = null;
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
	private stagePrevButtonEl: HTMLButtonElement | null = null;
	private stageNextButtonEl: HTMLButtonElement | null = null;

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
		const scroller = this.stageScrollEl;
		if (!scroller) return;
		const spreads = Array.from(scroller.querySelectorAll<HTMLElement>(".set-list-pdf-spread"));
		if (spreads.length === 0) return;

		// Each spread's top offset in the scroller's own scrollable content coordinate space —
		// via getBoundingClientRect rather than offsetTop, since offsetTop is relative to the
		// nearest positioned ancestor (.set-list-stage-content), not necessarily the scroller itself.
		const containerTop = scroller.getBoundingClientRect().top;
		const scrollTop = scroller.scrollTop;
		const spreadTops = spreads.map((el) => el.getBoundingClientRect().top - containerTop + scrollTop);

		let currentIndex = 0;
		for (let i = 0; i < spreadTops.length; i++) {
			if (spreadTops[i] <= scrollTop + 1) currentIndex = i;
		}

		const targetIndex =
			direction === "down" ? Math.min(currentIndex + 1, spreads.length - 1) : Math.max(currentIndex - 1, 0);
		scroller.scrollTo({ top: spreadTops[targetIndex] });
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

		const scroller = root.createDiv({ cls: "set-list-stage-scroller" });
		const stageContent = scroller.createDiv({ cls: "set-list-stage-content" });
		this.songArea = stageContent.createDiv({ cls: "set-list-song-area" });

		// Transparent shield over the rendered song, so a mistimed tap mid-performance can't hit
		// a real link/checkbox in it. Only vertical scrolling passes through (CSS touch-action).
		stageContent.createDiv({ cls: "set-list-tap-shield" });

		renderBuildBadge(stageContent, this.plugin);

		// Bottom-right: the corner least likely to sit over the start of a line of lyrics/chords.
		const nav = root.createDiv({ cls: "set-list-stage-nav" });
		const smallButtons = nav.createDiv({ cls: "set-list-stage-nav-small" });
		this.stagePrevButtonEl = this.createNavButton(smallButtons, "chevron-left", "Previous song", () => this.goToPrev());
		// "list-ordered" mirrors SetListEditView.getIcon() — this is where the button takes you.
		this.createNavButton(smallButtons, "list-ordered", "Back to set list", () => this.exitToEditView());
		this.stageNextButtonEl = this.createNavButton(nav, "chevron-right", "Next song", () => this.goToNext());
		this.stageNextButtonEl.addClass("is-primary");

		this.stageScrollEl = scroller;
		this.stageContent = stageContent;
	}

	private createNavButton(
		parent: HTMLElement,
		icon: string,
		label: string,
		onClick: () => void,
	): HTMLButtonElement {
		const button = parent.createEl("button", { cls: "set-list-stage-nav-button", attr: { "aria-label": label } });
		setIcon(button, icon);

		// Fires on release, however long the press was held: a plain "click" never arrives after
		// a long press on touch (the OS treats it as a context-menu gesture and cancels the click),
		// and a held press mid-performance must still count. Pointer capture keeps the release
		// targeted at this button even if the finger drifts off it while held.
		let activePointerId: number | null = null;
		this.registerDomEvent(button, "pointerdown", (evt) => {
			if (button.disabled || evt.button !== 0) return;
			activePointerId = evt.pointerId;
			button.setPointerCapture(evt.pointerId);
			evt.preventDefault();
		});
		this.registerDomEvent(button, "pointerup", (evt) => {
			if (evt.pointerId !== activePointerId) return;
			activePointerId = null;
			evt.preventDefault();
			if (!button.disabled) onClick();
		});
		this.registerDomEvent(button, "pointercancel", () => {
			activePointerId = null;
		});
		this.registerDomEvent(button, "contextmenu", (evt) => evt.preventDefault());
		// Keyboard activation (Enter/Space) only — pointer presses are handled above, and their
		// own trailing click event (detail > 0) must not fire the action a second time.
		this.registerDomEvent(button, "click", (evt) => {
			evt.preventDefault();
			if (evt.detail === 0) onClick();
		});
		return button;
	}

	/** Disables prev/next when there's nowhere to go, and names the target song in the tooltip.
	 *  Deliberately NOT named `updateNavButtons`: Obsidian mobile's own View has a method of that
	 *  name and calls it from its constructor, so overriding it crashed view creation (before this
	 *  class's own fields, e.g. `parsed`, were even initialized). */
	private refreshStageNavButtons(): void {
		const next = this.getNextSongTitle();
		const prev = this.getPrevSongTitle();
		if (this.stageNextButtonEl) {
			this.stageNextButtonEl.disabled = next === null;
			this.stageNextButtonEl.setAttr("aria-label", next ? `Next: ${next}` : "Last song");
		}
		if (this.stagePrevButtonEl) {
			this.stagePrevButtonEl.disabled = prev === null;
			this.stagePrevButtonEl.setAttr("aria-label", prev ? `Previous: ${prev}` : "First song");
		}
	}

	/** Mirrors goToNext()'s own logic for which song it would reveal, without navigating there. */
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

	/** Mirrors goToPrev()'s own logic for which song it would reveal, without navigating there.
	 *  Unlike goToNext, goToPrev ignores any ad hoc file, so this does too. */
	private getPrevSongTitle(): string | null {
		const prev = findPrevSongIndex(this.parsed, this.currentIndex);
		const entry = prev !== null ? this.parsed.entries[prev] : null;
		if (!entry || entry.type !== "song") return null;
		return entry.file?.basename ?? entry.displayText;
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
				this.refreshStageNavButtons();
				songArea.createDiv({ cls: "set-list-song-missing", text: "No songs in this set list" });
				return;
			}

			if (this.file) {
				this.plugin.lastStageIndexByFile.set(this.file.path, this.currentIndex);
			}
			file = songEntry.file;
		}

		this.refreshStageNavButtons();

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
