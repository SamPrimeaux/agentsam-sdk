import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildInventory } from '../../src/indexing/ingest/inventory.js';

function write(root, rel, text = '') {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

describe('inventory classifies by evidence', () => {
  it('uses source types and git ignore state instead of folder names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-evidence-'));
    try {
      execFileSync('git', ['init', '-q'], { cwd: root });
      write(root, '.gitignore', '.sites-runtime/\n');
      write(root, 'app/page.tsx', 'export default function P() { return null; }\n');
      write(root, 'db/schema.sql', 'create table t (id integer);\n');
      write(root, 'drizzle/0001.sql', 'alter table t add column x text;\n');
      write(root, 'plans/roadmap.md', '# plan\n');
      write(root, 'public/logo.png', 'x');
      write(root, '.sites-runtime/cache/blob.bin', 'x'.repeat(2048));

      const inventory = buildInventory({ root });
      const categories = inventory.categories;
      for (const name of ['app', 'db', 'drizzle']) assert.ok(categories.source.includes(name), name);
      assert.ok(categories.docs.includes('plans'));
      assert.ok(categories.assets.includes('public'));
      assert.ok(categories.operational.includes('.sites-runtime'));
      assert.deepEqual(categories.unknown, []);
      assert.equal(inventory.counts.files, 6, 'ignored runtime contents do not consume the scan budget');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
