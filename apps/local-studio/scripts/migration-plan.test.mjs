import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  isEngineEligible,
  isMigrationFile,
  migrationEngine,
  migrationName,
  pendingMigrations,
  POSTGRES_ENGINE,
} from "./migration-plan.mjs";
import { projectRoot } from "./with-app-env.mjs";

const AUTH_MIGRATION = "0001_auth.sql";

/**
 * The auth-on copy of the Better Auth schema and its source, or null when the
 * app has not turned sign-in on (the shipped state).
 */
function authSchemaCopy(root) {
  const copy = join(root, "backend", "migrations", AUTH_MIGRATION);
  const source = join(root, "backend", "migrations", "auth", AUTH_MIGRATION);
  if (!existsSync(copy) || !existsSync(source)) return null;
  return { copy: readFileSync(copy, "utf8"), source: readFileSync(source, "utf8") };
}

test("_migrations keys on basename, not path", () => {
  assert.equal(migrationName("/migrations/0002_todos.sql"), "0002_todos.sql");
  assert.equal(migrationName("migrations/auth/0001_auth.sql"), "0001_auth.sql");
  assert.equal(migrationName("0001_auth.sql"), "0001_auth.sql");
});

test("a file already applied from another directory does not re-apply", () => {
  // The auth-on path copies backend/migrations/auth/0001_auth.sql into the globbed
  // directory; a database that already has it must not run it twice.
  assert.deepEqual(pendingMigrations(["/migrations/0001_auth.sql"], ["0001_auth.sql"]), []);
});

test("pending migrations are returned in name order", () => {
  assert.deepEqual(
    pendingMigrations(
      ["/migrations/0003_c.sql", "/migrations/0001_a.sql", "/migrations/0002_b.sql"],
      ["0001_a.sql"],
    ),
    [
      { name: "0002_b.sql", path: "/migrations/0002_b.sql" },
      { name: "0003_c.sql", path: "/migrations/0003_c.sql" },
    ],
  );
});

test("non-.sql entries are dropped (readdir also yields the auth/ directory)", () => {
  assert.equal(isMigrationFile("auth"), false);
  assert.deepEqual(pendingMigrations(["auth", "README.md"], []), []);
});

test("engine tags gate a migration to its own lane", () => {
  const d1Seed = "-- agentsam-engine: d1\ninsert into company (created_at) values (unixepoch());\n";
  assert.equal(migrationEngine(d1Seed), "d1");
  assert.equal(isEngineEligible(d1Seed, POSTGRES_ENGINE), false);
  assert.equal(isEngineEligible(d1Seed, "d1"), true);

  // Untagged migrations are engine-neutral and apply everywhere.
  assert.equal(migrationEngine("create table todos (id text primary key);\n"), null);
  assert.equal(isEngineEligible("select 1;\n", POSTGRES_ENGINE), true);

  // The tag must be the first line — a marker mid-file is just prose.
  assert.equal(migrationEngine("-- plain header\n-- agentsam-engine: d1\nselect 1;\n"), null);
});

test("D1-dialect seeds in the globbed directory carry the engine tag", () => {
  // An untagged D1-dialect file (unixepoch/randomblob, or schema that only the
  // deployed business D1 has) breaks the embedded-Postgres preview at startup —
  // the exact regression that killed `npm run dev` on a fresh checkout.
  const migrationsDir = join(projectRoot(), "backend", "migrations");
  for (const entry of readdirSync(migrationsDir)) {
    if (!isMigrationFile(entry)) continue;
    const contents = readFileSync(join(migrationsDir, entry), "utf8");
    const dialect = /\bunixepoch\s*\(|\brandomblob\s*\(/i.test(contents);
    const engine = migrationEngine(contents);
    if (dialect || engine !== null) {
      assert.equal(
        engine,
        "d1",
        `${entry} is engine-tagged or D1-dialect and must be tagged 'agentsam-engine: d1' so Postgres appliers skip it`,
      );
    }
  }
});

test("the auth schema ships outside the globbed directory", () => {
  const migrationsDir = join(projectRoot(), "backend", "migrations");
  const rootMigrations = pendingMigrations(readdirSync(migrationsDir), []);
  assert.equal(rootMigrations.some(({ name }) => name === AUTH_MIGRATION), false);
  assert.ok(rootMigrations.every(({ name }) => name.endsWith(".sql")));
  assert.ok(readdirSync(join(migrationsDir, "auth")).includes(AUTH_MIGRATION));
});

test("this workspace's auth schema copy is byte-identical to its source", () => {
  // An edited copy diverges silently: basename keying skips it on a database
  // that already ran the original, and applies it on a fresh PGLite preview.
  const pair = authSchemaCopy(projectRoot());
  if (pair === null) return; // sign-in off — nothing has been copied up
  assert.equal(
    pair.copy,
    pair.source,
    "backend/migrations/0001_auth.sql has been edited — it must stay a verbatim copy of backend/migrations/auth/0001_auth.sql",
  );
});

test("the copy check reads both files and catches an edit", () => {
  const root = mkdtempSync(join(tmpdir(), "auth-schema-"));
  mkdirSync(join(root, "backend", "migrations", "auth"), { recursive: true });
  writeFileSync(join(root, "backend", "migrations", "auth", AUTH_MIGRATION), "create table t ();\n");
  assert.equal(authSchemaCopy(root), null);

  writeFileSync(join(root, "backend", "migrations", AUTH_MIGRATION), "create table t ();\n");
  const same = authSchemaCopy(root);
  assert.equal(same.copy, same.source);

  writeFileSync(join(root, "backend", "migrations", AUTH_MIGRATION), "create table t (x int);\n");
  const drifted = authSchemaCopy(root);
  assert.notEqual(drifted.copy, drifted.source);
});
