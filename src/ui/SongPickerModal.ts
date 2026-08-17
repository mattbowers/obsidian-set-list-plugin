import { App, FuzzySuggestModal, TFile } from "obsidian";

export class SongPickerModal extends FuzzySuggestModal<TFile> {
	private readonly onChoose: (file: TFile) => void;

	constructor(app: App, onChoose: (file: TFile) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("Add a song to the set list…");
	}

	getItems(): TFile[] {
		return this.app.vault.getFiles().filter((file) => file.extension === "md" || file.extension === "pdf");
	}

	getItemText(file: TFile): string {
		return file.basename;
	}

	onChooseItem(file: TFile): void {
		this.onChoose(file);
	}
}
