import assert from 'node:assert/strict';
import test from 'node:test';
import { extractWorkersDevUrl, probeGoDeployment } from '../../src/go/cloudflare.js';
import { buildProductRow } from '../../src/go/receipts.js';

test('extractWorkersDevUrl parses wrangler output', () => {
  const url = extractWorkersDevUrl('Published agentsam-go-worker\n  https://agentsam-go-worker.example.workers.dev\n');
  assert.equal(url, 'https://agentsam-go-worker.example.workers.dev');
});

test('probeGoDeployment requires deterministic Go capabilities', async () => {
  const responses = new Map([
    ['/health', { status: 200, body: { ok: true, service: 'agentsam-go-worker', runtime: 'go' } }],
    ['/v1/runtime', { status: 200, body: { schema: 'agentsam.go-runtime.v1', capabilities: ['hash'] } }],
    ['/v1/hash', { status: 200, body: { hash: 'a'.repeat(64), algorithm: 'sha256' } }],
    ['/v1/inspect', { status: 200, body: { findings: [{ kind: 'hardcoded_color', value: '#2563eb' }] } }],
  ]);
  let inspectCalls = 0;
  const fetchImpl = async (url, init = {}) => {
    const pathname = new URL(url).pathname;
    if (pathname === '/v1/inspect') {
      inspectCalls += 1;
      if (inspectCalls === 2) {
        return {
          status: 400,
          async json() { return { ok: false, error: 'files_required' }; },
        };
      }
    }
    const row = responses.get(pathname);
    return {
      status: row.status,
      async json() { return row.body; },
    };
  };
  const result = await probeGoDeployment('https://example.workers.dev', { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(result.results.deterministic_inspect.ok, true);
  assert.equal(result.results.malformed_rejected.ok, true);
});

test('buildProductRow stays on agentsam_products projection', () => {
  const row = buildProductRow({
    product: 'agentsam-go-worker',
    repositoryId: 'agentsam-sdk',
    commit: 'abc',
    url: 'https://x.workers.dev',
    health: 'healthy',
  });
  assert.equal(row.slug, 'agentsam-go-worker');
  assert.equal(row.kind, 'service');
  assert.equal(row.metadata.runtime, 'go');
});
