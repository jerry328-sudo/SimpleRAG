// Minimal mock of the Obsidian API for testing
export class Plugin {}
export class PluginSettingTab {}
export class ItemView {}
export class Modal {
	app: unknown;
	contentEl = {
		empty() {},
		createEl() {
			return {
				addEventListener() {},
				addClass() {},
			};
		},
		createDiv() {
			return {
				createEl() {
					return {
						addEventListener() {},
						addClass() {},
					};
				},
			};
		},
	};
	constructor(app?: unknown) {
		this.app = app;
	}
	open() {}
	close() {}
}
export class Notice {}
export class Setting {
	setName() { return this; }
	setDesc() { return this; }
	addText(callback?: (component: any) => void) {
		callback?.({
			inputEl: { type: "text" },
			setPlaceholder() { return this; },
			setValue() { return this; },
			onChange() { return this; },
		});
		return this;
	}
	addToggle(callback?: (component: any) => void) {
		callback?.({
			setValue() { return this; },
			onChange() { return this; },
		});
		return this;
	}
	addButton(callback?: (component: any) => void) {
		callback?.({
			setButtonText() { return this; },
			setWarning() { return this; },
			onClick() { return this; },
		});
		return this;
	}
	addDropdown(callback?: (component: any) => void) {
		callback?.({
			addOption() { return this; },
			setValue() { return this; },
			onChange() { return this; },
		});
		return this;
	}
}

export function requestUrl(_options: unknown) {
	return Promise.resolve({ status: 200, json: {}, text: "" });
}

export function normalizePath(path: string) {
	const segments = path.replace(/\\/g, "/").split("/");
	const normalized: string[] = [];

	for (const segment of segments) {
		if (!segment || segment === ".") continue;
		if (segment === "..") {
			normalized.pop();
			continue;
		}
		normalized.push(segment);
	}

	return normalized.join("/");
}
