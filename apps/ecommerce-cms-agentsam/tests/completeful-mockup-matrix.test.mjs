import test from "node:test";
import assert from "node:assert/strict";
import { planCompletefulMockupMatrix, renderCompletefulMockupMatrix } from "../backend/completeful/mockup-renderer.js";

const draft = {
  id: "draft-1", version: 5, product_id: 12,
  completeful_catalog_product_id: "product-123", prepared_media_asset_id: 42,
  selected_variant_ids_json: JSON.stringify(["black-s", "black-m", "moss-s"]),
  print_locations_json: JSON.stringify(["front", "back"]),
};
const variants = [
  { completeful_variant_id: "black-s", variant_attributes_json: '{"Color":"Black","Size":"S"}' },
  { completeful_variant_id: "black-m", variant_attributes_json: '{"Color":"Black","Size":"M"}' },
  { completeful_variant_id: "moss-s", variant_attributes_json: '{"Color":"Moss","Size":"S"}' },
];
const locations = [{ print_location_id: "front" }, { print_location_id: "back" }];
function mockup(color, place) {
  return { mockup_id: "mk-" + color + "-" + place, print_location_id: place,
    variant_scope_json: JSON.stringify({ Color: color }) };
}
function fixture({ omit = null } = {}) {
  const mockups = ["Black", "Moss"].flatMap(color => ["front", "back"].map(place => mockup(color, place)))
    .filter(m => m.mockup_id !== omit);
  return { DB: {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async first() {
              if (sql.includes("FROM product_studio_drafts")) return draft;
              if (sql.includes("FROM media_assets")) return { id: 42, r2_key: "studio/prepared.png", url: "/media/studio/prepared.png" };
              return null;
            },
            async all() {
              if (sql.includes("FROM completeful_catalog_variants")) return { results: variants };
              if (sql.includes("FROM completeful_catalog_print_locations")) return { results: locations };
              if (sql.includes("FROM completeful_catalog_mockups")) return { results: mockups };
              return { results: [] };
            },
          };
        },
      };
    },
  } };
}
test("renders exact 2-color by 2-side grid without size duplicates", async () => {
  const output = await planCompletefulMockupMatrix(fixture(), { draft_id: draft.id });
  assert.equal(output.ok, true);
  assert.equal(output.matrix.length, 4);
  assert.deepEqual(output.matrix.map(({ variant_color, print_location_id }) =>
    variant_color + ":" + print_location_id).sort(),
    ["Black:back", "Black:front", "Moss:back", "Moss:front"]);
  assert.deepEqual(output.matrix.find(m => m.variant_color === "Black").variant_ids, ["black-s","black-m"]);
});

test("never substitutes an unrelated supplier image for a missing color and side", async () => {
  const output = await planCompletefulMockupMatrix(fixture({ omit: "mk-Moss-back" }), { draft_id: draft.id });
  assert.equal(output.matrix.length, 3);
  assert.ok(output.skipped.some(m => m.variant_color === "Moss"
    && m.print_location_id === "back" && m.reason === "exact_provider_mockup_missing"));
});

test("color filters and invalid supplier state fail before provider dispatch", async () => {
  const filtered = await planCompletefulMockupMatrix(fixture(), { draft_id: draft.id, colors: ["Black"] });
  assert.equal(filtered.matrix.length, 2);
  await assert.rejects(() => planCompletefulMockupMatrix(fixture(), {
    draft_id: draft.id, print_location_ids: "all",
  }), /invalid_mockup_filter/);
  const empty = await renderCompletefulMockupMatrix(fixture(), {
    draft_id: draft.id, colors: ["not-a-supplier-color"],
  });
  assert.equal(empty.error, "no_exact_supplier_mockup_targets");
  assert.deepEqual(empty.rendered, []);
});
