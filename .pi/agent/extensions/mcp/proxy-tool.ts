import { Type } from "@sinclair/typebox";
import { keyHint, type ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { runWithAuthRetry } from "./commands";
import { searchMCPTools } from "./tool-bridge";
import { addMCPServer } from "./config-writer";
import { getAgentDir, getProjectConfigPath, getUserConfigPath, validateServerConfig, validateServerName } from "./config";
import type { MCPProxyMode, MCPProxyResult, MCPServerConfig } from "./types";
import { MCPManager } from "./manager";

const MCP_PROXY_PARAMETERS = Type.Object({
	mode: Type.String({
		description:
			"Operation mode: status, list, search, describe, connect, call, resources, prompts, notifications, add",
	}),
	server: Type.Optional(Type.String({ description: "MCP server name" })),
	tool: Type.Optional(Type.String({ description: "MCP tool name (for call/describe)" })),
	query: Type.Optional(Type.String({ description: "Search query or action" })),
	args: Type.Optional(Type.String({ description: "JSON object string for tool call args" })),
	prompt: Type.Optional(Type.String({ description: "Prompt name for prompts mode" })),
	promptArgs: Type.Optional(Type.String({ description: "JSON object string of prompt arguments" })),
	uri: Type.Optional(Type.String({ description: "Resource URI for resources mode" })),
});

function isSupportedMode(mode: string): mode is MCPProxyMode {
	return ["status", "list", "search", "describe", "connect", "call", "resources", "prompts", "notifications", "add"].includes(
		mode,
	);
}

function parseJsonObject(text: string | undefined): Record<string, unknown> {
	if (!text || !text.trim()) {
		return {};
	}
	const parsed = JSON.parse(text) as unknown;
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
		throw new Error("Expected a JSON object");
	}
	return parsed as Record<string, unknown>;
}

function parsePromptArgs(text: string | undefined): Record<string, string> {
	const parsed = parseJsonObject(text);
	return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
}

function formatConnectionStatus(status: string): string {
	return status === "requires-auth" ? "requires auth" : status;
}

function summarizeServerStatus(manager: MCPManager): string {
	const lines = ["MCP server status"];
	for (const name of manager.getServerNames()) {
		const config = manager.getServerConfig(name);
		if (!config) continue;
		const toolCount = manager.getServerTools(name).length;
		const toolLabel = toolCount > 0 ? `, ${toolCount} tools` : "";
		lines.push(
			`- ${name}: ${formatConnectionStatus(manager.getConnectionStatus(name))}${toolLabel} (${config.type}, ${config.lifecycle})`,
		);
	}
	if (lines.length === 1) {
		lines.push("No MCP servers configured.");
	}
	return lines.join("\n");
}

function formatJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function renderCollapsibleText(text: string, expanded: boolean, theme: any): string {
	const lines = text.split("\n");
	if (expanded || lines.length <= 10) {
		return text;
	}
	const remaining = lines.length - 10;
	return `${lines.slice(0, 10).join("\n")}\n${theme.fg("muted", `... (${remaining} more lines, ${keyHint("expandTools", "to expand")})`)}`;
}

