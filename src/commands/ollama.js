import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { readProjectConfig, setLocalModelCapability, writeProjectConfig } from '../lib/project-config.js';

export const OLLAMA_DEFAULTS = Object.freeze({
  baseUrl: 'http://127.0.0.1:11434',
  model: 'qwen2.5-coder',
  embedModel: 'mxbai-embed-large',
});

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function boolFlag(argv, name) {
  return argv.includes(name);
}

export function parseOllamaArgs(argv = []) {
  const first = argv[0] && !String(argv[0]).startsWith('-') ? String(argv[0]) : 'status';
  const opts = {
    command: first,
    cwd: process.cwd(),
    envFile: '',
    baseUrl: '',
    model: '',
    embedModel: '',
    install: boolFlag(argv, '--install'),
    start: boolFlag(argv, '--start'),
    pull: boolFlag(argv, '--pull'),
    json: boolFlag(argv, '--json'),
  };

  for (let i = first === argv[0] ? 1 : 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (['--install', '--start', '--pull', '--json'].includes(arg)) continue;
    if (arg === '--cwd') opts.cwd = argv[++i] || opts.cwd;
    else if (arg === '--env-file') opts.envFile = argv[++i] || '';
    else if (arg === '--base-url') opts.baseUrl = argv[++i] || '';
    else if (arg === '--model') opts.model = argv[++i] || '';
    else if (arg === '--embed-model') opts.embedModel = argv[++i] || '';
    else if (!String(arg).startsWith('-') && opts.command === 'pull') {
      opts.model = opts.model || arg;
    } else if (arg === '--help' || arg === '-h') opts.command = 'help';
    else throw new Error(`unknown ollama option: ${arg}`);
  }
  return opts;
}

export function resolveOllamaConfig(opts = {}, env = process.env) {
  return {
    baseUrl: clean(opts.baseUrl || env.OLLAMA_BASE_URL || OLLAMA_DEFAULTS.baseUrl).replace(/\/+$/, ''),
    model: clean(opts.model || env.OLLAMA_MODEL || OLLAMA_DEFAULTS.model),
    embedModel: clean(opts.embedModel || env.OLLAMA_EMBED_MODEL || OLLAMA_DEFAULTS.embedModel),
  };
}

function replaceEnvLine(text, key, value) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = `${key}=${value}`;
  const re = new RegExp(`^${escaped}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, line);
  const prefix = text && !text.endsWith('\n') ? `${text}\n` : text;
  return `${prefix}${line}\n`;
}

export function upsertOllamaEnvFile(filename, config) {
  const target = path.resolve(filename);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  let text = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
  text = replaceEnvLine(text, 'OLLAMA_BASE_URL', config.baseUrl);
  text = replaceEnvLine(text, 'OLLAMA_MODEL', config.model);
  text = replaceEnvLine(text, 'OLLAMA_EMBED_MODEL', config.embedModel);
  fs.writeFileSync(target, text, 'utf8');
  return target;
}

export function updateProjectOllamaConfig(cwd, config) {
  const root = path.resolve(cwd);
  const filename = path.join(root, '.agentsam', 'config.json');
  if (!fs.existsSync(filename)) return null;
  const project = readProjectConfig(root);
  setLocalModelCapability(project, 'ollama');
  writeProjectConfig(root, project);
  return filename;
}

function commandResult(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout || 15_000,
    ...options,
  });
}

export function commandAvailable(command, spawnSyncImpl = spawnSync) {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSyncImpl(finder, [command], { encoding: 'utf8', stdio: 'ignore' });
  return result.status === 0;
}

export function ollamaInstallPlan(platform = process.platform, available = {}) {
  if ((platform === 'darwin' || platform === 'linux') && available.brew) {
    return { command: 'brew', args: ['install', 'ollama'], manager: 'homebrew' };
  }
  if (platform === 'win32' && available.winget) {
    return {
      command: 'winget',
      args: ['install', '--id', 'Ollama.Ollama', '--exact', '--accept-source-agreements', '--accept-package-agreements'],
      manager: 'winget',
    };
  }
  return null;
}

function installOllama() {
  const available = {
    brew: commandAvailable('brew'),
    winget: commandAvailable('winget'),
  };
  const plan = ollamaInstallPlan(process.platform, available);
  if (!plan) {
    throw new Error('automatic Ollama install is unavailable on this host; install Ollama with your platform package manager, then rerun `agentsam ollama setup`');
  }
  const result = commandResult(plan.command, plan.args, { inherit: true, timeout: 20 * 60_000 });
  if (result.status !== 0) throw new Error(`Ollama install failed via ${plan.manager}`);
  return plan.manager;
}

function startOllama() {
  if (process.platform === 'darwin' && commandAvailable('brew')) {
    const result = commandResult('brew', ['services', 'start', 'ollama'], { inherit: true, timeout: 60_000 });
    if (result.status === 0) return 'homebrew-service';
  }
  const child = spawn('ollama', ['serve'], { detached: true, stdio: 'ignore' });
  child.unref();
  return 'ollama-serve';
}

function normalizeModelName(value) {
  return clean(value).toLowerCase().replace(/:latest$/, '');
}

function hasModel(models, desired) {
  const want = normalizeModelName(desired);
  return models.some((row) => normalizeModelName(row.name || row.model) === want);
}

export async function probeOllamaModel(model, config, fetchImpl = fetch) {
  const endpoint = `${config.baseUrl}/api/show`;
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return { ok: false, model, context_window: null, error: `HTTP ${response.status}` };
    const body = await response.json();
    const info = body?.model_info && typeof body.model_info === 'object' ? body.model_info : {};
    const contextEntry = Object.entries(info).find(([key, value]) => key.endsWith('.context_length') && Number(value) > 0);
    return {
      ok: true,
      model,
      context_window: contextEntry ? Math.floor(Number(contextEntry[1])) : null,
      context_window_source: contextEntry ? 'local_runtime' : 'unknown',
      capabilities: Array.isArray(body?.capabilities) ? body.capabilities : [],
      details: body?.details || null,
    };
  } catch (error) {
    return { ok: false, model, context_window: null, error: error?.message || String(error) };
  }
}

export async function probeOllama(config, fetchImpl = fetch) {
  const endpoint = `${config.baseUrl}/api/tags`;
  try {
    const response = await fetchImpl(endpoint, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { online: false, status: response.status, endpoint, models: [] };
    const body = await response.json();
    const models = Array.isArray(body?.models) ? body.models.map((row) => ({ name: row.name || row.model || '' })).filter((row) => row.name) : [];
    return {
      online: true,
      status: response.status,
      endpoint,
      models,
      chat_ready: hasModel(models, config.model),
      embed_ready: hasModel(models, config.embedModel),
    };
  } catch (error) {
    return { online: false, status: null, endpoint, models: [], error: error?.message || String(error) };
  }
}

function binaryInfo() {
  if (!commandAvailable('ollama')) return { installed: false, version: null };
  const result = commandResult('ollama', ['--version']);
  return {
    installed: result.status === 0,
    version: result.status === 0 ? clean(result.stdout || result.stderr) : null,
  };
}

function pullModel(model) {
  const result = commandResult('ollama', ['pull', model], { inherit: true, timeout: 60 * 60_000 });
  if (result.status !== 0) throw new Error(`ollama pull failed for ${model}`);
}

function help() {
  return `agentsam ollama <setup|status|list|pull> [options]\n\nLocal-only Ollama development kit. Nothing here configures an edge model.\n\n  setup                 Write OLLAMA_* values into the local project .env\n    --install           Explicitly install Ollama with a supported package manager\n    --start             Start the local Ollama service\n    --pull              Pull both configured chat + embedding models\n  status                Probe the local Ollama API and configured models\n  list                  Alias for status with model inventory\n  pull [model]          Pull one model, or both configured defaults when omitted\n\n  --base-url <url>      Default http://127.0.0.1:11434\n  --model <name>        Default qwen2.5-coder\n  --embed-model <name>  Default mxbai-embed-large\n  --cwd <path>          Project root (default current directory)\n  --env-file <path>     Env file to update (default <cwd>/.env)\n  --json                Machine-readable output\n\nRemote AgentSam sessions should use the existing user-hosted terminal tunnel to execute this CLI on the local machine; the Worker should not try to reach 127.0.0.1.\n`;
}

