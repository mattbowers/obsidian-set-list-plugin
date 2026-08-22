import { describe, expect, it } from "vitest";
import { buildSongTitleSysEx, encodeSongTitleAsAscii } from "../midi/sysex";

describe("encodeSongTitleAsAscii", () => {
	it("uppercases and trims", () => {
		expect(encodeSongTitleAsAscii("  Wow  ")).toEqual([87, 79, 87]);
	});

	it("replaces non-ASCII characters with '?'", () => {
		expect(encodeSongTitleAsAscii("Café")).toEqual([67, 65, 70, 0x3f]);
	});
});

describe("buildSongTitleSysEx", () => {
	it("wraps the encoded title in a SysEx start/end byte", () => {
		expect(buildSongTitleSysEx("Go")).toEqual(Uint8Array.from([0xf0, 71, 79, 0xf7]));
	});

	it("produces an empty payload for a blank title", () => {
		expect(buildSongTitleSysEx("   ")).toEqual(Uint8Array.from([0xf0, 0xf7]));
	});
});
