import pc from 'picocolors';
import { probeOllama, resolveOllamaConfig } from './ollama.js';
import { listModelCatalog } from '../models/index.js';
import { discoverProviderModels } from '../models/discovery.js';
import { resolveProviderCredential } from '../lib/provider-credentials.js';

export const API_PROVIDERS = Object.freeze([
  { id: 'openai', label: 'OpenAI', credential: 'OPENAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', credential: 'ANTHROPIC_API_KEY' },
  { id: 'gemini', label: 'Gemini', credential: 'GEMINI_API_KEY' },
  { id: 'grok', label: 'Grok / xAI', credential: 'XAI_API_KEY' },
  { id: 'cursor', label: 'Cursor', credential: 'CURSOR_API_KEY' },
  { id: 'cloudflare', label: 'Cloudflare', credential: 'CLOUDFLARE_API_TOKEN' },
]);

/** Workers AI text-generation ids AgentSam surfaces by default (intersect with live discovery). */
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

const WORKERS_AI_CURATED_SET = new Set(WORKERS_AI_CURATED_MODEL_IDS);

export function filterWorkersAiCurated(models = [], options = {}) {
  if (options.curated === false) return [...models];
  return models.filter((row) => WORKERS_AI_CURATED_SET.has(String(row?.provider_model_id || row?.model_id || '')));
}

function clean(value) { return value == null ? '' : String(value).trim(); }

function emptyDiscovery() {
  return { attempted: false, ok: false, models: [], error: null };
}

function providerSummary(result = {}) {
  return {
    attempted: result.attempted === true,
    ok: result.ok === true,
    error: result.error || null,
    returnedModelCount: Array.isArray(result.models) ? result.models.length : 0,
  };
}

function mergeStaticFallbacks(discovered = []) {
  const byKey = new Map(discovered.map((row) => [row.model_key, row]));
  const out = [...discovered];
  for (const record of listModelCatalog()) {
    if (byKey.has(record.model_key)) continue;
    out.push({
      model_key: record.model_key,
      provider: record.provider,
      provider_model_id: record.provider_model_id,
      label: record.label,
      availability: 'unverified',
      availability_source: 'sdk_reference',
      context_window: record.context_window,
      context_window_source: 'sdk_reference',
      max_output_tokens: record.max_output_tokens,
      max_output_tokens_source: 'sdk_reference',
      reasoning_efforts: [...record.reasoning_efforts],
      service_tiers: [...record.service_tiers],
      capabilities: { ...record.capabilities },
      pricing: record.pricing || null,
      context_policy: record.context_policy || null,
      batch: record.batch || null,
      source: record.source || null,
    });
  }
  return out;
}

/**
 * Build credential-scoped model inventory.
 *
 * @param {object} [options]
 * @param {Record<string, string>} [options.env]
 * @param {string} [options.home]
 * @param {boolean} [options.discoverRemote]
 * @param {'machine'|'studio_vault'|'mixed'} [options.credentialPlane]
 * @param {(providerId: string) => Promise<object|null>|object|null} [options.resolveCredential]
 *   Injected resolver (Studio vault). When omitted, uses machine env.d / process env.
 * @param {boolean} [options.curateWorkersAi] default true — intersect Cloudflare models with curated allowlist
 * @param {boolean} [options.includeLocal] default true — probe Ollama (machine plane only by default)
 */
export async function collectModelsStatus(options = {}) {
  const env = options.env || process.env;
  const ollamaFetchImpl = options.fetchImpl || fetch;
  const providerFetchImpl = options.providerFetchImpl || fetch;
  const credentialPlane = options.credentialPlane || (options.resolveCredential ? 'studio_vault' : 'machine');
  const includeLocal = options.includeLocal ?? credentialPlane === 'machine';
  const curateWorkersAi = options.curateWorkersAi !== false;

  const resolveCredential = options.resolveCredential
    || ((providerId) => resolveProviderCredential(providerId, { env, home: options.home }));

  const credentials = new Map();
  for (const provider of API_PROVIDERS) {
    credentials.set(provider.id, await resolveCredential(provider.id));
  }

  const providers = API_PROVIDERS.map((provider) => {
    const credential = credentials.get(provider.id);
    return {
      ...provider,
      configured: credential?.configured === true,
      source: credential?.source || null,
      credentialError: credential?.error || null,
    };
  });

  const shouldDiscover = options.discoverRemote !== false;
  const discovery = {};
  const providerModels = {};

  await Promise.all(API_PROVIDERS.map(async (provider) => {
    const credential = credentials.get(provider.id);
    let result = shouldDiscover && credential?.configured
      ? await discoverProviderModels(provider.id, credential, { fetchImpl: providerFetchImpl })
      : emptyDiscovery();
    if (provider.id === 'cloudflare' && result.ok && curateWorkersAi) {
      const curated = filterWorkersAiCurated(result.models || [], { curated: true });
      result = {
        ...result,
        models: curated,
        returnedModelCount: curated.length,
        curation: 'agentsam_workers_ai_allowlist',
      };
    }
    discovery[provider.id] = providerSummary(result);
    if (result.curation) discovery[provider.id].curation = result.curation;
    providerModels[provider.id] = result.models || [];
  }));

  const discovered = Object.values(providerModels).flat();
  const exactAvailable = discovered.filter((row) => row.availability === 'available');
  const catalogModels = mergeStaticFallbacks(discovered);

  let local = {
    provider: 'ollama',
    configured: false,
    online: false,
    endpoint: null,
    chatModel: null,
    embedModel: null,
    models: [],
    error: null,
  };
  if (includeLocal) {
    const ollamaConfig = resolveOllamaConfig({}, env);
    const ollama = await probeOllama(ollamaConfig, ollamaFetchImpl);
    local = {
      provider: 'ollama',
      configured: ollama.online,
      online: ollama.online,
      endpoint: ollama.endpoint,
      chatModel: ollamaConfig.model,
      embedModel: ollamaConfig.embedModel,
      models: ollama.models || [],
      error: ollama.error || null,
    };
  }

  return {
    schemaVersion: 'agentsam-model-inventory-v3',
    generatedAt: new Date().toISOString(),
    authority: 'per_credential_provider_discovery',
    credential_plane: credentialPlane,
    providers,
    discovery,
    providerModels,
    catalogModels,
    availableModels: exactAvailable,
    local,
  };
}

