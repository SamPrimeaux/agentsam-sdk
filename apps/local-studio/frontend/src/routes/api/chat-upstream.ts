/**
 * Provider-specific Chat Completions body translation.
 * Keep a shared internal shape (`max_tokens`) and map per upstream contract.
 */

export type StudioChatUpstreamBody = {
  model: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  messages: unknown;
  [key: string]: unknown;
};

/**
 * OpenAI Chat Completions rejects `max_tokens` for o-series / newer models and
 * requires `max_completion_tokens`. Anthropic and others keep their own fields.
 */
export function translateStudioChatUpstreamBody(
  provider: string,
  body: StudioChatUpstreamBody,
): StudioChatUpstreamBody {
  const id = String(provider || "").trim().toLowerCase();
  if (id !== "openai") return body;

  const { max_tokens, ...rest } = body;
  if (typeof max_tokens !== "number" || !Number.isFinite(max_tokens)) {
    return rest as StudioChatUpstreamBody;
  }
  return {
    ...rest,
    max_completion_tokens: Math.max(1, Math.floor(max_tokens)),
  };
}
