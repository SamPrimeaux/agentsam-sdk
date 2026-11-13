import assert from "node:assert/strict";
import test from "node:test";
import { createSiteOwnedFixture } from "./fixtures/site-owned-cms.mjs";
import { readCanonicalComposition } from "../backend/cms/canonical-composition.mjs";
import { handleAdminCmsApi } from "../backend/cms/api.js";

test("composition reads site-owned R2 draft and canonical blocks without legacy page columns", async () => {
  const { db, env, objects } = createSiteOwnedFixture();
  try {
    db.exec(`
      CREATE TABLE cms_section_blocks(
        id TEXT PRIMARY KEY, account_id TEXT NOT NULL, section_id TEXT NOT NULL,
        parent_block_id TEXT, block_key TEXT NOT NULL, block_type TEXT NOT NULL,
        sort_order INTEGER NOT NULL, status TEXT NOT NULL, content_json TEXT NOT NULL
      );
      INSERT INTO cms_section_blocks VALUES
        ('cta','merchant','hero',NULL,'hero-cta','button',0,'active','{"label":"Shop"}');
    `);
    const composition = await readCanonicalComposition(env, "merchant", "home", "main");
    assert.equal(composition.authority, "cms_d1_installed");
    assert.equal(composition.page.siteId, "main");
    assert.equal(composition.page.templateKey, null);
    assert.equal(composition.sections.length, 1);
    assert.equal(composition.sections[0].type, "hero");
    assert.equal(composition.sections[0].settings.headline, "Existing R2 headline");
    assert.equal(composition.sections[0].contentObjectKey, "cms/sections/drafts/home/hero.json");
    assert.equal(composition.sections[0].blocks[0].settings.label, "Shop");

    const url = "https://cms.test/api/admin/cms/composition?site_id=main&slug=home";
    const response = await handleAdminCmsApi(new Request(url), env, new URL(url), { accountId: "merchant" });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).composition.sections[0].settings.headline, "Existing R2 headline");

    // A second site's identical slug must not silently select the first site.
    await assert.rejects(
      readCanonicalComposition(env, "merchant", "home", "foreign"),
    );

    // Draft content is private and independently versioned from the published object.
    objects.set("cms/sections/drafts/home/hero.json", JSON.stringify({ headline: "Edited draft" }));
    assert.equal((await readCanonicalComposition(env, "merchant", "home", "main")).sections[0].settings.headline, "Edited draft");
    assert.equal(JSON.parse(objects.get("cms/sections/publications/home/hero.json")).headline, "Published headline");
  } finally {
    db.close();
  }
});
