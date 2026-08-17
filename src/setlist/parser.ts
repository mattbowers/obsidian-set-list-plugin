import type { CachedMetadata, LinkCache, TFile } from "obsidian";
import type { ParsedSetList, SetListEntry } from "./types";

export const SET_LIST_FRONTMATTER_TYPE = "SetList";

export type ResolveLink = (linktext: string, sourcePath: string) => TFile | null;

export function isSetListFile(cache: CachedMetadata | null): boolean {
	const type = cache?.frontmatter?.type;
	if (typeof type !== "string") return false;
	return type.trim().toLowerCase() === SET_LIST_FRONTMATTER_TYPE.toLowerCase();
}

export function parseSetList(
	content: string,
	cache: CachedMetadata | null,
	sourcePath: string,
	resolveLink: ResolveLink
): ParsedSetList {
	const { preamble, body, frontmatterLineCount } = splitFrontmatter(content);

	const linksByLine = new Map<number, LinkCache>();
	for (const link of cache?.links ?? []) {
		linksByLine.set(link.position.start.line, link);
	}

	const entries: SetListEntry[] = body.split("\n").map((raw, i) => {
		const line = frontmatterLineCount + i;
		const link = linksByLine.get(line);
		if (link) {
			return {
				type: "song",
				line,
				raw,
				linkText: link.link,
				displayText: link.displayText ?? link.link,
				file: resolveLink(link.link, sourcePath),
			};
		}
		return { type: "text", line, raw };
	});

	return { preamble, entries };
}

function splitFrontmatter(content: string): {
	preamble: string;
	body: string;
	frontmatterLineCount: number;
} {
	const lines = content.split("\n");
	if (lines[0] !== "---") {
		return { preamble: "", body: content, frontmatterLineCount: 0 };
	}

	for (let i = 1; i < lines.length; i++) {
		if (lines[i] === "---") {
			const frontmatterLineCount = i + 1;
			const preambleLines = lines.slice(0, frontmatterLineCount);
			const bodyLines = lines.slice(frontmatterLineCount);
			return {
				preamble: bodyLines.length > 0 ? preambleLines.join("\n") + "\n" : preambleLines.join("\n"),
				body: bodyLines.join("\n"),
				frontmatterLineCount,
			};
		}
	}

	return { preamble: "", body: content, frontmatterLineCount: 0 };
}
