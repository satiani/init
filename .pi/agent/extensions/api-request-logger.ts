/**
 * API Request Logger Extension
 *
 * Logs the full provider request payload (system prompt, messages, tools)
 * to a JSONL file alongside the session file, so you can see exactly what
 * was sent over the wire.
 *
 * Output: ~/.pi/agent/api-logs/<session-id>.jsonl
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { existsSync, mkdirSync, appendFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const LOG_DIR = path.join(os.homedir(), ".pi", "agent", "api-logs");

export default function (pi: ExtensionAPI) {
	let sessionId: string | null = null;
	let turnCounter = 0;

	const ensureLogDir = () => {
		if (!existsSync(LOG_DIR)) {
			mkdirSync(LOG_DIR, { recursive: true });
		}
	};

	const getLogPath = () => {
		if (!sessionId) return null;
		return path.join(LOG_DIR, `${sessionId}.jsonl`);
	};

	pi.on("session_start", (_event, ctx) => {
		sessionId = ctx.sessionId;
		turnCounter = 0;
	});

	pi.on("session_switch", (_event, ctx) => {
		sessionId = ctx.sessionId;
		turnCounter = 0;
	});

	pi.on("turn_start", () => {
		turnCounter++;
	});

	pi.on("before_provider_request", (event) => {
		const logPath = getLogPath();
		if (!logPath) return;

		ensureLogDir();

		const payload = event.payload as Record<string, unknown>;

		const entry = {
			timestamp: new Date().toISOString(),
			turn: turnCounter,
			// The full payload: system, messages, tools, model, etc.
			system: payload.system,
			messages: payload.messages,
			tools: payload.tools,
			model: payload.model,
			// Include any other top-level keys
			...Object.fromEntries(
				Object.entries(payload).filter(
					([k]) => !["system", "messages", "tools", "model"].includes(k)
				)
			),
		};

		try {
			appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
		} catch {
			// Don't crash the agent if logging fails
		}

		// Don't modify the payload — return nothing
		return undefined;
	});
}
