import test from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT_SOURCE_KINDS,
  resolveProductSource,
  groupProductInventory,
  validateInventoryAdjustment,
} from "../src/product-spine.js";

test("merchant products remain the identity when no provider link exists", () => {
  const source = resolveProductSource({ id: "12" });
  assert.deepEqual(PRODUCT_SOURCE_KINDS, ["merchant_managed", "connected_provider"]);
  assert.equal(source.product_id, 12);
  assert.equal(source.kind, "merchant_managed");
  assert.equal(source.provider, null);
  assert.equal(source.manages_inventory, true);
  assert.equal(Object.isFrozen(source), true);
});

test("legacy Completeful links normalize to the provider-neutral product source", () => {
  const source = resolveProductSource({ id: 13 }, {
    completeful_catalog_product_id: "catalog-1",
    completeful_store_product_id: "store-1",
    sync_status: "synced",
  });
  assert.equal(source.kind, "connected_provider");
  assert.equal(source.provider, "completeful");
  assert.equal(source.catalog_id, "catalog-1");
  assert.equal(source.external_id, "store-1");
  assert.equal(source.sync_status, "synced");
});

test("provider inventory is grouped by merchant product and duplicate variants are ignored", () => {
  const groups = groupProductInventory([
    { id: 2, product_id: 7, product_title: "Crewneck", status: "draft", sku: "XL-BLACK", size: "XL", color: "Black", inventory_qty: 2, variant_price_cents: 1550 },
    { id: 1, product_id: 7, product_title: "Crewneck", status: "draft", sku: "S-WHITE", size: "S", color: "White", inventory_qty: 8, variant_price_cents: 1550 },
    { id: 1, product_id: 7, product_title: "Crewneck", status: "draft", sku: "DUPLICATE", size: "S", color: "White", inventory_qty: 99, variant_price_cents: 1550 },
    { id: 3, product_id: 8, product_title: "Cap", status: "active", sku: "ONE", size: "One Size", color: "Navy", inventory_qty: 0 },
  ], [{ product_id: 7, completeful_store_product_id: "store-7" }]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, "Cap"); // low-stock groups sort first
  const crewneck = groups.find((group) => group.id === 7);
  assert.equal(crewneck.source.kind, "connected_provider");
  assert.equal(crewneck.variants.length, 2);
  assert.equal(crewneck.total_available, 10);
  assert.equal(crewneck.low_stock_count, 1);
  assert.deepEqual(crewneck.variants.map((variant) => variant.size), ["S", "XL"]);
});

test("inventory adjustments validate non-negative integer quantities and optimistic expectations", () => {
  assert.deepEqual(validateInventoryAdjustment("4", "3"), { quantity: 4, expected: 3 });
  assert.throws(() => validateInventoryAdjustment(-1), RangeError);
  assert.throws(() => validateInventoryAdjustment(1.5), RangeError);
  assert.throws(() => validateInventoryAdjustment(2, -1), RangeError);
});
