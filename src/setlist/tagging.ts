import type { App, TFile } from "obsidian";
import type { ParsedSetList } from "./types";

/**
 * Slugifies an arbitrary string (e.g. a frontmatter property's value) into a valid Obsidian
 * tag: letters/numbers/underscore/hyphen/slash only, whitespace collapsed to hyphens.
 */
export function sanitizeTag(raw: string): string {
	return raw
		.trim()
		.replace(/\s+/g, "-")
		.replace(/[^\p{L}\p{N}_\-/]+/gu, "")
		.replace(/-{2,}/g, "-")
		.replace(/^-+|-+$/g, "");
}

function normalizeTags(tags: unknown): string[] {
	if (Array.isArray(tags)) return tags.filter((tag): tag is string => typeof tag === "string");
	if (typeof tags === "string") {
		return tags
			.split(",")
			.map((tag) => tag.trim())
			.filter((tag) => tag.length > 0);
	}
	return [];
}

/** Adds `tag` to every resolved song file in the set list, skipping any file that already has it (case-insensitively). */
export async function addTagToAllSongs(app: App, parsed: ParsedSetList, tag: string): Promise<void> {
	const songFiles = new Map<string, TFile>();
	for (const entry of parsed.entries) {
		if (entry.type === "song" && entry.file) {
			songFiles.set(entry.file.path, entry.file);
		}
	}

	await Promise.all(
		Array.from(songFiles.values()).map((file) =>
			app.fileManager.processFrontMatter(file, (frontmatter) => {
				const tags = normalizeTags(frontmatter.tags);
				if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
				frontmatter.tags = [...tags, tag];
			})
		)
	);
}
