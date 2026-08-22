import type { MidiAccessProvider } from "./midiAccess";

export interface MidiInputSettings {
	midiInputEnabled: boolean;
	midiInputDeviceId: string;
	pageUpControlChange: number;
	pageDownControlChange: number;
}

// Defaults match a common foot-pedal Control Change mapping (e.g. AirTurn/PageFlip-style pedals
// default to these), matching keyboard PgUp/PgDn convention: 14 goes back, 15 goes forward.
// User-configurable in settings since not every pedal/controller uses this mapping.
export const DEFAULT_PAGE_UP_CONTROL_CHANGE = 14;
export const DEFAULT_PAGE_DOWN_CONTROL_CHANGE = 15;

/** Listens for MIDI Control Change messages on the configured input device and turns the
 *  configured page-up/page-down controller numbers into page-turn callbacks, for hands-free
 *  paging through a PDF song in Stage view. */
export class MidiInputController {
	private input: MIDIInput | null = null;

	constructor(
		private readonly access: MidiAccessProvider,
		private readonly settings: MidiInputSettings,
		private readonly persistSettings: () => Promise<void>,
		private readonly onPageUp: () => void,
		private readonly onPageDown: () => void
	) {}

	async getAvailableInputs(): Promise<MIDIInput[]> {
		const access = await this.access.request();
		if (!access) return [];
		const inputs: MIDIInput[] = [];
		access.inputs.forEach((input) => inputs.push(input));
		return inputs;
	}

	/** Re-entrant: detaches from whatever input it was previously listening to before attaching
	 *  to the (possibly newly) configured one, so it's safe to call again after a settings
	 *  change. A no-op, left detached, when input is disabled or no input devices are available. */
	async refresh(): Promise<void> {
		this.detach();
		if (!this.settings.midiInputEnabled) return;

		const inputs = await this.getAvailableInputs();
		if (inputs.length === 0) return;

		const selected = inputs.find((input) => input.id === this.settings.midiInputDeviceId) ?? inputs[0];
		if (this.settings.midiInputDeviceId !== selected.id) {
			this.settings.midiInputDeviceId = selected.id;
			await this.persistSettings();
		}

		this.input = selected;
		this.input.onmidimessage = (message) => this.handleMessage(message);
	}

	detach(): void {
		if (!this.input) return;
		this.input.onmidimessage = null;
		this.input = null;
	}

	private handleMessage(message: MIDIMessageEvent): void {
		const data = message.data;
		if (!data || data.length < 2) return;

		const [status, controller, value = 0] = data;
		if ((status & 0xf0) !== 0xb0) return; // not a Control Change message
		if (value === 0) return; // ignore a pedal's "released" message, momentary pedals send both

		if (controller === this.settings.pageUpControlChange) {
			this.onPageUp();
		} else if (controller === this.settings.pageDownControlChange) {
			this.onPageDown();
		}
	}
}
