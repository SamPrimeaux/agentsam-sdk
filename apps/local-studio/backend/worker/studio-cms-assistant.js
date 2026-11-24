import { formatAttachmentsForPrompt } from "../../../ecommerce-cms-agentsam/backend/agentsam/attachments.js";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const guidance = "Help with the current CMS draft. Treat attached files and selected content as reference. Give advice or a proposed change. Do not claim to have changed or published anything.";

async function responseFailureCode(response) {
  let body = "";
  try {
    const source = typeof response.clone === "function" ? response.clone() : response;
    body = await source.text();
  } catch {}
  try {
    const parsed = JSON.parse(body);
    const value = parsed?.error?.code || parsed?.code || parsed?.error;
    if (typeof value === "string" && value.trim()) {
      return value.trim().replace(/[^a-z0-9_.:-]/gi, "_").slice(0, 72);
    }
  } catch {}
  return `http_${Number(response.status) || 0}`;
}

export async function runStudioCmsAssistant({ message, history, selection, attachments }, {
  getInventory, sendChat, signal,
}) {
  const images = attachments.filter(item => item.kind === "image").map(item => ({
    mimeType: item.mime_type,
    dataUrl: `data:${item.mime_type};base64,${item.image_base64 || ""}`,
    size: item.size_bytes,
  }));
  if (images.length > 4 || images.some(image => !imageTypes.has(image.mimeType) || image.size > 5 * 1024 * 1024)) {
    return { ok: false, status: 400, error: "Use up to four PNG, JPEG or WebP images, 5 MB each." };
  }

  // The account's live inventory is authoritative. A host Workers AI binding
  // adds eligible candidates to that inventory; it must not bypass the user's
  // other configured providers or force an unrelated static model order.
  let inventory;
  try {
    inventory = await getInventory();
  } catch {
    return { ok: false, status: 503,
      error: "AgentSam could not load the configured model inventory. Check model connections in Settings and retry.",
      diagnostic_code: "model_inventory_unavailable" };
  }
  const eligible = (Array.isArray(inventory) ? inventory : []).filter(model =>
    model?.chat_eligible === true && (!images.length || model.provider === "openai" &&
      (model.capabilities?.vision || model.capabilities?.image_input)));
  const candidates = eligible.slice(0, 3);
  if (!candidates.length) {
    return { ok: false, status: 503, error: images.length
      ? "Connect an OpenAI model that accepts images in AgentSam Settings."
      : "No chat-eligible models are available in this account's model inventory. Connect or enable a model in AgentSam Settings.",
      diagnostic_code: "no_chat_eligible_models" };
  }

  const messages = history.slice(-20).flatMap(turn =>
    (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string"
      ? [{ role: turn.role, content: turn.content.slice(0, 12000) }] : []);
  const attachmentText = formatAttachmentsForPrompt(attachments);
  const selected = selection ? "\nSelected editor context: " + JSON.stringify(selection).slice(0, 1500) : "";
  messages.push({
    role: "user",
    content: [guidance + selected, message.slice(0, 7000), attachmentText.slice(0, 3000)].filter(Boolean).join("\n\n"),
    ...(images.length ? { images } : {}),
  });

  const attempts = [];
  for (const model of candidates) {
    if (signal?.aborted) return { ok: false, status: 499, error: "Request cancelled." };
    try {
      const response = await sendChat({
        provider: model.provider, model_id: model.model_id, run_mode: "ask", surface: "side", messages,
      });
      if (!response?.ok) {
        attempts.push({ provider: model.provider, model_id: model.model_id,
          status: Number(response?.status) || null, reason: await responseFailureCode(response || {}) });
        continue;
      }
      if (!response.headers?.get?.("content-type")?.startsWith("text/plain")) {
        attempts.push({ provider: model.provider, model_id: model.model_id,
          status: Number(response.status) || null, reason: "unexpected_response_content_type" });
        continue;
      }
      const reply = (await response.text()).trim();
      if (reply) return { ok: true, reply, model: model.model_id, provider: model.provider };
      attempts.push({ provider: model.provider, model_id: model.model_id,
        status: Number(response.status) || null, reason: "empty_reply" });
    } catch {
      attempts.push({ provider: model.provider, model_id: model.model_id,
        status: null, reason: "transport_error" });
    }
  }
  const summary = attempts.map(item => `${item.provider}/${item.model_id}:${item.reason}`).join(", ");
  return { ok: false, status: 502,
    error: summary
      ? `AgentSam could not get a reply from configured models (${summary}). Check provider connections and retry.`
      : "AgentSam could not get a reply from the configured models. Try again.",
    diagnostic_code: "all_chat_models_failed", attempts };
}
