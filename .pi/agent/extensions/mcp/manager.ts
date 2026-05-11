import {
	callTool,
	connectToServer,
	disconnectServer,
	getPrompt,
	listPrompts,
	listResources,
	listResourceTemplates,
	listTools,
	readResource,
	serverSupportsPrompts,
	serverSupportsResourceSubscriptions,
	subscribeToResources,
	unsubscribeFromResources,
} from "./client";
import { loadMergedMCPConfig, resolveConfigValue } from "./config";
import { MCPCredentialStore } from "./credentials";
import { MCPToolCache } from "./tool-cache";
import { analyzeAuthError } from "./oauth-discovery";
import {
	MCP_NOTIFICATION_METHODS,
	type MCPGetPromptResult,
	type MCPManagerOptions,
	type MCPMergedConfig,
	type MCPPrompt,
	type MCPRequestOptions,
	type MCPResolvedServerConfig,
	type MCPResource,
	type MCPResourceReadResult,
	type MCPResourceTemplate,
	type MCPServerConnection,
	type MCPSourceMeta,
	type MCPToolCallResult,
	type MCPToolDefinition,
	type MCPToolRegistrationCandidate,
} from "./types";

export type MCPConnectionStatus = "disabled" | "disconnected" | "connecting" | "connected" | "requires-auth";

function computeReconnectDelay(
	attempt: number,
	baseDelayMs: number,
	maxDelayMs: number,
): number {
	const exponentialDelay = baseDelayMs * 2 ** attempt;
	const jitter = Math.floor(Math.random() * Math.max(100, baseDelayMs));
	return Math.min(maxDelayMs, exponentialDelay + jitter);
}

function toError(error: unknown): Error {
	if (error instanceof Error) return error;
	return new Error(String(error));
}

// Best-effort async drain on `beforeExit`. Catches the case where pi exits
// without firing `session_shutdown` for some reason (e.g. an uncaught error
// path that still allows the event loop to drain). We intentionally do NOT
// listen on SIGINT/SIGTERM/SIGHUP here: attaching listeners for those
// signals suppresses Node's default termination behavior, which would change
// pi's shutdown semantics. The synchronous process-group kill registered in
// transports/stdio.ts (process.on("exit")) handles the child-cleanup
// guarantee independently of this drain.
const registeredManagers = new Set<MCPManager>();
let processShutdownHooksInstalled = false;
function ensureProcessShutdownHooks(): void {
	if (processShutdownHooksInstalled) return;
	processShutdownHooksInstalled = true;
	let draining = false;
	process.on("beforeExit", () => {
		if (draining) return;
		draining = true;
		const managers = [...registeredManagers];
		registeredManagers.clear();
		void Promise.all(
			managers.map((mgr) => mgr.disconnectAll().catch(() => undefined)),
		);
	});
}

export class MCPManager {
	readonly #cwd: string;
	readonly #agentDir: string;
	readonly #toolCache: MCPToolCache;
	readonly #credentials: MCPCredentialStore;
	readonly #onToolsChanged?: (tools: MCPToolRegistrationCandidate[]) => void;
	readonly #onPromptsChanged?: () => void;
	readonly #onResourcesChanged?: (serverName: string, uri: string) => void;
	readonly #onNotification?: (serverName: string, method: string, params: unknown) => void;

	#mergedConfig: MCPMergedConfig | null = null;
	#connections = new Map<string, MCPServerConnection>();
	#pendingConnections = new Map<string, Promise<MCPServerConnection>>();
	#knownTools = new Map<string, MCPToolDefinition[]>();
	#knownToolsSource = new Map<string, "cache" | "live">();
	#idleTimers = new Map<string, NodeJS.Timeout>();
	#reconnectTimers = new Map<string, NodeJS.Timeout>();
	#reconnectAttempts = new Map<string, number>();
	#resourceDebounceTimers = new Map<string, NodeJS.Timeout>();
	#suppressReconnect = new Set<string>();
	#subscribedResources = new Map<string, Set<string>>();
	#notificationsEnabled = true;
	#shuttingDown = false;
	#authRequiredServers = new Map<string, { authType: "oauth" | "apikey" | "unknown"; message: string }>();

