import { App, Component, MarkdownRenderer, TFile } from "obsidian";

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
	}

	const target = container.createDiv({ cls: "markdown-rendered" });

	if (file.extension === "md") {
		const content = await app.vault.cachedRead(file);
		await MarkdownRenderer.render(app, content, target, file.path, component);
	} else {
		await MarkdownRenderer.render(app, `![[${file.path}]]`, target, file.path, component);
	}
}
