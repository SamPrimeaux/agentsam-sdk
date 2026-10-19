/**
 * Provider-bound image generation: no hard-coded model, no silent option drops.
 * Invoked only by an authenticated user action through the existing chat route.
 */
const SUPPORTED = {
  background: ["auto", "transparent", "opaque"],
  size: ["auto", "square", "landscape", "portrait"],
  quality: ["auto", "low", "medium", "high"],
  format: ["png", "webp", "jpeg"],
};
function option(value, choices, fallback, name) {
  const selected = value == null ? fallback : String(value);
  if (!choices.includes(selected)) throw new Error("invalid_image_" + name);
  return selected;
}
export function normalizeImageOptions(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("invalid_image_options");
  const background = option(raw.background === "white" ? "opaque" : raw.background, SUPPORTED.background, "auto", "background");
  const size = option(raw.size, SUPPORTED.size, "auto", "size");
  const quality = option(raw.quality, SUPPORTED.quality, "auto", "quality");
  const format = option(raw.format === "jpg" ? "jpeg" : raw.format, SUPPORTED.format, "png", "format");
  const variations = raw.variations == null ? 1 : Number(raw.variations);
  if (variations !== 1) throw new Error("multiple_image_candidates_not_yet_supported");
  return { background, size, quality, format, variations };
}
function decodeBase64(raw) {
  const value = String(raw || "").replace(/^data:[^;]+;base64,/, "");
  if (!value || value.length > 28_000_000 || !/^[a-z0-9+/]+={0,2}$/i.test(value)) throw new Error("invalid_image_payload");
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}
function encodeBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function imageMime(bytes) {
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((value,index) => bytes[index] === value)) return "image/png";
  if (bytes.length >= 24 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return "image/jpeg";
  if (bytes.length >= 24 && String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP") return "image/webp";
  return null;
}
function imageResult(bytes, provider, modelId, options) {
  if (!bytes || bytes.length < 24 || bytes.length > 20 * 1024 * 1024) throw new Error("image_output_size_invalid");
  const mime_type = imageMime(bytes);
  if (!mime_type) throw new Error("provider_returned_invalid_image");
  const requestedMime = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[options.format];
  if (requestedMime !== mime_type) throw new Error("provider_image_format_mismatch");
  return {
    reply: "Generated image ready for review.",
    image_base64: encodeBase64(bytes), mime_type,
    provider, model_id: modelId,
  };
}
export async function generateRegisteredImage(env, model, prompt, rawOptions = {}) {
  if (model?.task_type !== "image_generation") throw new Error("model_not_image_generation");
  const modelId = String(model?.model_id || "");
  if (!/^[a-zA-Z0-9@][a-zA-Z0-9._:/-]{1,160}$/.test(modelId)) throw new Error("invalid_image_model_id");
  const text = String(prompt || "").trim().slice(0, 1000);
  if (!text) throw new Error("image_prompt_required");
  const options = normalizeImageOptions(rawOptions);
  if (model.provider === "openai") {
    if (!env.OPENAI_API_KEY) throw new Error("openai_credentials_unavailable");
    const sizes = { square: "1024x1024", landscape: "1536x1024", portrait: "1024x1536" };
    const body = {
      model: modelId, prompt: text, n: 1,
      ...(options.size !== "auto" ? { size: sizes[options.size] } : {}),
      ...(options.background !== "auto" ? { background: options.background } : {}),
      ...(options.quality !== "auto" ? { quality: options.quality } : {}),
      output_format: options.format,
    };
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw new Error("openai_image_http_" + response.status);
    const payload = await response.json();
    return imageResult(decodeBase64(payload?.data?.[0]?.b64_json), "openai", modelId, options);
  }
  if (model.provider === "workers_ai") {
    if (!env.AGENTSAM_WAI?.run) throw new Error("workers_ai_binding_unavailable");
    // A model-specific profile is required before using provider-dependent options.
    if (options.background !== "auto" || options.quality !== "auto" ||
        options.size !== "auto" || options.format !== "png") {
      throw new Error("workers_ai_image_options_require_model_profile");
    }
    const output = await env.AGENTSAM_WAI.run(modelId, { prompt: text });
    const bytes = output instanceof Uint8Array ? output
      : output instanceof ArrayBuffer ? new Uint8Array(output)
      : output?.image instanceof Uint8Array ? output.image
      : output?.image instanceof ArrayBuffer ? new Uint8Array(output.image)
      : typeof output?.image === "string" ? decodeBase64(output.image)
      : null;
    return imageResult(bytes, "workers_ai", modelId, options);
  }
  throw new Error("image_provider_not_supported");
}
