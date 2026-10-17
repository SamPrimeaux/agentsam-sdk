import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createRequire} from "node:module";
import {createGenerationFlow,mountComposer,mountAssistantHeader} from "../frontend/static/js/generation-surfaces.mjs";
const require=createRequire(new URL("../package.json",import.meta.url));
const {JSDOM}=require("jsdom");

function mounted(){
 const dom=new JSDOM('<!doctype html><html><body><main id="left"><div id="tree"></div><section id="panel" hidden></section><div id="inspector"></div><div id="slot"></div></main><aside id="right"><header class="agentsam-head"></header><div id="messages"></div><textarea id="agentsam-input"></textarea></aside></body></html>',
  {runScripts:"dangerously",url:"https://editor.local/"});
 for(const file of ["agentsam-composer.js","miniagentsam-codepreview.js"]){
   dom.window.eval(readFileSync(new URL("../frontend/static/js/"+file,import.meta.url),"utf8"));
 }
 const doc=dom.window.document;
 const composer=mountComposer(doc.getElementById("slot"),"editor");
 const header=mountAssistantHeader(doc.getElementById("right"),{selection:"Shop › hero",expanded:false});
 const panel=doc.getElementById("panel");
 const flow=createGenerationFlow({
  assistant:doc.getElementById("right"),messages:doc.getElementById("messages"),
  tree:doc.getElementById("tree"),panel,
  inspector:doc.getElementById("inspector")
 });
 return {dom,doc,composer,header,panel,flow};
}
test("mounted mini composer → right action card → editable left request → Send only",()=>{
 const {doc,composer,panel,flow}=mounted();
 let network=0;
 panel.addEventListener("agentsam-generation-request",()=>network++);
 composer.addEventListener("submit-request",event=>flow.handoff(event.detail.text));
 composer.shadowRoot.querySelector("[data-input]").value="Create a responsive feature section";
 composer.shadowRoot.querySelector("[data-send]").click();
 assert.equal(network,0);
 assert.equal(flow.state.calls,0);
 assert.equal(panel.hidden,true);
 assert.equal(doc.querySelector("#tree [data-generating]"),null);
 assert.ok(doc.querySelector("#right [data-action-card]"));
 assert.ok(doc.querySelector("#right .agentsam-msg--user"));
 assert.ok(doc.querySelector("#right .agentsam-msg--assistant"));
 doc.querySelector("#right [data-action-card]").click();
 const box=doc.querySelector("#left [data-request-box]");
 assert.ok(box);
 assert.equal(box.value,"Create a responsive feature section");
 assert.equal(doc.querySelectorAll("#tree [data-generating]").length,1);
 assert.equal(network,0);
 box.value="Actually make an editorial collection feature";
 panel.querySelector("[data-send-request]").click();
 assert.equal(network,1);
 assert.equal(flow.state.calls,1);
 assert.equal(flow.state.request,"Actually make an editorial collection feature");
 assert.equal(panel.dataset.surface,"left");
 assert.ok(panel.querySelector("[data-stop][aria-label]"));
 assert.equal(panel.querySelector("miniagentsam-codepreview").getAttribute("data-lines"),"13");
 assert.ok(panel.querySelector("[aria-live=polite]"));
});
test("mounted generation review is inert until acceptance; settings keep provenance and follow-up gate",async()=>{
 const {doc,panel,flow}=mounted();
 let generates=0,accepts=0;
 panel.addEventListener("agentsam-generation-request",()=>generates++);
 flow.handoff("Make a featured tile");
 doc.querySelector("[data-action-card]").click();
 panel.querySelector("[data-send-request]").click();
 assert.equal(generates,1);
 flow.review({
  definition:{kind:"section",type:"feature",label:"Featured tile"},
  settings:{headline:"Test"},
  canonical:{html:'<section data-agentsam-block="__UID__">Hello</section>',css:"",js:""}
 },async()=>{accepts++;return {ok:true}},{
  prompt:"Make a featured tile",provider:"sample-provider",model:"sample-model"
 });
 assert.equal(accepts,0);
 assert.equal(panel.dataset.panelState,"review");
 assert.equal(panel.querySelector("iframe").getAttribute("sandbox"),"");
 panel.querySelector("[data-accept-generated]").click();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(accepts,1);
 assert.equal(panel.dataset.panelState,"settings");
 assert.equal(doc.querySelectorAll("#tree [data-generating]").length,0);
 const details=doc.querySelector("#inspector [data-ai-generated]");
 assert.ok(details);
 assert.equal(details.open,false);
 assert.match(details.textContent,/sample-provider.*sample-model/);
 const form=doc.querySelector("#inspector [data-followup]");
 assert.ok(form);
 form.querySelector("[data-followup-input]").value="Move the title right";
 form.dispatchEvent(new doc.defaultView.Event("submit",{bubbles:true,cancelable:true}));
 assert.equal(doc.querySelector("#left [data-request-box]").value,"Move the title right");
 assert.equal(generates,1,"Follow-up has not generated yet");
 panel.querySelector("[data-send-request]").click();
 assert.equal(generates,2);
});
test("real preview custom element syntax-colors text and bounds height by 13 line units",()=>{
 const {doc}=mounted();
 const preview=doc.createElement("miniagentsam-codepreview");
 preview.setAttribute("data-lines","13");
 doc.body.append(preview);
 const text=['<section class="hello" data-name="test">','{{ product.title }}','/* notes */','section {',' padding: 18px;','}']
  .concat(Array.from({length:20},(_,i)=>'<article title="item">Row '+i+'</article>')).join("\n");
 preview.appendText(text);
 const pre=preview.shadowRoot.querySelector("pre");
 assert.equal(pre.textContent,text);
 assert.equal(pre.querySelector("article"),null,"Unsafe generated HTML never becomes DOM");
 for(const key of ["tag","attr","string","template","prop","comment"]){
   assert.ok(pre.querySelector(".token-"+key),"Missing token role "+key);
 }
 const css=preview.shadowRoot.querySelector("style").textContent;
 assert.match(css,/max-height:13lh/);
 assert.match(css,/--te-token-tag/);
 assert.match(css,/prefers-reduced-motion/);
 assert.equal(pre.querySelectorAll("[data-code-line]").length,26);
 Object.defineProperty(pre,"scrollHeight",{get:()=>650});
 Object.defineProperty(pre,"clientHeight",{get:()=>220});
 pre.scrollTop=0;
 pre.dispatchEvent(new doc.defaultView.Event("scroll"));
 assert.equal(preview.following,false);
 preview.appendText("\n<!-- another comment -->");
 assert.equal(preview.following,false);
});
test("one composer module supports explicit expand and accessible right rail header",()=>{
 const {doc,composer}=mounted();
 const root=composer.shadowRoot;
 assert.equal(composer.hasAttribute("expanded"),false);
 assert.equal(root.querySelector("[data-input]").rows,1);
 root.querySelector("[data-expand]").click();
 assert.equal(composer.hasAttribute("expanded"),true);
 root.querySelector("[data-expand]").click();
 assert.equal(composer.hasAttribute("expanded"),false);
 assert.equal(doc.querySelector("#right #agentsam-input").placeholder.includes("Shop › hero"),true);
 assert.equal(doc.querySelectorAll("#right [data-assistant-actions] button[aria-label]").length,2);
 assert.equal(doc.querySelectorAll("#right [data-context-chip]").length,1);
});

