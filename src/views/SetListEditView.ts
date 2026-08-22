import { Platform, setIcon, setTooltip, TFile } from "obsidian";
import { BaseSetListView } from "./BaseSetListView";
import { SongPickerModal } from "../ui/SongPickerModal";
import { addSong, appendEntries, removeSong, replaceSong, reorder } from "../setlist/mutations";
import { persistSetList } from "../setlist/persist";
import { findFirstSongIndex, findNextSongIndex, findPrevSongIndex } from "../setlist/navigation";
import { getBandName as readBandName } from "../setlist/parser";
import { addTagToAllSongs, sanitizeTag } from "../setlist/tagging";
import { findBestSongMatches } from "../setlist/songMatch";
import { renderBuildBadge } from "../ui/buildBadge";
import { MARKDOWN_VIEW_TYPE, SET_LIST_EDIT_VIEW_TYPE, SET_LIST_STAGE_VIEW_TYPE } from "./viewTypes";
import type { ParsedSetList, SetListEntry, SongEntry } from "../setlist/types";

interface DragRow {
	el: HTMLElement;
	entryIndex: number;
	mid: number;
}

export class SetListEditView extends BaseSetListView {
	// Defaults to locked: safe/read-only until explicitly unlocked, so a stray tap mid-performance
	// can't reorder or delete a song. Stage view, Direct open song, and Open song as new tab stay
	// available while locked (see hasValidSelection-style guards below) — everything else that
	// writes to the note or a song file is blocked, both at the toolbar/method level here and via
	// isLocked() in main.ts's matching command checkCallbacks.
	private locked = true;
	private selectedIndex: number | null = null;
	private dragFromIndex: number | null = null;
	private dragFromEl: HTMLElement | null = null;
	private dragRowExtent: number = 0;
	// Snapshotted once at dragstart: row midpoints/heights change as rows shuffle out of
	// the way, but drop-target math must stay anchored to the pre-shuffle layout, otherwise
	// the target keeps moving under the cursor and the computed index oscillates/cancels out.
	private dragRowLayout: DragRow[] = [];
	private shiftedRowEls: HTMLElement[] = [];

	getViewType(): string {
		return SET_LIST_EDIT_VIEW_TYPE;
	}

	getIcon(): string {
		return "list-ordered";
	}

	// Pre-select whatever song was last shown in Stage view for this file, so returning here
	// — however that happens (long-press gesture, the switch-to-edit-view command, or the
	// pane's back button all end up here via this same onLoadFile hook) — lands on the right
	// row. Only applies to a fresh selection; an existing one (e.g. the user already clicked
	// a row) is left alone.
	async onOpen(): Promise<void> {
		await super.onOpen();
		this.registerDomEvent(document, "keydown", (evt) => this.handleKeydown(evt));
	}

	/** Ignored while a modal's own search input (e.g. SongPickerModal) or any other text field has
	 *  focus, so this doesn't steal arrow keys from a fuzzy suggester's own suggestion navigation. */
	private handleKeydown(evt: KeyboardEvent): void {
		const target = evt.target;
		if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;

		if (evt.key === "ArrowDown") {
			evt.preventDefault();
			this.selectAdjacentSong(1);
		} else if (evt.key === "ArrowUp") {
			evt.preventDefault();
			this.selectAdjacentSong(-1);
		} else if (evt.key === "Enter" && this.hasValidSelection()) {
			evt.preventDefault();
			this.enterStageView();
		}
	}

	private selectAdjacentSong(direction: 1 | -1): void {
		const nextIndex =
			direction === 1
				? findNextSongIndex(this.parsed, this.selectedIndex ?? -1)
				: findPrevSongIndex(this.parsed, this.selectedIndex ?? this.parsed.entries.length);
		if (nextIndex === null) return;

		this.selectedIndex = nextIndex;
		this.render();
		this.contentEl
			.querySelector(`.set-list-row[data-entry-index="${nextIndex}"]`)
			?.scrollIntoView({ block: "nearest" });
	}

	async onLoadFile(file: TFile): Promise<void> {
		await super.onLoadFile(file);
		if (this.selectedIndex === null) {
			const lastStageIndex = this.plugin.lastStageIndexByFile.get(file.path);
			if (lastStageIndex !== undefined && this.parsed.entries[lastStageIndex]?.type === "song") {
				this.selectedIndex = lastStageIndex;
				this.render();
			}
		}
	}

