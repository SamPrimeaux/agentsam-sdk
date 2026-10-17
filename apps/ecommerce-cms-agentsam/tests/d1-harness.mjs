import { schema, stub } from "./cms-schema.mjs";
import { createD1Store, createGeneratedBlockRepository, createMemoryObjectStore } from "../backend/cms/generated-block-repository.mjs";

function canonical(id) {
  return {
    html: '<div data-agentsam-block="' + id + '" id="__UID__" class="__UID__"></div>',
    css: '[data-agentsam-block="' + id + '"] .__UID__ { padding: var(--__UID__-pad); }',
    js: '(function(){ if (!customElements.get("__UID__-card")) customElements.define("__UID__-card", class extends HTMLElement {}); })()',
  };
}

async function applySchema(sql) {
  for (const statement of (stub + "\n" + schema).split(";")) {
    const query = statement.trim();
    if (query) await sql.run(query);
  }
}

export default {
  async fetch(request, env) {
    const sql = createD1Store(env.DB);
    const objects = createMemoryObjectStore();
    const notes = [];
    try {
      await applySchema(sql);
      await sql.run("INSERT INTO accounts (id) VALUES ('acct-a')");
      await sql.run("INSERT INTO cms_pages (id, account_id, slug, title) VALUES ('page-a', 'acct-a', 'home', 'Home')");
      await sql.run("INSERT INTO cms_page_sections (id, account_id, page_id, section_key, section_type) VALUES ('section-a', 'acct-a', 'page-a', 'hero', 'hero')");
      const store = createGeneratedBlockRepository(sql, objects, { manifest: { cms: { blocks: { maxDepth: 2 } } } });
      const saved = await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "menu", blockKey: "menu", manifest: { canonical: canonical("menu"), cms: { blocks: { maxDepth: 2 } } }, settingsValues: { padding: 8 } });
      notes.push("save=" + saved.ok);
      const batch = await sql.batch([{ sql: "SELECT COUNT(*) AS n FROM cms_artifacts", params: [] }]);
      notes.push("batch=" + JSON.stringify(batch && batch[0] && (batch[0].results || batch[0])));
      objects.failNext = true;
      let objectFailed = false;
      try { await store.saveGenerated({ accountId: "acct-a", sectionId: "section-a", blockId: "other", blockKey: "other", manifest: { canonical: canonical("other") } }); }
      catch (error) { objectFailed = true; notes.push("objectError=" + error.message); }
      notes.push("objectFailed=" + objectFailed);
      return Response.json({ ok: true, notes, binding: "DB" });
    } catch (error) {
      return Response.json({ ok: false, error: error.message, notes }, { status: 500 });
    }
  },
};
