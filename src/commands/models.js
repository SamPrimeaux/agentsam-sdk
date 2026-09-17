import pc from 'picocolors';
import { probeOllama, resolveOllamaConfig } from './ollama.js';
import { listModelCatalog } from '../models/index.js';
import { resolveProviderCredential } from '../lib/provider-credentials.js';

const API_PROVIDERS = Object.freeze([
  { id: 'openai', label: 'OpenAI', credential: 'OPENAI_API_KEY' },
  { id: 'gemini', label: 'Gemini', credential: 'GEMINI_API_KEY' },
  { id: 'grok', label: 'Grok', credential: 'XAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', credential: 'ANTHROPIC_API_KEY' },
  { id: 'cloudflare', label: 'Cloudflare', credential: 'CLOUDFLARE_API_TOKEN' },
]);

function clean(value) { return value == null ? '' : String(value).trim(); }
function configured(value) { return Boolean(clean(value)); }

async function discoverOpenAIModels(apiKey, fetchImpl) {
  if (!apiKey) return { attempted: false, ok: false, models: [], error: null };
  try {
    const response = await fetchImpl('https://api.openai.com/v1/models', {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8_000) : undefined,
    });
    if (!response.ok) return { attempted: true, ok: false, models: [], error: `HTTP ${response.status}` };
    const body = await response.json();
    const models = Array.isArray(body?.data) ? body.data.map((row) => clean(row?.id)).filter(Boolean) : [];
    return { attempted: true, ok: true, models, error: null };
  } catch (error) {
    return { attempted: true, ok: false, models: [], error: error?.message || String(error) };
  }
}

function cloudflareTaskName(task) {
  if (typeof task === 'string') return clean(task);
  if (task && typeof task === 'object') return clean(task.name || task.id);
  return '';
}

