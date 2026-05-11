import { createHttpTransport } from "./transports/http";
import { createStdioTransport } from "./transports/stdio";
import type {
	MCPGetPromptResult,
	MCPInitializeParams,
	MCPInitializeResult,
	MCPPrompt,
	MCPPromptsListResult,
	MCPRequestOptions,
	MCPResource,
	MCPResourceReadResult,
	MCPResourcesListResult,
	MCPResourceTemplate,
	MCPResourceTemplatesListResult,
	MCPResolvedServerConfig,
	MCPServerCapabilities,
	MCPServerConnection,
	MCPToolCallResult,
	MCPToolDefinition,
	MCPToolsListResult,
	MCPTransport,
} from "./types";

const PROTOCOL_VERSION = "2025-03-26";
const MAX_PAGES = 100;
const CLIENT_INFO = {
	name: "pi-mcp-extension",
	version: "0.1.0",
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string, signal?: AbortSignal): Promise<T> {
	if (signal?.aborted) {
		return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
	}

	return new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(() => {
			reject(new Error(message));
		}, timeoutMs);

		const onAbort = () => {
			clearTimeout(timeout);
			reject(signal?.reason instanceof Error ? signal.reason : new Error("Operation aborted"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		promise
			.then((value) => {
				clearTimeout(timeout);
				signal?.removeEventListener("abort", onAbort);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timeout);
				signal?.removeEventListener("abort", onAbort);
				reject(error);
			});
	});
}

async function createTransport(config: MCPResolvedServerConfig): Promise<MCPTransport> {
	if (config.type === "stdio") {
		return createStdioTransport(config);
	}
	if (config.type === "http" || config.type === "sse") {
		return createHttpTransport(config);
	}
	throw new Error(`Unsupported MCP transport type: ${(config as { type?: string }).type}`);
}

async function initializeConnection(transport: MCPTransport, signal?: AbortSignal): Promise<MCPInitializeResult> {
	// IMPORTANT: do not advertise capabilities that pi does not actually implement.
	// Previously we sent `roots: { listChanged: false }` here, but pi has no
	// roots/list request handler. Spec-compliant servers (e.g. chrome-devtools-mcp)
	// see the advertisement, call client.listRoots() during tool setup, and block
	// for ~60 s on their own internal timeout before letting the tool run. That
	// caused every chrome-devtools tool call to appear to "hang" past pi's 30 s
	// per-request deadline. Until pi grows real roots support, advertise nothing.
	const params: MCPInitializeParams = {
		protocolVersion: PROTOCOL_VERSION,
		capabilities: {},
		clientInfo: CLIENT_INFO,
	};

	const result = await transport.request<MCPInitializeResult>("initialize", params as Record<string, unknown>, {
		signal,
	});
	await transport.notify("notifications/initialized");
	return result;
}

export async function connectToServer(
	name: string,
	config: MCPResolvedServerConfig,
	options?: {
		signal?: AbortSignal;
		onNotification?: (method: string, params: unknown) => void;
	},
): Promise<MCPServerConnection> {
	const timeoutMs = config.timeout;
	const connectPromise = (async () => {
		const transport = await createTransport(config);
		transport.onNotification = options?.onNotification;

		try {
			const initialized = await initializeConnection(transport, options?.signal);
			if ("startSSEListener" in transport && typeof transport.startSSEListener === "function") {
				void (transport as { startSSEListener: () => Promise<void> }).startSSEListener();
			}
			return {
				name,
				config,
				transport,
				serverInfo: initialized.serverInfo,
				capabilities: initialized.capabilities,
				instructions: initialized.instructions,
			};
		} catch (error) {
			await transport.close().catch(() => undefined);
			throw error;
		}
	})();

	return withTimeout(connectPromise, timeoutMs, `Connection to MCP server ${name} timed out after ${timeoutMs}ms`, options?.signal);
}

export async function disconnectServer(connection: MCPServerConnection): Promise<void> {
	await connection.transport.close();
}

export function serverSupportsTools(capabilities: MCPServerCapabilities): boolean {
	return capabilities.tools !== undefined;
}

export function serverSupportsResources(capabilities: MCPServerCapabilities): boolean {
	return capabilities.resources !== undefined;
}

export function serverSupportsResourceSubscriptions(capabilities: MCPServerCapabilities): boolean {
	return capabilities.resources?.subscribe === true;
}

export function serverSupportsPrompts(capabilities: MCPServerCapabilities): boolean {
	return capabilities.prompts !== undefined;
}

export async function listTools(connection: MCPServerConnection, options?: { signal?: AbortSignal }): Promise<MCPToolDefinition[]> {
	if (!serverSupportsTools(connection.capabilities)) {
		return [];
	}
	if (connection.tools) {
		return connection.tools;
	}

	const tools: MCPToolDefinition[] = [];
	let cursor: string | undefined;
	for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
		const params: Record<string, unknown> = {};
		if (cursor) {
			params.cursor = cursor;
		}
		const page = await connection.transport.request<MCPToolsListResult>("tools/list", params, {
			signal: options?.signal,
		});
		tools.push(...page.tools);
		if (!page.nextCursor) {
			break;
		}
		cursor = page.nextCursor;
		if (pageIndex === MAX_PAGES - 1) {
			throw new Error(`MCP tools pagination exceeded ${MAX_PAGES} pages for server ${connection.name}`);
		}
	}

	connection.tools = tools;
	return tools;
}

