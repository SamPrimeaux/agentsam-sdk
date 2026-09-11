import test from 'node:test';
import assert from 'node:assert/strict';
import { createCapabilityAdapter } from '../src/agent/index.js';
import { buildRepositoryAuditPacket, runRepositoryAudit } from '../src/agent/repository-audit.js';

const snapshot = {
  schema_version: 1,
  capability: 'repository.snapshot',
  snapshot_id: 'rsnap_0123456789abcdef01234567',
  content_hash: `sha256:${'a'.repeat(64)}`,
  repository: { repository_id: 'github:owner/repo', provider: 'github', full_name: 'owner/repo', branch: 'main', revision_sha: 'b'.repeat(40), dirty: false },
  tree: { merkle_root: `sha256:${'c'.repeat(64)}`, stats: { files: 10 } },
  intelligence: {
    summary: { file_count: 10, total_lines: 500 },
    languages: [{ language: 'JavaScript', files: 7 }],
    manifests: [{ path: 'package.json', kind: 'node' }],
    top_level: [{ path: 'src', files: 7 }],
    pressure_points: [{ path: 'src', pressure_score: 70 }],
  },
  packages: [{ path: 'package.json', name: 'demo', version: '1.0.0' }],
  knowledge: { configured: false },
  deploy: null,
};

test('repository audit packet is bounded read-only evidence', () => {
  const packet = buildRepositoryAuditPacket({ snapshot, focus: ['packages'], evidenceBudget: 1000 });
  assert.equal(packet.primitive, 'repository.audit');
  assert.equal(packet.rules.read_only, true);
  assert.equal(packet.rules.may_edit, false);
  assert.equal(packet.snapshot_id, snapshot.snapshot_id);
  assert.ok(JSON.stringify(packet.evidence).length <= 4000);
});

test('repository audit uses injected reasoning and validates read-only output', async () => {
  const audit = await runRepositoryAudit({
    snapshot,
    reasoner: async packet => ({
      summary: `Audited ${packet.evidence.repository.full_name}`,
      packages: packet.evidence.packages,
      notable_combinations: ['snapshot + audit'],
      findings: [{ severity: 'low', finding: 'example' }],
      recommended_routes: ['inspect capability registry'],
      evidence_refs: [packet.evidence_index.packages],
    }),
  });
  assert.equal(audit.primitive, 'repository.audit');
  assert.equal(audit.summary, 'Audited owner/repo');
  assert.equal(audit.packages.length, 1);
  assert.deepEqual(audit.commands, []);

  await assert.rejects(() => runRepositoryAudit({ snapshot, reasoner: async () => ({ summary: 'bad', jobs: [] }) }), /mutation field: jobs/);
});

test('agent capability adapter exposes only executable tools by default', async () => {
  const adapter = createCapabilityAdapter({
    reasoner: async packet => ({ summary: 'ok', evidence_refs: [packet.evidence_index.summary] }),
    handlers: { 'knowledge.search': async input => ({ query: input.text, hits: [] }) },
  });
  const names = adapter.toolDescriptors().map(row => row.name);
  assert.ok(names.includes('repository.snapshot'));
  assert.ok(names.includes('repository.audit'));
  assert.ok(names.includes('knowledge.search'));
  assert.equal(names.includes('knowledge.index'), false);
  const result = await adapter.invoke('knowledge.search', { text: 'hello' });
  assert.equal(result.capability_id, 'knowledge.search');
  assert.deepEqual(result.result.hits, []);
});
