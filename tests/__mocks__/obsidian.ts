// Minimal mock of the Obsidian API for testing
export class Plugin {}
export class PluginSettingTab {}
export class ItemView {}
export class Modal {}
export class Notice {}
export class Setting {
	setName() { return this; }
	setDesc() { return this; }
	addText() { return this; }
	addToggle() { return this; }
	addButton() { return this; }
}

export function requestUrl(_options: unknown) {
	return Promise.resolve({ status: 200, json: {}, text: "" });
}
