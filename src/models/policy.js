function clean(value) { return value == null ? '' : String(value).trim(); }

export function normalizeModelPolicy(row = {}) {
  const out = {};
  for (const key of ['target_input_tokens','compact_at_tokens','intervene_at_tokens','max_normal_input_tokens','pricing_threshold_tokens','max_cumulative_input_tokens','safety_margin_tokens']) {
    if (row[key] != null && Number.isFinite(Number(row[key]))) out[key] = Math.floor(Number(row[key]));
  }
  if (row.compaction_strategy) out.compaction_strategy = clean(row.compaction_strategy);
  return Object.freeze(out);
}

export async function loadModelPolicy(db, { provider, modelKey }) {
  if (!db?.prepare) throw new TypeError('database_required');
  const row = await db.prepare(`
    SELECT * FROM agentsam_model_policies
    WHERE provider = ? AND model_key = ? AND is_active = 1
    LIMIT 1
  `).bind(clean(provider), clean(modelKey)).first();
  return row ? normalizeModelPolicy(row) : null;
}
