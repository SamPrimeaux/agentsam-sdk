import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createGeneratedBlockRepository, createMemoryObjectStore, createSqlStore, ensureBlockTree } from "../backend/cms/generated-block-repository.mjs";

const stub = readFileSync(new URL("../db/schema/accounts.stub.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../db/schema/cms.sql", import.meta.url), "utf8");

function openDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(stub + "\n" + schema);
  db.prepare("INSERT INTO accounts (id) VALUES ('acct-a'), ('acct-b')").run();
  db.prepare("INSERT INTO cms_pages (id, account_id, slug, title) VALUES ('page-a', 'acct-a', 'home', 'Home')").run();
  db.prepare("INSERT INTO cms_page_sections (id, account_id, page_id, section_key, section_type) VALUES ('section-a', 'acct-a', 'page-a', 'hero', 'hero')").run();
  return db;
}

function canonical(id) {
  return {
    html: '<div data-agentsam-block="' + id + '" id="__UID__" class="__UID__"></div>',
    css: '[data-agentsam-block="' + id + '"] .__UID__ { padding: var(--__UID__-pad); }',
    js: '(function(){ if (!customElements.get("__UID__-card")) customElements.define("__UID__-card", class extends HTMLElement {}); })()',
  };
}

function repo(db, objects = createMemoryObjectStore()) {
  return { objects, store: createGeneratedBlockRepository(createSqlStore(db), objects, { maxDepth: 2 }) };
}

test("clone shares the artifact and an edit leaves the original unchanged", async () => {
  const db = openDb();
  const { store } = repo(db);
  const first = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 8 } });
  const clone = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu-copy", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 8 } });
  assert.equal(first.artifactId, clone.artifactId);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_artifacts").get().n, 1);
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu-copy", blockKey: "menu-copy", manifest: { canonical: canonical("menu-copy") }, settingsValues: { padding: 20 } });
  const original = await store.loadBlock("acct-a", "menu");
  assert.equal(original.artifact_id, first.artifactId);
  assert.equal(JSON.parse(original.content_json).padding, 8);
});

test("object failure writes no rows and a batch failure leaves an orphan object", async () => {
  const db = openDb();
  const objects = createMemoryObjectStore();
  objects.failNext = true;
  const store = createGeneratedBlockRepository(createSqlStore(db), objects);
  await assert.rejects(store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") } }));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_section_blocks").get().n, 0);
  const sql = createSqlStore(db);
  const batch = sql.batch.bind(sql);
  sql.batch = async () => { throw new Error("d1 failed"); };
  const failing = createGeneratedBlockRepository(sql, objects);
  const result = await failing.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") } });
  assert.equal(result.ok, false);
  assert.equal(objects.objects.has(result.orphan), true);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_section_blocks").get().n, 0);
  batch;
});

test("restoreRevision returns the prior code and settings", async () => {
  const db = openDb();
  const { store } = repo(db);
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 8 } });
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 20 } });
  const restored = await store.restoreRevision("acct-a", "menu", 1);
  const row = await store.loadBlock("acct-a", "menu");
  assert.equal(JSON.parse(row.content_json).padding, 8);
  assert.equal(restored.snapshot.settings.padding, 8);
});

test("revision numbers advance per block instead of globally across unrelated blocks", async () => {
  const db = openDb();
  const { store } = repo(db);
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "one", blockKey: "one", manifest: { canonical: canonical("one") } });
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "two", blockKey: "two", manifest: { canonical: canonical("two") } });
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "one", blockKey: "one", manifest: { canonical: canonical("one") }, settingsValues: { padding: 12 } });
  const rows = db.prepare("SELECT entity_id, revision_number FROM cms_revisions ORDER BY entity_id, revision_number").all().map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    { entity_id: "one", revision_number: 1 },
    { entity_id: "one", revision_number: 2 },
    { entity_id: "two", revision_number: 1 },
  ]);
});

