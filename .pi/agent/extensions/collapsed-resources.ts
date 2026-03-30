/**
 * Collapsed Resources Extension
 *
 * Shows loaded skills, prompts, extensions, and keyboard shortcuts as a
 * compact message in the conversation that scrolls up naturally.
 * Styled like tool output.
 *
 * Works with quietStartup: true in settings.json to suppress the built-in
 * resource listing, then provides a minimal header and a collapsible
 * resource message.
 *
 * Ctrl+O (app.tools.expand) toggles between collapsed and expanded view.
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { keyHint, rawKeyHint, VERSION } from "@mariozechner/pi-coding-agent";
import { Box, Text } from "@mariozechner/pi-tui";
import fs from "fs";
import os from "os";
import path from "path";

/** Discover extension files in ~/.pi/agent/extensions/ */
function discoverExtensions(): string[] {
	const dir = path.join(os.homedir(), ".pi", "agent", "extensions");
	if (!fs.existsSync(dir)) return [];
	const entries: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const fullPath = path.join(dir, entry.name);
		if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".js"))) {
			entries.push(fullPath);
		} else if (entry.isDirectory()) {
			const indexTs = path.join(fullPath, "index.ts");
			const indexJs = path.join(fullPath, "index.js");
			if (fs.existsSync(indexTs)) entries.push(indexTs);
			else if (fs.existsSync(indexJs)) entries.push(indexJs);
		}
	}
	return entries.sort();
}

/** Replace home dir prefix with ~ for display. */
function displayPath(p: string): string {
	const home = os.homedir();
	return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

/** Build the keyboard shortcut hints matching the built-in header. */
function buildShortcutHints(): string[] {
	return [
		rawKeyHint("escape", "to interrupt"),
		rawKeyHint("ctrl+c", "to clear"),
		rawKeyHint("ctrl+c twice", "to exit"),
		rawKeyHint("ctrl+d", "to exit (empty)"),
		rawKeyHint("ctrl+z", "to suspend"),
		keyHint("tui.editor.deleteToLineEnd", "to delete to end"),
		rawKeyHint("shift+tab", "to cycle thinking level"),
		rawKeyHint("ctrl+p/shift+ctrl+p", "to cycle models"),
		rawKeyHint("ctrl+l", "to select model"),
		rawKeyHint("ctrl+o", "to expand tools"),
		rawKeyHint("ctrl+t", "to expand thinking"),
		rawKeyHint("ctrl+g", "for external editor"),
		rawKeyHint("/", "for commands"),
		rawKeyHint("!", "to run bash"),
		rawKeyHint("!!", "to run bash (no context)"),
		rawKeyHint("alt+enter", "to queue follow-up"),
		rawKeyHint("alt+up", "to edit all queued messages"),
		rawKeyHint(process.platform === "win32" ? "alt+v" : "ctrl+v", "to paste image"),
		rawKeyHint("drop files", "to attach"),
	];
}

export default function collapsedResources(pi: ExtensionAPI) {
	// Register custom renderer for resource listing messages
	pi.registerMessageRenderer("collapsed-resources", (message, { expanded }, theme) => {
		const details = message.details as {
			skills: { name: string; description?: string }[];
			prompts: { name: string; description?: string }[];
			extensions: { name: string; path?: string }[];
			shortcuts: string[];
		};

		if (!details) return new Text("", 0, 0);

		const { skills, prompts, extensions, shortcuts } = details;

		// Build count summary
		const counts: string[] = [];
		if (skills.length > 0) counts.push(`${skills.length} skill${skills.length > 1 ? "s" : ""}`);
		if (prompts.length > 0) counts.push(`${prompts.length} prompt${prompts.length > 1 ? "s" : ""}`);
		if (extensions.length > 0) counts.push(`${extensions.length} extension${extensions.length > 1 ? "s" : ""}`);

		const lines: string[] = [];

		if (!expanded) {
			const arrow = theme.fg("accent", "▸");
			const summary = theme.fg("muted", counts.join(" · "));
			const hint = theme.fg("dim", `  ${keyHint("app.tools.expand", "to expand")}`);
			lines.push(`${arrow} ${summary}${hint}`);
		} else {
			const arrow = theme.fg("accent", "▾");
			const summary = theme.fg("muted", counts.join(" · "));
			const hint = theme.fg("dim", `  ${keyHint("app.tools.expand", "to collapse")}`);
			lines.push(`${arrow} ${summary}${hint}`);

			if (shortcuts.length > 0) {
				lines.push(theme.fg("mdHeading", "  [Shortcuts]"));
				for (const s of shortcuts) {
					lines.push(`    ${s}`);
				}
			}
			if (skills.length > 0) {
				lines.push(theme.fg("mdHeading", "  [Skills]"));
				for (const s of skills) {
					const desc = s.description ? theme.fg("dim", ` — ${s.description}`) : "";
					lines.push(`    ${theme.fg("muted", `/${s.name}`)}${desc}`);
				}
			}
			if (prompts.length > 0) {
				lines.push(theme.fg("mdHeading", "  [Prompts]"));
				for (const p of prompts) {
					const desc = p.description ? theme.fg("dim", ` — ${p.description}`) : "";
					lines.push(`    ${theme.fg("muted", `/${p.name}`)}${desc}`);
				}
			}
			if (extensions.length > 0) {
				lines.push(theme.fg("mdHeading", "  [Extensions]"));
				for (const e of extensions) {
					lines.push(`    ${theme.fg("dim", e.path ?? e.name)}`);
				}
			}
		}

		const box = new Box(1, 0, (t) => theme.bg("toolSuccessBg", t));
		box.addChild(new Text(lines.join("\n"), 0, 0));
		return box;
	});

	// Restore a minimal header since quietStartup suppresses the built-in one
	function setMinimalHeader(ctx: ExtensionContext) {
		if (!ctx.hasUI) return;

		ctx.ui.setHeader((_tui, theme) => ({
			render(_width: number): string[] {
				const logo = theme.bold(theme.fg("accent", "pi")) + theme.fg("dim", ` v${VERSION}`);
				return [logo];
			},
			invalidate() {},
		}));
	}

	function sendResourceMessage() {
		const commands = pi.getCommands();
		const skills = commands
			.filter((c) => c.source === "skill")
			.map((c) => ({ name: c.name, description: c.description }));
		const prompts = commands
			.filter((c) => c.source === "prompt")
			.map((c) => ({ name: c.name, description: c.description }));
		const extensions = discoverExtensions().map((p) => ({ name: path.basename(p), path: displayPath(p) }));

		const shortcuts = buildShortcutHints();

		pi.sendMessage({
			customType: "collapsed-resources",
			content: "",
			display: true,
			details: { skills, prompts, extensions, shortcuts },
		});
	}

	pi.on("session_start", (_event, ctx) => {
		setMinimalHeader(ctx);
		sendResourceMessage();
	});
}
