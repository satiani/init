#!/usr/bin/env node
/**
 * Chrome tool broker.
 *
 * WHY THIS PROCESS EXISTS
 * -----------------------
 * Chrome shows an "Allow remote debugging?" dialog for EVERY new CDP connection
 * and Google declined to make approval persistent
 * (ChromeDevTools/chrome-devtools-mcp#825, closed as not planned).
 *
 * pi runs one process per session, and several sessions are typically open at
 * once. If each pi process opened its own CDP connection, each one would prompt.
 * So exactly one broker holds the single approved CDP connection, and every pi
 * session talks to it over a unix socket.
 *
 * NO MCP ANYWHERE
 * ---------------
 * There is no MCP server, transport, or JSON-RPC here. The wire protocol is a
 * single newline-terminated JSON request/response per connection.
 *
 * The `chrome-devtools-mcp` npm package is used strictly as a *library* for its
 * tool implementations (Lighthouse, trace processing, a11y snapshots, etc.).
 * Nothing in it speaks MCP in this path -- we import the tool definitions and
 * the ToolHandler glue directly.
 *
 * PROTOCOL
 *   -> {"op":"list"}                      <- {"ok":true,"tools":[{name,description,inputSchema,annotations}]}
 *   -> {"op":"call","name":..,"params":{}} <- {"ok":true,"content":[...],"isError":bool}
 *   -> {"op":"status"}                    <- {"ok":true,"pid":..,"connected":bool,"tools":N}
 *   -> {"op":"stop"}                      <- {"ok":true}
 *
 * `list` deliberately does NOT touch Chrome, so pi can register tools at startup
 * without triggering the permission dialog. The dialog happens on the first real
 * tool call.
 */

import { connect, createServer } from "node:net";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
export const SOCKET = path.join(DIR, "broker.sock");
const PID_FILE = path.join(DIR, "broker.pid");
const LOG_FILE = path.join(DIR, "broker.log");
const CACHE_FILE = path.join(DIR, "tools.json");

const PKG = path.join(DIR, "node_modules", "chrome-devtools-mcp", "build", "src");

/**
 * Flags the upstream tool implementations read. Mirrors chrome-devtools-mcp's
 * CLI defaults, with these deliberate choices:
 *   autoConnect            -> attach to the already-running Chrome (real profile)
 *   allowUnrestrictedPaths -> screenshots/traces can be written outside /tmp
 *                             (the MCP path warned about this because pi never
 *                             negotiated the MCP "roots" capability)
 *   usageStatistics        -> off
 *   categoryExtensions     -> unsupported over autoConnect until Chrome 149
 */
const SERVER_ARGS = {
	autoConnect: true,
	channel: "stable",
	usageStatistics: false,
	performanceCrux: true,
	allowUnrestrictedPaths: true,
	redactNetworkHeaders: true,
	slim: false,
	viaCli: false,
	experimentalPageIdRouting: false,
	experimentalIncludeAllPages: false,
	categoryInput: true,
	categoryNavigation: true,
	categoryEmulation: true,
	categoryPerformance: true,
	categoryNetwork: true,
	categoryDebugging: true,
	categoryMemory: true,
	categoryExtensions: false,
	categoryExperimentalThirdParty: false,
	categoryExperimentalWebmcp: false,
};

// ---------------------------------------------------------------- server side

