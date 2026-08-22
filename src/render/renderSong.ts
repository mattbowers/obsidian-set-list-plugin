import { App, Component, MarkdownRenderer, TFile } from "obsidian";
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
		container.createDiv({ cls: "set-list-song-title", text: file.basename });
		const target = container.createDiv({ cls: "markdown-rendered" });
		const content = await app.vault.cachedRead(file);
		await MarkdownRenderer.render(app, content, target, file.path, component);
	} else {
		const target = container.createDiv({ cls: "set-list-pdf-view" });
		await renderPdf(app, component, target, file);
	}
}