export function registerMCPProxyTool(pi: ExtensionAPI, manager: MCPManager): void {
	pi.registerTool({
		name: "mcp",
		label: "MCP Gateway",
		description:
			"Gateway for Model Context Protocol servers. Supports status/list/search/describe/connect/call/resources/prompts/notifications/add.",
		promptSnippet: "Inspect, connect, call, and add MCP servers and tools from one gateway.",
		promptGuidelines: [
			"Use mode=status when you need current MCP connection state.",
			"Use mode=search before mode=call if the user asks for an unknown MCP capability.",
			"Use mode=describe to inspect tool schemas before crafting tool call args.",
			'Use mode=add to add a new MCP server. Requires server (name) and args (JSON config: {"command":"npx","args":["-y","package"]} for stdio, or {"type":"http","url":"https://..."} for remote). Optional query for scope ("user" or "project", default "project").',
		],
		parameters: MCP_PROXY_PARAMETERS,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			if (!manager.mergedConfig) {
				await manager.initialize();
			}

			const modeRaw = params.mode.trim().toLowerCase();
			if (!isSupportedMode(modeRaw)) {
				return {
					content: [{ type: "text", text: `Invalid mode ${params.mode}` }],
					details: {
						ok: false,
						mode: "status",
						message: `Invalid mode ${params.mode}`,
					} satisfies MCPProxyResult,
				};
			}

			const mode = modeRaw;
			try {
				if (mode === "status") {
					const message = summarizeServerStatus(manager);
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}

				if (mode === "list") {
					const lines: string[] = [];
					if (params.server) {
						const tools = manager.getServerTools(params.server);
						lines.push(`Tools on ${params.server}:`);
						for (const tool of tools) {
							lines.push(`- ${tool.name}${tool.description ? ` — ${tool.description}` : ""}`);
						}
						if (tools.length === 0) {
							lines.push("(none)");
						}
					} else {
						lines.push("MCP servers:");
						for (const name of manager.getServerNames()) {
							const config = manager.getServerConfig(name);
							if (!config) continue;
							const toolCount = manager.getServerTools(name).length;
							const toolLabel = toolCount > 0 ? `, ${toolCount} tools` : "";
							lines.push(`- ${name}: ${formatConnectionStatus(manager.getConnectionStatus(name))}${toolLabel} (${config.type}, directTools=${config.directTools ? "on" : "off"})`);
						}
					}
					const message = lines.join("\n");
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}

				if (mode === "search") {
					const query = params.query?.trim() ?? "";
					if (!query) {
						throw new Error("search mode requires query");
					}
					const matches = searchMCPTools(manager.getKnownTools(), query, 50);
					const lines = matches.length > 0
						? matches.map((match) => `- ${match.serverName}/${match.toolName}${match.description ? ` — ${match.description}` : ""}`)
						: ["No matching MCP tools found."];
					const message = lines.join("\n");
					return {
						content: [{ type: "text", text: message }],
						details: {
							ok: true,
							mode,
							message,
							details: { count: matches.length },
						} satisfies MCPProxyResult,
					};
				}

				if (mode === "describe") {
					if (!params.server) {
						throw new Error("describe mode requires server");
					}
					const config = manager.getServerConfig(params.server);
					if (!config) {
						throw new Error(`Server ${params.server} not found`);
					}
					if (!params.tool) {
						const tools = manager.getServerTools(params.server).map((tool) => `- ${tool.name}`);
						const message = [`Server ${params.server}`, `status: ${formatConnectionStatus(manager.getConnectionStatus(params.server))}`, `type: ${config.type}`, `lifecycle: ${config.lifecycle}`, `tools:`, ...(tools.length > 0 ? tools : ["- (none)"])].join("\n");
						return {
							content: [{ type: "text", text: message }],
							details: { ok: true, mode, message } satisfies MCPProxyResult,
						};
					}
					const tool = manager.getServerTools(params.server).find((entry) => entry.name === params.tool);
					if (!tool) {
						throw new Error(`Tool ${params.tool} was not found on server ${params.server}`);
					}
					const message = [`${params.server}/${tool.name}`, tool.description ?? "", "schema:", JSON.stringify(tool.inputSchema, null, 2)].join("\n");
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}

				if (mode === "connect") {
					if (!params.server) {
						throw new Error("connect mode requires server");
					}
					const connection = await runWithAuthRetry(pi, ctx, manager, params.server, () =>
						manager.connectServer(params.server!, { signal }),
					);
					const message = `Connected to ${params.server} (${connection.serverInfo.name} v${connection.serverInfo.version}).`;
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}

				if (mode === "call") {
					if (!params.server || !params.tool) {
						throw new Error("call mode requires server and tool");
					}
					const args = parseJsonObject(params.args);
					const result = await runWithAuthRetry(pi, ctx, manager, params.server, () =>
						manager.callTool(params.server!, params.tool!, args, { signal }),
					);
					const text = result.content
						.map((item) => (item.type === "text" ? item.text : item.type === "image" ? `[image ${item.mimeType}]` : `[resource ${(item.resource.uri ?? "unknown")}]`))
						.join("\n\n");
					const message = result.isError ? `MCP call failed: ${text}` : text || "MCP call completed.";
					return {
						content: [{ type: "text", text: message }],
						details: {
							ok: !result.isError,
							mode,
							message,
							details: {
								isError: result.isError,
							},
						} satisfies MCPProxyResult,
					};
				}

				if (mode === "resources") {
					if (params.uri) {
						if (!params.server) {
							throw new Error("resources mode with uri requires server");
						}
						const resource = await runWithAuthRetry(pi, ctx, manager, params.server, () =>
							manager.readResource(params.server!, params.uri!, { signal }),
						);
						const message = resource.contents
							.map((item) => (item.text ? `[${item.uri}]\n${item.text}` : `[${item.uri}]`))
							.join("\n\n");
						return {
							content: [{ type: "text", text: message || "No resource content." }],
							details: { ok: true, mode, message: message || "No resource content." } satisfies MCPProxyResult,
						};
					}

					const resources = params.server
						? await runWithAuthRetry(pi, ctx, manager, params.server, () => manager.listResources(params.server, { signal }))
						: await manager.listResources(undefined, { signal });
					const lines: string[] = [];
					for (const [serverName, payload] of Object.entries(resources)) {
						lines.push(`${serverName}:`);
						if (payload.resources.length === 0 && payload.templates.length === 0) {
							lines.push("  (none)");
							continue;
						}
						for (const resource of payload.resources) {
							lines.push(`  - ${resource.uri}`);
						}
						for (const template of payload.templates) {
							lines.push(`  - template ${template.uriTemplate}`);
						}
					}
					const message = lines.join("\n") || "No resources available.";
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}

				if (mode === "prompts") {
					if (params.prompt) {
						if (!params.server) {
							throw new Error("prompts mode with prompt requires server");
						}
						const promptResult = await runWithAuthRetry(pi, ctx, manager, params.server, () =>
							manager.executePrompt(params.server!, params.prompt!, parsePromptArgs(params.promptArgs), {
								signal,
							}),
						);
						const lines: string[] = [];
						if (promptResult.description) {
							lines.push(promptResult.description, "");
						}
						for (const message of promptResult.messages) {
							lines.push(`[${message.role}]`);
							const content = Array.isArray(message.content) ? message.content : [message.content];
							for (const item of content) {
								if (item.type === "text") {
									lines.push(item.text);
								} else if (item.type === "resource") {
									lines.push(`[resource ${item.resource.uri}]`);
									if (item.resource.text) {
										lines.push(item.resource.text);
									}
								} else {
									lines.push(`[${item.type}]`);
								}
							}
							lines.push("");
						}
						const rendered = lines.join("\n").trim();
						return {
							content: [{ type: "text", text: rendered }],
							details: { ok: true, mode, message: rendered } satisfies MCPProxyResult,
						};
					}

					const prompts = params.server
						? await runWithAuthRetry(pi, ctx, manager, params.server, () => manager.listPrompts(params.server, { signal }))
						: await manager.listPrompts(undefined, { signal });
					const lines: string[] = [];
					for (const [serverName, serverPrompts] of Object.entries(prompts)) {
						lines.push(`${serverName}:`);
						if (serverPrompts.length === 0) {
							lines.push("  (none)");
							continue;
						}
						for (const prompt of serverPrompts) {
							lines.push(`  - ${prompt.name}`);
						}
					}
					const message = lines.join("\n") || "No prompts available.";
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}

				if (mode === "add") {
					if (!params.server) {
						throw new Error("add mode requires server (the server name)");
					}
					const serverName = params.server.trim();
					if (!serverName) {
						throw new Error("Server name cannot be empty");
					}

					const nameError = validateServerName(serverName);
					if (nameError) {
						throw new Error(nameError);
					}

					let config: MCPServerConfig;
					try {
						const raw = parseJsonObject(params.args);
						if (raw.command && typeof raw.command === "string") {
							config = {
								type: "stdio",
								command: raw.command,
								args: Array.isArray(raw.args)
									? raw.args.filter((a): a is string => typeof a === "string")
									: undefined,
								env: typeof raw.env === "object" && raw.env !== null
									? Object.fromEntries(
										Object.entries(raw.env as Record<string, unknown>).filter(
											(entry): entry is [string, string] => typeof entry[1] === "string",
										),
									)
									: undefined,
							};
						} else if (raw.url && typeof raw.url === "string") {
							const type = raw.type === "sse" ? "sse" as const : "http" as const;
							config = {
								type,
								url: raw.url,
								headers: typeof raw.headers === "object" && raw.headers !== null
									? Object.fromEntries(
										Object.entries(raw.headers as Record<string, unknown>).filter(
											(entry): entry is [string, string] => typeof entry[1] === "string",
										),
									)
									: undefined,
							};
						} else {
							throw new Error(
								'args must be a JSON object with either "command" (for stdio) or "url" (for http/sse)',
							);
						}
					} catch (error) {
						if (error instanceof SyntaxError) {
							throw new Error("args must be valid JSON");
						}
						throw error;
					}

					const validationErrors = validateServerConfig(serverName, config);
					if (validationErrors.length > 0) {
						throw new Error(validationErrors.join("; "));
					}

					const existing = manager.getServerConfig(serverName);
					if (existing) {
						throw new Error(`Server ${serverName} already exists. Remove it first or use a different name.`);
					}

					const scopeRaw = params.query?.trim().toLowerCase() ?? "project";
					const scope: "user" | "project" = scopeRaw === "user" ? "user" : "project";
					const agentDir = getAgentDir();
					const targetPath = scope === "user"
						? getUserConfigPath(agentDir)
						: getProjectConfigPath(process.cwd());

					await addMCPServer(targetPath, serverName, config);
					await manager.reload();

					const message = `Added MCP server ${serverName} (${scope} scope). Path: ${targetPath}`;
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}

				const action = params.query?.trim().toLowerCase() ?? "status";
				if (action === "on") {
					await manager.setNotificationsEnabled(true);
					const message = "MCP notifications enabled.";
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}
				if (action === "off") {
					await manager.setNotificationsEnabled(false);
					const message = "MCP notifications disabled.";
					return {
						content: [{ type: "text", text: message }],
						details: { ok: true, mode, message } satisfies MCPProxyResult,
					};
				}
				const state = manager.getNotificationState();
				const lines = [
					`enabled: ${state.enabled ? "yes" : "no"}`,
					"subscriptions:",
					...Object.entries(state.subscriptions).flatMap(([server, uris]) =>
						uris.length > 0 ? [`  ${server}:`, ...uris.map((uri) => `    - ${uri}`)] : [`  ${server}: (none)`],
					),
				];
				const message = lines.join("\n");
				return {
					content: [{ type: "text", text: message }],
					details: { ok: true, mode, message } satisfies MCPProxyResult,
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text", text: `MCP gateway error: ${message}` }],
					details: {
						ok: false,
						mode,
						message: `MCP gateway error: ${message}`,
					} satisfies MCPProxyResult,
				};
			}
		},
		renderCall(args, theme) {
			const payload = formatJson(args);
			const text = `${theme.fg("toolTitle", theme.bold("mcp"))}\n${theme.fg("toolOutput", payload)}`;
			return new Text(text, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Running MCP request..."), 0, 0);
			}
			const details = result.details as MCPProxyResult | undefined;
			if (!details) {
				const first = result.content[0];
				return new Text(first?.type === "text" ? first.text : "", 0, 0);
			}

			const firstText = result.content[0]?.type === "text" ? result.content[0].text : details.message;
			const detailText = details.details && expanded ? `\n\n${formatJson(details.details)}` : "";
			const rendered = renderCollapsibleText(`${firstText}${detailText}`, expanded, theme);
			if (!details.ok) {
				return new Text(theme.fg("error", rendered), 0, 0);
			}
			return new Text(rendered, 0, 0);
		},
	});
}
