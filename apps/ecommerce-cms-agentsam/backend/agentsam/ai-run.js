/**
 * Workers AI runner — D1 registry model selection. No emergency fallbacks.
 */

import { trackAgentSamEvent, estimateCostUsd, estimateTokens } from "./analytics.js";
import {
  getFallbackChain,
  normalizeChatRouting,
} from "./ai-registry.js";

const MAX_SYSTEM_CHARS = 12000;

const USER_REPLIES = {
  vision_no_image:
    "I see you want image review, but I couldn't load the attachment for visual analysis. Try re-uploading the image, or describe what you'd like me to review.",
  vision_failed:
    "I couldn't analyze the image right now. Try again in a moment, re-upload the image, or describe what you want reviewed in text.",
  image_gen_failed:
    "I couldn't generate an image right now. Try again in a moment or simplify the prompt.",
  all_models_failed:
    "I hit a temporary issue reaching the AI models. Please try again in a moment.",
};

function parseJson(raw, fallback = null) {
  try {
    if (raw == null || raw === "") return fallback;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return fallback;
  }
}

function extractReply(result) {
  if (!result) return "";
  if (typeof result.response === "string") return result.response;
  if (typeof result.content === "string") return result.content;
  if (typeof result.text === "string") return result.text;
  if (Array.isArray(result.messages)) {
    const last = result.messages[result.messages.length - 1];
    if (last?.content) return String(last.content);
  }
  if (result.result?.response) return String(result.result.response);
  if (typeof result.description === "string") return result.description;
  return "";
}

function trimSystem(text) {
  const s = String(text || "");
  if (s.length <= MAX_SYSTEM_CHARS) return s;
  return `${s.slice(0, MAX_SYSTEM_CHARS)}\n\n[context truncated]`;
}

function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!u8.length) return "";
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    binary += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function normalizeImageBytes(result) {
  if (!result) return null;
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (result instanceof Uint8Array) return result;
  if (result instanceof ReadableStream) return null;
  if (result?.image instanceof Uint8Array) return result.image;
  if (result?.image instanceof ArrayBuffer) return new Uint8Array(result.image);
  if (Array.isArray(result) && result[0]?.image) {
    const img = result[0].image;
    return img instanceof Uint8Array ? img : new Uint8Array(img);
  }
  return null;
}

function resolveImageDataUrl(routing) {
  if (routing.image_base64) {
    const raw = String(routing.image_base64).replace(/^data:[^;]+;base64,/, "");
    const mime = routing.image_mime_type || "image/jpeg";
    return `data:${mime};base64,${raw}`;
  }
  if (routing.image_url) {
    const url = String(routing.image_url);
    if (url.startsWith("http") || url.startsWith("data:")) return url;
    return url;
  }
  return null;
}

function hasVisionInput(routing) {
  return Boolean(resolveImageDataUrl(routing));
}

function isModelCompatible(model, taskType, routing) {
  const modelTask = model.task_type || taskType;
  if (taskType === "image_generation") return modelTask === "image_generation";
  if (taskType === "image_to_text") {
    if (modelTask !== "image_to_text") return false;
    if (!hasVisionInput(routing) && !model.supports_vision) return false;
    return true;
  }
  if (modelTask === "image_generation" || modelTask === "image_to_text") return false;
  if (modelTask === "embedding" || modelTask === "rerank" || modelTask === "safety") return false;
  return modelTask === taskType || modelTask === "text_generation" || modelTask === "code_generation";
}

