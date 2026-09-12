import pc from 'picocolors';
import { probeOllama, resolveOllamaConfig } from './ollama.js';

const API_PROVIDERS = Object.freeze([
  { id: 'openai', label: 'OpenAI', credential: 'OPENAI_API_KEY' },
  { id: 'gemini', label: 'Gemini', credential: 'GEMINI_API_KEY' },
  { id: 'grok', label: 'Grok', credential: 'XAI_API_KEY' },
  { id: 'anthropic', label: 'Anthropic', credential: 'ANTHROPIC_API_KEY' },
]);

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function configured(value) {
  return Boolean(clean(value));
}

export async function collectModelsStatus(options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const ollamaConfig = resolveOllamaConfig({}, env);
  const ollama = await probeOllama(ollamaConfig, fetchImpl);

  return {
    schemaVersion: 'agentsam-model-inventory-v1',
    providers: API_PROVIDERS.map((provider) => ({
      ...provider,
      configured: configured(env[provider.credential]),
      source: 'environment',
    })),
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

function statusMark(ok) {
  return ok ? pc.green('●') : pc.dim('○');
}

function writeLine(write, value = '') {
  write(`${value}\n`);
}

export function renderModelsStatus(status) {
  const lines = [];
  lines.push('');
  lines.push(`  ${pc.bold('Agent Sam · models')}`);
  lines.push(`  ${pc.dim('Detected from this terminal session. Secrets are never printed.')}`);
  lines.push('');

  for (const provider of status.providers) {
    const state = provider.configured ? pc.green('configured') : pc.dim('not configured');
    const detail = provider.configured ? 'credential available' : provider.credential;
    lines.push(`  ${statusMark(provider.configured)}  ${pc.cyan(provider.label.padEnd(10))} ${state.padEnd(20)} ${pc.dim(detail)}`);
  }

  const local = status.local;
  const localState = local.online ? pc.green('online') : pc.dim('offline');
  lines.push(`  ${statusMark(local.online)}  ${pc.cyan('Ollama'.padEnd(10))} ${localState.padEnd(20)} ${pc.dim('local only')}`);

  if (local.online) {
    const names = local.models.map((row) => row.name).filter(Boolean);
    lines.push('');
    lines.push(`  ${pc.dim('local models')}`);
    if (names.length) {
      for (const name of names) lines.push(`    ${pc.green('•')} ${name}`);
    } else {
      lines.push(`    ${pc.dim('no models reported')}`);
    }
    lines.push('');
    lines.push(`  ${pc.dim('chat default')}   ${local.chatModel}`);
    lines.push(`  ${pc.dim('embed default')}  ${local.embedModel}`);
  }

  lines.push('');
  lines.push(`  ${pc.dim('Provider model catalogs and model selection belong to the connected host/runtime;')}`);
  lines.push(`  ${pc.dim('this command only reports what this local CLI can prove is configured or available.')}`);
  lines.push('');
  return lines.join('\n');
}

export async function runModels(argv = [], options = {}) {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    const text = 'agentsam models [--json]\n\nShow model providers configured in this terminal session plus models reported by local Ollama.\n';
    (options.write || process.stdout.write.bind(process.stdout))(text);
    return;
  }
  const unknown = argv.filter((arg) => arg !== '--json');
  if (unknown.length) throw new Error(`unknown models option: ${unknown[0]}`);

  const status = await collectModelsStatus(options);
  const write = options.write || ((text) => process.stdout.write(text));
  if (argv.includes('--json')) {
    writeLine(write, JSON.stringify(status, null, 2));
  } else {
    write(renderModelsStatus(status));
  }
  return status;
}
