import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { JsonRpcMessage, MCPRequestOptions, MCPResolvedServerConfig, MCPTransport } from "../types";

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
	timeout: NodeJS.Timeout;
	abortSignal?: AbortSignal;
	onAbort?: () => void;
}

function ensureMessageError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}

// On POSIX, when a child is spawned with `detached: true` it becomes the leader of
// a new process group whose pgid equals its pid. `process.kill(-pgid, signal)`
// signals every process in that group, which is essential for cleaning up
// multi-layer wrappers like `npx -y <pkg>` (sh -> npm exec -> server -> watchdog).
function killProcessGroup(pid: number, signal: NodeJS.Signals): boolean {
	try {
		process.kill(-pid, signal);
		return true;
	} catch {
		return false;
	}
}

// Synchronous last-ditch cleanup. We hook only `process.on('exit')` because
// it fires whenever Node is already on the way out (normal completion,
// process.exit(), or default signal handling), without altering shutdown
// semantics. We deliberately do NOT install SIGINT/SIGTERM/SIGHUP listeners:
// adding any listener for those signals suppresses Node's default exit
// behavior, which would make pi unkillable from those signals. SIGKILL of pi
// itself is uncatchable; that case would still leak children and is the only
// remaining path that requires an external watchdog to fully address.
const liveChildPgids = new Set<number>();
let exitHandlerInstalled = false;
function ensureExitHandlerInstalled(): void {
	if (exitHandlerInstalled) return;
	exitHandlerInstalled = true;
	process.on("exit", () => {
		for (const pgid of liveChildPgids) {
			if (!killProcessGroup(pgid, "SIGTERM")) {
				try { process.kill(pgid, "SIGTERM"); } catch { /* ignore */ }
			}
		}
	});
}

export class StdioTransport implements MCPTransport {
	#process: ChildProcessWithoutNullStreams | null = null;
	#childPid: number | null = null;
	#stdoutLineReader: Interface | null = null;
	#stderrLineReader: Interface | null = null;
	#pending = new Map<string | number, PendingRequest>();
	#connected = false;
	#requestCounter = 0;

	onClose?: () => void;
	onError?: (error: Error) => void;
	onNotification?: (method: string, params: unknown) => void;

	constructor(private readonly config: MCPResolvedServerConfig) {}

	get connected(): boolean {
		return this.#connected;
	}

