import type { ParsedSetList } from "./types";

export function serializeSetList(parsed: ParsedSetList): string {
	const body = parsed.entries.map((entry) => entry.raw).join("\n");
	return parsed.preamble + body;
}
