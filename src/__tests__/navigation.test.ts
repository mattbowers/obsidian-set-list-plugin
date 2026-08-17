import { describe, expect, it } from "vitest";
import { findFirstSongIndex, findNextSongIndex, findPrevSongIndex } from "../setlist/navigation";
import type { ParsedSetList, SongEntry, TextEntry } from "../setlist/types";

function song(displayText: string): SongEntry {
	return { type: "song", line: -1, raw: `[[${displayText}]]`, linkText: displayText, displayText, file: null };
}

function text(raw: string): TextEntry {
	return { type: "text", line: -1, raw };
}

function setListOf(...entries: ParsedSetList["entries"]): ParsedSetList {
	return { preamble: "", entries };
}

describe("findFirstSongIndex", () => {
	it("skips leading text rows to find the first song", () => {
		const parsed = setListOf(text("ACT 1"), text(""), song("Wow"), song("Moving"));
		expect(findFirstSongIndex(parsed)).toBe(2);
	});

	it("returns null when there are no songs", () => {
		expect(findFirstSongIndex(setListOf(text("ACT 1"), text("")))).toBeNull();
	});
});

describe("findNextSongIndex", () => {
	it("skips interleaved text rows to find the next song", () => {
		const parsed = setListOf(song("Wow"), text("ACT 2"), text(""), song("Moving"));
		expect(findNextSongIndex(parsed, 0)).toBe(3);
	});

	it("returns null past the last song", () => {
		const parsed = setListOf(song("Wow"), text("ENCORE"));
		expect(findNextSongIndex(parsed, 0)).toBeNull();
	});
});

describe("findPrevSongIndex", () => {
	it("skips interleaved text rows to find the previous song", () => {
		const parsed = setListOf(song("Wow"), text("ACT 2"), text(""), song("Moving"));
		expect(findPrevSongIndex(parsed, 3)).toBe(0);
	});

	it("returns null before the first song", () => {
		const parsed = setListOf(text("ACT 1"), song("Wow"));
		expect(findPrevSongIndex(parsed, 1)).toBeNull();
	});
});
