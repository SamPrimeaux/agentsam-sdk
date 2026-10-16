import test from "node:test";
import assert from "node:assert/strict";
import { mergeBoundWorkersAIInventory } from "../backend/worker/bound-workers-inventory.js";
import { WORKERS_AI_CURATED_MODEL_IDS } from "@inneranimalmedia/agentsam-sdk/models/inventory";

const binding = { async run() { return { response: "ok" }; } };

test("host binding enables curated Workers AI options without a user Cloudflare API token", () => {
  const result = mergeBoundWorkersAIInventory({
    ok: true, providers: [{ id: "cloudflare", label: "Cloudflare", configured: false, source: null }],
    availableModels: [], discovery: {},
  }, binding);
  assert.equal(result.providers.find((row) => row.id === "cloudflare").configured, true);
  assert.equal(result.providers.find((row) => row.id === "cloudflare").source, "host_workers_ai_binding");
  assert.equal(result.availableModels.length, WORKERS_AI_CURATED_MODEL_IDS.length);
  assert.ok(result.availableModels.every((row) => row.chat_eligible && row.eligibility_source === "host_workers_ai_binding_allowlist"));
  assert.ok(result.availableModels.every((row) => row.availability === "binding_configured"));
});

test("user-discovered models remain available and binding models do not duplicate them", () => {
  const existing = {
    ok: true,
    providers: [{ id: "openai", label: "OpenAI", configured: true, source: "user_vault" }],
    availableModels: [
      { provider: "openai", model_id: "account-model", chat_eligible: true },
      { provider: "cloudflare", model_id: WORKERS_AI_CURATED_MODEL_IDS[0], label: "Discovered title" },
    ],
  };
  const result = mergeBoundWorkersAIInventory(existing, binding);
  assert.equal(result.availableModels.length, 1 + WORKERS_AI_CURATED_MODEL_IDS.length);
  assert.equal(result.availableModels.find((row) => row.model_id === "account-model").provider, "openai");
  assert.equal(result.availableModels.find((row) => row.model_id === WORKERS_AI_CURATED_MODEL_IDS[0]).label, "Discovered title");
});

test("no binding means no claims about Workers AI availability", () => {
  const input = { providers: [], availableModels: [] };
  assert.equal(mergeBoundWorkersAIInventory(input, null), input);
  assert.equal(mergeBoundWorkersAIInventory(input, {}), input);
});

test("inventory projection never carries binding internals or secret values", () => {
  const input = { providers: [], availableModels: [], discovery: {} };
  const value = mergeBoundWorkersAIInventory(input, binding);
  const encoded = JSON.stringify(value);
  assert.equal(encoded.includes("async run"), false);
  assert.equal(encoded.includes('"run"'), false);
});
