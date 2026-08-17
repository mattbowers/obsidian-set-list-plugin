import { TFile } from "obsidian";
import { BaseSetListView } from "./BaseSetListView";
import { SongPickerModal } from "../ui/SongPickerModal";
import { addSong, removeSong, reorder } from "../setlist/mutations";
import { persistSetList } from "../setlist/persist";
import { findFirstSongIndex } from "../setlist/navigation";
import { renderBuildBadge } from "../ui/buildBadge";
import { renderSong } from "../render/renderSong";
import { SET_LIST_EDIT_VIEW_TYPE, SET_LIST_STAGE_VIEW_TYPE } from "./viewTypes";
import type { ParsedSetList, SongEntry } from "../setlist/types";

export class SetListEditView extends BaseSetListView {
	private selectedIndex: number | null = null;

	getViewType(): string {
		return SET_LIST_EDIT_VIEW_TYPE;
	}

	getIcon(): string {
		return "list-ordered";
	}

	protected render(): void {
		const container = this.contentEl;
		container.empty();
		container.addClass("set-list-edit-view");
		renderBuildBadge(container, this.plugin);

		const layout = container.createDiv({ cls: "set-list-edit-layout" });

		const listPane = layout.createDiv({ cls: "set-list-edit-list-pane" });
		const toolbar = listPane.createDiv({ cls: "set-list-toolbar" });
		toolbar.createEl("button", { text: "Add song" }).addEventListener("click", () => this.openSongPicker());
		toolbar
			.createEl("button", { text: "Enter stage view" })
			.addEventListener("click", () => this.enterStageView());

		const list = listPane.createDiv({ cls: "set-list-rows" });
		this.parsed.entries.forEach((entry, index) => {
			if (entry.type === "song") {
				this.renderSongRow(list, entry, index);
			} else if (entry.raw.trim().length > 0) {
				list.createDiv({ cls: "set-list-row set-list-row-text", text: entry.raw });
			}
		});

		const previewPane = layout.createDiv({ cls: "set-list-edit-preview-pane" });
		this.renderPreview(previewPane);
	}

	private renderPreview(previewPane: HTMLElement): void {
		const selected = this.selectedIndex !== null ? this.parsed.entries[this.selectedIndex] : undefined;
		if (!selected || selected.type !== "song") {
			previewPane.createDiv({ cls: "set-list-song-missing", text: "Select a song to preview it" });
			return;
		}

		const readingView = previewPane.createDiv({ cls: "set-list-song-container markdown-reading-view" });
		const previewView = readingView.createDiv({ cls: "markdown-preview-view" });
		void renderSong(this.app, this, previewView, selected.file);
	}

	private renderSongRow(list: HTMLElement, entry: SongEntry, index: number): void {
		const row = list.createDiv({ cls: "set-list-row set-list-row-song" });
		row.setAttribute("draggable", "true");
		if (!entry.file) {
			row.addClass("set-list-row-unresolved");
		}
		if (index === this.selectedIndex) {
			row.addClass("set-list-row-selected");
		}

		row.createSpan({ cls: "set-list-row-label", text: entry.displayText });
		row.createEl("button", { cls: "set-list-row-remove", text: "Remove" }).addEventListener("click", (evt) => {
			evt.stopPropagation();
			void this.persist(removeSong(this.parsed, index));
		});

		row.addEventListener("click", () => {
			this.selectedIndex = index;
			this.render();
		});

		row.addEventListener("dragstart", (evt) => {
			evt.dataTransfer?.setData("text/plain", String(index));
			row.addClass("set-list-row-dragging");
		});
		row.addEventListener("dragend", () => {
			row.removeClass("set-list-row-dragging");
			this.clearDropIndicators(list);
		});
		row.addEventListener("dragover", (evt) => {
			evt.preventDefault();
			this.clearDropIndicators(list);
			row.addClass(this.isDropBefore(row, evt) ? "set-list-row-drop-before" : "set-list-row-drop-after");
		});
		row.addEventListener("dragleave", () => {
			row.removeClass("set-list-row-drop-before");
			row.removeClass("set-list-row-drop-after");
		});
		row.addEventListener("drop", (evt) => {
			evt.preventDefault();
			this.clearDropIndicators(list);

			const fromIndex = Number(evt.dataTransfer?.getData("text/plain"));
			if (Number.isNaN(fromIndex)) return;

			let toIndex = this.isDropBefore(row, evt) ? index : index + 1;
			if (fromIndex < toIndex) toIndex -= 1;
			if (toIndex === fromIndex) return;

			void this.persist(reorder(this.parsed, fromIndex, toIndex));
		});
	}

	private isDropBefore(row: HTMLElement, evt: DragEvent): boolean {
		const rect = row.getBoundingClientRect();
		return evt.clientY - rect.top < rect.height / 2;
	}

	private clearDropIndicators(list: HTMLElement): void {
		list.querySelectorAll<HTMLElement>(".set-list-row-drop-before, .set-list-row-drop-after").forEach((el) => {
			el.removeClass("set-list-row-drop-before");
			el.removeClass("set-list-row-drop-after");
		});
	}

	private openSongPicker(): void {
		if (!this.file) return;
		const sourcePath = this.file.path;
		new SongPickerModal(this.app, (file) => {
			void this.persist(addSong(this.parsed, this.createSongEntry(file, sourcePath)));
		}).open();
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
		const index = this.selectedIndex ?? findFirstSongIndex(this.parsed) ?? 0;
		void this.leaf.setViewState({
			type: SET_LIST_STAGE_VIEW_TYPE,
			state: { file: this.file.path, index },
		});
	}
}
