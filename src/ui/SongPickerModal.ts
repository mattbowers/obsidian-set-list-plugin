import { App, FuzzyMatch, FuzzySuggestModal, Setting, TFile, getAllTags } from "obsidian";
import { isSetListFile } from "../setlist/parser";

export class SongPickerModal extends FuzzySuggestModal<TFile> {
	private readonly includedPaths: ReadonlySet<string>;
	private readonly bandTag: string | null;
	private readonly onChoose: (file: TFile) => void;
	// On by default whenever there's a band to filter by; there's nothing to toggle otherwise.
	private filterByBand: boolean;

	constructor(app: App, includedPaths: ReadonlySet<string>, bandTag: string | null, onChoose: (file: TFile) => void) {
		super(app);
		this.includedPaths = includedPaths;
		this.bandTag = bandTag;
		this.filterByBand = bandTag !== null;
		this.onChoose = onChoose;
		this.setPlaceholder("Add a song to the set list…");
	}

	onOpen(): void {
		super.onOpen();

		const filterSetting = new Setting(this.modalEl)
			.setName(this.bandTag ? `Only show songs tagged "${this.bandTag}"` : "Only show songs tagged by band")
			.addToggle((toggle) =>
				toggle
					.setValue(this.filterByBand)
					.setDisabled(this.bandTag === null)
					.onChange((value) => {
						this.filterByBand = value;
						// FuzzySuggestModal re-runs getItems()/getSuggestions() on input events,
						// not on demand — nudge it without actually changing the search query.
						this.inputEl.dispatchEvent(new Event("input"));
					})
			);
		filterSetting.settingEl.addClass("set-list-song-picker-filter");
		this.resultContainerEl.before(filterSetting.settingEl);
	}

	getItems(): TFile[] {
		const files = this.app.vault
			.getFiles()
			.filter((file) => file.extension === "md" || file.extension === "pdf")
			.filter((file) => !isSetListFile(this.app.metadataCache.getFileCache(file)));
		if (!this.filterByBand || !this.bandTag) return files;

		const wanted = `#${this.bandTag}`.toLowerCase();
		return files.filter((file) => {
			const cache = this.app.metadataCache.getFileCache(file);
			const tags = cache ? getAllTags(cache) : null;
			return tags?.some((tag) => tag.toLowerCase() === wanted) ?? false;
		});
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
