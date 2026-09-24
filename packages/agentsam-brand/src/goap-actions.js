/**
 * GOAP action catalog for brand coherence (consumed by agentsam-planner / plan brand --goap).
 */
export function brandGoapActions() {
  return [
    {
      id: 'establish-color-token-map',
      cost: 2,
      preconditions: { brand_scan_complete: true, canonical_color_tokens: false },
      effects: { canonical_color_tokens: true },
    },
    {
      id: 'migrate-color-aliases',
      cost: 6,
      preconditions: { canonical_color_tokens: true, duplicate_colors_high: true },
      effects: { duplicate_colors_high: false, duplicate_color_count_ok: true },
    },
    {
      id: 'establish-type-roles',
      cost: 4,
      preconditions: { brand_scan_complete: true, canonical_typography: false },
      effects: { canonical_typography: true },
    },
    {
      id: 'consolidate-button-family',
      cost: 8,
      preconditions: { component_inventory_complete: true, shared_button_component: false },
      effects: { shared_button_component: true },
    },
    {
      id: 'migrate-header-family',
      cost: 7,
      preconditions: { header_consistency: false },
      effects: { header_consistency: true },
    },
    {
      id: 'verify-brand-surfaces',
      cost: 1,
      preconditions: {
        canonical_color_tokens: true,
        duplicate_color_count_ok: true,
        brand_verified: false,
      },
      effects: { brand_verified: true },
    },
  ];
}

export function brandWorldFromPlan(plan) {
  const cur = plan?.current_state || {};
  return {
    brand_scan_complete: cur.brand_scan_complete === true,
    canonical_color_tokens: cur.canonical_color_tokens === true,
    duplicate_colors_high: (cur.duplicate_color_count || 0) > 3,
    duplicate_color_count_ok: (cur.duplicate_color_count || 0) <= 3,
    canonical_typography: cur.canonical_typography === true,
    component_inventory_complete: true,
    shared_button_component: cur.shared_button_component === true,
    header_consistency: cur.header_consistency === true,
    brand_verified: false,
  };
}

export function brandGoalFromPlan(plan) {
  return {
    canonical_color_tokens: true,
    duplicate_color_count_ok: true,
    canonical_typography: true,
    shared_button_component: true,
    header_consistency: true,
    brand_verified: true,
  };
}
