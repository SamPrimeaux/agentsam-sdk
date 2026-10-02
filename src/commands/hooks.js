import fs from 'node:fs';
import path from 'node:path';
import {
  HOOK_CONFIG_SCHEMA,
  createHookRuntime,
  createHookRuntimeFromConfig,
  findHookConfig,
  loadHookConfig,
  registerStoredHooks,
} from '../../packages/agentsam-hooks/src/index.js';
import { findCliProjectRoot } from '../lib/cli-preferences.js';
import { readAccountSession } from '../lib/account-session.js';
import {
  listRuntimeHooks,
  listRuntimeHookExecutions,
  recordRuntimeHookReceipt,
  setRuntimeHookActive,
} from '../local/runtime-store.js';

function clean(value) { return value == null ? '' : String(value).trim(); }
function writeLine(write, value = '') { write(`${value}\n`); }
function countConfigured(config) {
  return Object.values(config?.hooks || {}).reduce((sum, rows) => sum + rows.length, 0);
}

function registerCodeHooks(runtime, hooks = {}) {
  for (const [event, definitions] of Object.entries(hooks || {})) {
    for (const definition of Array.isArray(definitions) ? definitions : [definitions]) {
      if (typeof definition === 'function') {
        runtime.register(event, { handler: definition, metadata: { hook_source: 'code' } });
      } else {
        runtime.register(event, {
          ...definition,
          metadata: { ...(definition?.metadata || {}), hook_source: 'code' },
        });
      }
    }
  }
}

/**
 * Resolve code, project config, and stored definitions into one ordered runtime.
 * The source changes authoring/ownership only; dispatch semantics stay identical.
 */
export async function createProjectHookRuntime(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const projectRoot = path.resolve(options.projectRoot || findCliProjectRoot(cwd));
  const accountId = clean(options.ownerId || readAccountSession({ home: options.home })?.account_id) || 'local';
  const sourceByHook = new Map();
  const persistReceipts = options.persistReceipts !== false;
  const runtime = createHookRuntime({
    clock: options.clock,
    async onReceipt(receipt) {
      const definition = sourceByHook.get(`${receipt.hook}:${receipt.hook_id}`) || { source: 'code', stored_hook_id: null };
      if (persistReceipts) {
        await recordRuntimeHookReceipt({
          projectRoot,
          owner_id: accountId,
          receipt,
          source_kind: definition.source,
          hook_id: definition.stored_hook_id,
          session_id: options.sessionId,
          conversation_id: options.conversationId,
        });
      }
      if (typeof options.onReceipt === 'function') await options.onReceipt(receipt);
    },
  });

  registerCodeHooks(runtime, options.hooks);
  const configFile = options.configFile || findHookConfig(cwd, { stopAt: projectRoot });
  let config = null;
  if (configFile) {
    ({ config } = createHookRuntimeFromConfig(configFile, {
      runtime,
      cwd,
      env: options.env,
      fetchImpl: options.fetchImpl,
      restrictCommandCwd: options.restrictCommandCwd,
    }));
  }

  const stored = await registerStoredHooks(runtime, {
    listHooks: (query) => listRuntimeHooks({
      projectRoot,
      owner_id: accountId,
      ...query,
    }),
  }, {
    cwd: projectRoot,
    env: options.env,
    fetchImpl: options.fetchImpl,
    restrictCommandCwd: options.restrictCommandCwd,
    resolveHandler: options.resolveHandler,
    context: {
      owner_id: accountId,
      account_id: accountId,
      project_id: options.projectId,
      project_root: projectRoot,
      repository_id: options.repositoryId,
      session_id: options.sessionId,
    },
  });

  for (const definition of runtime.list()) {
    sourceByHook.set(`${definition.hook}:${definition.id}`, {
      source: clean(definition.metadata?.hook_source) || (definition.metadata?.stored_hook_id ? 'stored' : definition.metadata?.config_source ? 'config' : 'code'),
      stored_hook_id: clean(definition.metadata?.stored_hook_id) || null,
    });
  }
  return Object.freeze({
    runtime,
    owner_id: accountId,
    project_root: projectRoot,
    config,
    config_file: configFile || null,
    stored,
    definitions: runtime.list(),
  });
}

function hookTemplate() {
  return {
    schema: HOOK_CONFIG_SCHEMA,
    adapters: {},
    hooks: {},
  };
}

