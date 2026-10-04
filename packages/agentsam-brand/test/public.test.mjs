import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectBrandEvidence,
  listBrandAssetEvidence,
  inspectBrandAssetEvidence,
  findBrandUsageEvidence,
  draftBrandContractFromEvidence,
  buildBrandPlanFromEvidence,
  evaluateBrandConsistency,
} from '../src/public.js';

const scan = {
  schema_version: 1,
  capability: 'brand.scan',
  deterministic: true,
  content_hash: 'scan-hash',
  repository: { snapshot_id: 'snapshot-1' },
  tokens: {
    colors: [{
      kind: 'color',
      value: '#111111',
      normalized_value: '#111111',
      occurrences: 8,
      evidence: [{ path: 'app.css', line: 1 }],
    }],
    typography: [{
      kind: 'font_family',
      value: 'Inter',
      occurrences: 5,
      evidence: [{ path: 'app.css', line: 2 }],
    }],
  },
  assets: [{ id: 'logo-primary', role: 'logo', path: 'public/logo.svg' }],
  components: {},
  patterns: { button_families: 1, header_families: 1 },
  conflicts: [],
  preservation: {},
};

test('worker-safe brand adapter consumes evidence', () => {
  assert.equal(inspectBrandEvidence(scan).summary.colors, 1);
  assert.equal(listBrandAssetEvidence(scan)[0].id, 'logo-primary');
  assert.equal(inspectBrandAssetEvidence(scan, 'logo-primary').asset.role, 'logo');
  assert.ok(findBrandUsageEvidence(scan, 'logo.svg').hits.length >= 1);
});

test('drafts contract and plan', () => {
  const drafted = draftBrandContractFromEvidence(scan, { brandId: 'brand:test' });
  assert.equal(drafted.contract.id, 'brand:test');
  assert.equal(buildBrandPlanFromEvidence(scan, drafted).capability, 'brand.plan');
});

test('evaluates candidate consistency from contract evidence', () => {
  const drafted = draftBrandContractFromEvidence(scan);
  const result = evaluateBrandConsistency(drafted.contract, {
    colors: ['#111111'],
    fonts: ['Inter'],
  });
  assert.equal(result.score, 1);
  assert.equal(result.verdict, 'consistent');
});
