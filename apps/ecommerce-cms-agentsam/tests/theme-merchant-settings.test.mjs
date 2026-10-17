import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { validateThemeSettings, validateThemeCss } from "../backend/cms/theme-style-contract.mjs";

const require = createRequire(new URL("../package.json",import.meta.url));
const { JSDOM } = require("jsdom");
const editorJs = readFileSync(new URL("../frontend/static/js/theme-settings-live.js",import.meta.url),"utf8");
const hydrationJs = readFileSync(new URL("../../../packages/heuristic-theme/storefront/js/cms-hydrate.js",import.meta.url),"utf8");

test("CMS theme styling accepts real colors and CSS but rejects malicious remote resource CSS", () => {
  assert.deepEqual(validateThemeSettings({colors:{accent:"#112233"},buttonRadius:18,font:"Georgia",customCss:".shop-hero { opacity:.8; }"}),{ok:true});
  assert.equal(validateThemeCss("@import url(https://example.com/tracker.css)").ok,false);
  assert.equal(validateThemeCss(".hero { background: url(https://example.com/track); }").ok,false);
  assert.equal(validateThemeCss(".hero { color: red;").ok,false);
  assert.equal(validateThemeSettings({colors:{accent:"red"}}).ok,false);
  assert.equal(validateThemeSettings({font:"made-up-font"}).ok,false);
  assert.equal(validateThemeSettings({buttonRadius:-4}).ok,false);
});

test("merchant theme controls change the global CMS settings document, not sessionStorage", () => {
  const dom=new JSDOM('<!doctype html><body><section data-drawer-panel="theme-settings"></section><iframe id="theme-preview"></iframe></body>',{
    url:"https://editor.test/admin/theme-editor?slug=shop",runScripts:"outside-only",pretendToBeVisual:true
  });
  const w=dom.window;
  let stored={},updates=0;
  w.CmsThemeSettings={read:()=>structuredClone(stored),update:settings=>{stored=structuredClone(settings);updates++;return true;}};
  w.eval(editorJs);
  const root=w.document.querySelector(".ts-live");
  assert.ok(root);
  assert.deepEqual([...root.querySelectorAll(".ts-live-group>summary")].map(node=>node.textContent),["Colors","Typography","Buttons","Custom CSS"]);
  const color=root.querySelector('[data-theme-color="accent"]');
  color.value="#123456";color.dispatchEvent(new w.Event("input",{bubbles:true}));
  assert.equal(stored.colors.accent,"#123456");
  assert.equal(root.querySelector('[data-theme-reset="accent"]').disabled,false);
  const font=root.querySelector("[data-theme-font]");
  font.value="Georgia";font.dispatchEvent(new w.Event("change",{bubbles:true}));
  assert.equal(stored.font,"Georgia");
  const radius=root.querySelector("[data-theme-radius]");
  radius.value="21";radius.dispatchEvent(new w.Event("input",{bubbles:true}));
  assert.equal(stored.buttonRadius,21);
  const css=root.querySelector("[data-theme-css]");
  css.value=".shop-hero { filter: saturate(.8); }";
  css.dispatchEvent(new w.Event("input",{bubbles:true}));
  assert.match(stored.customCss,/saturate/);
  const before=updates;
  css.value="@import url(https://remote.example/tracker.css)";
  css.dispatchEvent(new w.Event("input",{bubbles:true}));
  assert.equal(updates,before,"invalid CSS must not enter the CMS write pipeline");
  assert.equal(css.getAttribute("aria-invalid"),"true");
  root.querySelector('[data-theme-reset="accent"]').click();
  assert.equal(stored.colors?.accent,undefined,"reset restores the source theme instead of replacing its CSS");
  assert.equal(w.sessionStorage.length,0);
  dom.window.close();
});

