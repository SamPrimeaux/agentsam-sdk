import test from "node:test";
import assert from "node:assert/strict";

import { buildStudioInventory, mergeBoundWorkersAIInventory, WORKERS_AI_CURATED } from "./studio-inventory.ts";
import type { StudioCredential } from "./studio-vault.ts";

function response(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

test("Studio inventory is live and credential-scoped per user", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (_input, init) => {
    const auth = new Headers(init?.headers).get("authorization") || "";
    if (auth === "Bearer user123-openai") {
      return response({ data: [{ id: "gpt-5.6-luna" }, { id: "o3" }] });
    }
    if (auth === "Bearer user345-openai") {
      return response({ data: [{ id: "gpt-5.6-sol" }] });
    }
    throw new Error(`unexpected credential: ${auth}`);
  };

  const credentials = (value: string) => new Map<string, StudioCredential>([
    ["openai", { value, source: "user_vault" }],
  ]);

  const user123 = await buildStudioInventory(credentials("user123-openai"));
  const user345 = await buildStudioInventory(credentials("user345-openai"));

  assert.deepEqual(
    user123.availableModels.map((row: { provider: string; model_id: string }) => `${row.provider}:${row.model_id}`),
    ["openai:gpt-5.6-luna", "openai:o3"],
  );
  assert.deepEqual(
    user345.availableModels.map((row: { provider: string; model_id: string }) => `${row.provider}:${row.model_id}`),
    ["openai:gpt-5.6-sol"],
  );
  assert.notDeepEqual(user123.availableModels, user345.availableModels);
  assert.equal(user123.availableModels.find((row) => row.model_id === "gpt-5.6-luna")?.chat_eligible, true);
  assert.equal(user345.availableModels.find((row) => row.model_id === "gpt-5.6-sol")?.chat_eligible, true);
  assert.equal(user123.providers.find((row: { id: string; source: string | null }) => row.id === "openai")?.source, "user_vault");
  assert.equal(user345.providers.find((row: { id: string; source: string | null }) => row.id === "openai")?.source, "user_vault");
});


test("Studio inventory discovers two independent keys for one provider", async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  globalThis.fetch = async (_input, init) => {
    const auth = new Headers(init?.headers).get("authorization") || "";
    if (auth === "Bearer key-primary") return response({ data: [{ id: "gpt-primary" }] });
    if (auth === "Bearer key-secondary") return response({ data: [{ id: "gpt-secondary" }] });
    throw new Error("unexpected credential");
  };

  const inventory = await buildStudioInventory([
    { id: "secret_primary", provider: "openai", serviceName: "openai", name: "Primary", last4: "1111", value: "key-primary", source: "user_vault" },
    { id: "secret_secondary", provider: "openai", serviceName: "openai", name: "Secondary", last4: "2222", value: "key-secondary", source: "user_vault" },
  ]);
  assert.deepEqual(
    inventory.credentialModels.map((row) => [String(row.credential_id), String(row.model_id)]),
    [["secret_primary", "gpt-primary"], ["secret_secondary", "gpt-secondary"]],
  );
  assert.equal(inventory.providers.find((row: { id: string }) => row.id === "openai")?.credentialCount, 2);
  assert.doesNotMatch(JSON.stringify(inventory), /key-primary|key-secondary/);
});


test("Workers AI is represented as a host binding resource, separate from user API credentials", () => {
  const original = { providers: [], availableModels: [], credentialModels: [] };
  assert.equal(mergeBoundWorkersAIInventory(original, null), original);

  const merged = mergeBoundWorkersAIInventory(original, { run: async () => ({}) });
  const modelId = WORKERS_AI_CURATED[0];
  assert.ok(modelId);
  assert.equal(merged.providers?.find((row) => row.id === "cloudflare")?.bindingConfigured, true);
  assert.ok(merged.availableModels?.some((row) => row.provider === "cloudflare" && row.model_id === modelId));
  const credentialModel = merged.credentialModels?.find((row) =>
    row.credential_id === "host:cloudflare" && row.model_id === modelId,
  );
  assert.equal(credentialModel?.credential_source, "host_workers_ai_binding");
  assert.equal(credentialModel?.visible, true);
});
