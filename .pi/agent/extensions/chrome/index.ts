/**
 * Chrome browser tools for pi -- native extension, no MCP.
 *
 * Registers the full Chrome DevTools tool surface (29 tools, including
 * Lighthouse, performance tracing and heap snapshots) directly via
 * pi.registerTool(). There is no MCP server, transport, or JSON-RPC anywhere in
 * this path.
 *
 * ARCHITECTURE
 *   pi session ─┐
 *   pi session ─┼─► unix socket ─► broker.mjs ─► ONE CDP connection ─► Chrome
 *   pi session ─┘   (plain JSON)   (single proc)   (one "Allow" prompt)
 *
 * Chrome prompts on every new CDP connection and won't persist approval
 * (ChromeDevTools/chrome-devtools-mcp#825). One shared broker means one prompt
 * per Chrome restart no matter how many pi sessions are open.
 *
 * Tool schemas are cached to tools.json, so startup registers all tools
 * instantly without waking the broker or touching Chrome. The permission prompt
 * only happens on the first actual tool call.
 *
 * AUTO-SCREENSHOT
 * Tool results can carry a screenshot the model did not ask for, on two rules:
 * the page visibly changed, or the call failed. The decision and the capture
 * both happen broker-side (see the AUTO-SCREENSHOT section in broker.mjs) --
 * only the broker holds the lock that guarantees the frame belongs to this
 * action and not to some other session's call. This side supplies the session
 * identity the broker keys change-detection baselines by, and the mode.
 *
 * Commands:  /chrome status | restart | stop | tools | autoshot [on|errors|off]
 */

import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatDimensionNote, resizeImage, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Derived from this file, never hardcoded: the extension has to work from
// ~/.pi/agent/extensions/chrome, from .pi/extensions/chrome in a project, and
// from a pi package installed under ~/.pi/agent/npm/node_modules/<pkg>.
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BROKER = path.join(ROOT, "broker.mjs");
const DEPS = path.join(ROOT, "node_modules", "chrome-devtools-mcp");

interface Descriptor {
	name: string;
	description: string;
	annotations?: { category?: string; readOnlyHint?: boolean };
	inputSchema: Record<string, unknown>;
	/** Set by the broker: this tool participates in auto-screenshot. */
	autoShot?: boolean;
}

const BATCH_TOOL = "chrome_batch";
const MAX_BATCH_STEPS = 20;

/**
 * Identifies THIS pi session to the shared broker, which keeps auto-screenshot
 * baselines per client. Two sessions driving the same tab must not suppress each
 * other's screenshots: "already seen" is a fact about a conversation, not about
 * the browser.
 */
const CLIENT_ID = `${process.pid}-${randomUUID().slice(0, 8)}`;

const AUTOSHOT_MODES = ["on", "errors", "off"] as const;
type AutoShotMode = (typeof AUTOSHOT_MODES)[number];

/**
 * Session-local, not broker-global. The broker is shared, so storing this there
 * would let one pi session silently change every other session's behaviour.
 */
let autoShotMode: AutoShotMode = (() => {
	const raw = (process.env.PI_CHROME_AUTOSHOT ?? "on").trim().toLowerCase();
	return (AUTOSHOT_MODES as readonly string[]).includes(raw) ? (raw as AutoShotMode) : "on";
})();

/**
 * Tool calls that failed but whose result still carries an image.
 *
 * pi has exactly one way to mark a tool call failed -- execute() throws -- and
 * throwing replaces the content with the message string (agent-loop's
 * createErrorToolResult), so it costs every image block. That is a real dilemma
 * for the attach-on-failure rule: the screenshot is most valuable precisely when
 * the call failed, but attaching it used to mean the failure was reported to the
 * model as a success.
 *
 * The `tool_result` event resolves it. It can override `isError` while leaving
 * content untouched, so we return normally (keeping the image) and flag the call
 * here for the handler registered in the extension entry point.
 */
const failedCalls = new Set<string>();
// If a pi build ever stops firing tool_result, this would grow without bound.
// Bounding it is cheap; the cost of being wrong is only a mis-marked error.
const FAILED_CALLS_LIMIT = 256;

