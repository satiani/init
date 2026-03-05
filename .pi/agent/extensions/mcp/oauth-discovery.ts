export interface OAuthEndpoints {
	authorizationUrl: string;
	tokenUrl: string;
	registrationUrl?: string;
	clientId?: string;
	scopes?: string;
}

export interface AuthDetectionResult {
	requiresAuth: boolean;
	authType?: "oauth" | "apikey" | "unknown";
	oauth?: OAuthEndpoints;
	authServerUrl?: string;
	message?: string;
}

function parseMcpAuthServerUrl(errorMessage: string): string | undefined {
	const match = errorMessage.match(/Mcp-Auth-Server:\s*([^;\]\s]+)/i);
	if (!match?.[1]) {
		return undefined;
	}
	try {
		return new URL(match[1]).toString();
	} catch {
		return undefined;
	}
}

function detectAuthError(error: Error): boolean {
	const message = error.message.toLowerCase();
	return (
		message.includes("401") ||
		message.includes("403") ||
		message.includes("unauthorized") ||
		message.includes("forbidden") ||
		message.includes("authentication")
	);
}

function extractValueFromAuthUrl(url: string, key: "client_id" | "scope"): string | undefined {
	try {
		return new URL(url).searchParams.get(key) ?? undefined;
	} catch {
		return undefined;
	}
}

function extractOAuthFromMessage(message: string): OAuthEndpoints | null {
	const challengeEntries = Array.from(message.matchAll(/([a-zA-Z_][a-zA-Z0-9_-]*)="([^"]+)"/g));
	if (challengeEntries.length > 0) {
		const challenge = new Map<string, string>();
		for (const [, key, value] of challengeEntries) {
			challenge.set(key.toLowerCase(), value);
		}

		const authorizationUrl =
			challenge.get("authorization_uri") ||
			challenge.get("authorization_url") ||
			challenge.get("authorization_endpoint") ||
			challenge.get("authorize_url") ||
			challenge.get("realm");
		const tokenUrl =
			challenge.get("token_url") || challenge.get("token_uri") || challenge.get("token_endpoint");
		const registrationUrl =
			challenge.get("registration_endpoint") || challenge.get("registration_url") || challenge.get("registration_uri");
		if (authorizationUrl && tokenUrl) {
			return {
				authorizationUrl,
				tokenUrl,
				registrationUrl,
				clientId: challenge.get("client_id") ?? extractValueFromAuthUrl(authorizationUrl, "client_id"),
				scopes: challenge.get("scope") ?? extractValueFromAuthUrl(authorizationUrl, "scope"),
			};
		}
	}

	const legacyMatch = message.match(/realm="([^"]+)".*token_url="([^"]+)"/);
	if (legacyMatch) {
		return {
			authorizationUrl: legacyMatch[1],
			tokenUrl: legacyMatch[2],
			clientId: extractValueFromAuthUrl(legacyMatch[1], "client_id"),
			scopes: extractValueFromAuthUrl(legacyMatch[1], "scope"),
		};
	}

	const jsonMatch = message.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		return null;
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
		const container =
			typeof parsed.oauth === "object" && parsed.oauth !== null
				? (parsed.oauth as Record<string, unknown>)
				: parsed;
		const authorizationUrl =
			(typeof container.authorization_url === "string" && container.authorization_url) ||
			(typeof container.authorizationUrl === "string" && container.authorizationUrl) ||
			(typeof container.authorization_endpoint === "string" && container.authorization_endpoint) ||
			(typeof container.authorizationEndpoint === "string" && container.authorizationEndpoint) ||
			undefined;
		const tokenUrl =
			(typeof container.token_url === "string" && container.token_url) ||
			(typeof container.tokenUrl === "string" && container.tokenUrl) ||
			(typeof container.token_endpoint === "string" && container.token_endpoint) ||
			(typeof container.tokenEndpoint === "string" && container.tokenEndpoint) ||
			undefined;
		const registrationUrl =
			(typeof container.registration_endpoint === "string" && container.registration_endpoint) ||
			(typeof container.registration_url === "string" && container.registration_url) ||
			(typeof container.registrationUrl === "string" && container.registrationUrl) ||
			(typeof container.registrationEndpoint === "string" && container.registrationEndpoint) ||
			undefined;
		if (authorizationUrl && tokenUrl) {
			return {
				authorizationUrl,
				tokenUrl,
				registrationUrl,
				clientId:
					(typeof container.client_id === "string" && container.client_id) ||
					(typeof container.clientId === "string" && container.clientId) ||
					extractValueFromAuthUrl(authorizationUrl, "client_id"),
				scopes:
					(typeof container.scope === "string" && container.scope) ||
					(typeof container.scopes === "string" && container.scopes) ||
					extractValueFromAuthUrl(authorizationUrl, "scope"),
			};
		}
	} catch {
		return null;
	}

	return null;
}