export async function callTool(
	connection: MCPServerConnection,
	toolName: string,
	args: Record<string, unknown> = {},
	options?: MCPRequestOptions,
): Promise<MCPToolCallResult> {
	return connection.transport.request<MCPToolCallResult>(
		"tools/call",
		{
			name: toolName,
			arguments: args,
		},
		options,
	);
}

export async function listResources(
	connection: MCPServerConnection,
	options?: { signal?: AbortSignal },
): Promise<MCPResource[]> {
	if (!serverSupportsResources(connection.capabilities)) {
		return [];
	}
	if (connection.resources) {
		return connection.resources;
	}

	const resources: MCPResource[] = [];
	let cursor: string | undefined;
	for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
		const params: Record<string, unknown> = {};
		if (cursor) {
			params.cursor = cursor;
		}
		const page = await connection.transport.request<MCPResourcesListResult>("resources/list", params, {
			signal: options?.signal,
		});
		resources.push(...page.resources);
		if (!page.nextCursor) {
			break;
		}
		cursor = page.nextCursor;
		if (pageIndex === MAX_PAGES - 1) {
			throw new Error(`MCP resources pagination exceeded ${MAX_PAGES} pages for server ${connection.name}`);
		}
	}

	connection.resources = resources;
	return resources;
}

export async function listResourceTemplates(
	connection: MCPServerConnection,
	options?: { signal?: AbortSignal },
): Promise<MCPResourceTemplate[]> {
	if (!serverSupportsResources(connection.capabilities)) {
		return [];
	}
	if (connection.resourceTemplates) {
		return connection.resourceTemplates;
	}

	const templates: MCPResourceTemplate[] = [];
	let cursor: string | undefined;
	for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
		const params: Record<string, unknown> = {};
		if (cursor) {
			params.cursor = cursor;
		}
		const page = await connection.transport.request<MCPResourceTemplatesListResult>("resources/templates/list", params, {
			signal: options?.signal,
		});
		templates.push(...page.resourceTemplates);
		if (!page.nextCursor) {
			break;
		}
		cursor = page.nextCursor;
		if (pageIndex === MAX_PAGES - 1) {
			throw new Error(`MCP resource template pagination exceeded ${MAX_PAGES} pages for server ${connection.name}`);
		}
	}

	connection.resourceTemplates = templates;
	return templates;
}

export async function readResource(
	connection: MCPServerConnection,
	uri: string,
	options?: MCPRequestOptions,
): Promise<MCPResourceReadResult> {
	return connection.transport.request<MCPResourceReadResult>("resources/read", { uri }, options);
}

export async function subscribeToResources(
	connection: MCPServerConnection,
	uris: string[],
	options?: MCPRequestOptions,
): Promise<void> {
	if (!serverSupportsResourceSubscriptions(connection.capabilities) || uris.length === 0) {
		return;
	}

	await Promise.allSettled(
		uris.map((uri) => connection.transport.request("resources/subscribe", { uri }, options)),
	);
}

export async function unsubscribeFromResources(
	connection: MCPServerConnection,
	uris: string[],
	options?: MCPRequestOptions,
): Promise<void> {
	if (!serverSupportsResourceSubscriptions(connection.capabilities) || uris.length === 0) {
		return;
	}

	await Promise.allSettled(
		uris.map((uri) => connection.transport.request("resources/unsubscribe", { uri }, options)),
	);
}

export async function listPrompts(connection: MCPServerConnection, options?: { signal?: AbortSignal }): Promise<MCPPrompt[]> {
	if (!serverSupportsPrompts(connection.capabilities)) {
		return [];
	}
	if (connection.prompts) {
		return connection.prompts;
	}

	const prompts: MCPPrompt[] = [];
	let cursor: string | undefined;
	for (let pageIndex = 0; pageIndex < MAX_PAGES; pageIndex += 1) {
		const params: Record<string, unknown> = {};
		if (cursor) {
			params.cursor = cursor;
		}
		const page = await connection.transport.request<MCPPromptsListResult>("prompts/list", params, {
			signal: options?.signal,
		});
		prompts.push(...page.prompts);
		if (!page.nextCursor) {
			break;
		}
		cursor = page.nextCursor;
		if (pageIndex === MAX_PAGES - 1) {
			throw new Error(`MCP prompts pagination exceeded ${MAX_PAGES} pages for server ${connection.name}`);
		}
	}

	connection.prompts = prompts;
	return prompts;
}

export async function getPrompt(
	connection: MCPServerConnection,
	promptName: string,
	args?: Record<string, string>,
	options?: MCPRequestOptions,
): Promise<MCPGetPromptResult> {
	return connection.transport.request<MCPGetPromptResult>(
		"prompts/get",
		{
			name: promptName,
			arguments: args && Object.keys(args).length > 0 ? args : undefined,
		},
		options,
	);
}
