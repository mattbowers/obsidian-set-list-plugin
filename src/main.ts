import { Plugin, TFile } from "obsidian";
import { isSetListFile } from "./setlist/parser";
import { SetListEditView } from "./views/SetListEditView";
import { SetListStageView } from "./views/SetListStageView";
import { SET_LIST_EDIT_VIEW_TYPE, SET_LIST_STAGE_VIEW_TYPE } from "./views/viewTypes";
import { installSidebarSwipeGuard } from "./gestures/sidebarSwipeGuard";

export default class SetListPlugin extends Plugin {
	private uninstallSwipeGuard: (() => void) | null = null;

	async onload() {
		this.registerView(SET_LIST_EDIT_VIEW_TYPE, (leaf) => new SetListEditView(leaf, this));
		this.registerView(SET_LIST_STAGE_VIEW_TYPE, (leaf) => new SetListStageView(leaf, this));

		this.addSwitchViewCommand("switch-to-edit-view", "Switch to edit view", SET_LIST_EDIT_VIEW_TYPE);
		this.addSwitchViewCommand("switch-to-stage-view", "Switch to stage view", SET_LIST_STAGE_VIEW_TYPE);

		this.uninstallSwipeGuard = installSidebarSwipeGuard(
			this.app,
			() => this.app.workspace.getActiveViewOfType(SetListStageView) !== null
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

	private activeSetListFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file) return null;

		const cache = this.app.metadataCache.getFileCache(file);
		return isSetListFile(cache) ? file : null;
	}
}
