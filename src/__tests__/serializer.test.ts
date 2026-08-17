import { describe, expect, it } from "vitest";
import type { CachedMetadata, LinkCache } from "obsidian";
import { parseSetList } from "../setlist/parser";
import { serializeSetList } from "../setlist/serializer";
import type { ParsedSetList } from "../setlist/types";

function link(linkText: string, line: number): LinkCache {
	return {
		link: linkText,
		original: `[[${linkText}]]`,
		displayText: linkText,
		position: { start: { line, col: 0, offset: 0 }, end: { line, col: 0, offset: 0 } },
	} as LinkCache;
}

describe("serializeSetList", () => {
	it("reconstructs a manually built ParsedSetList verbatim", () => {
		const parsed: ParsedSetList = {
			preamble: "---\ntype: SetList\n---\n",
			entries: [
				{ type: "text", line: 3, raw: "ACT 1" },
				{ type: "song", line: 4, raw: "[[Wow]]", linkText: "Wow", displayText: "Wow", file: null },
			],
		};

		expect(serializeSetList(parsed)).toBe("---\ntype: SetList\n---\nACT 1\n[[Wow]]");
	});

	const roundTripCases: Record<string, string> = {
		"no frontmatter, interleaved rows": ["ACT 1", "[[Wow]]", "[[Moving]]", "", "ENCORE", "[[Cloudbusting]]"].join(
			"\n"
		),
		"with frontmatter": ["---", "type: SetList", "---", "[[Wow]]", "[[Moving]]"].join("\n"),
		"frontmatter only, no body": ["---", "type: SetList", "---"].join("\n"),
		"blank file": "",
		"trailing blank lines preserved": ["[[Wow]]", "", ""].join("\n"),
		"leading blank lines preserved": ["", "", "[[Wow]]"].join("\n"),
	};

	for (const [name, content] of Object.entries(roundTripCases)) {
		it(`round-trips: ${name}`, () => {
			const cache = {
				links: content
					.split("\n")
					.map((raw, i) => (raw.startsWith("[[") ? { line: i, text: raw.slice(2, -2) } : null))
					.filter((l): l is { line: number; text: string } => l !== null)
					.map(({ line, text }) => link(text, line)),
			} as CachedMetadata;

			const parsed = parseSetList(content, cache, "Sets/Test.md", () => null);

			expect(serializeSetList(parsed)).toBe(content);
		});
	}
});
