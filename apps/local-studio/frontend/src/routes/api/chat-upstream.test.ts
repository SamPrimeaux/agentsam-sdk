import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStudioChatBody, translateStudioChatUpstreamBody } from "./chat-upstream.ts";

describe("buildStudioChatBody", () => {
  it("uses the provider defaults without injecting temperature or top_p", () => {
    for (const model of ["gpt-6-astra", "gpt-5.6-sol", "custom-discovered-model"]) {
      const payload = buildStudioChatBody({
        model,
        stream: true,
        maxTokens: 4200,
        messages: [{ role: "user", content: "hello" }],
      });
      assert.equal(payload.model, model);
      assert.equal(payload.max_tokens, 4200);
      assert.equal(Object.hasOwn(payload, "temperature"), false);
      assert.equal(Object.hasOwn(payload, "top_p"), false);
      const translated = translateStudioChatUpstreamBody("openai", payload);
      assert.equal(Object.hasOwn(translated, "temperature"), false);
      assert.equal(Object.hasOwn(translated, "top_p"), false);
      assert.equal(translated.max_completion_tokens, 4200);
    }
  });
});

describe("translateStudioChatUpstreamBody", () => {
  const base = {
    model: "gpt-5.2",
    stream: true,
    temperature: 0.6,
    max_tokens: 4200,
    messages: [{ role: "user", content: "hi" }],
  };

  it("maps max_tokens → max_completion_tokens for OpenAI (o-series / Chat Completions)", () => {
    const out = translateStudioChatUpstreamBody("openai", { ...base, model: "o4-mini" });
    assert.equal("max_tokens" in out, false);
    assert.equal(out.max_completion_tokens, 4200);
    assert.equal(out.model, "o4-mini");
    assert.equal(out.stream, true);
  });

  it("keeps max_tokens for Anthropic bodies (no global rename)", () => {
    const out = translateStudioChatUpstreamBody("anthropic", base);
    assert.equal(out.max_tokens, 4200);
    assert.equal("max_completion_tokens" in out, false);
  });

  it("leaves Grok / other OpenAI-compatible lanes unchanged", () => {
    const out = translateStudioChatUpstreamBody("grok", base);
    assert.equal(out.max_tokens, 4200);
    assert.equal("max_completion_tokens" in out, false);
  });
});
