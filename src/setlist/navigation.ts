import type { ParsedSetList } from "./types";

export function findFirstSongIndex(parsed: ParsedSetList): number | null {
	return findNextSongIndex(parsed, -1);
}

export function findNextSongIndex(parsed: ParsedSetList, fromIndex: number): number | null {
	for (let i = fromIndex + 1; i < parsed.entries.length; i++) {
		if (parsed.entries[i].type === "song") return i;
	}
	return null;
}

export function findPrevSongIndex(parsed: ParsedSetList, fromIndex: number): number | null {
	for (let i = fromIndex - 1; i >= 0; i--) {
		if (parsed.entries[i].type === "song") return i;
	}
	return null;
}