interface BrokerModule {
	request: (payload: unknown, timeoutMs?: number) => Promise<any>;
	ensureBroker: (opts?: { wait?: number }) => Promise<{ started: boolean }>;
	stopBroker: () => Promise<boolean>;
	isHealthy: (timeoutMs?: number) => Promise<boolean>;
	readCachedTools: () => Descriptor[] | undefined;
}

const loadBroker = (): Promise<BrokerModule> => import(BROKER) as Promise<BrokerModule>;

/** "take_screenshot" -> "Take Screenshot" */
function labelFor(name: string): string {
	return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Tell the model that auto-screenshot exists.
 *
 * Without this it cannot know, and the observed result was that it kept doing
 * what it has always done: act, then immediately call take_screenshot to see
 * what happened. In one 44-call session six of seven take_screenshot calls came
 * directly after a tool that had ALREADY attached a frame, and four of those
 * went through filePath and then a separate read, so each redundant look cost
 * two extra tool calls on top of the duplicate image.
 *
 * The behaviour is a property of the tool, so it belongs in the tool
 * description rather than in a system prompt the user has to maintain.
 */
function augmentDescription(tool: Descriptor): string {
	// Note the earlier version of this text listed "a file on disk" among the good
	// reasons to call it, and the model promptly started passing filePath and then
	// reading the file back -- two calls and a full-resolution image to see
	// something it had already been shown. Do not enumerate tempting options.
	if (tool.name === "take_screenshot") {
		return `${tool.description}

Usually redundant: actions already attach a screenshot when they change the page or fail. Use this for a full-page or single-element capture; pass filePath only if a file on disk is genuinely the goal, since it returns a path instead of an image.`;
	}
	// Kept short on purpose: this rides along on 17 tool descriptions in every
	// request, so wording that would be fine once is expensive here.
	if (!tool.autoShot) return tool.description;
	return `${tool.description}

A screenshot is attached automatically if this visibly changes the page, or if it fails; "no visual change" in the result is reliable. Do not call take_screenshot afterwards just to look.`;
}

/* ===================================================================== *
 *  OUTPUT SAFETY BOUNDARY
 *
 *  Nothing this extension returns may be capable of killing a pi session.
 *
 *  Why this is a hard invariant and not best-effort: a tool result is written
 *  into conversation history BEFORE anything checks the provider will accept
 *  it. If it is rejected, the bad content is now permanently in history, so
 *  every later turn replays it and is rejected too. The session cannot be
 *  recovered by sending another message -- only by editing the session file.
 *  One bad tool result is total loss.
 *
 *  This boundary has already failed three separate ways:
 *    1. images emitted in Anthropic wire shape -> mimeType undefined
 *       "...image.source.base64.media_type: Field required"
 *    2. Retina screenshots forwarded at native 3024x1544
 *       "...exceed max allowed size for many-image requests: 2000 pixels"
 *    3. same class again, byte-size limit
 *
 *  Hence the rule: every tool result leaves through safeResult(), and an image
 *  block only survives if we can PROVE from its own bytes that it is within
 *  limits. We do not take the resizer's word for it -- we re-read the header of
 *  whatever it hands back. Anything unprovable is replaced with explanatory
 *  text. A missing screenshot costs one tool call; an unacceptable one costs
 *  the entire session.
 * ===================================================================== */

/** Anthropic's inline-image limits -- the tightest among providers pi targets. */
const SUPPORTED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const MAX_IMAGE_DIM = 2000;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;

/**
 * Oversized TEXT is the same failure mode with a different error string: a
 * `prompt is too long` rejection is equally unrecoverable once the text is in
 * history. evaluate_script and take_snapshot can both return unbounded output.
 */
const MAX_TEXT_CHARS = 500_000;

function normalizeMimeType(raw: unknown): string {
	if (typeof raw !== "string") return "image/png";
	const mime = raw.split(";")[0].trim().toLowerCase();
	if (mime === "image/jpg") return "image/jpeg";
	return SUPPORTED_IMAGE_MIME.has(mime) ? mime : "image/png";
}

/** Pixel dimensions straight from the file header, used for verification. */
function imageDimensions(buf: Buffer): { width: number; height: number } | null {
	try {
		if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
			return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
		}
		if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") {
			return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
		}
		if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
			const fmt = buf.toString("ascii", 12, 16);
			if (fmt === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
			if (fmt === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
			if (fmt === "VP8L") {
				const bits = buf.readUInt32LE(21);
				return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
			}
		}
		if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
			let i = 2;
			while (i + 9 < buf.length) {
				if (buf[i] !== 0xff) {
					i++;
					continue;
				}
				const marker = buf[i + 1];
				if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
					return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
				}
				const len = buf.readUInt16BE(i + 2);
				if (len <= 0) return null;
				i += 2 + len;
			}
		}
	} catch {
		/* unreadable header -> unprovable -> caller rejects the block */
	}
	return null;
}

