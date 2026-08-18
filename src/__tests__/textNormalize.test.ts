import { describe, expect, it } from "vitest";
import { normalizeForMatch } from "../setlist/textNormalize";

describe("normalizeForMatch", () => {
	it("lowercases and trims", () => {
		expect(normalizeForMatch("  Wow  ")).toBe("wow");
	});

	it("strips apostrophes without leaving a gap", () => {
		expect(normalizeForMatch("Don't Stop Believin'")).toBe("dont stop believin");
	});

	it("strips brackets and their contents' punctuation, collapsing whitespace", () => {
		expect(normalizeForMatch("Enola Gay (Live)")).toBe("enola gay live");
	});

	it("spells out an ampersand as 'and'", () => {
		expect(normalizeForMatch("Rock & Roll")).toBe("rock and roll");
	});

	it("treats an already-spelled-out title the same as its symbol form", () => {
		expect(normalizeForMatch("Rock & Roll")).toBe(normalizeForMatch("Rock and Roll"));
	});
});
