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

// A naive source.split(';') breaks on ANY semicolon -- including one
// inside a wrapped comment line's prose ("...available; standalone...")
// and every semicolon inside a CREATE TRIGGER's BEGIN...END body. Both
// happen in real migration files (this one has both). Comment-strip first,
// then split statement-aware: only treat ';' as a terminator outside a
// BEGIN/END block, so a trigger body survives as one statement instead of
// fragmenting into pieces that don't individually look like anything.
function stripSqlComments(source) {
  return source
    .split('\n')
    .map((line) => (line.trim().startsWith('--') ? '' : line))
    .join('\n');
}

function splitSqlStatements(source) {
  const clean = stripSqlComments(source);
  // CASE ... END is also closed by the bare keyword END (no BEGIN of its
  // own) -- a trigger body containing a CASE expression has one more END
  // than BEGIN. Track BEGIN and CASE as the same depth-increasing class so
  // a CASE's END doesn't prematurely close the enclosing trigger's depth.
  const tokens = clean.split(/(\bBEGIN\b|\bCASE\b|\bEND\b|;)/i);
  const statements = [];
  let current = '';
  let depth = 0;
  for (const token of tokens) {
    if (/^(BEGIN|CASE)$/i.test(token)) { depth += 1; current += token; continue; }
    if (/^END$/i.test(token)) { depth = Math.max(0, depth - 1); current += token; continue; }
    if (token === ';' && depth === 0) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }
    current += token;
  }
  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);
  return statements;
}

function isIdempotentSafe(source) {
  const statements = splitSqlStatements(source);
  const IDEMPOTENT_RE = /^(CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS|CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS|CREATE\s+TRIGGER\s+IF\s+NOT\s+EXISTS|PRAGMA)/i;
  return statements.length > 0 && statements.every((stmt) => IDEMPOTENT_RE.test(stmt.trim()));
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
        if (!isIdempotentSafe(source)) throw new Error('migration_checksum_mismatch:' + id);
        // File grew via additive, idempotent statements only (e.g. a new
        // CREATE TABLE IF NOT EXISTS appended for a later feature). Safe to
        // re-run and accept the new checksum rather than hard-lock the CLI.
        db.exec('BEGIN IMMEDIATE');
        try {
          db.exec(source);
          await db.prepare(
            'UPDATE agentsam_schema_migrations SET checksum = ? WHERE id = ?'
          ).bind(checksum, id).run();
          db.exec('COMMIT');
          results.push({ id, filename, status: 'repaired', checksum, previous_checksum: previous.checksum });
          continue;
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          throw new Error('migration_repair_failed:' + id + ':' + (error?.message || error));
        }
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

// Synchronous entry point for the interactive shell. Both runners consume the
// same versioned SQL and checksums; schema ownership stays in migrations/runtime.
export function applyRuntimeMigrationsSync(db, options = {}) {
  const dir = path.resolve(options.migrationsDir || DEFAULT_MIGRATIONS_DIR);
  ensureLedger(db);
  const applied = new Map(db.prepare(
    'SELECT id, applied_at_unix, checksum FROM agentsam_schema_migrations ORDER BY id'
  ).all().map((row) => [String(row.id), row]));
  const results = [];
  for (const filename of migrationFiles(dir)) {
    const id = filename.replace(/\.sql$/i, '');
    const source = fs.readFileSync(path.join(dir, filename), 'utf8');
    const checksum = checksumSource(source);
    const previous = applied.get(id);
    if (previous) {
      if (previous.checksum && previous.checksum !== checksum) {
        if (!isIdempotentSafe(source)) throw new Error('migration_checksum_mismatch:' + id);
        db.exec('BEGIN IMMEDIATE');
        try {
          db.exec(source);
          db.prepare('UPDATE agentsam_schema_migrations SET checksum = ? WHERE id = ?').run(checksum, id);
          db.exec('COMMIT');
          results.push({ id, filename, status: 'repaired', checksum, previous_checksum: previous.checksum });
          continue;
        } catch (error) {
          try { db.exec('ROLLBACK'); } catch {}
          throw new Error('migration_repair_failed:' + id + ':' + (error?.message || error));
        }
      }
      results.push({ id, filename, status: 'already_applied', checksum });
      continue;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(source);
      db.prepare('INSERT INTO agentsam_schema_migrations (id, checksum) VALUES (?, ?)').run(id, checksum);
      db.exec('COMMIT');
      results.push({ id, filename, status: 'applied', checksum });
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw new Error('migration_failed:' + id + ':' + (error?.message || error));
    }
  }
  return Object.freeze({ migrationsDir: dir, total: results.length, applied: results.filter((row) => row.status === 'applied').length, results: Object.freeze(results) });
}

export function runtimeMigrationsDirectory() {
  return DEFAULT_MIGRATIONS_DIR;
}
