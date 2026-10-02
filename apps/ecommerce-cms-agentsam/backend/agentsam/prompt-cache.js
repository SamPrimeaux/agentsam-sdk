/**
 * AgentSam compiled prompt cache — D1 metadata + KV hot + R2 large payloads.
 */

import { FNF_ACCOUNT_ID } from "./constants.js";
import { estimateTokens, buildPromptPack } from "./prompt-registry.js";

const D1_INLINE_MAX = 4000;
const KV_PREFIX = "agentsam:prompt:";
const R2_PREFIX = "agentsam/prompt-cache/";

const TTL_SECONDS = {
  base: 86400,
  workflow: 43200,
  tool: 900,
  repo: 900,
};

function ttlForPack(routing = {}) {
  const lane = routing.ai_routing?.lane || routing.ai_routing?.model_lane;
  if (lane === "code" || routing.classification?.intent === "code") return TTL_SECONDS.repo;
  if (routing.tools?.length) return TTL_SECONDS.tool;
  if (routing.workflow?.key || routing.classification?.workflow_key) return TTL_SECONDS.workflow;
  return TTL_SECONDS.base;
}

export function buildPromptCacheKey(parts = {}) {
  const segments = [
    parts.account_id || FNF_ACCOUNT_ID,
    parts.workflow_key || "_",
    parts.route_lane || "_",
    parts.task_type || "_",
    parts.model_id || "_",
    parts.prompt_hash || "_",
    parts.context_hash || "_",
    parts.tool_hash || "_",
    parts.skill_hash || "_",
  ];
  return segments.join(":");
}

async function fetchPayload(env, row) {
  if (!row) return null;
  if (row.kv_key && env.CMS_CACHE) {
    try {
      const kv = await env.CMS_CACHE.get(row.kv_key);
      if (kv) return kv;
    } catch {
      /* fall through */
    }
  }
  if (row.r2_key && env.WEBSITE_ASSETS) {
    try {
      const obj = await env.WEBSITE_ASSETS.get(row.r2_key);
      if (obj) return obj.text();
    } catch {
      /* fall through */
    }
  }
  return row.compiled_preview || null;
}