	constructor(options: MCPManagerOptions) {
		this.#cwd = options.cwd;
		this.#agentDir = options.agentDir;
		this.#toolCache = new MCPToolCache(this.#agentDir);
		this.#credentials = new MCPCredentialStore(this.#agentDir);
		this.#onToolsChanged = options.onToolsChanged;
		this.#onPromptsChanged = options.onPromptsChanged;
		this.#onResourcesChanged = options.onResourcesChanged;
		this.#onNotification = options.onNotification;
		registeredManagers.add(this);
		ensureProcessShutdownHooks();
	}

	get mergedConfig(): MCPMergedConfig | null {
		return this.#mergedConfig;
	}

	async initialize(): Promise<void> {
		this.#shuttingDown = false;
		this.#authRequiredServers.clear();
		this.#mergedConfig = await loadMergedMCPConfig(this.#cwd, this.#agentDir);
		this.#notificationsEnabled = this.#mergedConfig.defaults.notificationsEnabled;
		await this.#hydrateKnownToolsFromCache();
		this.#connectAutomaticServers();
	}

	async reload(): Promise<void> {
		await this.disconnectAll({ keepKnownTools: true });
		this.#shuttingDown = false;
		this.#authRequiredServers.clear();
		this.#mergedConfig = await loadMergedMCPConfig(this.#cwd, this.#agentDir);
		this.#notificationsEnabled = this.#mergedConfig.defaults.notificationsEnabled;
		await this.#hydrateKnownToolsFromCache();
		this.#connectAutomaticServers();
	}

