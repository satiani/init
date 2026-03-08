import { platform } from "node:os";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { addMCPServer, removeMCPServer, setServerDisabled, updateMCPServer } from "./config-writer";
import {
	getAgentDir,
	getProjectConfigPath,
	getUserConfigPath,
	readMCPConfigFile,
	validateServerConfig,
	validateServerName,
} from "./config";
import { connectToServer, disconnectServer } from "./client";
import { analyzeAuthError, discoverOAuthEndpoints } from "./oauth-discovery";
import { MCPOAuthFlow } from "./oauth-flow";
import type { MCPMergedConfig, MCPResolvedServerConfig, MCPServerConfig } from "./types";
import { MCPManager } from "./manager";

interface ModalLib {
	Modal: {
		show(ctx: ExtensionCommandContext, config: unknown): Promise<{ cancelled: boolean; values: Record<string, unknown>; activeTab?: number }>;
	};
	RadioGroup(config: unknown): unknown;
	SelectField(config: unknown): unknown;
	Separator(config?: unknown): unknown;
	TextField(config: unknown): unknown;
}

let modalLibPromise: Promise<ModalLib> | undefined;

async function getModalLib(): Promise<ModalLib> {
	if (!modalLibPromise) {
		modalLibPromise = (async () => {
			try {
				return (await import("~/.pi/extensions/modal-lib/index.ts")) as ModalLib;
			} catch (primaryError) {
				const home = process.env.HOME;
				if (!home) {
					throw primaryError;
				}
				return (await import(`${home}/.pi/extensions/modal-lib/index.ts`)) as ModalLib;
			}
		})();
	}
	return modalLibPromise;
}

interface AddCommandParseResult {
	name?: string;
	scope: "user" | "project";
	config?: MCPServerConfig;
	error?: string;
}

interface SelectOption {
	value: string;
	label: string;
	description?: string;
}

function formatSelectOption(option: SelectOption): string {
	const base = option.description ? `${option.label} — ${option.description}` : option.label;
	return base;
}

function formatSelectOptions(options: SelectOption[]): string[] {
	const formatted = options.map((option) => formatSelectOption(option));
	const counts = new Map<string, number>();
	for (const entry of formatted) {
		counts.set(entry, (counts.get(entry) ?? 0) + 1);
	}
	return formatted.map((entry, index) => {
		if ((counts.get(entry) ?? 0) <= 1) {
			return entry;
		}
		return `${entry} (${options[index].value})`;
	});
}

async function selectOptionValue(
	ctx: ExtensionCommandContext,
	title: string,
	options: SelectOption[],
): Promise<string | undefined> {
	if (options.length === 0 || !ctx.hasUI) {
		return undefined;
	}

	const { Modal, SelectField, Separator } = await getModalLib();
	const formattedOptions = formatSelectOptions(options);
	const result = await Modal.show(ctx, {
		title,
		maxWidth: 96,
		fields: [
			SelectField({
				id: "selection",
				label: "Choose an option",
				options: options.map((option, index) => ({
					value: option.value,
					label: formattedOptions[index] ?? option.label,
				})),
				value: options[0]?.value,
			}),
			Separator({ label: "Enter submit · Esc cancel" }),
		],
	});

	if (result.cancelled) {
		return undefined;
	}

	const selection = result.values.selection;
	return typeof selection === "string" ? selection : undefined;
}

const DEFAULT_OAUTH_CALLBACK_PORT = 39271;

