import test from "node:test";
import assert from "node:assert/strict";
import { CORE_EXECUTABLE_TOOL_KEYS } from "../backend/agentsam/core-tools.js";
import { inspectRegistry, listToolDescriptors, resolveTool, providerToolDescriptors } from "../backend/tools/registry.ts";
import { operatorOnlyLegacyKeys } from "../backend/tools/packs/operator.ts";

test("neutral operations keep their original capabilities and resolve legacy aliases", () => {
  const expected = [
    ["fnf_store_orders_list", "commerce.orders.list", "commerce.orders.read"],
    ["fnf_store_products_list", "commerce.products.list", "commerce.products.read"],
    ["fnf_cms_pages_list", "cms.pages.list", "cms.pages.read"],
    ["fnf_media_library_list", "media.library.list", "media.library.read"],
    ["fnf_agentsam_ai_models", "agent.models.list", "agentsam.models.read"],
    ["fnf_semantic_search", "search.semantic", "retrieval.semantic.search"],
  ];
  for (const [alias, id, capability] of expected) {
    assert.equal(resolveTool(alias)?.id, id);
    assert.equal(resolveTool(id)?.capabilityKey, capability);
    assert.equal(resolveTool(resolveTool(id).wireName)?.id, id);
  }
});
test("merchant provider descriptors use exact explicit wire names and exclude operator pack", () => {
  const names = providerToolDescriptors().map((tool) => tool.name);
  assert.ok(names.every(name => /^[a-zA-Z0-9_-]+$/.test(name)));
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.includes("commerce_orders_list"));
  assert.ok(!names.includes("storage_objects_list"));
  for (const name of operatorOnlyLegacyKeys) assert.equal(resolveTool(name), null);
  assert.equal(resolveTool("fnf_r2_media_list"), null);
  assert.equal(resolveTool("fnf_r2_media_list", "operator")?.access, "operator");
});
test("doctor discovers real legacy handlers, rejects missing handlers and collisions", () => {
  assert.deepEqual(inspectRegistry(CORE_EXECUTABLE_TOOL_KEYS), []);
  assert.ok(inspectRegistry(new Set()).some(error => error.includes("unresolved legacy handler")));
  assert.equal(listToolDescriptors().length, 13);
});