export function analyzeAuthError(error: Error): AuthDetectionResult {
	if (!detectAuthError(error)) {
		return { requiresAuth: false };
	}

	const authServerUrl = parseMcpAuthServerUrl(error.message);
	const oauth = extractOAuthFromMessage(error.message);
	if (oauth) {
		return {
			requiresAuth: true,
			authType: "oauth",
			oauth,
			authServerUrl,
			message: "Server requires OAuth authentication.",
		};
	}

	const message = error.message.toLowerCase();
	if (message.includes("api key") || message.includes("api_key") || message.includes("bearer") || message.includes("token")) {
		return {
			requiresAuth: true,
			authType: "apikey",
			authServerUrl,
			message: "Server requires API key authentication.",
		};
	}

	return {
		requiresAuth: true,
		authType: "unknown",
		authServerUrl,
		message: "Server requires authentication.",
	};
}

export async function discoverOAuthEndpoints(serverUrl: string, authServerUrl?: string): Promise<OAuthEndpoints | null> {
	const paths = [
		"/.well-known/oauth-authorization-server",
		"/.well-known/openid-configuration",
		"/.well-known/oauth-protected-resource",
		"/oauth/metadata",
		"/.mcp/auth",
	];

	const queue: string[] = [];
	if (authServerUrl) {
		queue.push(authServerUrl);
	}
	queue.push(serverUrl);
	const visited = new Set<string>();

	while (queue.length > 0) {
		const baseUrl = queue.shift();
		if (!baseUrl || visited.has(baseUrl)) {
			continue;
		}
		visited.add(baseUrl);

		for (const path of paths) {
			let metadataUrl: string;
			try {
				metadataUrl = new URL(path, baseUrl).toString();
			} catch {
				continue;
			}

			try {
				const response = await fetch(metadataUrl, {
					method: "GET",
					headers: { Accept: "application/json" },
					signal: AbortSignal.timeout(5_000),
				});
				if (!response.ok) {
					continue;
				}

				const metadata = (await response.json()) as Record<string, unknown>;
				const authorizationUrl =
					(typeof metadata.authorization_endpoint === "string" && metadata.authorization_endpoint) ||
					(typeof metadata.authorization_url === "string" && metadata.authorization_url) ||
					undefined;
				const tokenUrl =
					(typeof metadata.token_endpoint === "string" && metadata.token_endpoint) ||
					(typeof metadata.token_url === "string" && metadata.token_url) ||
					undefined;
				const registrationUrl =
					(typeof metadata.registration_endpoint === "string" && metadata.registration_endpoint) ||
					(typeof metadata.registration_url === "string" && metadata.registration_url) ||
					undefined;

				if (authorizationUrl && tokenUrl) {
					return {
						authorizationUrl,
						tokenUrl,
						registrationUrl,
						clientId:
							(typeof metadata.client_id === "string" && metadata.client_id) ||
							(typeof metadata.default_client_id === "string" && metadata.default_client_id) ||
							extractValueFromAuthUrl(authorizationUrl, "client_id"),
						scopes:
							(Array.isArray(metadata.scopes_supported)
								? metadata.scopes_supported.filter((scope): scope is string => typeof scope === "string").join(" ")
								: undefined) ||
							(typeof metadata.scope === "string" && metadata.scope) ||
							extractValueFromAuthUrl(authorizationUrl, "scope"),
					};
				}

				if (path === "/.well-known/oauth-protected-resource" && Array.isArray(metadata.authorization_servers)) {
					for (const authServer of metadata.authorization_servers) {
						if (typeof authServer === "string" && !visited.has(authServer)) {
							queue.push(authServer);
						}
					}
				}
			} catch {
				continue;
			}
		}
	}

	return null;
}
