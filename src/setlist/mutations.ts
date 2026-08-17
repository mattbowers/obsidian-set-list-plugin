import type { ParsedSetList, SongEntry } from "./types";

export function addSong(parsed: ParsedSetList, entry: SongEntry, atIndex: number = parsed.entries.length): ParsedSetList {
	const entries = [...parsed.entries];
	entries.splice(atIndex, 0, entry);
	return { ...parsed, entries };
}

export function removeSong(parsed: ParsedSetList, index: number): ParsedSetList {
	const entries = [...parsed.entries];
	entries.splice(index, 1);
	return { ...parsed, entries };
}

export function reorder(parsed: ParsedSetList, fromIndex: number, toIndex: number): ParsedSetList {
	const entries = [...parsed.entries];
	const [moved] = entries.splice(fromIndex, 1);
	if (!moved) return parsed;
	entries.splice(toIndex, 0, moved);
	return { ...parsed, entries };
}