async function buildServer() {
	const [{ ensureBrowserConnected }, { McpContext }, { createTools }, { ToolHandler }, { Mutex }, { zodToJsonSchema }] =
		await Promise.all([
			import(path.join(PKG, "browser.js")),
			import(path.join(PKG, "McpContext.js")),
			import(path.join(PKG, "tools", "tools.js")),
			import(path.join(PKG, "ToolHandler.js")),
			import(path.join(PKG, "utils", "Mutex.js")),
			import("zod-to-json-schema"),
		]);

	let context;
	let browser;

	async function getContext() {
		const next = await ensureBrowserConnected({ channel: SERVER_ARGS.channel });
		if (context?.browser !== next) {
			// Browser restarted or first use -> (re)build the context.
			context = await McpContext.from(next, undefined, {
				performanceCrux: SERVER_ARGS.performanceCrux,
				allowUnrestrictedPaths: SERVER_ARGS.allowUnrestrictedPaths,
				reconnected: context !== undefined,
			});
		}
		browser = next;
		return context;
	}

	const mutex = new Mutex();
	const handlers = new Map();
	const descriptors = [];

	for (const tool of createTools(SERVER_ARGS)) {
		const handler = new ToolHandler(tool, SERVER_ARGS, getContext, mutex);
		if (!handler.shouldRegister) continue;
		handlers.set(tool.name, handler);
		let inputSchema;
		try {
			inputSchema = zodToJsonSchema(handler.registeredInputSchema, { $refStrategy: "none" });
		} catch {
			inputSchema = { type: "object", properties: {}, additionalProperties: true };
		}
		delete inputSchema.$schema;
		descriptors.push({
			name: tool.name,
			description: tool.description,
			annotations: tool.annotations ?? {},
			inputSchema,
		});
	}

	return {
		descriptors,
		isConnected: () => Boolean(browser?.connected),
		call: async (name, params) => {
			const handler = handlers.get(name);
			if (!handler) throw new Error(`Unknown tool: ${name}`);
			// The MCP SDK normally zod-parses params before invoking the handler, which
			// is what APPLIES SCHEMA DEFAULTS (e.g. take_screenshot's `format: "png"`).
			// ToolHandler.handle() does not do this itself, so parse here or tools
			// silently receive `undefined` for defaulted fields.
			let parsed = params ?? {};
			try {
				parsed = handler.registeredInputSchema.parse(parsed);
			} catch (err) {
				const issues = (err?.issues ?? [])
					.map((i) => `${i.path?.join(".") || "(root)"}: ${i.message}`)
					.join("; ");
				return {
					content: [{ type: "text", text: `Invalid arguments for ${name}: ${issues || err?.message}` }],
					isError: true,
				};
			}
			return await handler.handle(parsed);
		},
	};
}

