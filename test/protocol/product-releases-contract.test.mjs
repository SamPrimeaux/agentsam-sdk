import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sqlPath = path.join(root, 'migrations/runtime/0011_agentsam_product_releases.sql');
const readmePath = path.join(root, 'protocol/product-releases/README.md');

test('product release migration creates registry and rejects bad desktop rows', () => {
  const sql = readFileSync(sqlPath, 'utf8');
  const db = new DatabaseSync(':memory:');
  db.exec(sql);

  db.prepare(
    `INSERT INTO agentsam_product_releases (
       id, product_slug, desktop_app_id, version, channel, release_status,
       artifact_kind, target, arch, r2_bucket, r2_key, artifact_url, signature, sha256
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'prel_test1',
    'agentsam-local-studio',
    'local-studio',
    '2.6.6',
    'test',
    'published',
    'desktop_native',
    'macos',
    'aarch64',
    'agentsam-os-blueprint-content',
    'native/test/local-studio/macos/aarch64/2.6.6/app.dmg',
    'https://example.test/downloads/test/local-studio/macos/aarch64/2.6.6/app.dmg',
    'untrusted comment: minisign stub\nSIG',
    'abc123',
  );

  const row = db.prepare(
    `SELECT version, artifact_url, signature FROM agentsam_product_releases
     WHERE desktop_app_id = ? AND artifact_kind = 'desktop_native'
       AND channel = 'test' AND target = 'macos' AND arch = 'aarch64'
       AND release_status = 'published'
     ORDER BY created_at_unix DESC LIMIT 1`,
  ).get('local-studio');
  assert.equal(row.version, '2.6.6');
  assert.match(row.artifact_url, /2\.6\.6/);

  assert.throws(() => {
    db.prepare(
      `INSERT INTO agentsam_product_releases (
         id, product_slug, version, artifact_kind, r2_bucket, r2_key
       ) VALUES (?,?,?,?,?,?)`,
    ).run('prel_bad', 'agentsam-local-studio', '9.0.0', 'desktop_native', 'b', 'k');
  });
});

test('theme zip release can omit target/arch', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(sqlPath, 'utf8'));
  db.prepare(
    `INSERT INTO agentsam_product_releases (
       id, product_slug, sku, version, channel, release_status, artifact_kind,
       r2_bucket, r2_key, sha256, preview_url
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    'prel_theme1',
    'violet',
    'iam.theme.violet',
    '2.6.13',
    'preview',
    'staged',
    'theme_zip',
    'theme-store',
    'theme-packages/violet/2.6.13/deadbeef.zip',
    'deadbeef',
    'https://themes.inneranimalmedia.com/theme-packages/violet/2.6.13/preview/',
  );
  const n = db.prepare(`SELECT COUNT(*) AS n FROM agentsam_product_releases`).get().n;
  assert.equal(n, 1);
});

test('protocol README forbids desktop_shell_releases and plugin overload', () => {
  const text = readFileSync(readmePath, 'utf8');
  assert.match(text, /agentsam_product_releases/);
  assert.match(text, /agentsam_products/);
  assert.match(text, /desktop_shell_releases/);
  assert.match(text, /do \*\*not\*\* apply|Do \*\*not\*\* create `desktop_shell_releases`/i);
  assert.match(text, /agentsam_plugins/);
});
