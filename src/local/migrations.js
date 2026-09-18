import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'migrations',
  'runtime',
);

function migrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^\d+.*\.sql$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function ensureLedger(db) {
  db.exec(`
CREATE TABLE IF NOT EXISTS agentsam_schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at_unix INTEGER NOT NULL DEFAULT (unixepoch()),
  checksum TEXT
);
`);
}

function checksumSource(source) {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 'fnv1a32:' + (hash >>> 0).toString(16).padStart(8, '0');
}

export async function listAppliedMigrations(db) {
  ensureLedger(db);
  const result = await db.prepare(
    'SELECT id, applied_at_unix, checksum FROM agentsam_schema_migrations ORDER BY id'
  ).all();
  return result.results || [];
}

export async function applyRuntimeMigrations(db, options = {}) {
  const dir = path.resolve(options.migrationsDir || DEFAULT_MIGRATIONS_DIR);
  ensureLedger(db);
  const appliedRows = await listAppliedMigrations(db);
  const applied = new Map(appliedRows.map((row) => [String(row.id), row]));
  const results = [];

  for (const filename of migrationFiles(dir)) {
    const id = filename.replace(/\.sql$/i, '');
    const source = fs.readFileSync(path.join(dir, filename), 'utf8');
    const checksum = checksumSource(source);
    const previous = applied.get(id);

    if (previous) {
      if (previous.checksum && previous.checksum !== checksum) {
        throw new Error('migration_checksum_mismatch:' + id);
      }
      results.push({ id, filename, status: 'already_applied', checksum });
      continue;
    }

    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(source);
      await db.prepare(
        'INSERT INTO agentsam_schema_migrations (id, checksum) VALUES (?, ?)'
      ).bind(id, checksum).run();
      db.exec('COMMIT');
      results.push({ id, filename, status: 'applied', checksum });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw new Error('migration_failed:' + id + ':' + (error?.message || error));
    }
  }

  return Object.freeze({
    migrationsDir: dir,
    total: results.length,
    applied: results.filter((row) => row.status === 'applied').length,
    results: Object.freeze(results),
  });
}

export function runtimeMigrationsDirectory() {
  return DEFAULT_MIGRATIONS_DIR;
}
