import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {readFileSync} from "node:fs";
import "../packages/theme-contract/runtime/platform-stock-sections.js";
import "../packages/theme-contract/runtime/portable-sections.js";
import {createThemeProjectAdapter} from "../frontend/theme-editor/project.mjs";
import {blankThemeProject} from "../frontend/theme-editor/starter-project.mjs";

const require=createRequire(import.meta.url);
const {JSDOM}=require("jsdom");
const stock=globalThis.ThemePlatformStock;
const portable=globalThis.ThemePortableSections;
const catalog=JSON.parse(readFileSync(new URL("../../design-canvas/public/sources/stock/catalog.json",import.meta.url),"utf8"));

async function withDom(run){
  const dom=new JSDOM("<!doctype html><html><body></body></html>");
  const previous=globalThis.DOMParser;
  globalThis.DOMParser=dom.window.DOMParser;
  try{return await run(dom.window);}finally{globalThis.DOMParser=previous;dom.window.close();}
}
function memoryStore(project){
  let current=structuredClone(project);
  return {
    get:async()=>structuredClone(current),
    async save(next,{expectedVersion}){
      assert.equal(expectedVersion,Number(current.revision||0));
      assert.equal(next.sectionTemplates,undefined,"native stock definitions are derived, not persisted");
      current=structuredClone(next);
      return structuredClone(current);
    },
    current:()=>structuredClone(current),
  };
}

