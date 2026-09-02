import fs from 'node:fs';
import path from 'node:path';

/** Local reference implementation. A store instance belongs to one process. */
export async function openSqliteStore(filename, { readOnly = false } = {}) {
  const { DatabaseSync } = await import('node:sqlite');
  if (readOnly && !fs.existsSync(filename)) return null;
  if (!readOnly) {
    fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    const ignore = path.join(path.dirname(filename), '.gitignore');
    try { fs.writeFileSync(ignore, '*\n', { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  }
  const db = new DatabaseSync(filename, { readOnly });
  db.exec('PRAGMA busy_timeout=5000');
  if (!readOnly) {
    db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS knowledge_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS knowledge_generations (id TEXT PRIMARY KEY, scope TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS knowledge_history ON knowledge_generations(scope, created_at);
      CREATE TABLE IF NOT EXISTS knowledge_active (scope TEXT PRIMARY KEY, id TEXT NOT NULL REFERENCES knowledge_generations(id));
      CREATE TABLE IF NOT EXISTS knowledge_observations (id TEXT PRIMARY KEY, namespace TEXT NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL);`);
    fs.chmodSync(filename, 0o600);
  }
  const decode = row => row ? JSON.parse(row.payload) : null;
  const active = scope => decode(db.prepare('SELECT g.payload FROM knowledge_active a JOIN knowledge_generations g ON a.id=g.id WHERE a.scope=?').get(scope));
  return {
    async active(scope) { return active(scope); },
    async getGeneration(scope, id) { return decode(db.prepare('SELECT payload FROM knowledge_generations WHERE scope=? AND id=?').get(scope, id)); },
    async cacheGet(key) { const row = db.prepare('SELECT value FROM knowledge_cache WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; },
    async cachePut(key, value) { db.prepare('INSERT OR IGNORE INTO knowledge_cache VALUES (?,?)').run(key, JSON.stringify(value)); },
    async publish(generation, expectedId) {
      db.exec('BEGIN IMMEDIATE');
      try {
        if ((active(generation.scope_key)?.id || null) !== expectedId) throw new Error('Index changed concurrently; rerun to publish against the current generation.');
        db.prepare('INSERT INTO knowledge_generations VALUES (?,?,?,?)').run(generation.id, generation.scope_key, generation.created_at, JSON.stringify(generation));
        db.prepare('INSERT INTO knowledge_active VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET id=excluded.id').run(generation.scope_key, generation.id);
        db.exec('COMMIT');
      } catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async history(scope) { return db.prepare('SELECT payload FROM knowledge_generations WHERE scope=? ORDER BY created_at,id').all(scope).map(decode); },
    async observe(namespace, observation) { db.prepare('INSERT INTO knowledge_observations VALUES (?,?,?,?)').run(observation.id, namespace, observation.created_at, JSON.stringify(observation)); },
    async observations(namespace) { return db.prepare('SELECT payload FROM knowledge_observations WHERE namespace=? ORDER BY created_at,id').all(namespace).map(decode); },
    async close() { db.close(); },
  };
}
