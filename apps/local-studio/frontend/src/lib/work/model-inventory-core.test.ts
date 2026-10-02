import assert from "node:assert/strict";
import test from "node:test";
import { mergeInventoryPayloads } from "./model-inventory-core.ts";

test("desktop machine inventory remains visible when signed-in account inventory is empty", () => {
  const merged = mergeInventoryPayloads(
    {
      credential_plane: "machine",
      providers: [{ id: "openai", label: "OpenAI", configured: true, source: "agentsam_env_file" }],
      availableModels: [
        { provider: "openai", model_id: "model-x", label: "Model X", chat_eligible: true },
      ],
      selection: { provider: "openai", model_id: "model-x" },
    },
    {
      credential_plane: "studio_vault",
      providers: [{ id: "openai", label: "OpenAI", configured: false, source: null }],
      availableModels: [],
    },
  );

  assert.equal(merged.credential_plane, "mixed");
  assert.equal(merged.providers?.find((row) => row.id === "openai")?.configured, true);
  assert.equal(merged.availableModels?.[0]?.model_id, "model-x");
  assert.deepEqual(merged.selection, { provider: "openai", model_id: "model-x" });
});

test("desktop inventory wins duplicate model rows while retaining account-only models", () => {
  const merged = mergeInventoryPayloads(
    {
      providers: [{ id: "openai", label: "OpenAI", configured: true, source: "device_keychain" }],
      availableModels: [
        { provider: "openai", model_id: "shared", label: "Local Shared", chat_eligible: true },
      ],
    },
    {
      providers: [{ id: "anthropic", label: "Anthropic", configured: true, source: "account_vault" }],
      availableModels: [
        { provider: "openai", model_id: "shared", label: "Remote Shared", chat_eligible: true },
        { provider: "anthropic", model_id: "remote-only", label: "Remote Only", chat_eligible: true },
      ],
    },
  );

  assert.equal(merged.availableModels?.length, 2);
  assert.equal(merged.availableModels?.find((row) => row.model_id === "shared")?.label, "Local Shared");
  assert.equal(merged.availableModels?.some((row) => row.model_id === "remote-only"), true);
});
