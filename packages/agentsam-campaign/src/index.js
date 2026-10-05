function arr(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp01(value) {
  return value == null ? null : Math.max(0, Math.min(1, Number(value)));
}

function stableId(prefix, value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return prefix + ':' + (hash >>> 0).toString(16).padStart(8, '0');
}

function scalarScore(value) {
  const n = number(value);
  return n == null ? null : clamp01(n);
}

function evidenceItem(kind, available, detail = null) {
  return { kind, available: Boolean(available), detail };
}

function dimension({ score = null, weight, confidence = null, reason, evidence = [], missing = [] }) {
  const normalized = score == null ? null : Number(clamp01(score).toFixed(3));
  return {
    score: normalized,
    weight,
    confidence: confidence == null
      ? (normalized == null ? 0 : 1)
      : Number(clamp01(confidence).toFixed(3)),
    reason,
    evidence,
    missing,
  };
}

export function normalizeCampaignContext(input = {}) {
  return {
    brandContract: input.brandContract || null,
    products: arr(input.products),
    inventory: arr(input.inventory),
    performance: input.performance || null,
    audience: input.audience || null,
    search: input.search || null,
    content: input.content || null,
    channels: input.channels || null,
    economics: input.economics || null,
    constraints: input.constraints || {},
    seasonality: input.seasonality || null,
    history: arr(input.history),
    outcomes: arr(input.outcomes),
    notes: arr(input.notes),
  };
}

export function describeCampaignEvidence(rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const evidence = [
    evidenceItem('brand', context.brandContract, context.brandContract?.id || null),
    evidenceItem('products', context.products.length > 0, { count: context.products.length }),
    evidenceItem('inventory', context.inventory.length > 0, { count: context.inventory.length }),
    evidenceItem('performance', context.performance),
    evidenceItem('audience', context.audience),
    evidenceItem('search', context.search),
    evidenceItem('content', context.content),
    evidenceItem('economics', context.economics || context.products.some((p) => number(p?.margin ?? p?.gross_margin) != null)),
    evidenceItem('seasonality', context.seasonality),
    evidenceItem('history', context.history.length > 0 || context.outcomes.length > 0, {
      history_count: context.history.length,
      outcome_count: context.outcomes.length,
    }),
  ];
  const available = evidence.filter((row) => row.available).length;
  return {
    schema: 'agentsam.campaign.evidence/v1',
    kind: 'campaign-evidence-summary',
    evidence,
    available,
    total: evidence.length,
    quality: Number((available / evidence.length).toFixed(3)),
    missing: evidence.filter((row) => !row.available).map((row) => row.kind),
  };
}

export function buildCampaignBrief(input = {}) {
  const context = normalizeCampaignContext(input.context || input);
  const objective = String(input.objective || '').trim();
  if (!objective) throw new Error('campaign_objective_required');
  const evidence = describeCampaignEvidence(context);

  return {
    schema: 'agentsam.campaign.brief/v2',
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
      summary: evidence,
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
  if (!requested.size) return null;
  const known = new Set(
    context.products
      .map((p) => p?.id ?? p?.sku ?? p?.name)
      .filter(Boolean)
      .map(String)
  );
  if (!known.size) return null;
  return clamp01([...requested].filter((id) => known.has(id)).length / requested.size);
}

function marginHealth(concept, context) {
  const requested = number(concept.targetMargin);
  if (requested !== null) return clamp01(requested);
  const margins = context.products
    .map((p) => number(p?.margin ?? p?.gross_margin))
    .filter((v) => v !== null);
  if (!margins.length) return null;
  return clamp01(margins.reduce((a, b) => a + b, 0) / margins.length);
}

function inventoryReadiness(concept, context) {
  if (!context.inventory.length) return null;
  const requested = new Set(arr(concept.productIds).map(String));
  const records = requested.size
    ? context.inventory.filter((row) =>
        requested.has(String(row?.product_id ?? row?.productId ?? row?.sku ?? ''))
      )
    : context.inventory;
  if (!records.length) return 0;
  const available = records.reduce(
    (sum, row) => sum + Math.max(0, number(row?.available ?? row?.quantity, 0) || 0),
    0
  );
  return available > 100 ? 1 : available > 25 ? 0.8 : available > 0 ? 0.6 : 0;
}

function brandFit(concept, context) {
  if (!context.brandContract) return null;
  return scalarScore(concept.brandConsistencyScore ?? concept.brand_fit);
}

function audienceFit(concept, context) {
  if (!context.audience) return null;
  const requested = String(concept.audienceSegment ?? concept.audience ?? '').trim().toLowerCase();
  const observed = String(context.audience?.segment ?? context.audience?.id ?? '').trim().toLowerCase();
  if (!requested || !observed) return scalarScore(concept.audienceFitScore);
  return requested === observed ? 1 : 0.25;
}

function channelFit(concept, context) {
  const wanted = arr(concept.channels).map((v) => String(v).toLowerCase());
  if (!wanted.length) return null;
  const scores = context.performance?.channels || context.channels?.scores || null;
  if (!scores || typeof scores !== 'object') return scalarScore(concept.channelFitScore);
  const found = wanted.map((key) => number(scores[key])).filter((v) => v != null);
  return found.length ? clamp01(found.reduce((a, b) => a + b, 0) / found.length) : null;
}

function searchOpportunity(context, concept) {
  const direct = scalarScore(concept.searchOpportunityScore);
  if (direct != null) return direct;
  return scalarScore(context.search?.opportunity_score ?? context.search?.score);
}

function historicalPerformance(context, concept) {
  const direct = scalarScore(concept.historicalPerformanceScore);
  if (direct != null) return direct;
  return scalarScore(
    context.performance?.historical_score ??
    context.performance?.score ??
    context.performance?.campaign_score
  );
}

function creativeFeasibility(context, concept) {
  const direct = scalarScore(concept.creativeFeasibilityScore);
  if (direct != null) return direct;
  const required = arr(concept.requiredAssetTypes ?? concept.assetsRequired).map(String);
  const available = new Set(arr(context.content?.available_asset_types ?? context.content?.assetTypes).map(String));
  if (!required.length || !available.size) return null;
  return required.filter((x) => available.has(x)).length / required.length;
}

function executionCost(context, concept) {
  const direct = scalarScore(concept.executionCostScore);
  if (direct != null) return direct;
  const cost = number(concept.estimatedCost);
  const budget = number(context.constraints?.budget ?? context.economics?.budget);
  if (cost == null || budget == null || budget <= 0) return null;
  return clamp01(1 - Math.max(0, cost - budget) / budget);
}

function measurementQuality(concept, context) {
  const direct = scalarScore(concept.measurementQualityScore);
  if (direct != null) return direct;
  const metrics = arr(concept.successMetrics ?? context.constraints?.success_metrics);
  return metrics.length ? Math.min(1, 0.5 + metrics.length * 0.1) : null;
}

function seasonalityFit(context, concept) {
  const direct = scalarScore(concept.seasonalityScore);
  if (direct != null) return direct;
  return scalarScore(context.seasonality?.score ?? context.seasonality?.fit);
}

export function campaignAudienceEvaluate(audience = {}, rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const score = audienceFit({ audienceSegment: audience.segment ?? audience.id, audienceFitScore: audience.fit_score }, context);
  return {
    schema: 'agentsam.campaign.audience-evaluation/v1',
    kind: 'campaign-audience-evaluation',
    audience,
    score,
    confidence: context.audience ? (score == null ? 0.5 : 1) : 0,
    evidence: context.audience ? [context.audience] : [],
    missing_evidence: context.audience ? [] : ['audience'],
    guarantee: 'none',
  };
}

export function campaignOfferEvaluate(offer = {}, rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const discount = number(offer.discount_rate ?? offer.discount);
  const baseMargin = marginHealth({}, context);
  const postDiscountMargin = baseMargin == null || discount == null
    ? null
    : clamp01((baseMargin - discount) / Math.max(0.0001, 1 - discount));
  const inventory = inventoryReadiness({ productIds: offer.productIds || [] }, context);
  const history = historicalPerformance(context, offer);
  const quality = describeCampaignEvidence(context).quality;
  const dimensions = {
    margin_fit: dimension({
      score: postDiscountMargin,
      weight: 0.4,
      confidence: baseMargin == null ? 0 : 1,
      reason: postDiscountMargin == null
        ? 'Margin evidence or discount rate is missing.'
        : 'Derived from observed gross margin and the proposed discount rate.',
      evidence: baseMargin == null ? [] : [{ base_margin: baseMargin, discount_rate: discount }],
      missing: baseMargin == null ? ['margin'] : (discount == null ? ['discount_rate'] : []),
    }),
    inventory_fit: dimension({
      score: inventory,
      weight: 0.25,
      reason: inventory == null ? 'Inventory evidence is missing.' : 'Based on available inventory for the proposed products.',
      evidence: inventory == null ? [] : [{ inventory_rows: context.inventory.length }],
      missing: inventory == null ? ['inventory'] : [],
    }),
    historical_performance: dimension({
      score: history,
      weight: 0.2,
      reason: history == null ? 'No normalized historical promotion score is available.' : 'Uses supplied historical performance evidence.',
      evidence: history == null ? [] : [context.performance],
      missing: history == null ? ['historical_performance'] : [],
    }),
    evidence_quality: dimension({
      score: quality,
      weight: 0.15,
      reason: 'Measures how many campaign evidence families are currently available.',
      evidence: [describeCampaignEvidence(context)],
    }),
  };
  return finalizeEvaluation('campaign-offer-evaluation', stableId('campaign-offer', offer), dimensions, {
    offer,
    recommendation: postDiscountMargin != null && postDiscountMargin < 0.2
      ? 'review_margin_risk'
      : 'review_with_available_evidence',
  });
}

function buildConceptDimensions(concept, context) {
  const evidence = describeCampaignEvidence(context);
  const product = productFit(concept, context);
  const margin = marginHealth(concept, context);
  const inventory = inventoryReadiness(concept, context);
  const brand = brandFit(concept, context);
  const audience = audienceFit(concept, context);
  const channel = channelFit(concept, context);
  const search = searchOpportunity(context, concept);
  const offer = scalarScore(concept.offerStrengthScore);
  const conversion = scalarScore(concept.conversionEvidenceScore ?? context.performance?.conversion_score);
  const historical = historicalPerformance(context, concept);
  const seasonal = seasonalityFit(context, concept);
  const creative = creativeFeasibility(context, concept);
  const cost = executionCost(context, concept);
  const measurement = measurementQuality(concept, context);
  const message = scalarScore(concept.messageFitScore);

  return {
    objective_fit: dimension({
      score: scalarScore(concept.objectiveFitScore) ?? product,
      weight: 0.12,
      confidence: product == null ? 0.5 : 1,
      reason: product == null ? 'Objective fit needs explicit evidence.' : 'Uses requested-product coverage as an objective-fit signal.',
      evidence: product == null ? [] : [{ product_fit: product }],
      missing: product == null ? ['objective_fit_evidence'] : [],
    }),
    brand_fit: dimension({
      score: brand, weight: 0.08,
      reason: brand == null ? 'BrandContract exists only if paired with an explicit consistency score.' : 'Uses explicit Brand consistency evidence.',
      evidence: brand == null ? [] : [{ brand_contract_id: context.brandContract?.id, score: brand }],
      missing: brand == null ? ['brand_consistency_evidence'] : [],
    }),
    audience_fit: dimension({
      score: audience, weight: 0.08,
      reason: audience == null ? 'Audience fit evidence is missing.' : 'Compares the proposed audience with observed audience context.',
      evidence: audience == null ? [] : [context.audience],
      missing: audience == null ? ['audience_fit_evidence'] : [],
    }),
    message_fit: dimension({
      score: message, weight: 0.05,
      reason: message == null ? 'Message fit requires explicit evaluation evidence.' : 'Uses supplied message-fit evidence.',
      evidence: message == null ? [] : [{ score: message }],
      missing: message == null ? ['message_fit_evidence'] : [],
    }),
    channel_fit: dimension({
      score: channel, weight: 0.06,
      reason: channel == null ? 'Channel performance evidence is missing.' : 'Uses observed channel scores for selected channels.',
      evidence: channel == null ? [] : [{ channels: arr(concept.channels), score: channel }],
      missing: channel == null ? ['channel_performance_evidence'] : [],
    }),
    search_opportunity: dimension({
      score: search, weight: 0.05,
      reason: search == null ? 'Search opportunity evidence is missing.' : 'Uses supplied search opportunity evidence.',
      evidence: search == null ? [] : [context.search],
      missing: search == null ? ['search_evidence'] : [],
    }),
    offer_strength: dimension({
      score: offer, weight: 0.05,
      reason: offer == null ? 'Offer strength has not been evaluated.' : 'Uses explicit offer evaluation evidence.',
      evidence: offer == null ? [] : [{ score: offer }],
      missing: offer == null ? ['offer_evidence'] : [],
    }),
    conversion_evidence: dimension({
      score: conversion, weight: 0.05,
      reason: conversion == null ? 'Conversion evidence is missing.' : 'Uses normalized conversion evidence supplied by the performance adapter.',
      evidence: conversion == null ? [] : [context.performance],
      missing: conversion == null ? ['conversion_evidence'] : [],
    }),
    historical_performance: dimension({
      score: historical, weight: 0.06,
      reason: historical == null ? 'Historical performance evidence is missing.' : 'Uses normalized historical performance evidence.',
      evidence: historical == null ? [] : [context.performance],
      missing: historical == null ? ['historical_performance'] : [],
    }),
    inventory_fit: dimension({
      score: inventory, weight: 0.09,
      reason: inventory == null ? 'Inventory evidence is missing.' : 'Uses current available inventory for requested products.',
      evidence: inventory == null ? [] : [{ inventory_rows: context.inventory.length }],
      missing: inventory == null ? ['inventory'] : [],
    }),
    margin_fit: dimension({
      score: margin, weight: 0.08,
      reason: margin == null ? 'Margin evidence is missing.' : 'Uses observed or explicitly requested gross-margin ratio.',
      evidence: margin == null ? [] : [{ margin }],
      missing: margin == null ? ['margin'] : [],
    }),
    seasonality: dimension({
      score: seasonal, weight: 0.04,
      reason: seasonal == null ? 'Seasonality evidence is missing.' : 'Uses normalized seasonality evidence.',
      evidence: seasonal == null ? [] : [context.seasonality],
      missing: seasonal == null ? ['seasonality'] : [],
    }),
    creative_feasibility: dimension({
      score: creative, weight: 0.05,
      reason: creative == null ? 'Creative feasibility evidence is missing.' : 'Compares required and available asset types.',
      evidence: creative == null ? [] : [context.content],
      missing: creative == null ? ['content_asset_evidence'] : [],
    }),
    execution_cost: dimension({
      score: cost, weight: 0.04,
      reason: cost == null ? 'Cost/budget evidence is missing.' : 'Compares estimated execution cost with the declared budget.',
      evidence: cost == null ? [] : [{ estimated_cost: concept.estimatedCost, budget: context.constraints?.budget ?? context.economics?.budget }],
      missing: cost == null ? ['cost_or_budget'] : [],
    }),
    measurement_quality: dimension({
      score: measurement, weight: 0.05,
      reason: measurement == null ? 'Measurement plan is not yet defined.' : 'Reflects declared measurable success metrics.',
      evidence: measurement == null ? [] : [{ metrics: concept.successMetrics ?? context.constraints?.success_metrics }],
      missing: measurement == null ? ['success_metrics'] : [],
    }),
    evidence_quality: dimension({
      score: evidence.quality, weight: 0.05,
      confidence: 1,
      reason: 'Measures coverage of the evidence families available to Campaign.',
      evidence: [evidence],
      missing: evidence.missing,
    }),
  };
}

function finalizeEvaluation(kind, id, dimensions, extra = {}) {
  const rows = Object.values(dimensions);
  const known = rows.filter((row) => row.score != null);
  const weightSum = known.reduce((sum, row) => sum + row.weight, 0);
  const score = weightSum
    ? known.reduce((sum, row) => sum + row.score * row.weight, 0) / weightSum
    : null;
  const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
  const evidenceWeight = known.reduce((sum, row) => sum + row.weight, 0);
  const confidence = totalWeight ? evidenceWeight / totalWeight : 0;
  const warnings = rows.flatMap((row) => row.missing).filter((v, i, a) => a.indexOf(v) === i);

  return {
    schema: 'agentsam.campaign.evaluation/v2',
    kind,
    id,
    score: score == null ? null : Number(score.toFixed(3)),
    confidence: Number(confidence.toFixed(3)),
    dimensions,
    warnings,
    deterministic: true,
    guarantee: 'none',
    ...extra,
  };
}

export function evaluateCampaignConcept(concept = {}, rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const name = String(concept.name || concept.title || '').trim();
  if (!name) throw new Error('campaign_concept_name_required');
  const conceptId = concept.id || stableId('campaign-concept', concept);
  return finalizeEvaluation(
    'campaign-concept-evaluation',
    conceptId,
    buildConceptDimensions(concept, context),
    { concept_id: conceptId, concept_name: name, evidence_quality: describeCampaignEvidence(context).quality }
  );
}

export function rankCampaignConcepts(concepts = [], context = {}) {
  const ranked = arr(concepts).map((concept) => ({
    concept,
    evaluation: evaluateCampaignConcept(concept, context),
  }));

  ranked.sort((a, b) =>
    (b.evaluation.score ?? -1) - (a.evaluation.score ?? -1) ||
    b.evaluation.confidence - a.evaluation.confidence ||
    a.evaluation.concept_name.localeCompare(b.evaluation.concept_name)
  );

  return {
    schema: 'agentsam.campaign.ranking/v2',
    kind: 'campaign-concept-ranking',
    ranked: ranked.map((row, index) => ({ rank: index + 1, ...row })),
    deterministic: true,
    guarantee: 'none',
  };
}

export function campaignSeoPlan(input = {}, rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const terms = arr(
    input.terms ??
    context.search?.opportunities ??
    context.search?.queries ??
    context.search?.terms
  );
  return {
    schema: 'agentsam.campaign.seo-plan/v1',
    kind: 'campaign-seo-plan',
    objective: input.objective || null,
    terms,
    pages: arr(input.pages),
    evidence: context.search,
    missing_evidence: context.search ? [] : ['search'],
    actions: terms.length
      ? terms.map((term) => ({ term, action: 'map_to_relevant_campaign_content' }))
      : [],
    guarantee: 'none',
  };
}

export function campaignChannelPlan(concept = {}, rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const channels = arr(concept.channels);
  return {
    schema: 'agentsam.campaign.channel-plan/v1',
    kind: 'campaign-channel-plan',
    channels: channels.map((channel) => ({
      channel,
      fit: channelFit({ channels: [channel] }, context),
    })),
    evidence: context.performance?.channels || context.channels || null,
    missing_evidence: context.performance?.channels || context.channels ? [] : ['channel_performance'],
    guarantee: 'none',
  };
}

export function campaignExperimentPlan({ brief, concept, variants = [], context = {} } = {}) {
  if (!brief) throw new Error('campaign_experiment_requires_brief');
  if (!concept) throw new Error('campaign_experiment_requires_concept');
  const metrics = arr(brief.success_metrics);
  return {
    schema: 'agentsam.campaign.experiment/v1',
    kind: 'campaign-experiment',
    id: stableId('campaign-experiment', { brief: brief.id, concept: concept.id || concept.name, variants }),
    brief_id: brief.id || null,
    concept_id: concept.id || stableId('campaign-concept', concept),
    variants: arr(variants),
    metrics,
    measurement_ready: metrics.length > 0,
    missing_evidence: metrics.length ? [] : ['success_metrics'],
    context_evidence: describeCampaignEvidence(context),
    status: 'draft',
  };
}

export function campaignPerformanceEvaluate({ outcome = {}, objective = null, context = {} } = {}) {
  const metrics = outcome.metrics && typeof outcome.metrics === 'object' ? outcome.metrics : {};
  const declared = arr(outcome.success_metrics ?? context?.constraints?.success_metrics);
  const observed = Object.keys(metrics);
  const coverage = declared.length
    ? declared.filter((key) => Object.hasOwn(metrics, key)).length / declared.length
    : (observed.length ? 1 : 0);
  return {
    schema: 'agentsam.campaign.performance-evaluation/v1',
    kind: 'campaign-performance-evaluation',
    objective,
    metrics,
    metric_coverage: Number(coverage.toFixed(3)),
    evidence_quality: describeCampaignEvidence(context).quality,
    missing_metrics: declared.filter((key) => !Object.hasOwn(metrics, key)),
    guarantee: 'none',
  };
}

export function campaignReview({ brief = null, plan = null, outcome = null, context = {} } = {}) {
  return {
    schema: 'agentsam.campaign.review/v1',
    kind: 'campaign-review',
    brief_id: brief?.id || null,
    plan_id: plan?.id || null,
    outcome_id: outcome?.id || null,
    performance: outcome ? campaignPerformanceEvaluate({
      outcome,
      objective: brief?.objective || plan?.objective || null,
      context,
    }) : null,
    evidence: describeCampaignEvidence(context),
    status: outcome ? 'measured' : 'awaiting_outcome',
  };
}

export function campaignLearnings(outcomes = [], rawContext = {}) {
  const context = normalizeCampaignContext(rawContext);
  const rows = arr(outcomes);
  const tagged = new Map();
  for (const outcome of rows) {
    for (const tag of arr(outcome.tags ?? outcome.channels ?? outcome.product_ids)) {
      const key = String(tag);
      const current = tagged.get(key) || { key, observations: 0, successes: 0 };
      current.observations += 1;
      if (outcome.success === true || outcome.status === 'success') current.successes += 1;
      tagged.set(key, current);
    }
  }
  return {
    schema: 'agentsam.campaign.learnings/v1',
    kind: 'campaign-learning-set',
    outcome_count: rows.length,
    observations: [...tagged.values()].map((row) => ({
      ...row,
      success_rate: row.observations ? Number((row.successes / row.observations).toFixed(3)) : null,
    })),
    evidence: describeCampaignEvidence({ ...context, outcomes: rows }),
    limitations: rows.length ? [] : ['no_campaign_outcomes'],
    guarantee: 'none',
  };
}

export function buildCampaignPlan({ brief, concept, context = {} } = {}) {
  if (!brief || brief.kind !== 'campaign-brief') {
    throw new Error('campaign_plan_requires_brief');
  }
  if (!concept) throw new Error('campaign_plan_requires_concept');

  const evaluation = evaluateCampaignConcept(concept, context);
  const channelPlan = campaignChannelPlan(concept, context);

  return {
    schema: 'agentsam.campaign.plan/v2',
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
    channel_plan: channelPlan,
    evaluation,
    evidence: describeCampaignEvidence(context),
    stages: [
      { id: 'ground', title: 'Verify brand, product, inventory, audience, economics, search, and performance evidence' },
      { id: 'prepare', title: 'Prepare campaign copy and creative requirements' },
      { id: 'review', title: 'Review offer, margins, inventory, evidence gaps, and brand consistency' },
      { id: 'launch', title: 'Launch only after explicit user approval through an authorized execution capability' },
      { id: 'measure', title: 'Measure outcomes against declared success metrics' },
      { id: 'learn', title: 'Persist observed outcomes and use them as evidence for later campaigns' },
    ],
    success_metrics: brief.success_metrics,
    guarantee: 'none',
  };
}
