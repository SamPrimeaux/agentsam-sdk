/**
 * Studio-local inventory helpers (no root src imports — source-boundary safe).
 * Semantics mirror src/models/inventory-core.js for the Studio plane.
 *
 * Credential provenance comes from `studio-vault.ts`: callers merge the user's
 * unwrapped vault map over `platformCredentials(env)` so BYOK (`user_vault`)
 * wins and desk secrets (`platform`) fill the gaps. Responses carry only
 * `configured`/`source` flags — never credential values.
 */
import { credentialPlaneFor, type StudioCredential } from "./studio-vault";
export const STUDIO_PROVIDERS = Object.freeze([
  { id: "openai", label: "OpenAI", env: "OPENAI_API_KEY" },
  { id: "anthropic", label: "Anthropic", env: "ANTHROPIC_API_KEY" },
  { id: "gemini", label: "Gemini", env: "GEMINI_API_KEY" },
  { id: "grok", label: "Grok / xAI", env: "XAI_API_KEY" },
  { id: "cursor", label: "Cursor", env: "CURSOR_API_KEY" },
  { id: "cloudflare", label: "Cloudflare", env: "CLOUDFLARE_API_TOKEN" },
]);

export const WORKERS_AI_CURATED = Object.freeze([
  "@cf/qwen/qwen2.5-coder-32b-instruct",
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/zai-org/glm-5.3",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/qwen/qwen3.8-27b",
  "@cf/openai/gpt-oss-120b",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
]);

const CURATED = new Set(WORKERS_AI_CURATED);

function clean(value: unknown) {
  return value == null ? "" : String(value).trim();
}

async function fetchJson(url: string, init: RequestInit = {}) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`);
  return body as Record<string, unknown>;
}

function modelRow(provider: string, id: string, extra: Record<string, unknown> = {}) {
  return {
    provider,
    model_id: id,
    provider_model_id: id,
    model_key: `${provider}:${id}`,
    label: id,
    availability: "available",
    availability_source: "provider_api",
    ...extra,
  };
}

async function discover(provider: string, apiKey: string, accountId?: string | null) {
  if (!apiKey) return { attempted: false, ok: false, models: [] as ReturnType<typeof modelRow>[], error: null as string | null };
  try {
    if (provider === "openai") {
      const body = await fetchJson("https://api.openai.com/v1/models", {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const models = (Array.isArray(body.data) ? body.data : [])
        .map((row: any) => clean(row?.id))
        .filter(Boolean)
        .map((id) => modelRow("openai", id));
      return { attempted: true, ok: true, models, error: null };
    }
    if (provider === "anthropic") {
      const body = await fetchJson("https://api.anthropic.com/v1/models", {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      const models = (Array.isArray(body.data) ? body.data : [])
        .map((row: any) => clean(row?.id))
        .filter(Boolean)
        .map((id) => modelRow("anthropic", id));
      return { attempted: true, ok: true, models, error: null };
    }
    if (provider === "gemini") {
      const body = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=${encodeURIComponent(apiKey)}`,
      );
      const models = (Array.isArray(body.models) ? body.models : [])
        .filter((row: any) => (row?.supportedGenerationMethods || []).includes("generateContent"))
        .map((row: any) => clean(row?.baseModelId || row?.name).replace(/^models\//, ""))
        .filter(Boolean)
        .map((id) => modelRow("gemini", id));
      return { attempted: true, ok: true, models, error: null };
    }
    if (provider === "grok") {
      const body = await fetchJson("https://api.x.ai/v1/models", {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const models = (Array.isArray(body.data) ? body.data : [])
        .map((row: any) => clean(row?.id))
        .filter((id) => id && !/image|video|voice|embedding/i.test(id))
        .map((id) => modelRow("grok", id));
      return { attempted: true, ok: true, models, error: null };
    }
    if (provider === "cursor") {
      const body = await fetchJson("https://api.cursor.com/v1/models", {
        headers: { authorization: `Bearer ${apiKey}` },
      });
      const models = (Array.isArray((body as any).items) ? (body as any).items : [])
        .map((row: any) => clean(row?.id))
        .filter(Boolean)
        .map((id: string) => modelRow("cursor", id));
      return { attempted: true, ok: true, models, error: null };
    }
    if (provider === "cloudflare") {
      if (!accountId) return { attempted: true, ok: false, models: [], error: "ACCOUNT_ID required" };
      const body = await fetchJson(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`,
        { headers: { authorization: `Bearer ${apiKey}` } },
      );
      const models = (Array.isArray(body.result) ? body.result : [])
        .filter((row: any) => String(row?.task?.name || row?.task || "").toLowerCase() === "text generation")
        .map((row: any) => clean(row?.name))
        .filter((id) => CURATED.has(id))
        .map((id) => modelRow("cloudflare", id));
      return { attempted: true, ok: true, models, error: null };
    }
    return { attempted: false, ok: false, models: [], error: `unsupported:${provider}` };
  } catch (err) {
    return { attempted: true, ok: false, models: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export function platformCredentials(env: NodeJS.ProcessEnv) {
  const map = new Map<string, StudioCredential>();
  const put = (id: string, value?: string, extra: Record<string, string | null | undefined> = {}) => {
    if (!value || !clean(value)) return;
    map.set(id, { value: clean(value), source: "platform", ...extra });
  };
  put("openai", env.OPENAI_API_KEY);
  put("anthropic", env.ANTHROPIC_API_KEY);
  put("gemini", env.GEMINI_API_KEY);
  put("grok", env.XAI_API_KEY);
  put("cursor", env.CURSOR_API_KEY);
  put("cloudflare", env.CLOUDFLARE_API_TOKEN, {
    account_id: env.CLOUDFLARE_ACCOUNT_ID || env.ACCOUNT_ID || null,
  });
  return map;
}

export async function buildStudioInventory(credentials: Map<string, StudioCredential>) {
  const providers = [];
  const discovery: Record<string, unknown> = {};
  const availableModels = [];
  for (const meta of STUDIO_PROVIDERS) {
    const cred = credentials.get(meta.id);
    providers.push({
      id: meta.id,
      label: meta.label,
      configured: Boolean(cred?.value),
      source: cred?.source || null,
      credentialError: null,
    });
    const result = cred?.value
      ? await discover(meta.id, cred.value, cred.account_id)
      : { attempted: false, ok: false, models: [], error: null };
    discovery[meta.id] = {
      attempted: result.attempted,
      ok: result.ok,
      error: result.error,
      returnedModelCount: result.models.length,
    };
    availableModels.push(...result.models);
  }
  return {
    schemaVersion: "agentsam-model-inventory-v3",
    generatedAt: new Date().toISOString(),
    authority: "per_credential_provider_discovery",
    credential_plane: credentialPlaneFor(credentials),
    providers,
    discovery,
    availableModels,
  };
}

export function assertModelAvailable(inventory: { availableModels?: Array<{ provider: string; model_id: string }> }, provider: string, modelId: string) {
  const p = clean(provider).toLowerCase();
  const m = clean(modelId);
  const hit = (inventory.availableModels || []).find(
    (row) => String(row.provider).toLowerCase() === p && row.model_id === m,
  );
  if (!hit) {
    const err = new Error(`selected_model_not_available_for_credential:${p}:${m}`);
    (err as Error & { code?: string }).code = "selected_model_not_available_for_credential";
    throw err;
  }
  return hit;
}
