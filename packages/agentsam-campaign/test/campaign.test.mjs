import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCampaignBrief,
  evaluateCampaignConcept,
  rankCampaignConcepts,
  buildCampaignPlan,
  campaignAudienceEvaluate,
  campaignOfferEvaluate,
  campaignSeoPlan,
  campaignChannelPlan,
  campaignExperimentPlan,
  campaignPerformanceEvaluate,
  campaignReview,
  campaignLearnings,
  describeCampaignEvidence,
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
  performance: {
    historical_score: 0.72,
    conversion_score: 0.68,
    channels: { email: 0.82, social: 0.64 },
  },
  search: { opportunity_score: 0.7, queries: ['fall tee', 'outdoor hoodie'] },
  content: { available_asset_types: ['hero', 'product-image'] },
  seasonality: { score: 0.8 },
  constraints: { budget: 1000, success_metrics: ['conversion_rate', 'gross_margin'] },
};

test('builds a grounded brief with evidence summary', () => {
  const brief = buildCampaignBrief({
    objective: 'Launch a fall capsule',
    context,
    successMetrics: ['conversion_rate', 'gross_margin'],
  });
  assert.equal(brief.kind, 'campaign-brief');
  assert.equal(brief.evidence.brand_contract_available, true);
  assert.ok(brief.evidence.summary.quality > 0.5);
});

test('evaluates and ranks concepts without unexplained AI scores', () => {
  const good = {
    name: 'Tee lead',
    productIds: ['tee-1'],
    audienceSegment: 'returning-customers',
    channels: ['email'],
    brandConsistencyScore: 0.9,
    messageFitScore: 0.8,
    offerStrengthScore: 0.7,
    requiredAssetTypes: ['hero'],
    estimatedCost: 700,
    successMetrics: ['conversion_rate', 'gross_margin'],
  };
  const weak = { name: 'Unknown', productIds: ['missing'] };
  const evaluated = evaluateCampaignConcept(good, context);
  assert.equal(evaluated.guarantee, 'none');
  assert.ok(evaluated.dimensions.inventory_fit.evidence.length > 0);
  assert.equal(typeof evaluated.dimensions.inventory_fit.reason, 'string');
  assert.ok(evaluated.confidence > 0);
  assert.equal(rankCampaignConcepts([weak, good], context).ranked[0].concept.name, 'Tee lead');
});

test('builds a review-gated learning-aware plan', () => {
  const brief = buildCampaignBrief({ objective: 'Launch a fall capsule', context });
  const plan = buildCampaignPlan({
    brief,
    concept: {
      name: 'Tee lead',
      productIds: ['tee-1'],
      hook: 'Limited fall drop',
      channels: ['email', 'social'],
      brandConsistencyScore: 0.9,
    },
    context,
  });
  assert.ok(plan.stages.some((stage) => stage.id === 'review'));
  assert.ok(plan.stages.some((stage) => stage.id === 'learn'));
});

test('evaluates audience and offer with explicit missing evidence', () => {
  assert.equal(campaignAudienceEvaluate({ segment: 'returning-customers' }, context).score, 1);
  const offer = campaignOfferEvaluate({ discount_rate: 0.2, productIds: ['tee-1'] }, context);
  assert.equal(offer.kind, 'campaign-offer-evaluation');
  assert.equal(offer.guarantee, 'none');
  assert.ok(offer.dimensions.margin_fit.reason);
});

test('builds SEO, channel, and experiment plans from evidence', () => {
  const brief = buildCampaignBrief({
    objective: 'Capture fall search demand',
    context,
    successMetrics: ['conversion_rate'],
  });
  const concept = { name: 'Search capture', channels: ['email'], productIds: ['tee-1'] };
  assert.equal(campaignSeoPlan({ objective: brief.objective }, context).terms.length, 2);
  assert.equal(campaignChannelPlan(concept, context).channels[0].fit, 0.82);
  assert.equal(campaignExperimentPlan({ brief, concept, variants: [{ id: 'a' }, { id: 'b' }], context }).measurement_ready, true);
});

test('reviews outcomes and produces reusable learnings', () => {
  const outcome = {
    id: 'outcome-1',
    status: 'success',
    tags: ['email', 'tee-1'],
    success_metrics: ['conversion_rate'],
    metrics: { conversion_rate: 0.04 },
  };
  assert.equal(campaignPerformanceEvaluate({ outcome, context }).metric_coverage, 1);
  assert.equal(campaignReview({ outcome, context }).status, 'measured');
  const learnings = campaignLearnings([outcome], context);
  assert.equal(learnings.outcome_count, 1);
  assert.ok(learnings.observations.some((row) => row.key === 'email'));
});

test('evidence quality degrades instead of inventing facts', () => {
  const sparse = describeCampaignEvidence({ products: [{ id: 'p1' }] });
  assert.ok(sparse.missing.includes('brand'));
  const evalSparse = evaluateCampaignConcept({ name: 'Sparse', productIds: ['p1'] }, { products: [{ id: 'p1' }] });
  assert.ok(evalSparse.confidence < 1);
  assert.ok(evalSparse.warnings.length > 0);
});
