/**
 * AgentSam thread payloads in R2 (JSONL). Never blocks chat on failure.
 */

import { conversationThreadKey, touchConversation } from "./conversations.js";

function previewText(text, max = 120) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

export async function appendThreadMessage(env, conversationId, payload, options = {}) {
  if (!env?.WEBSITE_ASSETS || !conversationId) return { stored: false };

  const key = conversationThreadKey(conversationId);
  const line = `${JSON.stringify({
    ...payload,
    ts: payload.ts || new Date().toISOString(),
  })}\n`;

  try {
    let existing = "";
    const obj = await env.WEBSITE_ASSETS.get(key);
    if (obj) existing = await obj.text();

    await env.WEBSITE_ASSETS.put(key, existing + line, {
      httpMetadata: { contentType: "application/x-ndjson" },
    });

    const writeMeta = touchConversation(env, conversationId, {
      title: options.setTitleFromUser && payload.role === "user" ? payload.content : undefined,
      lastMessagePreview:
        payload.role === "assistant" ? payload.content : options.userPreview || payload.content,
      lastModelId: options.lastModelId,
      workflowKey: options.workflowKey,
      messageDelta: 1,
      toolCallDelta: Array.isArray(payload.tool_calls) ? payload.tool_calls.length : 0,
      attachmentDelta: Array.isArray(payload.attachments) ? payload.attachments.length : 0,
    });

    const waitUntil = options.ctx?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(writeMeta);
    } else {
      await writeMeta;
    }

    return { stored: true, key };
  } catch (err) {
    console.error("appendThreadMessage failed", err?.message || err);
    return { stored: false, error: err?.message || String(err) };
  }
}

export async function persistChatExchange(
  env,
  {
    conversationId,
    messageId,
    userMessage,
    assistantReply,
    attachments = [],
    toolCalls = [],
    routing = null,
    ai = null,
    ctx = null,
  }
) {
  if (!conversationId) return;

  const persist = async () => {
    await appendThreadMessage(
      env,
      conversationId,
      {
        message_id: `${messageId}-user`,
        role: "user",
        content: userMessage,
        attachments: attachments.map((a) => ({
          name: a.name,
          attachment_id: a.attachment_id,
          mime_type: a.mime_type,
          kind: a.kind,
          preview_url: a.preview_url || a.url,
        })),
      },
      { ctx, setTitleFromUser: true, userPreview: previewText(userMessage), workflowKey: routing?.classification?.workflow_key }
    );

    await appendThreadMessage(
      env,
      conversationId,
      {
        message_id: messageId,
        role: "assistant",
        content: assistantReply,
        tool_calls: toolCalls,
        routing: routing
          ? {
              workflow_key: routing.classification?.workflow_key,
              workflow_label: routing.workflow?.ui_label || routing.workflow?.name,
              intent: routing.classification?.intent,
            }
          : null,
        ai: ai
          ? {
              model_id: ai.selected_model,
              task_type: ai.task_type,
              model_lane: ai.model_lane,
            }
          : null,
      },
      {
        ctx,
        lastModelId: ai?.selected_model,
        workflowKey: routing?.classification?.workflow_key,
      }
    );

    try {
      const { refreshRecentCache } = await import("./conversations.js");
      await refreshRecentCache(env);
    } catch {
      /* non-blocking */
    }
  };

  if (typeof ctx?.waitUntil === "function") {
    ctx.waitUntil(persist());
  } else {
    await persist();
  }
}
