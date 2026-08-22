import { buildSongTitleSysEx } from "./sysex";

export interface MidiOutputSettings {
	midiOutputEnabled: boolean;
	midiOutputDeviceId: string;
}

/** Requests Web MIDI access lazily (only once a caller actually asks for outputs or sends a
 *  message) and caches it for the plugin's lifetime — `navigator.requestMIDIAccess` triggers a
 *  one-time browser permission prompt, so this avoids firing it just because the plugin loaded. */
export class MidiOutputController {
	private midiAccess: MIDIAccess | null = null;

	constructor(
		private readonly settings: MidiOutputSettings,
		private readonly persistSettings: () => Promise<void>
	) {}

	private async requestMidiAccess(): Promise<MIDIAccess | null> {
		if (this.midiAccess) return this.midiAccess;
		if (!navigator.requestMIDIAccess) {
			console.error("[SetList] Web MIDI API not supported in this browser");
			return null;
		}
		try {
			this.midiAccess = await navigator.requestMIDIAccess({ sysex: true });
			return this.midiAccess;
		} catch (error) {
			console.error("[SetList] Failed to access MIDI devices:", error);
			return null;
		}
	}

	async getAvailableOutputs(): Promise<MIDIOutput[]> {
		const access = await this.requestMidiAccess();
		if (!access) return [];
		const outputs: MIDIOutput[] = [];
		access.outputs.forEach((output) => outputs.push(output));
		return outputs;
	}

	/** No-op when output is disabled in settings, no output devices are available, or the
	 *  configured device id is stale — callers don't need to check availability themselves. */
	async sendSongTitle(songTitle: string): Promise<void> {
		if (!this.settings.midiOutputEnabled) return;

		const outputs = await this.getAvailableOutputs();
		if (outputs.length === 0) return;

		const selected = outputs.find((output) => output.id === this.settings.midiOutputDeviceId) ?? outputs[0];
		if (this.settings.midiOutputDeviceId !== selected.id) {
			this.settings.midiOutputDeviceId = selected.id;
			await this.persistSettings();
		}

		selected.send(Array.from(buildSongTitleSysEx(songTitle)));
	}
}