	protected render(): void {
		const container = this.contentEl;
		// render() rebuilds the whole DOM tree from scratch (e.g. on every row click, to
		// update selection/button state), which would otherwise reset scroll to the top each
		// time — restore it once the new content is in place.
		const previousScrollTop = container.querySelector<HTMLElement>(".set-list-scroll")?.scrollTop ?? 0;
		container.empty();
		container.addClass("set-list-edit-view");
		renderBuildBadge(container, this.plugin);

		// A dedicated scroll container (rather than relying on Obsidian's own .view-content
		// scrolling/padding on `container`) so the toolbar's `position: sticky` has a
		// zero-padding ancestor to stick flush against, with no gap the list peeks through.
		const scroll = container.createDiv({ cls: "set-list-scroll" });

		const toolbar = scroll.createDiv({
			cls: this.locked ? "set-list-toolbar" : "set-list-toolbar is-unlocked",
		});
		const bandName = this.getBandName();
		const songCount = this.parsed.entries.filter((entry) => entry.type === "song").length;
		const songCountText = songCount === 1 ? "1 song" : `${songCount} songs`;
		toolbar.createDiv({
			cls: "set-list-toolbar-header",
			text: bandName ? `${bandName} · ${songCountText}` : songCountText,
		});

		const toolbarButtons = toolbar.createDiv({ cls: "set-list-toolbar-buttons" });
		this.createIconButton(
			toolbarButtons,
			this.locked ? "lock" : "unlock",
			this.locked ? "Unlock editing" : "Lock editing",
			() => this.toggleLock(),
			"set-list-lock-button"
		);
		this.createIconButton(toolbarButtons, "plus", "Add song", () => this.openSongPicker(), undefined, this.locked);
		this.createIconButton(
			toolbarButtons,
			"replace",
			"Replace selected song",
			() => this.replaceSelectedSong(),
			undefined,
			this.locked || !this.hasValidSelection()
		);
		this.createIconButton(
			toolbarButtons,
			"trash-2",
			"Remove selected song",
			() => this.removeSelectedSong(),
			undefined,
			this.locked || !this.hasValidSelection()
		);
		this.createIconButton(toolbarButtons, "presentation", "Enter stage view", () => this.enterStageView());
		this.createIconButton(toolbarButtons, "play", "Direct open song", () => this.openDirectSongPicker());
		this.createIconButton(
			toolbarButtons,
			"external-link",
			"Open song as new tab",
			() => this.openSelectedSongAsNewTab(),
			undefined,
			!this.getSelectedFile()
		);
		// Set-list-level actions (as opposed to the selected-song actions above) sit on the
		// right, so their grouping signals they act on the set list itself, not a song.
		const toolbarRight = toolbarButtons.createDiv({ cls: "set-list-toolbar-group-right" });
		// Off-stage, desktop-oriented actions (bulk clipboard import/export, tagging by band) —
		// hidden on mobile, where Stage view is the point and these just add clutter.
		if (Platform.isDesktop) {
			this.createIconButton(
				toolbarRight,
				"clipboard-paste",
				"Paste songs from clipboard",
				() => void this.pasteSongsFromClipboard(),
				undefined,
				this.locked
			);
			this.createIconButton(
				toolbarRight,
				"copy",
				"Copy to clipboard",
				() => void this.copyToClipboard(),
				undefined,
				this.locked
			);
			if (bandName) {
				this.createIconButton(
					toolbarRight,
					"tag",
					`Tag all songs with "${bandName}"`,
					() => this.tagAllSongsWithBand(bandName),
					undefined,
					this.locked
				);
			}
		}
		this.createIconButton(
			toolbarRight,
			"code",
			"Source mode",
			() => this.openAsSourceMode(),
			undefined,
			this.locked
		);

		const list = scroll.createDiv({ cls: "set-list-rows" });
		list.addEventListener("dragover", (evt) => {
			evt.preventDefault();
			this.updateDragShuffle(evt.clientY);
		});
		list.addEventListener("drop", (evt) => {
			evt.preventDefault();
			this.handleDrop(evt);
		});

		let songNumber = 1;
		this.parsed.entries.forEach((entry, index) => {
			if (entry.type === "song") {
				this.renderSongRow(list, entry, index, songNumber);
				songNumber += 1;
			} else if (entry.raw.trim().length > 0) {
				const textRow = list.createDiv({ cls: "set-list-row set-list-row-text", text: entry.raw });
				textRow.dataset.entryIndex = String(index);
			}
		});

		scroll.scrollTop = previousScrollTop;
	}

