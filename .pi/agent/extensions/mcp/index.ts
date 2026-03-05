import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { createDirectMCPToolDefinition } from "./tool-bridge";
import { registerMCPCommands, runWithAuthRetry } from "./commands";
import { getAgentDir } from "./config";
import { MCPManager } from "./manager";
import { registerMCPProxyTool } from "./proxy-tool";

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
}
