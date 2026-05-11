import { existsSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const DEFAULT_TITLE = "pi";
const MAX_TITLE_LENGTH = 16;
const SLUG_MODEL_PROVIDER = "anthropic";
const SLUG_MODEL_ID = "claude-haiku-4-5";
const SLUG_GENERATION_TIMEOUT_MS = 30_000;

const SLUG_SYSTEM_PROMPT = `You generate tmux window title slugs.

Given a user question sentence, return exactly one slug that:
- uses only lowercase letters, numbers, and dashes
- is at most ${MAX_TITLE_LENGTH} characters long total (dashes count)
- captures the sentence topic
- contains no spaces, punctuation, quotes, or explanation

Return only the slug.`;

function candidateToPath(candidate: string): string {
	if (candidate.startsWith("file://")) return realpathSync(new URL(candidate));
	return realpathSync(candidate);
}

function resolvePiAiEntry(): string {
	const candidates = [process.argv[1], import.meta.url].filter((value): value is string => Boolean(value));
	for (const candidate of candidates) {
		try {
			let dir = dirname(candidateToPath(candidate));
			while (dir !== dirname(dir)) {
				const entry = join(dir, "node_modules", "@mariozechner", "pi-ai", "dist", "index.js");
				if (existsSync(entry)) return pathToFileURL(entry).href;
				dir = dirname(dir);
			}
		} catch {
			// Try the next known module root.
		}
	}
	throw new Error("Could not resolve @mariozechner/pi-ai for tmux title generation");
}

const PI_AI_ENTRY = resolvePiAiEntry();

const SLUG_WORKER_SOURCE = String.raw`
const { execSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { homedir } = require("node:os");
const { join } = require("node:path");
const { parentPort, workerData } = require("node:worker_threads");

function normalizeSlug(value) {
	const normalized = String(value || "")
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, workerData.maxTitleLength)
		.replace(/-+$/g, "");

	return normalized || workerData.defaultTitle;
}

function extractTextContent(blocks) {
	return (Array.isArray(blocks) ? blocks : [])
		.filter((block) => block && block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n")
		.trim();
}

function providerApiKeyEnvNames(provider) {
	const normalized = String(provider || "").toUpperCase().replace(/[^A-Z0-9]/g, "_");
	return [normalized + "_API_KEY"];
}

function resolveConfigValue(config) {
	if (typeof config !== "string" || !config) return undefined;
	if (!config.startsWith("!")) return process.env[config] || config;

	try {
		const output = execSync(config.slice(1), {
			encoding: "utf-8",
			timeout: 10_000,
			stdio: ["ignore", "pipe", "ignore"],
		});
		return output.trim() || undefined;
	} catch {
		return undefined;
	}
}

function resolveHeaders(headers) {
	if (!headers || typeof headers !== "object") return undefined;
	const resolved = {};
	for (const [key, value] of Object.entries(headers)) {
		const resolvedValue = resolveConfigValue(value);
		if (resolvedValue) resolved[key] = resolvedValue;
	}
	return Object.keys(resolved).length > 0 ? resolved : undefined;
}

function getAuth(provider) {
	for (const envName of providerApiKeyEnvNames(provider)) {
		if (process.env[envName]) return { ok: true, apiKey: process.env[envName] };
	}

	try {
		const agentDir = process.env.PI_CODING_AGENT_DIR || join(homedir(), ".pi", "agent");
		const auth = JSON.parse(readFileSync(join(agentDir, "auth.json"), "utf-8"));
		const credential = auth && auth[provider];
		if (!credential) return { ok: false, error: "No API key for " + provider };
		if (credential.type !== "api_key") return { ok: false, error: "Unsupported " + provider + " auth type: " + credential.type };

		const apiKey = resolveConfigValue(credential.key);
		if (!apiKey) return { ok: false, error: "No API key for " + provider };
		return { ok: true, apiKey, headers: resolveHeaders(credential.headers) };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

(async () => {
	try {
		const auth = getAuth(workerData.provider);
		if (!auth.ok) {
			parentPort.postMessage({ ok: false, error: auth.error });
			return;
		}

		const { complete } = await import(workerData.piAiEntry);
		const message = {
			role: "user",
			content: [{ type: "text", text: workerData.firstSentence }],
			timestamp: Date.now(),
		};

		const response = await complete(
			workerData.model,
			{ systemPrompt: workerData.systemPrompt, messages: [message] },
			{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 32 },
		);
		const raw = extractTextContent(response && response.content);
		parentPort.postMessage({ ok: true, slug: normalizeSlug(raw) });
	} catch (error) {
		parentPort.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
	}
})();
`;

function normalizeSlug(value: string): string {
	const normalized = value
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, MAX_TITLE_LENGTH)
		.replace(/-+$/g, "");

	return normalized || DEFAULT_TITLE;
}

function isConversationPrompt(value: string | undefined): boolean {
	if (!value) return false;
	const text = value.trim();
	if (!text) return false;
	if (text.startsWith("/") || text.startsWith("!")) return false;
	return true;
}

function extractFirstSentence(prompt: string): string {
	const text = prompt.replace(/\s+/g, " ").trim();
	if (!text) return "";

	const sentenceEnd = text.search(/[.!?](\s|$)/);
	if (sentenceEnd === -1) return text;
	return text.slice(0, sentenceEnd + 1).trim();
}

interface SlugWorkerResult {
	ok: boolean;
	slug?: string;
	error?: string;
}