function parseCommandArgs(raw: string): string[] {
	const tokens: string[] = [];
	const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|(\S+)/g;
	let match: RegExpExecArray | null;
	while ((match = regex.exec(raw)) !== null) {
		const token = match[1] ?? match[2] ?? match[3] ?? "";
		tokens.push(token.replace(/\\(["'\\])/g, "$1"));
	}
	return tokens;
}

function formatTable(lines: string[]): string {
	return ["", ...lines, ""].join("\n");
}

function parseBooleanOption(value: string | undefined): boolean | undefined {
	if (!value) return undefined;
	const normalized = value.toLowerCase();
	if (normalized === "on" || normalized === "true" || normalized === "yes" || normalized === "1" || normalized === "enabled") {
		return true;
	}
	if (normalized === "off" || normalized === "false" || normalized === "no" || normalized === "0" || normalized === "disabled") {
		return false;
	}
	return undefined;
}

export type AuthCapableContext = Pick<ExtensionContext, "cwd" | "hasUI" | "ui">;

function toError(error: unknown): Error {
	if (error instanceof Error) {
		return error;
	}
	return new Error(String(error));
}

function formatConnectionStatus(status: string): string {
	return status === "requires-auth" ? "requires auth" : status;
}

function formatServerSummary(name: string, config: MCPResolvedServerConfig, status: string, sourcePath?: string): string {
	const transport = config.type;
	const lifecycle = config.lifecycle;
	const directTools = config.directTools ? "direct-tools:on" : "direct-tools:off";
	const idle = config.lifecycle === "keep-alive" ? "idle:never" : `idle:${config.idleTimeout}s`;
	const source = sourcePath ? ` source:${sourcePath}` : "";
	return `- ${name} [${formatConnectionStatus(status)}] ${transport} ${lifecycle} ${idle} ${directTools}${source}`;
}

function formatPromptMessages(result: { description?: string; messages: Array<{ role: "user" | "assistant"; content: unknown }> }): string {
	const lines: string[] = [];
	if (result.description) {
		lines.push(result.description, "");
	}
	for (const message of result.messages) {
		lines.push(`[${message.role}]`);
		const content = Array.isArray(message.content) ? message.content : [message.content];
		for (const item of content) {
			if (typeof item !== "object" || item === null) {
				lines.push(String(item));
				continue;
			}
			if ("type" in item && item.type === "text" && "text" in item) {
				lines.push(String(item.text));
				continue;
			}
			if ("type" in item && item.type === "image") {
				lines.push(`[image ${(item as { mimeType?: string }).mimeType ?? "unknown"}]`);
				continue;
			}
			if ("type" in item && item.type === "audio") {
				lines.push(`[audio ${(item as { mimeType?: string }).mimeType ?? "unknown"}]`);
				continue;
			}
			if ("type" in item && item.type === "resource" && "resource" in item) {
				const resource = (item as { resource: { uri?: string; text?: string } }).resource;
				lines.push(`[resource ${resource.uri ?? "unknown"}]`);
				if (resource.text) {
					lines.push(resource.text);
				}
				continue;
			}
			lines.push(JSON.stringify(item));
		}
		lines.push("");
	}
	return lines.join("\n").trim();
}

async function openInBrowser(pi: ExtensionAPI, url: string): Promise<void> {
	const os = platform();
	if (os === "win32") {
		await pi.exec("powershell", ["-NoProfile", "-Command", "Start-Process", url]).catch(() => undefined);
		return;
	}
	const command = os === "darwin" ? "open" : "xdg-open";
	await pi.exec(command, [url]).catch(() => undefined);
}

function parseScope(tokens: string[], startIndex: number): { scope: "user" | "project"; nextIndex: number; error?: string } {
	if (tokens[startIndex] !== "--scope") {
		return { scope: "project", nextIndex: startIndex };
	}
	const scopeValue = tokens[startIndex + 1];
	if (scopeValue !== "user" && scopeValue !== "project") {
		return { scope: "project", nextIndex: startIndex + 2, error: "Invalid --scope value. Use user or project." };
	}
	return { scope: scopeValue, nextIndex: startIndex + 2 };
}

function parseAddCommand(text: string): AddCommandParseResult {
	const commandMatch = text.match(/^\/mcp\s+add\b\s*(.*)$/i);
	const args = commandMatch?.[1]?.trim() ?? "";
	if (!args) {
		return { scope: "project" };
	}

	const tokens = parseCommandArgs(args);
	if (tokens.length === 0) {
		return { scope: "project" };
	}

	let index = 0;
	let name: string | undefined;
	if (!tokens[index].startsWith("-")) {
		name = tokens[index];
		index += 1;
	}

	const parsedScope = parseScope(tokens, index);
	if (parsedScope.error) {
		return { scope: parsedScope.scope, error: parsedScope.error };
	}
	index = parsedScope.nextIndex;

	let url: string | undefined;
	let transport: "http" | "sse" = "http";
	let token: string | undefined;
	let lifecycle: "lazy" | "eager" | "keep-alive" | undefined;
	let idleTimeout: number | undefined;
	let timeout: number | undefined;
	let directTools: boolean | undefined;
	let commandTokens: string[] | undefined;

	while (index < tokens.length) {
		const tokenName = tokens[index];
		if (tokenName === "--") {
			commandTokens = tokens.slice(index + 1);
			break;
		}

		switch (tokenName) {
			case "--url": {
				const value = tokens[index + 1];
				if (!value) {
					return { scope: parsedScope.scope, error: "Missing value for --url" };
				}
				url = value;
				index += 2;
				break;
			}
			case "--transport": {
				const value = tokens[index + 1];
				if (value !== "http" && value !== "sse") {
					return { scope: parsedScope.scope, error: "Invalid --transport value. Use http or sse." };
				}
				transport = value;
				index += 2;
				break;
			}
			case "--token": {
				const value = tokens[index + 1];
				if (!value) {
					return { scope: parsedScope.scope, error: "Missing value for --token" };
				}
				token = value;
				index += 2;
				break;
			}
			case "--lifecycle": {
				const value = tokens[index + 1];
				if (value !== "lazy" && value !== "eager" && value !== "keep-alive") {
					return { scope: parsedScope.scope, error: "Invalid --lifecycle value. Use lazy, eager, or keep-alive." };
				}
				lifecycle = value;
				index += 2;
				break;
			}
			case "--idle-timeout": {
				const value = Number(tokens[index + 1]);
				if (!Number.isFinite(value) || value < 0) {
					return { scope: parsedScope.scope, error: "Invalid --idle-timeout value." };
				}
				idleTimeout = value;
				index += 2;
				break;
			}
			case "--timeout": {
				const value = Number(tokens[index + 1]);
				if (!Number.isFinite(value) || value <= 0) {
					return { scope: parsedScope.scope, error: "Invalid --timeout value." };
				}
				timeout = value;
				index += 2;
				break;
			}
			case "--direct-tools": {
				const value = parseBooleanOption(tokens[index + 1]);
				if (value === undefined) {
					return { scope: parsedScope.scope, error: "Invalid --direct-tools value. Use on/off." };
				}
				directTools = value;
				index += 2;
				break;
			}
			default:
				return { scope: parsedScope.scope, error: `Unknown option: ${tokenName}` };
		}
	}

	if (!name && (url || (commandTokens && commandTokens.length > 0))) {
		return { scope: parsedScope.scope, error: "Server name is required for quick add." };
	}
	if (url && commandTokens && commandTokens.length > 0) {
		return { scope: parsedScope.scope, error: "Use either --url or -- <command...>, not both." };
	}
	if (token && !url) {
		return { scope: parsedScope.scope, error: "--token requires --url." };
	}

	if (!url && (!commandTokens || commandTokens.length === 0)) {
		return {
			name,
			scope: parsedScope.scope,
		};
	}

	if (url) {
		const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
		const config: MCPServerConfig = {
			type: transport,
			url: normalizedUrl,
			headers: token ? { Authorization: `Bearer ${token}` } : undefined,
		};
		if (lifecycle) config.lifecycle = lifecycle;
		if (typeof idleTimeout === "number") config.idleTimeout = idleTimeout;
		if (typeof timeout === "number") config.timeout = timeout;
		if (typeof directTools === "boolean") config.directTools = directTools;

		return {
			name,
			scope: parsedScope.scope,
			config,
		};
	}

	const [command, ...restArgs] = commandTokens ?? [];
	if (!command) {
		return { scope: parsedScope.scope, error: "Missing command after --" };
	}

	const config: MCPServerConfig = {
		type: "stdio",
		command,
		args: restArgs.length > 0 ? restArgs : undefined,
	};
	if (lifecycle) config.lifecycle = lifecycle;
	if (typeof idleTimeout === "number") config.idleTimeout = idleTimeout;
	if (typeof timeout === "number") config.timeout = timeout;
	if (typeof directTools === "boolean") config.directTools = directTools;

	return {
		name,
		scope: parsedScope.scope,
		config,
	};
}

function getScopePath(cwd: string, agentDir: string, scope: "user" | "project"): string {
	return scope === "user" ? getUserConfigPath(agentDir) : getProjectConfigPath(cwd);
}

async function sendOutput(pi: ExtensionAPI, text: string): Promise<void> {
	pi.sendMessage({
		customType: "mcp",
		content: text,
		display: true,
	});
}

function parseEnvAssignments(raw: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const chunk of raw.split(/[\r\n,;]+/u)) {
		const trimmed = chunk.trim();
		if (!trimmed) continue;
		const separator = trimmed.indexOf("=");
		if (separator < 1) continue;
		const key = trimmed.slice(0, separator).trim();
		const value = trimmed.slice(separator + 1).trim();
		if (!key) continue;
		env[key] = value;
	}
	return env;
}

async function runAddWizard(ctx: ExtensionCommandContext, initialName?: string): Promise<{
	name: string;
	scope: "user" | "project";
	config: MCPServerConfig;
} | null> {
	if (!ctx.hasUI) {
		return null;
	}

	const { Modal, RadioGroup, Separator, TextField } = await getModalLib();

	const result = await Modal.show(ctx, {
		title: "Add MCP server",
		maxWidth: 80,
		fields: [
			TextField({ id: "name", label: "Name", value: initialName ?? "", placeholder: "my-server" }),
			TextField({ id: "target", label: "Command or URL", placeholder: "npx -y @some/mcp-server  or  https://..." }),
			RadioGroup({
				id: "scope",
				label: "Scope",
				options: [
					{ value: "project", label: "project — This project only" },
					{ value: "user", label: "user — All projects" },
				],
				value: "project",
			}),
			Separator({ label: "Enter submit · Esc cancel" }),
		],
	});
	if (result.cancelled) return null;

	const name = String(result.values.name ?? "").trim();
	if (!name) return null;

	const target = String(result.values.target ?? "").trim();
	if (!target) return null;

	const scope: "user" | "project" = String(result.values.scope ?? "project") === "user" ? "user" : "project";

	// Auto-detect transport: URLs become http servers, everything else is a stdio command
	const isUrl = /^https?:\/\//i.test(target);
	let config: MCPServerConfig;

	if (isUrl) {
		config = {
			type: "http",
			url: target,
		};
	} else {
		const tokens = parseCommandArgs(target);
		const [command, ...args] = tokens;
		if (!command) return null;
		config = {
			type: "stdio",
			command,
			args: args.length > 0 ? args : undefined,
		};
	}

	return { name, scope, config };
}

function stripAuth(config: MCPServerConfig): MCPServerConfig {
	const clone = { ...config };
	delete clone.auth;
	return clone;
}

async function findServerConfig(
	name: string,
	mergedConfig: MCPMergedConfig,
): Promise<{ scope: "user" | "project" | "external"; filePath: string; config: MCPServerConfig } | null> {
	const source = mergedConfig.sources[name];
	const mergedServerConfig = mergedConfig.servers[name];
	if (!source || !mergedServerConfig) {
		return null;
	}

	const sourceConfigFile = await readMCPConfigFile(source.path).catch(() => ({}));
	const sourceConfig = sourceConfigFile.mcpServers?.[name];
	const config: MCPServerConfig = sourceConfig ? { ...sourceConfig } : { ...mergedServerConfig };

	if (source.provider === "pi" && source.level === "user") {
		return { scope: "user", filePath: source.path, config };
	}
	if (source.provider === "pi" && source.level === "project") {
		return { scope: "project", filePath: source.path, config };
	}
	return { scope: "external", filePath: source.path, config };
}

async function detectServerOAuth(manager: MCPManager, serverName: string, config: MCPServerConfig): Promise<{
	authorizationUrl: string;
	tokenUrl: string;
	registrationUrl?: string;
	clientId?: string;
	clientSecret?: string;
	scopes?: string;
}> {
	if ((config.type === "http" || config.type === "sse") && config.oauth?.authorizationUrl && config.oauth.tokenUrl) {
		return {
			authorizationUrl: config.oauth.authorizationUrl,
			tokenUrl: config.oauth.tokenUrl,
			registrationUrl: config.oauth.registrationUrl,
			clientId: config.oauth.clientId,
			clientSecret: config.oauth.clientSecret,
			scopes: config.oauth.scopes,
		};
	}

	if (config.type !== "http" && config.type !== "sse") {
		throw new Error("OAuth reauthentication currently requires an HTTP or SSE MCP server.");
	}

	const sanitized = stripAuth(config) as MCPResolvedServerConfig;
	let prepared: MCPResolvedServerConfig;
	try {
		prepared = await manager.prepareConnectionConfig(serverName, {
			...sanitized,
			type: config.type,
			enabled: true,
			lifecycle: "lazy",
			idleTimeout: 30,
			directTools: false,
			timeout: config.timeout ?? 30_000,
			reconnectBaseDelayMs: 1_000,
			reconnectMaxDelayMs: 30_000,
			maxReconnectAttempts: 1,
		});
	} catch (error) {
		throw new Error(`Could not prepare config for OAuth detection: ${error instanceof Error ? error.message : String(error)}`);
	}

	let connectionError: Error | undefined;
	try {
		const connection = await connectToServer(`${serverName}-oauth-detect`, prepared);
		await disconnectServer(connection).catch(() => undefined);
	} catch (error) {
		connectionError = error instanceof Error ? error : new Error(String(error));
	}

	if (!connectionError) {
		throw new Error("Server connected without OAuth, reauthentication is not required.");
	}

	const parsed = analyzeAuthError(connectionError);
	const discovered = await discoverOAuthEndpoints(config.url, parsed.authServerUrl, parsed.resourceMetadataUrl);
	const oauth = parsed.oauth ?? discovered;
	if (oauth) {
		return {
			authorizationUrl: oauth.authorizationUrl,
			tokenUrl: oauth.tokenUrl,
			registrationUrl: oauth.registrationUrl ?? discovered?.registrationUrl ?? config.oauth?.registrationUrl,
			clientId: oauth.clientId ?? discovered?.clientId ?? config.oauth?.clientId,
			clientSecret: config.oauth?.clientSecret,
			scopes: oauth.scopes ?? discovered?.scopes ?? config.oauth?.scopes,
		};
	}
	throw new Error("Could not discover OAuth endpoints automatically.");
}

async function registerOAuthClient(
	serverName: string,
	oauth: { registrationUrl?: string; scopes?: string },
	callbackPort: number,
): Promise<{ clientId: string; clientSecret?: string }> {
	if (!oauth.registrationUrl) {
		throw new Error(`OAuth client registration endpoint is unavailable for ${serverName}.`);
	}

	const redirectUri = `http://127.0.0.1:${callbackPort}/callback`;
	const payload: Record<string, unknown> = {
		client_name: "pi-mcp-extension",
		redirect_uris: [redirectUri],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		token_endpoint_auth_method: "none",
	};
	if (oauth.scopes?.trim()) {
		payload.scope = oauth.scopes;
	}

	let response: Response;
	try {
		response = await fetch(oauth.registrationUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(10_000),
		});
	} catch (error) {
		throw new Error(
			`OAuth client registration request failed: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		throw new Error(`OAuth client registration failed: HTTP ${response.status}${text ? ` ${text}` : ""}`);
	}

	let parsed: unknown;
	try {
		parsed = (await response.json()) as unknown;
	} catch {
		throw new Error("OAuth client registration response was not valid JSON.");
	}
	if (typeof parsed !== "object" || parsed === null) {
		throw new Error("OAuth client registration response was not an object.");
	}
	const data = parsed as Record<string, unknown>;
	const clientId =
		(typeof data.client_id === "string" && data.client_id) ||
		(typeof data.clientId === "string" && data.clientId) ||
		undefined;
	if (!clientId) {
		throw new Error("OAuth client registration response did not include client_id.");
	}

	const clientSecret =
		(typeof data.client_secret === "string" && data.client_secret) ||
		(typeof data.clientSecret === "string" && data.clientSecret) ||
		undefined;

	return { clientId, clientSecret };
}

async function ensureManagerInitialized(manager: MCPManager): Promise<void> {
	if (!manager.mergedConfig) {
		await manager.initialize();
	}
}

export async function runServerReauth(
	pi: ExtensionAPI,
	ctx: AuthCapableContext | undefined,
	manager: MCPManager,
	name: string,
): Promise<void> {
	if (!ctx?.hasUI) {
		throw new Error(`Server ${name} requires interactive auth. Run /mcp reauth ${name} in interactive mode.`);
	}
	const mergedConfig = manager.mergedConfig;
	if (!mergedConfig) {
		throw new Error("MCP manager is not initialized.");
	}

	const found = await findServerConfig(name, mergedConfig);
	if (!found) {
		throw new Error(`Server ${name} not found.`);
	}

	const oauth = await detectServerOAuth(manager, name, found.config);
	const callbackPort = found.config.oauth?.callbackPort ?? DEFAULT_OAUTH_CALLBACK_PORT;
	let clientId = oauth.clientId ?? found.config.oauth?.clientId;
	let clientSecret = oauth.clientSecret ?? found.config.oauth?.clientSecret;
	if (!clientId && oauth.registrationUrl) {
		ctx.ui.notify(`Registering OAuth client for ${name}...`, "info");
		const registration = await registerOAuthClient(name, oauth, callbackPort);
		clientId = registration.clientId;
		clientSecret = registration.clientSecret ?? clientSecret;
	}
	if (!clientId) {
		throw new Error("OAuth client_id is missing and no registration endpoint was discovered.");
	}

	const flow = new MCPOAuthFlow({
		authorizationUrl: oauth.authorizationUrl,
		tokenUrl: oauth.tokenUrl,
		clientId,
		clientSecret,
		scopes: oauth.scopes ?? found.config.oauth?.scopes,
		callbackPort,
	});

	const credential = await flow.login({
		onAuth: ({ url }) => {
			void sendOutput(pi, formatTable(["OAuth authorization required", url]));
			void openInBrowser(pi, url);
		},
		onProgress: (message) => {
			ctx.ui.notify(message, "info");
		},
	});

	const oldCredentialId = found.config.auth?.type === "oauth" ? found.config.auth.credentialId : undefined;
	if (oldCredentialId) {
		await manager.removeCredential(oldCredentialId);
	}
	const newCredentialId = await manager.createOAuthCredential(credential);

	const writablePath =
		found.scope === "external"
			? getUserConfigPath(getAgentDir())
			: found.filePath;
	const updatedConfig: MCPServerConfig = {
		...found.config,
		auth: {
			type: "oauth",
			credentialId: newCredentialId,
		},
		oauth: {
			...(found.config.oauth ?? {}),
			authorizationUrl: oauth.authorizationUrl,
			tokenUrl: oauth.tokenUrl,
			registrationUrl: oauth.registrationUrl ?? found.config.oauth?.registrationUrl,
			clientId,
			clientSecret,
			scopes: oauth.scopes ?? found.config.oauth?.scopes,
		},
	};
	await updateMCPServer(writablePath, name, updatedConfig);
	await manager.reload();
	ctx.ui.notify(`OAuth credentials updated for ${name}.`, "info");
}

export async function runWithAuthRetry<T>(
	pi: ExtensionAPI,
	ctx: AuthCapableContext | undefined,
	manager: MCPManager,
	serverName: string,
	operation: () => Promise<T>,
): Promise<T> {
	try {
		return await operation();
	} catch (error) {
		const parsed = analyzeAuthError(toError(error));
		if (!parsed.requiresAuth) {
			throw error;
		}
		if (parsed.authType === "apikey") {
			throw new Error(`Server ${serverName} requires API key authentication. Configure its API key and retry.`);
		}
		if (!ctx?.hasUI) {
			throw new Error(`Server ${serverName} requires authentication. Run /mcp reauth ${serverName} in interactive mode.`);
		}
		ctx.ui.notify(`Server ${serverName} requires authentication. Starting OAuth flow...`, "info");
		await sendOutput(pi, formatTable([`Server ${serverName} requires authentication.`, "Starting OAuth flow..."]));
		await runServerReauth(pi, ctx, manager, serverName);
		return operation();
	}
}

function getMCPHelpLines(): string[] {
	return [
		"MCP commands",
		"/mcp",
		"Interactive /mcp opens the MCP control center",
		"/mcp help",
		"/mcp list",
		"/mcp tools <server>",
		"/mcp add",
		"/mcp add <name> [--scope user|project] [--url <url> --transport http|sse] [--token <token>] [--lifecycle lazy|eager|keep-alive] [--idle-timeout <sec>] [--timeout <ms>] [--direct-tools on|off] [-- <command...>]",
		"/mcp remove <name> [--scope user|project]",
		"/mcp test <name>",
		"/mcp connect <name>",
		"/mcp disconnect <name>",
		"/mcp enable <name>",
		"/mcp disable <name>",
		"/mcp resources [server]",
		"/mcp prompts [server]",
		"/mcp prompt <server> <prompt> [--args '{\"k\":\"v\"}'] [--inject]",
		"/mcp notifications [status|on|off]",
		"/mcp reauth <name>",
		"/mcp unauth <name>",
		"/mcp reload",
	];
}

function formatServerRichStatus(manager: MCPManager, name: string): string {
	const config = manager.getServerConfig(name);
	if (!config) return "unknown";
	const status = formatConnectionStatus(manager.getConnectionStatus(name));
	const tools = manager.getServerTools(name);
	const toolLabel = tools.length > 0 ? `${tools.length} tools` : "no tools";
	return `${status} · ${toolLabel} · ${config.type}`;
}

type MCPRootDialogAction = "add" | "reload";

type MCPRootDialogSelection =
	| { type: "server"; name: string }
	| { type: "action"; value: MCPRootDialogAction };

async function runMCPRootDialog(ctx: ExtensionCommandContext, manager: MCPManager): Promise<MCPRootDialogSelection | null> {
	const serverNames = manager.getServerNames();

	const options: SelectOption[] = [];
	for (const name of serverNames) {
		options.push({
			value: `server:${name}`,
			label: name,
			description: formatServerRichStatus(manager, name),
		});
	}
	options.push(
		{ value: "action:add", label: "Add server", description: "Configure a new MCP server" },
		{ value: "action:reload", label: "Reload", description: "Reload MCP configuration" },
	);

	const selection = await selectOptionValue(ctx, "MCP", options);
	if (!selection) return null;

	if (selection.startsWith("server:")) {
		return { type: "server", name: selection.slice("server:".length) };
	}
	if (selection === "action:add") return { type: "action", value: "add" };
	if (selection === "action:reload") return { type: "action", value: "reload" };
	return null;
}

async function runMCPServerActionDialog(
	ctx: ExtensionCommandContext,
	manager: MCPManager,
	name: string,
): Promise<string | null> {
	const config = manager.getServerConfig(name);
	if (!config) {
		ctx.ui.notify(`Server ${name} not found.`, "error");
		return null;
	}

	const source = manager.getServerSource(name);
	const status = manager.getConnectionStatus(name);
	const tools = manager.getServerTools(name);
	const isConnected = status === "connected";

	const options: SelectOption[] = [];

	// Connection actions (only when enabled)
	if (config.enabled) {
		if (isConnected) {
			options.push({ value: "disconnect", label: "Disconnect", description: `Disconnect from ${name}` });
		} else {
			options.push({ value: "connect", label: "Connect", description: `Connect to ${name}` });
		}
		options.push({ value: "test", label: "Test connection", description: "Connect and verify tools" });
	}

	// Tool browsing
	if (tools.length > 0) {
		options.push({
			value: "tools",
			label: `Browse tools (${tools.length})`,
			description: "List available tools",
		});
	}

	// Resources and prompts (only when connected and capable)
	const connection = manager.getConnection(name);
	if (isConnected && connection?.capabilities?.resources) {
		options.push({ value: "resources", label: "Browse resources", description: `List resources on ${name}` });
	}
	if (isConnected && connection?.capabilities?.prompts) {
		options.push({ value: "prompts", label: "Browse prompts", description: `List prompts on ${name}` });
	}

	// Enable/disable
	options.push({
		value: config.enabled ? "disable" : "enable",
		label: config.enabled ? "Disable" : "Enable",
		description: config.enabled ? "Disable this server" : "Enable this server",
	});

	// Remove
	const removeScope =
		source?.provider === "pi" && (source.level === "user" || source.level === "project") ? source.level : undefined;
	if (removeScope) {
		options.push({
			value: "remove",
			label: `Remove (${removeScope})`,
			description: `Remove from ${removeScope} config`,
		});
	}

	// Auth (only for remote servers)
	if (config.type === "http" || config.type === "sse") {
		options.push(
			{ value: "reauth", label: "Reauthenticate", description: "Start OAuth flow" },
			{ value: "unauth", label: "Remove auth", description: "Clear stored credentials" },
		);
	}

	options.push({ value: "back", label: "Back", description: "Return to server list" });

	const statusLine = formatServerRichStatus(manager, name);
	const selection = await selectOptionValue(ctx, `${name} — ${statusLine}`, options);
	if (!selection || selection === "back") return null;

	if (selection === "tools") return `tools ${name}`;
	if (selection === "resources") return `resources ${name}`;
	if (selection === "prompts") return `prompts ${name}`;
	if (selection === "remove" && removeScope) return `remove ${name} --scope ${removeScope}`;
	return `${selection} ${name}`;
}

async function runMCPManagementDialog(ctx: ExtensionCommandContext, manager: MCPManager): Promise<string | null> {
	while (true) {
		const rootSelection = await runMCPRootDialog(ctx, manager);
		if (!rootSelection) return null;

		if (rootSelection.type === "server") {
			const action = await runMCPServerActionDialog(ctx, manager, rootSelection.name);
			if (action) return action;
			continue;
		}

		// Direct action from root (add, reload)
		return rootSelection.value;
	}
}

export function registerMCPCommands(pi: ExtensionAPI, manager: MCPManager): void {
	pi.registerCommand("mcp", {
		description: "Manage MCP servers and connections",
		handler: async (args, ctx) => {
			try {
				await ensureManagerInitialized(manager);

				let resolvedArgs = args.trim();
				let tokens = parseCommandArgs(resolvedArgs);
				if (tokens.length === 0 && ctx.hasUI) {
					const dialogResult = await runMCPManagementDialog(ctx, manager);
					if (!dialogResult) {
						return;
					}
					resolvedArgs = dialogResult;
					tokens = parseCommandArgs(resolvedArgs);
				}

				const subcommand = tokens[0]?.toLowerCase() ?? "help";
				const mergedConfig = manager.mergedConfig;
				if (!mergedConfig) {
					ctx.ui.notify("MCP manager is not initialized.", "error");
					return;
				}

			if (subcommand === "help") {
				await sendOutput(pi, formatTable(getMCPHelpLines()));
				return;
			}

			if (subcommand === "list") {
				const lines: string[] = ["MCP servers"];
				for (const name of manager.getServerNames()) {
					const config = manager.getServerConfig(name);
					if (!config) continue;
					const status = manager.getConnectionStatus(name);
					const source = manager.getServerSource(name);
					const toolCount = manager.getServerTools(name).length;
					const toolLabel = toolCount > 0 ? ` ${toolCount} tools` : "";
					lines.push(`${formatServerSummary(name, config, status, source?.path)}${toolLabel}`);
				}
				if (lines.length === 1) {
					lines.push("No MCP servers configured.");
				}
				await sendOutput(pi, formatTable(lines));
				return;
			}

			if (subcommand === "tools") {
				const targetServer = tokens[1];
				if (!targetServer) {
					ctx.ui.notify("Usage: /mcp tools <server>", "error");
					return;
				}
				const serverConfig = manager.getServerConfig(targetServer);
				if (!serverConfig) {
					ctx.ui.notify(`Server ${targetServer} not found.`, "error");
					return;
				}
				const serverTools = manager.getServerTools(targetServer);
				const lines: string[] = [`Tools on ${targetServer} (${serverTools.length})`];
				for (const tool of serverTools) {
					lines.push(`- ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`);
				}
				if (serverTools.length === 0) {
					lines.push("(no tools — server may not be connected)");
				}
				await sendOutput(pi, formatTable(lines));
				return;
			}

			if (subcommand === "add") {
				const addArgs = resolvedArgs.replace(/^add\b\s*/i, "");
				const parsed = parseAddCommand(`/mcp add ${addArgs}`);
				if (parsed.error) {
					ctx.ui.notify(parsed.error, "error");
					return;
				}

				let payload: { name: string; scope: "user" | "project"; config: MCPServerConfig } | null = null;
				if (parsed.config && parsed.name) {
					payload = { name: parsed.name, scope: parsed.scope, config: parsed.config };
				} else {
					if (!ctx.hasUI) {
						await sendOutput(
							pi,
							formatTable([
								"Non-interactive /mcp add usage",
								"Provide full quick-add arguments when no UI is available:",
								"/mcp add <name> [--scope user|project] [--url <url> --transport http|sse] [--token <token>] [--lifecycle lazy|eager|keep-alive] [--idle-timeout <sec>] [--timeout <ms>] [--direct-tools on|off] [-- <command...>]",
							]),
						);
						return;
					}
					payload = await runAddWizard(ctx, parsed.name);
				}

				if (!payload) {
					ctx.ui.notify("MCP add cancelled.", "info");
					return;
				}

				const nameError = validateServerName(payload.name);
				if (nameError) {
					ctx.ui.notify(nameError, "error");
					return;
				}
				const validationErrors = validateServerConfig(payload.name, payload.config);
				if (validationErrors.length > 0) {
					ctx.ui.notify(validationErrors.join("; "), "error");
					return;
				}

				const targetPath = getScopePath(ctx.cwd, getAgentDir(), payload.scope);
				await addMCPServer(targetPath, payload.name, payload.config);
				await manager.reload();
				ctx.ui.notify(`Added MCP server ${payload.name}.`, "info");
				await sendOutput(pi, formatTable([`Added MCP server ${payload.name} in ${payload.scope} scope.`, `Path: ${targetPath}`]));
				return;
			}

			if (subcommand === "remove" || subcommand === "rm") {
				const name = tokens[1];
				if (!name) {
					ctx.ui.notify("Usage: /mcp remove <name> [--scope user|project]", "error");
					return;
				}
				const scopeIndex = tokens.indexOf("--scope");
				const scope = scopeIndex >= 0 ? (tokens[scopeIndex + 1] as "user" | "project" | undefined) : "project";
				if (scope !== "user" && scope !== "project") {
					ctx.ui.notify("Invalid --scope value.", "error");
					return;
				}

				const filePath = getScopePath(ctx.cwd, getAgentDir(), scope);
				await removeMCPServer(filePath, name);
				await manager.reload();
				ctx.ui.notify(`Removed MCP server ${name}.`, "info");
				return;
			}

			if (subcommand === "enable" || subcommand === "disable") {
				const name = tokens[1];
				if (!name) {
					ctx.ui.notify(`Usage: /mcp ${subcommand} <name>`, "error");
					return;
				}
				const enabled = subcommand === "enable";
				const lookup = await findServerConfig(name, mergedConfig);
				if (!lookup) {
					ctx.ui.notify(`Server ${name} not found.`, "error");
					return;
				}

				if (lookup.scope === "external") {
					const userPath = getUserConfigPath(getAgentDir());
					await setServerDisabled(userPath, name, !enabled);
					await manager.reload();
					ctx.ui.notify(`${enabled ? "Enabled" : "Disabled"} external server ${name}.`, "info");
					return;
				}

				await updateMCPServer(lookup.filePath, name, { ...lookup.config, enabled });
				if (!enabled) {
					await manager.disconnectServer(name, { suppressReconnect: true });
				}
				await manager.reload();
				ctx.ui.notify(`${enabled ? "Enabled" : "Disabled"} server ${name}.`, "info");
				return;
			}

			if (subcommand === "test") {
				const name = tokens[1];
				if (!name) {
					ctx.ui.notify("Usage: /mcp test <name>", "error");
					return;
				}
				const result = await runWithAuthRetry(pi, ctx, manager, name, () => manager.testConnection(name));
				ctx.ui.notify(`Connected to ${name} (${result.toolCount} tools).`, "info");
				return;
			}

			if (subcommand === "connect") {
				const name = tokens[1];
				if (!name) {
					ctx.ui.notify("Usage: /mcp connect <name>", "error");
					return;
				}
				await runWithAuthRetry(pi, ctx, manager, name, () => manager.connectServer(name));
				ctx.ui.notify(`Connected to ${name}.`, "info");
				return;
			}

			if (subcommand === "disconnect") {
				const name = tokens[1];
				if (!name) {
					ctx.ui.notify("Usage: /mcp disconnect <name>", "error");
					return;
				}
				await manager.disconnectServer(name, { suppressReconnect: true });
				ctx.ui.notify(`Disconnected ${name}.`, "info");
				return;
			}

			if (subcommand === "reload") {
				await manager.reload();
				ctx.ui.notify("Reloaded MCP configuration and connections.", "info");
				return;
			}

			if (subcommand === "resources") {
				const targetServer = tokens[1];
				const resources = await manager.listResources(targetServer);
				const lines: string[] = ["MCP resources"];
				for (const [serverName, serverResources] of Object.entries(resources)) {
					lines.push(`${serverName}:`);
					if (serverResources.resources.length === 0 && serverResources.templates.length === 0) {
						lines.push("  (none)");
						continue;
					}
					for (const resource of serverResources.resources) {
						lines.push(`  - ${resource.uri}${resource.description ? ` — ${resource.description}` : ""}`);
					}
					if (serverResources.templates.length > 0) {
						lines.push("  templates:");
						for (const template of serverResources.templates) {
							lines.push(`    - ${template.uriTemplate}${template.description ? ` — ${template.description}` : ""}`);
						}
					}
				}
				await sendOutput(pi, formatTable(lines));
				return;
			}

			if (subcommand === "prompts") {
				const targetServer = tokens[1];
				const prompts = await manager.listPrompts(targetServer);
				const lines: string[] = ["MCP prompts"];
				for (const [serverName, serverPrompts] of Object.entries(prompts)) {
					lines.push(`${serverName}:`);
					if (serverPrompts.length === 0) {
						lines.push("  (none)");
						continue;
					}
					for (const prompt of serverPrompts) {
						const argText = prompt.arguments?.length
							? ` (${prompt.arguments.map((arg) => `${arg.name}${arg.required ? "*" : ""}`).join(", ")})`
							: "";
						lines.push(`  - ${prompt.name}${argText}${prompt.description ? ` — ${prompt.description}` : ""}`);
					}
				}
				await sendOutput(pi, formatTable(lines));
				return;
			}

			if (subcommand === "prompt") {
				const serverName = tokens[1];
				const promptName = tokens[2];
				if (!serverName || !promptName) {
					ctx.ui.notify("Usage: /mcp prompt <server> <prompt> [--args '{\"k\":\"v\"}'] [--inject]", "error");
					return;
				}

				let promptArgs: Record<string, string> | undefined;
				let inject = false;
				const argsFlagIndex = tokens.indexOf("--args");
				if (argsFlagIndex >= 0) {
					const argsPayload = tokens[argsFlagIndex + 1];
					if (!argsPayload) {
						ctx.ui.notify("--args requires a JSON object.", "error");
						return;
					}
					let parsed: unknown;
					try {
						parsed = JSON.parse(argsPayload) as unknown;
					} catch {
						ctx.ui.notify("--args must be valid JSON.", "error");
						return;
					}
					if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
						ctx.ui.notify("--args must be a JSON object.", "error");
						return;
					}
					promptArgs = Object.fromEntries(
						Object.entries(parsed).map(([key, value]) => [key, String(value)]),
					);
				}
				inject = tokens.includes("--inject");

				const promptResult = await manager.executePrompt(serverName, promptName, promptArgs);
				const rendered = formatPromptMessages(promptResult);
				await sendOutput(pi, formatTable([`Prompt ${serverName}/${promptName}`, rendered]));

				if (inject) {
					const injectedContent = `Use this MCP prompt context from ${serverName}/${promptName}:\n\n${rendered}`;
					if (ctx.isIdle()) {
						pi.sendUserMessage(injectedContent);
					} else {
						pi.sendUserMessage(injectedContent, { deliverAs: "followUp" });
					}
					ctx.ui.notify(`Injected prompt ${serverName}/${promptName} into the conversation.`, "info");
				}
				return;
			}

			if (subcommand === "notifications") {
				const action = tokens[1] ?? "status";
				if (action === "status") {
					const state = manager.getNotificationState();
					const lines = [
						"MCP notifications",
						`enabled: ${state.enabled ? "yes" : "no"}`,
						"subscriptions:",
						...Object.entries(state.subscriptions).flatMap(([server, uris]) =>
							uris.length > 0 ? [`  ${server}:`, ...uris.map((uri) => `    - ${uri}`)] : [`  ${server}: (none)`],
						),
					];
					await sendOutput(pi, formatTable(lines));
					return;
				}
				if (action === "on" || action === "off") {
					await manager.setNotificationsEnabled(action === "on");
					ctx.ui.notify(`Notifications ${action}.`, "info");
					return;
				}
				ctx.ui.notify("Usage: /mcp notifications [status|on|off]", "error");
				return;
			}

			if (subcommand === "reauth") {
				const name = tokens[1];
				if (!name) {
					ctx.ui.notify("Usage: /mcp reauth <name>", "error");
					return;
				}
				await runServerReauth(pi, ctx, manager, name);
				return;
			}

			if (subcommand === "unauth") {
				const name = tokens[1];
				if (!name) {
					ctx.ui.notify("Usage: /mcp unauth <name>", "error");
					return;
				}
				const found = await findServerConfig(name, mergedConfig);
				if (!found) {
					ctx.ui.notify(`Server ${name} not found.`, "error");
					return;
				}

				if (found.config.auth?.type === "oauth" && found.config.auth.credentialId) {
					await manager.removeCredential(found.config.auth.credentialId);
				}

				const updatedConfig = stripAuth(found.config);
				const targetPath =
					found.scope === "external"
						? getUserConfigPath(getAgentDir())
						: found.filePath;
				await updateMCPServer(targetPath, name, updatedConfig);
				await manager.reload();
				ctx.ui.notify(`Removed auth configuration for ${name}.`, "info");
				return;
			}

			ctx.ui.notify(`Unknown /mcp subcommand ${subcommand}. Use /mcp help.`, "error");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`MCP command failed: ${message}`, "error");
				await sendOutput(pi, formatTable([`MCP command failed: ${message}`]));
			}
		},
	});

	pi.registerMessageRenderer("mcp", (message, _options) => {
		return {
			render: (width) => {
				const safeWidth = Math.max(1, width);
				return message.content.split("\n").flatMap((line) =>
					line.length > 0 ? wrapTextWithAnsi(line, safeWidth) : [""],
				);
			},
			invalidate: () => {},
		};
	});
}
