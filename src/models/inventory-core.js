/**
 * Credential-plane helpers and Workers-safe inventory core (no Node fs / Ollama).
 */
import { discoverProviderModels } from './discovery.js';

export const INVENTORY_API_PROVIDERS = Object.freeze([
  { id: 'openai', label: 'OpenAI', service: 'openai', env: 'OPENAI_API_KEY' },
  { id: 'meta', label: 'Meta Model API', service: 'meta', env: 'META_MODEL_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', service: 'anthropic', env: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', label: 'Gemini', service: 'gemini', env: 'GEMINI_API_KEY' },
  { id: 'xai', label: 'Grok / xAI', service: 'xai', env: 'XAI_API_KEY', aliases: ['grok'] },
  { id: 'cursor', label: 'Cursor', service: 'cursor', env: 'CURSOR_API_KEY' },
  { id: 'cloudflare', label: 'Cloudflare', service: 'cloudflare', env: 'CLOUDFLARE_API_TOKEN' },
]);

import { WORKERS_AI_CURATED_MODEL_IDS } from '../../protocol/models/workers-ai-curated.mjs';
export { WORKERS_AI_CURATED_MODEL_IDS } from '../../protocol/models/workers-ai-curated.mjs';

const CURATED = new Set(WORKERS_AI_CURATED_MODEL_IDS);
export const PROVIDER_MODEL_SNAPSHOT_SCHEMA = 'agentsam.provider-model-snapshot.v1';

function modelSnapshotHash(modelIds) {
  const source = modelIds.join('\n');
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Compact credential-scoped availability evidence for an existing
 * `agentsam_plugins` AI installation. The global catalog remains curated
 * reference data; discovery never creates one model row per user.
 */
export function createProviderModelSnapshot(provider, models = [], options = {}) {
  const providerId = String(provider || '').trim().toLowerCase();
  if (!providerId) throw new TypeError('provider_required');
  const modelIds = [...new Set(models.map((row) => String(
    typeof row === 'string' ? row : row?.provider_model_id || row?.model_id || '',
  ).trim()).filter(Boolean))].sort();
  const fetchedAtUnix = Number.isFinite(Number(options.fetchedAtUnix))
    ? Math.max(0, Math.floor(Number(options.fetchedAtUnix)))
    : Math.floor(Date.now() / 1000);
  return Object.freeze({
    schema: PROVIDER_MODEL_SNAPSHOT_SCHEMA,
    provider: providerId,
    model_ids: Object.freeze(modelIds),
    model_count: modelIds.length,
    models_hash: modelSnapshotHash(modelIds),
    fetched_at_unix: fetchedAtUnix,
    authority: 'credential_scoped_provider_discovery',
  });
}

/**
 * Produce fields for the existing `agentsam_plugins` row. Failed probes keep
 * the last good snapshot while updating health evidence; no secret or model
 * catalog rows are written.
 */
export function createAiPluginProbePatch(previousMetadata = {}, discovery = {}, options = {}) {
  const now = Number.isFinite(Number(options.fetchedAtUnix))
    ? Math.max(0, Math.floor(Number(options.fetchedAtUnix)))
    : Math.floor(Date.now() / 1000);
  const metadata = previousMetadata && typeof previousMetadata === 'object' && !Array.isArray(previousMetadata)
    ? { ...previousMetadata }
    : {};
  if (discovery.ok === true) {
    metadata.model_snapshot = createProviderModelSnapshot(
      options.provider || discovery.provider,
      discovery.models || [],
      { fetchedAtUnix: now },
    );
  }
  const error = String(discovery.error || '').trim();
  const authFailure = /\b(?:401|403)\b|unauthoriz|forbidden|invalid[_ -]?(?:api[_ -]?)?key|credential.*reject/i.test(error);
  return Object.freeze({
    metadata,
    health_status: discovery.ok === true ? 'healthy' : authFailure ? 'auth_error' : 'unreachable',
    last_health_at: now,
    ...(discovery.ok === true ? { last_healthy_at: now, consecutive_failures: 0, last_error_code: null, last_error_message: null } : {
      consecutive_failures_delta: 1,
      last_error_code: authFailure ? 'provider_credential_rejected' : 'provider_discovery_failed',
      last_error_message: authFailure ? 'Provider credential rejected' : 'Provider model discovery failed',
    }),
  });
}

const SERVICE_TO_PROVIDER = Object.freeze({
  openai: 'openai',
  meta: 'meta',
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

const CHAT_ADAPTER_PROVIDERS = new Set(['openai', 'meta', 'anthropic', 'gemini', 'xai', 'cloudflare']);

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
    || (provider === 'meta' && caps.chat_completions === true && caps.text_output === true)
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
  const credentialRecords = Array.isArray(options.credentialRecords) ? options.credentialRecords : null;
  const providerDefinitions = Array.isArray(options.providers)
    ? options.providers
    : INVENTORY_API_PROVIDERS;
  if (!credentialRecords && typeof resolveCredential !== 'function') {
    throw new TypeError('resolveCredential or credentialRecords is required');
  }

  const providers = [];
  const discovery = {};
  const providerModels = {};
  const credentialDiscovery = [];

  await Promise.all(providerDefinitions.map(async (provider) => {
    const records = credentialRecords
      ? credentialRecords.filter((row) => String(row?.provider || '').toLowerCase() === provider.id)
      : null;
    const legacyCredential = records ? null : await resolveCredential(provider.id);
    const providerCredentials = records
      ? records.map((row) => ({
        configured: Boolean(row?.value),
        value: String(row?.value || ''),
        source: row?.source || 'user_vault',
        account_id: row?.account_id || null,
        credential_id: row?.id || null,
        credential_name: row?.name || null,
        credential_last4: row?.last4 || null,
      })).filter((row) => row.configured)
      : legacyCredential?.configured ? [legacyCredential] : [];

    providers.push({
      id: provider.id,
      label: provider.label,
      configured: providerCredentials.length > 0,
      credentialCount: providerCredentials.length,
      source: providerCredentials[0]?.source || legacyCredential?.source || null,
      credentialError: legacyCredential?.error || null,
    });

    const results = await Promise.all(providerCredentials.map(async (credential) => {
      let result = { attempted: false, ok: false, models: [], error: null };
      if (options.discoverRemote !== false) {
        result = await discoverProviderModels(provider.adapter || provider.id, credential, { fetchImpl });
        if (provider.id === 'cloudflare' && result.ok && curateWorkersAi) {
          const curated = filterWorkersAiCurated(result.models || []);
          result = { ...result, models: curated, curation: 'agentsam_workers_ai_allowlist' };
        }
      }
      const models = (result.models || []).map((model) => ({
        ...model,
        credential_id: credential.credential_id || null,
        credential_name: credential.credential_name || null,
        credential_last4: credential.credential_last4 || null,
        credential_source: credential.source || null,
      }));
      credentialDiscovery.push({
        credential_id: credential.credential_id || null,
        credential_name: credential.credential_name || null,
        credential_last4: credential.credential_last4 || null,
        provider: provider.id,
        source: credential.source || null,
        attempted: result.attempted === true,
        ok: result.ok === true,
        error: result.error || null,
        returnedModelCount: models.length,
      });
      return { credential, result, models };
    }));

    const allModels = results.flatMap((entry) => entry.models);
    providerModels[provider.id] = allModels;
    const attempted = results.filter((entry) => entry.result.attempted === true);
    const successful = results.filter((entry) => entry.result.ok === true);
    discovery[provider.id] = {
      attempted: attempted.length > 0,
      ok: successful.length > 0,
      error: attempted.length && successful.length === 0
        ? results.find((entry) => entry.result.error)?.result.error || 'provider_discovery_failed'
        : null,
      returnedModelCount: allModels.length,
      credentialCount: providerCredentials.length,
      successfulCredentialCount: successful.length,
    };
  }));

  const credentialModels = Object.values(providerModels)
    .flat()
    .filter((row) => row.availability === 'available');
  const uniqueModels = new Map();
  for (const row of credentialModels) {
    const key = String(row.provider || '').toLowerCase() + ':' + String(row.provider_model_id || row.model_id || '');
    if (!uniqueModels.has(key)) uniqueModels.set(key, row);
  }
  const availableModels = [...uniqueModels.values()];

  return {
    schemaVersion: 'agentsam-model-inventory-v4',
    generatedAt: new Date().toISOString(),
    authority: 'per_credential_provider_discovery',
    credential_plane: credentialPlane,
    providers: providers.sort((a, b) => a.label.localeCompare(b.label)),
    discovery,
    credentialDiscovery: credentialDiscovery.sort((a, b) =>
      (a.provider + ':' + (a.credential_name || '')).localeCompare(b.provider + ':' + (b.credential_name || ''))),
    providerModels,
    credentialModels,
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

function sanitizeModelForClient(row = {}) {
  return {
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
    credential_id: row.credential_id || null,
    credential_name: row.credential_name || null,
    credential_last4: row.credential_last4 || null,
    credential_source: row.credential_source || null,
    availability_status: row.availability_status || 'available',
    visible: row.visible !== false,
    ...modelChatEligibility(row),
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
      credentialCount: Number(row.credentialCount || 0),
      source: row.source || null,
      credentialError: sanitizeDiscoveryError(row.credentialError),
    })),
    discovery: Object.fromEntries(Object.entries(status.discovery || {}).map(([provider, row]) => [provider, {
      ...row,
      error: sanitizeDiscoveryError(row?.error),
    }])),
    credentialDiscovery: (status.credentialDiscovery || []).map((row) => ({
      credential_id: row.credential_id || null,
      credential_name: row.credential_name || null,
      credential_last4: row.credential_last4 || null,
      provider: row.provider,
      source: row.source || null,
      attempted: row.attempted === true,
      ok: row.ok === true,
      error: sanitizeDiscoveryError(row.error),
      returnedModelCount: Number(row.returnedModelCount || 0),
    })),
    credentialModels: (status.credentialModels || []).map(sanitizeModelForClient),
    availableModels: (status.availableModels || []).map(sanitizeModelForClient),
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

/**
 * The portable Settings+execution parameter contract. Model identity and
 * availability are resolved independently from verified optional controls.
 */
export function verifiedModelControls(model = {}) {
  const reasoning = Array.isArray(model.reasoning_efforts)
    ? [...new Set(model.reasoning_efforts.filter((x) => typeof x === 'string' && x && x !== 'auto'))]
    : [];
  return Object.freeze({
    reasoning_efforts: Object.freeze(reasoning),
    eligible: modelChatEligibility(model).chat_eligible === true,
    source: String(model?.metadata?.capability_source || model?.eligibility_source || 'unknown'),
  });
}

/** Shared fail-closed inference admission used by every AgentSam host. */
export function resolveDiscoveredModelExecution(inventory, provider, modelId, options = {}) {
  const selected = assertModelAvailableForProvider(inventory, provider, modelId);
  const controls = verifiedModelControls(selected);
  if (!controls.eligible) {
    const error = new Error('selected_model_not_chat_eligible');
    error.code = 'selected_model_not_chat_eligible';
    throw error;
  }
  const requested = String(options.reasoningEffort || 'auto').trim();
  if (requested !== 'auto' && !controls.reasoning_efforts.includes(requested)) {
    const error = new Error('reasoning_effort_not_verified_for_model');
    error.code = 'reasoning_effort_not_verified_for_model';
    throw error;
  }
  return Object.freeze({
    provider: String(selected.provider),
    model_id: String(selected.model_id || selected.provider_model_id),
    model_key: selected.model_key || null,
    credential_id: selected.credential_id || null,
    reasoning_effort: requested === 'auto' ? null : requested,
    reasoning_efforts: controls.reasoning_efforts,
    capability_source: controls.source,
  });
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
