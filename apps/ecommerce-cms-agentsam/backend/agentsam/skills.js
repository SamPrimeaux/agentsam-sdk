import { hydrateSkillRowFromR2, hydrateSkillWithFiles, hydrateSkillsFromR2 } from "./skill-r2.js";
import { FNF_ACCOUNT_ID } from "./constants.js";

const MAX_CHAT_SKILLS = 3;

const CLOUDFLARE_FALLBACK_SLUGS = [
  "fnf-cloudflare-runtime",
  "workers-best-practices",
  "wrangler",
];

const COMMERCE_FALLBACK_SLUGS = ["fnf-commerce-runtime", "stripe-best-practices"];

function parseJsonArray(raw, fallback = []) {
  try {
    if (!raw) return fallback;
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function parseMetadata(row) {
  try {
    const raw = row?.metadata_json;
    if (!raw) return {};
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return {};
  }
}

function skillDomain(row) {
  const meta = parseMetadata(row);
  return meta.skill_domain || meta.domain || "";
}

function normalizeSlugList(context = {}) {
  const slugs = [];
  if (context.skill_slug) slugs.push(String(context.skill_slug).trim());
  if (Array.isArray(context.skill_slugs)) {
    for (const s of context.skill_slugs) {
      const v = String(s || "").trim();
      if (v) slugs.push(v);
    }
  }
  return [...new Set(slugs.filter(Boolean))];
}

function scoreRouteKeys(row, routing = {}) {
  let score = 0;
  const routeKeys = parseJsonArray(row.route_keys_json);
  if (!routeKeys.length) return 0;

  const intent = String(routing.intent || "").toLowerCase();
  const workflowKey = String(routing.workflow_key || "").toLowerCase();
  const taskType = String(routing.task_type || "").toLowerCase();
  const routeKey = String(routing.route_key || routing.intent || "").toLowerCase();

  for (const entry of routeKeys) {
    if (typeof entry === "string") {
      const key = entry.toLowerCase();
      if (key && (key === intent || key === routeKey || key === workflowKey || key === taskType)) {
        score += 5;
      }
      continue;
    }
    if (!entry || typeof entry !== "object") continue;

    if (entry.intent && String(entry.intent).toLowerCase() === intent) score += 5;
    if (entry.route_key && String(entry.route_key).toLowerCase() === routeKey) score += 5;
    if (entry.workflow_key && String(entry.workflow_key).toLowerCase() === workflowKey) score += 6;
    if (entry.task_type && String(entry.task_type).toLowerCase() === taskType) score += 4;
  }

  return score;
}

async function hydrateRowWithRefs(env, row) {
  const { results: files } = await env.DB.prepare(
    `SELECT file_path, role, sort_order FROM agentsam_skill_file
     WHERE skill_id = ? AND role = 'reference'
     ORDER BY sort_order ASC LIMIT 4`
  )
    .bind(row.id)
    .all();
  return hydrateSkillWithFiles(env, row, files || []);
}

export function buildSkillHash(skills = []) {
  const parts = (skills || [])
    .map((s) => `${s.slug}:${s.version ?? 1}`)
    .filter(Boolean)
    .sort();
  if (!parts.length) return "no_skills";
  return parts.join("|");
}

export async function recordSkillInvocations(env, skills = []) {
  if (!env?.DB || !skills?.length) return { updated: 0 };

  let updated = 0;
  for (const skill of skills) {
    if (!skill?.id) continue;
    try {
      await env.DB.prepare(
        `UPDATE agentsam_skill
         SET invocation_count = invocation_count + 1,
             last_invoked_at = datetime('now'),
             updated_at = datetime('now')
         WHERE id = ? AND account_id = ?`
      )
        .bind(skill.id, FNF_ACCOUNT_ID)
        .run();
      updated += 1;
    } catch {
      /* non-blocking */
    }
  }
  return { updated };
}

export async function listAgentSamSkills(env, { hydrate = false } = {}) {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, name, description, file_path, scope, slash_trigger,
            globs, tags_json, task_types_json, route_keys_json, metadata_json,
            retrieval_strategy, sort_order, version, is_active, updated_at,
            account_id, access_mode, always_apply
     FROM agentsam_skill
     WHERE is_active = 1 AND account_id = ?
     ORDER BY sort_order ASC, name ASC`
  )
    .bind(FNF_ACCOUNT_ID)
    .all();

  if (!hydrate) return results || [];
  return hydrateSkillsFromR2(env, results || []);
}

export async function getAgentSamSkill(env, slug, { includeReferences = false } = {}) {
  const row = await env.DB.prepare(
    `SELECT * FROM agentsam_skill WHERE slug = ? AND account_id = ? AND is_active = 1 LIMIT 1`
  )
    .bind(slug, FNF_ACCOUNT_ID)
    .first();

  if (!row) return null;

  if (!includeReferences) {
    return hydrateSkillRowFromR2(env, row);
  }

  const { results: files } = await env.DB.prepare(
    `SELECT file_path, role, sort_order FROM agentsam_skill_file
     WHERE skill_id = ? ORDER BY sort_order ASC, file_path ASC`
  )
    .bind(row.id)
    .all();

  return hydrateSkillWithFiles(env, row, files || []);
}

/**
 * Pick skills relevant to admin chat message + UI context.
 * context.skill_slug / context.skill_slugs force-match before scoring.
 */
export async function resolveSkillsForChat(env, message, context = {}) {
  const { results: rows } = await env.DB.prepare(
    `SELECT * FROM agentsam_skill WHERE is_active = 1 AND account_id = ? ORDER BY sort_order ASC`
  )
    .bind(FNF_ACCOUNT_ID)
    .all();

  if (!rows?.length) return [];

  const forceSlugs = normalizeSlugList(context);
  if (forceSlugs.length) {
    const forced = [];
    for (const slug of forceSlugs) {
      const row = rows.find((r) => r.slug === slug);
      if (row) forced.push(row);
    }
    if (forced.length) {
      return Promise.all(forced.slice(0, MAX_CHAT_SKILLS).map((row) => hydrateRowWithRefs(env, row)));
    }
  }

  const haystack = [
    message,
    context.page || "",
    context.slug || "",
    context.topic || "",
    context.intent || "",
    context.workflow_key || "",
  ]
    .join(" ")
    .toLowerCase();

  const routing = {
    intent: context.intent || "",
    workflow_key: context.workflow_key || "",
    task_type: context.task_type || context.topic || "",
    route_key: context.route_key || context.intent || "",
  };

  const alwaysApply = rows.filter((r) => r.always_apply);
  const scored = [];

  for (const row of rows) {
    if (row.always_apply) continue;

    let score = 0;
    const tags = parseJsonArray(row.tags_json);
    const tasks = parseJsonArray(row.task_types_json);
    const domain = skillDomain(row).toLowerCase();
    const slug = String(row.slug || "").toLowerCase();

    for (const tag of tags) {
      if (haystack.includes(String(tag).toLowerCase())) score += 3;
    }
    for (const task of tasks) {
      if (haystack.includes(String(task).toLowerCase())) score += 2;
    }
    if (slug && haystack.includes(slug.replace(/-/g, " "))) score += 2;
    if (slug && haystack.includes(slug)) score += 3;

    score += scoreRouteKeys(row, routing);

    if (domain === "commerce" && /product|inventory|order|shop|cart/.test(haystack)) score += 4;
    if (domain === "stripe" && /stripe|payment|checkout|webhook/.test(haystack)) score += 5;
    if (
      domain === "cloudflare" &&
      /cloudflare|worker|wrangler|d1|r2|kv|deploy|binding|secret|mcp|bridge|durable|agentsam_wai|observability/.test(
        haystack
      )
    ) {
      score += 6;
    }

    if (row.slash_trigger && haystack.includes(String(row.slash_trigger).toLowerCase())) {
      score += 6;
    }

    if (score > 0) scored.push({ row, score });
  }

  scored.sort((a, b) => b.score - a.score || a.row.sort_order - b.row.sort_order);

  const picked = [];
  const seen = new Set();

  for (const row of alwaysApply) {
    if (seen.has(row.slug)) continue;
    picked.push(row);
    seen.add(row.slug);
  }

  for (const { row } of scored) {
    if (picked.length >= MAX_CHAT_SKILLS) break;
    if (seen.has(row.slug)) continue;
    picked.push(row);
    seen.add(row.slug);
  }

  if (picked.length < MAX_CHAT_SKILLS) {
    let fallbackSlugs = [];
    if (/cloudflare|worker|wrangler|d1|r2|deploy|mcp|code|repo/.test(haystack)) {
      fallbackSlugs = CLOUDFLARE_FALLBACK_SLUGS;
    } else if (/(product|inventory|order|shop|checkout|stripe|payment)/i.test(haystack)) {
      fallbackSlugs = COMMERCE_FALLBACK_SLUGS;
    }

    for (const slug of fallbackSlugs) {
      if (picked.length >= MAX_CHAT_SKILLS) break;
      if (seen.has(slug)) continue;
      const row = rows.find((r) => r.slug === slug);
      if (row) {
        picked.push(row);
        seen.add(slug);
      }
    }
  }

  if (!picked.length) return [];

  return Promise.all(picked.map((row) => hydrateRowWithRefs(env, row)));
}

export function formatSkillsForPrompt(skills) {
  if (!skills?.length) return "";

  const blocks = skills
    .filter((s) => s.content_markdown?.trim())
    .map((s) => {
      let block = `## Skill: ${s.name} (${s.slug})\n\n${s.content_markdown.trim()}`;
      if (s.reference_markdown?.trim()) {
        block += `\n\n### References\n\n${s.reference_markdown.trim()}`;
      }
      return block;
    });

  if (!blocks.length) return "";
  return `AGENT SKILLS (follow when relevant — Cloudflare platform skills loaded for Workers/D1/R2/deploy/MCP):\n\n${blocks.join("\n\n---\n\n")}`;
}
