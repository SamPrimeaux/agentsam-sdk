import { cloudflareConnectionSafeStatus } from "../../../../packages/connectors/cloudflare/src/index.js";

export const BYOK_PROVIDER_DEFINITIONS = Object.freeze([
  { provider: "openai", service: "openai", label: "OpenAI" },
  { provider: "anthropic", service: "anthropic", label: "Anthropic" },
  { provider: "gemini", service: "gemini", label: "Google Gemini" },
  { provider: "xai", service: "xai", label: "xAI" },
  { provider: "cursor", service: "cursor", label: "Cursor" },
  { provider: "cloudflare", service: "cloudflare", label: "Cloudflare API token" },
]);

function parseMetadata(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function canonicalByokProvider(serviceName) {
  const service = String(serviceName || "").trim().toLowerCase();
  return service === "grok" ? "xai" : service;
}

function toConnectionRecord(row) {
  if (!row) return null;
  return {
    connectionId: row.connection_id,
    ownerId: row.owner_id,
    cloudflareAccountId: row.cloudflare_account_id,
    scopes: row.scopes ? String(row.scopes).split(" ").filter(Boolean) : [],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
  };
}

export async function loadConnectionsRegistry(env, userId) {
  const [cloudflareRow, secretsResult] = await Promise.all([
    env.DB.prepare(
      `SELECT connection_id, owner_id, cloudflare_account_id, scopes, status,
              created_at, updated_at, expires_at
       FROM agentsam_cloudflare_connections
       WHERE owner_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
      .bind(userId)
      .first(),
    env.DB.prepare(
      `SELECT id, secret_name, service_name, description, metadata_json,
              last_used_at, usage_count, created_at, updated_at
       FROM user_secrets
       WHERE user_id = ? AND is_active = 1
       ORDER BY updated_at DESC
       LIMIT 100`,
    )
      .bind(userId)
      .all(),
  ]);

  const cloudflare = cloudflareConnectionSafeStatus(
    env,
    toConnectionRecord(cloudflareRow),
    userId,
  );
  const oauthConnected = cloudflare.status === "connected";

  const latestByProvider = new Map();
  for (const row of secretsResult?.results || []) {
    const provider = canonicalByokProvider(row.service_name);
    if (!BYOK_PROVIDER_DEFINITIONS.some((entry) => entry.provider === provider)) continue;
    if (latestByProvider.has(provider)) continue;
    const metadata = parseMetadata(row.metadata_json);
    latestByProvider.set(provider, {
      id: row.id,
      name: row.secret_name,
      description: row.description || null,
      last4: typeof metadata.last4 === "string" ? metadata.last4 : null,
      last_used_at: row.last_used_at || null,
      usage_count: Number(row.usage_count || 0),
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return {
    connections: [
      {
        provider: "cloudflare",
        kind: "oauth",
        status: oauthConnected ? "connected" : "not_configured",
        available: cloudflare.configured,
        client_status: cloudflare.status,
        callback_path: cloudflare.callbackPath,
        connection: cloudflare.connection,
      },
      ...BYOK_PROVIDER_DEFINITIONS.map((definition) => {
        const credential = latestByProvider.get(definition.provider) || null;
        return {
          provider: definition.provider,
          service: definition.service,
          label: definition.label,
          kind: "byok",
          status: credential ? "configured" : "missing",
          last4: credential?.last4 || null,
          credential,
        };
      }),
    ],
  };
}
