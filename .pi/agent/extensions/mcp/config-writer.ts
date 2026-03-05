import { dirname } from "node:path";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { readMCPConfigFile, validateServerConfig, validateServerName } from "./config";
import type { MCPConfigFile, MCPServerConfig } from "./types";

function normalizeConfigForWrite(config: MCPConfigFile): MCPConfigFile {
	const normalized: MCPConfigFile = {};

	if (config.defaults) {
		normalized.defaults = { ...config.defaults };
	}

	if (config.imports?.length) {
		normalized.imports = [...new Set(config.imports)].sort();
	}

	if (config.disabledServers?.length) {
		normalized.disabledServers = [...new Set(config.disabledServers)].sort();
	}

	if (config.mcpServers) {
		const entries = Object.entries(config.mcpServers).sort(([left], [right]) => left.localeCompare(right));
		normalized.mcpServers = Object.fromEntries(entries);
	}

	return normalized;
}

export async function writeMCPConfigFile(filePath: string, config: MCPConfigFile): Promise<void> {
	const normalized = normalizeConfigForWrite(config);
	await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });

	const tmpPath = `${filePath}.${randomUUID()}.tmp`;
	const content = `${JSON.stringify(normalized, null, 2)}\n`;
	await writeFile(tmpPath, content, { encoding: "utf8", mode: 0o600 });

	try {
		await rename(tmpPath, filePath);
	} catch (error) {
		await unlink(tmpPath).catch(() => undefined);
		throw error;
	}
}

export async function addMCPServer(filePath: string, name: string, config: MCPServerConfig): Promise<void> {
	const nameError = validateServerName(name);
	if (nameError) {
		throw new Error(nameError);
	}

	const validationErrors = validateServerConfig(name, config);
	if (validationErrors.length > 0) {
		throw new Error(validationErrors.join("; "));
	}

	const current = await readMCPConfigFile(filePath);
	const existing = current.mcpServers ?? {};
	if (existing[name]) {
		throw new Error(`Server ${name} already exists in ${filePath}`);
	}

	await writeMCPConfigFile(filePath, {
		...current,
		mcpServers: {
			...existing,
			[name]: config,
		},
	});
}

export async function updateMCPServer(filePath: string, name: string, config: MCPServerConfig): Promise<void> {
	const nameError = validateServerName(name);
	if (nameError) {
		throw new Error(nameError);
	}

	const validationErrors = validateServerConfig(name, config);
	if (validationErrors.length > 0) {
		throw new Error(validationErrors.join("; "));
	}

	const current = await readMCPConfigFile(filePath);
	await writeMCPConfigFile(filePath, {
		...current,
		mcpServers: {
			...(current.mcpServers ?? {}),
			[name]: config,
		},
	});
}

export async function removeMCPServer(filePath: string, name: string): Promise<void> {
	const current = await readMCPConfigFile(filePath);
	const currentServers = { ...(current.mcpServers ?? {}) };
	if (!currentServers[name]) {
		throw new Error(`Server ${name} not found in ${filePath}`);
	}
	delete currentServers[name];

	await writeMCPConfigFile(filePath, {
		...current,
		mcpServers: currentServers,
	});
}

export async function getMCPServer(filePath: string, name: string): Promise<MCPServerConfig | undefined> {
	const config = await readMCPConfigFile(filePath);
	return config.mcpServers?.[name];
}

export async function listMCPServers(filePath: string): Promise<string[]> {
	const config = await readMCPConfigFile(filePath);
	return Object.keys(config.mcpServers ?? {});
}

export async function readDisabledServers(filePath: string): Promise<string[]> {
	const config = await readMCPConfigFile(filePath);
	return config.disabledServers ?? [];
}

export async function setServerDisabled(filePath: string, name: string, disabled: boolean): Promise<void> {
	const config = await readMCPConfigFile(filePath);
	const disabledServers = new Set(config.disabledServers ?? []);
	if (disabled) {
		disabledServers.add(name);
	} else {
		disabledServers.delete(name);
	}

	await writeMCPConfigFile(filePath, {
		...config,
		disabledServers: disabledServers.size > 0 ? Array.from(disabledServers).sort() : undefined,
	});
}
