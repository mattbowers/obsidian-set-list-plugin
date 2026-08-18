import { App, FuzzyMatch, FuzzySuggestModal, Setting, TFile, getAllTags } from "obsidian";
import { isSetListFile } from "../setlist/parser";

export class SongPickerModal extends FuzzySuggestModal<TFile> {
	// Not readonly: growing this as songs are picked, within this same modal session, is what
	// makes each freshly-added song show up dimmed if it reappears in the (cleared) results.
	private readonly includedPaths: Set<string>;
	private readonly bandTag: string | null;
	// Add flow: stay open after a pick, so several songs can be added in quick succession.
	// Replace flow: there's only one slot to fill, so close as soon as a song is chosen.
	private readonly closeOnChoose: boolean;
	private readonly onChoose: (file: TFile) => void;
	// On by default whenever there's a band to filter by; there's nothing to toggle otherwise.
	private filterByBand: boolean;

	constructor(
		app: App,
		includedPaths: ReadonlySet<string>,
		bandTag: string | null,
		closeOnChoose: boolean,
		onChoose: (file: TFile) => void
	) {
		super(app);
		this.includedPaths = new Set(includedPaths);
		this.bandTag = bandTag;
		this.closeOnChoose = closeOnChoose;
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

	onChooseItem(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.includedPaths.add(file.path);
		this.onChoose(file);
	}

	/**
	 * Overridden (rather than just implementing onChooseItem) because SuggestModal's own
	 * selectSuggestion — the actual Enter/click entry point — closes the modal right after
	 * calling onChooseSuggestion. For the add flow this should instead clear/refocus and stay
	 * open, so several songs can be picked in quick succession; the modal's own close button
	 * (top-right) is how the user leaves when done. The replace flow still closes immediately,
	 * since there's only one slot to fill.
	 */
	selectSuggestion(value: FuzzyMatch<TFile>, evt: MouseEvent | KeyboardEvent): void {
		this.onChooseItem(value.item, evt);
		if (this.closeOnChoose) {
			this.close();
			return;
		}
		this.inputEl.value = "";
		this.inputEl.dispatchEvent(new Event("input"));
		this.inputEl.focus();
	}
}
