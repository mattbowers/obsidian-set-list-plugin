import { App, FuzzyMatch, FuzzySuggestModal, TFile } from "obsidian";

export class SongPickerModal extends FuzzySuggestModal<TFile> {
	private readonly includedPaths: ReadonlySet<string>;
	private readonly onChoose: (file: TFile) => void;

	constructor(app: App, includedPaths: ReadonlySet<string>, onChoose: (file: TFile) => void) {
		super(app);
		this.includedPaths = includedPaths;
		this.onChoose = onChoose;
		this.setPlaceholder("Add a song to the set list…");
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((file) => file.extension === "md" || file.extension === "pdf");
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement): void {
		super.renderSuggestion(match, el);
		if (this.includedPaths.has(match.item.path)) {
			el.addClass("set-list-song-picker-included");
		}
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
