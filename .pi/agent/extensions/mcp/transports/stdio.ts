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

export class StdioTransport implements MCPTransport {
	#process: ChildProcessWithoutNullStreams | null = null;
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

		this.#process = spawn(this.config.command, this.config.args ?? [], {
			cwd: this.config.cwd,
			env: {
				...process.env,
				...(this.config.env ?? {}),
			},
			stdio: ["pipe", "pipe", "pipe"],
			shell: false,
		});

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

		if ("id" in message && message.id !== undefined) {
			const pending = this.#pending.get(message.id);
			if (!pending) {
				return;
			}
			this.#cleanupPending(message.id, pending);
			if ("error" in message && message.error) {
				pending.reject(new Error(`MCP error ${message.error.code}: ${message.error.message}`));
				return;
			}
			pending.resolve((message as { result?: unknown }).result);
			return;
		}

		if ("method" in message) {
			this.onNotification?.(message.method, message.params);
		}
	}

	#cleanupPending(id: string | number, pending: PendingRequest): void {
		clearTimeout(pending.timeout);
		if (pending.abortSignal && pending.onAbort) {
			pending.abortSignal.removeEventListener("abort", pending.onAbort);
		}
		this.#pending.delete(id);
	}

	#handleProcessError(error: Error): void {
		this.onError?.(error);
		this.#rejectPending(error);
		this.#connected = false;
		this.onClose?.();
	}

	#handleProcessClose(): void {
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
		this.#process = null;

		await new Promise<void>((resolve) => {
			let settled = false;
			const finish = () => {
				if (settled) {
					return;
				}
				settled = true;
				resolve();
			};

			processRef.once("close", finish);
			processRef.kill("SIGTERM");
			setTimeout(() => {
				if (!settled) {
					processRef.kill("SIGKILL");
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
