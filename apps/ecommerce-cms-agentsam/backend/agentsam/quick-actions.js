/**
 * D1-backed quick actions and + menu capabilities for AgentSam UI.
 */

import { COMMERCE_ACCOUNT_ID } from "./constants.js";
import {
  getAgentFeatures,
  isFeatureEnabled,
  isQuickActionAllowed,
} from "./feature-gates.js";
import { listStudioWorkflows } from "./router.js";

const IAM_LOGO =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail";

const DEFAULT_ACTIONS = [
  {
    id: "write_edit",
    label: "Write or edit",
    workflow_key: "commerce_content_studio",
    task_type: "text_generation",
    lane: "general",
    prompt: "Draft or improve product copy for the selected item.",
    enabled: true,
  },
  {
    id: "repo_work",
    label: "Repo work",
    workflow_key: "commerce_content_studio",
    task_type: "code_generation",
    lane: "code",
    prompt: "Summarize recent repository changes and what should be verified before deploy.",
    enabled: true,
  },
];

async function hasActiveImageModels(env) {
  if (!isFeatureEnabled("image_generation")) return false;
  try {
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM agentsam_ai
       WHERE account_id = ? AND status = 'active' AND task_type = 'image_generation'`
    )
      .bind(COMMERCE_ACCOUNT_ID)
      .first();
    return (row?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function buildQuickActions(env) {
  const [workflows, imageReady] = await Promise.all([
    listStudioWorkflows(env),
    hasActiveImageModels(env),
  ]);

  const actions = [];

  if (imageReady) {
    const creative = workflows.find((w) => w.workflow_key === "commerce_creative_studio");
    actions.push({
      id: "create_image",
      label: "Create an image",
      workflow_key: "commerce_creative_studio",
      task_type: "image_generation",
      lane: "image",
      prompt: creative?.suggested_prompts?.[0] || "Describe the image you want to create.",
      mode: "image",
      enabled: true,
    });
  }

  const content = workflows.find((w) => w.workflow_key === "commerce_content_studio");
  if (content) {
    actions.push({
      id: "write_edit",
      label: "Write or edit",
      workflow_key: "commerce_content_studio",
      task_type: "text_generation",
      lane: "general",
      prompt: content.suggested_prompts?.[0] || "Write better product copy for this item.",
      enabled: true,
    });

    if (content.suggested_prompts?.length > 1) {
      actions.push({
        id: "improve_copy",
        label: "Improve product copy",
        workflow_key: "commerce_content_studio",
        task_type: "text_generation",
        lane: "general",
        prompt: content.suggested_prompts[0] || "Improve this product description.",
        enabled: true,
      });
    }
  }

  if (isFeatureEnabled("image_upload")) {
    actions.push({
      id: "review_image",
      label: "Review uploaded image",
      workflow_key: "commerce_creative_studio",
      task_type: "image_to_text",
      lane: "vision",
      prompt: "Review the attached image and suggest useful edits.",
      enabled: true,
    });
  }

  if (isFeatureEnabled("github_repo")) {
    actions.push({
      id: "repo_work",
      label: "Repo work",
      workflow_key: "commerce_content_studio",
      task_type: "code_generation",
      lane: "code",
      prompt: "Summarize recent repository changes and what should be verified before deploy.",
      enabled: true,
    });
  }

  return actions.filter(isQuickActionAllowed).slice(0, 4);
}

export function buildPlusMenuCapabilities({ imageReady }) {
  return {
    attach: { enabled: isFeatureEnabled("image_upload"), label: "Add photos & files" },
    image: {
      enabled: imageReady && isFeatureEnabled("image_generation"),
      label: "Create image",
      mode: "image",
      workflow_key: "commerce_creative_studio",
    },
  };
}

export async function buildAgentsamUiConfig(env) {
  const [quick_actions, imageReady] = await Promise.all([
    buildQuickActions(env),
    hasActiveImageModels(env),
  ]);

  return {
    quick_actions: quick_actions.length ? quick_actions : DEFAULT_ACTIONS.filter(isQuickActionAllowed),
    plus_menu: buildPlusMenuCapabilities({ imageReady }),
    features: getAgentFeatures(),
    iam_logo_url: IAM_LOGO,
  };
}

export { IAM_LOGO };
