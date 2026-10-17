/**
 * Workers AI runner — D1 registry model selection. No emergency fallbacks.
 */

import { trackAgentSamEvent, estimateCostUsd, estimateTokens } from "./analytics.js";
import { generateRegisteredImage } from "./media-image-runtime.js";
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

function parseToolArguments(raw) {
  if (raw == null || raw === "") return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function extractToolCalls(result) {
  if (!result) return [];
  const direct =
    (Array.isArray(result.tool_calls) && result.tool_calls) ||
    (Array.isArray(result.result?.tool_calls) && result.result.tool_calls) ||
    (Array.isArray(result.choices?.[0]?.message?.tool_calls) && result.choices[0].message.tool_calls) ||
    [];

  return direct
    .map((call, index) => {
      const fn = call?.function || call || {};
      const name = String(fn.name || call?.name || "").trim();
      if (!name) return null;
      return {
        id: call?.id || `toolcall_${index + 1}`,
        name,
        arguments: parseToolArguments(fn.arguments ?? call?.arguments),
      };
    })
    .filter(Boolean);
}

function trimSystem(text) {
  const s = String(text || "");
  if (s.length <= MAX_SYSTEM_CHARS) return s;
  return `${s.slice(0, MAX_SYSTEM_CHARS)}\n\n[context truncated]`;
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

function resolveVisionImages(routing) {
  const list = Array.isArray(routing.image_attachments) ? routing.image_attachments : [];
  const urls = list.slice(0, 6).map(item => resolveImageDataUrl({
    image_base64: item?.image_base64,
    image_url: item?.url || item?.image_url,
    image_mime_type: item?.mime_type || item?.image_mime_type,
  })).filter(Boolean);
  const single = resolveImageDataUrl(routing);
  return urls.length ? urls : (single ? [single] : []);
}

function hasVisionInput(routing) {
  return resolveVisionImages(routing).length > 0;
}

function isModelCompatible(model, taskType, routing) {
  const modelTask = model.task_type || taskType;
  if (taskType === "image_generation") return modelTask === "image_generation";
  if (taskType === "image_to_text") {
    if (modelTask !== "image_to_text") return false;
    // Never send an image through a text-only adapter and claim it was inspected.
    return model.supports_vision !== false && hasVisionInput(routing);
  }
  if (modelTask === "image_generation" || modelTask === "image_to_text") return false;
  if (modelTask === "embedding" || modelTask === "rerank" || modelTask === "safety") return false;
  return modelTask === taskType || modelTask === "text_generation" || modelTask === "code_generation";
}

function buildVisionPayload(model, systemPrompt, userMessage, routing, defaults) {
  const user = String(userMessage || "").slice(0, 4000);
  const images = resolveVisionImages(routing);
  if (!images.length) throw new Error("vision_requires_image");
  if (model.supports_vision === false) throw new Error("model_does_not_support_vision");
  const content = [];
  if (user) content.push({ type: "text", text: user });
  for (const url of images) content.push({ type: "image_url", image_url: { url } });
  return {
    messages: [
      { role: "system", content: trimSystem(systemPrompt) },
      { role: "user", content },
    ],
    max_tokens: defaults.max_tokens || 1200,
    ...defaults,
  };
}

/** OpenAI Responses API transport; the model is selected by the same D1
 * registry as Workers AI. No built-in platform keys or hardcoded model lists.
 */
export async function executeOpenAiChat(env, model, systemPrompt, userMessage, routing, defaults = {}) {
  if (!env.OPENAI_API_KEY) throw new Error('openai_credentials_unavailable');
  if (!model?.model_id || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,120}$/.test(model.model_id))
    throw new Error('invalid_registered_openai_model');
  const messages = Array.isArray(routing.messages) && routing.messages.length
    ? routing.messages : [{role:'system',content:trimSystem(systemPrompt)},{role:'user',content:String(userMessage||'').slice(0,4000)}];
  const body={model:model.model_id,input:messages.map(item=>({role:item.role,content:item.content})),
    max_output_tokens:Math.min(4096,Math.max(128,Number(defaults.max_output_tokens || defaults.max_tokens || 1024)))};
  // External requests are server-side only. Never expose user keys to HTML.
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',headers:{authorization:`Bearer ${env.OPENAI_API_KEY}`,'content-type':'application/json'},
    body:JSON.stringify(body),signal:AbortSignal.timeout(45000),
  });
  if(!response.ok){
    const code=response.status;
    throw new Error('openai_responses_http_'+code);
  }
  const data=await response.json();
  const parts=(data.output||[]).flatMap(item=>(item.content||[]).filter(part=>part.type==='output_text').map(part=>part.text||''));
  const reply=String(data.output_text || parts.join('\n')).trim();
  if(!reply)throw new Error('openai_empty_response');
  return {reply,tool_calls:[]};
}

