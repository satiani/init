import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { access, readFile } from "node:fs/promises";
import type {
	MCPConfigDefaults,
	MCPConfigFile,
	MCPMergedConfig,
	MCPResolvedServerConfig,
	MCPServerConfig,
	MCPServerLifecycle,
	MCPServerType,
	MCPSourceMeta,
} from "./types";

const DEFAULT_SERVER_TIMEOUT_MS = 30_000;
const DEFAULT_IDLE_TIMEOUT_SECONDS = 30;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1_000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const DEFAULT_RECONNECT_ATTEMPTS = 5;

const DEFAULT_CONFIG_DEFAULTS: Required<MCPConfigDefaults> = {
	directTools: false,
	notificationsEnabled: true,
	notificationDebounceMs: 350,
	lifecycle: "lazy",
	idleTimeout: DEFAULT_IDLE_TIMEOUT_SECONDS,
};

interface LoadSource {
	provider: string;
	providerName: string;
	level: MCPSourceMeta["level"];
	path: string;
	config: MCPConfigFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}

function parseJson(text: string): unknown {
	return JSON.parse(text) as unknown;
}

function parseServerType(config: MCPServerConfig): MCPServerType {
	if (config.type === "http") return "http";
	if (config.type === "sse") return "sse";
	return "stdio";
}

function normalizeLifecycle(
	lifecycle: MCPServerLifecycle | undefined,
	defaults: Required<MCPConfigDefaults>,
): MCPServerLifecycle {
	if (lifecycle === "lazy" || lifecycle === "eager" || lifecycle === "keep-alive") {
		return lifecycle;
	}
	return defaults.lifecycle;
}

function normalizeServerConfig(
	config: MCPServerConfig,
	defaults: Required<MCPConfigDefaults>,
): MCPResolvedServerConfig {
	const type = parseServerType(config);
	const lifecycle = normalizeLifecycle(config.lifecycle, defaults);
	const idleTimeout = Number.isFinite(config.idleTimeout)
		? Math.max(0, config.idleTimeout ?? defaults.idleTimeout)
		: defaults.idleTimeout;

	const reconnectBaseDelayMs = Number.isFinite(config.reconnectBaseDelayMs)
		? Math.max(100, config.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS)
		: DEFAULT_RECONNECT_BASE_DELAY_MS;
	const reconnectMaxDelayMs = Number.isFinite(config.reconnectMaxDelayMs)
		? Math.max(reconnectBaseDelayMs, config.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS)
		: DEFAULT_RECONNECT_MAX_DELAY_MS;
	const maxReconnectAttempts = Number.isFinite(config.maxReconnectAttempts)
		? Math.max(0, config.maxReconnectAttempts ?? DEFAULT_RECONNECT_ATTEMPTS)
		: DEFAULT_RECONNECT_ATTEMPTS;
	const timeout = Number.isFinite(config.timeout)
		? Math.max(100, config.timeout ?? DEFAULT_SERVER_TIMEOUT_MS)
		: DEFAULT_SERVER_TIMEOUT_MS;

	return {
		...config,
		type,
		enabled: config.enabled !== false,
		timeout,
		lifecycle,
		idleTimeout,
		reconnectBaseDelayMs,
		reconnectMaxDelayMs,
		maxReconnectAttempts,
		directTools: config.directTools ?? defaults.directTools,
	};
}