	async connect(): Promise<void> {
		if (this.#connected) {
			return;
		}
		if (this.config.type !== "stdio") {
			throw new Error(`Cannot create stdio transport for non-stdio server type: ${this.config.type}`);
		}

		ensureExitHandlerInstalled();

		this.#process = spawn(this.config.command, this.config.args ?? [], {
			cwd: this.config.cwd,
			env: {
				...process.env,
				...(this.config.env ?? {}),
			},
			stdio: ["pipe", "pipe", "pipe"],
			shell: false,
			// Place the child in its own process group so we can signal it and
			// every grandchild (e.g. `npx` wrappers) atomically on shutdown.
			detached: true,
		});

		const spawnedPid = this.#process.pid ?? null;
		this.#childPid = spawnedPid;
		if (typeof spawnedPid === "number") {
			liveChildPgids.add(spawnedPid);
		}

		this.#connected = true;

		this.#stdoutLineReader = createInterface({ input: this.#process.stdout });
		this.#stdoutLineReader.on("line", (line) => {
			this.#handleStdoutLine(line);
		});

		this.#stderrLineReader = createInterface({ input: this.#process.stderr });
		this.#stderrLineReader.on("line", () => {
			// MCP servers often write diagnostics to stderr. We intentionally ignore by default.
		});

		this.#process.on("error", (error) => {
			this.#handleProcessError(error);
		});
		this.#process.on("close", () => {
			this.#handleProcessClose();
		});
	}

	#handleStdoutLine(line: string): void {
		if (!line.trim()) {
			return;
		}

		let message: JsonRpcMessage;
		try {
			message = JSON.parse(line) as JsonRpcMessage;
		} catch {
			return;
		}

		const hasId = "id" in message && message.id !== undefined;
		const hasMethod = "method" in message && typeof (message as { method?: unknown }).method === "string";

		// JSON-RPC framing:
		//   request      = id + method   (server -> client; expects a response)
		//   response     = id only       (server's reply to a client request)
		//   notification = method only   (no response expected)
		// Routing requests through the response branch silently dropped
		// server->client requests like roots/list, which made spec-compliant
		// servers (e.g. chrome-devtools-mcp) wait their full ~60 s internal
		// timeout on every tool call before letting the tool run.
		if (hasId && hasMethod) {
			const id = (message as { id: string | number }).id;
			const method = (message as { method: string }).method;
			// We don't currently dispatch any server->client requests. Reply with
			// JSON-RPC "Method not found" (-32601) so the server can resolve its
			// pending promise immediately instead of waiting on its own timeout.
			const errorReply = {
				jsonrpc: "2.0" as const,
				id,
				error: {
					code: -32601,
					message: `Method not found: ${method}`,
				},
			};
			try {
				this.#process?.stdin.write(`${JSON.stringify(errorReply)}\n`);
			} catch {
				/* ignore: server may have closed; pending requests will reject elsewhere */
			}
			return;
		}

		if (hasId) {
			const id = (message as { id: string | number }).id;
			const pending = this.#pending.get(id);
			if (!pending) {
				return;
			}
			this.#cleanupPending(id, pending);
			if ("error" in message && (message as { error?: { code?: number; message?: string } }).error) {
				const err = (message as { error: { code?: number; message?: string } }).error;
				pending.reject(new Error(`MCP error ${err.code}: ${err.message}`));
				return;
			}
			pending.resolve((message as { result?: unknown }).result);
			return;
		}

		if (hasMethod) {
			const method = (message as { method: string }).method;
			this.onNotification?.(method, (message as { params?: unknown }).params);
		}
	}

	#cleanupPending(id: string | number, pending: PendingRequest): void {
		clearTimeout(pending.timeout);
		if (pending.abortSignal && pending.onAbort) {
			pending.abortSignal.removeEventListener("abort", pending.onAbort);
		}
		this.#pending.delete(id);
	}

	#forgetLivePgid(): void {
		if (typeof this.#childPid === "number") {
			liveChildPgids.delete(this.#childPid);
			this.#childPid = null;
		}
	}

	#handleProcessError(error: Error): void {
		this.#forgetLivePgid();
		this.onError?.(error);
		this.#rejectPending(error);
		this.#connected = false;
		this.onClose?.();
	}

	#handleProcessClose(): void {
		this.#forgetLivePgid();
		if (!this.#connected) {
			return;
		}
		this.#connected = false;
		this.#rejectPending(new Error("MCP stdio transport closed"));
		this.onClose?.();
	}

	#rejectPending(error: Error): void {
		for (const [id, pending] of this.#pending.entries()) {
			this.#cleanupPending(id, pending);
			pending.reject(error);
		}
	}

	#nextRequestId(): string {
		this.#requestCounter += 1;
		return `${Date.now()}-${this.#requestCounter}`;
	}

	async request<T = unknown>(
		method: string,
		params?: Record<string, unknown>,
		options?: MCPRequestOptions,
	): Promise<T> {
		if (!this.#connected || !this.#process) {
			throw new Error("MCP stdio transport is not connected");
		}
		const signal = options?.signal;
		if (signal?.aborted) {
			throw ensureMessageError(signal.reason ?? "Request aborted");
		}

		const id = this.#nextRequestId();
		const timeoutMs = this.config.timeout;

		const requestPayload = {
			jsonrpc: "2.0" as const,
			id,
			method,
			params: params ?? {},
		};

		return new Promise<T>((resolve, reject) => {
			const timeout = setTimeout(() => {
				const pending = this.#pending.get(id);
				if (!pending) {
					return;
				}
				this.#cleanupPending(id, pending);
				reject(new Error(`MCP request timed out after ${timeoutMs}ms`));
			}, timeoutMs);

			const onAbort = () => {
				const pending = this.#pending.get(id);
				if (!pending) {
					return;
				}
				this.#cleanupPending(id, pending);
				reject(ensureMessageError(signal?.reason ?? "Request aborted"));
			};

			if (signal) {
				signal.addEventListener("abort", onAbort, { once: true });
			}

			this.#pending.set(id, {
				resolve,
				reject,
				timeout,
				abortSignal: signal,
				onAbort,
			});

			const serialized = `${JSON.stringify(requestPayload)}\n`;
			this.#process?.stdin.write(serialized, (error) => {
				if (!error) {
					return;
				}
				const pending = this.#pending.get(id);
				if (!pending) {
					return;
				}
				this.#cleanupPending(id, pending);
				reject(ensureMessageError(error));
			});
		});
	}

	async notify(method: string, params?: Record<string, unknown>): Promise<void> {
		if (!this.#connected || !this.#process) {
			throw new Error("MCP stdio transport is not connected");
		}
		const payload = {
			jsonrpc: "2.0" as const,
			method,
			params: params ?? {},
		};

		await new Promise<void>((resolve, reject) => {
			this.#process?.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
				if (error) {
					reject(ensureMessageError(error));
					return;
				}
				resolve();
			});
		});
	}

	async close(): Promise<void> {
		if (!this.#process) {
			this.#connected = false;
			return;
		}

		this.#connected = false;
		this.#rejectPending(new Error("MCP stdio transport closed"));

		this.#stdoutLineReader?.close();
		this.#stderrLineReader?.close();
		this.#stdoutLineReader = null;
		this.#stderrLineReader = null;

		const processRef = this.#process;
		const pgid = this.#childPid;
		this.#process = null;
		this.#childPid = null;

		const signalGroupOrChild = (signal: NodeJS.Signals): void => {
			if (typeof pgid === "number" && killProcessGroup(pgid, signal)) {
				return;
			}
			try {
				processRef.kill(signal);
			} catch {
				/* ignore */
			}
		};

		try {
			// Closing stdin gives well-behaved MCP servers a chance to exit cleanly.
			processRef.stdin?.end();
		} catch {
			/* ignore */
		}

		await new Promise<void>((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) {
					return;
				}
				settled = true;
				if (typeof pgid === "number") {
					liveChildPgids.delete(pgid);
				}
				resolve();
			};

			processRef.once("close", finish);
			signalGroupOrChild("SIGTERM");
			setTimeout(() => {
				if (!settled) {
					signalGroupOrChild("SIGKILL");
					finish();
				}
			}, 500);
		});
	}
}

export async function createStdioTransport(config: MCPResolvedServerConfig): Promise<StdioTransport> {
	const transport = new StdioTransport(config);
	await transport.connect();
	return transport;
}
