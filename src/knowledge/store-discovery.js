import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_PATH, readConfig, validateConfig, defaultConfig } from './config.js';
import { parseWranglerTomlBindings } from './wrangler-binding-discovery.js';
import { findCliProjectRoot } from '../lib/cli-preferences.js';
import { runtimeDatabasePath } from '../local/runtime-store.js';
import { getRepositoryId, portableRepositoryIdFromGit, tryReadProjectConfig } from '../lib/project-config.js';

// Configuration evidence only. No connection probes, credential reads, or schema writes.
export async function discoverProjectStores(cwd, env = process.env) {
  const root = findCliProjectRoot(cwd);
  const config = fs.existsSync(path.join(root, CONFIG_PATH)) ? readConfig(root) : null;
  const candidates = [
    { id: 'runtime:sqlite', driver: 'sqlite', role: 'runtime', path: runtimeDatabasePath(root), selected: true },
    { id: 'knowledge:sqlite', driver: 'sqlite', role: 'knowledge', path: path.join(root, '.agentsam/knowledge/index.sqlite'), selected: !config || config.storage.driver === 'sqlite', selectable: true },
  ];
  // Postgres is opt-in: only a connection_env the project explicitly configured is considered.
  const envNames = new Set([config?.storage?.connection_env].filter(Boolean));
  for (const name of envNames) {
    if (!Object.hasOwn(env, name) && name !== config?.storage?.connection_env) continue;
    candidates.push({ id: `knowledge:postgres:${name}`, driver: 'postgres', role: 'knowledge', connection_env: name, configured: Boolean(env[name]), selected: config?.storage?.driver === 'postgres' && config.storage.connection_env === name, selectable: true });
  }
  const warnings = [];
  let visited = 0;
  const skip = new Set(['node_modules', '.git', '.agentsam', '.output', 'dist', 'build', 'vendor', '.wrangler']);
  const configs = [];
  function scan(dir, depth) {
    if (depth > 5 || visited >= 4000) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (++visited >= 4000) break;
      if (entry.isSymbolicLink() || skip.has(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) scan(file, depth + 1);
      else if (['wrangler.json', 'wrangler.jsonc'].includes(entry.name)) configs.push(file);
      else if (entry.name === 'wrangler.toml') configs.push(file);
    }
  }
  scan(root, 0);
  if (visited >= 4000) warnings.push('Discovery reached its 4000-entry bound; inspect additional config paths explicitly.');
  if (configs.length) {
    const { parseConfigFileTextToJson } = await import('typescript');
    for (const file of configs) {
      const source = path.relative(root, file);
      if (fs.statSync(file).size > 1024 * 1024) { warnings.push(`${source}: configuration too large`); continue; }
      const contents=fs.readFileSync(file, 'utf8');
      if (file.endsWith('.toml')) {
        candidates.push(...parseWranglerTomlBindings(contents, source));
        continue;
      }
      const parsed = parseConfigFileTextToJson(file, contents);
      if (parsed.error) { warnings.push(`${source}: invalid JSONC`); continue; }
      const add = (cfg, environment = null) => {
        for (const [key, driver, label] of [['d1_databases', 'd1', 'database_name'], ['hyperdrive', 'postgres-hyperdrive', 'id'], ['r2_buckets', 'r2', 'bucket_name'], ['vectorize','vectorize','index_name'], ['kv_namespaces','kv','id']]) {
          for (const binding of Array.isArray(cfg?.[key]) ? cfg[key] : []) {
            candidates.push({ id: `${source}:${environment || 'default'}:${binding.binding}`, driver, role: 'application', binding: binding.binding, name: binding[label], source, environment, selectable: false, status: 'declared; connectivity not verified' });
          }
        }
      };
      add(parsed.config);
      for (const [environment, cfg] of Object.entries(parsed.config?.env || {})) add(cfg, environment);
    }
  }
  return { root, candidates, warnings, knowledge_config: CONFIG_PATH };
}

export async function resolveD1Storage(cwd, selector) {
  const found = (await discoverProjectStores(cwd)).candidates.filter((c) => c.driver === 'd1' && c.role === 'application' && c.name);
  const pick = selector ? found.filter((c) => c.binding === selector || c.name === selector) : found;
  if (pick.length !== 1) {
    const names = found.map((c) => `${c.binding} (${c.name})`).join(', ');
    throw new Error(pick.length ? `d1_binding_ambiguous: choose one of ${names}; e.g. /db select knowledge d1 <binding>` : `d1_binding_not_found: ${found.length ? `declared bindings: ${names}` : 'no D1 database is declared in this project\'s wrangler config'}`);
  }
  const [d1] = pick;
  return { driver: 'd1', database: d1.name, binding: d1.binding, config: d1.source, ...(d1.environment ? { environment: d1.environment } : {}) };
}

export async function selectKnowledgeStore(cwd, driver, selector) {
  const root = findCliProjectRoot(cwd);
  if (!['sqlite', 'd1', 'postgres'].includes(driver)) throw new Error('knowledge_store_adapter_unavailable: choose sqlite, d1 or postgres');
  const filename = path.join(root, CONFIG_PATH);
  let config;
  if (fs.existsSync(filename)) config = readConfig(root);
  else {
    const repositoryId = getRepositoryId(tryReadProjectConfig(root)) || portableRepositoryIdFromGit(root);
    if (!repositoryId) throw new Error('repository_identity_required: run agentsam init . --yes first');
    config = defaultConfig({ repositoryId });
  }
  if (driver === 'd1') {
    config.storage = await resolveD1Storage(cwd, selector);
  } else if (driver === 'postgres') {
    if (!selector) throw new Error('postgres_connection_env_required: Postgres is opt-in; name the environment variable that holds your connection string, e.g. agentsam db storage postgres MY_DATABASE_URL');
    config.storage = { driver, connection_env: selector };
  } else config.storage = { driver };
  config = validateConfig(config);
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temp = `${filename}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(temp, filename);
  return { storage: config.storage, config: CONFIG_PATH, next: driver === 'postgres' ? 'agentsam index setup-store' : 'agentsam index run', note: 'Selection saved. Existing data remains in its original store; no migration or connection probe ran.' };
}
