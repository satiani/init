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
	resourceMetadataUrl?: string;
	message?: string;
}

function normalizeUrl(url: string | undefined): string | undefined {
	if (!url) {
		return undefined;
	}
	try {
		return new URL(url).toString();
	} catch {
		return undefined;
	}
}

function extractChallengeParams(message: string): Map<string, string> {
	const entries = Array.from(message.matchAll(/([a-zA-Z_][a-zA-Z0-9_-]*)="([^"]+)"/g));
	const params = new Map<string, string>();
	for (const [, key, value] of entries) {
		params.set(key.toLowerCase(), value);
	}
	return params;
}

function parseMcpAuthServerUrl(errorMessage: string): string | undefined {
	const match = errorMessage.match(/Mcp-Auth-Server:\s*([^;\]\s]+)/i);
	return normalizeUrl(match?.[1]);
}

function parseResourceMetadataUrl(errorMessage: string): string | undefined {
	const challenge = extractChallengeParams(errorMessage);
	return normalizeUrl(challenge.get("resource_metadata"));
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

function extractOAuthFromRecord(container: Record<string, unknown>): OAuthEndpoints | null {
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
	if (!authorizationUrl || !tokenUrl) {
		return null;
	}

	return {
		authorizationUrl,
		tokenUrl,
		registrationUrl,
		clientId:
			(typeof container.client_id === "string" && container.client_id) ||
			(typeof container.clientId === "string" && container.clientId) ||
			(typeof container.default_client_id === "string" && container.default_client_id) ||
			extractValueFromAuthUrl(authorizationUrl, "client_id"),
		scopes:
			(Array.isArray(container.scopes_supported)
				? container.scopes_supported.filter((scope): scope is string => typeof scope === "string").join(" ")
				: undefined) ||
			(typeof container.scope === "string" && container.scope) ||
			(typeof container.scopes === "string" && container.scopes) ||
			extractValueFromAuthUrl(authorizationUrl, "scope"),
	};
}

function extractOAuthFromMessage(message: string): OAuthEndpoints | null {
	const challenge = extractChallengeParams(message);
	if (challenge.size > 0) {
		const oauth = extractOAuthFromRecord({
			authorization_uri: challenge.get("authorization_uri"),
			authorization_url: challenge.get("authorization_url"),
			authorization_endpoint: challenge.get("authorization_endpoint"),
			authorize_url: challenge.get("authorize_url"),
			realm: challenge.get("realm"),
			token_url: challenge.get("token_url"),
			token_uri: challenge.get("token_uri"),
			token_endpoint: challenge.get("token_endpoint"),
			registration_endpoint: challenge.get("registration_endpoint"),
			registration_url: challenge.get("registration_url"),
			registration_uri: challenge.get("registration_uri"),
			client_id: challenge.get("client_id"),
			scope: challenge.get("scope"),
		});
		if (oauth) {
			if (!oauth.authorizationUrl && challenge.get("realm")) {
				oauth.authorizationUrl = challenge.get("realm") as string;
			}
			return oauth;
		}

		const realm = challenge.get("realm");
		const tokenUrl = challenge.get("token_url") || challenge.get("token_uri") || challenge.get("token_endpoint");
		if (realm && tokenUrl) {
			return {
				authorizationUrl: realm,
				tokenUrl,
				clientId: challenge.get("client_id") ?? extractValueFromAuthUrl(realm, "client_id"),
				scopes: challenge.get("scope") ?? extractValueFromAuthUrl(realm, "scope"),
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
		return extractOAuthFromRecord(container);
	} catch {
		return null;
	}
}

function hasExplicitApiKeyIndicators(message: string): boolean {
	return (
		message.includes("api key") ||
		message.includes("api_key") ||
		message.includes("api-key") ||
		message.includes("apikey") ||
		message.includes("x-api-key") ||
		message.includes("x-api_key")
	);
}

function extractAuthorizationServers(metadata: Record<string, unknown>): string[] {
	const servers: string[] = [];
	if (Array.isArray(metadata.authorization_servers)) {
		for (const authServer of metadata.authorization_servers) {
			if (typeof authServer === "string") {
				const normalized = normalizeUrl(authServer);
				if (normalized) {
					servers.push(normalized);
				}
			}
		}
	}
	if (typeof metadata.authorization_server === "string") {
		const normalized = normalizeUrl(metadata.authorization_server);
		if (normalized) {
			servers.push(normalized);
		}
	}
	return servers;
}

export function analyzeAuthError(error: Error): AuthDetectionResult {
	if (!detectAuthError(error)) {
		return { requiresAuth: false };
	}

	const authServerUrl = parseMcpAuthServerUrl(error.message);
	const resourceMetadataUrl = parseResourceMetadataUrl(error.message);
	const oauth = extractOAuthFromMessage(error.message);
	if (oauth || authServerUrl || resourceMetadataUrl) {
		return {
			requiresAuth: true,
			authType: "oauth",
			oauth: oauth ?? undefined,
			authServerUrl,
			resourceMetadataUrl,
			message: "Server requires OAuth authentication.",
		};
	}

	const message = error.message.toLowerCase();
	if (hasExplicitApiKeyIndicators(message)) {
		return {
			requiresAuth: true,
			authType: "apikey",
			authServerUrl,
			resourceMetadataUrl,
			message: "Server requires API key authentication.",
		};
	}

	return {
		requiresAuth: true,
		authType: "unknown",
		authServerUrl,
		resourceMetadataUrl,
		message: "Server requires authentication.",
	};
}

export async function discoverOAuthEndpoints(
	serverUrl: string,
	authServerUrl?: string,
	resourceMetadataUrl?: string,
): Promise<OAuthEndpoints | null> {
	const paths = [
		"/.well-known/oauth-authorization-server",
		"/.well-known/openid-configuration",
		"/.well-known/oauth-protected-resource",
		"/oauth/metadata",
		"/.mcp/auth",
	];

	const baseQueue: string[] = [];
	const directMetadataQueue: string[] = [];
	const queuedBases = new Set<string>();
	const queuedMetadataUrls = new Set<string>();
	const visitedBases = new Set<string>();
	const visitedMetadataUrls = new Set<string>();

	const enqueueBase = (url?: string): void => {
		const normalized = normalizeUrl(url);
		if (!normalized || queuedBases.has(normalized) || visitedBases.has(normalized)) {
			return;
		}
		queuedBases.add(normalized);
		baseQueue.push(normalized);
	};

	const enqueueMetadataUrl = (url?: string): void => {
		const normalized = normalizeUrl(url);
		if (!normalized || queuedMetadataUrls.has(normalized) || visitedMetadataUrls.has(normalized)) {
			return;
		}
		queuedMetadataUrls.add(normalized);
		directMetadataQueue.push(normalized);
	};

	const inspectMetadataUrl = async (metadataUrl: string): Promise<OAuthEndpoints | null> => {
		if (visitedMetadataUrls.has(metadataUrl)) {
			return null;
		}
		visitedMetadataUrls.add(metadataUrl);

		try {
			const response = await fetch(metadataUrl, {
				method: "GET",
				headers: { Accept: "application/json" },
				signal: AbortSignal.timeout(5_000),
			});
			if (!response.ok) {
				return null;
			}

			const metadata = (await response.json()) as Record<string, unknown>;
			const oauth = extractOAuthFromRecord(metadata);
			if (oauth) {
				return oauth;
			}

			for (const authServer of extractAuthorizationServers(metadata)) {
				enqueueBase(authServer);
			}
		} catch {
			return null;
		}

		return null;
	};

	enqueueMetadataUrl(resourceMetadataUrl);
	enqueueBase(authServerUrl);
	enqueueBase(serverUrl);

	while (directMetadataQueue.length > 0 || baseQueue.length > 0) {
		while (directMetadataQueue.length > 0) {
			const metadataUrl = directMetadataQueue.shift();
			if (!metadataUrl) {
				continue;
			}
			const discovered = await inspectMetadataUrl(metadataUrl);
			if (discovered) {
				return discovered;
			}
		}

		const baseUrl = baseQueue.shift();
		if (!baseUrl || visitedBases.has(baseUrl)) {
			continue;
		}
		visitedBases.add(baseUrl);

		for (const path of paths) {
			let metadataUrl: string;
			try {
				metadataUrl = new URL(path, baseUrl).toString();
			} catch {
				continue;
			}

			const discovered = await inspectMetadataUrl(metadataUrl);
			if (discovered) {
				return discovered;
			}
		}
	}

	return null;
}
