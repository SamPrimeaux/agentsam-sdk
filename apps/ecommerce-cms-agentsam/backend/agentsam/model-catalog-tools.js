/**
 * Installed-model metadata from the canonical D1 model tables.
 *
 * This is a read-only adapter. It does not select, activate or dispatch a model.
 * No fallback to agentsam_ai: an unready catalog must report unready.
 * The session's account authority is supplied by the caller, never by params.
 */
import { requireApplicationAccountId } from "../lib/account-context.js";

const INPUT_KEYS = new Set([
  "provider", "model_kind", "include_inactive", "routing_eligible_only",
  "picker_only", "include_pricing", "include_retrieval_lanes", "limit",
]);

export async function listCatalogModels(env, input = {}) {
  if (!env?.DB?.prepare) return { ok: false, error: "DB_not_bound" };
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "invalid_input" };
  }
  for (const [key, value] of Object.entries(input)) {
    if (!INPUT_KEYS.has(key)) return { ok: false, error: "unknown_input_field", field: key };
    if (["include_inactive", "routing_eligible_only", "picker_only", "include_pricing", "include_retrieval_lanes"].includes(key) && typeof value !== "boolean") {
      return { ok: false, error: "invalid_boolean", field: key };
    }
  }
  const limit = input.limit === undefined ? 50 : input.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { ok: false, error: "invalid_limit" };
  }
  for (const field of ["provider", "model_kind"]) {
    if (input[field] !== undefined && (typeof input[field] !== "string" || !input[field].trim() || input[field].length > 80)) {
      return { ok: false, error: "invalid_filter", field };
    }
  }

  const clauses = [];
  const binds = [];
  if (!input.include_inactive) clauses.push("c.is_active = 1");
  if (input.routing_eligible_only) clauses.push("c.is_active = 1 AND p.is_active = 1 AND p.routing_eligible = 1");
  if (input.picker_only) clauses.push("c.show_in_picker = 1");
  if (input.provider) { clauses.push("c.provider = ?"); binds.push(input.provider.trim()); }
  if (input.model_kind) { clauses.push("c.model_kind = ?"); binds.push(input.model_kind.trim()); }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";

  try {
    const { results } = await env.DB.prepare(
      `SELECT c.model_key, c.api_model_id, c.display_name, c.provider, c.model_kind,
              c.tier, c.context_window, c.max_output_tokens, c.lifecycle_status,
              c.effort_default, c.effort_param, c.effort_levels_json,
              c.is_active, c.show_in_picker, c.supports_tools, c.supports_vision,
              c.supports_streaming, c.supports_json_mode, c.supports_reasoning,
              c.specs_verified_at,
              p.is_active AS policy_active, p.routing_eligible,
              p.requires_owner_approval, p.requires_budget_gate, p.requires_artifact_capture,
              p.target_input_tokens, p.compact_at_tokens, p.intervene_at_tokens,
              p.max_normal_input_tokens, p.max_cumulative_input_tokens,
              p.safety_margin_tokens, p.pricing_threshold_tokens,
              p.compaction_strategy, p.policy_source,
              (SELECT COUNT(*) FROM agentsam_model_pricing pr
               WHERE pr.model_key = c.model_key AND pr.is_active = 1
                 AND pr.effective_from <= unixepoch()
                 AND (pr.effective_to IS NULL OR pr.effective_to > unixepoch())) AS current_price_rows,
              (SELECT COUNT(*) FROM agentsam_model_pricing pr
               WHERE pr.model_key = c.model_key AND pr.is_active = 1
                 AND pr.verified_at IS NOT NULL AND pr.effective_from <= unixepoch()
                 AND (pr.effective_to IS NULL OR pr.effective_to > unixepoch())) AS verified_price_rows
         FROM agentsam_model_catalog c
         LEFT JOIN agentsam_model_policies p ON p.model_key = c.model_key
         ${where}
         ORDER BY c.provider, c.display_name, c.model_key
         LIMIT ?`
    ).bind(...binds, limit).all();
    const models = (results || []).map((row) => ({
      ...row,
      is_active: row.is_active === 1,
      show_in_picker: row.show_in_picker === 1,
      supports_tools: row.supports_tools === 1,
      supports_vision: row.supports_vision === 1,
      supports_streaming: row.supports_streaming === 1,
      supports_json_mode: row.supports_json_mode === 1,
      supports_reasoning: row.supports_reasoning === 1,
      effort_levels: typeof row.effort_levels_json === "string" && row.effort_levels_json
        ? (() => { try { return JSON.parse(row.effort_levels_json); } catch { return []; } })()
        : [],
      policy_active: row.policy_active === 1,
      routing_eligible: row.policy_active === 1 && row.routing_eligible === 1 && row.is_active === 1,
      requires_owner_approval: row.requires_owner_approval === 1,
      requires_budget_gate: row.requires_budget_gate === 1,
      requires_artifact_capture: row.requires_artifact_capture === 1,
      pricing_verified: Number(row.current_price_rows) > 0 && Number(row.verified_price_rows) === Number(row.current_price_rows),
    }));
    const result = {
      ok: true,
      source: "agentsam_model_catalog",
      policy_source: "agentsam_model_policies",
      models,
      count: models.length,
      truncated_possible: models.length === limit,
      note: models.length ? "Catalog flags do not verify provider connectivity." : "No models match the requested catalog eligibility; legacy agentsam_ai was not substituted.",
    };

    if (input.include_pricing) {
      // A second bounded lookup avoids a one-to-many pricing join duplicating model rows.
      const keys = models.map((model) => model.model_key);
      const priceRows = keys.length
        ? (await env.DB.prepare(
            `SELECT model_key, pricing_kind, meter, unit_size, rate_usd,
                    min_input_tokens, max_input_tokens, effective_from, effective_to,
                    source_url, verified_at, pricing_version
               FROM agentsam_model_pricing
               WHERE is_active = 1 AND effective_from <= unixepoch()
                 AND (effective_to IS NULL OR effective_to > unixepoch())
                 AND model_key IN (${keys.map(() => "?").join(",")})
               ORDER BY model_key, pricing_kind, meter, min_input_tokens`
          ).bind(...keys).all()).results || []
        : [];
      result.pricing = priceRows.map((row) => ({ ...row, verified: row.verified_at != null }));
      result.pricing_source = "agentsam_model_pricing";
    }

    if (input.include_retrieval_lanes) {
      const accountId = requireApplicationAccountId();
      const { results: lanes } = await env.DB.prepare(
        `SELECT l.id, l.purpose, l.backend_kind, l.embedding_model, l.dimensions,
                l.metric, l.binding_name, l.index_name,
                COUNT(ch.chunk_id) AS tracked_chunks
           FROM agentsam_pgvector_lane_registry l
           LEFT JOIN agentsam_vector_chunks ch
             ON ch.account_id = ? AND ch.vectorize_index = l.index_name
           WHERE l.is_active = 1 AND l.is_archive = 0 AND l.account_id = ?
           GROUP BY l.id
           ORDER BY l.table_name LIMIT 100`
      ).bind(accountId, accountId).all();
      result.retrieval_lanes = (lanes || []).map((lane) => ({
        ...lane,
        runtime_binding_available: Boolean(lane.binding_name && typeof env[lane.binding_name]?.query === "function"),
      }));
      result.retrieval_note = "Retrieval lanes are installation-scoped indexes, not chat-model catalog entries; chunk counts are metadata rows, not proof of healthy retrieval.";
    }
    return result;
  } catch (error) {
    return { ok: false, error: "model_catalog_query_failed", message: String(error?.message || error).slice(0, 220) };
  }
}
