/**
 * Sudo Password Extension
 *
 * When the agent runs a bash command containing `sudo`, prompts the user
 * for their password via a masked input, caches it for the session,
 * and uses SUDO_ASKPASS to supply the password.
 *
 * Uses tool_call event + input mutation only (no tool registration),
 * so it's compatible with other extensions that register a bash tool.
 *
 * The password is held in memory only for the session lifetime and
 * never logged or sent to the LLM.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { writeFileSync, unlinkSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

let cachedPassword: string | undefined;
const ASKPASS_PATH = join(tmpdir(), `.pi-sudo-askpass-${process.pid}`);

export default function (pi: ExtensionAPI) {
	// Intercept bash tool calls containing sudo
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command as string;

		// Only intercept commands that invoke sudo
		if (!/\bsudo\b/.test(command)) return undefined;

		// Skip if already using -A (askpass) flag
		if (/\bsudo\s+.*-A/.test(command) || /\bsudo\s+-\S*A/.test(command)) return undefined;

		if (!ctx.hasUI) {
			return { block: true, reason: "sudo command blocked (no UI available for password prompt)" };
		}

		// Prompt for password if not cached
		if (!cachedPassword) {
			const password = await promptForPassword(ctx);
			if (password === undefined) {
				return { block: true, reason: "sudo password prompt cancelled by user" };
			}
			cachedPassword = password;
		}

		// Write the askpass script
		writeAskpassScript(cachedPassword);

		// Rewrite the command:
		// 1. Export SUDO_ASKPASS so all sudo invocations in the command use it
		// 2. Replace sudo → sudo -A (use askpass program)
		const rewritten = command.replace(/\bsudo\b/g, "sudo -A");
		const wrapped = `export SUDO_ASKPASS=${shellEscape(ASKPASS_PATH)}; ${rewritten}`;

		// Mutate the input so the bash tool runs the rewritten command
		(event.input as any).command = wrapped;

		return undefined;
	});

	// Clean up askpass script after execution
	pi.on("tool_result", async (event, _ctx) => {
		if (event.toolName === "bash") {
			cleanupAskpassScript();
		}
		return undefined;
	});

	// Clear cached password on new session
	pi.on("session_start", async () => {
		cachedPassword = undefined;
		cleanupAskpassScript();
	});

	// Command to clear the cached password
	pi.registerCommand("sudo-clear", {
		description: "Clear cached sudo password",
		handler: async (_args, ctx) => {
			cachedPassword = undefined;
			cleanupAskpassScript();
			ctx.ui.notify("Sudo password cleared", "info");
		},
	});
}

/**
 * Write a temporary askpass script that outputs the cached password.
 */
function writeAskpassScript(password: string): void {
	const escaped = password.replace(/'/g, "'\\''");
	const script = `#!/bin/sh\nprintf '%s\\n' '${escaped}'\n`;
	writeFileSync(ASKPASS_PATH, script, { mode: 0o700 });
}

/**
 * Remove the temporary askpass script.
 */
function cleanupAskpassScript(): void {
	try {
		unlinkSync(ASKPASS_PATH);
	} catch {
		// File may not exist
	}
}

/**
 * Show a masked password input using ctx.ui.custom().
 * Returns the password string, or undefined if cancelled.
 */
async function promptForPassword(ctx: any): Promise<string | undefined> {
	return ctx.ui.custom<string | undefined>(
		(tui: any, theme: any, _keybindings: any, done: (value: string | undefined) => void) => {
			let password = "";
			let dismissed = false;
			const title = theme.bold("🔒 sudo password required");
			const hint = theme.fg("dim", "  Enter password (masked) · Enter to submit · Escape to cancel");

			const component = {
				handleInput(data: string) {
					if (dismissed) return;

					// Skip escape sequences (arrow keys, function keys, etc.)
					if (data.length > 1 && data.startsWith("\x1b")) {
						// Standalone Escape is just "\x1b" (length 1)
						// Sequences like \x1b[A (arrow up) are length > 1
						return;
					}

					// Escape key (standalone)
					if (data === "\x1b") {
						dismissed = true;
						done(undefined);
						return;
					}

					// Enter - submit
					if (data === "\r" || data === "\n") {
						if (password.length > 0) {
							dismissed = true;
							done(password);
						}
						return;
					}

					// Backspace
					if (data === "\x7f" || data === "\b") {
						if (password.length > 0) {
							password = password.slice(0, -1);
							tui.requestRender();
						}
						return;
					}

					// Ctrl+U - clear line
					if (data === "\x15") {
						password = "";
						tui.requestRender();
						return;
					}

					// Ignore control characters
					for (const ch of data) {
						const code = ch.charCodeAt(0);
						if (code < 32 || code === 0x7f) {
							return;
						}
					}

					// Regular character(s)
					password += data;
					tui.requestRender();
				},

				invalidate() {},

				render(width: number): string[] {
					const masked = "•".repeat(password.length);
					const cursor = "\x1b[7m \x1b[27m";
					return ["", `  ${title}`, "", `  ${theme.fg("accent", "Password:")} ${masked}${cursor}`, "", hint, ""];
				},
			};

			return component;
		},
	);
}

/** Escape a string for safe use in a shell single-quote context */
function shellEscape(s: string): string {
	return "'" + s.replace(/'/g, "'\\''") + "'";
}
