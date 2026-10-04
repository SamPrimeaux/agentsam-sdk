function arr(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function stableId(prefix, value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function normalizeCampaignContext(input = {}) {
  return {
    brandContract: input.brandContract || null,
    products: arr(input.products),
    inventory: arr(input.inventory),
    performance: input.performance || null,
    audience: input.audience || null,
    constraints: input.constraints || {},
    seasonality: input.seasonality || null,
    notes: arr(input.notes),
  };
}

export function buildCampaignBrief(input = {}) {
  const context = normalizeCampaignContext(input.context || input);
  const objective = String(input.objective || '').trim();
  if (!objective) throw new Error('campaign_objective_required');

  return {
    schema: 'agentsam.campaign.brief/v1',
    kind: 'campaign-brief',
    id: input.id || stableId('campaign-brief', {
      objective,
      products: context.products.map((p) => p?.id || p?.sku || p?.name),
      audience: context.audience,
    }),
    status: 'draft',
    objective,
    audience: input.audience || context.audience || null,
    offer: input.offer || null,
    products: context.products,
    constraints: context.constraints,
    brand_contract_id: context.brandContract?.id || null,
    evidence: {
      inventory_available: context.inventory.length > 0,
      performance_available: Boolean(context.performance),
      audience_available: Boolean(context.audience),
      brand_contract_available: Boolean(context.brandContract),
      product_count: context.products.length,
    },
    success_metrics: arr(input.successMetrics),
    assumptions: arr(input.assumptions),
  };
}

function productFit(concept, context) {
  const requested = new Set(arr(concept.productIds).map(String));
  if (!requested.size) return context.products.length ? 0.6 : 0.3;
  const known = new Set(
    context.products
      .map((p) => p?.id ?? p?.sku ?? p?.name)
      .filter(Boolean)
      .map(String)
  );
  return clamp01([...requested].filter((id) => known.has(id)).length / requested.size);
}

function marginHealth(concept, context) {
  const requested = number(concept.targetMargin);
  if (requested !== null) return clamp01(requested);
  const margins = context.products
    .map((p) => number(p?.margin ?? p?.gross_margin))
    .filter((v) => v !== null);
  if (!margins.length) return 0.5;
  return clamp01(margins.reduce((a, b) => a + b, 0) / margins.length);
}

function inventoryReadiness(concept, context) {
  if (!context.inventory.length) return 0.5;
  const requested = new Set(arr(concept.productIds).map(String));
  const records = requested.size
    ? context.inventory.filter((row) =>
        requested.has(String(row?.product_id ?? row?.productId ?? row?.sku ?? ''))
      )
    : context.inventory;

  if (!records.length) return 0.2;
  const available = records.reduce(
    (sum, row) => sum + Math.max(0, number(row?.available ?? row?.quantity, 0) || 0),
    0
  );
  return available > 100 ? 1 : available > 25 ? 0.8 : available > 0 ? 0.6 : 0;
}

function brandFit(concept, context) {
  if (!context.brandContract) return 0.5;
  const supplied = number(concept.brandConsistencyScore);
  return supplied === null ? 0.7 : clamp01(supplied);
}

function evidenceQuality(context) {
  const checks = [
    Boolean(context.brandContract),
    context.products.length > 0,
    context.inventory.length > 0,
    Boolean(context.performance),
    Boolean(context.audience),
  ];
  return checks.filter(Boolean).length / checks.length;
}

export function evaluateCampaignConcept(concept = {}, rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const name = String(concept.name || concept.title || '').trim();
  if (!name) throw new Error('campaign_concept_name_required');

  const dimensions = {
    product_fit: productFit(concept, context),
    margin_health: marginHealth(concept, context),
    inventory_readiness: inventoryReadiness(concept, context),
    brand_fit: brandFit(concept, context),
    evidence_quality: evidenceQuality(context),
  };

  const weights = {
    product_fit: 0.25,
    margin_health: 0.20,
    inventory_readiness: 0.20,
    brand_fit: 0.20,
    evidence_quality: 0.15,
  };

  const score = Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + dimensions[key] * weight,
    0
  );

  const warnings = [];
  if (!context.brandContract) warnings.push('brand_contract_missing');
  if (!context.products.length) warnings.push('product_catalog_missing');
  if (!context.inventory.length) warnings.push('inventory_missing');
  if (!context.performance) warnings.push('performance_history_missing');
  if (!context.audience) warnings.push('audience_evidence_missing');

  return {
    schema: 'agentsam.campaign.evaluation/v1',
    kind: 'campaign-concept-evaluation',
    concept_id: concept.id || stableId('campaign-concept', concept),
    concept_name: name,
    score: Number(score.toFixed(3)),
    dimensions: Object.fromEntries(
      Object.entries(dimensions).map(([key, value]) => [key, Number(value.toFixed(3))])
    ),
    weights,
    warnings,
    evidence_quality: Number(dimensions.evidence_quality.toFixed(3)),
    deterministic: true,
    guarantee: 'none',
  };
}

export function rankCampaignConcepts(concepts = [], context = {}) {
  const ranked = arr(concepts).map((concept) => ({
    concept,
    evaluation: evaluateCampaignConcept(concept, context),
  }));

  ranked.sort((a, b) =>
    b.evaluation.score - a.evaluation.score ||
    a.evaluation.concept_name.localeCompare(b.evaluation.concept_name)
  );

  return {
    schema: 'agentsam.campaign.ranking/v1',
    kind: 'campaign-concept-ranking',
    ranked: ranked.map((row, index) => ({ rank: index + 1, ...row })),
    deterministic: true,
    guarantee: 'none',
  };
}

export function buildCampaignPlan({ brief, concept, context = {} } = {}) {
  if (!brief || brief.kind !== 'campaign-brief') {
    throw new Error('campaign_plan_requires_brief');
  }
  if (!concept) throw new Error('campaign_plan_requires_concept');

  const evaluation = evaluateCampaignConcept(concept, context);

  return {
    schema: 'agentsam.campaign.plan/v1',
    kind: 'campaign-plan',
    id: stableId('campaign-plan', {
      brief: brief.id,
      concept: evaluation.concept_id,
    }),
    status: 'draft',
    brief_id: brief.id,
    concept_id: evaluation.concept_id,
    objective: brief.objective,
    audience: brief.audience,
    offer: brief.offer,
    product_ids: arr(concept.productIds),
    hook: concept.hook || null,
    creative_direction: concept.creativeDirection || null,
    channels: arr(concept.channels),
    evaluation,
    stages: [
      { id: 'ground', title: 'Verify brand, product, inventory, and audience evidence' },
      { id: 'prepare', title: 'Prepare campaign copy and creative variants' },
      { id: 'review', title: 'Review offer, margins, inventory, and brand consistency' },
      { id: 'launch', title: 'Launch only after explicit user approval' },
      { id: 'measure', title: 'Measure outcomes against declared success metrics' },
    ],
    success_metrics: brief.success_metrics,
    guarantee: 'none',
  };
}