test("all 13 owner-supplied stock sources have an actual renderer, controls and a CMS draft contract",()=>{
  const expected=new Set(catalog.items.map(item=>item.id));
  const entries=stock.catalog();
  assert.equal(entries.length,15);
  for(const entry of entries){
    assert.ok(expected.has(entry.stockAssetId),entry.id);
    assert.ok(portable.get(entry.id));
    const content=portable.defaults(entry.id);
    assert.equal(portable.validate(entry.id,content).ok,true,entry.id);
    const html=portable.render({key:"test",content});
    assert.match(html,/data-cms-section="test"/);
    assert.match(html,/data-theme-project-field="title"/);
    assert.match(html,/class="ps-section ps-stock/);
    assert.doesNotMatch(html,/<script\b/i);
    assert.doesNotMatch(html,/javascript:|onerror=|onclick=/i);
    const schema=portable.schema(entry.id);
    assert.ok(schema.fields.length>=1);
    assert.equal(schema.capabilities.edit,true);
    const source=stock.sourceTemplate(entry.id);
    assert.ok(source.schema.capabilities.insert);
    assert.match(source.html,/data-theme-section|theme-block|data-theme-project-field/);
    assert.equal(source.stockAssetId,entry.stockAssetId);
  }
});

test("stock renderer escapes markup, validates URLs and colors and never invents a checkout action",()=>{
  const value=portable.defaults("platform/start-trial-checkout");
  value.title='<img src=x onerror=alert(1)>';
  assert.equal(portable.validate("platform/start-trial-checkout",value).ok,true);
  assert.match(portable.render({key:"trial",content:value}),/&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(portable.render({key:"trial",content:value}),/<form|data-adapter="checkout.session"/);
  value.href="javascript:alert(1)";
  assert.equal(portable.validate("platform/start-trial-checkout",value).ok,false);
  const palette=portable.defaults("platform/design-theme-settings");
  palette.swatch1.color="red;background:url(javascript:alert(1))";
  assert.equal(portable.validate("platform/design-theme-settings",palette).ok,false);
});

test("site stock blocks are real native details and links, not inert previews",()=>withDom(()=>{
  const faq=portable.defaults("platform/mini-expanded");
  const dom=new DOMParser().parseFromString(portable.render({key:"details",content:faq}),"text/html");
  assert.equal(dom.querySelectorAll("details").length,2);
  assert.equal(dom.querySelectorAll("summary").length,2);
  const nav=portable.defaults("platform/design-jump-to");
  const root=new DOMParser().parseFromString(portable.render({key:"navigation",content:nav}),"text/html");
  assert.equal(root.querySelectorAll("nav a[href]").length,2);
}));

test("a blank installed theme can Add Section, edit and publish-ready render without an invisible page",async()=>withDom(async()=>{
  const project=blankThemeProject({name:"Test",purpose:"Showcase",audience:"Everyone",siteName:"Test"});
  const store=memoryStore(project);
  const adapter=createThemeProjectAdapter(project,store);
  const registry=await adapter.getRegistry();
  for(const entry of stock.catalog()){
    const template=registry.pages.home.sections["stock-"+entry.id.split("/")[1]];
    assert.ok(template?.capabilities?.insert,entry.id);
    assert.match(template.previewHtml,/data-portable-preset=/);
  }
  const {section_key:key}=await adapter.addSection("home","stock-choose-a-plan",0);
  const page=await adapter.getPage("home");
  assert.equal(page.sections.length,1);
  assert.match(page.template,/<!--theme-section:section_/);
  const preview=await adapter.resolvePreview("home");
  assert.match(preview.html,/Compare options/);
  assert.equal((preview.html.match(/data-theme-block-id=/g)||[]).length,2);

  const section=page.sections[0];
  section.content.title="Actual merchant plan";
  await adapter.saveDraft("home",key,section.content,section.version);
  const after=await adapter.resolvePreview("home");
  assert.match(after.html,/Actual merchant plan/);
  assert.equal(store.current().pages[0].sections[0].content.title,"Actual merchant plan");
  assert.equal(store.current().sectionTemplates,undefined);
}));

test("invalid saved stock URLs fail in both browser draft and authenticated backend payload",async()=>withDom(async()=>{
  const project=blankThemeProject({name:"Unsafe",purpose:"Site",audience:"People",siteName:"Unsafe"});
  const store=memoryStore(project);
  const adapter=createThemeProjectAdapter(project,store);
  const {section_key:key}=await adapter.addSection("home","stock-first-run-home",0);
  const page=await adapter.getPage("home");
  const section=page.sections.find(s=>s.key===key);
  section.content.href="javascript:alert(1)";
  await assert.rejects(adapter.saveDraft("home",key,section.content,section.version),
    /theme_stock_content_invalid/);
  assert.equal((await adapter.getPage("home")).sections[0].content.href,"/about");
  const snapshot=await adapter.getProject();
  snapshot.pages.find(p=>p.slug==="home").sections[0].content.href="javascript:alert(1)";
  const {validateThemeProjectPayload}=await import("../backend/cms/theme-project-store.mjs");
  assert.throws(()=>validateThemeProjectPayload(snapshot),/theme_stock_content_invalid/);
}));

test("installed stock accepts Add Block and persists its exact fields in the original theme draft",async()=>withDom(async()=>{
  const project=blankThemeProject({name:"Test",purpose:"Website",audience:"Customers",siteName:"Test"});
  const store=memoryStore(project);
  const adapter=createThemeProjectAdapter(project,store);
  const {section_key:section}=await adapter.addSection("home","stock-design-jump-to",0);
  const page=await adapter.getPage("home");
  assert.equal(page.sections[0].schema.blocks[0].key,"link");
  const {block_id:blockId}=await adapter.addBlock("home",section,"link",2);
  assert.ok(blockId.startsWith("block_"));
  const changed=await adapter.getPage("home");
  assert.equal(changed.sections[0].content.__editor.blocks.length,3);
  const html=(await adapter.resolvePreview("home")).html;
  const doc=new DOMParser().parseFromString(html,"text/html");
  assert.equal(doc.querySelectorAll(".ps-stock nav a").length,3);
  await adapter.removeBlock("home",section,blockId);
  assert.equal((await adapter.getPage("home")).sections[0].content.__editor.blocks.length,2);
  assert.equal(store.current().revision,3);
}));