function mergeServerConfig(base: MCPServerConfig, next: MCPServerConfig): MCPServerConfig {
	const merged = {
		...base,
		...next,
	} as MCPServerConfig;

	if ("env" in base || "env" in next) {
		const baseEnv = "env" in base ? base.env : undefined;
		const nextEnv = "env" in next ? next.env : undefined;
		if (baseEnv || nextEnv) {
			(merged as { env?: Record<string, string> }).env = {
				...(baseEnv ?? {}),
				...(nextEnv ?? {}),
			};
		}
	}

	if ("headers" in base || "headers" in next) {
		const baseHeaders = "headers" in base ? base.headers : undefined;
		const nextHeaders = "headers" in next ? next.headers : undefined;
		if (baseHeaders || nextHeaders) {
			(merged as { headers?: Record<string, string> }).headers = {
				...(baseHeaders ?? {}),
				...(nextHeaders ?? {}),
			};
		}
	}

	if (base.oauth || next.oauth) {
		merged.oauth = {
			...(base.oauth ?? {}),
			...(next.oauth ?? {}),
		};
	}

	if (base.auth || next.auth) {
		merged.auth = {
			...(base.auth ?? {}),
			...(next.auth ?? {}),
		};
	}

	return merged;
}

function coerceServerConfig(raw: unknown): MCPServerConfig | null {
	if (!isRecord(raw)) return null;

	const hasUrl = typeof raw.url === "string" && raw.url.trim().length > 0;
	const hasCommand = typeof raw.command === "string" && raw.command.trim().length > 0;

	if (!hasUrl && !hasCommand) {
		return null;
	}

	if (hasUrl) {
		const type = raw.type === "sse" ? "sse" : "http";
		const config: MCPServerConfig = {
			type,
			url: String(raw.url),
		};

		if (isRecord(raw.headers)) {
			config.headers = Object.fromEntries(
				Object.entries(raw.headers).filter(([, value]) => typeof value === "string"),
			) as Record<string, string>;
		}
		if (typeof raw.description === "string") config.description = raw.description;
		if (typeof raw.enabled === "boolean") config.enabled = raw.enabled;
		if (typeof raw.timeout === "number") config.timeout = raw.timeout;
		if (typeof raw.lifecycle === "string") config.lifecycle = raw.lifecycle as MCPServerLifecycle;
		if (typeof raw.idleTimeout === "number") config.idleTimeout = raw.idleTimeout;
		if (typeof raw.directTools === "boolean") config.directTools = raw.directTools;
		if (typeof raw.reconnectBaseDelayMs === "number") config.reconnectBaseDelayMs = raw.reconnectBaseDelayMs;
		if (typeof raw.reconnectMaxDelayMs === "number") config.reconnectMaxDelayMs = raw.reconnectMaxDelayMs;
		if (typeof raw.maxReconnectAttempts === "number") config.maxReconnectAttempts = raw.maxReconnectAttempts;
		if (isRecord(raw.auth)) {
			const authType = raw.auth.type;
			if (authType === "oauth" || authType === "apikey") {
				config.auth = {
					type: authType,
					credentialId: typeof raw.auth.credentialId === "string" ? raw.auth.credentialId : undefined,
					apiKeyEnvVar: typeof raw.auth.apiKeyEnvVar === "string" ? raw.auth.apiKeyEnvVar : undefined,
					headerName: typeof raw.auth.headerName === "string" ? raw.auth.headerName : undefined,
				};
			}
		}
		if (isRecord(raw.oauth)) {
			config.oauth = {
				authorizationUrl:
					typeof raw.oauth.authorizationUrl === "string" ? raw.oauth.authorizationUrl : undefined,
				tokenUrl: typeof raw.oauth.tokenUrl === "string" ? raw.oauth.tokenUrl : undefined,
				registrationUrl: typeof raw.oauth.registrationUrl === "string" ? raw.oauth.registrationUrl : undefined,
				clientId: typeof raw.oauth.clientId === "string" ? raw.oauth.clientId : undefined,
				clientSecret: typeof raw.oauth.clientSecret === "string" ? raw.oauth.clientSecret : undefined,
				scopes: typeof raw.oauth.scopes === "string" ? raw.oauth.scopes : undefined,
				callbackPort: typeof raw.oauth.callbackPort === "number" ? raw.oauth.callbackPort : undefined,
			};
		}

		return config;
	}

	const config: MCPServerConfig = {
		type: "stdio",
		command: String(raw.command),
	};

	if (Array.isArray(raw.args)) {
		config.args = raw.args.filter((entry): entry is string => typeof entry === "string");
	}
	if (isRecord(raw.env)) {
		config.env = Object.fromEntries(
			Object.entries(raw.env).filter(([, value]) => typeof value === "string"),
		) as Record<string, string>;
	}
	if (typeof raw.cwd === "string") config.cwd = raw.cwd;
	if (typeof raw.description === "string") config.description = raw.description;
	if (typeof raw.enabled === "boolean") config.enabled = raw.enabled;
	if (typeof raw.timeout === "number") config.timeout = raw.timeout;
	if (typeof raw.lifecycle === "string") config.lifecycle = raw.lifecycle as MCPServerLifecycle;
	if (typeof raw.idleTimeout === "number") config.idleTimeout = raw.idleTimeout;
	if (typeof raw.directTools === "boolean") config.directTools = raw.directTools;
	if (typeof raw.reconnectBaseDelayMs === "number") config.reconnectBaseDelayMs = raw.reconnectBaseDelayMs;
	if (typeof raw.reconnectMaxDelayMs === "number") config.reconnectMaxDelayMs = raw.reconnectMaxDelayMs;
	if (typeof raw.maxReconnectAttempts === "number") config.maxReconnectAttempts = raw.maxReconnectAttempts;
	if (isRecord(raw.auth)) {
		const authType = raw.auth.type;
		if (authType === "oauth" || authType === "apikey") {
			config.auth = {
				type: authType,
				credentialId: typeof raw.auth.credentialId === "string" ? raw.auth.credentialId : undefined,
				apiKeyEnvVar: typeof raw.auth.apiKeyEnvVar === "string" ? raw.auth.apiKeyEnvVar : undefined,
				headerName: typeof raw.auth.headerName === "string" ? raw.auth.headerName : undefined,
			};
		}
	}
	if (isRecord(raw.oauth)) {
		config.oauth = {
			authorizationUrl: typeof raw.oauth.authorizationUrl === "string" ? raw.oauth.authorizationUrl : undefined,
			tokenUrl: typeof raw.oauth.tokenUrl === "string" ? raw.oauth.tokenUrl : undefined,
			registrationUrl: typeof raw.oauth.registrationUrl === "string" ? raw.oauth.registrationUrl : undefined,
			clientId: typeof raw.oauth.clientId === "string" ? raw.oauth.clientId : undefined,
			clientSecret: typeof raw.oauth.clientSecret === "string" ? raw.oauth.clientSecret : undefined,
			scopes: typeof raw.oauth.scopes === "string" ? raw.oauth.scopes : undefined,
			callbackPort: typeof raw.oauth.callbackPort === "number" ? raw.oauth.callbackPort : undefined,
		};
	}

	return config;
}