/** Public helper: normalize inventory for Studio/JSON clients (never includes secrets). */
export function sanitizeInventoryForClient(status = {}) {
  return {
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
    local: status.local
      ? {
          provider: status.local.provider,
          online: status.local.online === true,
          models: (status.local.models || []).map((row) => ({ name: row.name })),
        }
      : null,
  };
}

function statusMark(ok) { return ok ? pc.green('●') : pc.dim('○'); }
function writeLine(write, value = '') { write(`${value}\n`); }
function contextLabel(model) {
  const value = Number(model?.context_window);
  if (!Number.isFinite(value) || value <= 0) return 'ctx unknown';
  return `ctx ${Math.round(value / 1000).toLocaleString('en-US')}k`;
}

export function renderModelsStatus(status) {
  const lines = [];
  lines.push('');
  lines.push(`  ${pc.bold('Agent Sam · models')}`);
  lines.push(`  ${pc.dim('Availability is verified with this machine\'s own provider credentials. Limits are provider-derived when exposed; otherwise marked unknown/reference.')}`);
  lines.push('');

  for (const provider of status.providers) {
    const state = provider.configured
      ? pc.green('configured')
      : pc.dim(provider.credentialError ? 'blocked' : 'not configured');
    const discovery = status.discovery?.[provider.id];
    const detail = provider.configured
      ? discovery?.attempted
        ? discovery.ok
          ? `${discovery.returnedModelCount} account-visible models`
          : `discovery failed · ${discovery.error || 'unknown error'}`
        : `credential available · ${provider.source || 'runtime'}`
      : provider.credentialError
        ? `${provider.credential} · ${provider.credentialError}`
        : provider.credential;
    lines.push(`  ${statusMark(provider.configured)}  ${pc.cyan(provider.label.padEnd(12))} ${state.padEnd(20)} ${pc.dim(detail)}`);
  }

  for (const provider of API_PROVIDERS) {
    const models = status.providerModels?.[provider.id] || [];
    if (!models.length) continue;
    lines.push('');
    lines.push(`  ${pc.dim(`${provider.label} · provider-verified for this credential`)}`);
    const visible = models.slice(0, 30);
    for (const model of visible) {
      const source = model.context_window_source === 'provider_api'
        ? contextLabel(model)
        : model.context_window_source === 'sdk_reference'
          ? `${contextLabel(model)} · reference`
          : 'ctx unknown';
      lines.push(`    ${pc.green('•')} ${model.provider_model_id} ${pc.dim('· ' + source)}`);
    }
    if (models.length > visible.length) lines.push(`    ${pc.dim(`… ${models.length - visible.length} more`)}`);
  }

  const local = status.local;
  const localState = local.online ? pc.green('online') : pc.dim('offline');
  lines.push('');
  lines.push(`  ${statusMark(local.online)}  ${pc.cyan('Ollama'.padEnd(12))} ${localState.padEnd(20)} ${pc.dim('local only')}`);
  if (local.online) {
    const names = local.models.map((row) => row.name).filter(Boolean);
    for (const name of names.slice(0, 30)) lines.push(`    ${pc.green('•')} ${name}`);
    if (names.length > 30) lines.push(`    ${pc.dim(`… ${names.length - 30} more`)}`);
  }

  lines.push('');
  lines.push(`  ${pc.dim('Use /model inside Agent Sam. The picker is built from the models visible to your own connected provider credentials.')}`);
  lines.push('');
  return lines.join('\n');
}

export async function runModels(argv = [], options = {}) {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    const text = [
      'agentsam models [--json] [--no-discover]',
      '',
      'Probe the provider accounts configured on this machine and list the models visible to those exact credentials.',
      'Context/output limits are taken from provider metadata when available; otherwise Agent Sam reports unknown or a clearly-labeled SDK reference.',
      '',
    ].join('\n');
    (options.write || process.stdout.write.bind(process.stdout))(text);
    return;
  }

  const allowed = new Set(['--json', '--no-discover']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown models option: ${unknown[0]}`);

  const status = await collectModelsStatus({
    ...options,
    discoverRemote: !argv.includes('--no-discover'),
  });
  const write = options.write || ((text) => process.stdout.write(text));
  if (argv.includes('--json')) writeLine(write, JSON.stringify(status, null, 2));
  else write(renderModelsStatus(status));
  return status;
}
