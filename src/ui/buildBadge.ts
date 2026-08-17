import type { Plugin } from "obsidian";

declare const __BUILD_TIME__: string;

export function renderBuildBadge(container: HTMLElement, plugin: Plugin): void {
	const builtAt = new Date(__BUILD_TIME__).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
	container.createDiv({
		cls: "set-list-build-badge",
		text: `v${plugin.manifest.version} · built ${builtAt}`,
	});
}