/**
 * The proof step. True only if these exact bytes are demonstrably acceptable.
 * Unknown format, unreadable header, or any limit exceeded all mean "cannot
 * prove", and the block does not ship.
 */
function isProvablySafeImage(block: any): boolean {
	if (block?.type !== "image") return false;
	if (typeof block.data !== "string" || block.data.length === 0) return false;
	if (!SUPPORTED_IMAGE_MIME.has(block.mimeType)) return false;
	let buf: Buffer;
	try {
		buf = Buffer.from(block.data, "base64");
	} catch {
		return false;
	}
	if (buf.length === 0 || buf.length > MAX_IMAGE_BYTES) return false;
	const dims = imageDimensions(buf);
	if (!dims) return false;
	return dims.width > 0 && dims.height > 0 && dims.width <= MAX_IMAGE_DIM && dims.height <= MAX_IMAGE_DIM;
}

function textBlock(text: string): any {
	if (text.length <= MAX_TEXT_CHARS) return { type: "text", text };
	return {
		type: "text",
		text: `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Output truncated at ${MAX_TEXT_CHARS} characters. Narrow the query (for example a more specific evaluate_script) to see the rest.]`,
	};
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		// Circular or otherwise unserializable.
		return String(value);
	}
}

/**
 * Downscale a screenshot, then prove the result is acceptable.
 *
 * Chrome returns screenshots at device resolution (3024x1544 on Retina). pi's
 * own read tool uses this same helper, whose defaults (2000x2000, 4.5MB) are
 * exactly the provider limits. formatDimensionNote() tells the model how to map
 * displayed coordinates back to the real page.
 */
async function toPiImage(item: any): Promise<any[]> {
	const mimeType = normalizeMimeType(item.mimeType);
	const omitted = (why: string) => [textBlock(`[Screenshot omitted: ${why}]`)];

	if (typeof item.data !== "string" || !item.data) return omitted("tool returned an image block with no data.");

	let resized: Awaited<ReturnType<typeof resizeImage>> = null;
	try {
		resized = await resizeImage(Buffer.from(item.data, "base64"), mimeType);
	} catch {
		resized = null;
	}
	if (!resized) return omitted(`could not process ${mimeType} image to within provider limits.`);

	const block = { type: "image", data: resized.data, mimeType: normalizeMimeType(resized.mimeType) };
	// Verify rather than trust: if the resizer ever hands back something out of
	// bounds, shipping it would brick the session.
	if (!isProvablySafeImage(block)) {
		return omitted(
			`processed image could not be verified within ${MAX_IMAGE_DIM}px / ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB limits.`,
		);
	}

	const out: any[] = [];
	const note = formatDimensionNote(resized);
	if (note) out.push(textBlock(note));
	out.push(block);
	return out;
}

/**
 * chrome-devtools-mcp emits MCP-shaped content. Translate to pi's shape.
 *
 * pi's ImageContent (from @earendil-works/pi-ai) is FLAT:
 *   {type:"image", data: <base64>, mimeType: "image/png"}
 * It is NOT the Anthropic wire shape ({source:{type:"base64",media_type,data}}).
 * pi's provider layer builds the wire payload itself from `mimeType`; emitting a
 * `source` wrapper leaves `mimeType` undefined -- bug #1 above.
 */
