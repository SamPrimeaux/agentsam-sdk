import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { discoverKnowledgeRuntime } from '../../src/knowledge/runtime-discovery.js';

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

test('project context receipt separates observed deployment resources from local executability', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-project-context-'));
  try {
    fs.mkdirSync(path.join(root, '.agentsam'), { recursive: true });
    fs.writeFileSync(path.join(root, '.agentsam', 'app.json'), JSON.stringify({ schema: 'agentsam.app-install.v1', app_id: 'my-product' }));
    fs.writeFileSync(path.join(root, 'wrangler.toml'), [
      'name = "customer-worker"',
      '[ai]',
      'binding = "MY_AI"',
      '[[vectorize]]',
      'binding = "MY_VECTORS"',
      'index_name = "customer-code-index"',
      '[[d1_databases]]',
      'binding = "DB"',
      'database_name = "customer-db"',
      'database_id = "00000000-0000-0000-0000-000000000001"',
      '[[r2_buckets]]',
      'binding = "CONTENT"',
      'bucket_name = "customer-assets"',
      '',
    ].join('\n'));

    const runtime = discoverKnowledgeRuntime(root, { env: {} });
    assert.equal(runtime.schema, 'agentsam.project-context.v1');
    assert.equal(runtime.project.host_install.app_id, 'my-product');
    assert.equal(runtime.resources.workers_ai.binding, 'MY_AI');
    assert.equal(runtime.resources.workers_ai.locally_executable, false);
    assert.equal(runtime.resources.workers_ai.remotely_executable, true);
    assert.equal(runtime.resources.vectorize[0].binding, 'MY_VECTORS');
    assert.equal(runtime.resources.vectorize[0].index, 'customer-code-index');
    assert.equal(runtime.resources.vectorize[0].locally_executable, false);
    assert.equal(runtime.resources.vectorize[0].remotely_executable, true);
    assert.equal(runtime.resources.d1[0].binding, 'DB');
    assert.equal(runtime.resources.r2[0].binding, 'CONTENT');
    assert.equal(runtime.knowledge.policy_configured, false);
    assert.equal(runtime.knowledge.suggested_backend, 'cloudflare_vectorize');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('project context receipt surfaces knowledge policy versus Wrangler drift', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-project-context-drift-'));
  try {
    fs.writeFileSync(path.join(root, 'wrangler.toml'), [
      'name = "customer-worker"',
      '[[vectorize]]',
      'binding = "MY_VECTORS"',
      'index_name = "customer-code-index"',
      '',
    ].join('\n'));
    const runtime = discoverKnowledgeRuntime(root, {
      env: {},
      knowledgeConfig: { lane: { backend: 'cloudflare_vectorize', binding: 'OTHER_VECTORS', index: 'other-index' } },
    });
    assert.equal(runtime.conflicts.length, 1);
    assert.equal(runtime.conflicts[0].kind, 'knowledge_deployment_drift');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
