import test from "node:test";
import assert from "node:assert/strict";
import {readFile,stat} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {createRequire} from "node:module";
import {starterCampaigns} from "../src/catalog.mjs";
const dir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(dir,".."),dist=path.join(root,"dist");
const {JSDOM}=createRequire(import.meta.url)("jsdom");
const load=async(name)=>new JSDOM(await readFile(path.join(dist,name),"utf8"),{runScripts:"dangerously",url:"https://growth.example.test/"+name,pretendToBeVisual:true});

test("starter catalog contains fourteen distinct Increase Sales variants",()=>{
 assert.equal(starterCampaigns.length,14);
 assert.equal(new Set(starterCampaigns.map(t=>t.id)).size,14);
 assert.equal(new Set(starterCampaigns.map(t=>t.visual_key)).size,14);
 for(const t of starterCampaigns){
  assert.equal(t.objective_key,"increase_sales");
  assert.equal(t.preview.mode,"demo_only");
  assert.ok(t.required_checks.length>=2&&t.fields.length>=4);
  assert.ok(t.reporting.metrics.includes("attributed_net_revenue"));
  for(const type of ["website","email","social","product_card","sms","paid_ad"])assert.ok(t.assets[type]);
 }
});
test("all 117 generated files include 14 complete campaign output sets",async()=>{
 const mf=JSON.parse(await readFile(path.join(dist,"manifest.json"),"utf8"));
 assert.equal(mf.template_count,14);assert.equal(mf.file_count,117);
 for(const t of starterCampaigns){
  assert.ok((await stat(path.join(dist,t.slug+".html"))).size>10000);
  assert.equal(JSON.parse(await readFile(path.join(dist,"templates",t.slug+".json"),"utf8")).id,t.id);
  for(const type of ["website","email","social","product_card","sms","paid_ad"]){
   const item=JSON.parse(await readFile(path.join(dist,"creative",t.slug,type+".json"),"utf8"));
   assert.equal(item.published,false);assert.equal(item.template_id,t.id);
  }
 }
});
test("gallery and filtering are fully clickable",async()=>{
 const d=await load("index.html");
 assert.equal(d.window.document.querySelectorAll(".catalog-card").length,14);
 const search=d.window.document.querySelector("#filter");search.value="checkout";
 search.dispatchEvent(new d.window.Event("input",{bubbles:true}));
 assert.equal(d.window.document.querySelectorAll(".catalog-card").length,1);
 assert.match(d.window.document.querySelector(".catalog-card").getAttribute("href"),/abandoned-checkout.html/);
 d.window.close();
});
test("every standalone preview renders its own composition",async()=>{
 for(const t of starterCampaigns){
  const d=await load(t.slug+".html");
  const doc=d.window.document;
  assert.ok(doc.querySelector(".hero-"+t.visual_key),t.id);
  assert.equal(doc.querySelectorAll("[data-tab]").length,7,t.id);
  assert.ok(doc.querySelector("[data-action=download]"));
  d.window.close();
 }
});
test("campaign preview interactions, safe text editing and local approval",async()=>{
 const d=await load("flash-sale.html");const w=d.window,x=w.document;
 const edit=x.getElementById("field-headline");edit.value="Custom flash preview";edit.dispatchEvent(new w.Event("input",{bubbles:true}));
 assert.match(x.querySelector(".store-hero h2").textContent,/Custom flash preview/);
 x.querySelector('[data-tab="email"]').click();assert.ok(x.querySelector(".email-card"));
 x.querySelector('[data-tab="social"]').click();assert.ok(x.querySelector(".social-card"));
 x.querySelector('[data-device="mobile"]').click();assert.ok(x.querySelector(".preview-window.mobile"));
 x.querySelector('[data-action="cta"]').click();assert.ok(x.querySelector('[role="dialog"]'));
 x.querySelector('[data-action="close-modal"]').click();assert.equal(x.querySelector('[role="dialog"]'),null);
 x.querySelector('[data-action="approve"]').click();assert.match(x.querySelector("#approval-status").textContent,/Locally approved/);
 edit.value="<img src=x onerror=alert(1)>";edit.dispatchEvent(new w.Event("input",{bubbles:true}));
 x.querySelector('[data-tab="website"]').click();assert.equal(x.querySelector(".store-copy img"),null);
 assert.match(x.querySelector(".store-hero h2").textContent,/<img src/);
 assert.match(x.querySelector("#approval-status").textContent,/Not approved/);
 d.window.close();
});