function cloneForWorker(value: unknown): unknown {
	return JSON.parse(JSON.stringify(value));
}

function generateSlug(firstSentence: string, model: unknown): Promise<SlugWorkerResult> {
	return new Promise((resolve) => {
		let settled = false;
		let timeout: NodeJS.Timeout | undefined;
		let worker: Worker;

		const finish = (result: SlugWorkerResult) => {
			if (settled) return;
			settled = true;
			if (timeout) clearTimeout(timeout);
			resolve(result);
		};

		try {
			worker = new Worker(SLUG_WORKER_SOURCE, {
				eval: true,
				workerData: {
					defaultTitle: DEFAULT_TITLE,
					firstSentence,
					maxTitleLength: MAX_TITLE_LENGTH,
					model: cloneForWorker(model),
					piAiEntry: PI_AI_ENTRY,
					provider: SLUG_MODEL_PROVIDER,
					systemPrompt: SLUG_SYSTEM_PROMPT,
				},
			});
			worker.unref();
		} catch (error) {
			finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
			return;
		}

		timeout = setTimeout(() => {
			void worker.terminate();
			finish({ ok: false, error: `Slug generation timed out after ${SLUG_GENERATION_TIMEOUT_MS}ms` });
		}, SLUG_GENERATION_TIMEOUT_MS);
		timeout.unref?.();

		worker.once("message", (message: SlugWorkerResult) => finish(message));
		worker.once("error", (error) => finish({ ok: false, error: error.message }));
		worker.once("exit", (code) => {
			if (code !== 0) finish({ ok: false, error: `Slug worker exited with code ${code}` });
		});
	});
}

export default function (pi: ExtensionAPI) {
	let currentTitle = "";
	let hasConversationRename = false;
	let tmuxWindowId: string | null = null;
	let generation = 0;

	const runLater = (task: () => Promise<void>): void => {
		setTimeout(() => {
			void task().catch(() => {
				// Background title updates must never interrupt the conversation UI.
			});
		}, 0);
	};

	const resolveTmuxWindowId = async (): Promise<string | null> => {
		if (!process.env.TMUX) return null;
		if (tmuxWindowId) return tmuxWindowId;

		const args = ["display-message", "-p"];
		if (process.env.TMUX_PANE) {
			args.push("-t", process.env.TMUX_PANE);
		}
		args.push("#{window_id}");

		try {
			const result = await pi.exec("tmux", args, { timeout: 2000 });
			if (result.code !== 0) return null;
			const resolved = result.stdout.trim();
			if (!resolved) return null;
			tmuxWindowId = resolved;
			return tmuxWindowId;
		} catch {
			return null;
		}
	};

	const setTmuxWindowTitle = async (title: string): Promise<void> => {
		const windowId = await resolveTmuxWindowId();
		if (!windowId) return;

		try {
			await pi.exec("tmux", ["rename-window", "-t", windowId, title], { timeout: 2000 });
		} catch {
			// Ignore tmux errors to avoid interrupting the conversation.
		}
	};

	const applyTitle = async (ctx: ExtensionContext, rawTitle: string, expectedGeneration = generation): Promise<void> => {
		if (expectedGeneration !== generation) return;

		const title = normalizeSlug(rawTitle);
		if (title === currentTitle) return;

		currentTitle = title;
		if (ctx.hasUI) {
			ctx.ui.setTitle(title);
		}
		await setTmuxWindowTitle(title);
	};

	const scheduleDefaultTitle = (ctx: ExtensionContext): void => {
		const expectedGeneration = generation;
		runLater(() => applyTitle(ctx, DEFAULT_TITLE, expectedGeneration));
	};

	const scheduleRenameFromFirstPrompt = (prompt: string, ctx: ExtensionContext): void => {
		if (hasConversationRename) return;
		if (!isConversationPrompt(prompt)) return;

		const firstSentence = extractFirstSentence(prompt);
		if (!firstSentence) return;

		hasConversationRename = true;
		const expectedGeneration = generation;

		runLater(async () => {
			if (expectedGeneration !== generation) return;

			const model = ctx.modelRegistry.find(SLUG_MODEL_PROVIDER, SLUG_MODEL_ID);
			if (!model) {
				if (ctx.hasUI) ctx.ui.notify(`Model ${SLUG_MODEL_PROVIDER}/${SLUG_MODEL_ID} not found`, "warning");
				return;
			}

			const result = await generateSlug(firstSentence, model);
			if (expectedGeneration !== generation) return;

			if (!result.ok) {
				if (ctx.hasUI) ctx.ui.notify(`Slug generation failed: ${result.error ?? "unknown error"}`, "warning");
				return;
			}

			await applyTitle(ctx, result.slug ?? DEFAULT_TITLE, expectedGeneration);
		});
	};

	pi.on("session_start", (_event, ctx) => {
		generation++;
		hasConversationRename = false;
		currentTitle = "";
		scheduleDefaultTitle(ctx);
	});

	pi.on("session_switch", (_event, ctx) => {
		generation++;
		hasConversationRename = false;
		currentTitle = "";
		tmuxWindowId = null;
		scheduleDefaultTitle(ctx);
	});

	pi.on("input", (event, ctx) => {
		if (event.source !== "extension") {
			scheduleRenameFromFirstPrompt(event.text, ctx);
		}
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", (event, ctx) => {
		scheduleRenameFromFirstPrompt(event.prompt, ctx);
	});
}