async function serve() {
	const server = await buildServer();
	// Cache descriptors so pi sessions can register tools instantly (and offline)
	// without waiting on, or waking, the broker.
	writeFileSync(CACHE_FILE, JSON.stringify(server.descriptors, null, 2));

	if (existsSync(SOCKET)) {
		try {
			unlinkSync(SOCKET);
		} catch {
			/* ignore */
		}
	}

	const net = createServer((socket) => {
		let buf = "";
		socket.on("data", async (chunk) => {
			buf += chunk;
			const nl = buf.indexOf("\n");
			if (nl < 0) return;
			let req;
			try {
				req = JSON.parse(buf.slice(0, nl));
			} catch (err) {
				socket.end(JSON.stringify({ ok: false, error: `bad request: ${err.message}` }) + "\n");
				return;
			}
			let res;
			try {
				switch (req.op) {
					case "list":
						res = { ok: true, tools: server.descriptors };
						break;
					case "status":
						res = { ok: true, pid: process.pid, connected: server.isConnected(), tools: server.descriptors.length };
						break;
					case "stop":
						res = { ok: true };
						setTimeout(() => process.exit(0), 50);
						break;
					case "call": {
						const out = await server.call(req.name, req.params);
						res = { ok: true, content: out.content ?? [], isError: Boolean(out.isError) };
						break;
					}
					default:
						res = { ok: false, error: `unknown op: ${req.op}` };
				}
			} catch (err) {
				res = { ok: false, error: err?.message ?? String(err) };
			}
			socket.end(JSON.stringify(res) + "\n");
		});
		socket.on("error", () => undefined);
	});

	net.listen(SOCKET, () => {
		writeFileSync(PID_FILE, String(process.pid));
		console.log(`[chrome-broker] listening on ${SOCKET} (${server.descriptors.length} tools)`);
	});

	const shutdown = () => {
		try {
			net.close();
		} catch {
			/* ignore */
		}
		rmSync(SOCKET, { force: true });
		rmSync(PID_FILE, { force: true });
		process.exit(0);
	};
	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

// ---------------------------------------------------------------- client side

export function request(payload, timeoutMs = 180_000) {
	return new Promise((resolve, reject) => {
		const socket = connect(SOCKET);
		let buf = "";
		const timer = setTimeout(() => {
			socket.destroy();
			reject(new Error(`broker timeout after ${timeoutMs}ms`));
		}, timeoutMs);
		socket.on("connect", () => socket.write(JSON.stringify(payload) + "\n"));
		socket.on("data", (d) => (buf += d));
		socket.on("end", () => {
			clearTimeout(timer);
			try {
				resolve(JSON.parse(buf));
			} catch (err) {
				reject(new Error(`bad broker response: ${err.message}`));
			}
		});
		socket.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

export function readPid() {
	try {
		const pid = Number(readFileSync(PID_FILE, "utf8").trim());
		process.kill(pid, 0);
		return pid;
	} catch {
		return undefined;
	}
}

export function readCachedTools() {
	try {
		return JSON.parse(readFileSync(CACHE_FILE, "utf8"));
	} catch {
		return undefined;
	}
}

export async function isHealthy(timeoutMs = 3000) {
	try {
		const r = await request({ op: "status" }, timeoutMs);
		return Boolean(r?.ok);
	} catch {
		return false;
	}
}

/** Start the broker detached if it isn't already answering. Idempotent. */
export async function ensureBroker({ wait = 20_000 } = {}) {
	if (await isHealthy(2000)) return { started: false };

	// Stale socket/pid from a crashed broker.
	if (!readPid()) rmSync(SOCKET, { force: true });

	mkdirSync(DIR, { recursive: true });
	const logFd = openSync(LOG_FILE, "a");
	const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "serve"], {
		detached: true,
		stdio: ["ignore", logFd, logFd],
	});
	child.unref();

	const deadline = Date.now() + wait;
	while (Date.now() < deadline) {
		if (await isHealthy(1500)) return { started: true };
		await new Promise((r) => setTimeout(r, 300));
	}
	throw new Error(`broker did not come up within ${Math.round(wait / 1000)}s (see ${LOG_FILE})`);
}

export async function stopBroker() {
	if (!(await isHealthy(2000))) {
		rmSync(SOCKET, { force: true });
		rmSync(PID_FILE, { force: true });
		return false;
	}
	await request({ op: "stop" }, 5000).catch(() => undefined);
	return true;
}

// ---------------------------------------------------------------------- CLI

async function main() {
	const cmd = process.argv[2] ?? "status";
	switch (cmd) {
		case "serve":
			await serve();
			break;
		case "ensure": {
			const r = await ensureBroker();
			console.log(r.started ? "started" : "already running");
			break;
		}
		case "status": {
			const healthy = await isHealthy();
			if (!healthy) {
				console.log("broker: not running");
				process.exit(1);
			}
			const r = await request({ op: "status" });
			console.log(`broker: running (pid ${r.pid}), chrome connected: ${r.connected}, tools: ${r.tools}`);
			break;
		}
		case "stop":
			console.log((await stopBroker()) ? "stopped" : "not running");
			break;
		case "restart":
			await stopBroker();
			await new Promise((r) => setTimeout(r, 500));
			await ensureBroker();
			console.log("restarted");
			break;
		case "tools": {
			const r = await request({ op: "list" });
			for (const t of r.tools) console.log(`${t.name.padEnd(28)} ${t.annotations?.category ?? ""}`);
			console.log(`\n${r.tools.length} tools`);
			break;
		}
		default:
			console.error("usage: broker.mjs [serve|ensure|status|stop|restart|tools]");
			process.exit(2);
	}
}

if (process.argv[1] && path.basename(process.argv[1]) === "broker.mjs") {
	main().catch((err) => {
		console.error(`[chrome-broker] ${err.message}`);
		process.exit(1);
	});
}
