import { setIcon, setTooltip, TFile } from "obsidian";
import { BaseSetListView } from "./BaseSetListView";
import { SongPickerModal } from "../ui/SongPickerModal";
import { addSong, removeSong, replaceSong, reorder } from "../setlist/mutations";
import { persistSetList } from "../setlist/persist";
import { findFirstSongIndex } from "../setlist/navigation";
import { renderBuildBadge } from "../ui/buildBadge";
import { MARKDOWN_VIEW_TYPE, SET_LIST_EDIT_VIEW_TYPE, SET_LIST_STAGE_VIEW_TYPE } from "./viewTypes";
import type { ParsedSetList, SongEntry } from "../setlist/types";

interface DragRow {
	el: HTMLElement;
	entryIndex: number;
	mid: number;
}

export class SetListEditView extends BaseSetListView {
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

		const toolbar = scroll.createDiv({ cls: "set-list-toolbar" });
		this.createIconButton(toolbar, "plus", "Add song", () => this.openSongPicker());
		this.createIconButton(
			toolbar,
			"replace",
			"Replace selected song",
			() => this.replaceSelectedSong(),
			undefined,
			!this.hasValidSelection()
		);
		this.createIconButton(
			toolbar,
			"trash-2",
			"Remove selected song",
			() => this.removeSelectedSong(),
			undefined,
			!this.hasValidSelection()
		);
		this.createIconButton(toolbar, "presentation", "Enter stage view", () => this.enterStageView());
		this.createIconButton(
			toolbar,
			"external-link",
			"Open song as new tab",
			() => this.openSelectedSongAsNewTab(),
			undefined,
			!this.getSelectedFile()
		);
		this.createIconButton(toolbar, "code", "Source mode", () => this.openAsSourceMode());

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
		row.setAttribute("draggable", "true");
		row.dataset.entryIndex = String(index);
		if (!entry.file) {
			row.addClass("set-list-row-unresolved");
		}
		if (index === this.selectedIndex) {
			row.addClass("set-list-row-selected");
		}

		row.createSpan({ cls: "set-list-row-number", text: String(songNumber).padStart(2, "0") });
		row.createSpan({ cls: "set-list-row-label", text: entry.displayText });

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

	private hasValidSelection(): boolean {
		return (
			this.selectedIndex !== null &&
			this.parsed.entries[this.selectedIndex]?.type === "song"
		);
	}

	private removeSelectedSong(): void {
		if (!this.hasValidSelection() || this.selectedIndex === null) return;
		void this.persist(removeSong(this.parsed, this.selectedIndex));
		this.selectedIndex = null;
	}

	private getSelectedFile(): TFile | null {
		if (!this.hasValidSelection() || this.selectedIndex === null) return null;
		const entry = this.parsed.entries[this.selectedIndex];
		return entry.type === "song" ? entry.file : null;
	}

	private openSelectedSongAsNewTab(): void {
		const file = this.getSelectedFile();
		if (!file) return;
		void this.app.workspace.getLeaf("tab").openFile(file);
	}

	private openSongPicker(replaceIndex?: number): void {
		if (!this.file) return;
		const sourcePath = this.file.path;
		const includedPaths = new Set(
			this.parsed.entries
				.filter((entry): entry is SongEntry => entry.type === "song" && entry.file !== null)
				.map((entry) => entry.file!.path)
		);
		new SongPickerModal(this.app, includedPaths, (file) => {
			const entry = this.createSongEntry(file, sourcePath);
			if (replaceIndex !== undefined) {
				void this.persist(replaceSong(this.parsed, replaceIndex, entry));
			} else {
				void this.persist(addSong(this.parsed, entry));
			}
		}).open();
	}

	private replaceSelectedSong(): void {
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

	private enterStageView(): void {
		if (!this.file) return;
		const index = this.hasValidSelection() ? this.selectedIndex! : findFirstSongIndex(this.parsed) ?? 0;
		void this.leaf.setViewState({
			type: SET_LIST_STAGE_VIEW_TYPE,
			state: { file: this.file.path, index },
		});
	}

	private openAsSourceMode(): void {
		if (!this.file) return;
		// Explicit Source Mode (state.source: true) is respected by main.ts's
		// auto-switch-to-edit-view handler, so this stays put on reopen.
		void this.leaf.setViewState({
			type: MARKDOWN_VIEW_TYPE,
			state: { file: this.file.path, mode: "source", source: true },
		});
	}
}
