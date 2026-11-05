import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {JSDOM} from "jsdom";
import {createSiteOwnedFixture} from "./fixtures/site-owned-cms.mjs";
import {handleAdminCmsApi} from "../backend/cms/api.js";
import {getSiteOwnedPage} from "../backend/cms/site-owned-page-adapter.mjs";
import {HeadEdgeHydratedHandler} from "../backend/cms/edge-hydrate.js";
import {validateThemeSettings,renderThemeSettings} from "../backend/cms/theme-style-contract.mjs";

const panel=readFileSync(new URL("../frontend/static/js/theme-settings-live.js",import.meta.url),"utf8");
function seedBrand(f) {
  f.db.exec(`INSERT INTO cms_pages VALUES ('sitepage','main','site','/__site','global','Global','published',NULL,0,0,0,'{}','{}',NULL,NULL,1790000000,1790000000,1790000000);
    INSERT INTO cms_page_sections VALUES ('brand','sitepage','brand','brand','Brand','{}',0,1,'cms','brand-draft','brand-live','original','2026-10-01');`);
  const content=JSON.stringify({__editor:{themeSettings:{}}});
  f.objects.set("brand-draft",content);f.objects.set("brand-live",content);
}
async function save(f,settings,version=0,account="merchant",siteId="main",pageId="sitepage") {
  const url=new URL("https://cms.test/api/admin/cms/pages/site/sections/brand?site_id="+siteId+"&page_id="+pageId);
  const response=await handleAdminCmsApi(new Request(url,{method:"PUT",headers:{"content-type":"application/json"},
    body:JSON.stringify({content:{__editor:{themeSettings:settings}},expected_version:version})}),f.env,url,{accountId:account});
  return {response,body:await response.json()};
}

test("mounted settings values round-trip through the actual site-owned API and the shared storefront renderer",async()=>{
  const f=createSiteOwnedFixture();seedBrand(f);
  const dom=new JSDOM('<section data-drawer-panel="theme-settings"></section><iframe id="theme-preview"></iframe>',{url:"https://editor.test/admin/theme-editor?slug=home",runScripts:"outside-only"});
  try {
    let values={};
    dom.window.CmsThemeSettings={read:()=>structuredClone(values),update:next=>{values=structuredClone(next);return true;}};
    dom.window.eval(panel);
    const radius=dom.window.document.querySelector("[data-theme-radius]");
    radius.value="23";radius.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
    const width=dom.window.document.querySelector('[data-design-number="page.maxWidth"]');
    width.value="1080";width.dispatchEvent(new dom.window.Event("change",{bubbles:true}));
    assert.deepEqual(validateThemeSettings(values),{ok:true});
    const saved=await save(f,values);
    assert.equal(saved.response.status,200,JSON.stringify(saved.body));
    assert.equal(saved.body.published,false);
    const reopened=await getSiteOwnedPage(f.env,"merchant","site","main","sitepage");
    const stored=reopened.page.sections[0].content.__editor.themeSettings;
    assert.deepEqual(stored,values);
    assert.equal(JSON.parse(f.objects.get("brand-live")).__editor.themeSettings.buttonRadius,undefined);
    assert.equal(f.db.prepare("SELECT status FROM cms_pages WHERE id='sitepage'").get().status,"published");
    let output="";
    new HeadEdgeHydratedHandler({brand:{__editor:{themeSettings:stored}}}).element({append(value){output+=value;}});
    const rendered=new JSDOM("<head>"+output+"</head><body><main class='h-container'><button>Example</button></main></body>");
    assert.equal(rendered.window.getComputedStyle(rendered.window.document.querySelector("button")).borderRadius,"23px");
    assert.match(rendered.window.document.querySelector("#cms-merchant-theme-style").textContent,/1080px/);
    assert.equal(rendered.window.document.querySelectorAll("#cms-merchant-theme-style").length,1);
    rendered.window.close();
    const reset=[...dom.window.document.querySelectorAll("button")].find(el=>el.textContent==="Reset to theme default");
    reset.click();
    assert.equal(values.designDraft?.["page.maxWidth"],undefined);
    assert.equal(dom.window.sessionStorage.length,0);
    const group=dom.window.document.querySelector('[data-design-number="page.maxWidth"]').closest("details");
    group.open=true;
    dom.window.document.dispatchEvent(new dom.window.Event("theme-editor:global-settings-ready"));
    assert.equal(dom.window.document.querySelector('[data-design-number="page.maxWidth"]').closest("details").open,true,"undo/readback must preserve the open settings category");
  } finally {dom.window.close();f.db.close();}
});

test("invalid and unconnected settings cannot write objects, pointers or revisions",async()=>{
  const f=createSiteOwnedFixture();seedBrand(f);
  try {
    for(const settings of [
      {buttonRadius:61},{designDraft:{"page.maxWidth":500}},
      {designDraft:{"page.maxWidth":"1280"}},{designDraft:{"motion.reduced":"false"}},
      {designDraft:{"inputs.radius":-1}},{designDraft:{"icons.style":"Solid"}},
      {customCss:"</style><script>alert(1)</script>"},
      {customCss:"@import url(https://example.com/remote.css)"}
    ]) {
      const before=[...f.objects.entries()];
      const result=await save(f,settings);
      assert.equal(result.response.status,422,JSON.stringify(result.body));
      assert.deepEqual([...f.objects.entries()],before);
      assert.equal(f.db.prepare("SELECT draft_r2_key FROM cms_page_sections WHERE id='brand'").get().draft_r2_key,"brand-draft");
      assert.equal(f.db.prepare("SELECT count(*) AS n FROM cms_revisions").get().n,0);
    }
  }finally{f.db.close();}
});

