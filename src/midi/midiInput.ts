import type { MidiAccessProvider } from "./midiAccess";

export interface MidiInputSettings {
	midiInputEnabled: boolean;
	midiInputDeviceId: string;
}

// A common foot-pedal Control Change mapping (e.g. AirTurn/PageFlip-style pedals default to
// these), matching keyboard PgUp/PgDn convention: 14 goes back, 15 goes forward.
const PAGE_UP_CONTROL_CHANGE = 14;
const PAGE_DOWN_CONTROL_CHANGE = 15;

/** Listens for MIDI Control Change messages on the configured input device and turns CC14/CC15
 *  into page-turn callbacks, for hands-free paging through a PDF song in Stage view. */
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

		if (controller === PAGE_UP_CONTROL_CHANGE) {
			this.onPageUp();
		} else if (controller === PAGE_DOWN_CONTROL_CHANGE) {
			this.onPageDown();
		}
	}
}
