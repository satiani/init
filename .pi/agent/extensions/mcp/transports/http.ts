import type { JsonRpcMessage, JsonRpcResponse, MCPRequestOptions, MCPResolvedServerConfig, MCPTransport } from "../types";

interface SseEvent {
	event: string;
	data: string;
}

async function* parseSseEvents(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseEvent> {
	const reader = stream.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		for (;;) {
			if (signal?.aborted) {
				return;
			}

			const { done, value } = await reader.read();
			if (done) {
				break;
			}

			buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n").replace(/\r/g, "\n");

			let separatorIndex = buffer.indexOf("\n\n");
			while (separatorIndex >= 0) {
				const block = buffer.slice(0, separatorIndex);
				buffer = buffer.slice(separatorIndex + 2);

				let event = "message";
				const dataParts: string[] = [];
				for (const line of block.split(/\r?\n/u)) {
					if (!line || line.startsWith(":")) {
						continue;
					}
					if (line.startsWith("event:")) {
						event = line.slice(6).trim();
						continue;
					}
					if (line.startsWith("data:")) {
						dataParts.push(line.slice(5).trimStart());
					}
				}
				yield {
					event,
					data: dataParts.join("\n"),
				};

				separatorIndex = buffer.indexOf("\n\n");
			}
		}
	} finally {
		reader.releaseLock();
	}
}

async function* parseSseJson(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<JsonRpcMessage> {
	for await (const event of parseSseEvents(stream, signal)) {
		if (!event.data) {
			continue;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(event.data) as unknown;
		} catch {
			continue;
		}
		if (typeof parsed === "object" && parsed !== null) {
			yield parsed as JsonRpcMessage;
		}
	}
}

function buildTimeoutSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
	const timeoutSignal = AbortSignal.timeout(timeoutMs);
	if (!externalSignal) {
		return timeoutSignal;
	}
	return AbortSignal.any([timeoutSignal, externalSignal]);
}

export class HttpTransport implements MCPTransport {
	#connected = false;
	#sessionId: string | null = null;
	#sseAbortController: AbortController | null = null;

	onClose?: () => void;
	onError?: (error: Error) => void;
	onNotification?: (method: string, params: unknown) => void;

	constructor(private readonly config: MCPResolvedServerConfig) {
		if (config.type !== "http" && config.type !== "sse") {
			throw new Error(`Cannot create http transport for server type: ${config.type}`);
		}
	}

	get connected(): boolean {
		return this.#connected;
	}

	async connect(): Promise<void> {
		this.#connected = true;
	}

	async startSSEListener(): Promise<void> {
		if (!this.#connected || this.#sseAbortController) {
			return;
		}

		this.#sseAbortController = new AbortController();
		const signal = this.#sseAbortController.signal;

		const headers: Record<string, string> = {
			Accept: "text/event-stream",
			...(this.config.headers ?? {}),
		};
		if (this.#sessionId) {
			headers["Mcp-Session-Id"] = this.#sessionId;
		}

		try {
			const response = await fetch(this.config.url, {
				method: "GET",
				headers,
				signal,
			});
			if (!response.ok || !response.body) {
				// SSE GET is optional in Streamable HTTP — silently give up
				// without tearing down the working request/response connection
				return;
			}
			const serverSessionId = response.headers.get("Mcp-Session-Id");
			if (serverSessionId) {
				this.#sessionId = serverSessionId;
			}
			for await (const message of parseSseJson(response.body, signal)) {
				if (!this.#connected) {
					break;
				}
				if ("method" in message && !("id" in message)) {
					this.onNotification?.(message.method, message.params);
				}
			}
		} catch (error) {
			if (signal.aborted) {
				return;
			}
			// SSE listener is best-effort; don't tear down the connection
			// if the initial GET fails or throws
		} finally {
			this.#sseAbortController = null;
		}
	}

	async request<T = unknown>(
		method: string,
		params?: Record<string, unknown>,
		options?: MCPRequestOptions,
	): Promise<T> {
		if (!this.#connected) {
			throw new Error("MCP http transport is not connected");
		}

		const requestId = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
		const timeoutSignal = buildTimeoutSignal(this.config.timeout, options?.signal);

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(this.config.headers ?? {}),
		};
		if (this.#sessionId) {
			headers["Mcp-Session-Id"] = this.#sessionId;
		}

