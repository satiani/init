import { complete, type UserMessage } from "@mariozechner/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const DEFAULT_TITLE = "pi";
const MAX_TITLE_LENGTH = 16;
const SLUG_MODEL_PROVIDER = "anthropic";
const SLUG_MODEL_ID = "claude-haiku-4-5";

const SLUG_SYSTEM_PROMPT = `You generate tmux window title slugs.

Given a user question sentence, return exactly one slug that:
- uses only lowercase letters, numbers, and dashes
- is at most ${MAX_TITLE_LENGTH} characters long total (dashes count)
- captures the sentence topic
- contains no spaces, punctuation, quotes, or explanation

Return only the slug.`;

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

function extractTextContent(blocks: Array<{ type: string; text?: string }>): string {
	return blocks
		.filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string")
		.map((block) => block.text)
		.join("\n")
		.trim();
}

async function generateSlug(firstSentence: string, ctx: ExtensionContext): Promise<string> {
	const model = ctx.modelRegistry.find(SLUG_MODEL_PROVIDER, SLUG_MODEL_ID);
	if (!model) {
		if (ctx.hasUI) ctx.ui.notify(`Model ${SLUG_MODEL_PROVIDER}/${SLUG_MODEL_ID} not found`, "warning");
		return DEFAULT_TITLE;
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok) {
		if (ctx.hasUI) ctx.ui.notify(`No API key for ${SLUG_MODEL_PROVIDER}/${SLUG_MODEL_ID}`, "warning");
		return DEFAULT_TITLE;
	}

	const message: UserMessage = {
		role: "user",
		content: [{ type: "text", text: firstSentence }],
		timestamp: Date.now(),
	};

	try {
		const response = await complete(model, { systemPrompt: SLUG_SYSTEM_PROMPT, messages: [message] }, { apiKey: auth.apiKey, headers: auth.headers, maxTokens: 32 });
		const raw = extractTextContent(response.content);
		return normalizeSlug(raw);
	} catch (error) {
		if (ctx.hasUI) {
			const message = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`Slug generation failed: ${message}`, "warning");
		}
		return DEFAULT_TITLE;
	}
}

export default function (pi: ExtensionAPI) {
	let currentTitle = "";
	let hasConversationRename = false;
	let tmuxWindowId: string | null = null;

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

	const applyTitle = async (ctx: ExtensionContext, rawTitle: string): Promise<void> => {
		const title = normalizeSlug(rawTitle);
		if (title === currentTitle) return;

		currentTitle = title;
		if (ctx.hasUI) {
			ctx.ui.setTitle(title);
		}
		await setTmuxWindowTitle(title);
	};

	const renameFromFirstPrompt = async (prompt: string, ctx: ExtensionContext): Promise<void> => {
		if (hasConversationRename) return;
		if (!isConversationPrompt(prompt)) return;
		hasConversationRename = true;

		const firstSentence = extractFirstSentence(prompt);
		if (!firstSentence) return;

		const slug = await generateSlug(firstSentence, ctx);
		await applyTitle(ctx, slug);
	};

	pi.on("session_start", async (_event, ctx) => {
		hasConversationRename = false;
		currentTitle = "";
		await applyTitle(ctx, DEFAULT_TITLE);
	});

	pi.on("session_switch", async (_event, ctx) => {
		hasConversationRename = false;
		currentTitle = "";
		tmuxWindowId = null;
		await applyTitle(ctx, DEFAULT_TITLE);
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" as const };
		renameFromFirstPrompt(event.text, ctx).catch(() => {});
		return { action: "continue" as const };
	});

	pi.on("before_agent_start", async (event, ctx) => {
		renameFromFirstPrompt(event.prompt, ctx).catch(() => {});
	});
}
