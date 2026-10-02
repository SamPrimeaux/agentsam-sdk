/**
 * Agent Sam request router — intent → workflow + skills + MCP lanes.
 * Prompt/context assembly is handled by prompt-registry + context-cache after routing.
 */

import { resolveAIRouting } from "./ai-registry.js";
import { FNF_ACCOUNT_ID, DRAWER_WORKFLOW_KEYS } from "./constants.js";
import { detectBlockedFeatureRequest } from "./feature-gates.js";
import { formatMcpForPrompt, selectMcpServers } from "./mcp-servers.js";
import { formatSkillsForPrompt, resolveSkillsForChat } from "./skills.js";
import { formatToolsForPrompt, selectToolsForChat } from "./tools-registry.js";

const INTENT_RULES = [
  {
    intent: "content",
    re: /\b(copy|write|email|seo|publish|campaign|newsletter|headline|description|blog|caption|subject line|hero copy|product copy|meta description)\b/i,
    workflow_key: "fnf_content_studio",
    task_type: "content_generation",
  },
  {
    intent: "creative",
    re: /\b(image|banner|mockup|graphic|photo|visual|hero image|creative|promo|social post|thumbnail|redesign this image|generate.*visual)\b/i,
    workflow_key: "fnf_creative_studio",
    task_type: "image_generation",
  },
  {
    intent: "brand",
    re: /\b(logo|brand|identity|refresh|typography|moodboard|visual identity|brand system|color palette)\b/i,
    workflow_key: "fnf_brand_refresh",
    task_type: "brand_design",
  },
  {
    intent: "code",
    re: /\b(code|repo|deploy|worker|bug|fix|refactor|api|route|sql|migration|typescript|javascript|pull request|commit|branch|github)\b/i,
    workflow_key: null,
    task_type: "repo_work",
  },
  {
    intent: "commerce",
    re: /\b(product|inventory|order|stock|cart|checkout|stripe|variant|sku|subscriber)\b/i,
    workflow_key: null,
    task_type: "store_ops",
  },
  {
    intent: "brainstorm",
    re: /\b(brainstorm|ideas|strategy|roadmap|what should|recommend|plan|next steps|prioritize)\b/i,
    workflow_key: "fnf_agentsam_chat",
    task_type: "brainstorm",
  },
];

