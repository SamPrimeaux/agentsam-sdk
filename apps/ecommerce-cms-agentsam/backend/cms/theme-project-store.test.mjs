import test from "node:test";
import assert from "node:assert/strict";
import { themeProjectGlobalKey, validateThemeProjectPayload } from "./theme-project-store.mjs";

function project(overrides = {}) {
  return {
    schema: "agentsam.theme-project.v1",
    id: "theme_resolve",
    name: "Resolve",
    revision: 0,
    pages: [{
      slug: "home",
      title: "Home",
      template: "<!doctype html><html><body><!--theme-section:section_1--></body></html>",
      sections: [{
        key: "section_1",
        name: "Hero",
        html: "<section data-theme-project-field=\"field_1\">Hero</section>",
        content: { field_1: "Hero", __editor: { templateKey: "section_1", visibility: { enabled: true }, blocks: [] } },
        schema: { key: "section_1", fields: [{ key: "field_1", label: "Headline", type: "text" }], settings: [], blocks: [] },
      }],
    }],
    ...overrides,
  };
}

test("theme project globals are keyed by a validated stable project ID", () => {
  assert.equal(themeProjectGlobalKey("theme_resolve"), "theme-project:theme_resolve");
  assert.throws(() => themeProjectGlobalKey("../other-account"), /theme_project_id_invalid/);
});

test("CMS theme project payload validation retains the editable page contract", () => {
  const validated = validateThemeProjectPayload(project());
  assert.equal(validated.id, "theme_resolve");
  assert.equal(validated.pages[0].sections[0].schema.fields[0].key, "field_1");
});

test("CMS theme projects accept a repaired 404 page without loosening arbitrary slug validation", () => {
  const base = project();
  const missingPage = structuredClone(base.pages[0]);
  missingPage.slug = "404";
  missingPage.title = "Page not found";
  const saved = validateThemeProjectPayload(project({ pages: [...base.pages, missingPage] }));
  assert.equal(saved.pages[1].slug, "404");
  for (const unsafeSlug of ["12", "404-evil", "../404", "_private"]) {
    const bad = structuredClone(missingPage);
    bad.slug = unsafeSlug;
    assert.throws(() => validateThemeProjectPayload(project({ pages: [bad] })), /theme_project_page_invalid/);
  }
});

test("CMS theme project payload validation rejects oversized or unsafe projects", () => {
  assert.throws(() => validateThemeProjectPayload(project({ id: "__proto__" })));
  const oversized = project();
  oversized.pages[0].template = "x".repeat(8 * 1024 * 1024 + 32);
  assert.throws(() => validateThemeProjectPayload(oversized), /theme_project_too_large/);
});


test("CMS theme project rejects unsafe or ambiguous workspace file paths at the API boundary", () => {
  for (const path of ["../outside.html", "/absolute.html", "pages\\home\\index.html", "assets//logo.svg", "settings/tokens.json"]) {
    assert.throws(() => validateThemeProjectPayload(project({ files: [{ path, content: "x" }] })), /theme_project_file_invalid/);
  }
  assert.throws(() => validateThemeProjectPayload(project({ files: [{ path: "assets/a.svg", content: "x" }, { path: "assets/a.svg", content: "y" }] })), /theme_project_file_invalid/);
  assert.throws(() => validateThemeProjectPayload(project({ files: [{ path: "assets/a.svg", content: 1 }] })), /theme_project_file_invalid/);
  assert.throws(() => validateThemeProjectPayload(project({ directories: ["../outside"] })), /theme_project_directory_invalid/);
  const valid = validateThemeProjectPayload(project({ files: [{ path: "assets/brand mark.svg", content: "<svg/>" }], directories: ["assets/icons"] }));
  assert.equal(valid.files[0].path, "assets/brand mark.svg");
});


test('account theme lifecycle needs no website: create, edit, reopen, history, duplicate, archive',async()=>{
  const {createCmsTestDb}=await import('../../tests/cms-test-db.mjs');
  const {createThemeProject,getThemeProject,saveThemeProject,listThemeProjects,listThemeProjectHistory,getThemeProjectSnapshot,duplicateAccountThemeProject,archiveAccountThemeProject}=await import('./theme-project-store.mjs');
  const db=createCmsTestDb();
  try {
    db.exec("INSERT INTO accounts(id) VALUES('author'),('other')");
    const objects=new Map();
    const env={DB:{prepare(sql){let args=[];const stmt={bind(...values){args=values;return stmt},async all(){return {results:db.prepare(sql).all(...args)}},async first(){return db.prepare(sql).get(...args)||null},async run(){return {meta:{changes:db.prepare(sql).run(...args).changes}}}};return stmt}},WEBSITE_ASSETS:{async put(k,v){objects.set(k,v)},async get(k){return objects.has(k)?{text:async()=>objects.get(k)}:null}}};
    const created=await createThemeProject(env,'author',project());assert.equal(created.ok,true,JSON.stringify(created));
    const id=created.project.id;assert.equal(created.scope,'account');
    assert.equal((await getThemeProject(env,'other',id)).status,404);
    const modified={...created.project,name:'Edited independent theme'};
    const saved=await saveThemeProject(env,'author',id,modified,1);assert.equal(saved.ok,true,JSON.stringify(saved));
    assert.equal((await saveThemeProject(env,'author',id,modified,1)).status,409);
    assert.equal((await getThemeProject(env,'author',id)).project.name,modified.name);
    assert.equal((await listThemeProjectHistory(env,'author',id)).revisions.length,2);
    assert.equal((await getThemeProjectSnapshot(env,'author',id,1)).project.name,'Resolve');
    const copy=await duplicateAccountThemeProject(env,'author',id);assert.equal(copy.ok,true,JSON.stringify(copy));assert.notEqual(copy.project.id,id);
    assert.equal((await listThemeProjects(env,'author')).projects.length,2);
    assert.equal((await archiveAccountThemeProject(env,'author',id,1)).status,409);
    assert.equal((await archiveAccountThemeProject(env,'author',id,2)).archived,true);
    assert.equal((await getThemeProject(env,'author',id)).status,404);
    assert.equal((await listThemeProjects(env,'author')).projects.length,1);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_sites').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_site_themes').get().n,0);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cms_globals').get().n,0);
  }finally{db.close();}
});