async function toPiContent(items: any[]): Promise<any[]> {
	const out: any[] = [];
	// Guard non-arrays explicitly: a bare string is iterable, and would otherwise
	// be shredded into one content block per character.
	if (items == null) return out;
	if (!Array.isArray(items)) {
		return [textBlock(typeof items === "string" ? items : safeStringify(items))];
	}
	for (const item of items) {
		if (item?.type === "image") {
			out.push(...(await toPiImage(item)));
		} else if (item?.type === "text") {
			// Coerce: a non-string `text` is not a valid content block.
			out.push(textBlock(typeof item.text === "string" ? item.text : item.text == null ? "" : String(item.text)));
		} else if (item != null) {
			// Unknown block shape. Rendering it as text keeps the information and
			// cannot be rejected.
			out.push(textBlock(typeof item === "string" ? item : safeStringify(item)));
		}
	}
	return out;
}

/** Flatten per-step broker results into one labelled transcript. */
async function batchToPiContent(results: any[], aborted: boolean, recovery?: any[], notes?: string[]): Promise<any[]> {
	const out: any[] = [];
	const total = results.length;
	if (notes?.length) out.push(textBlock(`[auto-corrected] ${notes.join("; ")}`));
	for (const [i, step] of results.entries()) {
		const label = `step ${i + 1}/${total} · ${step.name}`;
		if (step.skipped) {
			out.push(textBlock(`--- ${label} · SKIPPED (earlier step failed) ---`));
			continue;
		}
		out.push(textBlock(`--- ${label} · ${step.isError ? "ERROR" : "ok"} ---`));
		out.push(...(await toPiContent(step.content)));
	}
	if (aborted) {
		out.push(
			textBlock(
				"--- batch aborted at the first failing step. Re-run the remaining steps once the failure is addressed. ---",
			),
		);
		if (recovery?.length) {
			out.push(
				textBlock(
					"--- current page snapshot, taken after the failure. Any uid you were holding is now stale; use the uids below to retry. ---",
				),
			);
			out.push(...(await toPiContent(recovery)));
		}
	}
	return out;
}

/**
 * THE single exit point for every Chrome tool result.
 *
 * Every `return` in every tool goes through here, so the invariant is enforced
 * in one place instead of being re-argued at each call site. The final pass
 * drops any block that is not provably valid, and the whole thing is
 * failure-proof: if rendering itself throws, a well-formed text result is still
 * returned.
 */
async function safeResult(build: () => Promise<any[]>, isError: boolean, toolCallId?: string) {
	let blocks: any[];
	try {
		blocks = await build();
	} catch (err: any) {
		blocks = [textBlock(`[chrome: failed to render tool output: ${err?.message ?? String(err)}]`)];
		isError = true;
	}

	const verified = (Array.isArray(blocks) ? blocks : []).filter((b) => {
		if (b?.type === "text") return typeof b.text === "string";
		if (b?.type === "image") return isProvablySafeImage(b);
		return false;
	});

	// A tool result with no content at all is itself invalid for some providers.
	if (!verified.length) verified.push(textBlock("(no output)"));

	/**
	 * pi only marks a tool result as failed when execute() THROWS.
	 * `AgentToolResult` is {content, details, terminate?} -- it has no isError
	 * field, so the one we used to return was silently dropped and every Chrome
	 * failure was recorded, rendered, and sent to the model as a SUCCESS. The
	 * model had to infer failure from prose, which is exactly when it starts
	 * inventing workarounds instead of retrying.
	 *
	 * Throwing is how you opt in, but pi replaces the content with the message
	 * string, so it costs any image blocks.
	 *
	 * So: throw when the payload is text-only (nothing is lost), and when an
	 * image IS present -- which now happens on every failure, by design, via the
	 * attach-on-failure rule -- return the content intact and mark the call
	 * failed out of band through the `tool_result` event instead. Falling back to
	 * throwing when we have no toolCallId to flag keeps the failure visible even
	 * if that costs the screenshot.
	 */
	if (isError) {
		const hasImage = verified.some((b) => b.type === "image");
		if (hasImage && toolCallId) {
			if (failedCalls.size >= FAILED_CALLS_LIMIT) failedCalls.clear();
			failedCalls.add(toolCallId);
			return { content: verified, details: {} };
		}
		const message = verified
			.map((b) => b.text)
			.join("\n")
			.trim();
		throw new Error(message.slice(0, MAX_TEXT_CHARS) || "Chrome tool failed");
	}
	return { content: verified, details: {} };
}