		let response: Response;
		try {
			response = await fetch(this.config.url, {
				method: "POST",
				headers,
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: requestId,
					method,
					params: params ?? {},
				}),
				signal: timeoutSignal,
			});
		} catch (error) {
			if (timeoutSignal.aborted) {
				if (options?.signal?.aborted) {
					throw new Error("MCP request aborted");
				}
				throw new Error(`MCP request timed out after ${this.config.timeout}ms`);
			}
			throw error;
		}

		const responseSessionId = response.headers.get("Mcp-Session-Id");
		if (responseSessionId) {
			this.#sessionId = responseSessionId;
		}

		if (!response.ok) {
			const responseText = await response.text();
			const wwwAuthenticate = response.headers.get("WWW-Authenticate");
			const mcpAuthServer = response.headers.get("Mcp-Auth-Server");
			const hints = [
				wwwAuthenticate ? `WWW-Authenticate: ${wwwAuthenticate}` : undefined,
				mcpAuthServer ? `Mcp-Auth-Server: ${mcpAuthServer}` : undefined,
			]
				.filter((entry): entry is string => Boolean(entry))
				.join("; ");
			const suffix = hints ? ` [${hints}]` : "";
			throw new Error(`HTTP ${response.status}: ${responseText}${suffix}`);
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (contentType.includes("text/event-stream")) {
			if (!response.body) {
				throw new Error("MCP response had no SSE body");
			}
			for await (const message of parseSseJson(response.body, timeoutSignal)) {
				if ("id" in message && message.id === requestId) {
					const rpcResponse = message as JsonRpcResponse;
					if (rpcResponse.error) {
						throw new Error(`MCP error ${rpcResponse.error.code}: ${rpcResponse.error.message}`);
					}
					return rpcResponse.result as T;
				}
				if ("method" in message && !("id" in message)) {
					this.onNotification?.(message.method, message.params);
				}
			}
			throw new Error("MCP SSE response ended before matching result was received");
		}

		const responseBody = (await response.json()) as JsonRpcResponse;
		if (responseBody.error) {
			throw new Error(`MCP error ${responseBody.error.code}: ${responseBody.error.message}`);
		}
		return responseBody.result as T;
	}

	async notify(method: string, params?: Record<string, unknown>): Promise<void> {
		if (!this.#connected) {
			throw new Error("MCP http transport is not connected");
		}

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(this.config.headers ?? {}),
		};
		if (this.#sessionId) {
			headers["Mcp-Session-Id"] = this.#sessionId;
		}

		const response = await fetch(this.config.url, {
			method: "POST",
			headers,
			body: JSON.stringify({
				jsonrpc: "2.0",
				method,
				params: params ?? {},
			}),
			signal: AbortSignal.timeout(this.config.timeout),
		});
		if (!response.ok && response.status !== 202) {
			const body = await response.text();
			throw new Error(`HTTP ${response.status}: ${body}`);
		}
	}

	async close(): Promise<void> {
		const wasConnected = this.#connected;
		if (!this.#connected && !this.#sseAbortController && !this.#sessionId) {
			return;
		}
		this.#connected = false;

		if (this.#sseAbortController) {
			this.#sseAbortController.abort();
			this.#sseAbortController = null;
		}

		if (this.#sessionId) {
			const headers: Record<string, string> = {
				...(this.config.headers ?? {}),
				"Mcp-Session-Id": this.#sessionId,
			};
			await fetch(this.config.url, {
				method: "DELETE",
				headers,
				signal: AbortSignal.timeout(this.config.timeout),
			}).catch(() => undefined);
			this.#sessionId = null;
		}

		if (wasConnected) {
			this.onClose?.();
		}
	}
}

export async function createHttpTransport(config: MCPResolvedServerConfig): Promise<HttpTransport> {
	const transport = new HttpTransport(config);
	await transport.connect();
	return transport;
}