function buildVisionPayload(model, systemPrompt, userMessage, routing, defaults) {
  const user = String(userMessage || "").slice(0, 4000);
  const imageUrl = resolveImageDataUrl(routing);
  if (!imageUrl) throw new Error("vision_requires_image");

  const useMessagesFormat = model.supports_vision !== false;
  if (useMessagesFormat) {
    return {
      messages: [
        { role: "system", content: trimSystem(systemPrompt) },
        {
          role: "user",
          content: [
            { type: "text", text: user },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: defaults.max_tokens || 1200,
      ...defaults,
    };
  }

  return {
    messages: [
      { role: "system", content: trimSystem(systemPrompt) },
      { role: "user", content: user },
    ],
    image: imageUrl,
    max_tokens: defaults.max_tokens || 1200,
    ...defaults,
  };
}

async function executeModel(env, model, systemPrompt, userMessage, routing) {
  const defaults =
    model.request_defaults ||
    parseJson(model.request_defaults_json, {}) ||
    {};
  const taskType = model.task_type || routing.task_type;
  const user = String(userMessage || "").slice(0, 4000);

  if (taskType === "image_generation") {
    if (!env.OPENAI_API_KEY) throw new Error("missing_OPENAI_API_KEY_secret");

    const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: user,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    const rawText = await imgRes.text();
    console.log("[image_gen] status:", imgRes.status, "body:", rawText.slice(0, 300));

    if (!imgRes.ok) {
      throw new Error(`openai_image_${imgRes.status}: ${rawText.slice(0, 200)}`);
    }

    const imgData = JSON.parse(rawText);
    const b64 = imgData?.data?.[0]?.b64_json;
    if (b64) {
      return {
        reply: "Here is your generated image.",
        image_base64: b64,
        mime_type: "image/png",
      };
    }
    throw new Error("empty_b64_response: " + rawText.slice(0, 200));
  }

  if (taskType === "image_to_text") {
    const payload = buildVisionPayload(model, systemPrompt, userMessage, routing, defaults);
    const result = await env.AGENTSAM_WAI.run(model.model_id, payload, { gateway: { id: "fuelnfreetime-agentsam", skipCache: false } });
    const reply = extractReply(result).trim();
    if (reply) return { reply };
    throw new Error("empty_vision_response");
  }

  const result = await env.AGENTSAM_WAI.run(model.model_id, {
    messages: [
      { role: "system", content: trimSystem(systemPrompt) },
      { role: "user", content: user },
    ],
    max_tokens: defaults.max_tokens || 1024,
    ...defaults,
  }, { gateway: { id: "fuelnfreetime-agentsam", skipCache: false } });

  const reply = extractReply(result).trim();
  if (reply) return { reply };
  throw new Error("empty_response");
}

function analyticsBase(routing) {
  const ctx = routing.analytics || {};
  return {
    ctx: ctx.execution_ctx,
    session_id: ctx.session_id,
    conversation_id: ctx.conversation_id,
    message_id: ctx.message_id,
    run_id: ctx.run_id,
    workflow_key: ctx.workflow_key || routing.workflow_key,
    workflow_id: ctx.workflow_id,
    user_id: ctx.user_id,
    admin_user_id: ctx.admin_user_id,
    user_email: ctx.user_email,
    intent: routing.intent || ctx.intent,
    task_type: routing.task_type,
  };
}

function preflightAiRequest(routing) {
  const taskType = routing.task_type;

  if (taskType === "image_to_text" && !hasVisionInput(routing)) {
    return {
      ok: false,
      user_reply: USER_REPLIES.vision_no_image,
      error: "vision_requires_image",
      recoverable: true,
    };
  }

  return { ok: true };
}

async function runTextFallback(env, systemPrompt, userMessage, routing, trackOpts) {
  const textRouting = normalizeChatRouting({
    ...routing,
    task_type: routing.repo_related ? "code_generation" : "text_generation",
    lane: routing.repo_related ? "code" : "general",
    has_image: false,
    image_base64: null,
    image_url: null,
    vision_downgraded: true,
  });

  const chain = await getFallbackChain(env, textRouting);
  const compatible = chain.filter((m) => isModelCompatible(m, textRouting.task_type, textRouting));
  const models = compatible;

  for (const model of models) {
    try {
      const output = await executeModel(env, model, systemPrompt, userMessage, textRouting);
      if (output?.reply) {
        await trackAgentSamEvent(
          env,
          {
            event_type: "ai_model",
            event_name: "vision_downgraded_to_text",
            status: "success",
            model_id: model.model_id,
            task_type: textRouting.task_type,
            metadata: { original_task_type: routing.task_type },
          },
          trackOpts
        );
        return {
          ok: true,
          reply: output.reply,
          model: model.model_id,
          selected_model: model.model_id,
          model_lane: model.lane,
          task_type: textRouting.task_type,
          auxiliary_task_type: routing.task_type,
          vision_downgraded: true,
          fallback_used: true,
          registry: !model.emergency,
          attempted_models: [{ model_id: model.model_id, ok: true, vision_downgrade: true }],
        };
      }
    } catch {
      /* try next */
    }
  }

  return null;
}

export async function runAgentSamAi(env, systemPrompt, userMessage, routing = {}) {
  if (!env.AGENTSAM_WAI) {
    return { ok: false, stub: true, error: "AGENTSAM_WAI not bound" };
  }

  const normalized = normalizeChatRouting(routing);
  const preflight = preflightAiRequest(normalized);
  if (!preflight.ok) {
    return {
      ok: false,
      recoverable: true,
      user_reply: preflight.user_reply,
      error: preflight.error,
      task_type: normalized.task_type,
      attempted_models: [],
    };
  }

  const chain = await getFallbackChain(env, normalized);
  const compatibleChain = chain.filter((m) => isModelCompatible(m, normalized.task_type, normalized));

  const attemptedModels = [];
  let selectedModel = null;
  let lastError = null;
  let fallbackUsed = false;
  const aiStarted = Date.now();
  const trackOpts = analyticsBase(routing);

  const modelsToTry = compatibleChain;

  for (let index = 0; index < modelsToTry.length; index += 1) {
    const model = modelsToTry[index];
    const started = Date.now();

    try {
      const output = await executeModel(
        env,
        model,
        systemPrompt,
        userMessage,
        normalized
      );

      if (!output?.reply && !output?.image_base64) {
        throw new Error("empty_response");
      }

      if (index > 0) fallbackUsed = true;
      selectedModel = model;

      const durationMs = Date.now() - started;
      attemptedModels.push({
        model_id: model.model_id,
        display_name: model.display_name || model.model_id,
        lane: model.lane,
        task_type: model.task_type,
        index,
        ok: true,
        duration_ms: durationMs,
        emergency: !!model.emergency,
      });

      const inputTokens = estimateTokens(userMessage) + estimateTokens(systemPrompt);
      const outputTokens = estimateTokens(output.reply);
      const aiLatencyMs = Date.now() - aiStarted;
      const costTier = model.cost_tier || "unknown";
      const estimatedCostUsd = estimateCostUsd(inputTokens, outputTokens, costTier);

      await trackAgentSamEvent(
        env,
        {
          event_type: "ai_model",
          event_name: "model_selected",
          status: "success",
          provider: "workers_ai",
          model_id: model.model_id,
          model_lane: model.lane,
          task_type: normalized.task_type,
          fallback_used: fallbackUsed,
          fallback_attempt_index: index,
          attempted_models: attemptedModels,
          ai_latency_ms: durationMs,
          metadata: {
            emergency: !!model.emergency,
            registry: !model.emergency,
            prompt_cache_hit: routing.prompt_meta?.prompt_cache_hit ?? null,
            context_cache_hit: routing.prompt_meta?.context_cache_hit ?? null,
          },
        },
        trackOpts
      );

      return {
        ok: true,
        reply: output.reply,
        image_base64: output.image_base64 || null,
        mime_type: output.mime_type || null,
        model: model.model_id,
        selected_model: model.model_id,
        model_lane: model.lane,
        task_type: normalized.task_type,
        auxiliary_task_type: normalized.auxiliary_task_type || null,
        attempted_models: attemptedModels,
        fallback_used: fallbackUsed,
        registry: !model.emergency,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        estimated_cost_usd: estimatedCostUsd,
        ai_latency_ms: aiLatencyMs,
        cost_tier: costTier,
      };
    } catch (err) {
      lastError = err;
      const durationMs = Date.now() - started;
      attemptedModels.push({
        model_id: model.model_id,
        display_name: model.display_name || model.model_id,
        lane: model.lane,
        task_type: model.task_type,
        index,
        ok: false,
        error: err?.message || String(err),
        duration_ms: durationMs,
        emergency: !!model.emergency,
      });

      await trackAgentSamEvent(
        env,
        {
          event_type: "ai_model",
          event_name: "model_fallback",
          status: "fallback",
          provider: "workers_ai",
          model_id: model.model_id,
          model_lane: model.lane,
          task_type: normalized.task_type,
          fallback_used: 1,
          fallback_attempt_index: index,
          error_code: err?.message || "model_failed",
          error_message: err?.message || String(err),
          error_stage: "ai_run",
          ai_latency_ms: durationMs,
          attempted_models: attemptedModels,
        },
        trackOpts
      );

      console.error(
        "agentsam ai model failed",
        model.model_id,
        err?.message || err
      );
    }
  }

  if (normalized.task_type === "image_to_text") {
    const downgrade = await runTextFallback(env, systemPrompt, userMessage, normalized, trackOpts);
    if (downgrade?.ok) {
      return {
        ...downgrade,
        input_tokens: estimateTokens(userMessage) + estimateTokens(systemPrompt),
        output_tokens: estimateTokens(downgrade.reply),
        ai_latency_ms: Date.now() - aiStarted,
        estimated_cost_usd: 0,
      };
    }
  }

  const userReply =
    normalized.task_type === "image_generation"
      ? USER_REPLIES.image_gen_failed
      : normalized.task_type === "image_to_text"
        ? USER_REPLIES.vision_failed
        : USER_REPLIES.all_models_failed;

  await trackAgentSamEvent(
    env,
    {
      event_type: "error",
      event_name: "all_models_failed",
      status: "failed",
      task_type: normalized.task_type,
      error_code: lastError?.message || "all_models_failed",
      error_message: lastError?.message || "all_models_failed",
      error_stage: "ai_run",
      attempted_models: attemptedModels,
      ai_latency_ms: Date.now() - aiStarted,
    },
    trackOpts
  );

  return {
    ok: false,
    recoverable: true,
    user_reply: userReply,
    error: lastError?.message || "all_models_failed",
    selected_model: selectedModel?.model_id || null,
    model_lane: normalized.lane,
    task_type: normalized.task_type,
    attempted_models: attemptedModels,
    fallback_used: attemptedModels.length > 1,
    ai_latency_ms: Date.now() - aiStarted,
  };
}