test("stale revisions, failed storage and foreign-account writes preserve the private value",async()=>{
  const f=createSiteOwnedFixture();seedBrand(f);
  try {
    assert.equal((await save(f,{buttonRadius:18})).response.status,200);
    const stale=await save(f,{buttonRadius:30},0);
    assert.equal(stale.response.status,409);
    const foreign=await save(f,{buttonRadius:29},1,"other");
    assert.ok([403,404].includes(foreign.response.status));
    const originalPut=f.env.CMS_CONTENT.put;
    f.env.CMS_CONTENT.put=async()=>{throw new Error("Injected test storage failure");};
    await assert.rejects(save(f,{buttonRadius:22},1),/Injected test storage failure/);
    f.env.CMS_CONTENT.put=originalPut;
    const reopened=await getSiteOwnedPage(f.env,"merchant","site","main","sitepage");
    assert.equal(reopened.page.sections[0].content.__editor.themeSettings.buttonRadius,18);
    assert.equal((await save(f,{buttonRadius:22},1)).response.status,200);
  }finally{f.db.close();}
});

test("unavailable settings settle with retry; unbound fields do not pretend to persist",()=>{
  const dom=new JSDOM('<section data-drawer-panel="theme-settings"></section>',{url:"https://editor.test/admin/theme-editor",runScripts:"outside-only"});
  try {
    let retried=0;
    dom.window.CmsThemeSettings={read:()=>null,reload:()=>retried++};
    dom.window.eval(panel);
    assert.match(dom.window.document.body.textContent,/unavailable/);
    dom.window.document.querySelector("[data-settings-retry]").click();
    assert.equal(retried,1);
    dom.window.CmsThemeSettings.read=()=>({});
    dom.window.document.dispatchEvent(new dom.window.Event("theme-editor:global-settings-ready"));
    for(const el of dom.window.document.querySelectorAll("[data-design-text],[data-design-select]"))assert.equal(el.disabled,true);
    assert.match(dom.window.document.body.textContent,/not saved or applied/);
  }finally{dom.window.close();}
});

test("reset removes supported overrides; zero values and reduced motion retain exact semantics",()=>{
  const settings={buttonRadius:0,designDraft:{"page.maxWidth":720,"inputs.radius":0,"motion.reduced":true}};
  assert.equal(validateThemeSettings(settings).ok,true);
  const css=renderThemeSettings(settings);
  assert.match(css,/border-radius:0px/);
  assert.match(css,/animation-duration/);
  assert.equal(renderThemeSettings({}),"");
  assert.equal(renderThemeSettings({designDraft:{"page.maxWidth":null}}),"");
});


test("color controls save and reload independently on two CMS sites",async()=>{
  const f=createSiteOwnedFixture();seedBrand(f);
  f.db.exec("INSERT INTO cms_sites VALUES ('secondary','merchant','Second site','second','second.example','active',0);\n"+
    "INSERT INTO cms_pages VALUES ('otherpage','secondary','site','/__site','global','Global','published',NULL,0,0,0,'{}','{}',NULL,NULL,1790000000,1790000000,1790000000);\n"+
    "INSERT INTO cms_page_sections VALUES ('brand-other','otherpage','brand','brand','Brand','{}',0,1,'cms','brand-other-draft','brand-other-live','original','2026-10-01');");
  const otherContent=JSON.stringify({__editor:{themeSettings:{}}});
  f.objects.set("brand-other-draft",otherContent);f.objects.set("brand-other-live",otherContent);
  const dom=new JSDOM('<section data-drawer-panel="theme-settings"></section><iframe id="theme-preview"></iframe>',{url:"https://editor.test/admin/theme-editor?slug=home",runScripts:"outside-only"});
  try {
    let values={};
    dom.window.CmsThemeSettings={read:()=>structuredClone(values),update:next=>{values=structuredClone(next);return true;}};
    dom.window.eval(panel);
    const accent=dom.window.document.querySelector('[data-theme-color="accent"]');
    accent.value="#123456";
    accent.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
    assert.equal(values.colors.accent,"#123456");
    const firstSave=await save(f,values,0,"merchant","main","sitepage");
    assert.equal(firstSave.response.status,200,JSON.stringify(firstSave.body));
    const firstReload=await getSiteOwnedPage(f.env,"merchant","site","main","sitepage");
    assert.equal(firstReload.page.sections[0].content.__editor.themeSettings.colors.accent,"#123456");

    values={};
    accent.value="#abcdef";
    accent.dispatchEvent(new dom.window.Event("input",{bubbles:true}));
    assert.equal(values.colors.accent,"#abcdef");
    const secondSave=await save(f,values,0,"merchant","secondary","otherpage");
    assert.equal(secondSave.response.status,200,JSON.stringify(secondSave.body));
    const secondReload=await getSiteOwnedPage(f.env,"merchant","site","secondary","otherpage");
    const firstReloadAgain=await getSiteOwnedPage(f.env,"merchant","site","main","sitepage");
    assert.equal(secondReload.page.sections[0].content.__editor.themeSettings.colors.accent,"#abcdef");
    assert.equal(firstReloadAgain.page.sections[0].content.__editor.themeSettings.colors.accent,"#123456");
  } finally {dom.window.close();f.db.close();}
});
