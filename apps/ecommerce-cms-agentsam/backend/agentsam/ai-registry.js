/**
 * AgentSam Workers AI model registry — D1-backed selection and fallback chains.
 */

import { FNF_ACCOUNT_ID } from "./constants.js";

const ACTIVE_STATUSES = ["active", "experimental"];
const CHAT_TASK_TYPES = new Set([
  "text_generation",
  "code_generation",
  "image_generation",
  "image_to_text",
]);

function parseJson(raw, fallback = null) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    provider: row.provider,
    model_id: row.model_id,
    display_name: row.display_name,
    description: row.description,
    task_type: row.task_type,
    lane: row.lane,
    status: row.status,
    priority: row.priority,
    is_default: !!row.is_default,
    is_fallback: !!row.is_fallback,
    supports_json: !!row.supports_json,
    supports_tools: !!row.supports_tools,
    supports_vision: !!row.supports_vision,
    supports_streaming: !!row.supports_streaming,
    context_window_tokens: row.context_window_tokens,
    max_output_tokens: row.max_output_tokens,
    quality_score: row.quality_score,
    speed_score: row.speed_score,
    cost_tier: row.cost_tier,
    workflow_keys: parseJson(row.workflow_keys_json, []),
    routing_keywords: parseJson(row.routing_keywords_json, []),
    capabilities: parseJson(row.capabilities_json, []),
    request_defaults: parseJson(row.request_defaults_json, {}),
    request_defaults_json: row.request_defaults_json,
    notes: row.notes,
  };
}

function matchesWorkflow(model, workflowKey) {
  const keys = model.workflow_keys || [];
  if (!keys.length) return true;
  if (!workflowKey) return true;
  return keys.includes(workflowKey);
}

function keywordBoost(model, message) {
  const hay = String(message || "").toLowerCase();
  const keywords = model.routing_keywords || [];
  let boost = 0;
  for (const kw of keywords) {
    const k = String(kw || "").toLowerCase();
    if (k && hay.includes(k)) boost -= 5;
  }
  return boost;
}

function sortModels(models, message) {
  return [...models].sort((a, b) => {
    const pa = a.priority + keywordBoost(a, message);
    const pb = b.priority + keywordBoost(b, message);
    if (pa !== pb) return pa - pb;
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return String(a.model_id).localeCompare(String(b.model_id));
  });
}

/**
 * Map chat intent + message to registry task_type / lane.
 */