/**
 * One model turn per tool call is the real cost of driving a browser, so the
 * batch description has to make the model reach for this instead of firing the
 * same four calls one at a time. Be explicit about the case it CANNOT serve:
 * uids come from a snapshot, so any step needing a uid it doesn't already hold
 * must stay in its own turn.
 */
function batchDescription(names: string[]): string {
	return [
		"Run several Chrome tools back-to-back in ONE call, in order. Prefer this over issuing",
		"the same tools one at a time: each separate tool call costs a full round trip, and these",
		"sequences are usually decided up front.",
		"",
		"Good uses:",
		'  navigate_page -> wait_for -> take_snapshot   ("go here and show me what loaded")',
		'  fill_form -> click -> wait_for -> take_snapshot   ("submit and show the result")',
		"  emulate -> navigate_page -> take_screenshot  (responsive checks)",
		"  several evaluate_script / press_key / hover steps with no decision between them",
		"",
		"Do NOT use it when a later step needs a value you do not have yet -- above all a `uid`,",
		"which only exists after take_snapshot. Take the snapshot first, then batch the actions",
		"that use its uids. For data-dependent work inside the page, one evaluate_script can do",
		"the whole job in a single step.",
		"",
		"uids go stale. They are invalidated by navigation, re-render, and dynamic content, and a",
		"stale one fails with 'element did not become interactive'. If anything has changed the",
		"page since the snapshot those uids came from, re-snapshot before batching clicks. When a",
		"batch does abort this way it returns a fresh snapshot with it, so retry from those uids",
		"rather than switching to evaluate_script.",
		"",
		"Semantics:",
		"  - Every step is schema-validated BEFORE any of them run; if one is malformed the whole",
		"    batch is rejected untouched and every validation error is reported at once.",
		"  - Steps run sequentially and atomically: no other session's tool call interleaves.",
		"  - stopOnError (default true) skips the remaining steps after the first failure.",
		`  - Output is one labelled section per step. Max ${MAX_BATCH_STEPS} steps.`,
		"",
		`Available tools: ${names.join(", ")}`,
	].join("\n");
}

