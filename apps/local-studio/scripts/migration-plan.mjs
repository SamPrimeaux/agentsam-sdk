// @ts-check
/**
 * Migration bookkeeping shared by the two appliers — `scripts/migrate.mjs`
 * (deploy, `readdir`) and `src/lib/db.ts` (PGLite preview, `import.meta.glob`).
 *
 * Applied files are keyed by BASENAME, so the same file applies once no matter
 * which directory it is globbed from. That is what makes the auth schema safe to
 * copy from `backend/migrations/auth/` into `backend/migrations/` when an app turns sign-in on:
 * a database that already has `0001_auth.sql` will not re-run it.
 *
 * Neither applier descends into subdirectories, so `backend/migrations/auth/*.sql` is
 * out of scope for both until it is copied up.
 *
 * ENGINE TAGS: a migration whose first line is `-- agentsam-engine: <engine>`
 * is written for that database engine's lane only. Business-D1 seeds use the
 * SQLite/D1 dialect (`unixepoch()`, `randomblob()`) and assume the deployed D1
 * schema, so they are tagged `d1` and skipped by the Postgres appliers (the
 * embedded PGLite preview and the `pg` deploy path). An untagged migration is
 * engine-neutral and applies everywhere the directory is globbed.
 */

/**
 * The `_migrations` key for a migration path (or bare filename).
 * @param {string} path
 * @returns {string}
 */
export function migrationName(path) {
  return path.split("/").pop() ?? path;
}

/**
 * @param {string} path
 * @returns {boolean}
 */
export function isMigrationFile(path) {
  return path.endsWith(".sql");
}

/** The engine the Postgres appliers (PGLite preview, `pg` deploy) run against. */
export const POSTGRES_ENGINE = "postgres";

/**
 * The engine a migration file is tagged for, or null when it is untagged
 * (engine-neutral). The tag is a first-line `-- agentsam-engine: <engine>` comment.
 * @param {string} contents
 * @returns {string | null}
 */
export function migrationEngine(contents) {
  const firstLine = String(contents ?? "").split("\n", 1)[0] ?? "";
  const match = /^--\s*agentsam-engine:\s*([a-z0-9][a-z0-9_-]*)\s*$/i.exec(firstLine);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Whether a migration's contents may run on the given engine. Untagged
 * migrations are eligible everywhere; a tagged migration runs only on its tag.
 * @param {string} contents
 * @param {string} engine
 * @returns {boolean}
 */
export function isEngineEligible(contents, engine) {
  const tagged = migrationEngine(contents);
  return tagged === null || tagged === engine;
}

/**
 * Migrations in `paths` that are not yet in `applied`, in apply order.
 * Non-`.sql` entries (a `readdir` also yields `backend/migrations/auth/`) are dropped.
 * @param {Iterable<string>} paths
 * @param {Iterable<string>} applied
 * @returns {Array<{ name: string, path: string }>}
 */
export function pendingMigrations(paths, applied) {
  const done = new Set(applied);
  return [...paths]
    .filter(isMigrationFile)
    .map((path) => ({ name: migrationName(path), path }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(({ name }) => !done.has(name));
}
