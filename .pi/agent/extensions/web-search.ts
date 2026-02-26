/**
 * Web Search Extension — Tavily-powered web search, page fetching, and content extraction
 *
 * Three tools:
 *   - web_search: Search the web, returns top results with snippets
 *   - fetch_page: Fetch a URL and return the text content
 *   - extract_content: Use Tavily's extract API for clean article content
 *
 * API key resolution (in order):
 *   1. macOS Keychain: security find-generic-password -a "$USER" -s "tavily-api-key" -w
 *   2. Environment variable: TAVILY_API_KEY
 *
 * To store your key securely in Keychain (run in terminal):
 *   security add-generic-password -a "$USER" -s "tavily-api-key" -U -w
 *   (You'll be prompted to enter the key — it won't appear in shell history)
 *
 * Or with pi's ! command:
 *   !security add-generic-password -a "$USER" -s "tavily-api-key" -U -w "tvly-YOUR-KEY"
 *
 * Get a free key at https://tavily.com (1000 searches/month free).
 *
 * Usage:
 *   pi -e ./web-search.ts
 *   Or copy to ~/.pi/agent/extensions/
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";
import { execSync } from "child_process";

const TAVILY_BASE = "https://api.tavily.com";

const KEYCHAIN_SERVICE = "tavily-api-key";

// Cache the key after first lookup so we only hit Keychain once per session
let cachedApiKey: string | null = null;

function getApiKeyFromKeychain(): string | null {
	try {
		const key = execSync(
			`security find-generic-password -a "$USER" -s "${KEYCHAIN_SERVICE}" -w 2>/dev/null`,
			{ encoding: "utf-8" },
		).trim();
		return key || null;
	} catch {
		return null;
	}
}

function getApiKey(): string {
	if (cachedApiKey) return cachedApiKey;

	// 1. Try macOS Keychain
	const keychainKey = getApiKeyFromKeychain();
	if (keychainKey) {
		cachedApiKey = keychainKey;
		return keychainKey;
	}

	// 2. Fall back to environment variable
	const envKey = process.env.TAVILY_API_KEY;
	if (envKey) {
		cachedApiKey = envKey;
		return envKey;
	}

	throw new Error(
		[
			"Tavily API key not found. Set it up using one of:",
			"",
			"  macOS Keychain (recommended):",
			'    !security add-generic-password -a "$USER" -s "tavily-api-key" -U -w',
			"",
			"  Environment variable:",
			"    export TAVILY_API_KEY=tvly-...",
			"",
			"  Get a free key at https://tavily.com",
		].join("\n"),
	);
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface TavilySearchResult {
	title: string;
	url: string;
	content: string;
	score: number;
	raw_content?: string;
}

interface TavilySearchResponse {
	query: string;
	answer?: string;
	results: TavilySearchResult[];
	response_time: number;
}

interface TavilyExtractResponse {
	results: Array<{
		url: string;
		raw_content: string;
	}>;
	failed_results: Array<{
		url: string;
		error: string;
	}>;
}

interface SearchDetails {
	query: string;
	resultCount: number;
	responseTime: number;
	hasAnswer: boolean;
}

interface FetchDetails {
	url: string;
	contentLength: number;
	truncated: boolean;
}

interface ExtractDetails {
	urls: string[];
	successCount: number;
	failedCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function tavilyFetch(
	endpoint: string,
	body: Record<string, unknown>,
	signal?: AbortSignal,
): Promise<any> {
	const res = await fetch(`${TAVILY_BASE}/${endpoint}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ api_key: getApiKey(), ...body }),
		signal,
	});

	if (!res.ok) {
		const text = await res.text().catch(() => "(no body)");
		throw new Error(`Tavily API error ${res.status}: ${text}`);
	}

	return res.json();
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, "")
		.replace(/<style[\s\S]*?<\/style>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/&nbsp;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim();
}

// ─── Extension ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ─── web_search ────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description: [
			"Search the web using Tavily. Returns top results with titles, URLs, and content snippets.",
			"Use search_depth 'advanced' for more thorough results.",
			"Set include_answer to true for an AI-generated summary answer.",
			`Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		].join(" "),
		parameters: Type.Object({
			query: Type.String({ description: "Search query" }),
			search_depth: Type.Optional(
				Type.String({
					description: '"basic" (default, faster) or "advanced" (slower, more thorough)',
					default: "basic",
				}),
			),
			max_results: Type.Optional(
				Type.Number({
					description: "Number of results to return (1-10, default 5)",
					default: 5,
				}),
			),
			include_answer: Type.Optional(
				Type.Boolean({
					description: "Include an AI-generated summary answer (default false)",
					default: false,
				}),
			),
			topic: Type.Optional(
				Type.String({
					description: '"general" (default) or "news" for recent news results',
					default: "general",
				}),
			),
			include_domains: Type.Optional(
				Type.Array(Type.String(), {
					description: "Only include results from these domains",
				}),
			),
			exclude_domains: Type.Optional(
				Type.Array(Type.String(), {
					description: "Exclude results from these domains",
				}),
			),
		}),

		async execute(_toolCallId, params, signal) {
			const data: TavilySearchResponse = await tavilyFetch(
				"search",
				{
					query: params.query,
					search_depth: params.search_depth || "basic",
					max_results: Math.min(Math.max(params.max_results || 5, 1), 10),
					include_answer: params.include_answer || false,
					topic: params.topic || "general",
					include_domains: params.include_domains,
					exclude_domains: params.exclude_domains,
				},
				signal,
			);

			const parts: string[] = [];

			if (data.answer) {
				parts.push(`## Summary\n${data.answer}\n`);
			}

			if (data.results.length === 0) {
				parts.push("No results found.");
			} else {
				parts.push(`## Results (${data.results.length})\n`);
				for (let i = 0; i < data.results.length; i++) {
					const r = data.results[i];
					parts.push(`### ${i + 1}. ${r.title}`);
					parts.push(`URL: ${r.url}`);
					parts.push(`${r.content}\n`);
				}
			}

			const output = parts.join("\n");
			const truncation = truncateHead(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let resultText = truncation.content;
			if (truncation.truncated) {
				resultText += `\n\n[Output truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines]`;
			}

			return {
				content: [{ type: "text", text: resultText }],
				details: {
					query: params.query,
					resultCount: data.results.length,
					responseTime: data.response_time,
					hasAnswer: Boolean(data.answer),
				} as SearchDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("🔍 search "));
			text += theme.fg("accent", `"${args.query}"`);
			const extras: string[] = [];
			if (args.search_depth === "advanced") extras.push("advanced");
			if (args.topic === "news") extras.push("news");
			if (args.max_results && args.max_results !== 5) extras.push(`top ${args.max_results}`);
			if (args.include_answer) extras.push("+answer");
			if (extras.length) text += theme.fg("dim", ` (${extras.join(", ")})`);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Searching..."), 0, 0);

			const details = result.details as SearchDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			let text = theme.fg("success", `${details.resultCount} results`);
			text += theme.fg("dim", ` (${details.responseTime.toFixed(1)}s)`);
			if (details.hasAnswer) text += theme.fg("accent", " +summary");

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = content.text.split("\n").slice(0, 40);
					for (const line of lines) {
						if (line.startsWith("### ")) {
							text += `\n${theme.fg("accent", line.replace("### ", ""))}`;
						} else if (line.startsWith("URL: ")) {
							text += `\n${theme.fg("dim", line)}`;
						} else if (line.startsWith("## ")) {
							text += `\n${theme.fg("toolTitle", theme.bold(line.replace("## ", "")))}`;
						} else {
							text += `\n${theme.fg("muted", line)}`;
						}
					}
					if (content.text.split("\n").length > 40) {
						text += `\n${theme.fg("dim", "... (more results above)")}`;
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ─── fetch_page ────────────────────────────────────────────────────────────

	pi.registerTool({
		name: "fetch_page",
		label: "Fetch Page",
		description: [
			"Fetch a web page and return its text content.",
			"HTML is stripped to plain text. Useful for reading articles, docs, etc.",
			`Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		].join(" "),
		parameters: Type.Object({
			url: Type.String({ description: "URL to fetch" }),
		}),

		async execute(_toolCallId, params, signal) {
			const res = await fetch(params.url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (compatible; PiAgent/1.0; +https://github.com/nicepkg/pi)",
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
				},
				signal,
				redirect: "follow",
			});

			if (!res.ok) {
				return {
					content: [{ type: "text", text: `Error: HTTP ${res.status} ${res.statusText}` }],
					details: { url: params.url, contentLength: 0, truncated: false } as FetchDetails,
				};
			}

			const contentType = res.headers.get("content-type") || "";
			const raw = await res.text();

			let text: string;
			if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
				text = stripHtml(raw);
			} else {
				text = raw;
			}

			const truncation = truncateHead(text, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let resultText = `URL: ${params.url}\nContent-Type: ${contentType}\n\n${truncation.content}`;
			if (truncation.truncated) {
				resultText += `\n\n[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines (${formatSize(truncation.outputBytes)} of ${formatSize(truncation.totalBytes)})]`;
			}

			return {
				content: [{ type: "text", text: resultText }],
				details: {
					url: params.url,
					contentLength: text.length,
					truncated: truncation.truncated,
				} as FetchDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("🌐 fetch "));
			text += theme.fg("accent", args.url);
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Fetching..."), 0, 0);

			const details = result.details as FetchDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.contentLength === 0) {
				const content = result.content[0];
				return new Text(
					theme.fg("error", content?.type === "text" ? content.text : "Failed"),
					0,
					0,
				);
			}

			let text = theme.fg("success", formatSize(details.contentLength));
			if (details.truncated) text += theme.fg("warning", " (truncated)");

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = content.text.split("\n").slice(0, 30);
					for (const line of lines) {
						text += `\n${theme.fg("dim", line)}`;
					}
					if (content.text.split("\n").length > 30) {
						text += `\n${theme.fg("muted", "... more content")}`;
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});

	// ─── extract_content ───────────────────────────────────────────────────────

	pi.registerTool({
		name: "extract_content",
		label: "Extract Content",
		description: [
			"Extract clean article/page content from one or more URLs using Tavily's extraction API.",
			"Returns well-formatted content stripped of navigation, ads, and boilerplate.",
			"Better than fetch_page for articles and documentation.",
			`Output truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)}.`,
		].join(" "),
		parameters: Type.Object({
			urls: Type.Array(Type.String(), {
				description: "URLs to extract content from (1-5)",
				minItems: 1,
				maxItems: 5,
			}),
		}),

		async execute(_toolCallId, params, signal) {
			const urls = params.urls.slice(0, 5);

			const data: TavilyExtractResponse = await tavilyFetch(
				"extract",
				{ urls },
				signal,
			);

			const parts: string[] = [];

			for (const r of data.results) {
				parts.push(`## ${r.url}\n`);
				parts.push(r.raw_content);
				parts.push("");
			}

			for (const f of data.failed_results) {
				parts.push(`## ${f.url} [FAILED]`);
				parts.push(`Error: ${f.error}\n`);
			}

			const output = parts.join("\n");
			const truncation = truncateHead(output, {
				maxLines: DEFAULT_MAX_LINES,
				maxBytes: DEFAULT_MAX_BYTES,
			});

			let resultText = truncation.content;
			if (truncation.truncated) {
				resultText += `\n\n[Truncated: showing ${truncation.outputLines} of ${truncation.totalLines} lines]`;
			}

			return {
				content: [{ type: "text", text: resultText }],
				details: {
					urls,
					successCount: data.results.length,
					failedCount: data.failed_results.length,
				} as ExtractDetails,
			};
		},

		renderCall(args, theme) {
			let text = theme.fg("toolTitle", theme.bold("📄 extract "));
			const urls = Array.isArray(args.urls) ? args.urls : [];
			if (urls.length === 1) {
				text += theme.fg("accent", urls[0]);
			} else {
				text += theme.fg("accent", `${urls.length} URLs`);
				for (const url of urls.slice(0, 3)) {
					text += `\n  ${theme.fg("dim", url)}`;
				}
				if (urls.length > 3) text += `\n  ${theme.fg("muted", `... +${urls.length - 3} more`)}`;
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) return new Text(theme.fg("warning", "Extracting..."), 0, 0);

			const details = result.details as ExtractDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			let text = theme.fg("success", `${details.successCount} extracted`);
			if (details.failedCount > 0) {
				text += theme.fg("error", ` (${details.failedCount} failed)`);
			}

			if (expanded) {
				const content = result.content[0];
				if (content?.type === "text") {
					const lines = content.text.split("\n").slice(0, 40);
					for (const line of lines) {
						if (line.startsWith("## ")) {
							text += `\n${theme.fg("accent", line.replace("## ", ""))}`;
						} else {
							text += `\n${theme.fg("dim", line)}`;
						}
					}
					if (content.text.split("\n").length > 40) {
						text += `\n${theme.fg("muted", "... more content")}`;
					}
				}
			}

			return new Text(text, 0, 0);
		},
	});
}