function registerBatchTool(pi: ExtensionAPI, broker: BrokerModule, descriptors: Descriptor[]) {
	const names = descriptors.map((d) => d.name).sort();
	if (!names.length) return;

	pi.registerTool({
		name: BATCH_TOOL,
		label: "Chrome Batch",
		description: batchDescription(names),
		parameters: {
			type: "object",
			properties: {
				steps: {
					type: "array",
					minItems: 1,
					maxItems: MAX_BATCH_STEPS,
					description: "Tools to run in order.",
					items: {
						type: "object",
						properties: {
							// Enumerating the names keeps the model from inventing one and
							// doubles as in-schema documentation of the callable surface.
							tool: { type: "string", enum: names, description: "Name of the Chrome tool to run." },
							params: {
								type: "object",
								additionalProperties: true,
								description: "Arguments for that tool, exactly as its own schema defines them.",
							},
						},
						required: ["tool"],
						additionalProperties: false,
					},
				},
				stopOnError: {
					type: "boolean",
					description: "Skip remaining steps after the first failure. Default true.",
				},
			},
			required: ["steps"],
			additionalProperties: false,
		} as never,
		async execute(toolCallId: string, params: any, signal: AbortSignal) {
			const steps = (params?.steps ?? []).map((s: any) => ({ name: s?.tool, params: s?.params ?? {} }));
			if (!steps.length) {
				return safeResult(async () => [textBlock("chrome_batch needs at least one step.")], true, toolCallId);
			}
			// Nesting would recurse through the broker while it holds the outer lock,
			// and buys nothing over a flat list.
			if (steps.some((s: any) => s.name === BATCH_TOOL)) {
				return safeResult(
					async () => [textBlock(`${BATCH_TOOL} cannot be nested inside itself; list the steps flat.`)],
					true,
					toolCallId,
				);
			}

			let res: any;
			try {
				await broker.ensureBroker({ wait: 30_000 });
				// A batch is N tools deep, so the single-call budget would expire early and
				// orphan a batch that is still mutating the browser.
				const timeout = Math.min(900_000, 120_000 + steps.length * 120_000);
				const call = broker.request(
					{
						op: "batch",
						steps,
						stopOnError: params?.stopOnError !== false,
						clientId: CLIENT_ID,
						autoShot: autoShotMode,
					},
					timeout,
				);
				const aborted = new Promise<never>((_, reject) => {
					if (signal?.aborted) reject(new Error("aborted"));
					signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				});
				res = await Promise.race([call, aborted]);
			} catch (err: any) {
				return safeResult(
					async () => [textBlock(`Chrome batch failed: ${err?.message ?? String(err)}`)],
					true,
					toolCallId,
				);
			}

			if (!res?.ok) {
				return safeResult(
					async () => [textBlock(`Chrome batch error: ${res?.error ?? "unknown error"}`)],
					true,
					toolCallId,
				);
			}
			const results = res.results ?? [];
			return safeResult(
				() => batchToPiContent(results, Boolean(res.aborted), res.recovery, res.notes),
				results.some((r: any) => r.isError),
				toolCallId,
			);
		},
	});
}