function normalizeConfigFile(raw: unknown): MCPConfigFile {
	if (!isRecord(raw)) {
		return {};
	}

	const result: MCPConfigFile = {};

	const serverContainer = isRecord(raw.mcpServers)
		? raw.mcpServers
		: isRecord(raw.servers)
			? raw.servers
			: undefined;
	if (serverContainer) {
		const servers: Record<string, MCPServerConfig> = {};
		for (const [name, serverRaw] of Object.entries(serverContainer)) {
			const normalized = coerceServerConfig(serverRaw);
			if (normalized) {
				servers[name] = normalized;
			}
		}
		result.mcpServers = servers;
	}

	if (Array.isArray(raw.disabledServers)) {
		result.disabledServers = raw.disabledServers.filter((entry): entry is string => typeof entry === "string");
	}

	if (Array.isArray(raw.imports)) {
		result.imports = raw.imports.filter((entry): entry is string => typeof entry === "string");
	}

	if (isRecord(raw.defaults)) {
		result.defaults = {
			directTools: typeof raw.defaults.directTools === "boolean" ? raw.defaults.directTools : undefined,
			notificationsEnabled:
				typeof raw.defaults.notificationsEnabled === "boolean" ? raw.defaults.notificationsEnabled : undefined,
			notificationDebounceMs:
				typeof raw.defaults.notificationDebounceMs === "number" ? raw.defaults.notificationDebounceMs : undefined,
			lifecycle:
				typeof raw.defaults.lifecycle === "string"
					? (raw.defaults.lifecycle as MCPServerLifecycle)
					: undefined,
			idleTimeout: typeof raw.defaults.idleTimeout === "number" ? raw.defaults.idleTimeout : undefined,
		};
	}

	return result;
}