test("public CMS hydrator applies published site brand tokens and custom CSS, not only a visual sample", async () => {
  const dom=new JSDOM('<!doctype html><html data-cms-page="shop"><head></head><body><main><section data-cms-section="hero"><h1 data-cms="headline">Hello</h1></section></main></body></html>',{
    url:"https://store.test/shop",runScripts:"outside-only",pretendToBeVisual:true
  });
  const w=dom.window;
  w.fetch=async url=>({ok:true,json:async()=>({page:String(url).includes("/site")?{
    sections:[{key:"brand",content:{__editor:{themeSettings:{colors:{accent:"#123456",canvas:"#101010"},buttonRadius:19,customCss:".shop-hero h1 {letter-spacing:2px;}"}}}}]
  }:{sections:[{key:"hero",content:{headline:"Editable heading"}}]}})});
  w.CSS = { escape: value => String(value) };
  w.eval(hydrationJs);
  if(w.document.readyState==="loading") w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
  await new Promise(resolve=>setTimeout(resolve,80));
  const style=w.document.querySelector("#cms-merchant-theme-style")?.textContent||"";
  assert.match(style,/--h-color-accent:#123456/);
  assert.match(style,/--h-color-canvas:#101010/);
  assert.match(style,/border-radius:19px/);
  assert.match(style,/letter-spacing:2px/);
  assert.equal(w.document.querySelectorAll("#cms-merchant-theme-style").length,1,"one global style source");
  dom.window.close();
});


test("Hero placement and focal position are actual CMS-rendered styles, not inspector-only presets", async () => {
 const dom=new JSDOM('<!doctype html><html data-cms-page="shop"><head></head><body><main><section class="shop-hero" data-cms-section="hero"><div class="shop-hero__media"><img src="/hero.jpg"></div><div class="shop-hero__content"><h1 data-cms="headline">Hero</h1><div class="shop-hero__actions"></div><div class="shop-hero__proof"></div></div></section></main></body></html>',{
  url:"https://store.test/shop",runScripts:"outside-only",pretendToBeVisual:true
 });
 const w=dom.window;
 w.fetch=async url=>({ok:true,json:async()=>({page:String(url).includes("/site")?{sections:[]}:
  {sections:[{key:"hero",content:{headline:"Hero",__editor:{layout:{heroVertical:"top",heroAlignment:"right",heroImageFocus:"left"}}}}]}})});
 w.CSS = { escape: value => String(value) };
 w.eval(hydrationJs);
 if(w.document.readyState==="loading") w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
 await new Promise(resolve=>setTimeout(resolve,65));
 const hero=w.document.querySelector(".shop-hero");
 assert.equal(hero.style.alignItems,"start");
 assert.equal(hero.querySelector(".shop-hero__content").style.marginLeft,"auto");
 assert.equal(hero.querySelector(".shop-hero__content").style.textAlign,"right");
 assert.equal(hero.querySelector(".shop-hero__media img").style.objectPosition,"15% center");
 dom.window.close();
});


test("section Custom CSS is section-scoped and present in the public CMS runtime",async()=>{
 const dom=new JSDOM('<!doctype html><html data-cms-page="shop"><head></head><body><main><section data-cms-section="hero"><h1 class="demo-heading">A</h1></section><section data-cms-section="collections"><h1 class="demo-heading">B</h1></section></main></body></html>',{
  url:"https://store.test/shop",runScripts:"outside-only",pretendToBeVisual:true
 });
 const w=dom.window;
 w.CSS={escape: value=>String(value)};
 w.fetch=async url=>({ok:true,json:async()=>({page:String(url).includes("/site")?{sections:[]}:
  {sections:[{key:"hero",content:{__editor:{customCss:'.demo-heading { color: #123456; }'}}},{key:"collections",content:{}}]}})});
 w.eval(hydrationJs);
 if(w.document.readyState==="loading")w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
 await new Promise(resolve=>setTimeout(resolve,60));
 const style=w.document.getElementById('cms-section-css-hero');
 assert.ok(style,"Storefront must mount the Hero CSS");
 assert.match(style.textContent,/@scope \(\[data-cms-section="hero"\]\)/);
 assert.match(style.textContent,/color: #123456/);
 assert.equal(w.document.getElementById('cms-section-css-collections'),null);
 dom.window.close();
});
