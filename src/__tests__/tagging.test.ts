import { describe, expect, it } from "vitest";
import { sanitizeTag } from "../setlist/tagging";

describe("sanitizeTag", () => {
	it("collapses whitespace to hyphens", () => {
		expect(sanitizeTag("The Rolling Stones")).toBe("The-Rolling-Stones");
	});

	it("trims leading and trailing whitespace", () => {
		expect(sanitizeTag("  Wow  ")).toBe("Wow");
	});

	it("strips characters not valid in an Obsidian tag", () => {
		expect(sanitizeTag("Foo & Bar!")).toBe("Foo-Bar");
	});

	it("preserves existing hyphens, underscores, and slashes", () => {
		expect(sanitizeTag("post-punk_revival/uk")).toBe("post-punk_revival/uk");
	});
});
