import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignBrief,
  evaluateCampaignConcept,
  rankCampaignConcepts,
  buildCampaignPlan,
} from '../src/index.js';

const context = {
  brandContract: { id: 'brand:fnf', kind: 'brand' },
  products: [
    { id: 'tee-1', name: 'Tee', margin: 0.62 },
    { id: 'hoodie-1', name: 'Hoodie', margin: 0.48 },
  ],
  inventory: [
    { product_id: 'tee-1', available: 80 },
    { product_id: 'hoodie-1', available: 20 },
  ],
  audience: { segment: 'returning-customers' },
  performance: { prior_campaigns: 4 },
};

test('builds a grounded brief', () => {
  const brief = buildCampaignBrief({
    objective: 'Launch a fall capsule',
    context,
    successMetrics: ['conversion_rate', 'gross_margin'],
  });
  assert.equal(brief.kind, 'campaign-brief');
  assert.equal(brief.evidence.brand_contract_available, true);
});

test('evaluates and ranks concepts without guarantees', () => {
  const good = { name: 'Tee lead', productIds: ['tee-1'] };
  const weak = { name: 'Unknown', productIds: ['missing'] };
  assert.equal(evaluateCampaignConcept(good, context).guarantee, 'none');
  assert.equal(rankCampaignConcepts([weak, good], context).ranked[0].concept.name, 'Tee lead');
});

test('builds a review-gated plan', () => {
  const brief = buildCampaignBrief({ objective: 'Launch a fall capsule', context });
  const plan = buildCampaignPlan({
    brief,
    concept: {
      name: 'Tee lead',
      productIds: ['tee-1'],
      hook: 'Limited fall drop',
      channels: ['email', 'social'],
    },
    context,
  });
  assert.ok(plan.stages.some((stage) => stage.id === 'review'));
});
