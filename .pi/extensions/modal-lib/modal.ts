/**
 * Modal Dialog Library — Modal Orchestrator
 *
 * The Modal class is the main entry point. It creates an overlay component,
 * manages tabs, field focus, keyboard routing, and collects results.
 */

import type { ExtensionContext, Theme } from "@mariozechner/pi-coding-agent";
import { matchesKey, Key, type Focusable, type TUI } from "@mariozechner/pi-tui";
import type { ModalConfig, ModalResult, ModalField, TabConfig } from "./types.ts";
import { createField } from "./fields.ts";
import {
	renderTopBorder,
	renderBottomBorder,
	renderTabBar,
	renderHelpBar,
	borderedRow,
} from "./renderer.ts";

interface TabState {
	label: string;
	fields: ModalField[];
	focusableIndices: number[];
}

export class Modal {
	/**
	 * Show a modal dialog and wait for the user to submit or cancel.
	 *
	 * @param ctx - ExtensionContext (from event handler, command, or tool)
	 * @param config - Modal configuration
	 * @returns ModalResult with cancelled flag and collected values
	 */
	static async show(ctx: ExtensionContext, config: ModalConfig): Promise<ModalResult> {
		if (!ctx.hasUI) {
			return { cancelled: true, values: {} };
		}

		// Normalize config: ensure we have tabs
		const tabs = Modal.normalizeTabs(config);

		const result = await ctx.ui.custom<ModalResult>(
			(tui, theme, _kb, done) => new ModalComponent(tui, theme, tabs, config, done),
			{
				overlay: true,
				overlayOptions: {
					anchor: config.anchor ?? "center",
					width: config.maxWidth ?? 72,
					maxHeight: config.maxHeight ?? "80%",
					offsetX: config.offsetX,
					offsetY: config.offsetY,
					row: config.row,
					col: config.col,
					margin: config.margin ?? 1,
					minWidth: 30,
				},
			},
		);

		return result;
	}

	private static normalizeTabs(config: ModalConfig): TabConfig[] {
		if (config.tabs && config.tabs.length > 0) {
			return config.tabs;
		}
		if (config.fields && config.fields.length > 0) {
			return [{ label: "", fields: config.fields }];
		}
		return [{ label: "", fields: [] }];
	}
}

class ModalComponent implements Focusable {
	// Focusable interface for IME cursor positioning
	focused = false;

	private tabs: TabState[];
	private activeTab = 0;
	private focusIndex = 0; // index into current tab's focusableIndices
	private isMultiTab: boolean;
	private tui: TUI;
	private theme: Theme;
	private config: ModalConfig;
	private done: (result: ModalResult) => void;
	private scrollOffset = 0;
	/** Maximum field content height across all tabs (computed on first render). */
	private maxFieldLines: number | undefined;

	constructor(
		tui: TUI,
		theme: Theme,
		tabConfigs: TabConfig[],
		config: ModalConfig,
		done: (result: ModalResult) => void,
	) {
		this.tui = tui;
		this.theme = theme;
		this.config = config;
		this.done = done;
		this.isMultiTab = tabConfigs.length > 1 || (tabConfigs.length === 1 && tabConfigs[0]!.label !== "");

		// Build tab state
		this.tabs = tabConfigs.map((tc) => {
			const fields = tc.fields.map((fc) => createField(fc));
			const focusableIndices: number[] = [];
			fields.forEach((f, i) => {
				if (f.focusable) focusableIndices.push(i);
			});
			return { label: tc.label, fields, focusableIndices };
		});

		this.focusIndex = 0;
	}

	private currentTab(): TabState {
		return this.tabs[this.activeTab]!;
	}

	private focusedField(): ModalField | null {
		const tab = this.currentTab();
		const fieldIndex = tab.focusableIndices[this.focusIndex];
		if (fieldIndex === undefined) return null;
		return tab.fields[fieldIndex] ?? null;
	}

	private collectValues(): Record<string, any> {
		const values: Record<string, any> = {};
		for (const tab of this.tabs) {
			for (const field of tab.fields) {
				if (field.id !== undefined) {
					values[field.id] = field.getValue();
				}
			}
		}
		return values;
	}

	private submit(): void {
		this.done({ cancelled: false, values: this.collectValues(), activeTab: this.activeTab });
	}

	private cancel(): void {
		this.done({ cancelled: true, values: {} });
	}

