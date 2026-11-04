import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { PRODUCT_SKU_KINDS, productCatalogSku } from "./catalog-sku.mjs";

test("all supported platform product kinds have unique, stable prefixes", () => {
  const codes = Object.values(PRODUCT_SKU_KINDS);
  assert.equal(new Set(codes).size, codes.length);
  for (const [kind, code] of Object.entries(PRODUCT_SKU_KINDS)) {
    assert.equal(productCatalogSku(kind, "sample-unit"), "IA-" + code + "-SAMPLE-UNIT");
  }
});

test("the flagship merchant app and the legacy alias remain distinguishable", () => {
  assert.equal(productCatalogSku("app", "ecommerce-cms-agentsam"), "IA-APP-ECOMMERCE-CMS-AGENTSAM");
  assert.equal(productCatalogSku("app", "agentsam-ecommerce-cms"), "IA-APP-AGENTSAM-ECOMMERCE-CMS");
  assert.equal(productCatalogSku("sdk-package", "agentsam-sdk"), "IA-SDK-AGENTSAM-SDK");
  assert.equal(productCatalogSku("app", "cad-creator"), "IA-APP-CAD-CREATOR");
  assert.equal(productCatalogSku("theme", "iasf"), "IA-THM-IASF");
  assert.equal(productCatalogSku("service", "name_with_underscores"), "IA-SVC-NAME-WITH-UNDERSCORES");
});

test("rejects unrecognized kinds and invalid product slugs", () => {
  assert.throws(() => productCatalogSku("merchandise", "tee"), /Unsupported/);
  assert.throws(() => productCatalogSku("app", "broken/scope"), /Invalid/);
  assert.throws(() => productCatalogSku("app", ""), /Invalid/);
});

test("backfill is repeatable, preserves preexisting SKUs and matches the generator", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE agentsam_products (id TEXT PRIMARY KEY, slug TEXT UNIQUE, kind TEXT, sku TEXT UNIQUE, name TEXT);");
    const add = db.prepare("INSERT INTO agentsam_products(id,slug,kind,sku,name) VALUES(?,?,?,?,?)");
    add.run("prod1", "ecommerce-cms-agentsam", "app", null, "Commerce");
    add.run("prod2", "agentsam-sdk", "sdk-package", null, "SDK");
    add.run("prod3", "existing-legacy", "theme", "LEGACY-THM-001", "Legacy");
    const script = readFileSync(new URL("./backfill-catalog-skus.sql", import.meta.url), "utf8");
    db.exec(script);
    db.exec(script);
    const rows = db.prepare("SELECT * FROM agentsam_products ORDER BY id").all();
    assert.equal(rows.length, 3);
    assert.equal(rows[0].sku, productCatalogSku("app", "ecommerce-cms-agentsam"));
    assert.equal(rows[1].sku, productCatalogSku("sdk-package", "agentsam-sdk"));
    assert.equal(rows[2].sku, "LEGACY-THM-001");
    assert.equal(rows[0].name, "Commerce");
  } finally { db.close(); }
});