export async function readMCPConfigFile(path: string): Promise<MCPConfigFile> {
	if (!(await fileExists(path))) {
		return {};
	}

	const content = await readFile(path, "utf8");
	const raw = parseJson(content);
	return normalizeConfigFile(raw);
}

async function loadConfigWithImports(
	path: string,
	provider: string,
	providerName: string,
	level: MCPSourceMeta["level"],
	visited: Set<string>,
): Promise<LoadSource[]> {
	const resolvedPath = resolve(path);
	if (visited.has(resolvedPath)) {
		return [];
	}
	visited.add(resolvedPath);

	if (!(await fileExists(resolvedPath))) {
		return [];
	}

	const config = await readMCPConfigFile(resolvedPath);
	const sources: LoadSource[] = [];

	for (const importPath of config.imports ?? []) {
		const absoluteImportPath = isAbsolute(importPath)
			? importPath
			: resolve(dirname(resolvedPath), importPath);
		const importedSources = await loadConfigWithImports(
			absoluteImportPath,
			provider,
			providerName,
			"imported",
			visited,
		);
		sources.push(...importedSources);
	}

	sources.push({
		provider,
		providerName,
		level,
		path: resolvedPath,
		config,
	});

	return sources;
}

function mergeDefaults(
	base: Required<MCPConfigDefaults>,
	next: MCPConfigDefaults | undefined,
): Required<MCPConfigDefaults> {
	if (!next) return base;
	return {
		directTools: next.directTools ?? base.directTools,
		notificationsEnabled: next.notificationsEnabled ?? base.notificationsEnabled,
		notificationDebounceMs:
			typeof next.notificationDebounceMs === "number"
				? Math.max(50, Math.floor(next.notificationDebounceMs))
				: base.notificationDebounceMs,
		lifecycle:
			next.lifecycle === "lazy" || next.lifecycle === "eager" || next.lifecycle === "keep-alive"
				? next.lifecycle
				: base.lifecycle,
		idleTimeout: typeof next.idleTimeout === "number" ? Math.max(0, next.idleTimeout) : base.idleTimeout,
	};
}

function applySource(
	source: LoadSource,
	servers: Record<string, MCPServerConfig>,
	sources: Record<string, MCPSourceMeta>,
	disabledServers: Set<string>,
): void {
	for (const disabled of source.config.disabledServers ?? []) {
		disabledServers.add(disabled);
	}

	for (const [name, config] of Object.entries(source.config.mcpServers ?? {})) {
		if (servers[name]) {
			servers[name] = mergeServerConfig(servers[name], config);
		} else {
			servers[name] = config;
		}
		sources[name] = {
			provider: source.provider,
			providerName: source.providerName,
			path: source.path,
			level: source.level,
		};
	}
}

export function getAgentDir(): string {
	return process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
}

export function getUserConfigPath(agentDir: string): string {
	return join(agentDir, "mcp.json");
}

export function getProjectConfigPath(cwd: string): string {
	return join(cwd, ".pi", "agent", "mcp.json");
}

function getExternalConfigPaths(cwd: string): Array<{ provider: string; providerName: string; path: string }> {
	return [
		{ provider: "claude", providerName: "Claude", path: join(cwd, ".mcp.json") },
		{ provider: "cursor", providerName: "Cursor", path: join(cwd, ".cursor", "mcp.json") },
		{ provider: "vscode", providerName: "VS Code", path: join(cwd, ".vscode", "mcp.json") },
		{ provider: "windsurf", providerName: "Windsurf", path: join(cwd, ".windsurf", "mcp.json") },
	];
}

