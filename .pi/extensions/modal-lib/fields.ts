/**
 * Modal Dialog Library — Field Implementations
 *
 * Each field type implements the ModalField interface for rendering,
 * input handling, and value management.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key, truncateToWidth, CURSOR_MARKER } from "@mariozechner/pi-tui";
import type {
	ModalField,
	TextFieldConfig,
	SelectFieldConfig,
	CheckboxGroupConfig,
	RadioGroupConfig,
	ToggleConfig,
	SeparatorConfig,
	NormalizedOption,
} from "./types.ts";
import { normalizeOptions } from "./types.ts";

// ─── TextField ───────────────────────────────────────────────────────────────

export class TextFieldImpl implements ModalField {
	id: string;
	focusable = true;
	private text: string;
	private cursor: number;
	private placeholder: string;
	private label: string;

	constructor(config: TextFieldConfig) {
		this.id = config.id;
		this.label = config.label;
		this.text = config.value ?? "";
		this.cursor = this.text.length;
		this.placeholder = config.placeholder ?? "";
	}

	render(width: number, focused: boolean, theme: Theme): string[] {
		const lines: string[] = [];
		const innerW = width - 4; // 2 for border, 2 for padding

		// Label
		lines.push(truncateToWidth(`  ${theme.fg(focused ? "accent" : "muted", this.label + ":")}`, width));

		// Input line
		let display: string;
		if (this.text.length === 0 && !focused) {
			display = theme.fg("dim", this.placeholder);
		} else if (focused) {
			const before = this.text.slice(0, this.cursor);
			const cursorChar = this.cursor < this.text.length ? this.text[this.cursor]! : " ";
			const after = this.text.slice(this.cursor + 1);
			display = `${before}${CURSOR_MARKER}\x1b[7m${cursorChar}\x1b[27m${after}`;
			if (this.text.length === 0) {
				// Show placeholder dimly behind cursor
				display = `${CURSOR_MARKER}\x1b[7m \x1b[27m${theme.fg("dim", this.placeholder.slice(1))}`;
			}
		} else {
			display = this.text;
		}

		const prefix = focused ? theme.fg("accent", "› ") : "  ";
		lines.push(truncateToWidth(`  ${prefix}${display}`, width));

		return lines;
	}

	handleInput(data: string): boolean {
		if (matchesKey(data, Key.left)) {
			this.cursor = Math.max(0, this.cursor - 1);
			return true;
		}
		if (matchesKey(data, Key.right)) {
			this.cursor = Math.min(this.text.length, this.cursor + 1);
			return true;
		}
		if (matchesKey(data, Key.home) || matchesKey(data, Key.ctrl("a"))) {
			this.cursor = 0;
			return true;
		}
		if (matchesKey(data, Key.end) || matchesKey(data, Key.ctrl("e"))) {
			this.cursor = this.text.length;
			return true;
		}
		if (matchesKey(data, Key.backspace)) {
			if (this.cursor > 0) {
				this.text = this.text.slice(0, this.cursor - 1) + this.text.slice(this.cursor);
				this.cursor--;
			}
			return true;
		}
		if (matchesKey(data, Key.delete)) {
			if (this.cursor < this.text.length) {
				this.text = this.text.slice(0, this.cursor) + this.text.slice(this.cursor + 1);
			}
			return true;
		}
		if (matchesKey(data, Key.ctrl("k"))) {
			this.text = this.text.slice(0, this.cursor);
			return true;
		}
		if (matchesKey(data, Key.ctrl("u"))) {
			this.text = this.text.slice(this.cursor);
			this.cursor = 0;
			return true;
		}
		// Printable character
		if (data.length === 1 && data.charCodeAt(0) >= 32) {
			this.text = this.text.slice(0, this.cursor) + data + this.text.slice(this.cursor);
			this.cursor++;
			return true;
		}
		return false;
	}

	getValue(): string {
		return this.text;
	}

	setValue(value: any): void {
		this.text = String(value ?? "");
		this.cursor = this.text.length;
	}
}

// ─── CheckboxGroup ───────────────────────────────────────────────────────────

export class CheckboxGroupImpl implements ModalField {
	id: string;
	focusable = true;
	private label: string;
	private options: NormalizedOption[];
	private checked: Set<string>;
	private cursorIndex: number;

	constructor(config: CheckboxGroupConfig) {
		this.id = config.id;
		this.label = config.label;
		this.options = normalizeOptions(config.options);
		this.checked = new Set(config.value ?? []);
		this.cursorIndex = 0;
	}

	render(width: number, focused: boolean, theme: Theme): string[] {
		const lines: string[] = [];

		// Label
		lines.push(truncateToWidth(`  ${theme.fg(focused ? "accent" : "muted", this.label + ":")}`, width));

		// Options
		for (let i = 0; i < this.options.length; i++) {
			const opt = this.options[i]!;
			const isChecked = this.checked.has(opt.value);
			const isCurrent = focused && i === this.cursorIndex;
			const box = isChecked ? "☑" : "☐";
			const prefix = isCurrent ? theme.fg("accent", "› ") : "  ";
			const boxColor = isChecked ? "success" : "dim";
			const textColor = isCurrent ? "accent" : isChecked ? "text" : "muted";
			lines.push(
				truncateToWidth(`  ${prefix}${theme.fg(boxColor, box)} ${theme.fg(textColor, opt.label)}`, width),
			);
		}

		return lines;
	}

	handleInput(data: string): boolean {
		if (matchesKey(data, Key.up)) {
			if (this.cursorIndex > 0) {
				this.cursorIndex--;
				return true;
			}
			return false;
		}
		if (matchesKey(data, Key.down)) {
			if (this.cursorIndex < this.options.length - 1) {
				this.cursorIndex++;
				return true;
			}
			return false;
		}
		if (matchesKey(data, Key.space)) {
			const opt = this.options[this.cursorIndex]!;
			if (this.checked.has(opt.value)) {
				this.checked.delete(opt.value);
			} else {
				this.checked.add(opt.value);
			}
			return true;
		}
		return false;
	}

	getValue(): string[] {
		return this.options.filter((o) => this.checked.has(o.value)).map((o) => o.value);
	}

	setValue(value: any): void {
		this.checked = new Set(Array.isArray(value) ? value : []);
	}
}

// ─── SelectField / SelectGroup ──────────────────────────────────────────────

export class SelectFieldImpl implements ModalField {
	id: string;
	focusable = true;
	private label: string;
	private options: NormalizedOption[];
	private selectedIndex: number;

	constructor(config: SelectFieldConfig) {
		this.id = config.id;
		this.label = config.label;
		this.options = normalizeOptions(config.options);
		this.selectedIndex = config.value
			? Math.max(0, this.options.findIndex((o) => o.value === config.value))
			: 0;
	}

	render(width: number, focused: boolean, theme: Theme): string[] {
		const lines: string[] = [];
		lines.push(truncateToWidth(`  ${theme.fg(focused ? "accent" : "muted", this.label + ":")}`, width));

		for (let i = 0; i < this.options.length; i++) {
			const opt = this.options[i]!;
			const isCurrent = i === this.selectedIndex;
			const prefix = focused && isCurrent ? theme.fg("accent", "› ") : "  ";
			const textColor = isCurrent ? "accent" : "muted";
			lines.push(truncateToWidth(`  ${prefix}${theme.fg(textColor, opt.label)}`, width));
		}

		return lines;
	}

	handleInput(data: string): boolean {
		if (matchesKey(data, Key.up)) {
			if (this.selectedIndex > 0) {
				this.selectedIndex--;
				return true;
			}
			return false;
		}
		if (matchesKey(data, Key.down)) {
			if (this.selectedIndex < this.options.length - 1) {
				this.selectedIndex++;
				return true;
			}
			return false;
		}
		return false;
	}

	getValue(): string {
		return this.options[this.selectedIndex]?.value ?? "";
	}

	setValue(value: any): void {
		const idx = this.options.findIndex((o) => o.value === value);
		if (idx >= 0) {
			this.selectedIndex = idx;
		}
	}
}

// ─── RadioGroup ──────────────────────────────────────────────────────────────

export class RadioGroupImpl implements ModalField {
	id: string;
	focusable = true;
	private label: string;
	private options: NormalizedOption[];
	private selectedIndex: number;
	private cursorIndex: number;

	constructor(config: RadioGroupConfig) {
		this.id = config.id;
		this.label = config.label;
		this.options = normalizeOptions(config.options);
		this.selectedIndex = config.value
			? Math.max(0, this.options.findIndex((o) => o.value === config.value))
			: 0;
		this.cursorIndex = this.selectedIndex;
	}

	render(width: number, focused: boolean, theme: Theme): string[] {
		const lines: string[] = [];

		// Label
		lines.push(truncateToWidth(`  ${theme.fg(focused ? "accent" : "muted", this.label + ":")}`, width));

		// Options
		for (let i = 0; i < this.options.length; i++) {
			const opt = this.options[i]!;
			const isSelected = i === this.selectedIndex;
			const isCurrent = focused && i === this.cursorIndex;
			const bullet = isSelected ? "◉" : "○";
			const prefix = isCurrent ? theme.fg("accent", "› ") : "  ";
			const bulletColor = isSelected ? "accent" : "dim";
			const textColor = isCurrent ? "accent" : isSelected ? "text" : "muted";
			lines.push(
				truncateToWidth(`  ${prefix}${theme.fg(bulletColor, bullet)} ${theme.fg(textColor, opt.label)}`, width),
			);
		}

		return lines;
	}

	handleInput(data: string): boolean {
		if (matchesKey(data, Key.up)) {
			if (this.cursorIndex > 0) {
				this.cursorIndex--;
				return true;
			}
			return false;
		}
		if (matchesKey(data, Key.down)) {
			if (this.cursorIndex < this.options.length - 1) {
				this.cursorIndex++;
				return true;
			}
			return false;
		}
		// Space selects; Enter falls through to modal for submit
		if (matchesKey(data, Key.space)) {
			this.selectedIndex = this.cursorIndex;
			return true;
		}
		return false;
	}

	getValue(): string {
		return this.options[this.selectedIndex]?.value ?? "";
	}

	setValue(value: any): void {
		const idx = this.options.findIndex((o) => o.value === value);
		if (idx >= 0) {
			this.selectedIndex = idx;
			this.cursorIndex = idx;
		}
	}
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

export class ToggleImpl implements ModalField {
	id: string;
	focusable = true;
	private label: string;
	private on: boolean;

	constructor(config: ToggleConfig) {
		this.id = config.id;
		this.label = config.label;
		this.on = config.value ?? false;
	}

	render(width: number, focused: boolean, theme: Theme): string[] {
		const prefix = focused ? theme.fg("accent", "› ") : "  ";
		const labelColor = focused ? "accent" : "muted";
		const indicator = this.on
			? theme.fg("success", "✓ on")
			: theme.fg("dim", "✗ off");
		return [
			truncateToWidth(
				`  ${prefix}${theme.fg(labelColor, this.label + ":")}  ${indicator}`,
				width,
			),
		];
	}

	handleInput(data: string): boolean {
		// Space toggles; Enter falls through to modal for submit
		if (matchesKey(data, Key.space)) {
			this.on = !this.on;
			return true;
		}
		return false;
	}

	getValue(): boolean {
		return this.on;
	}

	setValue(value: any): void {
		this.on = Boolean(value);
	}
}

// ─── Separator ───────────────────────────────────────────────────────────────

export class SeparatorImpl implements ModalField {
	id: string | undefined = undefined;
	focusable = false;
	private label: string | undefined;

	constructor(config: SeparatorConfig) {
		this.label = config.label;
	}

	render(width: number, _focused: boolean, theme: Theme): string[] {
		const innerW = Math.max(1, width - 6);
		if (this.label) {
			const labelText = ` ${this.label} `;
			const remaining = Math.max(0, innerW - labelText.length);
			const left = Math.floor(remaining / 2);
			const right = remaining - left;
			return [
				`  ${theme.fg("dim", "─".repeat(left))}${theme.fg("muted", labelText)}${theme.fg("dim", "─".repeat(right))}`,
			];
		}
		return [`  ${theme.fg("dim", "─".repeat(innerW))}`];
	}

	handleInput(_data: string): boolean {
		return false;
	}

	getValue(): undefined {
		return undefined;
	}

	setValue(_value: any): void {}
}

// ─── Factory Functions ───────────────────────────────────────────────────────

export function createField(config: import("./types.ts").FieldConfig): ModalField {
	switch (config.type) {
		case "text":
			return new TextFieldImpl(config);
		case "select":
			return new SelectFieldImpl(config);
		case "checkbox":
			return new CheckboxGroupImpl(config);
		case "radio":
			return new RadioGroupImpl(config);
		case "toggle":
			return new ToggleImpl(config);
		case "separator":
			return new SeparatorImpl(config);
		default:
			throw new Error(`Unknown field type: ${(config as any).type}`);
	}
}
