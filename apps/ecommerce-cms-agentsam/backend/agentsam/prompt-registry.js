/**
 * AgentSam prompt registry — templates, fragments, and prompt pack assembly.
 */

import { FNF_ACCOUNT_ID } from "./constants.js";
import { estimateTokens } from "./analytics.js";

const PREVIEW_MAX = 480;
const BASE_FRAGMENT_KEYS = [
  "fnf_scope",
  "fnf_feature_gates",
  "agentsam_response_style",
  "agentsam_tool_policy",
  "agentsam_storage_policy",
  "agentsam_quality_gate",
];

function parseJson(raw, fallback = null) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

export async function hashText(text) {
  const s = String(text || "");
  if (!s) return "";
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return String(s.length);
  }
}

export { estimateTokens };

export function renderTemplate(templateText, variables = {}) {
  let out = String(templateText || "");
  for (const [key, value] of Object.entries(variables)) {
    out = out.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "g"), String(value ?? ""));
  }
  return out.replace(/\{\{\s*[a-zA-Z0-9_]+\s*\}\}/g, "").trim();
}

function previewText(text, max = PREVIEW_MAX) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function fragmentApplies(fragment, options = {}) {
  const applies = parseJson(fragment.applies_to_json, {}) || {};
  if (!Object.keys(applies).length) return true;

  if (applies.workflows?.length && options.workflow_key) {
    if (!applies.workflows.includes(options.workflow_key)) return false;
  }
  if (applies.lanes?.length && options.route_lane) {
    if (!applies.lanes.includes(options.route_lane)) return false;
  }
  if (applies.intents?.length && options.intent) {
    if (!applies.intents.includes(options.intent)) return false;
  }
  if (applies.task_types?.length && options.task_type) {
    if (!applies.task_types.includes(options.task_type)) return false;
  }
  return true;
}

export async function loadPromptTemplate(env, options = {}) {
  if (!env?.DB) return null;

  const { workflow_key, route_lane, task_type, model_id, prompt_key } = options;

  if (prompt_key) {
    return env.DB.prepare(
      `SELECT * FROM agentsam_prompts
       WHERE account_id = ? AND prompt_key = ? AND status = 'active'
       ORDER BY version DESC LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, prompt_key)
      .first();
  }

  const rows = await env.DB.prepare(
    `SELECT * FROM agentsam_prompts
     WHERE account_id = ? AND status = 'active'
       AND (workflow_key IS NULL OR workflow_key = ?)
       AND (route_lane IS NULL OR route_lane = ?)
       AND (task_type IS NULL OR task_type = ?)
       AND (model_id IS NULL OR model_id = ?)
     ORDER BY
       CASE WHEN workflow_key = ? THEN 0 WHEN workflow_key IS NULL THEN 1 ELSE 2 END,
       CASE WHEN route_lane = ? THEN 0 WHEN route_lane IS NULL THEN 1 ELSE 2 END,
       CASE WHEN task_type = ? THEN 0 WHEN task_type IS NULL THEN 1 ELSE 2 END,
       priority ASC,
       version DESC`
  )
    .bind(
      FNF_ACCOUNT_ID,
      workflow_key || "",
      route_lane || "",
      task_type || "",
      model_id || "",
      workflow_key || "",
      route_lane || "",
      task_type || ""
    )
    .all();

  const results = rows.results || [];
  if (!results.length) {
    return env.DB.prepare(
      `SELECT * FROM agentsam_prompts
       WHERE account_id = ? AND prompt_key = 'fnf_agentsam_base_system' AND status = 'active'
       ORDER BY version DESC LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID)
      .first();
  }

  const wfMatch = results.find((r) => r.workflow_key === workflow_key);
  if (wfMatch) return wfMatch;

  const laneMatch = results.find((r) => r.route_lane === route_lane && !r.workflow_key);
  if (laneMatch) return laneMatch;

  return results.find((r) => r.prompt_key === "fnf_agentsam_base_system") || results[0];
}

