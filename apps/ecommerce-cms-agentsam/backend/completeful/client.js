import { getApplicationAccountContext, requireApplicationAccountId } from "../lib/account-context.js";
import {
  resolveAccountCredential,
  last4 as vaultLast4,
} from "@inneranimalmedia/agentsam-vault";
// Completeful Partner API client (host shim).
// Portable provider package: @inneranimalmedia/agentsam-provider-completeful
//   → agentsam-sdk/packages/providers/completeful
// This host adapter resolves the signed-in account's Completeful key through
// @inneranimalmedia/agentsam-vault. Environment keys remain a standalone-install
// compatibility lane only; hosted Local Studio requests never fall back across accounts.
//
// Source contract: docs/providers/completeful/openapi.json
// The browser never receives CAPP_KEY. All provider traffic goes through the
// authenticated Fuel & Free Time Worker/admin API.

const DEFAULT_API_ORIGIN = "https://vxapi.completeful.com";

function trimSlashes(value) {
  return String(value || "").replace(/\/+$/, "");
}

/**
 * Resolve Completeful API /v1 base.
 * Authority: agentsam_plugins.completeful.endpoint_url → canonical default.
 * env.CAPP_API_URL only when ALLOW_INTEGRATION_ENV_OVERRIDE=1.
 */
export async function completefulApiBase(env) {
  try {
    const { resolveCompletefulApiOrigin } = await import("../lib/integration-config.js");
    const resolved = await resolveCompletefulApiOrigin(env);
    const configured = trimSlashes(resolved.origin || DEFAULT_API_ORIGIN);
    return configured.endsWith("/v1") ? configured : `${configured}/v1`;
  } catch {
    const configured = trimSlashes(DEFAULT_API_ORIGIN);
    return `${configured}/v1`;
  }
}

export function completefulKeyMode(value) {
  const key = typeof value === "string" ? value : String(value?.CAPP_KEY || "");
  if (key.startsWith("capp_test_")) return "test";
  if (key.startsWith("capp_live_")) return "live";
  return key ? "unknown" : "missing";
}

export function completefulWritesEnabled(value) {
  return ["test", "live"].includes(completefulKeyMode(value));
}

async function resolveCompletefulVaultCredential(env, accountId) {
  return resolveAccountCredential({
    env,
    db: env.DB,
    accountId,
    provider: "completeful",
    kind: "provider_key",
    actor: "ecommerce:completeful",
  });
}

/** Resolve the active Completeful key for the authenticated account. */
export async function resolveCompletefulCredential(env) {
  const context = getApplicationAccountContext();
  const hosted = context?.authority === "local-studio";
  const vaultMaterial = String(env?.VAULT_MASTER_KEY || env?.VAULT_KEY || "").trim();
  const vaultAvailable = Boolean(env?.DB?.prepare && vaultMaterial);

  if (hosted || vaultAvailable) {
    if (!env?.DB?.prepare || !vaultMaterial) {
      throw new CompletefulApiError("AgentSam Account Vault is unavailable for Completeful", {
        status: 503,
        code: "completeful_vault_unavailable",
        remediation: "Restore the packaged AgentSam Vault connection. Do not install this account's provider key as a Worker secret.",
      });
    }
    let accountId;
    try { accountId = requireApplicationAccountId(); }
    catch {
      throw new CompletefulApiError("An authenticated account is required to resolve Completeful credentials", {
        status: 403,
        code: "completeful_account_context_required",
      });
    }
    try {
      return await resolveCompletefulVaultCredential(env, accountId);
    } catch (error) {
      // Never fall back to a platform/global key when an account-owned vault row
      // exists but cannot be opened. This is a tenant-isolation boundary.
      console.error("completeful_vault_resolution_failed", error?.code || error?.name || "unknown");
      throw new CompletefulApiError("Completeful credentials could not be opened from this account's vault", {
        status: 503,
        code: error?.code || "completeful_vault_unavailable",
        remediation: "Check the Completeful credential in Account Vault and verify the vault's encryption status.",
      });
    }
  }

  // Compatibility for separately deployed single-account ecommerce installs.
  // Hosted Local Studio always takes the account-vault branch above.
  const key = String(env?.CAPP_KEY || "").trim();
  return key ? { source: "environment", value: key, last4: vaultLast4(key) } : null;
}

