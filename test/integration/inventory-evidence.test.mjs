import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildInventory } from '../../src/indexing/ingest/inventory.js';
import {
  extractStyleEvidence,
  finalizeStyleEvidence,
  mergeStyleEvidence,
} from '../../src/indexing/ingest/style-evidence.js';
import { inventory as knowledgeInventory } from '../../src/knowledge/source.js';

function write(root, rel, text = '') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

describe('inventory classifies by evidence', () => {
  it('uses dominant evidence, root files, tooling LOC, and git ignore state', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-evidence-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      write(root, '.gitignore', '.sites-runtime/\n');

      write(root, 'app/page.tsx', Array.from({ length: 30 }, (_, i) => `export const x${i} = ${i};`).join('\n'));
      write(root, 'db/schema.sql', 'create table t (id integer);\n');
      write(root, 'drizzle/meta/_journal.json', '{"version":"1"}\n');
      for (let i = 1; i <= 9; i += 1) write(root, `plans/p${i}.md`, `# plan ${i}\ntext\n`);
      write(root, 'plans/schema.sql', 'create table plan (id integer);\n');
      write(root, 'public/logo.png', 'x');
      write(root, 'scripts/harvest.py', Array.from({ length: 80 }, (_, i) => `x_${i} = ${i}`).join('\n'));
      write(root, '.sites-runtime/cache/blob.bin', 'x'.repeat(2048));

      write(root, 'package.json', '{"name":"fixture"}\n');
      write(root, 'wrangler.jsonc', '{}\n');
      write(root, 'drizzle.config.ts', 'export default {};\n');
      write(root, 'README.md', '# Fixture\n');
      write(root, 'entry.ts', 'export const root = true;\n');
      write(root, 'package-lock.json', '{"lockfileVersion":3}\n');
      write(root, '.env', 'SECRET=do-not-index\n');
      write(root, '.dev.vars', 'TOKEN=do-not-index\n');
      write(root, 'tls.pem', 'private material\n');

      execFileSync('git', ['add', '.'], { cwd: root });

      const inventory = buildInventory({ root });
      const categories = inventory.categories;

      assert.ok(categories.source.includes('app'));
      assert.ok(categories.source.includes('db'));
      assert.ok(categories.docs.includes('plans'), '9 markdown + 1 SQL is dominantly docs');
      assert.ok(categories.data.includes('drizzle'), 'JSON-only drizzle metadata is data');
      assert.ok(categories.assets.includes('public'));
      assert.ok(categories.operational.includes('.sites-runtime'));
      assert.ok(categories.tooling.includes('scripts'));
      assert.deepEqual(categories.unknown, []);

      assert.ok(inventory.suggested.include.includes('scripts'), 'tracked top-2 language tooling is promoted');
      assert.ok(inventory.top_level_details.scripts.loc >= 80);
      assert.equal(inventory.top_level_details.scripts.dominant_language, 'Python');

      assert.ok(inventory.root_files.manifest.includes('package.json'));
      assert.ok(inventory.root_files.manifest.includes('wrangler.jsonc'));
      assert.ok(inventory.root_files.manifest.includes('drizzle.config.ts'));
      assert.ok(inventory.root_files.docs.includes('README.md'));
      assert.ok(inventory.root_files.source.includes('entry.ts'));
      assert.ok(inventory.root_files.lockfile.includes('package-lock.json'));
      assert.ok(inventory.root_files.secret.includes('.env'));
      assert.ok(inventory.root_files.secret.includes('.dev.vars'));
      assert.ok(inventory.root_files.secret.includes('tls.pem'));

      for (const wanted of ['package.json', 'wrangler.jsonc', 'drizzle.config.ts', 'README.md', 'entry.ts']) {
        assert.ok(inventory.suggested.include_files.includes(wanted), wanted);
      }
      for (const forbidden of ['package-lock.json', '.env', '.dev.vars', 'tls.pem']) {
        assert.ok(!inventory.suggested.include_files.includes(forbidden), forbidden);
      }

      const files = knowledgeInventory(root, { include: ['.'], exclude: [] });
      assert.ok(files.includes('entry.ts'));
      assert.ok(!files.includes('.env'));
      assert.ok(!files.includes('.dev.vars'));
      assert.ok(!files.includes('tls.pem'));
      assert.ok(!files.includes('package-lock.json'));
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('detects coherent theme signatures from markup and CSS evidence', () => {
    const evidence = extractStyleEvidence(`
      <html data-theme-preset="fuel-free-time" data-header-preset="adaptive-bar">
        <link rel="stylesheet" href="/css/heuristic-theme.css">
        <body>
          <header class="fnf-header fnf-header--adaptive-bar">
            <a class="fnf-logo"></a>
            <nav class="fnf-primary"></nav>
          </header>
        </body>
      </html>
      <style>
        :root { --fnf-accent: #ff4d00; --fnf-logo-height: 58px; }
        .fnf-header { color: var(--fnf-accent); }
        .fnf-logo { height: var(--fnf-logo-height); }
      </style>
    `);

    assert.equal(evidence.theme_presets['fuel-free-time'], 1);
    assert.equal(evidence.header_presets['adaptive-bar'], 1);
    assert.equal(evidence.stylesheets['/css/heuristic-theme.css'], 1);
    const fnf = evidence.namespaces.find((row) => row.prefix === 'fnf');
    assert.ok(fnf);
    assert.ok(fnf.signal_kinds >= 2);
    assert.ok(fnf.signals.class_tokens >= 3);
    assert.ok(fnf.signals.custom_properties >= 2);

    const final = finalizeStyleEvidence(mergeStyleEvidence(null, evidence));
    const finalFnf = final.namespaces.find((row) => row.prefix === 'fnf');
    assert.equal(final.theme_candidate, true);
    assert.equal(finalFnf?.candidate, true);
  });
});