test("tree round-trips, cycles and depth are refused, delete cascades", async () => {
  const db = openDb();
  const { store } = repo(db);
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "parent", blockKey: "parent", manifest: { canonical: canonical("parent") } });
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "child", blockKey: "child", parentBlockId: "parent", index: 1, manifest: { canonical: canonical("child") } });
  const tree = await store.loadBlockTree("acct-a", "section-a");
  assert.equal(tree.find((row) => row.block_key === "child").parent_block_id, "parent");
  const cycle = await store.moveBlock("acct-a", "parent", "child", 0);
  assert.equal(cycle.ok, false);
  const deep = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "grand", blockKey: "grand", parentBlockId: "child", manifest: { canonical: canonical("grand") } });
  assert.equal(deep.ok, false);
  db.prepare("DELETE FROM cms_section_blocks WHERE id = 'parent'").run();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM cms_section_blocks WHERE id = 'child'").get().n, 0);
});

test("section snapshot restores the tree and cross-account calls are refused", async () => {
  const db = openDb();
  const { store } = repo(db);
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 8 } });
  await store.saveSectionDraft("acct-a", "section-a");
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 30 } });
  await store.restoreSectionSnapshot("acct-a", "section-a", 1);
  const row = await store.loadBlock("acct-a", "menu");
  assert.equal(JSON.parse(row.content_json).padding, 8);
  let refused; try { refused = await store.saveGenerated({ accountId: "acct-b", sectionId: "section-a", blockId: "x", blockKey: "x", manifest: { canonical: canonical("x") } }); } catch (error) { refused = { ok: false, status: 403 }; }
  assert.equal(refused.ok, false);
});

test("release build contains no token and re-lint rejects a violated block", async () => {
  const db = openDb();
  const { store, objects } = repo(db);
  const saved = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") } });
  const built = await store.releaseBuild("acct-a", "section-a");
  assert.equal(JSON.stringify(built.output).includes("__UID__"), false);
  objects.objects.set(saved.key, JSON.stringify({ html: "<div></div>", css: "header {}", js: "eval(1)" }));
  const rejected = await store.releaseBuild("acct-a", "section-a");
  assert.equal(rejected.ok, false);
});

test("migration skips when the tree columns already exist", async () => {
  const db = openDb();
  const first = await ensureBlockTree(createSqlStore(db));
  assert.equal(first.skipped, true);
});


test("app-local CMS schema is an exact mirror of the canonical root schema", () => {
  const root = readFileSync(new URL("../../../db/schema/cms.sql", import.meta.url), "utf8");
  assert.equal(schema, root);
});

test("generated artifacts use the canonical manifest pointer contract", async () => {
  const db = openDb();
  const { store } = repo(db);
  const saved = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") } });
  assert.equal(saved.ok, true);
  const artifact = { ...db.prepare("SELECT artifact_type, content_mode, r2_prefix, manifest_r2_key, source_kind FROM cms_artifacts WHERE id = ?").get(saved.artifactId) };
  assert.deepEqual(artifact, {
    artifact_type: "embed",
    content_mode: "component",
    r2_prefix: "cms/artifacts/block/" + saved.artifactId.replace(/^cmsa_/, "") + "/",
    manifest_r2_key: saved.key,
    source_kind: "generator",
  });
});


test("artifact-backed generated blocks persist their semantic type instead of custom", async () => {
  const db = openDb();
  const { store } = repo(db);
  const saved = await store.saveGenerated({
    accountId: "acct-a",
    sectionId: "section-a",
    blockId: "proof",
    blockKey: "proof",
    manifest: {
      definition: { kind: "block", type: "testimonial-carousel", label: "Testimonial carousel" },
      canonical: canonical("proof"),
    },
  });
  assert.equal(saved.ok, true);
  const row = db.prepare("SELECT block_type, metadata_json FROM cms_section_blocks WHERE id = ?").get("proof");
  assert.equal(row.block_type, "testimonial-carousel");
  const metadata = JSON.parse(row.metadata_json);
  assert.equal(metadata.generated, true);
  assert.equal(metadata.definition.type, "testimonial-carousel");
});