	private renderSongRow(list: HTMLElement, entry: SongEntry, index: number, songNumber: number): void {
		const row = list.createDiv({ cls: "set-list-row set-list-row-song" });
		// Always draggable, even while locked — mobile's native touch-based drag-and-drop only
		// reliably engages when an element is draggable from its very first render; toggling the
		// attribute later (e.g. right after tapping unlock) doesn't register on touch the way it
		// does with a mouse. The lock is enforced instead by cancelling the drag at dragstart.
		row.setAttribute("draggable", "true");
		row.dataset.entryIndex = String(index);
		if (!entry.file) {
			row.addClass("set-list-row-unresolved");
		}
		if (index === this.selectedIndex) {
			row.addClass("set-list-row-selected");
		}

		row.createSpan({ cls: "set-list-row-number", text: String(songNumber).padStart(2, "0") });

		const titleGroup = row.createDiv({ cls: "set-list-row-title-group" });
		titleGroup.createSpan({ cls: "set-list-row-label", text: entry.displayText });
		const metadataLine = entry.file ? this.getSongMetadataLine(entry.file) : null;
		if (metadataLine) {
			titleGroup.createSpan({ cls: "set-list-row-metadata", text: metadataLine });
		}

		row.addEventListener("click", () => {
			this.selectedIndex = index;
			this.render();
		});

		// Double-tap/double-click a song to jump straight into performing it.
		row.addEventListener("dblclick", () => {
			this.selectedIndex = index;
			this.enterStageView();
		});

		row.addEventListener("dragstart", (evt) => {
			if (this.locked) {
				evt.preventDefault();
				return;
			}
			evt.dataTransfer?.setData("text/plain", String(index));
			row.addClass("set-list-row-dragging");
			this.dragFromIndex = index;
			this.dragFromEl = row;
			const gap = parseFloat(getComputedStyle(list).rowGap) || 0;
			this.dragRowExtent = row.getBoundingClientRect().height + gap;
			this.dragRowLayout = Array.from(list.children).map((el) => {
				const rowEl = el as HTMLElement;
				const rect = rowEl.getBoundingClientRect();
				return { el: rowEl, entryIndex: Number(rowEl.dataset.entryIndex), mid: rect.top + rect.height / 2 };
			});
		});
		row.addEventListener("dragend", () => {
			row.removeClass("set-list-row-dragging");
			this.resetDragShuffle();
			this.dragFromIndex = null;
			this.dragFromEl = null;
			this.dragRowLayout = [];
		});
	}

	private handleDrop(evt: DragEvent): void {
		this.resetDragShuffle();
		if (this.locked) return;

		const fromIndex = Number(evt.dataTransfer?.getData("text/plain"));
		if (Number.isNaN(fromIndex)) return;

		const insertBeforeEntryIndex = this.findInsertionEntryIndex(evt.clientY);
		if (insertBeforeEntryIndex === null) return;

		let toIndex = insertBeforeEntryIndex;
		if (fromIndex < toIndex) toIndex -= 1;
		if (toIndex === fromIndex) return;

		// Select the dragged song at its new position, so it's obvious where it landed.
		this.selectedIndex = toIndex;
		void this.persist(reorder(this.parsed, fromIndex, toIndex));
	}

	/** Entries-array index to insert before, based on the frozen pre-drag row layout. */
	private findInsertionEntryIndex(clientY: number): number | null {
		if (!this.dragRowLayout.length) return null;

		const domIndex = this.dragRowLayout.filter((row) => row.mid < clientY).length;
		if (domIndex < this.dragRowLayout.length) {
			return this.dragRowLayout[domIndex].entryIndex;
		}
		return this.parsed.entries.length;
	}

	private updateDragShuffle(clientY: number): void {
		if (!this.dragFromEl || this.dragFromIndex === null || !this.dragRowLayout.length) return;

		const domFromIndex = this.dragRowLayout.findIndex((row) => row.el === this.dragFromEl);
		const domTargetIndex = this.dragRowLayout.filter((row) => row.mid < clientY).length;
		if (domFromIndex === -1) return;

		this.resetDragShuffle();
		if (domTargetIndex > domFromIndex) {
			for (let i = domFromIndex + 1; i < domTargetIndex; i++) {
				this.shiftRow(this.dragRowLayout[i].el, -this.dragRowExtent);
			}
		} else if (domTargetIndex < domFromIndex) {
			for (let i = domTargetIndex; i < domFromIndex; i++) {
				this.shiftRow(this.dragRowLayout[i].el, this.dragRowExtent);
			}
		}
	}

