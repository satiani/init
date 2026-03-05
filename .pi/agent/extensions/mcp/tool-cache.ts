import { createHash, randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import type { MCPResolvedServerConfig, MCPToolCacheData, MCPToolDefinition } from "./types";

const CACHE_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function stableClone(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((entry) => stableClone(entry));
	}
	if (isRecord(value)) {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value).sort()) {
			sorted[key] = stableClone(value[key]);
		}
		return sorted;
	}
	return value;
}

function stableStringify(value: unknown): string {
	return JSON.stringify(stableClone(value));
}

function sanitizeConfigForHash(config: MCPResolvedServerConfig): Record<string, unknown> {
	const clone = {
		...config,
		auth: config.auth
			? {
				...config.auth,
				credentialId: config.auth.credentialId ? "<credential>" : undefined,
			}
			: undefined,
	};

	if (clone.type === "http" || clone.type === "sse") {
		const headers = clone.headers ? { ...clone.headers } : undefined;
		if (headers?.Authorization) {
			headers.Authorization = "<redacted>";
		}
		return {
			...clone,
			headers,
		};
	}

	if (clone.type === "stdio") {
		const env = clone.env ? { ...clone.env } : undefined;
		if (env) {
			for (const key of Object.keys(env)) {
				if (key.toLowerCase().includes("token") || key.toLowerCase().includes("key") || key.toLowerCase().includes("secret")) {
					env[key] = "<redacted>";
				}
			}
		}
		return {
			...clone,
			env,
		};
	}

	return clone;
}

function hashConfig(config: MCPResolvedServerConfig): string {
	const digest = createHash("sha256");
	digest.update(stableStringify(sanitizeConfigForHash(config)));
	return digest.digest("hex");
}

function parseCache(raw: string): MCPToolCacheData {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (!isRecord(parsed)) {
			return { version: CACHE_VERSION, servers: {} };
		}
		if (parsed.version !== CACHE_VERSION || !isRecord(parsed.servers)) {
			return { version: CACHE_VERSION, servers: {} };
		}

		const servers: MCPToolCacheData["servers"] = {};
		for (const [serverName, entry] of Object.entries(parsed.servers)) {
			if (!isRecord(entry) || typeof entry.configHash !== "string" || !Array.isArray(entry.tools)) {
				continue;
			}
			servers[serverName] = {
				configHash: entry.configHash,
				tools: entry.tools as MCPToolDefinition[],
				updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : 0,
			};
		}

		return {
			version: CACHE_VERSION,
			servers,
		};
	} catch {
		return { version: CACHE_VERSION, servers: {} };
	}
}

export class MCPToolCache {
	readonly #cachePath: string;
	#cache: MCPToolCacheData = { version: CACHE_VERSION, servers: {} };
	#loaded = false;

	constructor(agentDir: string, fileName = "mcp-cache.json") {
		this.#cachePath = join(agentDir, fileName);
	}

	async #load(): Promise<void> {
		if (this.#loaded) {
			return;
		}
		try {
			const content = await readFile(this.#cachePath, "utf8");
			this.#cache = parseCache(content);
		} catch {
			this.#cache = { version: CACHE_VERSION, servers: {} };
		}
		this.#loaded = true;
	}

	async #save(): Promise<void> {
		await mkdir(dirname(this.#cachePath), { recursive: true, mode: 0o700 });
		const tmpPath = `${this.#cachePath}.${randomUUID()}.tmp`;
		await writeFile(tmpPath, `${JSON.stringify(this.#cache, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
		try {
			await rename(tmpPath, this.#cachePath);
		} catch (error) {
			await unlink(tmpPath).catch(() => undefined);
			throw error;
		}
	}

	async get(serverName: string, config: MCPResolvedServerConfig): Promise<MCPToolDefinition[] | null> {
		await this.#load();
		const entry = this.#cache.servers[serverName];
		if (!entry) {
			return null;
		}
		if (entry.configHash !== hashConfig(config)) {
			return null;
		}
		return entry.tools;
	}

	async getAllMatching(configs: Record<string, MCPResolvedServerConfig>): Promise<Record<string, MCPToolDefinition[]>> {
		await this.#load();
		const result: Record<string, MCPToolDefinition[]> = {};
		for (const [serverName, config] of Object.entries(configs)) {
			const entry = this.#cache.servers[serverName];
			if (!entry) continue;
			if (entry.configHash !== hashConfig(config)) continue;
			result[serverName] = entry.tools;
		}
		return result;
	}

	async set(serverName: string, config: MCPResolvedServerConfig, tools: MCPToolDefinition[]): Promise<void> {
		await this.#load();
		this.#cache.servers[serverName] = {
			configHash: hashConfig(config),
			tools,
			updatedAt: Date.now(),
		};
		await this.#save();
	}

	async remove(serverName: string): Promise<void> {
		await this.#load();
		if (!this.#cache.servers[serverName]) {
			return;
		}
		delete this.#cache.servers[serverName];
		await this.#save();
	}
}