export class CompletefulApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "CompletefulApiError";
    this.status = details.status || 502;
    this.code = details.code || null;
    this.requestId = details.requestId || null;
    this.path = details.path || null;
    this.remediation = details.remediation || null;
    this.details = details.details || null;
    this.providerBody = details.providerBody || null;
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      request_id: this.requestId,
      path: this.path,
      remediation: this.remediation,
      details: this.details,
    };
  }
}

async function buildUrl(env, path, query) {
  const base = await completefulApiBase(env);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${normalizedPath}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function parseProviderResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 4000) };
  }
}

export async function completefulRequest(
  env,
  method,
  path,
  { query = null, body = undefined, idempotencyKey = null, headers = null } = {},
) {
  const credential = await resolveCompletefulCredential(env);
  const apiKey = credential?.value || "";
  const mode = completefulKeyMode(apiKey);
  if (mode === "missing") {
    throw new CompletefulApiError("Completeful is not connected for this account", {
      status: 503,
      code: "completeful_not_configured",
      path,
      remediation: "Connect a Completeful credential in AgentSam Account Vault. The Worker resolves it automatically for this account.",
    });
  }
  if (mode === "unknown") {
    throw new CompletefulApiError("The saved Completeful credential has an unrecognized key format", {
      status: 400,
      code: "completeful_credential_format_invalid",
      path,
      remediation: "Check the Completeful credential saved in AgentSam Account Vault.",
    });
  }

  const url = await buildUrl(env, path, query);
  const requestHeaders = new Headers(headers || {});
  requestHeaders.set("Accept", "application/json");
  requestHeaders.set("Authorization", `Bearer ${apiKey}`);

  let requestBody = body;
  if (body !== undefined && body !== null && !(body instanceof FormData)) {
    requestHeaders.set("Content-Type", "application/json");
    requestBody = typeof body === "string" ? body : JSON.stringify(body);
  }

  if (idempotencyKey) {
    requestHeaders.set("Idempotency-Key", idempotencyKey);
  }

  const response = await fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  const data = await parseProviderResponse(response);
  const requestId =
    response.headers.get("x-request-id") ||
    response.headers.get("x-capp-request-id") ||
    data?.request_id ||
    null;

  const meta = {
    status: response.status,
    request_id: requestId,
    mode: response.headers.get("x-capp-mode") || null,
    dry_run: response.headers.get("x-capp-dry-run") === "true",
  };

  if (!response.ok) {
    const provider = data && typeof data === "object" ? data : {};
    throw new CompletefulApiError(
      provider.error || provider.message || `Completeful request failed (${response.status})`,
      {
        status: response.status,
        code: provider.code || "completeful_request_failed",
        requestId,
        path: provider.path || url.pathname,
        remediation: provider.remediation || null,
        details: provider.details || null,
        providerBody: provider,
      },
    );
  }

  return { data, meta };
}

export async function assertCompletefulMutationAllowed(env) {
  const credential = await resolveCompletefulCredential(env);
  const mode = completefulKeyMode(credential?.value);
  if (mode === "test" || mode === "live") return { mode, source: credential.source };
  if (mode === "missing") {
    throw new CompletefulApiError("Completeful is not connected for this account", {
      status: 503,
      code: "completeful_not_configured",
      remediation: "Connect Completeful in AgentSam Account Vault before creating supplier products.",
    });
  }
  throw new CompletefulApiError("The saved Completeful credential has an unrecognized key format", {
    status: 400,
    code: "completeful_credential_format_invalid",
    remediation: "Check the Completeful credential saved in AgentSam Account Vault.",
  });
}
