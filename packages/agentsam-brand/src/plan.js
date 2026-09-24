/**
 * brand.plan — structured refinement proposal (deterministic skeleton).
 * Model may later enrich; this always returns preserve/normalize actions from evidence.
 */
export function brandPlan({ scan, resolved, contract } = {}) {
  if (!scan || scan.capability !== 'brand.scan') throw new Error('brand_plan_requires_scan');
  const resolve = resolved || null;
  const duplicateColors = (scan.conflicts || []).filter((c) => c.kind === 'near_duplicate_color').length;
  const colorCount = scan.tokens?.colors?.length || 0;
  const buttonFamilies = scan.patterns?.button_families || 0;
  const headerFamilies = scan.patterns?.header_families || 0;

  const current_state = {
    brand_scan_complete: true,
    canonical_color_tokens: false,
    duplicate_color_count: duplicateColors,
    color_token_count: colorCount,
    canonical_typography: (scan.tokens?.typography?.length || 0) <= 8,
    shared_button_component: buttonFamilies <= 1 ? true : buttonFamilies <= 2 ? 'partial' : false,
    header_consistency: headerFamilies <= 1 ? true : headerFamilies <= 2 ? 'partial' : false,
  };

  const goal_state = {
    canonical_color_tokens: true,
    duplicate_color_count_max: 3,
    canonical_typography: true,
    shared_button_component: true,
    header_consistency: true,
  };

  const steps = [
    {
      id: 'preserve_observed_identity',
      action: 'preserve',
      title: 'Preserve observed visual identity',
      reason: 'Adoption-first: do not impose a foreign design system',
    },
    {
      id: 'establish-color-token-map',
      action: 'normalize',
      title: 'Establish canonical color token map',
      reason: `${colorCount} colors observed; ${duplicateColors} near-duplicate pairs`,
      requires: { brand_scan_complete: true },
      effects: { canonical_color_tokens: true },
      cost: 2,
    },
  ];

  if (duplicateColors > 3) {
    steps.push({
      id: 'migrate-color-aliases',
      action: 'migrate',
      title: 'Migrate duplicated color aliases',
      reason: 'Collapse near-equivalent colors behind resolved tokens',
      requires: { canonical_color_tokens: true },
      effects: { duplicate_color_count_max: 3 },
      cost: 6,
    });
  }

  if (buttonFamilies > 1) {
    steps.push({
      id: 'consolidate-button-family',
      action: 'consolidate',
      title: 'Consolidate Button primitive family',
      reason: `${buttonFamilies} button-related component families detected`,
      effects: { shared_button_component: true },
      cost: 8,
    });
  }

  if (headerFamilies > 1) {
    steps.push({
      id: 'migrate-header-family',
      action: 'investigate',
      title: 'Investigate competing header/nav systems',
      reason: `${headerFamilies} header/nav families detected`,
      effects: { header_consistency: true },
      cost: 7,
    });
  }

  steps.push({
    id: 'verify-brand-surfaces',
    action: 'verify',
    title: 'Verify brand surfaces after changes',
    reason: 'Deterministic verify gate after apply',
    cost: 1,
  });

  const ambiguities = resolve?.ambiguities || [];

  return {
    schema_version: 1,
    capability: 'brand.plan',
    deterministic: true,
    model_required: false,
    model_assisted_optional: true,
    side_effects: 'none',
    philosophy: 'discover → understand → preserve → normalize → improve',
    repository: scan.repository,
    current_state,
    goal_state,
    steps,
    ambiguities,
    contract_id: contract?.id || null,
    summary: {
      colors: colorCount,
      near_duplicate_pairs: duplicateColors,
      button_families: buttonFamilies,
      header_families: headerFamilies,
      typography_tokens: scan.tokens?.typography?.length || 0,
    },
  };
}
