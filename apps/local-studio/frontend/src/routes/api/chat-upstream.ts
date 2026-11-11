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
 * Build the Studio chat payload without guessing optional model sampling controls.
 * The selected provider/model is resolved from credential-scoped discovery at the
 * request boundary. Until a validated per-model parameter contract supplies an
 * explicit value, the provider's own sampling defaults must remain authoritative.
 *
 * This function intentionally accepts no temperature/top_p option. Those settings
 * must not leak in from a shared UI or a generic agent preset.
 */
export function buildStudioChatBody(input: {
  model: string;
  stream: boolean;
  maxTokens: number;
  messages: unknown;
}): StudioChatUpstreamBody {
  return {
    model: input.model,
    stream: input.stream,
    max_tokens: input.maxTokens,
    messages: input.messages,
  };
}

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