export function resolveAIRouting(classification, message, context = {}) {
  const intent = classification?.intent || "general";
  const workflowKey =
    classification?.workflow_key || context.workflow_key || "fnf_agentsam_chat";
  const hay = String(message || "").toLowerCase();

  const attachmentImage = (context.attachments || []).find(
    (a) => a?.image_base64 || (a?.kind === "image" && a?.url)
  );

  const hasImage = Boolean(
    context.has_image ||
      context.attachment_url ||
      context.image_url ||
      context.image_base64 ||
      attachmentImage
  );

  const wantsImage =
    /\b(generate|create|make|design|draw|produce|render)\b.*\b(image|banner|logo|graphic|visual|mockup|thumbnail|photo)\b/.test(
      hay
    ) ||
    /\b(image|banner|logo|mockup|graphic|visual)\b.*\b(for|of)\b/.test(hay) ||
    (intent === "creative" &&
      /\b(generate|create|design|mockup|banner|logo)\b/.test(hay) &&
      !/\b(review|analyze|describe|check)\b/.test(hay));

  const wantsVision =
    hasImage ||
    /\b(review|analyze|analyse|describe|check|look at|brand fit|attachment|product photo|visual review|does this logo)\b/.test(
      hay
    );

  const repoRelated =
    intent === "code" ||
    /\b(repo|github|commit|branch|pull request|\bpr\b|debug|refactor|worker|cloudflare|sql|migration|typescript|javascript|implementation)\b/.test(
      hay
    );

  const contentRelated =
    intent === "content" ||
    /\b(copy|email|seo|headline|caption|blog|newsletter|product description|meta description|rewrite|summarize)\b/.test(
      hay
    );

  const base = {
    intent,
    workflow_key: workflowKey,
    has_image: hasImage,
    wants_image: wantsImage,
    repo_related: repoRelated,
    content_related: contentRelated,
    message,
    image_url: context.attachment_url || context.image_url || attachmentImage?.url || null,
    image_base64: context.image_base64 || attachmentImage?.image_base64 || null,
  };

  if (/\b(moderation|unsafe|policy violation|content guard|llama guard)\b/.test(hay)) {
    return { ...base, task_type: "safety", lane: "safety" };
  }

  if (/\b(rerank|re-rank|rank results|retrieval quality)\b/.test(hay)) {
    return { ...base, task_type: "rerank", lane: "retrieval" };
  }

  if (/\b(embedding|semantic search|vector search|rag retrieval)\b/.test(hay)) {
    return { ...base, task_type: "embedding", lane: "embedding" };
  }

  if (/\b(transcribe|voice note|speech to text|dictation)\b/.test(hay)) {
    return { ...base, task_type: "speech_to_text", lane: "audio" };
  }

  if (/\b(text to speech|tts|voice output|speak this)\b/.test(hay)) {
    return { ...base, task_type: "text_to_speech", lane: "audio" };
  }

  // If image is attached, always route vision — no keywords required
  if (hasImage) {
    return { ...base, task_type: "image_to_text", lane: "vision" };
  }

  // Image generation — detect intent regardless of workflow
  if (wantsImage) {
    const lane = /\b(quick|draft|fast)\b/.test(hay) ? "image_fast" : "image";
    return { ...base, task_type: "image_generation", lane };
  }

  if (repoRelated) {
    return { ...base, task_type: "code_generation", lane: "code" };
  }

  return { ...base, task_type: "text_generation", lane: "general" };
}

/** Chat endpoint: auxiliary task types still get a conversational text/code reply. */
export function normalizeChatRouting(routing) {
  if (!routing) {
    return { task_type: "text_generation", lane: "general" };
  }

  if (
    routing.task_type === "image_to_text" &&
    !routing.has_image &&
    !routing.image_url &&
    !routing.image_base64
  ) {
    return {
      ...routing,
      task_type: routing.repo_related ? "code_generation" : "text_generation",
      lane: routing.repo_related ? "code" : "general",
      vision_downgraded: true,
    };
  }

  if (CHAT_TASK_TYPES.has(routing.task_type)) return routing;

  const task_type = routing.repo_related ? "code_generation" : "text_generation";
  const lane = routing.repo_related ? "code" : "general";
  return {
    ...routing,
    task_type,
    lane,
    auxiliary_task_type: routing.task_type,
  };
}

export async function getAIModels(env, options = {}) {
  const accountId = options.account_id || FNF_ACCOUNT_ID;
  const includeDisabled = options.includeDisabled === true;

  if (!env.DB) return [];

  const statuses = includeDisabled
    ? ["active", "experimental", "disabled", "deprecated"]
    : options.statuses || ACTIVE_STATUSES;

  const clauses = [`account_id = ?`, `status IN (${statuses.map(() => "?").join(",")})`];
  const binds = [accountId, ...statuses];

  if (options.task_type) {
    clauses.push("task_type = ?");
    binds.push(options.task_type);
  }
  if (options.lane) {
    clauses.push("lane = ?");
    binds.push(options.lane);
  }
  if (options.fallbackOnly) {
    clauses.push("is_fallback = 1");
  }

  try {
    const { results } = await env.DB.prepare(
      `SELECT *
       FROM agentsam_ai
       WHERE ${clauses.join(" AND ")}
       ORDER BY task_type ASC, lane ASC, priority ASC`
    )
      .bind(...binds)
      .all();

    return (results || []).map(mapRow).filter(Boolean);
  } catch (err) {
    console.error("agentsam ai registry query failed", err?.message || err);
    return [];
  }
}

