import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { validateThemeSettings, renderThemeSettings, themeFontCssHref } from "../backend/cms/theme-style-contract.mjs";
import { HeadEdgeHydratedHandler } from "../backend/cms/edge-hydrate.js";
import { createSiteOwnedFixture } from "./fixtures/site-owned-cms.mjs";
import { handleAdminCmsApi } from "../backend/cms/api.js";
import { getSiteOwnedPage } from "../backend/cms/site-owned-page-adapter.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const panel = readFileSync(new URL("../frontend/static/js/theme-settings-panel.js", import.meta.url), "utf8");
const families = [
  {id:"inter",family:"Inter",category:"sans-serif",weights:[400,700],files:[{key:"fonts/inter/latin-wght-normal.12345678.woff2"}]},
  {id:"playfair-display",family:"Playfair Display",category:"serif",weights:[400,600],files:[{key:"fonts/playfair-display/latin-wght-normal.12345678.woff2"}]},
  {id:"jetbrains-mono",family:"JetBrains Mono",category:"monospace",weights:[400,700],files:[{key:"fonts/jetbrains-mono/latin-wght-normal.12345678.woff2"}]},
];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function fixture(initial={}) {
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="te-theme-name">Plain Jane</div><div id="te-preview-device" data-device="mobile"></div><iframe id="theme-preview"></iframe><section data-drawer-panel="theme-settings"></section></body></html>',{
    url:"https://editor.test/admin/theme-editor?slug=home",runScripts:"outside-only",pretendToBeVisual:true,
  });
  const w=dom.window;
  w.structuredClone=structuredClone;
  let saved=structuredClone(initial);
  const writes=[];
  w.CmsThemeSettings={
    read:()=>structuredClone(saved),
    update:next=>{saved=structuredClone(next);writes.push(saved);return true;},
  };
  w.fetch=async url=>{
    assert.equal(url,"https://themes.inneranimalmedia.com/fonts/manifest.json");
    return {ok:true,json:async()=>({families})};
  };
  w.eval(panel);
  return {dom,w,writes,get saved(){return saved;}};
}
test("Theme Store font families replace the four hardcoded editor options",async()=>{
  const f=fixture();
  try{
    await delay(30);
    f.w.ThemeSettingsPanel.open("type");
    const choices=[...f.w.document.querySelector('[data-ts-key="type.font.Heading"]').options];
    assert.ok(choices.some(o=>o.value==="playfair-display"&&o.textContent==="Playfair Display"));
    assert.ok(choices.some(o=>o.value==="jetbrains-mono"&&o.textContent==="JetBrains Mono"));
    assert.ok(choices.some(o=>o.value==="theme"&&o.textContent==="Theme default"));
    const body=f.w.document.querySelector('[data-ts-key="type.font.Body"]');
    body.value="inter";body.dispatchEvent(new f.w.Event("change",{bubbles:true}));
    const heading=f.w.document.querySelector('[data-ts-key="type.font.Heading"]');
    heading.value="playfair-display";heading.dispatchEvent(new f.w.Event("change",{bubbles:true}));
    await delay(330);
    assert.deepEqual(f.saved.fontRoles,{
      Body:{id:"inter",family:"Inter"},
      Heading:{id:"playfair-display",family:"Playfair Display"},
    });
    assert.equal(f.saved.font,undefined);
    assert.ok(f.w.document.getElementById("ts-font-catalog-preview").href.includes("inter,playfair-display"));
    const reopened=fixture(f.saved);
    try{
      await delay(30);
      reopened.w.ThemeSettingsPanel.open("type");
      assert.equal(reopened.w.document.querySelector('[data-ts-key="type.font.Body"]').value,"inter");
      assert.equal(reopened.w.document.querySelector('[data-ts-key="type.font.Heading"]').value,"playfair-display");
      const reset=reopened.w.document.querySelector('[data-ts-key="type.font.Body"]');
      reset.value="theme";reset.dispatchEvent(new reopened.w.Event("change",{bubbles:true}));
      await delay(330);
      assert.equal(reopened.saved.fontRoles.Body,undefined);
      assert.equal(reopened.saved.fontRoles.Heading.id,"playfair-display");
    }finally{reopened.dom.window.close();}
  }finally{f.dom.window.close();}
});
test("canonical CSS and cross-origin font delivery use the same validated role IDs",()=>{
 const settings={fontRoles:{
   Body:{id:"inter",family:"Inter"},
   Heading:{id:"playfair-display",family:"Playfair Display"},
   Subheading:{id:"inter",family:"Inter"},
   Accent:{id:"jetbrains-mono",family:"JetBrains Mono"},
  },controls:{"type.h1.size":"48px","type.h1.line":"Tight","type.h1.spacing":"Wide","type.h1.case":"Uppercase","type.p.line":"Loose"}};
 assert.deepEqual(validateThemeSettings(settings),{ok:true});
 assert.equal(themeFontCssHref(settings),"https://themes.inneranimalmedia.com/fonts/css?families=inter,jetbrains-mono,playfair-display");
 const css=renderThemeSettings(settings);
 assert.match(css,/--cms-font-heading:"Playfair Display"/);
 assert.match(css,/body\{font-family:var\(--cms-font-body\)/);
 assert.match(css,/h1\{font-size:48px;line-height:1.1;letter-spacing:.035em;text-transform:uppercase\}/);
 assert.match(css,/h5,h6,.cms-subheading/);
 assert.match(css,/line-height:1.65/);
 let head="";
 new HeadEdgeHydratedHandler({brand:{__editor:{themeSettings:settings}}}).element({append(value){head+=value;}});
 assert.match(head,/id="cms-merchant-fonts" rel="stylesheet" href="https:\/\/themes.inneranimalmedia.com\/fonts\/css\?families=/);
 assert.match(head,/id="cms-merchant-theme-style"/);
});
test("font role payloads reject malformed family IDs, CSS injection and unknown roles",()=>{
 for(const bad of [
   {Heading:{id:"https://other.site/font.woff2",family:"Foreign Font"}},
   {Heading:{id:"inter",family:"Inter</style><script>alert(1)</script>"}},
   {UI:{id:"inter",family:"Inter"}},
   {Heading:{id:"inter",family:"Inter",url:"https://other.test"}},
   ["inter"],
 ]) {
   const value={fontRoles:bad};
   assert.equal(validateThemeSettings(value).ok,false,JSON.stringify(value));
   assert.equal(themeFontCssHref(value),null);
   assert.equal(renderThemeSettings(value),"");
 }
 assert.deepEqual(validateThemeSettings({font:"Georgia"}),{ok:true},"existing merchant font choices remain supported");
});

test("font-role changes survive the existing site-owned D1/R2 draft API without publishing",async()=>{
 const f=createSiteOwnedFixture();
 try{
  f.db.exec("INSERT INTO cms_pages VALUES ('sitepage','main','site','/__site','global','Global','published',NULL,0,0,0,'{}','{}',NULL,NULL,1790000000,1790000000,1790000000); INSERT INTO cms_page_sections VALUES ('brand','sitepage','brand','brand','Brand','{}',0,1,'cms','brand-draft','brand-live','original','2026-10-01');");
  const liveContent=JSON.stringify({__editor:{themeSettings:{colors:{ink:"#222222"}}}});
  f.objects.set("brand-draft",liveContent);
  f.objects.set("brand-live",liveContent);
  const settings={fontRoles:{Body:{id:"inter",family:"Inter"},Heading:{id:"playfair-display",family:"Playfair Display"}},colors:{ink:"#223344"}};
  const url=new URL("https://cms.test/api/admin/cms/pages/site/sections/brand?site_id=main&page_id=sitepage");
  const response=await handleAdminCmsApi(new Request(url,{
   method:"PUT",headers:{"content-type":"application/json"},
   body:JSON.stringify({content:{__editor:{themeSettings:settings}},expected_version:0}),
  }),f.env,url,{accountId:"merchant"});
  assert.equal(response.status,200,await response.text());
  const reopened=await getSiteOwnedPage(f.env,"merchant","site","main","sitepage");
  const saved=reopened.page.sections[0].content.__editor.themeSettings;
  assert.deepEqual(saved,settings);
  assert.equal(JSON.parse(f.objects.get("brand-live")).__editor.themeSettings.fontRoles,undefined);
  assert.ok(themeFontCssHref(saved).includes("inter,playfair-display"));
 }finally{f.db.close();}
});
