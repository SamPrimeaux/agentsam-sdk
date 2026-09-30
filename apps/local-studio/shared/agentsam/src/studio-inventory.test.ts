import test from "node:test";
import assert from "node:assert/strict";

import { buildStudioInventory } from "./studio-inventory.ts";
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
  assert.equal(user123.providers.find((row: { id: string; source: string | null }) => row.id === "openai")?.source, "user_vault");
  assert.equal(user345.providers.find((row: { id: string; source: string | null }) => row.id === "openai")?.source, "user_vault");
});
