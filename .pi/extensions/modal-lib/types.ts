/**
 * Modal Dialog Library — Shared Types
 *
 * All interfaces and type definitions for the modal dialog system.
 */

import type { OverlayAnchor, OverlayMargin, SizeValue } from "@mariozechner/pi-tui";
import type { Theme } from "@mariozechner/pi-coding-agent";

// ─── Field Configuration Types (used by consumers) ───────────────────────────

export interface TextFieldConfig {
	type: "text";
	id: string;
	label: string;
	value?: string;
	placeholder?: string;
}

export interface SelectFieldConfig {
	type: "select";
	id: string;
	label: string;
	options: string[] | { value: string; label: string }[];
	value?: string;
}

/** Alias name for SelectFieldConfig to make intent explicit in menu-style flows. */
export type SelectGroupConfig = SelectFieldConfig;

export interface CheckboxGroupConfig {
	type: "checkbox";
	id: string;
	label: string;
	options: string[] | { value: string; label: string }[];
	value?: string[];
}

export interface RadioGroupConfig {
	type: "radio";
	id: string;
	label: string;
	options: string[] | { value: string; label: string }[];
	value?: string;
}

export interface ToggleConfig {
	type: "toggle";
	id: string;
	label: string;
	value?: boolean;
}

export interface SeparatorConfig {
	type: "separator";
	label?: string;
}

export type FieldConfig =
	| TextFieldConfig
	| SelectFieldConfig
	| CheckboxGroupConfig
	| RadioGroupConfig
	| ToggleConfig
	| SeparatorConfig;

// ─── Tab & Modal Configuration ───────────────────────────────────────────────

export interface TabConfig {
	label: string;
	fields: FieldConfig[];
}

export interface ModalConfig {
	title: string;
	/** Maximum width in columns. Modal is 100% at narrow viewports, capped at this value. Default: 72 */
	maxWidth?: number;
	maxHeight?: SizeValue;
	anchor?: OverlayAnchor;
	offsetX?: number;
	offsetY?: number;
	row?: SizeValue;
	col?: SizeValue;
	margin?: OverlayMargin | number;
	/** Multi-tab layout */
	tabs?: TabConfig[];
	/** Single-page layout (no tabs). Ignored if tabs is set. */
	fields?: FieldConfig[];
	submitLabel?: string;
	cancelLabel?: string;
}

export interface ModalResult {
	cancelled: boolean;
	values: Record<string, any>;
}

// ─── Internal Field Interface (implemented by each field type) ────────────────

export interface ModalField {
	/** Field identifier, used as key in result values. Undefined for separators. */
	id: string | undefined;
	/** Whether this field can receive focus */
	focusable: boolean;
	/** Render the field. Returns array of lines. */
	render(width: number, focused: boolean, theme: Theme): string[];
	/** Handle keyboard input. Return true if consumed. */
	handleInput(data: string): boolean;
	/** Get the current value */
	getValue(): any;
	/** Set a value programmatically */
	setValue(value: any): void;
}

// ─── Option normalization helper ─────────────────────────────────────────────

export interface NormalizedOption {
	value: string;
	label: string;
}

export function normalizeOptions(options: string[] | { value: string; label: string }[]): NormalizedOption[] {
	return options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
}
