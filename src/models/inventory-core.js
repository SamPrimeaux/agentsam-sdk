/**
 * Credential-plane helpers and Workers-safe inventory core (no Node fs / Ollama).
 */
import { discoverProviderModels } from './discovery.js';

export const INVENTORY_API_PROVIDERS = Object.freeze([
  { id: 'openai', label: 'OpenAI', service: 'openai', env: 'OPENAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', service: 'anthropic', env: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', label: 'Gemini', service: 'gemini', env: 'GEMINI_API_KEY' },
  { id: 'xai', label: 'Grok / xAI', service: 'xai', env: 'XAI_API_KEY', aliases: ['grok'] },
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
  xai: 'xai',
  grok: 'xai',
  cursor: 'cursor',
  cloudflare: 'cloudflare',
});

export function providerIdForService(serviceName) {
  const key = String(serviceName || '').trim().toLowerCase();
  return SERVICE_TO_PROVIDER[key] || null;
}

export function filterWorkersAiCurated(models = [], options = {}) {
  if (options.curated === false) return [...models];
  // Chat/agent pool: curated allowlist. Embedding models always pass —
  // Vectorize / Workers AI embed lanes must not be limited by the chat allowlist.
  return models.filter((row) => {
    const id = String(row?.provider_model_id || row?.model_id || '');
    const caps = row?.capabilities || {};
    const task = String(row?.metadata?.task || '').toLowerCase();
    if (caps.embeddings === true || task === 'text embeddings' || /embed/i.test(id)) return true;
    return CURATED.has(id);
  });
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

const CHAT_ADAPTER_PROVIDERS = new Set(['openai', 'anthropic', 'gemini', 'xai', 'cloudflare']);

export function modelChatEligibility(row = {}) {
  const rawProvider = String(row.provider || '').trim().toLowerCase();
  const provider = rawProvider === 'grok' ? 'xai' : rawProvider;
  const caps = row.capabilities && typeof row.capabilities === 'object' ? row.capabilities : {};
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const source = String(metadata.capability_source || (row.source?.fallback?.url ? 'provider_reference' : 'provider_api'));

  if (!CHAT_ADAPTER_PROVIDERS.has(provider)) {
    return { chat_eligible: false, eligibility_reason: 'provider_adapter_unavailable', eligibility_source: source };
  }
  if (caps.embeddings === true) {
    return { chat_eligible: false, eligibility_reason: 'embedding_model', eligibility_source: source };
  }
  if (caps.agent_runtime === false) {
    return { chat_eligible: false, eligibility_reason: 'capability_excludes_chat', eligibility_source: source };
  }

  const positive =
    (provider === 'openai' && caps.responses === true && caps.agent_runtime === true)
    || (provider === 'anthropic' && caps.messages === true)
    || (provider === 'gemini' && caps.generate_content === true && caps.text_output === true)
    || (provider === 'xai' && caps.responses === true && caps.text_output === true)
    || (provider === 'cloudflare' && caps.workers_ai === true && caps.agent_runtime === true && caps.embeddings !== true);

  if (positive) {
    return { chat_eligible: true, eligibility_reason: null, eligibility_source: source };
  }
  if (metadata.specialized_output === true || caps.text_output === false) {
    return { chat_eligible: false, eligibility_reason: 'specialized_output_model', eligibility_source: source };
  }
  return { chat_eligible: false, eligibility_reason: 'capability_unknown', eligibility_source: source };
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

function sanitizeDiscoveryError(error) {
  const raw = String(error || '').trim();
  if (!raw) return null;
  if (/\b(?:401|403)\b|unauthoriz|forbidden|invalid[_ -]?(?:api[_ -]?)?key|credential.*reject/i.test(raw)) {
    return 'provider_credential_rejected';
  }
  return 'provider_discovery_failed';
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
      credentialError: sanitizeDiscoveryError(row.credentialError),
    })),
    discovery: Object.fromEntries(Object.entries(status.discovery || {}).map(([provider, row]) => [provider, {
      ...row,
      error: sanitizeDiscoveryError(row?.error),
    }])) ,
    availableModels: (status.availableModels || []).map((row) => ({
      provider: row.provider === 'grok' ? 'xai' : row.provider,
      model_id: row.provider_model_id || row.model_id,
      model_key: row.model_key || null,
      label: row.label || row.provider_model_id || row.model_id,
      availability: row.availability,
      availability_source: row.availability_source || null,
      context_window: row.context_window ?? null,
      reasoning_efforts: row.reasoning_efforts || [],
      service_tiers: row.service_tiers || [],
      capabilities: row.capabilities || {},
      ...modelChatEligibility(row),
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