export async function loadPromptFragments(env, options = {}) {
  if (!env?.DB) return [];

  const { results } = await env.DB.prepare(
    `SELECT * FROM agentsam_prompt_fragments
     WHERE account_id = ? AND status = 'active'
     ORDER BY priority ASC, fragment_key ASC`
  )
    .bind(FNF_ACCOUNT_ID)
    .all();

  const seen = new Set();
  const out = [];

  const wantedKeys = new Set(BASE_FRAGMENT_KEYS);
  if (options.workflow_key === "fnf_content_studio" || options.workflow_key === "fnf_creative_studio" || options.workflow_key === "fnf_brand_refresh") {
    wantedKeys.add("fnf_brand_voice");
  }
  if (options.route_lane === "code" || options.intent === "code") {
    wantedKeys.add("agentsam_repo_policy");
  }
  if (options.include_tools) {
    wantedKeys.add("agentsam_tool_policy");
  }

  for (const row of results || []) {
    if (seen.has(row.fragment_key)) continue;
    if (wantedKeys.size && !wantedKeys.has(row.fragment_key) && !fragmentApplies(row, options)) {
      continue;
    }
    if (!wantedKeys.has(row.fragment_key) && !fragmentApplies(row, options)) continue;
    seen.add(row.fragment_key);
    out.push(row);
  }

  for (const key of BASE_FRAGMENT_KEYS) {
    if (seen.has(key)) continue;
    const row = (results || []).find((r) => r.fragment_key === key);
    if (row) {
      seen.add(key);
      out.push(row);
    }
  }

  return out.sort((a, b) => (a.priority || 100) - (b.priority || 100));
}

export async function buildPromptPack(env, routing = {}, context = {}, options = {}) {
  const aiRouting = routing.ai_routing || {};
  const workflowKey = routing.classification?.workflow_key || context.workflow_key;
  const routeLane = aiRouting.lane || aiRouting.model_lane || context.lane;
  const taskType = aiRouting.task_type || context.task_type;
  const intent = routing.classification?.intent;

  const template = await loadPromptTemplate(env, {
    workflow_key: workflowKey,
    route_lane: routeLane,
    task_type: taskType,
    model_id: options.model_id,
  });

  const fragments = await loadPromptFragments(env, {
    workflow_key: workflowKey,
    route_lane: routeLane,
    task_type: taskType,
    intent,
    include_tools: Boolean(routing.tools?.length),
  });

  const variables = {
    ...parseJson(template?.default_variables_json, {}),
    workflow_key: workflowKey || "",
    route_lane: routeLane || "",
    task_type: taskType || "",
    brand: "Fuel & Free Time",
  };

  const fragmentBlocks = fragments.map((f) => f.content_text).filter(Boolean);
  const templateBody = template
    ? renderTemplate(template.template_text, variables)
    : "You are Agent Sam for Fuel & Free Time.";

  const systemPrompt = [...fragmentBlocks, templateBody].filter(Boolean).join("\n\n");
  const promptKeys = template ? [template.prompt_key] : ["fnf_agentsam_base_system"];
  const fragmentKeys = fragments.map((f) => f.fragment_key);
  const promptHash = await hashText(`${promptKeys.join("|")}:${fragmentKeys.join("|")}:${systemPrompt}`);

  return {
    systemPrompt,
    developerPrompt: null,
    promptKeys,
    fragmentKeys,
    promptHash,
    estimatedTokens: estimateTokens(systemPrompt),
    compiledPreview: previewText(systemPrompt),
    template,
    fragments,
  };
}

export async function listPromptTemplates(env) {
  if (!env?.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT prompt_key, prompt_type, workflow_key, route_lane, task_type, status, version, priority, estimated_tokens
     FROM agentsam_prompts WHERE account_id = ? ORDER BY prompt_type, priority`
  )
    .bind(FNF_ACCOUNT_ID)
    .all();
  return results || [];
}

export async function listPromptFragments(env) {
  if (!env?.DB) return [];
  const { results } = await env.DB.prepare(
    `SELECT fragment_key, fragment_type, priority, status, estimated_tokens, version
     FROM agentsam_prompt_fragments WHERE account_id = ? ORDER BY priority`
  )
    .bind(FNF_ACCOUNT_ID)
    .all();
  return results || [];
}

export async function invalidatePromptRegistryCaches(env, reason = "registry_changed") {
  if (!env?.DB) return;
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agentsam_prompt_cache SET status = 'invalidated', invalidation_reason = ?, updated_at = datetime('now')
     WHERE account_id = ? AND status = 'active'`
  )
    .bind(reason, FNF_ACCOUNT_ID)
    .run();
}
