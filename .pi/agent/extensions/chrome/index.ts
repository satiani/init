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
 * Commands:  /chrome status | restart | stop | tools
 */

import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ROOT = path.join(os.homedir(), ".pi", "agent", "extensions", "chrome");
const BROKER = path.join(ROOT, "broker.mjs");
const DEPS = path.join(ROOT, "node_modules", "chrome-devtools-mcp");

interface Descriptor {
	name: string;
	description: string;
	annotations?: { category?: string; readOnlyHint?: boolean };
	inputSchema: Record<string, unknown>;
}

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
 * chrome-devtools-mcp emits MCP-shaped content. Translate to pi's shape:
 *   {type:"image", data, mimeType} -> {type:"image", source:{type:"base64",...}}
 */
function toPiContent(items: any[]): any[] {
	const out: any[] = [];
	for (const item of items ?? []) {
		if (item?.type === "image" && item.data) {
			out.push({
				type: "image",
				source: { type: "base64", mediaType: item.mimeType ?? "image/png", data: item.data },
			});
		} else if (item?.type === "text") {
			out.push({ type: "text", text: item.text ?? "" });
		} else if (item != null) {
			out.push({ type: "text", text: typeof item === "string" ? item : JSON.stringify(item) });
		}
	}
	return out.length ? out : [{ type: "text", text: "(no output)" }];
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
			description: tool.description,
			parameters: tool.inputSchema as never,
			async execute(_toolCallId: string, params: unknown, signal: AbortSignal) {
				try {
					// Lazy: the first call is what actually opens the CDP connection
					// (and triggers the single Chrome permission prompt).
					await broker.ensureBroker({ wait: 30_000 });

					const call = broker.request({ op: "call", name: tool.name, params }, 300_000);
					const aborted = new Promise<never>((_, reject) => {
						if (signal?.aborted) reject(new Error("aborted"));
						signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
					});
					const res = await Promise.race([call, aborted]);

					if (!res?.ok) {
						return {
							content: [{ type: "text", text: `Chrome tool error: ${res?.error ?? "unknown error"}` }],
							details: {},
							isError: true,
						};
					}
					return { content: toPiContent(res.content), details: {}, isError: Boolean(res.isError) };
				} catch (err: any) {
					return {
						content: [{ type: "text", text: `Chrome tool failed: ${err?.message ?? String(err)}` }],
						details: {},
						isError: true,
					};
				}
			},
		});
	}

	pi.registerCommand("chrome", {
		description: "Manage the Chrome browser broker (status|restart|stop|tools)",
		handler: async (args, ctx) => {
			const cmd = (args || "status").trim();
			try {
				switch (cmd) {
					case "status": {
						if (!(await broker.isHealthy())) {
							ctx.ui.notify("Chrome broker: not running (starts on first tool use)", "info");
							return;
						}
						const s = await broker.request({ op: "status" });
						ctx.ui.notify(
							`Chrome broker: running (pid ${s.pid}) · chrome connected: ${s.connected} · ${s.tools} tools`,
							"info",
						);
						return;
					}
					case "restart": {
						ctx.ui.notify('Restarting broker — Chrome will ask "Allow remote debugging?" once.', "info");
						await broker.stopBroker();
						await new Promise((r) => setTimeout(r, 500));
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
					default:
						ctx.ui.notify(`Unknown subcommand '${cmd}'. Use status|restart|stop|tools.`, "error");
				}
			} catch (err: any) {
				ctx.ui.notify(`chrome ${cmd} failed: ${err?.message ?? err}`, "error");
			}
		},
	});
}
