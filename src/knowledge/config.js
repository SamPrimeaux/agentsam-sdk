import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const CONFIG_PATH = '.agentsam/knowledge.json';
export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const fingerprint = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
export function repositoryRoot(cwd = process.cwd()) {
  const root = fs.realpathSync(cwd);
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return root; }
}
export function gitEvidence(root) {
  const read = args => { try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; } };
  return { commit: read(['rev-parse', 'HEAD']), branch: read(['branch', '--show-current']), dirty: Boolean(read(['status', '--porcelain'])) };
}
function relativeSelection(value) {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || value.includes('\\') || /[*?\[\]\0]/.test(value)) throw new Error('Scope entries must be literal relative files/directories, not globs.');
  const clean = value.replace(/^\.\//, '').replace(/\/$/, '') || '.';
  if (clean.split('/').includes('..')) throw new Error('Scope paths cannot escape the repository.');
  return clean;
}
export function validateConfig(input) {
  const c = structuredClone(input);
  const allowed = (object, keys, label) => {
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error(`${label} must be an object.`);
    for (const key of Object.keys(object)) if (!keys.includes(key)) throw new Error(`Unknown ${label} field: ${key}`);
  };
  allowed(c, ['version', 'repository_id', 'workspace_id', 'scope', 'chunking', 'embedding', 'storage'], 'configuration');
  allowed(c.scope, ['name', 'include', 'exclude'], 'scope');
  allowed(c.chunking, ['max_chars'], 'chunking');
  allowed(c.embedding, ['provider', 'model', 'revision', 'dimensions', 'parameters'], 'embedding');
  allowed(c.storage, ['driver', 'connection_env'], 'storage');
  if (c.version !== 1) throw new Error('Unsupported knowledge configuration version.');
  for (const key of ['repository_id', 'workspace_id']) if (typeof c[key] !== 'string' || !c[key].trim()) throw new Error(`${key} is required.`);
  if (typeof c.scope?.name !== 'string' || !c.scope.name.trim() || !Array.isArray(c.scope.include) || !c.scope.include.length) throw new Error('A named scope with at least one include path is required.');
  c.scope.include = [...new Set(c.scope.include.map(relativeSelection))].sort();
  c.scope.exclude = [...new Set((c.scope.exclude || []).map(relativeSelection))].sort();
  if (!Number.isInteger(c.chunking?.max_chars) || c.chunking.max_chars < 256 || c.chunking.max_chars > 12000) throw new Error('chunking.max_chars must be 256..12000.');
  const e = c.embedding;
  if (!e || ['provider', 'model', 'revision'].some(k => typeof e[k] !== 'string' || !e[k].trim()) || !Number.isInteger(e.dimensions) || e.dimensions < 1 || e.dimensions > 3072) throw new Error('Embedding provider, model, revision and dimensions (1..3072) are required.');
  if (!e.parameters || typeof e.parameters !== 'object' || Array.isArray(e.parameters)) throw new Error('Embedding parameters must be an object.');
  if (!['sqlite', 'postgres'].includes(c.storage?.driver)) throw new Error('storage.driver must be sqlite or postgres.');
  if (c.storage.driver === 'postgres' && !/^[A-Z_][A-Z0-9_]*$/.test(c.storage.connection_env || '')) throw new Error('Postgres requires a connection_env name, never a connection string in config.');
  return c;
}
export function defaultConfig({ include = ['.'], exclude = [], scope = 'default', workspace = 'local', target = 'local', dimensions = 768 } = {}) {
  if (!['local', 'production'].includes(target)) throw new Error('target must be local or production.');
  if (target === 'production' && workspace === 'local') throw new Error('Production requires an explicit workspace identifier.');
  return validateConfig({ version: 1, repository_id: randomUUID(), workspace_id: workspace,
    scope: { name: scope, include, exclude }, chunking: { max_chars: 4000 },
    embedding: { provider: 'gemini', model: 'gemini-embedding-2', revision: '1', dimensions, parameters: { task: 'code retrieval' } },
    storage: target === 'local' ? { driver: 'sqlite' } : { driver: 'postgres', connection_env: 'AGENTSAM_DATABASE_URL' } });
}
export function readConfig(root) { return validateConfig(JSON.parse(fs.readFileSync(path.join(root, CONFIG_PATH), 'utf8'))); }
export function initRepository(root, options = {}) {
  const config = defaultConfig(options);
  const target = path.join(root, CONFIG_PATH);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return config;
}
export const scopeKey = config => fingerprint([config.workspace_id, config.repository_id, config.scope.name]);
export const cacheNamespace = config => fingerprint([config.workspace_id, config.repository_id]);
