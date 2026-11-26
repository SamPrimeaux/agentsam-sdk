import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { registeredEmbed, readRegisteredEmbedRuntime } from '../backend/cms/registered-embed.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(appRoot, '../..');
const embedsRoot = path.join(repoRoot, 'packages/agentsam-embeds');
const releaseRoot = path.join(embedsRoot, 'dist/releases/customer-account-portal');
const buildScript = path.join(embedsRoot, 'scripts/build-customer-account-portal-release.mjs');
const migrationGenerator = path.join(embedsRoot, 'scripts/generate-customer-account-portal-registration.mjs');
const migrationPath = path.join(repoRoot, 'apps/local-studio/backend/migrations/1388_customer_account_portal_embed.sql');

function d1(sqlite) {
  return {
    prepare(sql) {
      let params = [];
      const statement = {
        bind(...values) { params = values; return statement; },
        async first() { return sqlite.prepare(sql).get(...params) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...params) }; },
        async run() { const result = sqlite.prepare(sql).run(...params); return { meta: { changes: result.changes } }; },
      };
      return statement;
    },
  };
}

function createRegistryDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY);
    CREATE TABLE cms_definitions (
      id TEXT PRIMARY KEY DEFAULT ('cmsd_' || lower(hex(randomblob(8)))),
      account_id TEXT NOT NULL REFERENCES accounts(id), definition_key TEXT NOT NULL,
      kind TEXT NOT NULL, label TEXT NOT NULL, description TEXT, category TEXT,
      origin TEXT NOT NULL, version TEXT NOT NULL DEFAULT '1', settings_schema_json TEXT NOT NULL DEFAULT '{}',
      allowed_blocks_json TEXT NOT NULL DEFAULT '[]', metadata_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT(datetime('now')),
      updated_at TEXT NOT NULL DEFAULT(datetime('now')), UNIQUE(account_id,kind,definition_key,version)
    );
    CREATE TABLE cms_component_templates (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))), sku TEXT UNIQUE NOT NULL,
      template_name TEXT NOT NULL, template_type TEXT NOT NULL, category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', label TEXT, tags TEXT NOT NULL DEFAULT '[]',
      template_data TEXT NOT NULL DEFAULT '{}', is_system INTEGER DEFAULT 1,
      created_at TEXT DEFAULT(datetime('now')), updated_at TEXT DEFAULT(datetime('now')),
      item_type TEXT, definition_id TEXT REFERENCES cms_definitions(id), definition_key TEXT,
      definition_version TEXT, editor_schema_json TEXT NOT NULL DEFAULT '{}',
      compatibility_json TEXT NOT NULL DEFAULT '{}', responsive_schema_json TEXT NOT NULL DEFAULT '{}',
      data_bindings_json TEXT NOT NULL DEFAULT '{}', preview_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE cms_components (
      id TEXT PRIMARY KEY DEFAULT ('cmp_' || lower(hex(randomblob(8)))),
      definition_id TEXT NOT NULL UNIQUE REFERENCES cms_definitions(id) ON DELETE RESTRICT,
      renderer_key TEXT NOT NULL, delivery_mode TEXT NOT NULL DEFAULT 'bundled',
      package_ref TEXT, source_ref TEXT, artifact_r2_bucket TEXT, artifact_r2_key TEXT, artifact_sha256 TEXT,
      capabilities_json TEXT NOT NULL DEFAULT '{}', compatibility_json TEXT NOT NULL DEFAULT '{}',
      verification_json TEXT NOT NULL DEFAULT '{}', implementation_status TEXT NOT NULL DEFAULT 'unverified',
      created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now'))
    );
  `);
  sqlite.prepare('INSERT INTO accounts (id) VALUES (?)').run('system-account');
  sqlite.prepare(`INSERT INTO cms_definitions (account_id,definition_key,kind,label,origin,version,status)
    VALUES ('system-account','existing-stock-block','block','Existing stock block','built_in','1.0.0','active')`).run();
  return sqlite;
}

test('customer account portal registers as a verified global storefront embed and its immutable R2 artifact loads', async () => {
  execFileSync(process.execPath, [buildScript, releaseRoot, '1.0.1'], { cwd: repoRoot, stdio: 'pipe' });
  execFileSync(process.execPath, [migrationGenerator, '1.0.1'], { cwd: repoRoot, stdio: 'pipe' });

  const sqlite = createRegistryDb();
  try {
    const migration = await readFile(migrationPath, 'utf8');
    sqlite.exec(migration);
    sqlite.exec(migration);

    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM cms_definitions WHERE definition_key='customer_account_portal'").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM cms_component_templates WHERE sku='SKU-EMB-CUSTOMER-ACCOUNT-PORTAL'").get().count, 1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM cms_components WHERE renderer_key='agentsam-embeds:customer-account-portal'").get().count, 1);

    const template = await registeredEmbed({ DB: d1(sqlite) }, 'merchant-account', 'customer_account_portal');
    assert.ok(template);
    assert.equal(template.registration.artifactReady, true);
    assert.equal(template.registration.previewOnly, false);
    assert.equal(template.registration.element, 'agentsam-customer-account-portal');
    assert.equal(template.default_config.enabled, false);

    const runtime = await readRegisteredEmbedRuntime(template, async (url) => {
      const key = new URL(url).pathname.replace(/^\//, '');
      const bytes = await readFile(path.join(releaseRoot, key));
      return new Response(bytes, { status: 200 });
    });
    assert.equal(runtime.previewOnly, false);
    assert.equal(runtime.element, 'agentsam-customer-account-portal');
    assert.match(runtime.source, /agentsam-customer-account-portal/);
  } finally {
    sqlite.close();
  }
});