	private moveFocus(direction: 1 | -1): void {
		const tab = this.currentTab();
		if (tab.focusableIndices.length === 0) return;

		const next = this.focusIndex + direction;
		if (next >= 0 && next < tab.focusableIndices.length) {
			this.focusIndex = next;
			this.scrollOffset = 0; // Reset scroll on focus change
		}
	}

	private switchTab(direction: 1 | -1): void {
		if (!this.isMultiTab) return;
		const next = this.activeTab + direction;
		if (next >= 0 && next < this.tabs.length) {
			this.activeTab = next;
			this.focusIndex = 0;
			this.scrollOffset = 0;
		}
	}

	handleInput(data: string): void {
		// Global keys
		if (matchesKey(data, Key.escape)) {
			this.cancel();
			return;
		}

		// Submit
		if (matchesKey(data, Key.ctrl("s"))) {
			this.submit();
			return;
		}

		// Route to focused field first
		const field = this.focusedField();
		if (field) {
			const consumed = field.handleInput(data);
			if (consumed) {
				this.tui.requestRender();
				return;
			}
		}

		// Tab switches tabs (when multi-tab), otherwise navigates fields
		if (matchesKey(data, Key.tab)) {
			if (this.isMultiTab) {
				this.switchTab(1);
			} else {
				this.moveFocus(1);
			}
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.shift("tab"))) {
			if (this.isMultiTab) {
				this.switchTab(-1);
			} else {
				this.moveFocus(-1);
			}
			this.tui.requestRender();
			return;
		}

		// Field navigation (not consumed by field)
		if (matchesKey(data, Key.down)) {
			this.moveFocus(1);
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, Key.up)) {
			this.moveFocus(-1);
			this.tui.requestRender();
			return;
		}

		// Enter submits unless the field wants it
		if (matchesKey(data, Key.enter)) {
			this.submit();
			return;
		}

		this.tui.requestRender();
	}

	/**
	 * Compute the number of field content lines for a given tab (fields + spacing).
	 * Uses unfocused rendering so the result is stable regardless of focus state.
	 */
	private measureTabFieldLines(tab: TabState, innerW: number, th: Theme): number {
		let count = 0;
		for (let i = 0; i < tab.fields.length; i++) {
			count += tab.fields[i]!.render(innerW, false, th).length;
			if (i < tab.fields.length - 1) count += 1; // spacing
		}
		return count;
	}

	render(width: number): string[] {
		const th = this.theme;
		const innerW = Math.max(1, width - 2);
		const lines: string[] = [];

		// Compute max field content height across all tabs on first render.
		// This keeps the dialog height stable when switching tabs, preventing
		// vertical re-centering jumps.
		if (this.maxFieldLines === undefined && this.isMultiTab) {
			this.maxFieldLines = 0;
			for (const tab of this.tabs) {
				this.maxFieldLines = Math.max(this.maxFieldLines, this.measureTabFieldLines(tab, innerW, th));
			}
		}

		// Top border with title
		lines.push(renderTopBorder(this.config.title, innerW, th));

		// Tab bar (if multi-tab)
		if (this.isMultiTab) {
			lines.push(...renderTabBar(this.tabs, this.activeTab, innerW, th));
		} else {
			lines.push(borderedRow("", innerW, th));
		}

		// Fields for current tab
		const tab = this.currentTab();
		const focusedFieldIndex = tab.focusableIndices[this.focusIndex];
		let fieldLineCount = 0;

		for (let i = 0; i < tab.fields.length; i++) {
			const field = tab.fields[i]!;
			const isFocused = i === focusedFieldIndex;
			const fieldLines = field.render(innerW, isFocused, th);
			for (const fl of fieldLines) {
				lines.push(borderedRow(fl, innerW, th));
				fieldLineCount++;
			}
			// Add spacing between fields
			if (i < tab.fields.length - 1) {
				lines.push(borderedRow("", innerW, th));
				fieldLineCount++;
			}
		}

		// Pad shorter tabs to match the tallest tab (multi-tab only)
		if (this.maxFieldLines !== undefined && fieldLineCount < this.maxFieldLines) {
			const padding = this.maxFieldLines - fieldLineCount;
			for (let p = 0; p < padding; p++) {
				lines.push(borderedRow("", innerW, th));
			}
		}

		// Help bar
		lines.push(...renderHelpBar(this.isMultiTab, innerW, th));

		// Bottom border
		lines.push(renderBottomBorder(innerW, th));

		return lines;
	}

	invalidate(): void {}

	dispose(): void {}
}
