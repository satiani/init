import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createDirectMCPToolDefinition } from "./tool-bridge";
import { registerMCPCommands, runWithAuthRetry } from "./commands";
import { getAgentDir } from "./config";
import { MCPManager, type MCPConnectionStatus } from "./manager";
import { registerMCPProxyTool } from "./proxy-tool";
import type { MCPToolDefinition } from "./types";

export default function mcpExtension(pi: ExtensionAPI): void {
	const registeredDirectToolSignatures = new Map<string, string>();

	const manager = new MCPManager({
		cwd: process.cwd(),
		agentDir: getAgentDir(),
		onToolsChanged: (candidates) => {
			for (const candidate of candidates) {
				const config = manager.getServerConfig(candidate.serverName);
				if (!config || !config.enabled || !config.directTools) {
					continue;
				}
				const directTool = createDirectMCPToolDefinition(candidate.serverName, candidate.tool, (args, signal, ctx) => {
					if (!ctx) {
						return manager.callTool(candidate.serverName, candidate.tool.name, args, { signal });
					}
					return runWithAuthRetry(pi, ctx, manager, candidate.serverName, () =>
						manager.callTool(candidate.serverName, candidate.tool.name, args, { signal }),
					);
				});
				const signature = JSON.stringify({
					description: candidate.tool.description ?? "",
					schema: candidate.tool.inputSchema,
				});
				if (registeredDirectToolSignatures.get(directTool.name) === signature) {
					continue;
				}
				registeredDirectToolSignatures.set(directTool.name, signature);
				pi.registerTool(directTool);
			}
		},
		onPromptsChanged: () => {
			// Prompt access is exposed through /mcp prompt and tool mode=prompts.
		},
		onResourcesChanged: (serverName, uri) => {
			pi.sendMessage({
				customType: "mcp",
				content: `[MCP] Resource updated on ${serverName}: ${uri}`,
				display: true,
			});
		},
		onNotification: (serverName, method, params) => {
			if (method === "internal/reconnect_scheduled") {
				const details =
					typeof params === "object" && params !== null
						? params
						: { message: String(params) };
				pi.sendMessage({
					customType: "mcp",
					content: `[MCP] reconnect scheduled for ${serverName}: ${JSON.stringify(details)}`,
					display: true,
				});
			}
		},
	});

	registerMCPProxyTool(pi, manager);
	registerMCPCommands(pi, manager);

	pi.on("session_start", async (_event, ctx) => {
		await manager.initialize();
		ctx.ui.notify("MCP extension initialized.", "info");
	});

	pi.on("session_shutdown", async () => {
		await manager.disconnectAll();
	});

	pi.on("before_agent_start", async (_event, _ctx) => {
		if (!manager.mergedConfig) return;

		const serverNames = manager.getServerNames();
		if (serverNames.length === 0) return;

		const enabledServers = serverNames.filter((name) => {
			const config = manager.getServerConfig(name);
			return config?.enabled;
		});
		if (enabledServers.length === 0) return;

		const lines: string[] = [
			"[MCP Server Catalog]",
			"Configured MCP servers (use the `mcp` tool to connect and call):",
			"",
		];

		for (const name of enabledServers) {
			const config = manager.getServerConfig(name)!;
			const status = manager.getConnectionStatus(name);
			const tools = manager.getServerTools(name);
			const toolLabel = tools.length > 0 ? `, ${tools.length} tools` : "";

			const description = config.description?.trim()
				|| autoDescribeFromTools(tools)
				|| `${config.type} server`;

			lines.push(`- ${name} [${formatStatus(status)}${toolLabel}]: ${description}`);
		}

		lines.push("");
		lines.push(
			"If a user's question might be answered by a server that is disconnected or requires auth, "
			+ "use `mcp` mode=connect to activate it first (this triggers OAuth in the browser if needed), "
			+ "then call its tools. Do not tell the user you lack access without trying first.",
		);

		return {
			message: {
				customType: "mcp-catalog",
				content: lines.join("\n"),
				display: false,
			},
		};
	});
}

function formatStatus(status: MCPConnectionStatus): string {
	switch (status) {
		case "connected":
			return "connected";
		case "connecting":
			return "connecting";
		case "requires-auth":
			return "requires auth";
		case "disconnected":
			return "disconnected";
		case "disabled":
			return "disabled";
		default:
			return status;
	}
}

function autoDescribeFromTools(tools: MCPToolDefinition[]): string | null {
	if (tools.length === 0) return null;

	const summaries = tools
		.slice(0, 8)
		.map((t) => t.name)
		.join(", ");
	const overflow = tools.length > 8 ? ` (+${tools.length - 8} more)` : "";
	return `Provides tools: ${summaries}${overflow}`;
}
