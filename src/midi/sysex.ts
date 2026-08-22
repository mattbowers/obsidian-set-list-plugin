// A song title carried as a MIDI SysEx message so an external controller/rig can display which
// song is now showing in Stage view. Ported from the obsidian-midi-song-select plugin, which
// listens for this exact message shape on its input side.
export function encodeSongTitleAsAscii(songTitle: string): number[] {
	return Array.from(songTitle.trim().toUpperCase(), (character) => {
		const codePoint = character.charCodeAt(0);
		return codePoint <= 0x7f ? codePoint : 0x3f;
	});
}

export function buildSongTitleSysEx(songTitle: string): Uint8Array {
	return Uint8Array.from([0xf0, ...encodeSongTitleAsAscii(songTitle), 0xf7]);
}
