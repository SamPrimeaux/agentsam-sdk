/**
 * Tool call traces for AgentSam chat UI (safe previews only).
 */

import { FNF_ACCOUNT_ID } from "./constants.js";
import { IAM_LOGO } from "./quick-actions.js";

const PREVIEW_MAX = 400;

function clip(text, max = PREVIEW_MAX) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export const GITHUB_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>`;

function iconForTool(toolKey, provider) {
  if (provider === "github" || /github/i.test(toolKey || "")) {
    return { type: "svg", markup: GITHUB_SVG };
  }
  if (/mcp|inneranimal|iam/i.test(`${toolKey} ${provider}`)) {
    return { type: "image", url: IAM_LOGO };
  }
  if (/d1|database|sql/i.test(toolKey || "")) {
    return { type: "text", label: "D1" };
  }
  if (/r2|media|assets/i.test(toolKey || "")) {
    return { type: "text", label: "R2" };
  }
  return { type: "text", label: "Tool" };
}

function displayNameFor(meta) {
  if (meta.display_name) return meta.display_name;
  const key = meta.tool_key || meta.mcp_tool || "";
  if (/github_repo_list|github/.test(key)) return "Reading repository";
  if (/semantic_search|fnf_semantic/.test(key)) return "Semantic search";
  if (/mcp/.test(meta.mcp_server || "")) return "Called tool";
  if (/d1/.test(key)) return "Querying D1";
  if (/r2|media/.test(key)) return "Listing media assets";
  return meta.tool_name || key || "Called tool";
}

function subtitleFor(meta) {
  if (meta.subtitle) return meta.subtitle;
  if (meta.mcp_server) return meta.mcp_server;
  if (meta.server) return meta.server;
  if (meta.tool_key) return meta.tool_key;
  return "";
}

export function buildToolCallFromGithubMeta(meta, ids = {}) {
  if (!meta) return null;
  const toolKey = meta.mcp_tool || meta.github_operation || "github_context";
  const id = `tc_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const provider = meta.mcp_tool ? "mcp" : "github";

  return {
    id,
    tool_call_id: null,
    tool_key: toolKey,
    display_name: displayNameFor({ ...meta, tool_key: toolKey }),
    subtitle: subtitleFor({
      ...meta,
      tool_key: toolKey,
      mcp_server: meta.mcp_server,
      server: meta.mcp_server || "github",
    }),
    provider,
    server: meta.mcp_server || "github",
    status: meta.success ? "complete" : "failed",
    duration_ms: meta.mcp_latency_ms ?? null,
    input_preview: clip(meta.github_operation || meta.input_preview || "GitHub context request"),
    output_preview: clip(
      meta.output_preview || (meta.success ? `Repo: ${meta.github_repo || "fuelnfreetime"}` : meta.error || "Failed")
    ),
    icon: iconForTool(toolKey, provider),
    conversation_id: ids.conversation_id,
    message_id: ids.message_id,
  };
}

export async function getToolCallById(env, id) {
  if (!env?.DB || !id) return null;
  const row = await env.DB.prepare(
    `SELECT * FROM agentsam_tool_call_log WHERE id = ? AND account_id = ? LIMIT 1`
  )
    .bind(id, FNF_ACCOUNT_ID)
    .first();
  if (!row) return null;

  const provider =
    row.handler_type === "mcp"
      ? "mcp"
      : row.tool_category === "github"
        ? "github"
        : row.handler_type || "tool";

  return {
    id: row.id,
    tool_call_id: row.id,
    tool_key: row.tool_key,
    display_name: displayNameFor(row),
    subtitle: subtitleFor(row),
    provider,
    server: row.mcp_server_key || row.handler_type,
    status: row.status === "success" ? "complete" : row.status || "failed",
    duration_ms: row.duration_ms,
    input_preview: clip(row.input_summary),
    output_preview: clip(row.output_summary),
    error: row.error_message || null,
    icon: iconForTool(row.tool_key, provider),
    created_at: row.created_at,
  };
}

export async function agentsamToolCallGet(env, id) {
  const call = await getToolCallById(env, id);
  if (!call) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ ok: true, tool_call: call });
}

export function routeChipsFromRouting(routing, toolCalls = []) {
  const chips = [];
  const wf = routing?.workflow;
  if (wf?.ui_label || wf?.name) {
    chips.push({ label: wf.ui_label || wf.name, kind: "workflow" });
  }

  for (const tc of toolCalls) {
    if (tc.provider === "github") chips.push({ label: "GitHub", kind: "tool" });
    if (tc.provider === "mcp") chips.push({ label: "Inner Animal MCP", kind: "tool" });
    if (/d1/i.test(tc.tool_key || "")) chips.push({ label: "D1", kind: "tool" });
    if (/r2|media/i.test(tc.tool_key || "")) chips.push({ label: "R2", kind: "tool" });
  }

  const seen = new Set();
  return chips.filter((c) => {
    const k = c.label;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
