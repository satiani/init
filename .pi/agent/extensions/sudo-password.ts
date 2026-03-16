/**
 * Sudo Password Extension
 *
 * When the agent runs a bash command containing `sudo`, prompts the user
 * for their password via a masked input, caches it for the session,
 * and rewrites the command to pipe the password via `sudo -S`.
 *
 * The password is held in memory only for the session lifetime and
 * never logged or sent to the LLM.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Input } from "@mariozechner/pi-tui";

let cachedPassword: string | undefined;

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", async (event, ctx) => {
		if (event.toolName !== "bash") return undefined;

		const command = event.input.command as string;

		// Only intercept commands that use sudo
		if (!/\bsudo\b/.test(command)) return undefined;

		// If command already uses -S flag, skip (already handled)
		if (/\bsudo\s+.*-S/.test(command) || /\bsudo\s+-\S*S/.test(command)) return undefined;

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

		// Rewrite the command: replace `sudo` with password piped to `sudo -S`
		// Handle both simple `sudo cmd` and `sudo -u user cmd` patterns
		const rewrittenCommand = command.replace(
			/\bsudo\b/g,
			`sudo -S`
		);

		// Use printf to avoid echo adding a newline in some shells, and
		// pipe the password to the first sudo -S in the pipeline
		const wrappedCommand = `printf '%s\\n' ${shellEscape(cachedPassword)} | ${rewrittenCommand}`;

		// Mutate the event input so the bash tool runs the rewritten command
		(event.input as any).command = wrappedCommand;

		return undefined;
	});

	// Clear cached password when session ends
	pi.on("session_start", async () => {
		cachedPassword = undefined;
	});

	// Register a command to clear the cached password
	pi.registerCommand("sudo-clear", {
		description: "Clear cached sudo password",
		handler: async (_args, ctx) => {
			cachedPassword = undefined;
			ctx.ui.notify("Sudo password cleared", "info");
		},
	});
}

/**
 * Show a masked password input using ctx.ui.custom().
 * Returns the password string, or undefined if cancelled.
 */
async function promptForPassword(ctx: any): Promise<string | undefined> {
	return ctx.ui.custom<string | undefined>((tui: any, theme: any, _keybindings: any, done: (value: string | undefined) => void) => {
		let password = "";
		const title = theme.bold("🔒 sudo password required");
		const hint = theme.fg("dim", "  Enter password (masked) · Enter to submit · Escape to cancel");

		const component = {
			handleInput(data: string) {
				// Escape - cancel
				if (data === "\x1b" || data === "\x1b\x1b") {
					done(undefined);
					return;
				}
				// Enter - submit
				if (data === "\r" || data === "\n") {
					if (password.length > 0) {
						done(password);
					}
					return;
				}
				// Backspace
				if (data === "\x7f" || data === "\b") {
					password = password.slice(0, -1);
					tui.requestRender();
					return;
				}
				// Ctrl+U - clear line
				if (data === "\x15") {
					password = "";
					tui.requestRender();
					return;
				}
				// Ignore other control characters
				if (data.charCodeAt(0) < 32) {
					return;
				}
				// Regular character
				password += data;
				tui.requestRender();
			},

			invalidate() {},

			render(width: number): string[] {
				const masked = "•".repeat(password.length);
				const cursor = "\x1b[7m \x1b[27m"; // inverse space as cursor
				return [
					"",
					`  ${title}`,
					"",
					`  ${theme.fg("accent", "Password:")} ${masked}${cursor}`,
					"",
					hint,
					"",
				];
			},
		};

		return component;
	});
}

/** Escape a string for safe use in a shell single-quote context */
function shellEscape(s: string): string {
	// Wrap in single quotes, escaping any embedded single quotes
	return "'" + s.replace(/'/g, "'\\''") + "'";
}
