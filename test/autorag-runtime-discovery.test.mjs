import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverKnowledgeRuntime } from '../src/knowledge/runtime-discovery.js';

test('AutoRAG runtime discovery sees local index and Cloudflare Vectorize without local knowledge config', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-autorag-runtime-'));
  try {
    fs.mkdirSync(path.join(root, '.agentsam', 'knowledge'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agentsam', 'knowledge', 'index.sqlite'), '');
    fs.writeFileSync(
      path.join(root, 'wrangler.toml'),
      [
        'name = "demo-worker"',
        '',
        '[ai]',
        'binding = "AGENTSAM_WAI"',
        '',
        '[[vectorize]]',
        'binding = "DEMO_VECTORIZE"',
        'index_name = "demo-index-1024"',
        '',
      ].join('\n'),
    );

    const runtime = discoverKnowledgeRuntime(root);
    assert.equal(runtime.local_index.exists, true);
    assert.equal(runtime.cloudflare.configured, true);
    assert.equal(runtime.cloudflare.worker_name, 'demo-worker');
    assert.equal(runtime.cloudflare.ai_binding, 'AGENTSAM_WAI');
    assert.deepEqual(runtime.cloudflare.vectorize, [{
      binding: 'DEMO_VECTORIZE',
      index: 'demo-index-1024',
      source: 'wrangler_config',
    }]);
    assert.deepEqual(runtime.lanes.map((lane) => lane.backend), [
      'local_exact',
      'cloudflare_vectorize',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