function printResult(result, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  console.log(`Ollama local development`);
  console.log(`  base URL     ${result.config.baseUrl}`);
  console.log(`  chat model   ${result.config.model}`);
  console.log(`  embed model  ${result.config.embedModel}`);
  console.log(`  binary       ${result.binary.installed ? result.binary.version || 'installed' : 'not installed'}`);
  console.log(`  API          ${result.api.online ? 'online' : 'offline'}`);
  if (result.env_file) console.log(`  env          ${result.env_file}`);
  if (result.project_config) console.log(`  project      ${result.project_config}`);
  if (result.api.online) {
    console.log(`  chat ready   ${result.api.chat_ready ? 'yes' : 'no'}`);
    console.log(`  embed ready  ${result.api.embed_ready ? 'yes' : 'no'}`);
  }
  if (!result.binary.installed) console.log(`  next         agentsam ollama setup --install --start --pull`);
  else if (!result.api.online) console.log(`  next         agentsam ollama setup --start`);
  else if (!result.api.chat_ready || !result.api.embed_ready) console.log(`  next         agentsam ollama pull`);
}

export async function runOllama(argv = []) {
  const opts = parseOllamaArgs(argv);
  if (opts.command === 'help') {
    process.stdout.write(help());
    return;
  }
  if (!['setup', 'status', 'list', 'pull'].includes(opts.command)) {
    throw new Error(`unknown ollama command: ${opts.command}`);
  }

  const root = path.resolve(opts.cwd || process.cwd());
  const config = resolveOllamaConfig(opts);
  let envFile = null;
  let projectConfig = null;
  let installedBy = null;
  let startedBy = null;

  if (opts.command === 'setup') {
    envFile = upsertOllamaEnvFile(opts.envFile || path.join(root, '.env'), config);
    projectConfig = updateProjectOllamaConfig(root, config);
    if (!commandAvailable('ollama') && opts.install) installedBy = installOllama();
    if (commandAvailable('ollama') && opts.start) startedBy = startOllama();
  }

  if (opts.command === 'pull') {
    if (!commandAvailable('ollama')) throw new Error('Ollama is not installed; run `agentsam ollama setup --install` first');
    const requested = opts.model && opts.model !== OLLAMA_DEFAULTS.model ? [opts.model] : [config.model, config.embedModel];
    for (const model of [...new Set(requested.filter(Boolean))]) pullModel(model);
  } else if (opts.command === 'setup' && opts.pull) {
    if (!commandAvailable('ollama')) throw new Error('Ollama is not installed; rerun setup with --install before --pull');
    for (const model of [...new Set([config.model, config.embedModel])]) pullModel(model);
  }

  if (startedBy) await new Promise((resolve) => setTimeout(resolve, 600));
  const result = {
    schemaVersion: 'agentsam-ollama-local-v1',
    local_only: true,
    edge_model: false,
    config,
    env_file: envFile,
    project_config: projectConfig,
    installed_by: installedBy,
    started_by: startedBy,
    binary: binaryInfo(),
    api: await probeOllama(config),
  };
  printResult(result, opts.json);
  return result;
}
