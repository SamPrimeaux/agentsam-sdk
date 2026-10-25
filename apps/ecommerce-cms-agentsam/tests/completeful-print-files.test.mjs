import test from "node:test";
import assert from "node:assert/strict";
import { preparedPrintFiles } from "../backend/admin/product-studio.js";

const front = "front-uuid";
const back = "back-uuid";
const draft = {
  placement: { sides: {
    [front]: { original_media_asset_id: 11, prepared_media_asset_id: 31, showArtwork: true },
    [back]: { original_media_asset_id: 12, prepared_media_asset_id: 32, showArtwork: true },
  } },
};
const selection = { locations: [{ print_location_id: front }, { print_location_id: back }] };
const assets = {
  31: { id: 31, content_type: "image/png", url: "/media/studio/prepared/front.png", r2_key: "studio/prepared/front.png" },
  32: { id: 32, content_type: "image/png", url: "/media/studio/prepared/back.png", r2_key: "studio/prepared/back.png" },
};
const env = { APP_DOMAIN: "independent-brand.example", DB: {
  prepare: () => ({ bind: (id) => ({ first: async () => assets[id] || null }) }),
} };

test("Completeful print_files map exact artwork to exact active front/back print locations", async () => {
  assert.deepEqual(await preparedPrintFiles(env, draft, selection), [
    { print_location_id: front, url: "https://independent-brand.example/media/studio/prepared/front.png" },
    { print_location_id: back, url: "https://independent-brand.example/media/studio/prepared/back.png" },
  ]);
});

test("Incomplete or wrong-format rear artwork cannot be silently submitted as front", async () => {
  for (const invalid of [null, 404]) {
    const modified = { placement: { sides: { ...draft.placement.sides,
      [back]: { ...draft.placement.sides[back], prepared_media_asset_id: invalid } } } };
    await assert.rejects(preparedPrintFiles(env, modified, selection), /Prepare a verified PNG/);
  }
  await assert.rejects(preparedPrintFiles(env, draft, { locations: [{ print_location_id: front }] }),
    /Selected print locations changed/);
});

test("Single print location leaves the established one-sided provider design path unchanged", async () => {
  const onlyFront = { placement: { sides: { [front]: draft.placement.sides[front] } } };
  assert.equal(await preparedPrintFiles(env, onlyFront, selection), null);
});
