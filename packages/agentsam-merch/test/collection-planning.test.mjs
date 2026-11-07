import test from "node:test";
import assert from "node:assert/strict";
import {
  assortmentSearchTerms, normalizeCollectionRules, resolveCollectionMembers,
} from "../src/collection-planning.js";
import { renderMerchHero, normalizeMerchHero } from "../src/merch-hero.js";
test("portable collection recipes and rules work without the ecommerce host",()=>{
  assert.ok(assortmentSearchTerms("tees").includes("Comfort Colors 1717"));
  const rows=[{id:1,title:"Premium Tee"},{id:2,title:"Hat"}];
  const rule=normalizeCollectionRules({mode:"automatic",conditions:[{field:"title",operator:"contains",value:"tee"}]});
  assert.deepEqual(resolveCollectionMembers(rows,[],rule),[1]);
});
test("hero renderer escapes HTML and invalid URLs",()=>{
  const hero=normalizeMerchHero({headline:"<img src=x>",primaryCta:{label:"Buy",href:"javascript:alert(1)"}});
  assert.equal(hero.primaryCta.href,"");
  assert.doesNotMatch(renderMerchHero(hero),/<img src=x>/);
});
