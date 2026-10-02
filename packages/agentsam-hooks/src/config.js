import fs from 'node:fs';
import path from 'node:path';
import { HOOK_CONFIG_SCHEMA, normalizeHookEvent } from './contracts.js';
import { createHookRuntime } from './runtime.js';
import { createCommandHookAdapter } from './adapters/command.js';
import { createHttpHookAdapter } from './adapters/http.js';

export const HOOK_CONFIG_FILENAMES = Object.freeze(['agentsam.hooks.json', path.join('.agentsam', 'hooks.json')]);

function object(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function assertInside(base, candidate, label) {
  const realBase = fs.realpathSync(base);
  const realCandidate = fs.realpathSync(candidate);
  const relative = path.relative(realBase, realCandidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${label}_outside_config_directory:${candidate}`);
}

function resolveEnvReferences(value, env) {
  if (Array.isArray(value)) return value.map((row) => resolveEnvReferences(row, env));
  if (object(value)) return Object.fromEntries(Object.entries(value).map(([key, row]) => [key, resolveEnvReferences(row, env)]));
  if (typeof value !== 'string' || !value.startsWith('env:')) return value;
  const name = value.slice(4);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`invalid_hook_env_reference:${name}`);
  if (env[name] == null) throw new Error(`missing_hook_environment:${name}`);
  return env[name];
}

export function findHookConfig(startDirectory = process.cwd(), options = {}) {
  let current = path.resolve(startDirectory);
  const stopAt = path.resolve(options.stopAt || path.parse(current).root);
  while (true) {
    for (const filename of options.filenames || HOOK_CONFIG_FILENAMES) {
      const candidate = path.join(current, filename);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    if (current === stopAt || current === path.parse(current).root) return null;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function normalizeHookConfig(value, options = {}) {
  if (!object(value)) throw new TypeError('hook_config_must_be_object');
  for (const key of Object.keys(value)) {
    if (!['schema', 'adapters', 'hooks'].includes(key)) throw new Error(`unsupported_hook_config_field:${key}`);
  }
  const schema = clean(value.schema);
  if (schema !== HOOK_CONFIG_SCHEMA) throw new Error(`unsupported_hook_config_schema:${schema}`);
  const adapters = object(value.adapters) ? value.adapters : {};
  const hooks = object(value.hooks) ? value.hooks : {};
  const normalizedAdapters = {};
  for (const [id, adapter] of Object.entries(adapters)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id) || !object(adapter)) throw new Error(`invalid_hook_adapter:${id}`);
    const type = clean(adapter.type).toLowerCase();
    if (!['command', 'http'].includes(type)) throw new Error(`unsupported_hook_adapter_type:${type || '<missing>'}`);
    const allowed = type === 'command'
      ? new Set(['type', 'command', 'args', 'cwd', 'env', 'inherit_environment', 'timeout_ms', 'max_output_bytes'])
      : new Set(['type', 'url', 'headers', 'timeout_ms', 'max_response_bytes']);
    for (const key of Object.keys(adapter)) if (!allowed.has(key)) throw new Error(`unsupported_hook_adapter_field:${id}:${key}`);
    normalizedAdapters[id] = structuredClone(adapter);
  }
  const normalizedHooks = {};
  for (const [event, entries] of Object.entries(hooks)) {
    const hook = normalizeHookEvent(event);
    normalizedHooks[hook] = (Array.isArray(entries) ? entries : [entries]).map((entry, index) => {
      if (typeof entry === 'string') return { id: `${hook}:${index + 1}`, adapter: entry };
      if (!object(entry)) throw new TypeError(`invalid_configured_hook:${hook}:${index}`);
      for (const key of Object.keys(entry)) {
        if (!['id', 'adapter', 'priority', 'timeout_ms', 'failure_mode', 'enabled', 'metadata'].includes(key)) {
          throw new Error(`unsupported_configured_hook_field:${hook}:${key}`);
        }
      }
      const adapter = clean(entry.adapter);
      if (!normalizedAdapters[adapter]) throw new Error(`unknown_hook_adapter:${adapter}`);
      return { ...structuredClone(entry), id: clean(entry.id || `${hook}:${index + 1}`), adapter };
    });
  }
  return Object.freeze({
    schema: HOOK_CONFIG_SCHEMA,
    adapters: Object.freeze(normalizedAdapters),
    hooks: Object.freeze(normalizedHooks),
    source: options.source || null,
  });
}

export function loadHookConfig(filename, options = {}) {
  const discovered = filename || findHookConfig(options.cwd || process.cwd(), options);
  if (!discovered) throw new Error('agentsam_hook_config_not_found');
  const resolved = path.resolve(discovered);
  let parsed;
  try { parsed = JSON.parse(fs.readFileSync(resolved, 'utf8')); }
  catch (error) { throw new Error(`hook_config_unreadable:${resolved}:${error.message}`); }
  return normalizeHookConfig(parsed, { source: resolved });
}

function configuredAdapter(definition, configDirectory, options) {
  const resolved = resolveEnvReferences(definition, options.env || process.env);
  if (resolved.type === 'http') return createHttpHookAdapter({ ...resolved, fetchImpl: options.fetchImpl });
  const cwd = resolved.cwd ? path.resolve(configDirectory, resolved.cwd) : configDirectory;
  if (options.restrictCommandCwd !== false) assertInside(configDirectory, cwd, 'hook_command_cwd');
  let command = clean(resolved.command);
  if (!command) throw new TypeError('configured_hook_command_required');
  if (command.startsWith('./') || command.startsWith('../')) command = path.resolve(configDirectory, command);
  return createCommandHookAdapter({ ...resolved, command, cwd });
}

export function createHookRuntimeFromConfig(configOrFilename, options = {}) {
  const config = typeof configOrFilename === 'string' || configOrFilename == null
    ? loadHookConfig(configOrFilename, options)
    : normalizeHookConfig(configOrFilename, { source: options.source });
  const configDirectory = config.source ? path.dirname(config.source) : path.resolve(options.cwd || process.cwd());
  const handlers = new Map();
  for (const [id, definition] of Object.entries(config.adapters)) {
    handlers.set(id, configuredAdapter(definition, configDirectory, options));
  }
  const runtime = createHookRuntime({ clock: options.clock, onReceipt: options.onReceipt });
  for (const [hook, entries] of Object.entries(config.hooks)) {
    for (const entry of entries) {
      runtime.register(hook, {
        ...entry,
        handler: handlers.get(entry.adapter),
        metadata: { ...(entry.metadata || {}), adapter: entry.adapter, config_source: config.source },
      });
    }
  }
  return Object.freeze({ runtime, config });
}