async function storePayload(env, cacheKey, text) {
  const body = String(text || "");
  const kvKey = `${KV_PREFIX}${cacheKey}`;
  const r2Key = `${R2_PREFIX}${cacheKey}.txt`;

  if (body.length <= D1_INLINE_MAX && env.CMS_CACHE) {
    try {
      await env.CMS_CACHE.put(kvKey, body, { expirationTtl: TTL_SECONDS.base });
      return { kv_key: kvKey, r2_key: null };
    } catch {
      /* fall through */
    }
  }

  if (env.WEBSITE_ASSETS) {
    await env.WEBSITE_ASSETS.put(r2Key, body, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    if (env.CMS_CACHE) {
      try {
        await env.CMS_CACHE.put(kvKey, body.slice(0, D1_INLINE_MAX), {
          expirationTtl: TTL_SECONDS.base,
        });
      } catch {
        /* non-blocking */
      }
    }
    return { kv_key: kvKey, r2_key: r2Key };
  }

  return { kv_key: null, r2_key: null };
}

export async function getPromptCache(env, cacheKey) {
  if (!env?.DB || !cacheKey) return null;

  const row = await env.DB.prepare(
    `SELECT * FROM agentsam_prompt_cache
     WHERE account_id = ? AND cache_key = ? AND status = 'active'
       AND (expires_unix IS NULL OR expires_unix > ?)
     LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, cacheKey, Math.floor(Date.now() / 1000))
    .first();

  if (!row) return null;

  const payload = await fetchPayload(env, row);
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agentsam_prompt_cache SET hit_count = hit_count + 1, last_hit_at = datetime('now'), last_hit_unix = ?, updated_at = datetime('now')
     WHERE id = ?`
  )
    .bind(now, row.id)
    .run()
    .catch(() => {});

  return {
    cache_hit: true,
    cache_key: cacheKey,
    systemPrompt: payload,
    prompt_keys: parseJson(row.prompt_keys_json, []),
    fragment_keys: parseJson(row.fragment_keys_json, []),
    prompt_hash: row.prompt_hash,
    estimated_tokens: row.compiled_token_estimate,
    compiled_preview: row.compiled_preview,
  };
}

function parseJson(raw, fallback) {
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

export async function putPromptCache(env, compiledPromptPack, options = {}) {
  if (!env?.DB || !compiledPromptPack?.systemPrompt) return null;

  const cacheKey = options.cache_key;
  if (!cacheKey) return null;

  const ttl = options.ttl_seconds || TTL_SECONDS.base;
  const expiresUnix = Math.floor(Date.now() / 1000) + ttl;
  const storage = await storePayload(env, cacheKey, compiledPromptPack.systemPrompt);
  const id = `pcache_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  await env.DB.prepare(
    `INSERT INTO agentsam_prompt_cache (
       id, account_id, cache_key, prompt_hash, context_hash, tool_hash, model_hash,
       workflow_key, route_lane, task_type, model_id,
       prompt_keys_json, fragment_keys_json, tool_keys_json,
       compiled_preview, compiled_token_estimate, compiled_char_count,
       kv_key, r2_key, miss_count, expires_at, expires_unix, status, metadata_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime(?, 'unixepoch'), ?, 'active', ?)
     ON CONFLICT(account_id, cache_key) DO UPDATE SET
       prompt_hash = excluded.prompt_hash,
       context_hash = excluded.context_hash,
       tool_hash = excluded.tool_hash,
       compiled_preview = excluded.compiled_preview,
       compiled_token_estimate = excluded.compiled_token_estimate,
       compiled_char_count = excluded.compiled_char_count,
       kv_key = excluded.kv_key,
       r2_key = excluded.r2_key,
       miss_count = miss_count + 1,
       expires_at = excluded.expires_at,
       expires_unix = excluded.expires_unix,
       status = 'active',
       updated_at = datetime('now')`
  )
    .bind(
      id,
      FNF_ACCOUNT_ID,
      cacheKey,
      compiledPromptPack.promptHash,
      options.context_hash || null,
      options.tool_hash || null,
      options.model_hash || null,
      options.workflow_key || null,
      options.route_lane || null,
      options.task_type || null,
      options.model_id || null,
      JSON.stringify(compiledPromptPack.promptKeys || []),
      JSON.stringify(compiledPromptPack.fragmentKeys || []),
      JSON.stringify(options.tool_keys || []),
      compiledPromptPack.compiledPreview,
      compiledPromptPack.estimatedTokens,
      compiledPromptPack.systemPrompt.length,
      storage.kv_key,
      storage.r2_key,
      expiresUnix,
      expiresUnix,
      JSON.stringify({ built_at: new Date().toISOString() })
    )
    .run()
    .catch((err) => console.error("putPromptCache failed", err?.message || err));

  return { cache_key: cacheKey, expires_unix: expiresUnix };
}

export async function invalidatePromptCache(env, options = {}) {
  if (!env?.DB) return { invalidated: 0 };
  const reason = options.reason || "manual_invalidation";
  let query = `UPDATE agentsam_prompt_cache SET status = 'invalidated', invalidation_reason = ?, updated_at = datetime('now') WHERE account_id = ? AND status = 'active'`;
  const binds = [reason, FNF_ACCOUNT_ID];

  if (options.workflow_key) {
    query += ` AND workflow_key = ?`;
    binds.push(options.workflow_key);
  }
  if (options.cache_key) {
    query = `UPDATE agentsam_prompt_cache SET status = 'invalidated', invalidation_reason = ?, updated_at = datetime('now') WHERE account_id = ? AND cache_key = ?`;
    binds.length = 0;
    binds.push(reason, FNF_ACCOUNT_ID, options.cache_key);
  }

  const result = await env.DB.prepare(query).bind(...binds).run();
  return { invalidated: result.meta?.changes ?? 0 };
}

export async function getOrBuildPromptPack(env, routing, context, options = {}) {
  const started = Date.now();
  const aiRouting = routing.ai_routing || {};
  const workflowKey = routing.classification?.workflow_key || context.workflow_key;
  const routeLane = aiRouting.lane || aiRouting.model_lane;
  const taskType = aiRouting.task_type;

  let catalogPack;
  try {
    catalogPack = await buildPromptPack(env, routing, context, options);
  } catch (err) {
    console.error("buildPromptPack failed", err?.message || err);
    catalogPack = {
      systemPrompt: "You are Agent Sam for Fuel & Free Time. Be direct, scoped, and helpful.",
      promptKeys: ["fnf_agentsam_base_system"],
      fragmentKeys: [],
      promptHash: "fallback",
      estimatedTokens: 40,
      compiledPreview: "Agent Sam fallback prompt",
    };
  }

  const toolHash = options.tool_hash || "";
  const skillHash = options.skill_hash || "";
  const contextHash = options.context_hash || options.stable_context_hash || "";

  const cacheKey = buildPromptCacheKey({
    account_id: FNF_ACCOUNT_ID,
    workflow_key: workflowKey,
    route_lane: routeLane,
    task_type: taskType,
    model_id: options.model_id,
    prompt_hash: catalogPack.promptHash,
    context_hash: contextHash,
    tool_hash: toolHash,
    skill_hash: skillHash,
  });

  let cached = null;
  try {
    cached = await getPromptCache(env, cacheKey);
  } catch {
    cached = null;
  }

  if (cached?.systemPrompt) {
    return {
      ...catalogPack,
      systemPrompt: cached.systemPrompt,
      cache_hit: true,
      cache_key: cacheKey,
      cache_lookup_ms: Date.now() - started,
      build_duration_ms: 0,
    };
  }

  try {
    await putPromptCache(env, catalogPack, {
      cache_key: cacheKey,
      context_hash: contextHash,
      tool_hash: toolHash,
      workflow_key: workflowKey,
      route_lane: routeLane,
      task_type: taskType,
      model_id: options.model_id,
      tool_keys: (routing.tools || []).map((t) => t.tool_key),
      ttl_seconds: ttlForPack(routing),
    });
  } catch {
    /* non-blocking */
  }

  return {
    ...catalogPack,
    cache_hit: false,
    cache_key: cacheKey,
    cache_lookup_ms: Date.now() - started,
    build_duration_ms: Date.now() - started,
  };
}

export async function summarizePromptCache(env) {
  if (!env?.DB) {
    return { active_entries: 0, hits_24h: 0, misses_24h: 0, estimated_tokens_saved_24h: 0 };
  }

  const since = Math.floor(Date.now() / 1000) - 86400;
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM agentsam_prompt_cache WHERE account_id = ? AND status = 'active'`
  )
    .bind(FNF_ACCOUNT_ID)
    .first();

  const usage = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN prompt_cache_hit = 1 THEN 1 ELSE 0 END) AS hits,
       SUM(CASE WHEN prompt_cache_hit = 0 THEN 1 ELSE 0 END) AS misses,
       SUM(saved_tokens_estimated) AS saved_tokens
     FROM agentsam_prompt_usage
     WHERE account_id = ? AND created_at_unix >= ?`
  )
    .bind(FNF_ACCOUNT_ID, since)
    .first();

  return {
    active_entries: active?.n ?? 0,
    hits_24h: usage?.hits ?? 0,
    misses_24h: usage?.misses ?? 0,
    estimated_tokens_saved_24h: usage?.saved_tokens ?? 0,
  };
}

export async function logPromptUsage(env, data = {}, options = {}) {
  try {
    if (!env?.DB) return { logged: false };

    const write = env.DB.prepare(
      `INSERT INTO agentsam_prompt_usage (
         id, account_id, conversation_id, message_id, run_id,
         workflow_key, route_lane, task_type, model_id,
         prompt_cache_key, context_cache_key,
         prompt_cache_hit, context_cache_hit,
         prompt_tokens_estimated, context_tokens_estimated,
         input_tokens, output_tokens, total_tokens,
         build_duration_ms, cache_lookup_ms,
         saved_tokens_estimated, saved_cost_estimated_usd,
         status, error_message, metadata_json
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      `puse_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      FNF_ACCOUNT_ID,
      data.conversation_id ?? null,
      data.message_id ?? null,
      data.run_id ?? null,
      data.workflow_key ?? null,
      data.route_lane ?? null,
      data.task_type ?? null,
      data.model_id ?? null,
      data.prompt_cache_key ?? null,
      data.context_cache_key ?? null,
      data.prompt_cache_hit ? 1 : 0,
      data.context_cache_hit ? 1 : 0,
      data.prompt_tokens_estimated ?? 0,
      data.context_tokens_estimated ?? 0,
      data.input_tokens ?? 0,
      data.output_tokens ?? 0,
      data.total_tokens ?? 0,
      data.build_duration_ms ?? 0,
      data.cache_lookup_ms ?? 0,
      data.saved_tokens_estimated ?? 0,
      data.saved_cost_estimated_usd ?? 0,
      data.status ?? "success",
      data.error_message ?? null,
      JSON.stringify(data.metadata || {})
    );

    const waitUntil = options.ctx?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(write.run().catch(() => {}));
      return { logged: true, async: true };
    }
    await write.run();
    return { logged: true };
  } catch (err) {
    console.error("logPromptUsage failed", err?.message || err);
    return { logged: false };
  }
}