function parseJson(raw, fallback = null) {
  try {
    if (!raw) return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

export function classifyIntent(message, context = {}) {
  const hay = [message, context.page || "", context.slug || "", context.topic || ""].join(" ");

  let best = { intent: "general", score: 0, workflow_key: "fnf_agentsam_chat", task_type: "admin_chat" };

  for (const rule of INTENT_RULES) {
    if (!rule.re.test(hay)) continue;
    const score = (hay.match(rule.re) || []).length;
    if (score >= best.score) {
      best = {
        intent: rule.intent,
        score,
        workflow_key: rule.workflow_key || best.workflow_key,
        task_type: rule.task_type,
      };
    }
  }

  return best;
}

async function loadWorkflow(env, workflowKey) {
  if (!workflowKey || !env.DB) return null;
  try {
    return await env.DB.prepare(
      `SELECT id, workflow_key, display_name, description, default_mode, default_task_type,
              risk_level, requires_approval, quality_gate_json, metadata_json
       FROM agentsam_workflows
       WHERE workflow_key = ? AND account_id = ? AND is_active = 1
       LIMIT 1`
    )
      .bind(workflowKey, FNF_ACCOUNT_ID)
      .first();
  } catch {
    return null;
  }
}

function formatWorkflowForPrompt(workflow) {
  if (!workflow) return "";

  const meta = parseJson(workflow.metadata_json, {});
  const gate = parseJson(workflow.quality_gate_json, {});
  const uiLabel = meta.ui_label || workflow.display_name;
  const loop = meta.workflow_loop || [];
  const approval = meta.approval_required_for || [];
  const prompts = meta.suggested_prompts || [];
  const dod = gate.definition_of_done || [];

  return [
    "ACTIVE WORKFLOW:",
    `- ${uiLabel} (${workflow.workflow_key})`,
    workflow.description ? `- ${workflow.description}` : "",
    loop.length ? `- Loop: ${loop.join(" → ")}` : "",
    dod.length ? `- Definition of done: ${dod.join("; ")}` : "",
    approval.length ? `- Approval before: ${approval.join(", ")}` : "",
    workflow.requires_approval ? "- This workflow requires explicit approval for risky actions." : "",
    prompts.length ? `- Example prompts: ${prompts.slice(0, 3).join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function routeAgentsamRequest(env, message, context = {}) {
  const blockedFeature = detectBlockedFeatureRequest(message, context.attachments || []);
  if (blockedFeature) {
    return {
      blocked_feature: blockedFeature,
      classification: {
        intent: "general",
        score: 0,
        workflow_key: "fnf_agentsam_chat",
        task_type: "admin_chat",
        source: "feature_gate",
      },
      workflow: null,
      skills: [],
      tools: [],
      mcp_servers: [],
      system_blocks: [],
      ai_routing: resolveAIRouting(
        { intent: "general", task_type: "admin_chat", workflow_key: "fnf_agentsam_chat" },
        message,
        context
      ),
      account_id: FNF_ACCOUNT_ID,
    };
  }

  const explicitWorkflow = (context.workflow_key || "").trim();
  const classification = explicitWorkflow
    ? {
        intent: context.intent || "studio",
        score: 100,
        workflow_key: explicitWorkflow,
        task_type: context.task_type || "studio_workflow",
        source: "drawer",
      }
    : classifyIntent(message, context);

  if (!explicitWorkflow) classification.source = "auto";

  const workflowKey = classification.workflow_key;
  const workflow = await loadWorkflow(env, workflowKey);
  const ai_routing = resolveAIRouting(classification, message, context);
  const skills = await resolveSkillsForChat(env, message, {
    ...context,
    topic: classification.task_type,
    intent: classification.intent,
    workflow_key: workflowKey,
    task_type: context.task_type || ai_routing.task_type || classification.task_type,
    route_key: classification.intent,
  });
  const mcpServers = selectMcpServers(classification.intent, message);
  const bridgeReady = Boolean(String(env.AGENTSAM_BRIDGE_KEY || "").trim());
  const tools = await selectToolsForChat(env, {
    intent: classification.intent,
    message,
    workflowKey,
    taskType: ai_routing.task_type,
    domain: ai_routing.repo_related
      ? "code"
      : ai_routing.content_related
        ? "content"
        : ai_routing.task_type === "image_generation"
          ? "cloudflare"
          : "general",
  });

  const systemBlocks = [
    formatWorkflowForPrompt(workflow),
    formatSkillsForPrompt(skills),
    formatToolsForPrompt(tools),
    formatMcpForPrompt(mcpServers, bridgeReady),
  ].filter(Boolean);

  return {
    classification,
    workflow: workflow
      ? {
          id: workflow.id,
          key: workflow.workflow_key,
          name: workflow.display_name,
          mode: workflow.default_mode,
          risk: workflow.risk_level,
          requires_approval: !!workflow.requires_approval,
          ui_label: parseJson(workflow.metadata_json, {})?.ui_label || workflow.display_name,
        }
      : null,
    skills: skills.map((s) => ({ slug: s.slug, name: s.name, version: s.version ?? 1, id: s.id })),
    tools: tools.map((t) => ({ tool_key: t.tool_key, name: t.display_name })),
    mcp_servers: mcpServers.map((s) => ({
      slug: s.slug,
      name: s.display_name,
      status: bridgeReady ? "ready" : "needs_bridge",
    })),
    system_blocks: systemBlocks,
    ai_routing,
    account_id: FNF_ACCOUNT_ID,
  };
}

export async function listDrawerWorkflows(env) {
  if (!env.DB) return [];
  try {
    const placeholders = DRAWER_WORKFLOW_KEYS.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT id, workflow_key, display_name, description, default_mode, default_task_type,
              risk_level, requires_approval, metadata_json
       FROM agentsam_workflows
       WHERE account_id = ? AND is_active = 1
         AND workflow_key IN (${placeholders})
       ORDER BY CASE workflow_key
         WHEN 'fnf_content_studio' THEN 1
         WHEN 'fnf_creative_studio' THEN 2
         WHEN 'fnf_brand_refresh' THEN 3
         ELSE 99 END`
    )
      .bind(FNF_ACCOUNT_ID, ...DRAWER_WORKFLOW_KEYS)
      .all();

    return (results || []).map((row) => mapWorkflowRow(row));
  } catch {
    return [];
  }
}

function mapWorkflowRow(row) {
  const meta = parseJson(row.metadata_json, {});
  return {
    id: row.id,
    workflow_key: row.workflow_key,
    display_name: row.display_name,
    description: row.description,
    ui_label: meta.ui_label || row.display_name,
    ui_description: meta.ui_description || row.description,
    suggested_prompts: meta.suggested_prompts || [],
    category: meta.category || "agentic",
  };
}

export async function listStudioWorkflows(env) {
  if (!env.DB) return [];
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, workflow_key, display_name, description, default_mode, default_task_type,
              risk_level, requires_approval, metadata_json
       FROM agentsam_workflows
       WHERE account_id = ? AND is_active = 1
         AND workflow_key IN ('fnf_content_studio','fnf_creative_studio','fnf_brand_refresh','fnf_agentsam_chat')
       ORDER BY display_name ASC`
    )
      .bind(FNF_ACCOUNT_ID)
      .all();

    return (results || []).map((row) => mapWorkflowRow(row));
  } catch {
    return [];
  }
}
