import test from "node:test";
import assert from "node:assert/strict";
import { generateRegisteredImage, normalizeImageOptions } from "../backend/agentsam/media-image-runtime.js";
import { resolveAIRouting } from "../backend/agentsam/ai-registry.js";

const tinyPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pCsAAAAASUVORK5CYII=";
const model = { provider: "openai", model_id: "registered-image-model", task_type: "image_generation" };

test("media image options reject values that providers would otherwise ignore", () => {
  assert.deepEqual(normalizeImageOptions({ background: "white", size: "square", quality: "high" }), {
    background: "opaque", size: "square", quality: "high", format: "png", variations: 1,
  });
  assert.throws(() => normalizeImageOptions({ quality: "ultra" }), /invalid_image_quality/);
  assert.throws(() => normalizeImageOptions({ variations: 3 }), /multiple_image_candidates/);
});

test("OpenAI image lane uses the selected registered model and real requested settings", async () => {
  const previous = globalThis.fetch;
  let received;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/images/generations");
      received = JSON.parse(init.body);
      assert.equal(init.headers.authorization, "Bearer test-secret");
      return Response.json({ data: [{ b64_json: tinyPng }] });
    };
    const output = await generateRegisteredImage(
      { OPENAI_API_KEY: "test-secret" }, model, "Draw an icon",
      { background: "transparent", size: "landscape", quality: "high", format: "png" },
    );
    assert.equal(received.model, "registered-image-model");
    assert.equal(received.background, "transparent");
    assert.equal(received.size, "1536x1024");
    assert.equal(received.quality, "high");
    assert.equal(received.output_format, "png");
    assert.equal(output.mime_type, "image/png");
    assert.equal(output.image_base64, tinyPng);
  } finally {
    globalThis.fetch = previous;
  }
});

test("Workers AI generation is called with its real model ID and image bytes", async () => {
  let got;
  const bytes = Uint8Array.from(Buffer.from(tinyPng, "base64"));
  const result = await generateRegisteredImage({
    AGENTSAM_WAI: { run: async (...args) => { got = args; return { image: bytes }; } },
  }, { provider: "workers_ai", model_id: "@cf/usable-image-model", task_type: "image_generation" }, "Create a badge");
  assert.equal(got[0], "@cf/usable-image-model");
  assert.deepEqual(got[1], { prompt: "Create a badge" });
  assert.equal(result.mime_type, "image/png");
  assert.equal(result.image_base64, tinyPng);
});

test("Workers AI incompatible options and unsupported providers fail without fallback", async () => {
  const workers = { provider: "workers_ai", model_id: "@cf/test", task_type: "image_generation" };
  let called = false;
  await assert.rejects(
    () => generateRegisteredImage({ AGENTSAM_WAI: { run: () => { called = true; } } },
      workers, "Logo", { background: "transparent" }),
    /workers_ai_image_options_require_model_profile/,
  );
  assert.equal(called, false);
  await assert.rejects(() => generateRegisteredImage({}, { ...model, provider: "unknown" }, "Logo"), /image_provider_not_supported/);
  await assert.rejects(() => generateRegisteredImage({}, model, "Logo"), /openai_credentials_unavailable/);
});


test("Studio generate click routes arbitrary artwork prompt to the image lane", () => {
  const classification = { intent: "studio", workflow_key: "creative" };
  const routing = resolveAIRouting(classification, "Retro sunset badge", {
    task_type: "image_generation", mode: "image", lane: "image",
  });
  assert.equal(routing.task_type, "image_generation");
  assert.equal(routing.lane, "image");
  const normal = resolveAIRouting({ intent: "general" }, "What does this cost?");
  assert.equal(normal.task_type, "text_generation");
});
