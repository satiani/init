import type { ToolDefinition } from "@mariozechner/pi-coding-agent";
import type { TSchema } from "@sinclair/typebox";

export type MCPServerLifecycle = "lazy" | "eager" | "keep-alive";
export type MCPServerType = "stdio" | "http" | "sse";

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: string | number;
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcNotification {
	jsonrpc: "2.0";
	method: string;
	params?: Record<string, unknown>;
}

export interface JsonRpcError {
	code: number;
	message: string;
	data?: unknown;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: string | number;
	result?: unknown;
	error?: JsonRpcError;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export interface MCPAuthConfig {
	type: "oauth" | "apikey";
	credentialId?: string;
	apiKeyEnvVar?: string;
	headerName?: string;
}

export interface MCPOAuthConfig {
	authorizationUrl?: string;
	tokenUrl?: string;
	registrationUrl?: string;
	clientId?: string;
	clientSecret?: string;
	scopes?: string;
	callbackPort?: number;
}

interface MCPServerConfigBase {
	enabled?: boolean;
	timeout?: number;
	lifecycle?: MCPServerLifecycle;
	idleTimeout?: number;
	reconnectBaseDelayMs?: number;
	reconnectMaxDelayMs?: number;
	maxReconnectAttempts?: number;
	directTools?: boolean;
	auth?: MCPAuthConfig;
	oauth?: MCPOAuthConfig;
	description?: string;
}

export interface MCPStdioServerConfig extends MCPServerConfigBase {
	type?: "stdio";
	command: string;
	args?: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface MCPHttpServerConfig extends MCPServerConfigBase {
	type: "http";
	url: string;
	headers?: Record<string, string>;
}

export interface MCPSseServerConfig extends MCPServerConfigBase {
	type: "sse";
	url: string;
	headers?: Record<string, string>;
}

export type MCPServerConfig = MCPStdioServerConfig | MCPHttpServerConfig | MCPSseServerConfig;

export interface MCPConfigDefaults {
	directTools?: boolean;
	notificationsEnabled?: boolean;
	notificationDebounceMs?: number;
	lifecycle?: MCPServerLifecycle;
	idleTimeout?: number;
}

export interface MCPConfigFile {
	mcpServers?: Record<string, MCPServerConfig>;
	disabledServers?: string[];
	imports?: string[];
	defaults?: MCPConfigDefaults;
}

export interface MCPSourceMeta {
	provider: string;
	providerName: string;
	path: string;
	level: "user" | "project" | "imported" | "external";
}

export interface MCPResolvedServerConfig extends MCPServerConfig {
	type: MCPServerType;
	enabled: boolean;
	lifecycle: MCPServerLifecycle;
	idleTimeout: number;
	reconnectBaseDelayMs: number;
	reconnectMaxDelayMs: number;
	maxReconnectAttempts: number;
	directTools: boolean;
}

export interface MCPMergedConfig {
	servers: Record<string, MCPResolvedServerConfig>;
	sources: Record<string, MCPSourceMeta>;
	disabledServers: string[];
	defaults: Required<MCPConfigDefaults>;
	paths: {
		userConfigPath: string;
		projectConfigPath: string;
	};
}

export interface MCPImplementation {
	name: string;
	version: string;
}

export interface MCPClientCapabilities {
	roots?: { listChanged?: boolean };
	sampling?: Record<string, never>;
	experimental?: Record<string, unknown>;
}

export interface MCPServerCapabilities {
	tools?: { listChanged?: boolean };
	resources?: { subscribe?: boolean; listChanged?: boolean };
	prompts?: { listChanged?: boolean };
	logging?: Record<string, never>;
	experimental?: Record<string, unknown>;
}

export interface MCPInitializeParams {
	protocolVersion: string;
	capabilities: MCPClientCapabilities;
	clientInfo: MCPImplementation;
}

export interface MCPInitializeResult {
	protocolVersion: string;
	capabilities: MCPServerCapabilities;
	serverInfo: MCPImplementation;
	instructions?: string;
}

export interface MCPToolDefinition {
	name: string;
	description?: string;
	inputSchema: {
		type: "object";
		properties?: Record<string, unknown>;
		required?: string[];
		[key: string]: unknown;
	};
}

export interface MCPToolsListResult {
	tools: MCPToolDefinition[];
	nextCursor?: string;
}

export interface MCPToolCallParams {
	name: string;
	arguments?: Record<string, unknown>;
}

export interface MCPTextContent {
	type: "text";
	text: string;
}

export interface MCPImageContent {
	type: "image";
	data: string;
	mimeType: string;
}

export interface MCPResourceContent {
	type: "resource";
	resource: {
		uri: string;
		mimeType?: string;
		text?: string;
		blob?: string;
	};
}

export interface MCPAudioContent {
	type: "audio";
	data: string;
	mimeType: string;
}

export type MCPContent = MCPTextContent | MCPImageContent | MCPResourceContent;
export type MCPPromptContent = MCPTextContent | MCPImageContent | MCPAudioContent | MCPResourceContent;

export interface MCPToolCallResult {
	content: MCPContent[];
	isError?: boolean;
}

export interface MCPResource {
	uri: string;
	name: string;
	title?: string;
	description?: string;
	mimeType?: string;
	size?: number;
}

export interface MCPResourceTemplate {
	uriTemplate: string;
	name: string;
	title?: string;
	description?: string;
	mimeType?: string;
}

export interface MCPResourcesListResult {
	resources: MCPResource[];
	nextCursor?: string;
}

export interface MCPResourceTemplatesListResult {
	resourceTemplates: MCPResourceTemplate[];
	nextCursor?: string;
}

export interface MCPResourceContentItem {
	uri: string;
	mimeType?: string;
	text?: string;
	blob?: string;
}

export interface MCPResourceReadResult {
	contents: MCPResourceContentItem[];
}

export interface MCPPromptArgument {
	name: string;
	description?: string;
	required?: boolean;
}

export interface MCPPrompt {
	name: string;
	title?: string;
	description?: string;
	arguments?: MCPPromptArgument[];
}

export interface MCPPromptsListResult {
	prompts: MCPPrompt[];
	nextCursor?: string;
}

export interface MCPPromptMessage {
	role: "user" | "assistant";
	content: MCPPromptContent | MCPPromptContent[];
}

export interface MCPGetPromptResult {
	description?: string;
	messages: MCPPromptMessage[];
}

export interface MCPRequestOptions {
	signal?: AbortSignal;
}

export interface MCPTransport {
	request<T = unknown>(method: string, params?: Record<string, unknown>, options?: MCPRequestOptions): Promise<T>;
	notify(method: string, params?: Record<string, unknown>): Promise<void>;
	close(): Promise<void>;
	readonly connected: boolean;
	onClose?: () => void;
	onError?: (error: Error) => void;
	onNotification?: (method: string, params: unknown) => void;
}

export interface MCPServerConnection {
	name: string;
	config: MCPResolvedServerConfig;
	transport: MCPTransport;
	serverInfo: MCPImplementation;
	capabilities: MCPServerCapabilities;
	instructions?: string;
	tools?: MCPToolDefinition[];
	resources?: MCPResource[];
	resourceTemplates?: MCPResourceTemplate[];
	prompts?: MCPPrompt[];
}

export interface MCPManagerOptions {
	cwd: string;
	agentDir: string;
	onToolsChanged?: (tools: MCPToolRegistrationCandidate[]) => void;
	onPromptsChanged?: () => void;
	onResourcesChanged?: (serverName: string, uri: string) => void;
	onNotification?: (serverName: string, method: string, params: unknown) => void;
}

export interface MCPToolCacheData {
	version: number;
	servers: Record<
		string,
		{
			configHash: string;
			tools: MCPToolDefinition[];
			updatedAt: number;
		}
	>;
}

export interface MCPToolRegistrationCandidate {
	serverName: string;
	tool: MCPToolDefinition;
	source: "cache" | "live";
}

export interface MCPToolDetails {
	serverName: string;
	toolName: string;
	isError?: boolean;
	rawContent?: MCPContent[];
}

export type MCPDirectToolDefinition = ToolDefinition<TSchema, MCPToolDetails>;

export interface MCPOAuthCredential {
	type: "oauth";
	access: string;
	refresh?: string;
	expires?: number;
	tokenType?: string;
	scope?: string;
}

export interface MCPCredentialsFile {
	version: number;
	credentials: Record<string, MCPOAuthCredential>;
}

export const MCP_NOTIFICATION_METHODS = {
	TOOLS_LIST_CHANGED: "notifications/tools/list_changed",
	RESOURCES_LIST_CHANGED: "notifications/resources/list_changed",
	RESOURCES_UPDATED: "notifications/resources/updated",
	PROMPTS_LIST_CHANGED: "notifications/prompts/list_changed",
} as const;

export type MCPProxyMode =
	| "status"
	| "list"
	| "search"
	| "describe"
	| "connect"
	| "call"
	| "resources"
	| "prompts"
	| "notifications";

export interface MCPProxyResult {
	ok: boolean;
	mode: MCPProxyMode;
	message: string;
	details?: Record<string, unknown>;
}