	private shiftRow(row: HTMLElement, byPx: number): void {
		row.style.transform = `translateY(${byPx}px)`;
		this.shiftedRowEls.push(row);
	}

	private resetDragShuffle(): void {
		for (const row of this.shiftedRowEls) {
			row.style.transform = "";
		}
		this.shiftedRowEls = [];
	}

	private createIconButton(
		parent: HTMLElement,
		icon: string,
		tooltip: string,
		onClick: (evt: MouseEvent) => void,
		extraCls?: string,
		disabled = false
	): HTMLButtonElement {
		const button = parent.createEl("button", { cls: extraCls ? `clickable-icon ${extraCls}` : "clickable-icon" });
		setIcon(button, icon);
		setTooltip(button, tooltip);
		button.disabled = disabled;
		button.addEventListener("click", onClick);
		return button;
	}

	// Public from here down: called both by the toolbar buttons above and by main.ts's
	// command-palette registrations, which need a way to invoke (and check-gate) the same
	// actions on whatever SetListEditView is currently active.
	hasValidSelection(): boolean {
		return (
			this.selectedIndex !== null &&
			this.parsed.entries[this.selectedIndex]?.type === "song"
		);
	}

	isLocked(): boolean {
		return this.locked;
	}

	toggleLock(): void {
		this.locked = !this.locked;
		this.render();
	}

	// Used by main.ts's "New set list" flow: a brand-new, still-empty set list should open
	// ready to add songs to immediately rather than making the user unlock it first.
	unlock(): void {
		this.locked = false;
		this.render();
	}

	removeSelectedSong(): void {
		if (this.locked || !this.hasValidSelection() || this.selectedIndex === null) return;
		void this.persist(removeSong(this.parsed, this.selectedIndex));
		this.selectedIndex = null;
	}

	getSelectedFile(): TFile | null {
		if (!this.hasValidSelection() || this.selectedIndex === null) return null;
		const entry = this.parsed.entries[this.selectedIndex];
		return entry.type === "song" ? entry.file : null;
	}

	openSelectedSongAsNewTab(): void {
		const file = this.getSelectedFile();
		if (!file) return;
		void this.app.workspace.getLeaf("tab").openFile(file);
	}

	getBandName(): string | null {
		return this.file ? readBandName(this.app.metadataCache.getFileCache(this.file)) : null;
	}

	private getBandTag(): string | null {
		const band = this.getBandName();
		if (!band) return null;
		const tag = sanitizeTag(band);
		return tag.length > 0 ? tag : null;
	}

	/** artist/key/tempo from the song file's own frontmatter (not the set list's), joined for
	 *  display under its row title. Any subset may be present; absent ones are just skipped. */
	private getSongMetadataLine(file: TFile): string | null {
		const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
		if (!frontmatter) return null;

		const parts = [
			this.stringifyMetadataValue(frontmatter.artist),
			this.stringifyMetadataValue(frontmatter.key),
			this.formatTempo(frontmatter.tempo),
		].filter((value): value is string => value !== null);

		return parts.length > 0 ? parts.join(" · ") : null;
	}

	private formatTempo(value: unknown): string | null {
		const tempo = this.stringifyMetadataValue(value);
		if (!tempo) return null;
		// \b alone misses "bpm" directly after a digit (e.g. "120bpm") since digit/letter is not a
		// word-boundary transition — match a leading digit/whitespace/start too, not just \b.
		return /(?:^|\d|\s)bpm\b/i.test(tempo) ? tempo : `${tempo} bpm`;
	}

	private stringifyMetadataValue(value: unknown): string | null {
		if (typeof value === "string") {
			const trimmed = value.trim();
			return trimmed.length > 0 ? trimmed : null;
		}
		if (typeof value === "number") return String(value);
		return null;
	}

	private getIncludedSongPaths(): Set<string> {
		return new Set(
			this.parsed.entries
				.filter((entry): entry is SongEntry => entry.type === "song" && entry.file !== null)
				.map((entry) => entry.file!.path)
		);
	}

