import { describe, expect, it } from "vitest";
import type { CachedMetadata, LinkCache, TFile } from "obsidian";
import { getBandName, isSetListFile, parseSetList } from "../setlist/parser";

function link(linkText: string, line: number, displayText?: string): LinkCache {
	return {
		link: linkText,
		original: `[[${linkText}${displayText ? "|" + displayText : ""}]]`,
		displayText: displayText ?? linkText,
		position: {
			start: { line, col: 0, offset: 0 },
			end: { line, col: 0, offset: 0 },
		},
	} as LinkCache;
}

function fakeFile(path: string): TFile {
	return {
		path,
		basename: path.replace(/\.[^.]+$/, ""),
		extension: path.split(".").pop(),
	} as TFile;
}

describe("isSetListFile", () => {
	it("detects type: SetList frontmatter", () => {
		expect(isSetListFile({ frontmatter: { type: "SetList" } } as CachedMetadata)).toBe(true);
	});

	it("returns false for other or missing frontmatter", () => {
		expect(isSetListFile({ frontmatter: { type: "Song" } } as CachedMetadata)).toBe(false);
		expect(isSetListFile({} as CachedMetadata)).toBe(false);
		expect(isSetListFile(null)).toBe(false);
	});

	it("is tolerant of type casing and surrounding whitespace", () => {
		expect(isSetListFile({ frontmatter: { type: "setlist" } } as CachedMetadata)).toBe(true);
		expect(isSetListFile({ frontmatter: { type: "SETLIST" } } as CachedMetadata)).toBe(true);
		expect(isSetListFile({ frontmatter: { type: " SetList " } } as CachedMetadata)).toBe(true);
	});

	it("returns false for a non-string type value instead of throwing", () => {
		expect(isSetListFile({ frontmatter: { type: 42 } } as unknown as CachedMetadata)).toBe(false);
	});
});

describe("getBandName", () => {
	it("returns the trimmed band frontmatter value", () => {
		expect(getBandName({ frontmatter: { band: " The Rolling Stones " } } as CachedMetadata)).toBe(
			"The Rolling Stones"
		);
	});

	it("returns null for missing, empty, or non-string band values", () => {
		expect(getBandName({} as CachedMetadata)).toBeNull();
		expect(getBandName({ frontmatter: { band: "" } } as CachedMetadata)).toBeNull();
		expect(getBandName({ frontmatter: { band: "   " } } as CachedMetadata)).toBeNull();
		expect(getBandName({ frontmatter: { band: 42 } } as unknown as CachedMetadata)).toBeNull();
		expect(getBandName(null)).toBeNull();
	});
});

describe("parseSetList", () => {
	it("parses bare wikilinks interleaved with text and blank rows, in order", () => {
		const content = ["ACT 1", "[[Wow]]", "[[Moving]]", "", "ACT 2", "[[Cloudbusting]]"].join("\n");
		const cache = {
			links: [link("Wow", 1), link("Moving", 2), link("Cloudbusting", 5)],
		} as CachedMetadata;

		const parsed = parseSetList(content, cache, "Sets/Test.md", (lt) => fakeFile(`${lt}.md`));

		expect(parsed.entries.map((e) => e.type)).toEqual(["text", "song", "song", "text", "text", "song"]);
		expect(parsed.entries[1]).toMatchObject({ type: "song", linkText: "Wow", file: { path: "Wow.md" } });
	});

	it("preserves frontmatter as an untouched preamble and offsets link line numbers past it", () => {
		const content = ["---", "type: SetList", "---", "[[Wow]]"].join("\n");
		const cache = { links: [link("Wow", 3)] } as CachedMetadata;

		const parsed = parseSetList(content, cache, "Sets/Test.md", (lt) => fakeFile(`${lt}.md`));

		expect(parsed.preamble).toBe("---\ntype: SetList\n---\n");
		expect(parsed.entries).toHaveLength(1);
		expect(parsed.entries[0]).toMatchObject({ type: "song", linkText: "Wow" });
	});

	it("resolves aliased full-path links, keeping alias as displayText", () => {
		const content = "[[Songs/Superheroes/My Girl|My Girl]]";
		const cache = { links: [link("Songs/Superheroes/My Girl", 0, "My Girl")] } as CachedMetadata;

		const parsed = parseSetList(content, cache, "Sets/Test.md", (lt) => fakeFile(`${lt}.md`));

		expect(parsed.entries[0]).toMatchObject({
			type: "song",
			linkText: "Songs/Superheroes/My Girl",
			displayText: "My Girl",
		});
	});

	it("resolves .pdf-suffixed link targets like any other song row", () => {
		const content = "[[Enola Gay.pdf]]";
		const cache = { links: [link("Enola Gay.pdf", 0)] } as CachedMetadata;

		const parsed = parseSetList(content, cache, "Sets/Test.md", (lt) => fakeFile(lt));

		expect(parsed.entries[0]).toMatchObject({ type: "song", file: { extension: "pdf" } });
	});

	it("keeps unresolved song links as file: null instead of throwing", () => {
		const content = "[[Missing Song]]";
		const cache = { links: [link("Missing Song", 0)] } as CachedMetadata;

		const parsed = parseSetList(content, cache, "Sets/Test.md", () => null);

		expect(parsed.entries[0]).toMatchObject({ type: "song", file: null });
	});

	it("keeps the alias as displayText for an unresolved aliased link", () => {
		const content = "[[Missing Song|My Alias]]";
		const cache = { links: [link("Missing Song", 0, "My Alias")] } as CachedMetadata;

		const parsed = parseSetList(content, cache, "Sets/Test.md", () => null);

		expect(parsed.entries[0]).toMatchObject({ type: "song", file: null, displayText: "My Alias" });
	});

	it("treats every line as text when there is no link cache at all", () => {
		const content = "not a set list";
		const parsed = parseSetList(content, null, "Sets/Test.md", () => null);

		expect(parsed.entries).toEqual([{ type: "text", line: 0, raw: "not a set list" }]);
	});
});
