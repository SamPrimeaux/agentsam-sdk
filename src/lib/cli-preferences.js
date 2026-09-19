import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getProjectName, tryReadProjectConfig } from './project-config.js';

export const CLI_PREFERENCES_SCHEMA = 'agentsam-cli-preferences-v3';
export const LEGACY_CLI_PREFERENCES_SCHEMAS = new Set(['agentsam-cli-preferences-v1', 'agentsam-cli-preferences-v2']);

function readJson(filename) {
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch { return null; }
}

function gitValue(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? String(result.stdout || '').trim() : '';
}

export function findCliProjectRoot(startDir = process.cwd()) {
  const cwd = path.resolve(startDir);
  // An explicit AgentSam project inside a larger Git checkout owns its own
  // state. Git is the fallback boundary, not an override for that manifest.
  let dir = cwd;
  for (let i = 0; i < 16; i += 1) {
    if (fs.existsSync(path.join(dir, '.agentsam', 'config.json'))) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const gitRoot = gitValue(cwd, ['rev-parse', '--show-toplevel']);
  if (gitRoot) return path.resolve(gitRoot);
  dir = cwd;
  for (let i = 0; i < 16; i += 1) {
    if (fs.existsSync(path.join(dir, '.agentsam', 'cli.json')) || fs.existsSync(path.join(dir, '.agentsam', 'config.json')) || fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}

export function detectCliProject(startDir = process.cwd()) {
  const root = findCliProjectRoot(startDir);
  const config = tryReadProjectConfig(root) || {};
  const pkg = readJson(path.join(root, 'package.json')) || {};
  const branch = gitValue(root, ['branch', '--show-current']);
  const remote = gitValue(root, ['config', '--get', 'remote.origin.url']);
  const project = String(getProjectName(config, pkg.name || path.basename(root)));
  const website = String(pkg.homepage || '').trim();
  return { root, project, branch, remote, website, configured: Boolean(getProjectName(config)) };
}

export function cliPreferencesPath(root) { return path.join(path.resolve(root), '.agentsam', 'cli.json'); }

function safeModelSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const provider = String(value.provider || '').trim();
  const providerModelId = String(value.provider_model_id || '').trim();
  if (!provider || !providerModelId) return null;
  return {
    model_key: String(value.model_key || `${provider}:${providerModelId}`),
    provider,
    provider_model_id: providerModelId,
    label: String(value.label || providerModelId),
    availability: value.availability === 'available' ? 'available' : 'unverified',
    availability_source: String(value.availability_source || ''),
    context_window: Number.isFinite(Number(value.context_window)) && Number(value.context_window) > 0 ? Number(value.context_window) : null,
    context_window_source: String(value.context_window_source || 'unknown'),
    max_output_tokens: Number.isFinite(Number(value.max_output_tokens)) && Number(value.max_output_tokens) > 0 ? Number(value.max_output_tokens) : null,
    max_output_tokens_source: String(value.max_output_tokens_source || 'unknown'),
    reasoning_efforts: Array.isArray(value.reasoning_efforts) && value.reasoning_efforts.length ? value.reasoning_efforts.map(String) : ['auto'],
    service_tiers: Array.isArray(value.service_tiers) && value.service_tiers.length ? value.service_tiers.map(String) : ['default'],
    capabilities: value.capabilities && typeof value.capabilities === 'object' ? { ...value.capabilities } : {},
    pricing: value.pricing && typeof value.pricing === 'object' ? { ...value.pricing } : null,
    context_policy: value.context_policy && typeof value.context_policy === 'object' ? { ...value.context_policy } : null,
    source: value.source && typeof value.source === 'object' ? { ...value.source } : null,
  };
}

function normalizePreferences(value = {}) {
  const modelSnapshot = safeModelSnapshot(value.modelSnapshot);
  return {
    schemaVersion: CLI_PREFERENCES_SCHEMA,
    trustedDirectory: value.trustedDirectory === true,
    runtime: value.runtime || 'local',
    terminal: value.terminal || '',
    modelPreference: value.modelPreference || 'auto',
    modelSnapshot,
    reasoningEffort: value.reasoningEffort || 'auto',
    serviceTier: value.serviceTier || 'default',
    modelAuthority: modelSnapshot?.availability === 'available' ? 'provider-verified' : 'preference-only',
    updatedAt: value.updatedAt || null,
  };
}

export function readCliPreferences(root) {
  const value = readJson(cliPreferencesPath(root));
  if (!value) return null;
  if (value.schemaVersion !== CLI_PREFERENCES_SCHEMA && !LEGACY_CLI_PREFERENCES_SCHEMAS.has(value.schemaVersion)) return null;
  return normalizePreferences(value);
}

export function writeCliPreferences(root, value = {}) {
  const filename = cliPreferencesPath(root);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const previous = readCliPreferences(root) || {};
  const next = normalizePreferences({ ...previous, ...value, updatedAt: new Date().toISOString() });
  fs.writeFileSync(filename, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function updateCliPreferences(root, patch = {}) {
  return writeCliPreferences(root, { ...(readCliPreferences(root) || {}), ...patch });
}