async function executeModel(env, model, systemPrompt, userMessage, routing) {
  const defaults =
    model.request_defaults ||
    parseJson(model.request_defaults_json, {}) ||
    {};
  const taskType = model.task_type || routing.task_type;
  const user = String(userMessage || "").slice(0, 4000);

  if (taskType === "image_generation") {
    return generateRegisteredImage(env, model, user, routing.image_options || {});
  }

  if (model.provider === 'openai' && taskType !== 'image_generation') {
    if (!['text_generation','code_generation','image_to_text'].includes(taskType))
      throw new Error('openai_task_not_implemented');
    if (taskType === 'image_to_text') {
      if (model.supports_vision === false) throw new Error('model_does_not_support_vision');
      const images = resolveVisionImages(routing);
      if (!images.length) throw new Error('vision_requires_image');
      // OpenAI Responses uses input_image, not Workers AI's image_url shape.
      const parts = [];
      if (user) parts.push({ type: 'input_text', text: user });
      for (const url of images) parts.push({ type: 'input_image', image_url: url });
      return executeOpenAiChat(env, model, systemPrompt, userMessage, {
        ...routing,
        messages: [
          { role: 'system', content: trimSystem(systemPrompt) },
          { role: 'user', content: parts },
        ],
      }, defaults);
    }
    return executeOpenAiChat(env,model,systemPrompt,userMessage,routing,defaults);
  }
  if (model.provider !== 'workers_ai' || !env.AGENTSAM_WAI?.run)
    throw new Error('workers_ai_provider_unavailable');

  if (taskType === "image_to_text") {
    const payload = buildVisionPayload(model, systemPrompt, userMessage, routing, defaults);
    const result = await env.AGENTSAM_WAI.run(model.model_id, payload, { gateway: { id: "fuelnfreetime-agentsam", skipCache: false } });
    const reply = extractReply(result).trim();
    if (reply) return { reply };
    throw new Error("empty_vision_response");
  }

  const messages =
    Array.isArray(routing.messages) && routing.messages.length
      ? routing.messages
      : [
          { role: "system", content: trimSystem(systemPrompt) },
          { role: "user", content: user },
        ];

  const payload = {
    messages,
    max_tokens: defaults.max_tokens || 1024,
    ...defaults,
  };

  if (
    model.supports_tools &&
    Array.isArray(routing.tool_definitions) &&
    routing.tool_definitions.length
  ) {
    payload.tools = routing.tool_definitions;
  }

  const result = await env.AGENTSAM_WAI.run(
    model.model_id,
    payload,
    { gateway: { id: "fuelnfreetime-agentsam", skipCache: false } },
  );

  const reply = extractReply(result).trim();
  const toolCalls = extractToolCalls(result);
  if (reply || toolCalls.length) return { reply, tool_calls: toolCalls };
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
  if (!env.AGENTSAM_WAI?.run && !env.OPENAI_API_KEY) {
    return { ok: false, stub: true, error: "No configured AI provider credentials" };
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
  const wantsTools =
    Array.isArray(normalized.tool_definitions) && normalized.tool_definitions.length > 0;
  // Optional tool declarations must not discard every conversational model.
  // Prefer tool-capable models; text-only models still return reviewable advice
  // with no tool execution or implied writes.
  const compatible = chain.filter((m) => isModelCompatible(m, normalized.task_type, normalized));
  const compatibleChain = wantsTools
    ? [...compatible.filter((m) => m.supports_tools), ...compatible.filter((m) => !m.supports_tools)]
    : compatible;

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

      if (!output?.reply && !output?.image_base64 && !output?.tool_calls?.length) {
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
      const outputTokens =
        estimateTokens(output.reply) +
        estimateTokens(output.tool_calls?.length ? JSON.stringify(output.tool_calls) : "");
      const aiLatencyMs = Date.now() - aiStarted;
      const costTier = model.cost_tier || "unknown";
      const estimatedCostUsd = estimateCostUsd(inputTokens, outputTokens, costTier);

      await trackAgentSamEvent(
        env,
        {
          event_type: "ai_model",
          event_name: "model_selected",
          status: "success",
          provider: model.provider || "workers_ai",
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
        tool_calls: output.tool_calls || [],
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
          provider: model.provider || "workers_ai",
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

  // A real image request must never silently fall back to text-only inference.
  // Fail with actionable vision diagnostics; the merchant may choose a compatible model.

  const userReply =
    normalized.task_type === "image_generation"
      ? USER_REPLIES.image_gen_failed
      : normalized.task_type === "image_to_text"
        ? "I couldn't inspect the attached image. Choose a configured model with vision support and retry; your attachment has been retained."
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