export default async function (pi: ExtensionAPI) {
	// Fresh clone: node_modules is gitignored, so deps may be absent. Fail loudly
	// with the exact fix instead of silently registering zero tools.
	if (!existsSync(DEPS)) {
		const fix = `(cd ${ROOT} && npm install)`;
		console.warn(`[chrome] dependencies missing - Chrome tools disabled. Fix: ${fix}`);
		pi.registerCommand("chrome", {
			description: "Chrome browser tools (dependencies not installed)",
			handler: async (_args, ctx) => {
				ctx.ui.notify(`Chrome tools disabled - dependencies not installed.\nRun: ${fix}\nThen restart pi.`, "error");
			},
		});
		return;
	}

	const broker = await loadBroker();

	// Prefer the on-disk schema cache: registering tools must never block startup
	// on the broker (which may be waiting for the user to click "Allow").
	let descriptors = broker.readCachedTools();
	if (!descriptors?.length) {
		try {
			await broker.ensureBroker({ wait: 30_000 });
			const res = await broker.request({ op: "list" }, 15_000);
			descriptors = res?.tools ?? [];
		} catch {
			descriptors = [];
		}
	}

	for (const tool of descriptors) {
		pi.registerTool({
			name: tool.name,
			label: labelFor(tool.name),
			description: autoShotMode === "off" ? tool.description : augmentDescription(tool),
			parameters: tool.inputSchema as never,
			async execute(toolCallId: string, params: unknown, signal: AbortSignal) {
				let res: any;
				try {
					// Lazy: the first call is what actually opens the CDP connection
					// (and triggers the single Chrome permission prompt).
					await broker.ensureBroker({ wait: 30_000 });

					const call = broker.request(
						{ op: "call", name: tool.name, params, clientId: CLIENT_ID, autoShot: autoShotMode },
						300_000,
					);
					const aborted = new Promise<never>((_, reject) => {
						if (signal?.aborted) reject(new Error("aborted"));
						signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					});
					res = await Promise.race([call, aborted]);
				} catch (err: any) {
					return safeResult(
						async () => [textBlock(`Chrome tool failed: ${err?.message ?? String(err)}`)],
						true,
						toolCallId,
					);
				}

				if (!res?.ok) {
					return safeResult(
						async () => [textBlock(`Chrome tool error: ${res?.error ?? "unknown error"}`)],
						true,
						toolCallId,
					);
				}
				return safeResult(() => toPiContent(res.content), Boolean(res.isError), toolCallId);
			},
		});
	}

	registerBatchTool(pi, broker, descriptors);

	/**
	 * Restores the failure marking that safeResult() gives up in order to keep an
	 * image block. See failedCalls. Scoped to calls we flagged ourselves, so it
	 * cannot touch another extension's tools.
	 */
	pi.on("tool_result", (event) => {
		if (!failedCalls.delete(event.toolCallId)) return;
		return { isError: true };
	});

	pi.registerCommand("chrome", {
		description: "Manage the Chrome browser broker (status|restart|stop|tools|autoshot)",
		handler: async (args, ctx) => {
			const cmd = (args || "status").trim();
			try {
				switch (cmd) {
					case "status": {
						if (!(await broker.isHealthy())) {
							ctx.ui.notify(
								`Chrome broker: not running (starts on first tool use) · auto-screenshot: ${autoShotMode}`,
								"info",
							);
							return;
						}
						const s = await broker.request({ op: "status" });
						let msg = `Chrome broker: running (pid ${s.pid}) · chrome connected: ${s.connected} · ${s.tools} tools`;
						msg += `\nAuto-screenshot: ${autoShotMode} (this session)`;
						if (s.autoShot) {
							// Broker-wide totals across every session sharing this browser.
							msg += ` · broker totals: ${s.autoShot.attached} attached, ${s.autoShot.skipped} skipped (no change), ${s.autoShot.errors} on failure`;
						}
						// The broker swallows errors thrown by the bundled DevTools front-end so a
						// library bug can't kill the shared CDP connection. Surface them here, or
						// they'd be invisible until someone read broker.log.
						if (s.survived?.total) {
							msg += `\nSurvived ${s.survived.total} internal error(s). Last: ${s.survived.last?.message}`;
						}
						ctx.ui.notify(msg, s.survived?.total ? "warning" : "info");
						return;
					}
					case "restart": {
						ctx.ui.notify('Restarting broker — Chrome will ask "Allow remote debugging?" once.', "info");
						// No sleep needed: stopBroker() waits for the socket to stop answering.
						await broker.stopBroker();
						await broker.ensureBroker({ wait: 30_000 });
						ctx.ui.notify("Chrome broker restarted", "info");
						return;
					}
					case "stop":
						ctx.ui.notify((await broker.stopBroker()) ? "Chrome broker stopped" : "Broker was not running", "info");
						return;
					case "tools":
						ctx.ui.notify(`${descriptors!.length} Chrome tools: ${descriptors!.map((d) => d.name).join(", ")}`, "info");
						return;
					default: {
						const [sub, value] = cmd.split(/\s+/);
						if (sub === "autoshot") {
							if (!value) {
								ctx.ui.notify(`Auto-screenshot: ${autoShotMode}. Set with /chrome autoshot on|errors|off`, "info");
								return;
							}
							if (!(AUTOSHOT_MODES as readonly string[]).includes(value)) {
								ctx.ui.notify(`Unknown mode '${value}'. Use on|errors|off.`, "error");
								return;
							}
							autoShotMode = value as AutoShotMode;
							ctx.ui.notify(
								autoShotMode === "on"
									? "Auto-screenshot: on — a frame is attached after a visual tool only when the page actually changed, and always when a call fails."
									: autoShotMode === "errors"
										? "Auto-screenshot: errors — frames are attached only when a call fails."
										: "Auto-screenshot: off — use take_screenshot explicitly.",
								"info",
							);
							return;
						}
						ctx.ui.notify(`Unknown subcommand '${cmd}'. Use status|restart|stop|tools|autoshot.`, "error");
					}
				}
			} catch (err: any) {
				ctx.ui.notify(`chrome ${cmd} failed: ${err?.message ?? err}`, "error");
			}
		},
	});
}