function parseLimit(argv, fallback = 30) {
  const index = argv.indexOf('--limit');
  if (index === -1) return fallback;
  const value = Number(argv[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 500) throw new Error('hooks_limit_must_be_between_1_and_500');
  return value;
}

function renderHookRows(rows, write) {
  if (!rows.length) {
    writeLine(write, '  No hooks configured. Run `agentsam hooks init` or add a stored hook.');
    return;
  }
  for (const row of rows) {
    const source = clean(row.metadata?.hook_source || row.source_kind) || 'code';
    const state = row.enabled === false || row.is_active === false ? 'disabled' : 'active';
    const handler = clean(row.handler_type || row.metadata?.adapter) || 'callback';
    writeLine(write, `  ${String(row.hook || row.event_type).padEnd(25)} ${String(row.id || row.hook_key).padEnd(28)} ${source.padEnd(7)} ${handler.padEnd(10)} ${state} · p${row.priority ?? 100}`);
  }
}

export async function runHooks(argv = [], options = {}) {
  const write = options.write || ((text) => process.stdout.write(text));
  const cwd = path.resolve(options.cwd || process.cwd());
  const projectRoot = findCliProjectRoot(cwd);
  const jsonOutput = argv.includes('--json');
  const command = argv.find((arg) => !arg.startsWith('-')) || 'status';
  if (argv.includes('--help') || argv.includes('-h') || command === 'help') {
    write([
      'agentsam hooks [status|list|executions|validate|init|enable|disable] [--json]',
      '',
      'One hook concept, three authoring sources: code, project config, and stored rows.',
      '  status                  Show active sources and execution evidence',
      '  list                    Show the merged dispatch order with source badges',
      '  executions [--limit N]  Show recent value-free receipts',
      '  validate [config]       Validate a portable hook config',
      '  init                    Create .agentsam/hooks.json (idempotent)',
      '  enable|disable <key>    Toggle a stored hook without editing code/config',
      '',
    ].join('\n'));
    return 0;
  }

  if (command === 'init') {
    const filename = path.join(projectRoot, '.agentsam', 'hooks.json');
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    const created = !fs.existsSync(filename);
    if (created) fs.writeFileSync(filename, `${JSON.stringify(hookTemplate(), null, 2)}\n`, { mode: 0o600 });
    const loaded = loadHookConfig(filename);
    const result = { ok: true, created, source: filename, schema: loaded.schema };
    if (jsonOutput) writeLine(write, JSON.stringify(result, null, 2));
    else writeLine(write, `  Hooks config ready · ${filename}`);
    return result;
  }

  if (command === 'validate') {
    const commandIndex = argv.indexOf(command);
    const candidate = argv.slice(commandIndex + 1).find((arg) => !arg.startsWith('-'));
    const filename = candidate || findHookConfig(cwd, { stopAt: projectRoot });
    if (!filename) throw new Error('agentsam_hook_config_not_found');
    const config = loadHookConfig(filename);
    const result = { ok: true, schema: config.schema, source: config.source, adapters: Object.keys(config.adapters).length, hooks: countConfigured(config) };
    if (jsonOutput) writeLine(write, JSON.stringify(result, null, 2));
    else writeLine(write, `  Valid · ${result.hooks} hooks · ${result.adapters} adapters · ${result.source}`);
    return result;
  }

  const ownerId = clean(options.ownerId || readAccountSession({ home: options.home })?.account_id) || 'local';
  if (command === 'enable' || command === 'disable') {
    const key = argv[argv.indexOf(command) + 1];
    if (!key || key.startsWith('-')) throw new Error(`hooks_${command}_requires_key`);
    const changed = await setRuntimeHookActive({ projectRoot, owner_id: ownerId, hook_key: key, active: command === 'enable' });
    if (!changed) throw new Error(`stored_hook_not_found:${key}`);
    const result = { ok: true, hook_key: key, active: command === 'enable' };
    if (jsonOutput) writeLine(write, JSON.stringify(result, null, 2));
    else writeLine(write, `  ${key} → ${result.active ? 'enabled' : 'disabled'}`);
    return result;
  }

  if (command === 'executions') {
    const executions = await listRuntimeHookExecutions({ projectRoot, owner_id: ownerId, limit: parseLimit(argv) });
    if (jsonOutput) writeLine(write, JSON.stringify({ schema: 'agentsam.hook.executions.v1', executions }, null, 2));
    else {
      writeLine(write, '\n  Recent hook executions');
      if (!executions.length) writeLine(write, '  No hook receipts recorded yet.');
      for (const row of executions) {
        const at = new Date(Number(row.ran_at_unix) * 1000).toISOString();
        writeLine(write, `  ${at} ${String(row.status).padEnd(9)} ${String(row.event_type).padEnd(24)} ${row.hook_key} · ${row.duration_ms}ms`);
      }
      writeLine(write);
    }
    return executions;
  }

  if (!['status', 'list'].includes(command)) throw new Error(`unknown_hooks_command:${command}`);
  const resolved = await createProjectHookRuntime({
    cwd,
    projectRoot,
    ownerId,
    home: options.home,
    hooks: options.hooks,
    persistReceipts: false,
  });
  const storedAll = await listRuntimeHooks({ projectRoot, owner_id: ownerId, activeOnly: false });
  const result = {
    schema: 'agentsam.hooks.status.v1',
    project_root: projectRoot,
    owner_id: ownerId,
    config: resolved.config ? { source: resolved.config_file, hooks: countConfigured(resolved.config), adapters: Object.keys(resolved.config.adapters).length } : null,
    sources: {
      code: resolved.definitions.filter((row) => row.metadata?.hook_source === 'code').length,
      config: resolved.definitions.filter((row) => row.metadata?.hook_source === 'config').length,
      stored_active: resolved.definitions.filter((row) => row.metadata?.hook_source === 'stored').length,
      stored_total: storedAll.length,
    },
    hooks: resolved.definitions,
  };
  if (jsonOutput) writeLine(write, JSON.stringify(result, null, 2));
  else {
    writeLine(write, '\n  Agent Sam · hooks');
    writeLine(write, '  One ordered lifecycle contract · code is read-only · config/stored hooks are portable.');
    writeLine(write, `  project  ${projectRoot}`);
    writeLine(write, `  config   ${result.config ? `${result.config.hooks} hooks · ${result.config.source}` : 'not configured'}`);
    writeLine(write, `  stored   ${result.sources.stored_active} active · ${result.sources.stored_total} total`);
    writeLine(write, '');
    if (command === 'list') renderHookRows([...resolved.definitions, ...storedAll.filter((row) => !row.is_active)], write);
    else writeLine(write, '  Use `agentsam hooks list` for dispatch order and `agentsam hooks executions` for receipts.');
    writeLine(write);
  }
  return result;
}
