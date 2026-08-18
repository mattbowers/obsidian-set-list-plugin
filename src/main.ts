import { MarkdownView, normalizePath, Plugin, TFile } from "obsidian";
import { isSetListFile, SET_LIST_FRONTMATTER_TYPE } from "./setlist/parser";
import { SetListEditView } from "./views/SetListEditView";
import { SetListStageView } from "./views/SetListStageView";
import { MARKDOWN_VIEW_TYPE, SET_LIST_EDIT_VIEW_TYPE, SET_LIST_STAGE_VIEW_TYPE } from "./views/viewTypes";
import { installSidebarSwipeGuard } from "./gestures/sidebarSwipeGuard";

const MAX_OPEN_EDIT_VIEW_ATTEMPTS = 10;

export default class SetListPlugin extends Plugin {
	private uninstallSwipeGuard: (() => void) | null = null;
	// Last song index shown per set-list file in Stage view, kept in sync by SetListStageView's
	// own render() rather than by any particular way of leaving it (gesture, command palette,
	// pane back button, ...) so SetListEditView can restore the right selection on load
	// regardless of how the user got back to it.
	readonly lastStageIndexByFile: Map<string, number> = new Map();

	async onload() {
		this.registerView(SET_LIST_EDIT_VIEW_TYPE, (leaf) => new SetListEditView(leaf, this));
		this.registerView(SET_LIST_STAGE_VIEW_TYPE, (leaf) => new SetListStageView(leaf, this));

		this.addSwitchViewCommand("switch-to-edit-view", "Switch to edit view", SET_LIST_EDIT_VIEW_TYPE);
		this.addEnterStageViewCommand();
		this.addSourceModeCommand();
		this.addNewSetListCommand();
		this.addEditViewActionCommands();
		this.addStageViewNavigationCommands();

		this.addRibbonIcon("list-plus", "New set list", () => void this.createNewSetList());

		this.uninstallSwipeGuard = installSidebarSwipeGuard(
			this.app,
			() => this.app.workspace.getActiveViewOfType(SetListStageView) !== null
		);

		this.registerEvent(
			this.app.workspace.on("file-open", (file) => {
				window.requestAnimationFrame(() => void this.maybeOpenEditView(file, 0));
			})
		);
	}

	onunload() {
		this.uninstallSwipeGuard?.();
		this.app.workspace.detachLeavesOfType(SET_LIST_EDIT_VIEW_TYPE);
		this.app.workspace.detachLeavesOfType(SET_LIST_STAGE_VIEW_TYPE);
	}

	private addSwitchViewCommand(id: string, name: string, viewType: string): void {
		this.addCommand({
			id,
			name,
			checkCallback: (checking) => {
				const file = this.activeSetListFile();
				if (!file) return false;

				if (!checking) {
					void this.app.workspace.getLeaf(false).setViewState({
						type: viewType,
						state: { file: file.path },
					});
				}
				return true;
			},
		});
	}

	/** Unlike the plain switch-view commands, this routes through the active SetListEditView's
	 *  own enterStageView() when there is one, so the command matches its toolbar button
	 *  exactly (selected song, else first song) rather than always starting from scratch. */
	private addEnterStageViewCommand(): void {
		this.addCommand({
			id: "switch-to-stage-view",
			name: "Switch to stage view",
			checkCallback: (checking) => {
				const file = this.activeSetListFile();
				if (!file) return false;

				if (!checking) {
					const editView = this.app.workspace.getActiveViewOfType(SetListEditView);
					if (editView) {
						editView.enterStageView();
					} else {
						void this.app.workspace.getLeaf(false).setViewState({
							type: SET_LIST_STAGE_VIEW_TYPE,
							state: { file: file.path },
						});
					}
				}
				return true;
			},
		});
	}

	private addSourceModeCommand(): void {
		this.addCommand({
			id: "open-source-mode",
			name: "Source mode",
			checkCallback: (checking) => {
				const file = this.activeSetListFile();
				if (!file) return false;

				if (!checking) {
					// Explicit Source Mode (state.source: true) is respected by the file-open
					// handler below, so the note stays put on next open.
					void this.app.workspace.getLeaf(false).setViewState({
						type: MARKDOWN_VIEW_TYPE,
						state: { file: file.path, mode: "source", source: true },
					});
				}
				return true;
			},
		});
	}