	getServerNames(): string[] {
		if (!this.#mergedConfig) {
			return [];
		}
		return Object.keys(this.#mergedConfig.servers).sort();
	}

	getServerConfig(name: string): MCPResolvedServerConfig | undefined {
		return this.#mergedConfig?.servers[name];
	}

	getServerSource(name: string): MCPSourceMeta | undefined {
		return this.#mergedConfig?.sources[name];
	}

	getConnectionStatus(name: string): MCPConnectionStatus {
		const config = this.#mergedConfig?.servers[name];
		if (!config || !config.enabled) {
			return "disabled";
		}
		if (this.#connections.has(name)) {
			return "connected";
		}
		if (this.#pendingConnections.has(name)) {
			return "connecting";
		}
		if (this.#authRequiredServers.has(name)) {
			return "requires-auth";
		}
		return "disconnected";
	}

	isNotificationsEnabled(): boolean {
		return this.#notificationsEnabled;
	}

	async setNotificationsEnabled(enabled: boolean): Promise<void> {
		if (this.#notificationsEnabled === enabled) {
			return;
		}
		this.#notificationsEnabled = enabled;
		if (!enabled) {
			for (const [serverName, connection] of this.#connections.entries()) {
				const subscribed = this.#subscribedResources.get(serverName);
				if (!subscribed || subscribed.size === 0) continue;
				await unsubscribeFromResources(connection, Array.from(subscribed)).catch(() => undefined);
			}
			this.#subscribedResources.clear();
			return;
		}

		for (const [serverName, connection] of this.#connections.entries()) {
			await this.#subscribeServerResources(serverName, connection);
		}
	}

	getKnownTools(): Record<string, MCPToolDefinition[]> {
		const tools: Record<string, MCPToolDefinition[]> = {};
		for (const [serverName, serverTools] of this.#knownTools.entries()) {
			tools[serverName] = serverTools;
		}
		return tools;
	}

	getServerTools(serverName: string): MCPToolDefinition[] {
		return this.#knownTools.get(serverName) ?? [];
	}

	async ensureConnected(name: string, options?: { signal?: AbortSignal; reason?: string }): Promise<MCPServerConnection> {
		const config = this.#mergedConfig?.servers[name];
		if (!config) {
			throw new Error(`MCP server ${name} is not configured`);
		}
		if (!config.enabled) {
			throw new Error(`MCP server ${name} is disabled`);
		}

		const existing = this.#connections.get(name);
		if (existing) {
			this.#touchServer(name);
			return existing;
		}

		const pending = this.#pendingConnections.get(name);
		if (pending) {
			const connection = await pending;
			this.#touchServer(name);
			return connection;
		}

		const connectionPromise = this.#connectServer(name, config, options?.signal);
		this.#pendingConnections.set(name, connectionPromise);

		try {
			const connection = await connectionPromise;
			this.#connections.set(name, connection);
			this.#pendingConnections.delete(name);
			this.#reconnectAttempts.delete(name);
			this.#authRequiredServers.delete(name);
			this.#touchServer(name);
			await this.#refreshServerTools(name, connection, "live");
			if (serverSupportsPrompts(connection.capabilities)) {
				await listPrompts(connection).catch(() => undefined);
				this.#onPromptsChanged?.();
			}
			if (this.#notificationsEnabled) {
				await this.#subscribeServerResources(name, connection);
			}
			return connection;
		} catch (error) {
			this.#pendingConnections.delete(name);
			const activeConnection = this.#connections.get(name);
			if (activeConnection) {
				this.#connections.delete(name);
				await disconnectServer(activeConnection).catch(() => undefined);
			}
			this.#clearServerTimers(name);
			const parsedError = toError(error);
			this.#recordAuthRequirement(name, parsedError);
			throw parsedError;
		}
	}

	async connectServer(name: string, options?: { signal?: AbortSignal }): Promise<MCPServerConnection> {
		return this.ensureConnected(name, options);
	}

	async disconnectServer(name: string, options?: { suppressReconnect?: boolean }): Promise<void> {
		const shouldSuppressReconnect = options?.suppressReconnect ?? true;
		if (shouldSuppressReconnect) {
			this.#suppressReconnect.add(name);
		}

		const connection = this.#connections.get(name);
		if (!connection) {
			const pending = this.#pendingConnections.get(name);
			if (pending) {
				void pending
					.then(async (resolvedConnection) => {
						await disconnectServer(resolvedConnection).catch(() => undefined);
					})
					.catch(() => undefined)
					.finally(() => {
						if (this.#pendingConnections.get(name) === pending) {
							this.#pendingConnections.delete(name);
						}
						this.#clearServerTimers(name);
						if (shouldSuppressReconnect) {
							this.#suppressReconnect.delete(name);
						}
					});
				return;
			}

			this.#clearServerTimers(name);
			if (shouldSuppressReconnect) {
				this.#suppressReconnect.delete(name);
			}
			return;
		}

		const subscribed = this.#subscribedResources.get(name);
		if (subscribed && subscribed.size > 0) {
			await unsubscribeFromResources(connection, Array.from(subscribed)).catch(() => undefined);
		}
		this.#subscribedResources.delete(name);

		await disconnectServer(connection).catch(() => undefined);
		this.#connections.delete(name);
		this.#clearServerTimers(name);

		if (shouldSuppressReconnect) {
			this.#suppressReconnect.delete(name);
		}
	}

	async disconnectAll(options?: { keepKnownTools?: boolean }): Promise<void> {
		this.#shuttingDown = true;
		for (const name of this.getServerNames()) {
			await this.disconnectServer(name, { suppressReconnect: true });
		}
		this.#pendingConnections.clear();
		for (const timer of this.#reconnectTimers.values()) {
			clearTimeout(timer);
		}
		this.#reconnectTimers.clear();
		this.#reconnectAttempts.clear();
		this.#suppressReconnect.clear();
		this.#resourceDebounceTimers.forEach((timer) => clearTimeout(timer));
		this.#resourceDebounceTimers.clear();
		if (!options?.keepKnownTools) {
			this.#knownTools.clear();
			this.#knownToolsSource.clear();
			this.#emitToolsChanged();
		}
		registeredManagers.delete(this);
	}

	async callTool(
		serverName: string,
		toolName: string,
		args: Record<string, unknown>,
		options?: MCPRequestOptions,
	): Promise<MCPToolCallResult> {
		const connection = await this.ensureConnected(serverName, { signal: options?.signal, reason: "tool-call" });
		this.#touchServer(serverName);
		return callTool(connection, toolName, args, options);
	}

	async testConnection(serverName: string, options?: { signal?: AbortSignal }): Promise<{ toolCount: number }> {
		const connection = await this.ensureConnected(serverName, options);
		const tools = await listTools(connection, { signal: options?.signal });
		return { toolCount: tools.length };
	}

	async listResources(
		serverName?: string,
		options?: { signal?: AbortSignal },
	): Promise<Record<string, { resources: MCPResource[]; templates: MCPResourceTemplate[] }>> {
		const serverNames = serverName ? [serverName] : this.getServerNames().filter((name) => this.getServerConfig(name)?.enabled);
		const result: Record<string, { resources: MCPResource[]; templates: MCPResourceTemplate[] }> = {};

		for (const name of serverNames) {
			const connection = await this.ensureConnected(name, { signal: options?.signal, reason: "list-resources" });
			const [resources, templates] = await Promise.all([
				listResources(connection, { signal: options?.signal }),
				listResourceTemplates(connection, { signal: options?.signal }),
			]);
			result[name] = { resources, templates };
			await this.#subscribeServerResources(name, connection);
			this.#touchServer(name);
		}

		return result;
	}

	async readResource(serverName: string, uri: string, options?: MCPRequestOptions): Promise<MCPResourceReadResult> {
		const connection = await this.ensureConnected(serverName, { signal: options?.signal, reason: "read-resource" });
		this.#touchServer(serverName);
		return readResource(connection, uri, options);
	}

	async listPrompts(serverName?: string, options?: { signal?: AbortSignal }): Promise<Record<string, MCPPrompt[]>> {
		const serverNames = serverName ? [serverName] : this.getServerNames().filter((name) => this.getServerConfig(name)?.enabled);
		const result: Record<string, MCPPrompt[]> = {};
		for (const name of serverNames) {
			const connection = await this.ensureConnected(name, { signal: options?.signal, reason: "list-prompts" });
			const prompts = await listPrompts(connection, { signal: options?.signal });
			result[name] = prompts;
			this.#touchServer(name);
		}
		return result;
	}

	async executePrompt(
		serverName: string,
		promptName: string,
		args?: Record<string, string>,
		options?: MCPRequestOptions,
	): Promise<MCPGetPromptResult> {
		const connection = await this.ensureConnected(serverName, { signal: options?.signal, reason: "get-prompt" });
		this.#touchServer(serverName);
		return getPrompt(connection, promptName, args, options);
	}

	getConnection(serverName: string): MCPServerConnection | undefined {
		return this.#connections.get(serverName);
	}

	getConnectedServers(): string[] {
		return Array.from(this.#connections.keys());
	}

	getNotificationState(): {
		enabled: boolean;
		subscriptions: Record<string, string[]>;
	} {
		const subscriptions: Record<string, string[]> = {};
		for (const [serverName, uris] of this.#subscribedResources.entries()) {
			subscriptions[serverName] = Array.from(uris).sort();
		}
		return {
			enabled: this.#notificationsEnabled,
			subscriptions,
		};
	}

	async prepareConnectionConfig(_serverName: string, config: MCPResolvedServerConfig): Promise<MCPResolvedServerConfig> {
		const prepared = {
			...config,
		} as MCPResolvedServerConfig;

		if (prepared.type === "stdio") {
			prepared.env = {
				...(prepared.env ?? {}),
			};
			for (const [key, value] of Object.entries(prepared.env)) {
				prepared.env[key] = resolveConfigValue(value);
			}
		} else {
			prepared.headers = {
				...(prepared.headers ?? {}),
			};
			for (const [key, value] of Object.entries(prepared.headers)) {
				prepared.headers[key] = resolveConfigValue(value);
			}
		}

		if (prepared.auth?.type === "oauth" && prepared.auth.credentialId) {
			const credential = await this.#credentials.get(prepared.auth.credentialId);
			if (credential?.access) {
				if (prepared.type === "stdio") {
					prepared.env = {
						...(prepared.env ?? {}),
						OAUTH_ACCESS_TOKEN: credential.access,
					};
				} else {
					prepared.headers = {
						...(prepared.headers ?? {}),
						Authorization: `Bearer ${credential.access}`,
					};
				}
			}
		}

		if (prepared.auth?.type === "apikey") {
			const envVar = prepared.auth.apiKeyEnvVar ?? "MCP_API_KEY";
			const apiKey = process.env[envVar];
			if (apiKey) {
				if (prepared.type === "stdio") {
					prepared.env = {
						...(prepared.env ?? {}),
						[envVar]: apiKey,
					};
				} else {
					const headerName = prepared.auth.headerName ?? "Authorization";
					prepared.headers = {
						...(prepared.headers ?? {}),
						[headerName]: headerName.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : apiKey,
					};
				}
			}
		}

		if (prepared.type === "stdio" && prepared.cwd) {
			prepared.cwd = resolveConfigValue(prepared.cwd);
		}

		return prepared;
	}

	async setOAuthCredential(credentialId: string, credential: { access: string; refresh?: string; expires?: number; tokenType?: string; scope?: string }): Promise<void> {
		await this.#credentials.set(credentialId, {
			type: "oauth",
			...credential,
		});
	}

