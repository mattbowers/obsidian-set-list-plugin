import { CachedMetadata, FileView, TFile, WorkspaceLeaf } from "obsidian";
import { parseSetList } from "../setlist/parser";
import type { ParsedSetList } from "../setlist/types";
import type SetListPlugin from "../main";

export abstract class BaseSetListView extends FileView {
	plugin: SetListPlugin;
	parsed: ParsedSetList = { preamble: "", entries: [] };

	constructor(leaf: WorkspaceLeaf, plugin: SetListPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	async onOpen(): Promise<void> {
		this.registerEvent(
			this.app.metadataCache.on("changed", (file, data, cache) => {
				if (file.path === this.file?.path) {
					this.applyParsed(data, cache);
				}
			})
		);
	}

	async onLoadFile(file: TFile): Promise<void> {
		await this.reload();
	}

	protected async reload(): Promise<void> {
		if (!this.file) return;

		const content = await this.app.vault.cachedRead(this.file);
		const cache = this.app.metadataCache.getFileCache(this.file);
		this.applyParsed(content, cache);
	}

	private applyParsed(content: string, cache: CachedMetadata | null): void {
		if (!this.file) return;

		this.parsed = parseSetList(content, cache, this.file.path, (linktext, sourcePath) =>
			this.app.metadataCache.getFirstLinkpathDest(linktext, sourcePath)
		);
		this.render();
	}

	protected abstract render(): void;
}
