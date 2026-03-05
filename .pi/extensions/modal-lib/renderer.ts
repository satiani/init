/**
 * Modal Dialog Library — Rendering Helpers
 *
 * Pure functions for rendering modal frame, tab bar, and help text.
 */

import type { Theme } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

/**
 * Pad a string to exactly `len` visible width with spaces.
 */
export function padToWidth(s: string, len: number): string {
	const vis = visibleWidth(s);
	if (vis >= len) return truncateToWidth(s, len);
	return s + " ".repeat(len - vis);
}

/**
 * Render a bordered row: │ content ... │
 */
export function borderedRow(content: string, innerW: number, theme: Theme): string {
	return theme.fg("border", "│") + padToWidth(content, innerW) + theme.fg("border", "│");
}

/**
 * Render the top border with an embedded title.
 */
export function renderTopBorder(title: string, innerW: number, theme: Theme): string {
	const titleText = ` ${title} `;
	const titleW = visibleWidth(titleText);
	const available = innerW - titleW;
	if (available < 2) {
		// Title too long, just use a plain border
		return theme.fg("border", `╭${"─".repeat(innerW)}╮`);
	}
	const left = Math.floor(available / 2);
	const right = available - left;
	return (
		theme.fg("border", `╭${"─".repeat(left)}`) +
		theme.fg("accent", theme.bold(titleText)) +
		theme.fg("border", `${"─".repeat(right)}╮`)
	);
}

/**
 * Render the bottom border.
 */
export function renderBottomBorder(innerW: number, theme: Theme): string {
	return theme.fg("border", `╰${"─".repeat(innerW)}╯`);
}

/**
 * Render the tab bar for multi-tab modals.
 */
export function renderTabBar(
	tabs: { label: string }[],
	activeIndex: number,
	innerW: number,
	theme: Theme,
): string[] {
	const parts: string[] = [];
	for (let i = 0; i < tabs.length; i++) {
		const tab = tabs[i]!;
		const isActive = i === activeIndex;
		const label = ` ${tab.label} `;
		if (isActive) {
			parts.push(theme.bg("selectedBg", theme.fg("text", theme.bold(label))));
		} else {
			parts.push(theme.fg("muted", label));
		}
		if (i < tabs.length - 1) {
			parts.push(theme.fg("dim", "│"));
		}
	}
	return [
		borderedRow("", innerW, theme),
		borderedRow(` ${parts.join("")}`, innerW, theme),
		borderedRow("", innerW, theme),
	];
}

/**
 * Render the help bar at the bottom of the modal.
 */
export function renderHelpBar(isMultiTab: boolean, innerW: number, theme: Theme): string[] {
	const lines: string[] = [];
	lines.push(borderedRow("", innerW, theme));

	// Separator
	lines.push(borderedRow(` ${theme.fg("dim", "─".repeat(Math.max(1, innerW - 2)))}`, innerW, theme));

	// Help hints
	const hints: string[] = [];
	if (isMultiTab) {
		hints.push("Tab tabs");
	}
	hints.push("↑↓ navigate");
	hints.push("Space select/toggle");
	hints.push("Enter submit");
	hints.push("Esc cancel");

	const helpText = hints.join(theme.fg("dim", " · "));
	lines.push(borderedRow(` ${theme.fg("dim", helpText)}`, innerW, theme));

	return lines;
}
