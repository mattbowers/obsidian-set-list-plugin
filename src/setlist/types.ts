import type { TFile } from "obsidian";

export interface SongEntry {
	readonly type: "song";
	readonly line: number;
	readonly raw: string;
	readonly linkText: string;
	readonly displayText: string;
	readonly file: TFile | null;
}

export interface TextEntry {
	readonly type: "text";
	readonly line: number;
	readonly raw: string;
}

export type SetListEntry = SongEntry | TextEntry;

export interface ParsedSetList {
	readonly preamble: string;
	readonly entries: SetListEntry[];
}
