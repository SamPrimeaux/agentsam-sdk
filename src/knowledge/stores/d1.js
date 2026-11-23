/**
 * Cloudflare D1 knowledge store. Talks to the project's own D1 database through
 * the user's existing Wrangler login (no env vars, no secrets, no connection URL).
 *
 * D1 caps statements (~100 KB) and rows (~2 MB), so every JSON payload is stored
 * ASCII-escaped and split into small parts in `knowledge_blobs`. Publishing is a
 * single compare-and-swap on `knowledge_active`, so concurrent runs cannot clobber
 * each other.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const PART_CHARS = 40_000;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS knowledge_blobs (owner TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (owner, seq));
CREATE TABLE IF NOT EXISTS knowledge_cache (key TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS knowledge_generations (id TEXT PRIMARY KEY, scope TEXT NOT NULL, created_at TEXT NOT NULL, summary TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS knowledge_history ON knowledge_generations(scope, created_at);
CREATE TABLE IF NOT EXISTS knowledge_active (scope TEXT PRIMARY KEY, id TEXT NOT NULL REFERENCES knowledge_generations(id));
CREATE TABLE IF NOT EXISTS knowledge_observations (id TEXT PRIMARY KEY, namespace TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS knowledge_obs_ns ON knowledge_observations(namespace, created_at);`;

export const d1KnowledgeSchema = SCHEMA;
const lit = (value) => `'${String(value).replace(/'/g, "''")}'`;
const asciiJson = (value) => JSON.stringify(value).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const blobStatements = (owner, value) => {
  const text = asciiJson(value);
  const out = [];
  for (let i = 0, seq = 0; i < text.length || seq === 0; i += PART_CHARS, seq++) {
    out.push(`INSERT OR REPLACE INTO knowledge_blobs VALUES (${lit(owner)}, ${seq}, ${lit(text.slice(i, i + PART_CHARS))});`);
  }
  return out;
};
const summarize = (g) => ({
  files: g.files?.length || 0, chunks: g.chunks?.length || 0,
  provider: g.config?.embedding?.provider || 'none', model: g.config?.embedding?.model || null,
  embedded: Boolean(g.profile_id), source_scope: g.config?.scope || null,
});

/**
 * @param {{ root: string, storage: { database: string, config?: string, environment?: string|null } }} target
 * @param {{ readOnly?: boolean, wrangler?: string, runner?: Function }} [options]
 */
