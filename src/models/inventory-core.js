/**
 * Credential-plane helpers and Workers-safe inventory core (no Node fs / Ollama).
 */
import { discoverProviderModels } from './discovery.js';

export const INVENTORY_API_PROVIDERS = Object.freeze([
  { id: 'openai', label: 'OpenAI', service: 'openai', env: 'OPENAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', service: 'anthropic', env: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', label: 'Gemini', service: 'gemini', env: 'GEMINI_API_KEY' },
  { id: 'grok', label: 'Grok / xAI', service: 'xai', env: 'XAI_API_KEY', aliases: ['xai', 'grok'] },
  { id: 'cursor', label: 'Cursor', service: 'cursor', env: 'CURSOR_API_KEY' },
  { id: 'cloudflare', label: 'Cloudflare', service: 'cloudflare', env: 'CLOUDFLARE_API_TOKEN' },
]);

export const WORKERS_AI_CURATED_MODEL_IDS = Object.freeze([
  '@cf/qwen/qwen2.5-coder-32b-instruct',
  '@cf/moonshotai/kimi-k2.7-code',
  '@cf/zai-org/glm-5.3',
  '@cf/deepseek-ai/deepseek-v4-pro-0813',
  '@cf/deepseek-ai/deepseek-v4-flash-0731',
  '@cf/qwen/qwen3.8-27b',
  '@cf/openai/gpt-oss-120b',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
]);

const CURATED = new Set(WORKERS_AI_CURATED_MODEL_IDS);

const SERVICE_TO_PROVIDER = Object.freeze({
  openai: 'openai',
  anthropic: 'anthropic',
  gemini: 'gemini',
  xai: 'grok',
  grok: 'grok',
  cursor: 'cursor',
  cloudflare: 'cloudflare',
});

export function providerIdForService(serviceName) {
  const key = String(serviceName || '').trim().toLowerCase();
  return SERVICE_TO_PROVIDER[key] || null;
}

export function filterWorkersAiCurated(models = [], options = {}) {
  if (options.curated === false) return [...models];
  return models.filter((row) => CURATED.has(String(row?.provider_model_id || row?.model_id || '')));
}

/**
 * @param {Map<string, { value: string, source?: string, account_id?: string }>} credentialByProvider
 */
export function makeMapCredentialResolver(credentialByProvider) {
  return async (providerId) => {
    const row = credentialByProvider.get(providerId);
    if (!row?.value) return { configured: false, value: '', source: null, error: null };
    return {
      configured: true,
      value: row.value,
      source: row.source || 'injected',
      env: INVENTORY_API_PROVIDERS.find((p) => p.id === providerId)?.env || null,
      account_id: row.account_id || null,
    };
  };
}

/**
 * Merge vault credentials (preferred) with optional platform env credentials.
 * Never returns secret material in the inventory result.
 */
export async function collectCredentialScopedInventory(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const credentialPlane = options.credentialPlane || 'studio_vault';
  const curateWorkersAi = options.curateWorkersAi !== false;
  const resolveCredential = options.resolveCredential;
  if (typeof resolveCredential !== 'function') {
    throw new TypeError('resolveCredential is required');
  }

  const providers = [];
  const discovery = {};
  const providerModels = {};

  await Promise.all(INVENTORY_API_PROVIDERS.map(async (provider) => {
    const credential = await resolveCredential(provider.id);
    providers.push({
      id: provider.id,
      label: provider.label,
      configured: credential?.configured === true,
      source: credential?.source || null,
      credentialError: credential?.error || null,
    });

    let result = { attempted: false, ok: false, models: [], error: null };
    if (options.discoverRemote !== false && credential?.configured) {
      result = await discoverProviderModels(provider.id, credential, { fetchImpl });
      if (provider.id === 'cloudflare' && result.ok && curateWorkersAi) {
        const curated = filterWorkersAiCurated(result.models || []);
        result = { ...result, models: curated, curation: 'agentsam_workers_ai_allowlist' };
      }
    }
    discovery[provider.id] = {
      attempted: result.attempted === true,
      ok: result.ok === true,
      error: result.error || null,
      returnedModelCount: Array.isArray(result.models) ? result.models.length : 0,
      ...(result.curation ? { curation: result.curation } : {}),
    };
    providerModels[provider.id] = result.models || [];
  }));

  const availableModels = Object.values(providerModels)
    .flat()
    .filter((row) => row.availability === 'available');

  return {
    schemaVersion: 'agentsam-model-inventory-v3',
    generatedAt: new Date().toISOString(),
    authority: 'per_credential_provider_discovery',
    credential_plane: credentialPlane,
    providers,
    discovery,
    providerModels,
    availableModels,
  };
}

export function sanitizeInventoryForClient(status = {}) {
  const out = {
    schemaVersion: status.schemaVersion,
    generatedAt: status.generatedAt,
    authority: status.authority,
    credential_plane: status.credential_plane,
    providers: (status.providers || []).map((row) => ({
      id: row.id,
      label: row.label,
      configured: row.configured === true,
      source: row.source || null,
      credentialError: row.credentialError || null,
    })),
    discovery: status.discovery || {},
    availableModels: (status.availableModels || []).map((row) => ({
      provider: row.provider,
      model_id: row.provider_model_id || row.model_id,
      model_key: row.model_key || null,
      label: row.label || row.provider_model_id || row.model_id,
      availability: row.availability,
      availability_source: row.availability_source || null,
      context_window: row.context_window ?? null,
      reasoning_efforts: row.reasoning_efforts || [],
      service_tiers: row.service_tiers || [],
      capabilities: row.capabilities || {},
    })),
  };
  if (status.local) {
    out.local = {
      provider: status.local.provider,
      online: status.local.online === true,
      models: (status.local.models || []).map((row) => ({ name: row.name })),
    };
  }
  return out;
}

/** Fail-closed check used by chat routers. */
export function assertModelAvailableForProvider(inventory, provider, modelId) {
  const p = String(provider || '').trim().toLowerCase();
  const m = String(modelId || '').trim();
  if (!p || !m) {
    const err = new Error('provider_and_model_required');
    err.code = 'provider_and_model_required';
    throw err;
  }
  const row = (inventory?.availableModels || []).find(
    (item) => String(item.provider).toLowerCase() === p
      && (item.model_id === m || item.provider_model_id === m || item.model_key === m),
  );
  if (!row) {
    const err = new Error(`selected_model_not_available_for_credential:${p}:${m}`);
    err.code = 'selected_model_not_available_for_credential';
    throw err;
  }
  return row;
}
