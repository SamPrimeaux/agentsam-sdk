import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { initRepository } from '../../src/knowledge/config.js';
import { knowledgeIndex, knowledgeSearch, knowledgeGenerationStatus } from '../../src/capabilities/knowledge-operations.js';

test('cached source hits verify current bytes and become stale after changes without reindexing', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sam-knowledge-fresh-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  fs.mkdirSync(path.join(root, 'src'));
  const source = path.join(root, 'src', 'hello.js');
  fs.writeFileSync(source, 'export function durableSignal(){ return "source-original"; }\n');
  initRepository(root, { include: ['src'], exclude: [], repositoryId: 'freshness-fixture' });

  const indexed = await knowledgeIndex({ mode: 'run', max_inputs: 10, max_characters: 40000 }, root);
  assert.equal(indexed.ok, true);
  const status = await knowledgeGenerationStatus(root);
  assert.equal(status.available, true);
  const original = await knowledgeSearch({ query: 'durableSignal', top_k: 5, token_budget: 1000 }, root);
  assert.equal(original.hits.length, 1);
  assert.equal(original.hits[0].stale, false);
  assert.match(original.hits[0].metadata.freshness, /hash verified/);

  fs.writeFileSync(source, 'export function durableSignal(){ return "source-updated"; }\n');
  const changed = await knowledgeSearch({ query: 'durableSignal', top_k: 5, token_budget: 1000 }, root);
  assert.equal(changed.hits.length, 1);
  assert.equal(changed.hits[0].stale, true);
  assert.deepEqual(changed.hits[0].reasons.includes('indexed_source_changed'), true);
  assert.equal(changed.diagnostics.freshness, 'at least one returned hit is stale');
  assert.equal((await knowledgeGenerationStatus(root)).generation_id, status.generation_id, 'reading never reindexes');

  fs.unlinkSync(source);
  const missing = await knowledgeSearch({ query: 'durableSignal', top_k: 5, token_budget: 1000 }, root);
  assert.equal(missing.hits[0].stale, true);
  assert.ok(missing.hits[0].reasons.includes('indexed_source_unavailable'));
});
