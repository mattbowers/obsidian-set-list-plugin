import type { App, TFile } from "obsidian";
import { serializeSetList } from "./serializer";
import type { ParsedSetList } from "./types";

export async function persistSetList(app: App, file: TFile, parsed: ParsedSetList): Promise<void> {
	await app.vault.process(file, () => serializeSetList(parsed));
}
