import test from "node:test";
import assert from "node:assert/strict";
import { renderMerchCollectionShowcase } from "../src/collection-showcase.js";
test("packaged showcase uses only safe supplied host routes and actual media", () => {
  const html=renderMerchCollectionShowcase({
    title:"<script>unsafe</script>",links:{productBase:"/products",shop:"/shop"},
    products:[{title:"Tee",slug:"tee",primary_image:"/media/front.webp",price_cents:3000}],
  });
  assert.match(html,/products\/tee/);
  assert.match(html,/media\/front.webp/);
  assert.doesNotMatch(html,/<script>|javascript:/);
});