	private addNewSetListCommand(): void {
		this.addCommand({
			id: "new-set-list",
			name: "New set list",
			callback: () => void this.createNewSetList(),
		});
	}

	private addEditViewActionCommands(): void {
		this.addCommand({
			id: "add-song",
			name: "Add song",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListEditView);
				if (!view) return false;
				if (!checking) view.openSongPicker();
				return true;
			},
		});

		this.addCommand({
			id: "replace-selected-song",
			name: "Replace selected song",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListEditView);
				if (!view || !view.hasValidSelection()) return false;
				if (!checking) view.replaceSelectedSong();
				return true;
			},
		});

		this.addCommand({
			id: "remove-selected-song",
			name: "Remove selected song",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListEditView);
				if (!view || !view.hasValidSelection()) return false;
				if (!checking) view.removeSelectedSong();
				return true;
			},
		});

		this.addCommand({
			id: "open-song-as-new-tab",
			name: "Open song as new tab",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListEditView);
				if (!view || !view.getSelectedFile()) return false;
				if (!checking) view.openSelectedSongAsNewTab();
				return true;
			},
		});

		this.addCommand({
			id: "tag-all-songs-with-band",
			name: "Tag all songs with band",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListEditView);
				const band = view?.getBandName();
				if (!view || !band) return false;
				if (!checking) view.tagAllSongsWithBand(band);
				return true;
			},
		});

		this.addCommand({
			id: "paste-songs-from-clipboard",
			name: "Paste songs from clipboard",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListEditView);
				if (!view) return false;
				if (!checking) void view.pasteSongsFromClipboard();
				return true;
			},
		});
	}

	private addStageViewNavigationCommands(): void {
		this.addCommand({
			id: "next-song",
			name: "Next song",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListStageView);
				if (!view) return false;
				if (!checking) view.goToNext();
				return true;
			},
		});

		this.addCommand({
			id: "previous-song",
			name: "Previous song",
			checkCallback: (checking) => {
				const view = this.app.workspace.getActiveViewOfType(SetListStageView);
				if (!view) return false;
				if (!checking) view.goToPrev();
				return true;
			},
		});
	}

	private async maybeOpenEditView(file: TFile | null, attempt: number): Promise<void> {
		if (!file) return;

		const cache = this.app.metadataCache.getFileCache(file);
		if (!isSetListFile(cache)) return;

		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.file?.path !== file.path) return;

		const state = view.getState();
		if (state.mode === "source" && state.source === true) return;

		const leaf = view.leaf;
		try {
			await leaf.setViewState({
				type: SET_LIST_EDIT_VIEW_TYPE,
				state: { file: file.path },
			});
		} catch (err) {
			console.error("[SetList] file-open: setViewState threw", err);
			return;
		}

		if (leaf.view.getViewType() === SET_LIST_EDIT_VIEW_TYPE) return;

		// Obsidian's own file-opening pipeline can still be mid-flight at this point and
		// stomps the switch back to markdown; retry on the next frame until it sticks.
		if (attempt < MAX_OPEN_EDIT_VIEW_ATTEMPTS) {
			window.requestAnimationFrame(() => void this.maybeOpenEditView(file, attempt + 1));
		} else {
			console.warn("[SetList] file-open: gave up switching to edit view", file.path);
		}
	}

	/** Mirrors where Obsidian's own "New note" places a file — respects the user's "New file
	 *  location" setting, including the currently selected/active folder where applicable. */
	private async createNewSetList(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		const parent = this.app.fileManager.getNewFileParent(activeFile?.path ?? "");
		const path = this.getAvailableSetListPath(parent.path);
		const file = await this.app.vault.create(path, `---\ntype: ${SET_LIST_FRONTMATTER_TYPE}\n---\n`);

		const leaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({
			type: SET_LIST_EDIT_VIEW_TYPE,
			state: { file: file.path },
		});
		this.app.workspace.setActiveLeaf(leaf, { focus: true });
	}

	private getAvailableSetListPath(folderPath: string): string {
		const base = "New Set List";
		for (let n = 0; ; n++) {
			const name = n === 0 ? `${base}.md` : `${base} ${n}.md`;
			const path = normalizePath(folderPath ? `${folderPath}/${name}` : name);
			if (!this.app.vault.getAbstractFileByPath(path)) return path;
		}
	}

	private activeSetListFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file) return null;

		const cache = this.app.metadataCache.getFileCache(file);
		return isSetListFile(cache) ? file : null;
	}
}