test("real Side Assistant mounts canonical mark and functional New Chat / Expand controls",()=>{
 const dom=new JSDOM('<!doctype html><html><body><aside id="agentsam-dock"></aside></body></html>',{
  runScripts:"dangerously",url:"https://editor.local/admin/theme-editor"
 });
 dom.window.fetch=async()=>({json:async()=>({ok:false})});
 const script=readFileSync(new URL("../frontend/static/js/agentsam.js",import.meta.url),"utf8");
 dom.window.eval(script);
 dom.window.initAgentsamDrawer();
 const doc=dom.window.document;
 const drawer=doc.getElementById("agentsam-drawer");
 assert.ok(drawer,"Real Side Assistant must mount");
 const mark=drawer.querySelector(".agentsam-mark");
 assert.ok(mark);
 assert.equal(mark.querySelector("svg"),null,"No handmade sparkle vector");
 assert.ok(drawer.querySelector("[data-context-chip]"));
 const expand=drawer.querySelector('[data-assistant-action="Expand"]');
 assert.ok(expand);
 expand.click();
 assert.equal(drawer.hasAttribute("data-expanded"),true);
 drawer.querySelector('[data-assistant-action="Collapse"]').click();
 assert.equal(drawer.hasAttribute("data-expanded"),false);
 const messages=doc.getElementById("agentsam-messages");
 dom.window.presentAgentsamProposal({title:"Old proposal",text:"old"});
 assert.ok(messages.querySelector(".agentsam-proposal"));
 drawer.querySelector('[data-assistant-action="New chat"]').click();
 assert.equal(messages.querySelector(".agentsam-proposal"),null);
 assert.match(messages.textContent,/New chat ready/);
});