	async createOAuthCredential(credential: { access: string; refresh?: string; expires?: number; tokenType?: string; scope?: string }): Promise<string> {
		return this.#credentials.create({
			type: "oauth",
			...credential,
		});
	}

	async removeCredential(credentialId: string): Promise<void> {
		await this.#credentials.remove(credentialId);
	}

	async getCredential(credentialId: string): Promise<{ access: string; refresh?: string; expires?: number; tokenType?: string; scope?: string } | undefined> {
		const credential = await this.#credentials.get(credentialId);
		if (!credential) {
			return undefined;
		}
		return {
			access: credential.access,
			refresh: credential.refresh,
			expires: credential.expires,
			tokenType: credential.tokenType,
			scope: credential.scope,
		};
	}

	#recordAuthRequirement(serverName: string, error: Error): boolean {
		const auth = analyzeAuthError(error);
		if (!auth.requiresAuth) {
			this.#authRequiredServers.delete(serverName);
			return false;
		}
		this.#authRequiredServers.set(serverName, {
			authType: auth.authType ?? "unknown",
			message: auth.message ?? "Server requires authentication.",
		});
		return true;
	}

	#connectAutomaticServers(): void {
		if (!this.#mergedConfig) {
			return;
		}
		const configSnapshot = this.#mergedConfig;

		const startupServers = Object.entries(configSnapshot.servers)
			.filter(([, config]) => config.enabled)
			.map(([serverName]) => serverName);

		queueMicrotask(() => {
			if (this.#mergedConfig !== configSnapshot) {
				return;
			}
			for (const serverName of startupServers) {
				if (this.#shuttingDown || this.#mergedConfig !== configSnapshot) {
					return;
				}
				void this.ensureConnected(serverName, { reason: "startup" }).catch((error) => {
					const parsedError = toError(error);
					const requiresAuth = this.#recordAuthRequirement(serverName, parsedError);
					if (!requiresAuth) {
						void this.#handleDisconnectedServer(serverName, parsedError);
					}
				});
			}
		});
	}

	async #hydrateKnownToolsFromCache(): Promise<void> {
		if (!this.#mergedConfig) {
			return;
		}

		this.#knownTools.clear();
		this.#knownToolsSource.clear();
		const cachedByServer = await this.#toolCache.getAllMatching(this.#mergedConfig.servers);
		for (const [serverName, tools] of Object.entries(cachedByServer)) {
			this.#knownTools.set(serverName, tools);
			this.#knownToolsSource.set(serverName, "cache");
		}
		this.#emitToolsChanged();
	}

	async #connectServer(
		name: string,
		config: MCPResolvedServerConfig,
		signal?: AbortSignal,
	): Promise<MCPServerConnection> {
		const preparedConfig = await this.prepareConnectionConfig(name, config);
		const connection = await connectToServer(name, preparedConfig, {
			signal,
			onNotification: (method, params) => {
				void this.#handleServerNotification(name, method, params);
			},
		});

		connection.transport.onClose = () => {
			void this.#handleDisconnectedServer(name, new Error("MCP transport closed"));
		};
		connection.transport.onError = (error) => {
			void this.#handleDisconnectedServer(name, error);
		};

		return connection;
	}

	async #refreshServerTools(
		serverName: string,
		connection: MCPServerConnection,
		source: "cache" | "live",
	): Promise<void> {
		const tools = await listTools(connection);
		this.#knownTools.set(serverName, tools);
		this.#knownToolsSource.set(serverName, source);
		if (source === "live") {
			await this.#toolCache.set(serverName, connection.config, tools).catch(() => undefined);
		}
		this.#emitToolsChanged();
	}

	#emitToolsChanged(): void {
		if (!this.#onToolsChanged) {
			return;
		}
		const entries: MCPToolRegistrationCandidate[] = [];
		for (const [serverName, tools] of this.#knownTools.entries()) {
			const source = this.#knownToolsSource.get(serverName) ?? "cache";
			for (const tool of tools) {
				entries.push({ serverName, tool, source });
			}
		}
		this.#onToolsChanged(entries);
	}

	#touchServer(serverName: string): void {
		const config = this.#mergedConfig?.servers[serverName];
		if (!config || config.lifecycle === "keep-alive" || config.idleTimeout <= 0) {
			return;
		}

		const existing = this.#idleTimers.get(serverName);
		if (existing) {
			clearTimeout(existing);
		}

		const timer = setTimeout(() => {
			void this.disconnectServer(serverName, { suppressReconnect: true });
		}, config.idleTimeout * 1000);
		this.#idleTimers.set(serverName, timer);
	}

	#clearServerTimers(serverName: string): void {
		const idleTimer = this.#idleTimers.get(serverName);
		if (idleTimer) {
			clearTimeout(idleTimer);
		}
		this.#idleTimers.delete(serverName);

		const reconnectTimer = this.#reconnectTimers.get(serverName);
		if (reconnectTimer) {
			clearTimeout(reconnectTimer);
		}
		this.#reconnectTimers.delete(serverName);

		for (const [key, timer] of this.#resourceDebounceTimers.entries()) {
			if (!key.startsWith(`${serverName}:`)) {
				continue;
			}
			clearTimeout(timer);
			this.#resourceDebounceTimers.delete(key);
		}
	}

	async #handleDisconnectedServer(serverName: string, error: Error): Promise<void> {
		this.#connections.delete(serverName);
		this.#pendingConnections.delete(serverName);
		this.#clearServerTimers(serverName);
		this.#subscribedResources.delete(serverName);
		if (this.#shuttingDown || this.#suppressReconnect.has(serverName)) {
			return;
		}

		const config = this.#mergedConfig?.servers[serverName];
		if (!config || !config.enabled) {
			return;
		}
		const requiresAuth = this.#recordAuthRequirement(serverName, error);
		if (requiresAuth) {
			return;
		}
		if (config.lifecycle === "lazy") {
			return;
		}

		const attempt = this.#reconnectAttempts.get(serverName) ?? 0;
		if (attempt >= config.maxReconnectAttempts) {
			return;
		}
		this.#reconnectAttempts.set(serverName, attempt + 1);

		const delayMs = computeReconnectDelay(attempt, config.reconnectBaseDelayMs, config.reconnectMaxDelayMs);
		const timer = setTimeout(() => {
			this.#reconnectTimers.delete(serverName);
			void this.ensureConnected(serverName).catch((nextError) => {
				void this.#handleDisconnectedServer(serverName, toError(nextError));
			});
		}, delayMs);
		this.#reconnectTimers.set(serverName, timer);
		this.#onNotification?.(serverName, "internal/reconnect_scheduled", {
			error: error.message,
			attempt: attempt + 1,
			delayMs,
		});
	}

	async #subscribeServerResources(serverName: string, connection: MCPServerConnection): Promise<void> {
		if (!this.#notificationsEnabled) {
			return;
		}
		if (!serverSupportsResourceSubscriptions(connection.capabilities)) {
			return;
		}

		let resources = connection.resources;
		if (!resources) {
			resources = await listResources(connection).catch(() => []);
			connection.resources = resources;
		}
		const uris = resources.map((resource) => resource.uri);
		if (uris.length === 0) {
			return;
		}

		await subscribeToResources(connection, uris).catch(() => undefined);
		this.#subscribedResources.set(serverName, new Set(uris));
	}

	async #handleServerNotification(serverName: string, method: string, params: unknown): Promise<void> {
		this.#onNotification?.(serverName, method, params);
		const connection = this.#connections.get(serverName);
		if (!connection) {
			return;
		}

		if (method === MCP_NOTIFICATION_METHODS.TOOLS_LIST_CHANGED) {
			connection.tools = undefined;
			await this.#refreshServerTools(serverName, connection, "live").catch(() => undefined);
			return;
		}

		if (method === MCP_NOTIFICATION_METHODS.RESOURCES_LIST_CHANGED) {
			connection.resources = undefined;
			connection.resourceTemplates = undefined;
			return;
		}

		if (method === MCP_NOTIFICATION_METHODS.PROMPTS_LIST_CHANGED) {
			connection.prompts = undefined;
			await listPrompts(connection).catch(() => undefined);
			this.#onPromptsChanged?.();
			return;
		}

		if (method === MCP_NOTIFICATION_METHODS.RESOURCES_UPDATED) {
			const uri =
				typeof params === "object" && params !== null && "uri" in params && typeof (params as { uri: unknown }).uri === "string"
					? (params as { uri: string }).uri
					: "";
			if (!uri) {
				return;
			}
			const key = `${serverName}:${uri}`;
			const existing = this.#resourceDebounceTimers.get(key);
			if (existing) {
				clearTimeout(existing);
			}
			const debounceMs = this.#mergedConfig?.defaults.notificationDebounceMs ?? 350;
			const timer = setTimeout(() => {
				this.#resourceDebounceTimers.delete(key);
				this.#onResourcesChanged?.(serverName, uri);
			}, debounceMs);
			this.#resourceDebounceTimers.set(key, timer);
		}
	}
}
