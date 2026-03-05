/**
 * Tmux Bell Notification Extension
 *
 * Sends a terminal bell (BEL) when the agent finishes a turn and is waiting
 * for input. This causes the tmux window to get highlighted via the
 * window_bell_flag + window-status-bell-style, so you can see at a glance
 * which window needs attention.
 *
 * Requires tmux options:
 *   monitor-bell on    (default)
 *   bell-action any    (or "other" to skip the current window)
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async () => {
		process.stdout.write("\x07");
	});
}
