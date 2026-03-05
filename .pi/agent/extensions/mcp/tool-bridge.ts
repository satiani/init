import { keyHint, type ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Text } from "@mariozechner/pi-tui";
import type {
	MCPContent,
	MCPDirectToolDefinition,
	MCPToolCallResult,
	MCPToolDefinition,
	MCPToolDetails,
} from "./types";

export function sanitizeToolNamePart(value: string, fallback: string): string {
	const sanitized = value
		.toLowerCase()
		.replace(/[^a-z0-9_]+/g, "_")
		.replace(/_+/g, "_")
		.replace(/^_+|_+$/g, "");
	return sanitized || fallback;
}

export function createMCPToolName(serverName: string, toolName: string): string {
	const serverPart = sanitizeToolNamePart(serverName, "server");
	const rawToolPart = sanitizeToolNamePart(toolName, "tool");
	const prefix = `${serverPart}_`;
	const toolPart = rawToolPart.startsWith(prefix) ? rawToolPart.slice(prefix.length) : rawToolPart;
	return `mcp_${serverPart}__${toolPart}`;
}

export function parseMCPToolName(name: string): { serverName: string; toolName: string } | null {
	if (!name.startsWith("mcp_")) {
		return null;
	}
	const remainder = name.slice(4);
	const separator = remainder.indexOf("__");
	if (separator >= 0) {
		return {
			serverName: remainder.slice(0, separator),
			toolName: remainder.slice(separator + 2),
		};
	}

	// Backward compatibility with old single-underscore delimiter.
	const legacySeparator = remainder.indexOf("_");
	if (legacySeparator < 0) {
		return null;
	}
	return {
		serverName: remainder.slice(0, legacySeparator),
		toolName: remainder.slice(legacySeparator + 1),
	};
}

export function formatMCPContent(content: MCPContent[]): string {
	if (content.length === 0) {
		return "";
	}

	const lines: string[] = [];
	for (const item of content) {
		if (item.type === "text") {
			lines.push(item.text);
			continue;
		}
		if (item.type === "image") {
			lines.push(`[Image: ${item.mimeType}]`);
			continue;
		}
		if (item.type === "resource") {
			if (item.resource.text) {
				lines.push(`[Resource: ${item.resource.uri}]\n${item.resource.text}`);
			} else {
				lines.push(`[Resource: ${item.resource.uri}]`);
			}
		}
	}
	return lines.join("\n\n");
}

function sanitizeInputSchema(schema: MCPToolDefinition["inputSchema"]): Record<string, unknown> {
	const clone = JSON.parse(JSON.stringify(schema)) as Record<string, unknown>;
	delete clone.$schema;
	if (!("type" in clone)) {
		clone.type = "object";
	}
	if (!("properties" in clone)) {
		clone.properties = {};
	}
	return clone;
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

export function createDirectMCPToolDefinition(
	serverName: string,
	tool: MCPToolDefinition,
	invoke: (args: Record<string, unknown>, signal?: AbortSignal, ctx?: ExtensionContext) => Promise<MCPToolCallResult>,
): MCPDirectToolDefinition {
	const toolName = createMCPToolName(serverName, tool.name);
	const parameters = Type.Unsafe<Record<string, unknown>>(sanitizeInputSchema(tool.inputSchema));

	return {
		name: toolName,
		label: `${serverName}/${tool.name}`,
		description: tool.description ?? `MCP tool ${tool.name} from server ${serverName}`,
		promptSnippet: `Call MCP tool ${tool.name} on server ${serverName}`,
		promptGuidelines: [
			`Use ${toolName} when the user asks for ${serverName} capability ${tool.name}.`,
			"Provide well-formed JSON arguments matching the tool schema.",
		],
		parameters,
		async execute(_toolCallId, params, signal, _onUpdate, ctx) {
			const result = await invoke(params, signal, ctx);
			const text = formatMCPContent(result.content);
			const details: MCPToolDetails = {
				serverName,
				toolName: tool.name,
				isError: result.isError,
				rawContent: result.content,
			};

			if (result.isError) {
				return {
					content: [{ type: "text", text: `MCP error: ${text || "Unknown MCP tool failure"}` }],
					details,
				};
			}

			return {
				content: [{ type: "text", text: text || "MCP tool call completed." }],
				details,
			};
		},
		renderCall(args, theme) {
			const payload = formatJson(args);
			const text = `${theme.fg("toolTitle", theme.bold(`${serverName}/${tool.name}`))}\n${theme.fg("toolOutput", payload)}`;
			return new Text(text, 0, 0);
		},
		renderResult(result, { expanded, isPartial }, theme) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Running MCP tool..."), 0, 0);
			}
			const first = result.content[0];
			const output =
				first && first.type === "text"
					? first.text
					: result.details?.isError
						? "MCP tool failed"
						: "MCP tool call completed.";
			const rendered = renderCollapsibleText(output, expanded, theme);
			if (result.details?.isError) {
				return new Text(theme.fg("error", rendered), 0, 0);
			}
			return new Text(rendered, 0, 0);
		},
	};
}

export interface ToolSearchResult {
	serverName: string;
	toolName: string;
	description?: string;
}

export function searchMCPTools(
	serverTools: Record<string, MCPToolDefinition[]>,
	query: string,
	limit = 20,
): ToolSearchResult[] {
	const normalizedQuery = query.trim().toLowerCase();
	if (!normalizedQuery) {
		return [];
	}

	const matches: ToolSearchResult[] = [];
	for (const [serverName, tools] of Object.entries(serverTools)) {
		for (const tool of tools) {
			const haystack = `${serverName} ${tool.name} ${tool.description ?? ""}`.toLowerCase();
			if (!haystack.includes(normalizedQuery)) {
				continue;
			}
			matches.push({
				serverName,
				toolName: tool.name,
				description: tool.description,
			});
			if (matches.length >= limit) {
				return matches;
			}
		}
	}

	return matches;
}
