import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {readFileSync} from "node:fs";
const require=createRequire(new URL("../package.json",import.meta.url));
const {JSDOM}=require("jsdom");
const script=readFileSync(new URL("../frontend/static/js/theme-settings-panel.js",import.meta.url),"utf8");
function fixture(){
 const markup='<!doctype html><body><div id="te-theme-name">Heuristic</div><div id="te-preview-device" data-device="desktop"></div><iframe id="theme-preview"></iframe><section data-drawer-panel="theme-settings"></section></body>';
 const dom=new JSDOM(markup,{url:"https://editor.test/admin/theme-editor?slug=shop",runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window;w.eval(script);
 return {dom,w,root:w.document.querySelector("#ts-theme-root")};
}
test("18 reference categories and exclusive accordion behavior",()=>{
 const {dom,root}=fixture();
 assert.ok(root,"component mounted");
 const expected=["Logo and favicon","Color palette","Typography","Page","Animations","Badges","Buttons","Cart","Drawers","Icons","Input fields","Popovers and modals","Prices","Product cards","Search","Swatches","Variant pickers","Custom CSS"];
 const buttons=[...root.querySelectorAll("[data-ts-toggle]")];
 assert.deepEqual(buttons.map(b=>b.textContent.trim()),expected);
 for(const b of buttons){b.click();assert.equal(root.querySelectorAll('[data-ts-toggle][aria-expanded="true"]').length,1,b.textContent);}
 buttons.at(-1).click();
 assert.equal(root.querySelectorAll('[data-ts-toggle][aria-expanded="true"]').length,0);
 dom.window.close();
});
test("switching categories is atomic: exactly one visible, accessible panel and directional chevron",()=>{
 const {dom,w,root}=fixture();
 const rows=[...root.querySelectorAll(".ts-category")];
 const invariant=(selected)=>{
  assert.equal(root.dataset.openCategory,selected);
  assert.equal(root.querySelectorAll('.ts-category.is-open').length,selected?1:0);
  assert.equal(root.querySelectorAll('[data-ts-toggle][aria-expanded="true"]').length,selected?1:0);
  assert.equal(root.querySelectorAll('.ts-category-content:not([hidden])').length,selected?1:0);
  rows.forEach(row=>{
   const on=row.dataset.tsCategory===selected;
   const trigger=row.querySelector("[data-ts-toggle]");
   const panel=row.querySelector("[data-ts-panel]");
   assert.equal(trigger.getAttribute("aria-expanded"),String(on),row.dataset.tsCategory);
   assert.equal(trigger.dataset.state,on?"open":"closed",row.dataset.tsCategory);
   assert.equal(panel.hidden,!on,row.dataset.tsCategory);
   assert.equal(panel.getAttribute("aria-hidden"),String(!on),row.dataset.tsCategory);
   assert.equal(panel.hasAttribute("inert"),!on,row.dataset.tsCategory);
   assert.equal(row.classList.contains("is-open"),on,row.dataset.tsCategory);
  });
 };
 invariant("");
 const keys=rows.map(row=>row.dataset.tsCategory);
 for(const key of [...keys,...keys.slice().reverse(),keys[2],keys[12],keys[2]]){
  w.ThemeSettingsPanel.open(key);
  invariant(key);
  // A second activation of the same heading collapses everything.
  w.ThemeSettingsPanel.open(key);
  invariant("");
 }
 const btn=rows[12].querySelector("[data-ts-toggle]");
 btn.focus();
 btn.click();
 invariant("prices");
 assert.equal(w.document.activeElement,btn,"clicked category retains keyboard focus");
 w.ThemeSettingsPanel.close();
 invariant("");
 dom.window.close();
});
test("opening a category closes its predecessor without erasing an unsaved setting",()=>{
 const {dom,w,root}=fixture();
 const buttons=[...root.querySelectorAll("[data-ts-toggle]")];
 buttons[15].click();
 const width=root.querySelector('[data-ts-key="swatches.width"][type="number"]');
 width.value="62";
 width.dispatchEvent(new w.Event("input",{bubbles:true}));
 buttons[12].click();
 assert.equal(root.querySelector('[data-ts-panel="swatches"]').hidden,true);
 assert.equal(root.querySelector('[data-ts-panel="prices"]').hidden,false);
 assert.equal(w.ThemeSettingsPanel.getState().values["swatches.width"],62);
 buttons[15].click();
 assert.equal(root.querySelector('[data-ts-key="swatches.width"][type="number"]').value,"62");
 assert.equal(root.querySelector('[data-ts-panel="prices"]').hidden,true);
 dom.window.close();
});
test("all final five reference fields are present with correct initial values",()=>{
 const {dom,w,root}=fixture();
 const keys=["prices.product","prices.cards","prices.items","prices.total","cards.quick","cards.mobileQuick","cards.second","cards.carousel","search.empty","search.productRadius","search.cardRadius","swatches.width","swatches.height","swatches.radius","swatches.borders","swatches.thickness","swatches.opacity","variants.selectedBg","variants.selectedText","variants.selectedBorder","variants.width"];
 const found=new Set();
 root.querySelectorAll("[data-ts-toggle]").forEach(b=>{b.click();root.querySelectorAll("[data-ts-key]").forEach(x=>found.add(x.dataset.tsKey));});
 assert.ok(keys.every(key=>found.has(key)),keys.filter(k=>!found.has(k)).join(", "));
 const st=w.ThemeSettingsPanel.getState().values;
 assert.equal(st["prices.total"],true);assert.equal(st["cards.quick"],true);
 assert.equal(st["swatches.width"],34);assert.equal(st["swatches.height"],34);
 assert.equal(st["swatches.opacity"],10);assert.equal(st["variants.width"],"Fill");
 dom.window.close();
});
test("numeric slider synchronizes with typed values and survives category switching",()=>{
 const {dom,w,root}=fixture();
 const buttons=[...root.querySelectorAll("[data-ts-toggle]")];
 buttons[15].click();
 const number=root.querySelector('[data-ts-key="swatches.width"][type=number]');
 number.value="57";number.dispatchEvent(new w.Event("input",{bubbles:true}));
 assert.equal(root.querySelector('[data-ts-key="swatches.width"][type=range]').value,"57");
 buttons[16].click();buttons[15].click();
 assert.equal(root.querySelector('[data-ts-key="swatches.width"][type=number]').value,"57");
 assert.equal(w.ThemeSettingsPanel.getState().values["swatches.width"],57);
 assert.match(w.sessionStorage.getItem("ia:theme-ui-review:v1:Heuristic:shop"),/"swatches.width":57/);
 dom.window.close();
});
test("color picker Apply saves selection, Cancel preserves previous value",()=>{
 const {dom,w,root}=fixture();
 root.querySelectorAll("[data-ts-toggle]")[16].click();
 const picker=root.querySelector('[data-ts-key="variants.selectedBg"]');
 picker.click();assert.ok(w.document.querySelector(".ts-modal"));
 w.document.querySelector("[data-ts-color-hex]").value="#224466";
 w.document.querySelector("[data-ts-apply]").click();
 assert.equal(w.ThemeSettingsPanel.getState().values["variants.selectedBg"],"#224466");
 picker.click();
 w.document.querySelector("[data-ts-color-hex]").value="#abcdef";
 w.document.querySelector("[data-ts-close]").click();
 assert.equal(w.ThemeSettingsPanel.getState().values["variants.selectedBg"],"#224466");
 dom.window.close();
});
test("prices, variants and category preview respond without publication",()=>{
 const {dom,w,root}=fixture();
 const buttons=[...root.querySelectorAll("[data-ts-toggle]")];
 buttons[12].click();root.querySelector('[data-ts-key="prices.total"]').click();
 assert.equal(w.ThemeSettingsPanel.getState().values["prices.total"],false);
 assert.doesNotMatch(root.querySelector('[data-ts-demo-content]').textContent,/USD/);
 buttons[16].click();root.querySelector('[data-ts-key="variants.width"][data-ts-value="Fit"]').click();
 assert.equal(w.ThemeSettingsPanel.getState().values["variants.width"],"Fit");
 assert.ok(!root.querySelector(".ts-demo-variants").classList.contains("is-fill"));
 assert.equal(w.ThemeSettingsPanel.getState().published,false);
 dom.window.close();
});


test("all visible categories expose working switch, select, slider, or segment mutations",()=>{
 const {dom,w,root}=fixture();
 const buttons=[...root.querySelectorAll("[data-ts-toggle]")];
 let mutations=0;
 for(const category of buttons){
  category.click();
  const toggle=root.querySelector(".ts-category.is-open .ts-switch");
  if(toggle){
   const key=toggle.dataset.tsKey,old=w.ThemeSettingsPanel.getState().values[key];
   toggle.click();
   assert.equal(w.ThemeSettingsPanel.getState().values[key],!old,key);
   mutations++;
  }
  const select=root.querySelector(".ts-category.is-open select[data-ts-key]");
  if(select&&select.options.length>1){
   const key=select.dataset.tsKey;
   const next=select.options[select.selectedIndex===0?1:0].value;
   select.value=next;select.dispatchEvent(new w.Event("change",{bubbles:true}));
   assert.equal(w.ThemeSettingsPanel.getState().values[key],next,key);
   mutations++;
  }
  const slider=root.querySelector('.ts-category.is-open input[type="range"]');
  if(slider){
   const key=slider.dataset.tsKey,value=Math.min(Number(slider.max),Number(slider.value)+1);
   slider.value=String(value);slider.dispatchEvent(new w.Event("input",{bubbles:true}));
   assert.equal(w.ThemeSettingsPanel.getState().values[key],value,key);
   mutations++;
  }
  const segments=root.querySelectorAll('.ts-category.is-open .ts-segment');
  for(const group of segments){
   const choices=[...group.querySelectorAll('button[data-ts-key]')];
   const target=choices.find(b=>b.getAttribute("aria-pressed")==="false");
   if(target){
    target.click();
    assert.equal(w.ThemeSettingsPanel.getState().values[target.dataset.tsKey],target.dataset.tsValue);
    mutations++;
    break;
   }
  }
 }
 assert.ok(mutations>=20,"expected broad functional control coverage");
 dom.window.close();
});
test("palette Add creates editable fifth slot and links remain distinct from literals",()=>{
 const {dom,w,root}=fixture();
 root.querySelectorAll("[data-ts-toggle]")[1].click();
 assert.equal(root.querySelectorAll(".ts-palette-chip").length,4);
 root.querySelector('[data-ts-action="paletteAdd"]').click();
 const picker=w.document.querySelector("[data-ts-color-hex]");
 assert.ok(picker);
 picker.value="#224488";w.document.querySelector("[data-ts-apply]").click();
 assert.equal(root.querySelectorAll(".ts-palette-chip").length,5);
 assert.equal(w.ThemeSettingsPanel.getState().values["palette.4"],"#224488");
 dom.window.close();
});
test("media selection is reversible, scoped, and not a live asset upload",()=>{
 const {dom,w,root}=fixture();
 root.querySelectorAll("[data-ts-toggle]")[0].click();
 const first=root.querySelector('[data-ts-action="media"][data-ts-key="brand.default"]');
 assert.ok(first);
 first.click();
 assert.ok(w.document.querySelector(".ts-modal"));
 w.document.querySelector('[data-ts-image-choice="1"]').click();
 w.document.querySelector("[data-ts-apply]").click();
 assert.ok(root.querySelector('[data-ts-media="brand.default"] img'));
 assert.equal(root.querySelector('[data-ts-media="brand.inverse"] img'),null);
 root.querySelector('[data-ts-action="mediaRemove"][data-ts-key="brand.default"]').click();
 assert.equal(root.querySelector('[data-ts-media="brand.default"] img'),null);
 dom.window.close();
});
test("Custom CSS source edits remain isolated and do not inject new styles",()=>{
 const {dom,w,root}=fixture();
 root.querySelectorAll("[data-ts-toggle]")[17].click();
 const input=root.querySelector('#ts-css-code');
 input.value='.preview-test { border-radius: 18px; }';
 input.dispatchEvent(new w.Event("input",{bubbles:true}));
 assert.match(w.ThemeSettingsPanel.getState().values["css.source"],/border-radius: 18px/);
 assert.equal(w.document.querySelector('style[data-generated-from-css]'),null);
 dom.window.close();
});

test("actual Theme Editor HTML loads the Theme Settings runtime after its editor host",()=>{
 const html=readFileSync(new URL("../frontend/static/theme-editor.html",import.meta.url),"utf8");
 const shell=new JSDOM(html);
 const resources=[...shell.window.document.querySelectorAll("script[src]")].map(el=>el.getAttribute("src"));
 const editor=resources.indexOf("/admin/js/theme-editor.js");
 const settings=resources.indexOf("/admin/js/theme-settings-live.js");
 assert.ok(editor>=0,"canonical editor asset must load");
 assert.equal(settings,editor+1,"theme settings must mount immediately after the editor");
 assert.equal(resources.filter(x=>x==="/admin/js/theme-settings-live.js").length,1);
 assert.equal(resources.includes("/admin/js/theme-settings-panel.js"),false,"review fixture must never render for merchants");
 assert.ok(shell.window.document.querySelector('link[href="/admin/css/theme-settings-live.css"]'));
 assert.doesNotMatch(shell.window.document.body.textContent,/\\n/,"literal slash-n must not appear in editor markup");
 shell.window.close();
});
