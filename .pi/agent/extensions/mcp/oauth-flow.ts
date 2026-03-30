import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { MCPOAuthCredential, MCPOAuthConfig } from "./types";

const DEFAULT_CALLBACK_PORT = 39271;
// Keep the loopback host stable across client registration, authorization,
// token exchange, and the local callback listener. Some providers (including
// Atlassian MCP) treat localhost and 127.0.0.1 as different redirect URIs.
export const OAUTH_CALLBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export interface MCPOAuthFlowCallbacks {
	onAuth?: (payload: { url: string; instructions?: string }) => void;
	onProgress?: (message: string) => void;
}

interface OAuthCallbackResult {
	code: string;
	state: string;
}

function toBase64Url(input: Buffer): string {
	return input
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=/g, "");
}

function sha256Base64Url(value: string): string {
	const digest = createHash("sha256").update(value).digest();
	return toBase64Url(digest);
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/\"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function writeHtmlResponse(response: ServerResponse, statusCode: number, title: string, body: string): void {
	response.statusCode = statusCode;
	response.setHeader("Content-Type", "text/html; charset=utf-8");
	const safeTitle = escapeHtml(title);
	const safeBody = escapeHtml(body);
	response.end(`<!doctype html><html><head><title>${safeTitle}</title></head><body><h2>${safeTitle}</h2><p>${safeBody}</p></body></html>`);
}

function parseRequestUrl(request: IncomingMessage): URL {
	const host = request.headers.host ?? OAUTH_CALLBACK_HOST;
	return new URL(request.url ?? CALLBACK_PATH, `http://${host}`);
}

function readQuery(request: IncomingMessage): URLSearchParams {
	return parseRequestUrl(request).searchParams;
}

async function listen(server: ReturnType<typeof createServer>, port: number): Promise<number> {
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, OAUTH_CALLBACK_HOST, () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Could not determine OAuth callback server address");
	}
	return address.port;
}

function raceWithTimeoutAndAbort<T>(promise: Promise<T>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
	if (signal?.aborted) {
		return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error("OAuth flow aborted"));
	}

	return new Promise<T>((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("OAuth flow timed out")), timeoutMs);
		const onAbort = () => {
			clearTimeout(timeout);
			reject(signal?.reason instanceof Error ? signal.reason : new Error("OAuth flow aborted"));
		};
		signal?.addEventListener("abort", onAbort, { once: true });

		promise
			.then((value) => {
				clearTimeout(timeout);
				signal?.removeEventListener("abort", onAbort);
				resolve(value);
			})
			.catch((error) => {
				clearTimeout(timeout);
				signal?.removeEventListener("abort", onAbort);
				reject(error);
			});
	});
}

export class MCPOAuthFlow {
	constructor(private readonly config: MCPOAuthConfig) {}

