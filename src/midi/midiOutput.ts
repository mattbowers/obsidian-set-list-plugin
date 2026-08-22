import type { MidiAccessProvider } from "./midiAccess";
import { buildSongTitleSysEx } from "./sysex";

export interface MidiOutputSettings {
	midiOutputEnabled: boolean;
	midiOutputDeviceId: string;
}

export class MidiOutputController {
	constructor(
		private readonly access: MidiAccessProvider,
		private readonly settings: MidiOutputSettings,
		private readonly persistSettings: () => Promise<void>
	) {}

	async getAvailableOutputs(): Promise<MIDIOutput[]> {
		const access = await this.access.request();
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
