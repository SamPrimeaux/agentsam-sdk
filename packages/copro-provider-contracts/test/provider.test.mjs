import test from "node:test";
import assert from "node:assert/strict";
import {
  COPRO_PROVIDER_CAPABILITIES,
  defineProviderAdapter,
  supportsCapability,
  invokeCapability,
} from "../src/index.js";

test("provider contracts use product capabilities rather than vendor names", () => {
  assert.ok(COPRO_PROVIDER_CAPABILITIES.includes("render.video"));
  assert.ok(COPRO_PROVIDER_CAPABILITIES.includes("media.transcribe"));
  assert.ok(!COPRO_PROVIDER_CAPABILITIES.some((name) => /cloudflare|gemini|veo|whisper/i.test(name)));
});

test("adapter invocation is capability gated", async () => {
  const adapter = defineProviderAdapter({
    id: "example",
    capabilities: ["media.transcribe"],
    invoke: async (capability, input) => ({ capability, input }),
  });
  assert.equal(supportsCapability(adapter, "media.transcribe"), true);
  assert.deepEqual(
    await invokeCapability(adapter, "media.transcribe", { assetId: "asset:1" }),
    { capability: "media.transcribe", input: { assetId: "asset:1" } }
  );
  await assert.rejects(
    invokeCapability(adapter, "video.generate", {}),
    /copro_provider_capability_unsupported/
  );
});
