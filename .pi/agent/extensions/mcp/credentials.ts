import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { MCPCredentialsFile, MCPOAuthCredential } from "./types";

const CREDENTIALS_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseCredentials(content: string): MCPCredentialsFile {
	try {
		const parsed = JSON.parse(content) as unknown;
		if (!isRecord(parsed) || parsed.version !== CREDENTIALS_VERSION || !isRecord(parsed.credentials)) {
			return { version: CREDENTIALS_VERSION, credentials: {} };
		}

		const credentials: Record<string, MCPOAuthCredential> = {};
		for (const [key, value] of Object.entries(parsed.credentials)) {
			if (!isRecord(value) || value.type !== "oauth" || typeof value.access !== "string") {
				continue;
			}
			credentials[key] = {
				type: "oauth",
				access: value.access,
				refresh: typeof value.refresh === "string" ? value.refresh : undefined,
				expires: typeof value.expires === "number" ? value.expires : undefined,
				tokenType: typeof value.tokenType === "string" ? value.tokenType : undefined,
				scope: typeof value.scope === "string" ? value.scope : undefined,
			};
		}
		return {
			version: CREDENTIALS_VERSION,
			credentials,
		};
	} catch {
		return { version: CREDENTIALS_VERSION, credentials: {} };
	}
}

export interface MCPCredentialStorage {
	get(id: string): Promise<MCPOAuthCredential | undefined>;
	set(id: string, credential: MCPOAuthCredential): Promise<void>;
	remove(id: string): Promise<void>;
	create(credential: MCPOAuthCredential): Promise<string>;
}

export class MCPCredentialStore implements MCPCredentialStorage {
	readonly #filePath: string;
	#cache: MCPCredentialsFile = { version: CREDENTIALS_VERSION, credentials: {} };
	#loaded = false;

	constructor(agentDir: string, fileName = "mcp-credentials.json") {
		this.#filePath = join(agentDir, fileName);
	}

	async #load(): Promise<void> {
		if (this.#loaded) {
			return;
		}
		try {
			const content = await readFile(this.#filePath, "utf8");
			this.#cache = parseCredentials(content);
		} catch {
			this.#cache = { version: CREDENTIALS_VERSION, credentials: {} };
		}
		this.#loaded = true;
	}

	async #save(): Promise<void> {
		await mkdir(dirname(this.#filePath), { recursive: true, mode: 0o700 });
		const tmpFilePath = `${this.#filePath}.${randomUUID()}.tmp`;
		await writeFile(tmpFilePath, `${JSON.stringify(this.#cache, null, 2)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
		try {
			await rename(tmpFilePath, this.#filePath);
		} catch (error) {
			await unlink(tmpFilePath).catch(() => undefined);
			throw error;
		}
	}

	async get(id: string): Promise<MCPOAuthCredential | undefined> {
		await this.#load();
		return this.#cache.credentials[id];
	}

	async set(id: string, credential: MCPOAuthCredential): Promise<void> {
		await this.#load();
		this.#cache.credentials[id] = credential;
		await this.#save();
	}

	async remove(id: string): Promise<void> {
		await this.#load();
		if (!this.#cache.credentials[id]) {
			return;
		}
		delete this.#cache.credentials[id];
		await this.#save();
	}

	async create(credential: MCPOAuthCredential): Promise<string> {
		const id = `mcp_oauth_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
		await this.set(id, credential);
		return id;
	}
}