export async function getFallbackChain(env, routing = {}) {
  const normalized = normalizeChatRouting(routing);
  const { task_type, lane, workflow_key, message } = normalized;
  const models = await getAIModels(env, {
    task_type,
    lane,
    fallbackOnly: true,
  });

  let chain = models.filter((m) => matchesWorkflow(m, workflow_key));

  if (!chain.length && lane !== "general") {
    const broader = await getAIModels(env, { task_type, fallbackOnly: true });
    chain = broader.filter((m) => matchesWorkflow(m, workflow_key));
  }

  chain = sortModels(chain, message);

  if (!chain.length) {
    console.warn('[agentsam] no models found for routing', { task_type, lane, workflow_key });
    return [];
  }

  return chain;
}

export async function selectAIModel(env, routing = {}) {
  const chain = await getFallbackChain(env, routing);
  return chain[0] || null;
}

export async function getDefaultModelId(env, taskType, lane) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare(
      `SELECT model_id
       FROM agentsam_ai
       WHERE account_id = ?
         AND task_type = ?
         AND lane = ?
         AND is_default = 1
         AND status IN ('active','experimental')
       ORDER BY priority ASC
       LIMIT 1`
    )
      .bind(FNF_ACCOUNT_ID, taskType, lane)
      .first();
    return row?.model_id || null;
  } catch {
    return null;
  }
}

export async function getAIRegistryStatus(env) {
  const bindingConfigured = Boolean(env.AGENTSAM_WAI);

  let aiRegistryCount = 0;
  let disabledModelCount = 0;

  try {
    if (env.DB) {
      const total = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agentsam_ai WHERE account_id = ? AND status IN ('active','experimental')`
      )
        .bind(FNF_ACCOUNT_ID)
        .first();
      aiRegistryCount = total?.n ?? 0;

      const disabled = await env.DB.prepare(
        `SELECT COUNT(*) AS n FROM agentsam_ai WHERE account_id = ? AND status = 'disabled'`
      )
        .bind(FNF_ACCOUNT_ID)
        .first();
      disabledModelCount = disabled?.n ?? 0;
    }
  } catch {
    /* table may not exist yet */
  }

  const [
    defaultTextModel,
    defaultCodeModel,
    defaultImageModel,
    defaultVisionModel,
  ] = await Promise.all([
    getDefaultModelId(env, "text_generation", "general"),
    getDefaultModelId(env, "code_generation", "code"),
    getDefaultModelId(env, "image_generation", "image"),
    getDefaultModelId(env, "image_to_text", "vision"),
  ]);

  return {
    ai_binding_configured: bindingConfigured,
    ai_registry_count: aiRegistryCount,
    default_text_model: defaultTextModel,
    default_code_model: defaultCodeModel,
    default_image_model: defaultImageModel,
    default_vision_model: defaultVisionModel,
    disabled_model_count: disabledModelCount,
  };
}

export async function listAIModelsGrouped(env) {
  const models = await getAIModels(env);
  const grouped = {};

  for (const model of models) {
    if (!grouped[model.task_type]) grouped[model.task_type] = {};
    if (!grouped[model.task_type][model.lane]) grouped[model.task_type][model.lane] = [];
    grouped[model.task_type][model.lane].push({
      id: model.id,
      model_id: model.model_id,
      display_name: model.display_name,
      description: model.description,
      status: model.status,
      priority: model.priority,
      is_default: model.is_default,
      is_fallback: model.is_fallback,
      cost_tier: model.cost_tier,
      quality_score: model.quality_score,
      speed_score: model.speed_score,
      capabilities: model.capabilities,
    });
  }

  return { grouped, total: models.length };
}
