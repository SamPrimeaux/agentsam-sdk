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

test("color slider event values are captured before React state-updater callbacks", async () => {
  const {readFile} = await import("node:fs/promises");
  const src = await readFile(new URL("../src/tool-sheet.tsx", import.meta.url), "utf8");
  assert.match(src, /const nextValue = Number\(event\.currentTarget\.value\);/);
  assert.doesNotMatch(src, /setValues\(current\s*=>\s*\([^)]*event\.currentTarget/);
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
  assert.match(html,/aria-label="Animation duration"/);
  assert.match(html,/aria-label="Animation delay"/);
  assert.match(html,/aria-label="Animation amplitude"/);
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

test("Scene workspace exposes project-backed stage environment and its reset",async()=>{
  const {readFile} = await import("node:fs/promises");
  const source = await readFile(new URL("../src/creative-workspace.tsx",import.meta.url),"utf8");
  assert.match(source,/onEnvironmentChange/);
  for (const label of ["Stage background color","Stage ambient brightness","Stage fog color","Stage fog density","Show stage guide grid"]){
    assert.ok(source.includes(label),label);
  }
  assert.match(source,/Reset stage environment/);
});
