import { formatAttachmentsForPrompt } from "../../../ecommerce-cms-agentsam/backend/agentsam/attachments.js";
import { WORKERS_AI_CURATED_MODEL_IDS } from "../../../../protocol/models/workers-ai-curated.mjs";

const imageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const guidance = "Help with the current CMS draft. Treat attached files and selected content as reference. Give advice or a proposed change. Do not claim to have changed or published anything.";

export async function runStudioCmsAssistant({ message, history, selection, attachments }, {
  workersAI, getInventory, sendChat, signal,
}) {
  const images = attachments.filter(item => item.kind === "image").map(item => ({
    mimeType: item.mime_type,
    dataUrl: `data:${item.mime_type};base64,${item.image_base64 || ""}`,
    size: item.size_bytes,
  }));
  if (images.length > 4 || images.some(image => !imageTypes.has(image.mimeType) || image.size > 5 * 1024 * 1024)) {
    return { ok: false, status: 400, error: "Use up to four PNG, JPEG or WebP images, 5 MB each." };
  }

  const candidates = !images.length && workersAI
    ? WORKERS_AI_CURATED_MODEL_IDS.slice(0, 3).map(model_id => ({ provider: "cloudflare", model_id }))
    : (await getInventory()).filter(model =>
        model.chat_eligible && (images.length ? model.provider === "openai" &&
          (model.capabilities?.vision || model.capabilities?.image_input) : true)).slice(0, 3);
  if (!candidates.length) {
    return { ok: false, status: 503, error: images.length
      ? "Connect an OpenAI model that accepts images in AgentSam Settings."
      : "Connect an available chat model in AgentSam Settings." };
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
  for (const model of candidates) {
    if (signal?.aborted) return { ok: false, status: 499, error: "Request cancelled." };
    const response = await sendChat({
      provider: model.provider, model_id: model.model_id, run_mode: "ask", surface: "side", messages,
    });
    if (!response.ok) continue;
    if (!response.headers.get("content-type")?.startsWith("text/plain")) continue;
    const reply = (await response.text()).trim();
    if (reply) return { ok: true, reply, model: model.model_id };
  }
  return { ok: false, status: 502, error: "AgentSam could not get a reply from the configured models. Try again." };
}