	#resolveClientIdFromAuthorizationUrl(): string | undefined {
		try {
			return new URL(this.config.authorizationUrl ?? "").searchParams.get("client_id") ?? undefined;
		} catch {
			return undefined;
		}
	}

	#buildAuthorizationUrl(redirectUri: string, state: string, verifier: string): string {
		if (!this.config.authorizationUrl) {
			throw new Error("OAuth authorizationUrl is missing");
		}
		const authUrl = new URL(this.config.authorizationUrl);
		const params = authUrl.searchParams;

		const clientId = this.config.clientId?.trim() || this.#resolveClientIdFromAuthorizationUrl();
		if (clientId && !params.get("client_id")) {
			params.set("client_id", clientId);
		}
		params.set("response_type", params.get("response_type") ?? "code");
		params.set("redirect_uri", redirectUri);
		params.set("state", state);
		if (this.config.scopes && !params.get("scope")) {
			params.set("scope", this.config.scopes);
		}

		params.set("code_challenge_method", "S256");
		params.set("code_challenge", sha256Base64Url(verifier));

		return authUrl.toString();
	}

	async #exchangeToken(code: string, redirectUri: string, verifier: string): Promise<MCPOAuthCredential> {
		if (!this.config.tokenUrl) {
			throw new Error("OAuth tokenUrl is missing");
		}

		const body = new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			code_verifier: verifier,
		});

		const clientId = this.config.clientId?.trim() || this.#resolveClientIdFromAuthorizationUrl();
		if (clientId) {
			body.set("client_id", clientId);
		}
		if (this.config.clientSecret) {
			body.set("client_secret", this.config.clientSecret);
		}

		const response = await fetch(this.config.tokenUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: body.toString(),
		});
		if (!response.ok) {
			const text = await response.text();
			throw new Error(`OAuth token exchange failed: HTTP ${response.status} ${text}`);
		}

		const payload = (await response.json()) as {
			access_token?: string;
			refresh_token?: string;
			expires_in?: number;
			token_type?: string;
			scope?: string;
		};
		if (!payload.access_token) {
			throw new Error("OAuth token response did not include access_token");
		}

		const expires =
			typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
				? Date.now() + payload.expires_in * 1000
				: undefined;

		return {
			type: "oauth",
			access: payload.access_token,
			refresh: payload.refresh_token,
			expires,
			tokenType: payload.token_type,
			scope: payload.scope,
		};
	}

	async login(callbacks: MCPOAuthFlowCallbacks = {}, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<MCPOAuthCredential> {
		const verifier = toBase64Url(randomBytes(32));
		const state = toBase64Url(randomBytes(24));
		const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const callbackPort = this.config.callbackPort ?? DEFAULT_CALLBACK_PORT;

		let resolveCallback: ((value: OAuthCallbackResult) => void) | undefined;
		let rejectCallback: ((error: Error) => void) | undefined;
		const callbackPromise = new Promise<OAuthCallbackResult>((resolve, reject) => {
			resolveCallback = resolve;
			rejectCallback = reject;
		});

		const server = createServer((request, response) => {
			try {
				const requestUrl = parseRequestUrl(request);
				if (requestUrl.pathname !== CALLBACK_PATH) {
					response.statusCode = 404;
					response.end();
					return;
				}
				const query = readQuery(request);
				const error = query.get("error");
				if (error) {
					writeHtmlResponse(response, 400, "OAuth authorization failed", error);
					rejectCallback?.(new Error(`OAuth authorization failed: ${error}`));
					return;
				}

				const code = query.get("code");
				const callbackState = query.get("state");
				if (!code || !callbackState) {
					writeHtmlResponse(response, 400, "OAuth callback missing parameters", "Missing code or state");
					rejectCallback?.(new Error("OAuth callback did not include code/state"));
					return;
				}

				writeHtmlResponse(response, 200, "Authorization complete", "Return to pi to continue.");
				resolveCallback?.({ code, state: callbackState });
			} catch (error) {
				writeHtmlResponse(response, 500, "OAuth callback error", "Unexpected callback error");
				rejectCallback?.(error instanceof Error ? error : new Error(String(error)));
			}
		});

		let listeningPort = callbackPort;
		try {
			listeningPort = await listen(server, callbackPort);
			const redirectUri = `http://${OAUTH_CALLBACK_HOST}:${listeningPort}${CALLBACK_PATH}`;
			const authUrl = this.#buildAuthorizationUrl(redirectUri, state, verifier);

			callbacks.onAuth?.({
				url: authUrl,
				instructions: "Open the URL in your browser and complete authorization.",
			});
			callbacks.onProgress?.("Waiting for OAuth callback...");

			const callbackResult = await raceWithTimeoutAndAbort(callbackPromise, timeoutMs, options?.signal);
			if (callbackResult.state !== state) {
				throw new Error("OAuth state mismatch");
			}

			callbacks.onProgress?.("Exchanging OAuth code for access token...");
			return await this.#exchangeToken(callbackResult.code, redirectUri, verifier);
		} finally {
			await new Promise<void>((resolve) => {
				server.close(() => resolve());
			});
		}
	}
}
