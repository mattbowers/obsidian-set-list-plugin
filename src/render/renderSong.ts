import { App, Component, MarkdownRenderer, parseFrontMatterStringArray, TFile } from "obsidian";
import { renderPdf } from "./renderPdf";

export async function renderSong(
	app: App,
	component: Component,
	container: HTMLElement,
	file: TFile | null
): Promise<void> {
	container.empty();

	if (!file) {
		container.createDiv({ cls: "set-list-song-missing", text: "Song not found" });
		return;
	}

	if (file.extension === "md") {
		const target = container.createDiv({ cls: "markdown-rendered" });
		// A real MarkdownView applies a note's `cssclass(es)` frontmatter to its container
		// itself; rendering via MarkdownRenderer.render() directly (see CLAUDE.md) bypasses
		// that, so cssclasses-gated snippets (e.g. this vault's `.two-column pre` layout) would
		// silently do nothing in Stage view unless applied here too.
		const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
		const cssClasses = parseFrontMatterStringArray(frontmatter, /^cssclasses?$/i);
		if (cssClasses) target.addClasses(cssClasses);
		const content = await app.vault.cachedRead(file);
		await MarkdownRenderer.render(app, content, target, file.path, component);
	} else {
		const target = container.createDiv({ cls: "set-list-pdf-view" });
		await renderPdf(app, component, target, file);
	}
}
