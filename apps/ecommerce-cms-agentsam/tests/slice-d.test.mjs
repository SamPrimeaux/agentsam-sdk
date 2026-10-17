import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { followUp, selectorsStable, undoLast } from "../frontend/static/js/block-followup.mjs";
import { createGeneratedBlockRepository, createMemoryObjectStore, createSqlStore } from "../backend/cms/generated-block-repository.mjs";
import { generateWithProvider, resolveProvider } from "../backend/admin/provider.mjs";
import { renderAssistantHeader, presentAgentsamProposal } from "../frontend/static/js/side-assistant.mjs";

const stub = readFileSync(new URL("../db/schema/accounts.stub.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../db/schema/cms.sql", import.meta.url), "utf8");
function canonical(id) {
  return {
    html: '<div data-agentsam-block="' + id + '" id="__UID__" class="__UID__"></div>',
    css: '[data-agentsam-block="' + id + '"] .__UID__ { padding: var(--__UID__-pad); }',
    js: '(function(){ if (!customElements.get("__UID__-card")) customElements.define("__UID__-card", class extends HTMLElement {}); })()',
  };
}
function openStore() {
  const db = new DatabaseSync(":memory:");
  db.exec(stub + "\n" + schema);
  db.prepare("INSERT INTO accounts (id) VALUES ('acct-a')").run();
  db.prepare("INSERT INTO cms_pages (id, account_id, slug, title) VALUES ('page-a', 'acct-a', 'home', 'Home')").run();
  db.prepare("INSERT INTO cms_page_sections (id, account_id, page_id, section_key, section_type) VALUES ('section-a', 'acct-a', 'page-a', 'hero', 'hero')").run();
  const objects = createMemoryObjectStore();
  return { db, objects, store: createGeneratedBlockRepository(createSqlStore(db), objects) };
}

test("follow-up leaves selectors stable and undo restores the prior revision", async () => {
  const { store, objects } = openStore();
  const saved = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 8 } });
  const result = await followUp(store, {
    accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu",
    canonical: canonical("menu"), objects,
    edits: [{ section: "css", search: "padding:", replace: "margin:" }],
    settingsValues: { padding: 8 },
  });
  assert.equal(result.ok, true);
  assert.equal(selectorsStable(canonical("menu"), result.canonical), true);
  await undoLast(store, "acct-a", "menu");
  const row = await store.loadBlock("acct-a", "menu");
  assert.equal(row.artifact_id, saved.artifactId);
});

test("a follow-up on the clone leaves the original unchanged", async () => {
  const { store } = openStore();
  const original = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu") }, settingsValues: { padding: 8 } });
  await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu-copy", blockKey: "menu-copy", manifest: { canonical: canonical("menu-copy") }, settingsValues: { padding: 8 } });
  await followUp(store, { accountId: "acct-a", sectionId: "section-a", blockId: "menu-copy", blockKey: "menu-copy", canonical: canonical("menu-copy"), edits: [{ section: "css", search: "padding:", replace: "margin:" }] });
  const row = await store.loadBlock("acct-a", "menu");
  assert.equal(row.artifact_id, original.artifactId);
});

test("stub provider receives the abort mid-fetch", async () => {
  const controller = new AbortController();
  const original = globalThis.fetch;
  let seen;
  globalThis.fetch = async (_url, init) => {
    seen = init.signal;
    return new Response("ok");
  };
  const pending = generateWithProvider({ providers: [{ name: "stub", model: "stub-model", endpoint: "https://provider.invalid/generate", capabilities: ["code.generate"] }] }, { prompt: "center" }, controller.signal);
  controller.abort();
  await pending;
  globalThis.fetch = original;
  assert.equal(seen.aborted, true);
});

test("assistant proposals are cards and the composer registers once", () => {
  const header = renderAssistantHeader({ selection: "Hero", expanded: false });
  assert.equal(header.placeholder.includes("Ask anything"), false);
  assert.equal(presentAgentsamProposal({ title: "Center the menu" }).kind, "action-card");
  const source = readFileSync(new URL("../frontend/static/js/agentsam-composer.js", import.meta.url), "utf8");
  assert.equal(source.split("customElements.define").length - 1, 1);
  assert.equal(source.includes("customElements.get"), true);
  const dock = readFileSync(new URL("../../../packages/admin-dock/src/index.js", import.meta.url), "utf8");
  assert.equal(dock.includes('contains("admin-dock-off")'), true);
});


test("provider resolver separates code generation from code editing", async () => {
  const manifest = {
    providers: [
      { name: "generator", endpoint: "https://gen.invalid", capabilities: ["code.generate"] },
      { name: "editor", endpoint: "https://edit.invalid", capabilities: ["code.edit"] },
    ],
  };
  assert.equal(resolveProvider(manifest, "code.generate").provider, "generator");
  assert.equal(resolveProvider(manifest, "code.edit").provider, "editor");
});


test("app manifest routes generated code by canonical capabilities without a hardcoded model", () => {
  const manifest = JSON.parse(readFileSync(new URL("../agentsam.app.json", import.meta.url), "utf8"));
  const provider = manifest.providers?.[0];
  assert.ok(provider);
  assert.deepEqual(provider.capabilities, ["code.generate", "code.edit"]);
  assert.equal(Object.hasOwn(provider, "model"), false);
  assert.equal(JSON.stringify(manifest).includes("structured.generate"), false);
});
