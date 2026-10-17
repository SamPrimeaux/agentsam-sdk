import test from "node:test";
import assert from "node:assert/strict";
import { __setApplicationAccountId } from "../backend/lib/account-context.js";
import { saveImageDerivative, editImageWithPrompt, listEditableImageModels, generateMediaArtwork } from "../backend/media/image-operations.js";
import { CORE_EXECUTABLE_TOOL_KEYS } from "../backend/agentsam/core-tools.js";
import { executeAgentSamTool, isAgentSamToolExecutable } from "../backend/agentsam/tool-handlers.js";

const png = Uint8Array.from(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pCsAAAAASUVORK5CYII=",
  "base64",
));
const source = { id: 7, filename: "original-logo.png", r2_key: "masters/original-logo.png",
  content_type: "image/png", folder: "images", category: "logo", display_order: 2 };

test("media executable keys correspond to real handlers, not decorative planned entries", () => {
  for (const key of ["commerce_mockup_render", "media_image_generate", "media_image_background_remove", "media_image_optimize",
    "media_image_edit", "media_image_resample", "commerce_artwork_preflight"]) {
    assert.equal(CORE_EXECUTABLE_TOOL_KEYS.has(key), true);
    assert.equal(isAgentSamToolExecutable({ tool_key: key, handler_type: "core" }), true);
  }
  assert.equal(isAgentSamToolExecutable({ tool_key: "media_image_upscale", handler_type: "core" }), false);
});

test("media writes cannot bypass the AgentSam confirmation gate", async () => {
  __setApplicationAccountId("acct_test");
  let touched = false;
  const row = {
    id: "t_media_edit", tool_name: "media_image_edit", tool_key: "media_image_edit",
    display_name: "Edit image", handler_type: "core", input_schema: '{"type":"object"}',
    handler_config: "{}", resource_scope_json: '{"account_id":"acct_test"}',
    connector_access_class: "write", is_active: 1, is_degraded: 0,
    risk_level: "medium", requires_confirmation: 0,
  };
  const env = { DB: { prepare() { return { bind() { return { first: async () => {
    touched = true;
    return row;
  } }; } }; } } };
  try {
    const out = await executeAgentSamTool(env, "media_image_edit", {
      media_asset_id: 7, prompt: "Change the blue", model_id: "gpt-image-test",
    }, { user: { id: "actor" } });
    assert.equal(touched, true);
    assert.equal(out.confirmation_required, true);
  } finally { __setApplicationAccountId(null); }
});

function mediaEnv({ failure = false } = {}) {
  const writes = new Map([["masters/original-logo.png", png]]);
  let rowId = 8;
  const statements = [];
  const DB = {
    prepare(sql) {
      return {
        bind(...params) {
          statements.push({ sql, params });
          return {
            async first() {
              if (sql.includes("FROM agentsam_model_catalog c")) {
                return { provider: "openai", api_model_id: "gpt-image-test" };
              }
              if (sql.includes("FROM media_assets WHERE id = ?")) {
                if (Number(params[0]) === 7) return source;
                return {
                  id: rowId, filename: "original-logo-ai-edit.png",
                  url: "/media/derivatives/ai-edit/7/proposed.png",
                  folder: "images", r2_key: params[0],
                };
              }
              return null;
            },
            async run() {
              if (failure) throw new Error("simulated database failure");
              return { meta: { last_row_id: rowId } };
            },
            async all() {
              return { results: [{ id: "gpt-image-test", name: "Studio image model" }] };
            },
          };
        },
        async all() {
          return { results: [{ id: "gpt-image-test", name: "Studio image model" }] };
        },
      };
    },
  };
  return {
    env: { DB, OPENAI_API_KEY: "mock-key", WEBSITE_ASSETS: {
      async get(key) {
        const bytes = writes.get(key);
        return bytes ? { size: bytes.length, arrayBuffer: async () =>
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } : null;
      },
      async put(key, bytes) { writes.set(key, bytes); },
      async delete(key) { writes.delete(key); },
    } },
    writes, statements,
  };
}

test("image editing uses the registered model and saves a new derivative, retaining source bytes", async () => {
  const { env, writes } = mediaEnv();
  const original = new Uint8Array(writes.get(source.r2_key));
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/images/edits");
      assert.equal(options.headers.authorization, "Bearer mock-key");
      assert.equal(options.body.get("model"), "gpt-image-test");
      assert.equal(options.body.get("prompt"), "Make the logo navy");
      assert.equal(options.body.get("image").size, png.length);
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] });
    };
    const out = await editImageWithPrompt(env, {
      media_asset_id: 7, prompt: "Make the logo navy", model_id: "gpt-image-test", actor_id: "owner",
    });
    assert.equal(out.ok, true);
    assert.equal(out.source_preserved, true);
    assert.equal(out.asset.meta.media_edit.source_media_asset_id, 7);
    assert.equal(out.asset.meta.media_edit.model_id, "gpt-image-test");
    assert.deepEqual(writes.get(source.r2_key), original);
    assert.equal(writes.size, 2);
  } finally { globalThis.fetch = oldFetch; }
});

test("failed derivative registration deletes only the new R2 object", async () => {
  const { env, writes } = mediaEnv({ failure: true });
  await assert.rejects(() => saveImageDerivative(env, source, png,
    { kind: "ai-edit", actorId: "owner" }), /derivative_registration_failed/);
  assert.equal(writes.size, 1);
  assert.ok(writes.has(source.r2_key));
});

test("unconfigured editing model never spends provider credits or modifies objects", async () => {
  const { env, writes } = mediaEnv();
  let calls = 0;
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { calls++; throw new Error("must not call"); };
    await assert.rejects(() => editImageWithPrompt(env, {
      media_asset_id: 7, prompt: "Revise", model_id: "not-in-catalog", actor_id: "owner",
    }), /image_edit_model_not_registered/);
    assert.equal(calls, 0);
    assert.equal(writes.size, 1);
    assert.equal((await listEditableImageModels({ DB: env.DB })).length, 0);
  } finally { globalThis.fetch = oldFetch; }
});


test("generation tool stores an unplaced candidate, with original media unaffected", async () => {
  const { env, writes } = mediaEnv();
  const oldFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, "https://api.openai.com/v1/images/generations");
      assert.equal(JSON.parse(init.body).model, "gpt-image-test");
      return Response.json({ data: [{ b64_json: Buffer.from(png).toString("base64") }] });
    };
    const output = await generateMediaArtwork(env, {
      prompt: "A precise vector-style badge",
      model_id: "gpt-image-test",
      actor_id: "owner",
    });
    assert.equal(output.ok, true);
    assert.equal(output.placed, false);
    assert.equal(output.asset.meta.generation.status, "candidate_unplaced");
    assert.equal(output.asset.meta.generation.model_id, "gpt-image-test");
    assert.ok(writes.has(source.r2_key));
    assert.equal(writes.size, 2);
  } finally { globalThis.fetch = oldFetch; }
});
