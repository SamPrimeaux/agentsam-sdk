/**
 * AgentSam context cache — compact retrieved context packs (not full transcripts).
 */

import { FNF_ACCOUNT_ID, FNF_GITHUB_REPO } from "./constants.js";
import { estimateTokens, hashText } from "./prompt-registry.js";
import { formatMcpForPrompt } from "./mcp-servers.js";
import { formatSkillsForPrompt } from "./skills.js";
import { formatToolsForPrompt } from "./tools-registry.js";
import { getConversation } from "./conversations.js";

const D1_INLINE_MAX = 4000;
const KV_PREFIX = "agentsam:context:";
const R2_PREFIX = "agentsam/context-cache/";

const TTL_SECONDS = {
  project: 86400,
  store: 900,
  repo: 900,
  mixed: 1800,
};

function parseJson(raw, fallback = null) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function previewText(text, max = 480) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export function buildContextCacheKey(parts = {}) {
  return [
    parts.account_id || FNF_ACCOUNT_ID,
    parts.context_type || "mixed",
    parts.workflow_key || "_",
    parts.route_lane || "_",
    parts.task_type || "_",
    parts.source_hash || "_",
    parts.has_attachments ? "att1" : "att0",
  ].join(":");
}

async function loadProjectContext(env) {
  if (!env?.DB) return "";
  const row = await env.DB.prepare(
    `SELECT project_name, description, goals, constraints, primary_tables, workers_involved, r2_buckets_involved, domains_involved, updated_at
     FROM agentsam_project_context
     WHERE account_id = ? AND status = 'active'
     ORDER BY priority ASC, updated_at DESC LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID)
    .first();

  if (!row) return "";

  return [
    "PROJECT CONTEXT:",
    `Name: ${row.project_name}`,
    row.description ? `Description: ${row.description}` : "",
    row.goals ? `Goals: ${row.goals}` : "",
    row.constraints ? `Constraints: ${row.constraints}` : "",
    row.primary_tables ? `Primary tables: ${row.primary_tables}` : "",
    row.workers_involved ? `Workers: ${row.workers_involved}` : "",
    row.domains_involved ? `Domains: ${row.domains_involved}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function loadStoreSnapshot(env) {
  try {
    const [products, pages, lowStock] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS n FROM products WHERE status = 'active'`).first(),
      env.DB.prepare(
        `SELECT slug, title, status, updated_at FROM pages ORDER BY updated_at DESC LIMIT 8`
      ).all(),
      env.DB.prepare(
        `SELECT p.title, v.size, v.inventory_qty
         FROM product_variants v JOIN products p ON p.id = v.product_id
         WHERE p.status = 'active' AND v.inventory_qty <= 5
         ORDER BY v.inventory_qty ASC LIMIT 5`
      ).all(),
    ]);

    const pageLines = (pages.results || [])
      .map((p) => `- ${p.slug}: ${p.status}`)
      .join("\n");
    const stockLines = (lowStock.results || [])
      .map((r) => `- ${r.title} ${r.size || ""}: ${r.inventory_qty} left`)
      .join("\n");

    return [
      "LIVE STORE SNAPSHOT:",
      `Active products: ${products?.n ?? 0}`,
      pageLines ? `Pages:\n${pageLines}` : "",
      stockLines ? `Low stock:\n${stockLines}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  } catch {
    return "LIVE STORE SNAPSHOT: unavailable.";
  }
}

async function loadWorkflowNodesCompact(env, workflowId) {
  if (!env?.DB || !workflowId) return "";
  const { results } = await env.DB.prepare(
    `SELECT node_key, title, node_type FROM agentsam_workflow_nodes
     WHERE workflow_id = ? AND is_active = 1 ORDER BY sort_order ASC LIMIT 6`
  )
    .bind(workflowId)
    .all();

  if (!results?.length) return "";
  return `WORKFLOW NODES:\n${results.map((n) => `- ${n.title || n.node_key} (${n.node_type})`).join("\n")}`;
}

async function loadConversationSummary(env, conversationId) {
  if (!conversationId) return "";
  const row = await getConversation(env, conversationId);
  if (!row) return "";
  return [
    "CONVERSATION SUMMARY:",
    `Title: ${row.title}`,
    row.summary ? `Summary: ${row.summary}` : "",
    row.last_message_preview ? `Last: ${row.last_message_preview}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function buildContextPack(env, routing = {}, message = "", options = {}) {
  const aiRouting = routing.ai_routing || {};
  const workflowKey = routing.classification?.workflow_key;
  const routeLane = aiRouting.lane || aiRouting.model_lane;
  const taskType = aiRouting.task_type;
  const intent = routing.classification?.intent;

  const blocks = [];
  const sourceTables = ["agentsam_project_context"];
  const sourceKeys = [];

  const projectContext = await loadProjectContext(env);
  if (projectContext) blocks.push(projectContext);

  const storeSnapshot = await loadStoreSnapshot(env);
  if (storeSnapshot) {
    blocks.push(storeSnapshot);
    sourceTables.push("products", "pages");
  }

  if (routing.system_blocks?.length) {
    blocks.push(...routing.system_blocks.filter(Boolean));
  } else {
    if (routing.skills?.length) {
      blocks.push(formatSkillsForPrompt(routing.skills));
      sourceTables.push("agentsam_skill");
    }
    if (routing.tools?.length) {
      blocks.push(formatToolsForPrompt(routing.tools));
      sourceTables.push("agentsam_tools");
    }
    if (routing.mcp_servers?.length) {
      blocks.push(formatMcpForPrompt(routing.mcp_servers, options.bridge_ready));
      sourceTables.push("agentsam_mcp_servers");
    }
    if (routing.workflow) {
      blocks.push(
        [
          "SELECTED WORKFLOW:",
          routing.workflow.name || routing.workflow.ui_label || workflowKey,
        ]
          .filter(Boolean)
          .join("\n")
      );
      sourceTables.push("agentsam_workflows");
    }
  }

  const convSummary = await loadConversationSummary(env, options.conversation_id);
  if (convSummary) {
    sourceTables.push("agentsam_conversations");
  }

  if (options.repo_context && (intent === "code" || routeLane === "code")) {
    sourceTables.push("github");
  }

  if (options.attachment_hint) {
    sourceTables.push("agentsam_attachments");
  }

  if (options.page) blocks.push(`Admin UI path: ${options.page}.`);
  if (options.slug) blocks.push(`Editing CMS page slug: ${options.slug}.`);

  const stableContextText = blocks.filter(Boolean).join("\n\n");
  const volatileBlocks = [];
  if (convSummary) volatileBlocks.push(convSummary);
  if (options.repo_context && (intent === "code" || routeLane === "code")) {
    volatileBlocks.push(String(options.repo_context).slice(0, 2000));
  }
  if (options.attachment_hint) volatileBlocks.push(options.attachment_hint);

  const volatileContextText = volatileBlocks.filter(Boolean).join("\n\n");
  const contextText = [stableContextText, volatileContextText].filter(Boolean).join("\n\n");
  const stableContextHash = await hashText(stableContextText);
  const contextHash = await hashText(contextText);
  const contextType =
    intent === "code" ? "repo" : options.conversation_id ? "mixed" : workflowKey ? "workflow" : "project";

  return {
    contextText,
    stableContextText,
    volatileContextText,
    contextHash,
    stableContextHash,
    contextType,
    sourceTables: [...new Set(sourceTables)],
    sourceKeys,
    estimatedTokens: estimateTokens(contextText),
    contextPreview: previewText(contextText),
    workflow_key: workflowKey,
    route_lane: routeLane,
    task_type: taskType,
  };
}

async function fetchContextPayload(env, row) {
  if (row.kv_key && env.CMS_CACHE) {
    const kv = await env.CMS_CACHE.get(row.kv_key);
    if (kv) return kv;
  }
  if (row.r2_key && env.WEBSITE_ASSETS) {
    const obj = await env.WEBSITE_ASSETS.get(row.r2_key);
    if (obj) return obj.text();
  }
  return row.context_preview || null;
}

async function storeContextPayload(env, cacheKey, text) {
  const body = String(text || "");
  const kvKey = `${KV_PREFIX}${cacheKey}`;
  const r2Key = `${R2_PREFIX}${cacheKey}.txt`;

  if (body.length <= D1_INLINE_MAX && env.CMS_CACHE) {
    await env.CMS_CACHE.put(kvKey, body, { expirationTtl: TTL_SECONDS.mixed });
    return { kv_key: kvKey, r2_key: null };
  }

  if (env.WEBSITE_ASSETS) {
    await env.WEBSITE_ASSETS.put(r2Key, body, {
      httpMetadata: { contentType: "text/plain; charset=utf-8" },
    });
    return { kv_key: kvKey, r2_key: r2Key };
  }
  return { kv_key: null, r2_key: null };
}

export async function getContextCache(env, cacheKey) {
  if (!env?.DB || !cacheKey) return null;

  const row = await env.DB.prepare(
    `SELECT * FROM agentsam_context_cache
     WHERE account_id = ? AND cache_key = ? AND status = 'active'
       AND (expires_unix IS NULL OR expires_unix > ?)
     LIMIT 1`
  )
    .bind(FNF_ACCOUNT_ID, cacheKey, Math.floor(Date.now() / 1000))
    .first();

  if (!row) return null;
  const payload = await fetchContextPayload(env, row);
  if (!payload) return null;

  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare(
    `UPDATE agentsam_context_cache SET hit_count = hit_count + 1, last_hit_at = datetime('now'), last_hit_unix = ?
     WHERE id = ?`
  )
    .bind(now, row.id)
    .run()
    .catch(() => {});

  return {
    cache_hit: true,
    cache_key: cacheKey,
    contextText: payload,
    context_hash: row.context_hash,
    estimated_tokens: row.context_token_estimate,
  };
}

export async function putContextCache(env, contextPack, options = {}) {
  if (!env?.DB || !contextPack?.contextText) return null;

  const cacheKey = options.cache_key;
  const ttl = options.ttl_seconds || TTL_SECONDS.mixed;
  const expiresUnix = Math.floor(Date.now() / 1000) + ttl;
  const storage = await storeContextPayload(env, cacheKey, contextPack.contextText);
  const id = `ctxcache_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;

  await env.DB.prepare(
    `INSERT INTO agentsam_context_cache (
       id, account_id, cache_key, context_hash, context_type,
       workflow_key, route_lane, task_type,
       source_tables_json, source_keys_json, source_updated_hash,
       context_preview, context_token_estimate, context_char_count,
       kv_key, r2_key, miss_count, expires_at, expires_unix, status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime(?, 'unixepoch'), ?, 'active')
     ON CONFLICT(account_id, cache_key) DO UPDATE SET
       context_hash = excluded.context_hash,
       context_preview = excluded.context_preview,
       context_token_estimate = excluded.context_token_estimate,
       context_char_count = excluded.context_char_count,
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
      contextPack.contextHash,
      contextPack.contextType,
      contextPack.workflow_key,
      contextPack.route_lane,
      contextPack.task_type,
      JSON.stringify(contextPack.sourceTables || []),
      JSON.stringify(contextPack.sourceKeys || []),
      contextPack.contextHash,
      contextPack.contextPreview,
      contextPack.estimatedTokens,
      contextPack.contextText.length,
      storage.kv_key,
      storage.r2_key,
      expiresUnix,
      expiresUnix
    )
    .run()
    .catch((err) => console.error("putContextCache failed", err?.message || err));

  return { cache_key: cacheKey };
}

export async function invalidateContextCache(env, options = {}) {
  if (!env?.DB) return { invalidated: 0 };
  const reason = options.reason || "manual_invalidation";
  let sql = `UPDATE agentsam_context_cache SET status = 'invalidated', invalidation_reason = ?, updated_at = datetime('now') WHERE account_id = ? AND status = 'active'`;
  const binds = [reason, FNF_ACCOUNT_ID];
  if (options.cache_key) {
    sql += ` AND cache_key = ?`;
    binds.push(options.cache_key);
  }
  if (options.workflow_key) {
    sql += ` AND workflow_key = ?`;
    binds.push(options.workflow_key);
  }
  const result = await env.DB.prepare(sql).bind(...binds).run();
  return { invalidated: result.meta?.changes ?? 0 };
}

function ttlForContext(pack) {
  if (pack.contextType === "repo") return TTL_SECONDS.repo;
  if (pack.sourceTables?.includes("products")) return TTL_SECONDS.store;
  if (pack.contextType === "project") return TTL_SECONDS.project;
  return TTL_SECONDS.mixed;
}

export async function getOrBuildContextPack(env, routing, message, options = {}) {
  const started = Date.now();
  const built = await buildContextPack(env, routing, message, options);

  const cacheKey = buildContextCacheKey({
    account_id: FNF_ACCOUNT_ID,
    context_type: built.contextType,
    workflow_key: built.workflow_key,
    route_lane: built.route_lane,
    task_type: built.task_type,
    source_hash: built.stableContextHash,
    has_attachments: Boolean(options.attachment_hint),
  });

  let cached = null;
  try {
    cached = await getContextCache(env, cacheKey);
  } catch {
    cached = null;
  }

  if (cached?.contextText && !options.repo_context && !options.attachment_hint) {
    const mergedContext = built.volatileContextText
      ? `${cached.contextText}\n\n${built.volatileContextText}`
      : cached.contextText;
    return {
      ...built,
      contextText: mergedContext,
      cache_hit: true,
      cache_key: cacheKey,
      cache_lookup_ms: Date.now() - started,
      estimatedTokens: estimateTokens(mergedContext),
    };
  }

  try {
    await putContextCache(env, { ...built, contextText: built.stableContextText }, {
      cache_key: cacheKey,
      ttl_seconds: ttlForContext(built),
    });
  } catch {
    /* non-blocking */
  }

  return {
    ...built,
    cache_hit: false,
    cache_key: cacheKey,
    cache_lookup_ms: Date.now() - started,
  };
}

export async function summarizeContextCache(env) {
  if (!env?.DB) return { active_entries: 0, hits_24h: 0, misses_24h: 0 };

  const since = Math.floor(Date.now() / 1000) - 86400;
  const active = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM agentsam_context_cache WHERE account_id = ? AND status = 'active'`
  )
    .bind(FNF_ACCOUNT_ID)
    .first();

  const usage = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN context_cache_hit = 1 THEN 1 ELSE 0 END) AS hits,
       SUM(CASE WHEN context_cache_hit = 0 THEN 1 ELSE 0 END) AS misses
     FROM agentsam_prompt_usage WHERE account_id = ? AND created_at_unix >= ?`
  )
    .bind(FNF_ACCOUNT_ID, since)
    .first();

  return {
    active_entries: active?.n ?? 0,
    hits_24h: usage?.hits ?? 0,
    misses_24h: usage?.misses ?? 0,
  };
}

export { FNF_GITHUB_REPO };
