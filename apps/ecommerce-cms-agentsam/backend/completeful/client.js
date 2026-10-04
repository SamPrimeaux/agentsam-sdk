// Completeful Partner API client (host shim).
// Portable provider package: @inneranimalmedia/agentsam-provider-completeful
//   → agentsam-sdk/packages/providers/completeful
// This host file keeps Commerce env names (CAPP_KEY) and remains the Worker import
// surface until the app depends on the published package. No COMMERCE_ACCOUNT_ID.
//
// Source contract: docs/providers/completeful/openapi.json
// The browser never receives CAPP_KEY. All provider traffic goes through the
// authenticated Ember Supply Worker/admin API.

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

export function completefulKeyMode(env) {
  const key = String(env.CAPP_KEY || "");
  if (key.startsWith("capp_test_")) return "test";
  if (key.startsWith("capp_live_")) return "live";
  return key ? "unknown" : "missing";
}

export function completefulLiveWritesAllowed(env) {
  const value = env.COMPLETEFUL_ALLOW_LIVE_WRITES;
  if (typeof value === "boolean") return value;
  return String(value || "").toLowerCase() === "true";
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
  if (!env.CAPP_KEY) {
    throw new CompletefulApiError("Completeful is not configured: CAPP_KEY is missing", {
      status: 503,
      code: "completeful_not_configured",
      path,
      remediation: "Install a Completeful capp_test_ API key as the Worker secret CAPP_KEY.",
    });
  }

  const url = await buildUrl(env, path, query);
  const requestHeaders = new Headers(headers || {});
  requestHeaders.set("Accept", "application/json");
  requestHeaders.set("Authorization", `Bearer ${env.CAPP_KEY}`);

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

export function assertCompletefulMutationAllowed(env) {
  const mode = completefulKeyMode(env);
  if (mode === "test") return;
  if (mode === "live" && completefulLiveWritesAllowed(env)) return;

  throw new CompletefulApiError("Completeful live writes are disabled", {
    status: 409,
    code: "completeful_live_writes_disabled",
    remediation:
      "Use a capp_test_ key for dry-run mutations or explicitly enable COMPLETEFUL_ALLOW_LIVE_WRITES after the production cutover checklist passes.",
  });
}
