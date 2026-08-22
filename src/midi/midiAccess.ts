/** Requests Web MIDI access lazily (only once a caller actually asks for devices or messages)
 *  and caches it for the plugin's lifetime — shared by `MidiOutputController` and
 *  `MidiInputController` so the browser's one-time permission prompt fires at most once and both
 *  see the same device list. */
export class MidiAccessProvider {
	private access: MIDIAccess | null = null;

	async request(): Promise<MIDIAccess | null> {
		if (this.access) return this.access;
		if (!navigator.requestMIDIAccess) {
			console.error("[SetList] Web MIDI API not supported in this browser");
			return null;
		}
		try {
			this.access = await navigator.requestMIDIAccess({ sysex: true });
			return this.access;
		} catch (error) {
			console.error("[SetList] Failed to access MIDI devices:", error);
			return null;
		}
	}
}
