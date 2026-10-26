import test from "node:test";
import assert from "node:assert/strict";
import { studioDraftPrintReady } from "../backend/admin/product-studio.js";

const sides = {
  front: { original_media_asset_id: 1, prepared_media_asset_id: 10, showArtwork: true },
  back: { original_media_asset_id: 2, prepared_media_asset_id: 11, showArtwork: true },
};
test("A visible back logo is not enough to mark an entire shirt prepared", () => {
  assert.equal(studioDraftPrintReady(10, { ...sides, back: { ...sides.back, prepared_media_asset_id: null } }), false);
  assert.equal(studioDraftPrintReady(10, sides), true);
});
test("Hidden/unused sides do not block readiness", () => {
  assert.equal(studioDraftPrintReady(10, { front: sides.front, back: { ...sides.back, showArtwork: false } }), true);
  assert.equal(studioDraftPrintReady(null, sides), false);
  assert.equal(studioDraftPrintReady(10, {}), true); // legacy one-side drafts
});
