import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoProToolPanel, CoProToolSheet } from "../dist/tool-sheet.js";

function render(tool, props = {}) {
  return renderToStaticMarkup(React.createElement(CoProToolPanel, {
    tool, onClose: () => {}, ...props,
  }));
}

test("editing tools render as an inline semantic region, not a modal", () => {
  const html = render("text");
  assert.match(html, /class="copro-tool-panel"/);
  assert.match(html, /EDITING TOOLS/);
  assert.match(html, /Add title to timeline/);
  assert.doesNotMatch(html, /aria-modal|copro-sheet-backdrop|role="dialog"/);
});

test("clip-specific panels explain missing selection instead of applying fake changes", () => {
  const html = render("effects");
  assert.match(html, /Select a clip/);
  assert.doesNotMatch(html, /aria-pressed="true"/);
  assert.doesNotMatch(html, /copro-effect-preview/);
});

test("selected clip gets real speed controls with labelled slider", () => {
  const html = render("speed", { hasSelectedClip:true, initialSpeed:1.5 });
  assert.match(html, /aria-label="Playback speed"/);
  assert.match(html, /1\.50×/);
  assert.match(html, /aria-pressed="true"/);
});

test("media panel shows a real local file picker and session media", () => {
  const html = render("media", {
    mediaItems:[{id:"asset:1",name:"verified-scene.webm",kind:"video",url:"blob:test",durationUs:5_000_000}],
  });
  assert.match(html, /type="file"/);
  assert.match(html, /verified-scene\.webm/);
  assert.match(html, /Import media/);
});

test("export panel offers a real portable project action, not simulated render progress", () => {
  const html = render("export", {onProjectExport:()=>{}});
  assert.match(html, /Download editable CoPro project/);
  assert.match(html, /Video export is unavailable/);
  assert.doesNotMatch(html, /100%|Rendering 68%/);
});

test("legacy open=false tool entry points remain hidden", () => {
  assert.equal(renderToStaticMarkup(React.createElement(CoProToolSheet, {tool:"text",open:false,onClose:()=>{}})), "");
});

test("selected clip adjustment sliders show persisted values and expose a real reset", () => {
  const html = render("adjust", {
    hasSelectedClip:true,
    adjustments:{exposure:1.5,contrast:25,saturation:125},
    onAdjustmentChange:()=>{},
  });
  assert.match(html, /aria-label="Exposure"/);
  assert.match(html, /value="1.5"/);
  assert.match(html, /value="125"/);
  assert.match(html, /Reset adjustments/);
  assert.doesNotMatch(html, /UI PREVIEW|Save look|Apply to selection/);
});

test("adjustments require a selected clip instead of silently editing ephemeral state", () => {
  const html = render("adjust");
  assert.match(html, /Select a clip/);
  assert.doesNotMatch(html, /aria-label="Exposure"/);
});

test("inspector sliders share a release-commit control instead of creating undo entries while dragging", async () => {
  const {readFile} = await import("node:fs/promises");
  const panel = await readFile(new URL("../src/tool-sheet.tsx", import.meta.url), "utf8");
  const controls = await readFile(new URL("../src/panel-controls.tsx", import.meta.url), "utf8");
  assert.match(panel, /import \{ CoProNumberControl, CoProRangeControl \}/);
  assert.match(panel, /onCommit=\{next=>onAdjustmentChange/);
  assert.match(controls, /onPointerUp=\{commit\}/);
  assert.match(controls, /onPointerCancel=\{cancel\}/);
  assert.match(controls, /onKeyUp=\{commit\}/);
  assert.match(controls, /committedRef/);
});

test("animation inspector exposes catalog motion presets and real timing controls", () => {
  const html=render("animation",{
    hasSelectedClip:true,
    currentMotion:"zoom-in",
    motionSettings:{id:"zoom-in",durationUs:1400000,delayUs:200000,amplitude:90},
    creativeAssets:[
      {id:"zoom-in",category:"animation",name:"Zoom · in",previewUrl:""},
      {id:"rise-in",category:"animation",name:"Rise · in",previewUrl:""}
    ],
    onMotionChange:()=>{},
    onMotionSettingsChange:()=>{},
  });
  assert.match(html,/Clip animation controls/);
  assert.match(html,/Zoom · in/);
  assert.match(html,/Rise · in/);
  assert.match(html,/aria-label="Duration \(seconds\)"/);
  assert.match(html,/aria-label="Delay \(seconds\)"/);
  assert.match(html,/aria-label="Distance \/ intensity"/);
  assert.doesNotMatch(html,/No animation/);
});

test("Adjust includes real tab controls and a frame-scope action", () => {
  const html=render("adjust",{hasSelectedClip:true,onAdjustmentChange:()=>{},adjustments:{exposure:.5}});
  for(const tab of ["Basic","Color","Curves","HSL","Scopes"]) assert.match(html,new RegExp(">"+tab+"</button>"));
  assert.match(html,/Reset adjustments/);
  assert.doesNotMatch(html,/UI PREVIEW/);
});

test("Video mask tab is backed by a clip callback and provider-only tools do not pretend to process",()=>{
  const html=render("video",{hasSelectedClip:true,mask:{shape:"circle",size:75,feather:5,invert:false},onMaskChange:()=>{}});
  assert.match(html,/Mask/);
  assert.match(html,/Transform/);
  assert.doesNotMatch(html,/Preview removal|Interface preview/);
});

test("the studio uses one project-backed stage look panel instead of a parallel legacy workspace",async()=>{
  const {readFile} = await import("node:fs/promises");
  const source = await readFile(new URL("../src/studio.tsx",import.meta.url),"utf8");
  assert.match(source,/CoProStageLookPanel/);
  assert.doesNotMatch(source,/CoProCreativeWorkspace/);
});

test("unconnected tracking and AI stylize tools do not expose pretend processing controls",()=>{
  for(const tool of ["tracking","ai-stylize"]){
    const html=render(tool,{hasSelectedClip:true});
    assert.match(html,/NOT CONNECTED/);
    assert.match(html,/No processing controls shown/);
    assert.doesNotMatch(html,/type="range"/);
  }
});

test("creative templates expose their editable fields and project image slot",()=>{
  const kinetic=render("text",{
    hasSelection:true,
    creativeScene:"kinetic-stack",
    creativeParameters:{title:"Build",subtitle:"Make room",label:"CHAPTER 01",words:["MAKE","ROOM"],accent:"#68dfc0",background:"#101819",backgroundMode:"transparent",foreground:"#f4f4e9"},
  });
  assert.match(kinetic,/Composition content/);
  assert.match(kinetic,/Words/);
  assert.match(kinetic,/MAKE/);
  assert.match(kinetic,/ROOM/);
  assert.match(kinetic,/Canvas background/);
  const lowerThird=render("text",{
    hasSelection:true,
    creativeScene:"lower-third",
    creativeParameters:{title:"Build",subtitle:"Make room",label:"CHAPTER 01",author:"Sam",media:"asset:creative-demo",accent:"#68dfc0",background:"#101819",backgroundMode:"transparent",foreground:"#f4f4e9"},
    mediaItems:[{id:"asset:photo-1",name:"Studio still.webp",kind:"image",url:"blob:photo"}],
  });
  assert.match(lowerThird,/Author \/ name/);
  assert.match(lowerThird,/Image source/);
  assert.match(lowerThird,/Studio still\.webp/);
});
