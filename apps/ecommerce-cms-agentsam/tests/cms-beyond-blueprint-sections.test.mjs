import test from "node:test";
import assert from "node:assert/strict";
import "../packages/theme-contract/runtime/platform-stock-sections.js";
import "../packages/theme-contract/runtime/portable-sections.js";
const runtime=globalThis.ThemePortableSections;
const keys=["cad-beyond/aspiration","cad-beyond/complexity","cad-beyond/uncertainty","cad-beyond/perseverance","cad-beyond/understanding","cad-beyond/capability","cad-beyond/possibility","cad-beyond/architectural-evidence"];
test("all eight Beyond sections expose editable, validated, native portable renderers",()=>{
 for(const key of keys){
  assert.ok(runtime.get(key),key);
  const schema=runtime.schema(key);
  assert.ok(schema.fields.length>=8,key);
  assert.equal(schema.capabilities.edit,true,key);
  const content=runtime.defaults(key);
  assert.equal(runtime.validate(key,content).ok,true,key);
  const html=runtime.render({key:key.split("/")[1],content});
  assert.match(html,/data-cms-section=/,key);
  assert.ok(html.includes('data-portable-preset="'+key+'"'),key);
  assert.doesNotMatch(html,/<script\b|javascript:|onerror=|onclick=/i,key);
 }
 assert.equal(runtime.catalog().filter(item=>item.id.startsWith("cad-beyond/")).length,8);
});
test("chapter renderers preserve anchors and safely editable emphasis",()=>{
 const content=runtime.defaults("cad-beyond/aspiration");
 content.anchor="aspiration";content.headline="A vision starts before a plan.";content.emphasis="before a plan.";
 const html=runtime.render({key:"aspiration",content});
 assert.match(html,/id="aspiration"/);assert.match(html,/<em>before a plan\.<\/em>/);
 content.headline='<img src=x onerror=alert(1)>';content.emphasis="";
 assert.match(runtime.render({key:"aspiration",content}),/&lt;img src=x onerror=alert\(1\)&gt;/);
 content.ctaHref="javascript:alert(1)";
 assert.equal(runtime.validate("cad-beyond/aspiration",content).ok,false);
});
test("architectural evidence supports independently editable project-fact and process blocks",()=>{
 const content=runtime.defaults("cad-beyond/architectural-evidence");content.anchor="architectural-evidence";
 content["evidence-item1"]={kind:"spec",slug:"native-source",number:"01",title:"Native source",body:"FreeCAD and IFC remain authoritative.",lede:"",what:"",why:"",produces:"",imageUrl:"",imageAlt:"",caption:""};
 content.__editor.blocks.push({id:"evidence-item2",templateKey:"evidence-item",enabled:true});
 content["evidence-item2"]={kind:"process",slug:"first-plan",number:"01",version:"V1",title:"First plan",body:"",lede:"The first drawing.",what:"A schematic plan.",why:"It gives the team something to review.",produces:"A coordinated room layout.",imageUrl:"",imageAlt:"",caption:""};
 assert.equal(runtime.validate("cad-beyond/architectural-evidence",content).ok,true);
 const html=runtime.render({key:"architectural-evidence",content});
 assert.match(html,/id="architectural-evidence"/);assert.match(html,/Native source/);assert.match(html,/First plan/);
 content.processTitle="The process, one step at a time.";
 assert.match(runtime.render({key:"architectural-evidence",content}),/The process, one step at a time\./);
 content["evidence-item2"].imageUrl="javascript:alert(1)";
 assert.equal(runtime.validate("cad-beyond/architectural-evidence",content).ok,false);
});
test("generic catalog defaults contain no tenant or project copy",()=>{
 for(const key of keys)assert.doesNotMatch(JSON.stringify(runtime.defaults(key)),/DreamHouse|SamPrimeaux|InnerAnimalMedia/);
});