export async function loadMergedMCPConfig(cwd: string, agentDir = getAgentDir()): Promise<MCPMergedConfig> {
	const userConfigPath = getUserConfigPath(agentDir);
	const projectConfigPath = getProjectConfigPath(cwd);

	const visited = new Set<string>();
	const externalSources: LoadSource[] = [];
	for (const external of getExternalConfigPaths(cwd)) {
		const loaded = await loadConfigWithImports(
			external.path,
			external.provider,
			external.providerName,
			"external",
			visited,
		);
		externalSources.push(...loaded);
	}

	const userSources = await loadConfigWithImports(userConfigPath, "pi", "Pi User", "user", visited);
	const projectSources = await loadConfigWithImports(projectConfigPath, "pi", "Pi Project", "project", visited);

	const mergedDefaults = [
		...externalSources,
		...userSources,
		...projectSources,
	].reduce(
		(defaults, source) => mergeDefaults(defaults, source.config.defaults),
		DEFAULT_CONFIG_DEFAULTS,
	);

	const rawServers: Record<string, MCPServerConfig> = {};
	const sources: Record<string, MCPSourceMeta> = {};
	const disabledServers = new Set<string>();

	for (const source of [...externalSources, ...userSources, ...projectSources]) {
		applySource(source, rawServers, sources, disabledServers);
	}

	const normalizedServers: Record<string, MCPResolvedServerConfig> = {};
	for (const [name, rawConfig] of Object.entries(rawServers)) {
		const normalized = normalizeServerConfig(rawConfig, mergedDefaults);
		if (disabledServers.has(name)) {
			normalized.enabled = false;
		}
		normalizedServers[name] = normalized;
	}

	return {
		servers: normalizedServers,
		sources,
		disabledServers: Array.from(disabledServers).sort(),
		defaults: mergedDefaults,
		paths: {
			userConfigPath,
			projectConfigPath,
		},
	};
}

export function validateServerName(name: string): string | undefined {
	if (!name.trim()) {
		return "Server name cannot be empty";
	}
	if (name.length > 100) {
		return "Server name is too long (max 100 characters)";
	}
	if (!/^[a-zA-Z0-9_.-]+$/.test(name)) {
		return "Server name can only contain letters, numbers, dash, underscore, and dot";
	}
	return undefined;
}

export function validateServerConfig(name: string, config: MCPServerConfig): string[] {
	const errors: string[] = [];
	const type = parseServerType(config);

	if (type === "stdio") {
		if (!("command" in config) || !config.command) {
			errors.push(`Server ${name} is stdio but command is missing`);
		}
	} else {
		if (!("url" in config) || !config.url) {
			errors.push(`Server ${name} is ${type} but url is missing`);
		}
	}

	if (config.lifecycle && config.lifecycle !== "lazy" && config.lifecycle !== "eager" && config.lifecycle !== "keep-alive") {
		errors.push(`Server ${name} has invalid lifecycle ${config.lifecycle}`);
	}

	if (typeof config.idleTimeout === "number" && config.idleTimeout < 0) {
		errors.push(`Server ${name} has invalid idleTimeout ${config.idleTimeout}`);
	}

	if (typeof config.timeout === "number" && config.timeout <= 0) {
		errors.push(`Server ${name} has invalid timeout ${config.timeout}`);
	}

	if (config.auth?.type === "oauth" && !config.auth.credentialId) {
		errors.push(`Server ${name} uses oauth auth but credentialId is missing`);
	}

	return errors;
}

export function resolveConfigValue(value: string): string {
	const envPattern = /\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g;
	return value.replace(envPattern, (_full, key: string, fallback: string | undefined) => {
		const envValue = process.env[key];
		if (typeof envValue === "string") {
			return envValue;
		}
		return fallback ?? "";
	});
}

export function getDefaultConfigDefaults(): Required<MCPConfigDefaults> {
	return { ...DEFAULT_CONFIG_DEFAULTS };
}