	openSongPicker(replaceIndex?: number): void {
		if (this.locked || !this.file) return;
		const sourcePath = this.file.path;
		const includedPaths = this.getIncludedSongPaths();
		new SongPickerModal(this.app, includedPaths, this.getBandTag(), replaceIndex !== undefined, (file) => {
			const entry = this.createSongEntry(file, sourcePath);
			if (replaceIndex !== undefined) {
				void this.persist(replaceSong(this.parsed, replaceIndex, entry));
			} else {
				// Insert after the current selection so successive adds (the picker stays open)
				// land in pick order, one after another, rather than each landing right after the
				// original selection and reversing that order; falls back to the end when nothing
				// is selected. The newly-added song becomes the selection for the same reason.
				const insertIndex = this.hasValidSelection() && this.selectedIndex !== null
					? this.selectedIndex + 1
					: this.parsed.entries.length;
				this.selectedIndex = insertIndex;
				void this.persist(addSong(this.parsed, entry, insertIndex));
			}
		}).open();
	}

	replaceSelectedSong(): void {
		if (!this.hasValidSelection() || this.selectedIndex === null) return;
		this.openSongPicker(this.selectedIndex);
	}

	private createSongEntry(file: TFile, sourcePath: string): SongEntry {
		return {
			type: "song",
			line: -1,
			raw: this.app.fileManager.generateMarkdownLink(file, sourcePath),
			linkText: file.path,
			displayText: file.basename,
			file,
		};
	}

	private async persist(parsed: ParsedSetList): Promise<void> {
		if (!this.file) return;
		await persistSetList(this.app, this.file, parsed);
	}

	enterStageView(adHocFile?: TFile): void {
		if (!this.file) return;
		const index = this.hasValidSelection() ? this.selectedIndex! : findFirstSongIndex(this.parsed) ?? 0;
		void this.leaf.setViewState({
			type: SET_LIST_STAGE_VIEW_TYPE,
			state: { file: this.file.path, index, adHocPath: adHocFile?.path ?? null },
		});
	}

	/**
	 * Picks a song that isn't (necessarily) on the set list and jumps straight into Stage view
	 * showing it — a request or filler song mid-set — without adding it to the set list note.
	 * `index` still gets set from the current selection (as enterStageView's own default does),
	 * so once the ad hoc song is swiped away from, Stage view resumes the real set list there.
	 */
	openDirectSongPicker(): void {
		if (!this.file) return;
		const includedPaths = this.getIncludedSongPaths();
		new SongPickerModal(this.app, includedPaths, this.getBandTag(), true, (file) => {
			this.enterStageView(file);
		}).open();
	}

	tagAllSongsWithBand(band: string): void {
		if (this.locked) return;
		const tag = sanitizeTag(band);
		if (!tag) return;
		void addTagToAllSongs(this.app, this.parsed, tag);
	}

	/**
	 * Best-effort import: each non-blank clipboard line becomes a song row if it matches a
	 * vault file (see findBestSongMatches), or is appended as a plain text row otherwise — so an
	 * unmatched line is still visible to fix up by hand rather than silently dropped.
	 */
	async pasteSongsFromClipboard(): Promise<void> {
		if (this.locked || !this.file) return;

		let text: string;
		try {
			text = await navigator.clipboard.readText();
		} catch (err) {
			console.error("[SetList] Failed to read clipboard", err);
			return;
		}

		const lines = text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (lines.length === 0) return;

		const sourcePath = this.file.path;
		const matches = findBestSongMatches(this.app, lines);
		const newEntries: SetListEntry[] = lines.map((line, i) => {
			const match = matches[i];
			return match ? this.createSongEntry(match, sourcePath) : { type: "text", line: -1, raw: line };
		});

		void this.persist(appendEntries(this.parsed, newEntries));
	}

	/**
	 * Opposite of pasteSongsFromClipboard: plain-text lines, one per entry — a song's own
	 * displayText (no wikilink markup) for song rows, the raw line for text rows — so the
	 * result round-trips back through paste (which re-matches song titles to vault files).
	 * Blank text rows (spacing-only) are dropped, matching what paste itself ignores.
	 */
	async copyToClipboard(): Promise<void> {
		if (this.locked) return;
		const lines = this.parsed.entries
			.map((entry) => (entry.type === "song" ? entry.displayText : entry.raw).trim())
			.filter((line) => line.length > 0);
		if (lines.length === 0) return;

		try {
			await navigator.clipboard.writeText(lines.join("\n"));
		} catch (err) {
			console.error("[SetList] Failed to write clipboard", err);
		}
	}

	private openAsSourceMode(): void {
		if (this.locked || !this.file) return;
		// Explicit Source Mode (state.source: true) is respected by main.ts's
		// auto-switch-to-edit-view handler, so this stays put on reopen.
		void this.leaf.setViewState({
			type: MARKDOWN_VIEW_TYPE,
			state: { file: this.file.path, mode: "source", source: true },
		});
	}
}
