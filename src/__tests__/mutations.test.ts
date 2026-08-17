import { describe, expect, it } from "vitest";
import { addSong, removeSong, reorder } from "../setlist/mutations";
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

describe("addSong", () => {
	it("appends to the end by default", () => {
		const parsed = setListOf(song("Wow"), song("Moving"));
		const result = addSong(parsed, song("Cloudbusting"));
		expect(result.entries.map((e) => e.raw)).toEqual(["[[Wow]]", "[[Moving]]", "[[Cloudbusting]]"]);
	});

	it("inserts at a given index without disturbing other rows", () => {
		const parsed = setListOf(text("ACT 1"), song("Wow"), song("Moving"));
		const result = addSong(parsed, song("Sunset"), 2);
		expect(result.entries.map((e) => e.raw)).toEqual(["ACT 1", "[[Wow]]", "[[Sunset]]", "[[Moving]]"]);
	});

	it("does not mutate the input", () => {
		const parsed = setListOf(song("Wow"));
		addSong(parsed, song("Moving"));
		expect(parsed.entries).toHaveLength(1);
	});
});

describe("removeSong", () => {
	it("removes only the entry at the given index, preserving text rows", () => {
		const parsed = setListOf(text("ACT 1"), song("Wow"), song("Moving"));
		const result = removeSong(parsed, 1);
		expect(result.entries.map((e) => e.raw)).toEqual(["ACT 1", "[[Moving]]"]);
	});
});

describe("reorder", () => {
	it("moves an entry from one index to another", () => {
		const parsed = setListOf(song("Wow"), song("Moving"), song("Cloudbusting"));
		const result = reorder(parsed, 0, 2);
		expect(result.entries.map((e) => e.raw)).toEqual(["[[Moving]]", "[[Cloudbusting]]", "[[Wow]]"]);
	});

	it("is a no-op when the source index is out of range", () => {
		const parsed = setListOf(song("Wow"), song("Moving"));
		const result = reorder(parsed, 5, 0);
		expect(result).toBe(parsed);
	});
});
