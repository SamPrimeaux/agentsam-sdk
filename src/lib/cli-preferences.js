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
  const gitRoot = gitValue(cwd, ['rev-parse', '--show-toplevel']);
  if (gitRoot) return path.resolve(gitRoot);
  let dir = cwd;
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

function normalizePreferences(value = {}) {
  return {
    schemaVersion: CLI_PREFERENCES_SCHEMA,
    trustedDirectory: value.trustedDirectory === true,
    runtime: value.runtime || 'local',
    terminal: value.terminal || '',
    modelPreference: value.modelPreference || 'auto',
    reasoningEffort: value.reasoningEffort || 'auto',
    serviceTier: value.serviceTier || 'default',
    modelAuthority: 'preference-only',
    updatedAt: value.updatedAt || null,
  };
}

export function readCliPreferences(root) {
  const value = readJson(cliPreferencesPath(root));
  if (!value) return null;
  if (value.schemaVersion !== CLI_PREFERENCES_SCHEMA && value.schemaVersion !== LEGACY_CLI_PREFERENCES_SCHEMA) return null;
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