export async function openD1Store(target, { readOnly = false, wrangler, runner = exec } = {}) {
  const { root, storage } = target;
  if (!storage?.database) throw new Error('d1_store_requires_database: run `agentsam index storage d1` to pick this project\'s D1 binding');
  const bin = wrangler || (fs.existsSync(path.join(root, 'node_modules/.bin/wrangler')) ? path.join(root, 'node_modules/.bin/wrangler') : 'wrangler');
  const base = ['d1', 'execute', storage.database, '--remote', '--json'];
  if (storage.config) base.push('--config', path.resolve(root, storage.config));
  if (storage.environment) base.push('--env', storage.environment);

  async function run(sql, { file = false } = {}) {
    let tmp = null;
    const args = [...base];
    if (file) {
      tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-d1-')), 'q.sql');
      fs.writeFileSync(tmp, sql, { mode: 0o600 });
      args.push('--file', tmp);
    } else args.push('--command', sql);
    try {
      const { stdout } = await runner(bin, args, { cwd: root, timeout: 120_000, maxBuffer: 32 * 1024 * 1024, encoding: 'utf8' });
      const parsed = JSON.parse(stdout);
      const blocks = Array.isArray(parsed) ? parsed : [parsed];
      if (blocks.some((b) => b?.success === false)) throw new Error('d1_query_failed');
      return blocks;
    } catch (error) {
      throw new Error(`d1_store_failed:${String(error?.code || error?.message || 'command_failed').slice(0, 80)}`);
    } finally { if (tmp) fs.rmSync(path.dirname(tmp), { recursive: true, force: true }); }
  }
  const rows = async (sql) => (await run(sql)).flatMap((b) => b.results || []);
  const blob = async (owner) => {
    const parts = await rows(`SELECT body FROM knowledge_blobs WHERE owner=${lit(owner)} ORDER BY seq`);
    return parts.length ? JSON.parse(parts.map((p) => p.body).join('')) : null;
  };

  const exists = await rows(`SELECT name FROM sqlite_schema WHERE type='table' AND name='knowledge_generations'`);
  if (!exists.length) {
    if (readOnly) return null;
    await run(SCHEMA, { file: true });
  }

  return {
    async active(scope) {
      const [row] = await rows(`SELECT id FROM knowledge_active WHERE scope=${lit(scope)}`);
      return row ? blob(`gen:${row.id}`) : null;
    },
    async scopeStatus(scope) {
      const [active] = await rows(`SELECT id FROM knowledge_active WHERE scope=${lit(scope)}`);
      const [total] = await rows('SELECT COUNT(*) AS n FROM knowledge_generations');
      return { active_id: active?.id || null, existing_generations: Number(total?.n || 0) };
    },
    async getGeneration(scope, id) {
      const [row] = await rows(`SELECT id FROM knowledge_generations WHERE scope=${lit(scope)} AND id=${lit(id)}`);
      return row ? blob(`gen:${id}`) : null;
    },
    async cacheGet(key) {
      const [row] = await rows(`SELECT key FROM knowledge_cache WHERE key=${lit(key)}`);
      return row ? blob(`cache:${key}`) : null;
    },
    async cachePut(key, value) {
      await run([...blobStatements(`cache:${key}`, value), `INSERT OR IGNORE INTO knowledge_cache VALUES (${lit(key)});`].join('\n'), { file: true });
    },
    async publish(generation, expectedId) {
      const summary = asciiJson(summarize(generation));
      await run([
        ...blobStatements(`gen:${generation.id}`, generation),
        `INSERT OR IGNORE INTO knowledge_generations VALUES (${lit(generation.id)}, ${lit(generation.scope_key)}, ${lit(generation.created_at)}, ${lit(summary)});`,
      ].join('\n'), { file: true });
      // Compare-and-swap: only flips the pointer if nobody published since we read it.
      const guard = expectedId ? `WHERE knowledge_active.id = ${lit(expectedId)}` : 'WHERE 0';
      const swap = await run(`INSERT INTO knowledge_active VALUES (${lit(generation.scope_key)}, ${lit(generation.id)}) ON CONFLICT(scope) DO UPDATE SET id=excluded.id ${guard}`);
      const changes = swap.reduce((n, b) => n + Number(b.meta?.changes || 0), 0);
      if (!changes) throw new Error('Index changed concurrently; rerun to publish against the current generation.');
    },
    async history(scope) {
      const list = await rows(`SELECT id FROM knowledge_generations WHERE scope=${lit(scope)} ORDER BY created_at, id`);
      const out = [];
      for (const row of list) out.push(await blob(`gen:${row.id}`));
      return out;
    },
    async historicalSummaries() {
      const list = await rows('SELECT g.id, g.scope, g.created_at, g.summary, (a.id IS NOT NULL) AS active FROM knowledge_generations g LEFT JOIN knowledge_active a ON a.scope=g.scope AND a.id=g.id ORDER BY g.created_at DESC');
      return list.map((r) => ({ scope_key: r.scope, generation_id: r.id, created_at: r.created_at, ...JSON.parse(r.summary), active: Boolean(r.active) }));
    },
    async observe(namespace, observation) {
      await run([...blobStatements(`obs:${observation.id}`, observation),
        `INSERT INTO knowledge_observations VALUES (${lit(observation.id)}, ${lit(namespace)}, ${lit(observation.created_at)});`].join('\n'), { file: true });
    },
    async observations(namespace) {
      const list = await rows(`SELECT id FROM knowledge_observations WHERE namespace=${lit(namespace)} ORDER BY created_at, id`);
      const out = [];
      for (const row of list) out.push(await blob(`obs:${row.id}`));
      return out;
    },
    async close() {},
  };
}
