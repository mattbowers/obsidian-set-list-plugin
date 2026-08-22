import { App, DropdownComponent, PluginSettingTab, Setting, TextComponent } from "obsidian";
import type SetListPlugin from "../main";

export class SetListSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: SetListPlugin
	) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Send song title over MIDI")
			.setDesc("Send a MIDI SysEx message with the song title whenever Stage view shows a new song")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.midiOutputEnabled).onChange(async (value) => {
					this.plugin.settings.midiOutputEnabled = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("MIDI output device")
			.setDesc("Which MIDI output device receives the song title SysEx message")
			.addDropdown((dropdown) =>
				void this.populateDeviceDropdown(dropdown, {
					loadDevices: () => this.plugin.midi.getAvailableOutputs(),
					selectedValue: this.plugin.settings.midiOutputDeviceId,
					onChange: async (value) => {
						this.plugin.settings.midiOutputDeviceId = value;
						await this.plugin.saveSettings();
					},
				})
			);

		new Setting(containerEl)
			.setName("Turn PDF pages over MIDI")
			.setDesc("Listen for MIDI Control Change messages (a common foot-pedal mapping) to page a PDF song back/forward in Stage view")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.midiInputEnabled).onChange(async (value) => {
					this.plugin.settings.midiInputEnabled = value;
					await this.plugin.saveSettings();
					await this.plugin.midiInput.refresh();
				})
			);

		new Setting(containerEl)
			.setName("MIDI input device")
			.setDesc("Which MIDI input device sends the page-turn Control Change messages")
			.addDropdown((dropdown) =>
				void this.populateDeviceDropdown(dropdown, {
					loadDevices: () => this.plugin.midiInput.getAvailableInputs(),
					selectedValue: this.plugin.settings.midiInputDeviceId,
					onChange: async (value) => {
						this.plugin.settings.midiInputDeviceId = value;
						await this.plugin.saveSettings();
						await this.plugin.midiInput.refresh();
					},
				})
			);

		new Setting(containerEl)
			.setName("Page up Control Change number")
			.setDesc("Controller number (0-127) that pages a PDF song back")
			.addText((text) =>
				this.bindControlChangeNumberInput(text, this.plugin.settings.pageUpControlChange, async (value) => {
					this.plugin.settings.pageUpControlChange = value;
					await this.plugin.saveSettings();
				})
			);

		new Setting(containerEl)
			.setName("Page down Control Change number")
			.setDesc("Controller number (0-127) that pages a PDF song forward")
			.addText((text) =>
				this.bindControlChangeNumberInput(text, this.plugin.settings.pageDownControlChange, async (value) => {
					this.plugin.settings.pageDownControlChange = value;
					await this.plugin.saveSettings();
				})
			);
	}

	/** A plain number input (Setting has no dedicated bounded-integer component) clamped to a
	 *  valid MIDI controller number — out-of-range or non-numeric input is silently clamped/ignored
	 *  rather than rejected outright, so a mid-edit value (e.g. a blank field while retyping)
	 *  doesn't flash an error. */
	private bindControlChangeNumberInput(text: TextComponent, initialValue: number, onChange: (value: number) => Promise<void>): void {
		text.inputEl.type = "number";
		text.inputEl.min = "0";
		text.inputEl.max = "127";
		text.setValue(String(initialValue));
		text.onChange((raw) => {
			const parsed = Number(raw);
			if (!Number.isFinite(parsed)) return;
			void onChange(Math.min(127, Math.max(0, Math.round(parsed))));
		});
	}

	private async populateDeviceDropdown(
		dropdown: DropdownComponent,
		{
			loadDevices,
			selectedValue,
			onChange,
		}: {
			loadDevices: () => Promise<Array<MIDIInput | MIDIOutput>>;
			selectedValue: string;
			onChange: (value: string) => Promise<void>;
		}
	): Promise<void> {
		const emptyLabel = "No MIDI devices available";
		try {
			const devices = await loadDevices();
			if (devices.length === 0) {
				dropdown.addOption("", emptyLabel);
				dropdown.setDisabled(true);
				return;
			}

			for (const device of devices) {
				dropdown.addOption(device.id, device.name || "Unknown device");
			}

			const resolvedValue = devices.some((device) => device.id === selectedValue) ? selectedValue : devices[0].id;
			dropdown.setValue(resolvedValue);
			dropdown.onChange((value) => void onChange(value));
		} catch (error) {
			console.error("[SetList] Failed to get MIDI devices:", error);
			dropdown.addOption("", emptyLabel);
			dropdown.setDisabled(true);
		}
	}
}
