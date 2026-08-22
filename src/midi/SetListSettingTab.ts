import { App, DropdownComponent, PluginSettingTab, Setting } from "obsidian";
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
			.addDropdown((dropdown) => void this.populateOutputDropdown(dropdown));
	}

	private async populateOutputDropdown(dropdown: DropdownComponent): Promise<void> {
		const emptyLabel = "No MIDI outputs available";
		try {
			const outputs = await this.plugin.midi.getAvailableOutputs();
			if (outputs.length === 0) {
				dropdown.addOption("", emptyLabel);
				dropdown.setDisabled(true);
				return;
			}

			for (const output of outputs) {
				dropdown.addOption(output.id, output.name || "Unknown device");
			}

			const selectedValue = this.plugin.settings.midiOutputDeviceId;
			const resolvedValue = outputs.some((output) => output.id === selectedValue) ? selectedValue : outputs[0].id;
			dropdown.setValue(resolvedValue);
			dropdown.onChange(async (value) => {
				this.plugin.settings.midiOutputDeviceId = value;
				await this.plugin.saveSettings();
			});
		} catch (error) {
			console.error("[SetList] Failed to get MIDI output devices:", error);
			dropdown.addOption("", emptyLabel);
			dropdown.setDisabled(true);
		}
	}
}