async function discoverCloudflareModels(apiToken, accountId, fetchImpl) {
  if (!apiToken) return { attempted: false, ok: false, models: [], error: null };
  if (!accountId) return { attempted: true, ok: false, models: [], error: 'ACCOUNT_ID is required for Workers AI discovery' };
  try {
    const response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/models/search`, {
      headers: { authorization: `Bearer ${apiToken}` },
      signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8_000) : undefined,
    });
    if (!response.ok) return { attempted: true, ok: false, models: [], error: `HTTP ${response.status}` };
    const body = await response.json();
    if (body?.success === false) return { attempted: true, ok: false, models: [], error: clean(body?.errors?.[0]?.message) || 'Cloudflare API error' };
    const models = (Array.isArray(body?.result) ? body.result : []).map((row) => ({
      id: clean(row?.name),
      task: cloudflareTaskName(row?.task),
      author: clean(row?.author) || null,
      description: clean(row?.description) || null,
    })).filter((row) => row.id);
    return { attempted: true, ok: true, models, error: null };
  } catch (error) {
    return { attempted: true, ok: false, models: [], error: error?.message || String(error) };
  }
}

export async function collectModelsStatus(options = {}) {
  const env = options.env || process.env;
  const ollamaFetchImpl = options.fetchImpl || fetch;
  const providerFetchImpl = options.providerFetchImpl || fetch;
  const ollamaConfig = resolveOllamaConfig({}, env);
  const ollama = await probeOllama(ollamaConfig, ollamaFetchImpl);
  const credentials = new Map(API_PROVIDERS.map((provider) => [provider.id, resolveProviderCredential(provider.id, { env, home: options.home })]));
  const providers = API_PROVIDERS.map((provider) => {
    const credential = credentials.get(provider.id);
    return {
      ...provider,
      configured: credential?.configured === true,
      source: credential?.source || null,
      credentialError: credential?.error || null,
    };
  });

  const openaiCredential = credentials.get('openai');
  const cloudflareCredential = credentials.get('cloudflare');
  const shouldDiscover = options.discoverRemote !== false;
  const openai = shouldDiscover && openaiCredential?.configured
    ? await discoverOpenAIModels(clean(openaiCredential?.value), providerFetchImpl)
    : { attempted: false, ok: false, models: [], error: null };
  const cloudflare = shouldDiscover && cloudflareCredential?.configured
    ? await discoverCloudflareModels(clean(cloudflareCredential?.value), clean(cloudflareCredential?.account_id), providerFetchImpl)
    : { attempted: false, ok: false, models: [], error: null };
  const cloudflareTextModels = cloudflare.models.filter((row) => row.task.toLowerCase() === 'text generation');
  const availableIds = new Set(openai.models);
  const catalogModels = listModelCatalog().map((record) => ({
    model_key: record.model_key,
    provider: record.provider,
    provider_model_id: record.provider_model_id,
    label: record.label,
    availability: record.provider === 'openai' && openai.ok
      ? (availableIds.has(record.provider_model_id) ? 'available' : 'unavailable')
      : 'unverified',
    source: record.source,
  }));

  return {
    schemaVersion: 'agentsam-model-inventory-v2',
    providers,
    discovery: {
      openai: {
        attempted: openai.attempted,
        ok: openai.ok,
        error: openai.error,
        returnedModelCount: openai.models.length,
      },
      cloudflare: {
        attempted: cloudflare.attempted,
        ok: cloudflare.ok,
        error: cloudflare.error,
        accountId: cloudflareCredential?.account_id || null,
        returnedModelCount: cloudflare.models.length,
        textGenerationModelCount: cloudflareTextModels.length,
      },
    },
    providerModels: {
      cloudflare: cloudflareTextModels,
    },
    catalogModels,
    availableModels: catalogModels.filter((row) => row.availability === 'available'),
    local: {
      provider: 'ollama',
      configured: ollama.online,
      online: ollama.online,
      endpoint: ollama.endpoint,
      chatModel: ollamaConfig.model,
      embedModel: ollamaConfig.embedModel,
      models: ollama.models || [],
      error: ollama.error || null,
    },
  };
}

function statusMark(ok) { return ok ? pc.green('●') : pc.dim('○'); }
function writeLine(write, value = '') { write(`${value}\n`); }

export function renderModelsStatus(status) {
  const lines = [];
  lines.push('');
  lines.push(`  ${pc.bold('Agent Sam · models')}`);
  lines.push(`  ${pc.dim('Credential presence is local evidence; exact hosted-model availability is provider-verified when discovery succeeds.')}`);
  lines.push('');

  for (const provider of status.providers) {
    const state = provider.configured ? pc.green('configured') : pc.dim(provider.credentialError ? 'blocked' : 'not configured');
    const detail = provider.configured ? `credential available · ${provider.source || 'runtime'}` : provider.credentialError ? `${provider.credential} · ${provider.credentialError}` : provider.credential;
    lines.push(`  ${statusMark(provider.configured)}  ${pc.cyan(provider.label.padEnd(10))} ${state.padEnd(20)} ${pc.dim(detail)}`);
  }

  const exact = status.availableModels || [];
  if (exact.length) {
    lines.push('');
    lines.push(`  ${pc.dim('provider-verified selectable models')}`);
    for (const model of exact) lines.push(`    ${pc.green('•')} ${model.provider_model_id}`);
  } else if (status.discovery?.openai?.attempted) {
    lines.push('');
    lines.push(`  ${pc.dim(`OpenAI discovery ${status.discovery.openai.ok ? 'completed; no catalog models matched' : `failed: ${status.discovery.openai.error || 'unknown error'}`}`)}`);
  }

  const cloudflare = status.discovery?.cloudflare;
  if (cloudflare?.attempted) {
    lines.push('');
    if (cloudflare.ok) {
      lines.push(`  ${pc.dim(`Cloudflare Workers AI · ${cloudflare.textGenerationModelCount} account-visible text-generation models`)}`);
      for (const model of status.providerModels?.cloudflare || []) lines.push(`    ${pc.green('•')} ${model.id}`);
    } else {
      lines.push(`  ${pc.dim(`Cloudflare discovery failed: ${cloudflare.error || 'unknown error'}`)}`);
    }
  }

  const local = status.local;
  const localState = local.online ? pc.green('online') : pc.dim('offline');
  lines.push(`  ${statusMark(local.online)}  ${pc.cyan('Ollama'.padEnd(10))} ${localState.padEnd(20)} ${pc.dim('local only')}`);
  if (local.online) {
    const names = local.models.map((row) => row.name).filter(Boolean);
    lines.push('');
    lines.push(`  ${pc.dim('local models')}`);
    if (names.length) for (const name of names) lines.push(`    ${pc.green('•')} ${name}`);
    else lines.push(`    ${pc.dim('no models reported')}`);
    lines.push('');
    lines.push(`  ${pc.dim('chat default')}   ${local.chatModel}`);
    lines.push(`  ${pc.dim('embed default')}  ${local.embedModel}`);
  }
  lines.push('');
  lines.push(`  ${pc.dim('Use /model inside Agent Sam to choose an exact verified model, reasoning effort, and processing tier.')}`);
  lines.push('');
  return lines.join('\n');
}

export async function runModels(argv = [], options = {}) {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    const text = 'agentsam models [--json] [--no-discover]\n\nShow configured providers, provider-verified known models when available, and local Ollama inventory.\n';
    (options.write || process.stdout.write.bind(process.stdout))(text);
    return;
  }
  const allowed = new Set(['--json', '--no-discover']);
  const unknown = argv.filter((arg) => !allowed.has(arg));
  if (unknown.length) throw new Error(`unknown models option: ${unknown[0]}`);

  const status = await collectModelsStatus({ ...options, discoverRemote: !argv.includes('--no-discover') });
  const write = options.write || ((text) => process.stdout.write(text));
  if (argv.includes('--json')) writeLine(write, JSON.stringify(status, null, 2));
  else write(renderModelsStatus(status));
  return status;
}
