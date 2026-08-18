import { prepareFuzzySearch, type App, type TFile } from "obsidian";
import { isSetListFile } from "./parser";
import { normalizeForMatch } from "./textNormalize";

function candidateSongFiles(app: App): TFile[] {
	return app.vault
		.getFiles()
		.filter((file) => file.extension === "md" || file.extension === "pdf")
		.filter((file) => !isSetListFile(app.metadataCache.getFileCache(file)));
}

/**
 * Best-effort match of an arbitrary line of text (e.g. a row pasted from an external set list)
 * to a vault song file: an exact (case/punctuation-insensitive) basename match wins outright,
 * otherwise the best-scoring fuzzy match against basenames, if any matched at all. Returns null
 * rather than a weak guess when nothing in the vault matches.
 */
export function findBestSongMatch(app: App, query: string): TFile | null {
	const normalizedQuery = normalizeForMatch(query);
	if (!normalizedQuery) return null;

	const candidates = candidateSongFiles(app);

	const exact = candidates.find((file) => normalizeForMatch(file.basename) === normalizedQuery);
	if (exact) return exact;

	const search = prepareFuzzySearch(normalizedQuery);
	let best: { file: TFile; score: number } | null = null;
	for (const file of candidates) {
		const result = search(normalizeForMatch(file.basename));
		if (result && (!best || result.score > best.score)) {
			best = { file, score: result.score };
		}
	}
	return best?.file ?? null;
}
