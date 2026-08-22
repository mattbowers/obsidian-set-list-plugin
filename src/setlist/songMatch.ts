import { prepareFuzzySearch, type App, type TFile } from "obsidian";
import { isSetListFile } from "./parser";
import { normalizeForMatch } from "./textNormalize";

function candidateSongFiles(app: App): TFile[] {
	return app.vault
		.getFiles()
		.filter((file) => file.extension === "md" || file.extension === "pdf")
		.filter((file) => !isSetListFile(app.metadataCache.getFileCache(file)));
}

/** A candidate file paired with its normalized basename, computed once and reused across every
 *  query in a batch match rather than re-normalized per query. */
interface Candidate {
	file: TFile;
	normalizedBasename: string;
}

function matchAgainst(candidates: Candidate[], query: string): TFile | null {
	const normalizedQuery = normalizeForMatch(query);
	if (!normalizedQuery) return null;

	const exact = candidates.find((c) => c.normalizedBasename === normalizedQuery);
	if (exact) return exact.file;

	const search = prepareFuzzySearch(normalizedQuery);
	let best: { file: TFile; score: number } | null = null;
	for (const c of candidates) {
		const result = search(c.normalizedBasename);
		if (result && (!best || result.score > best.score)) {
			best = { file: c.file, score: result.score };
		}
	}
	return best?.file ?? null;
}

/**
 * Best-effort match of each line of text in `queries` (e.g. rows pasted from an external set
 * list) to a vault song file: an exact (case/punctuation-insensitive) basename match wins
 * outright, otherwise the best-scoring fuzzy match against basenames, if any matched at all —
 * null for a query nothing in the vault matches. The vault scan and per-candidate basename
 * normalization happen once up front and are reused for every query, rather than redone per
 * query as with a naive one-at-a-time match.
 */
export function findBestSongMatches(app: App, queries: string[]): (TFile | null)[] {
	const candidates = candidateSongFiles(app).map((file) => ({ file, normalizedBasename: normalizeForMatch(file.basename) }));
	return queries.map((query) => matchAgainst(candidates, query));
}
