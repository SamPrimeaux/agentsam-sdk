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
  assert.match(html, /MP4 encoding is not connected/);
  assert.doesNotMatch(html, /100%|Rendering 68%/);
});

test("legacy open=false tool entry points remain hidden", () => {
  assert.equal(renderToStaticMarkup(React.createElement(CoProToolSheet, {tool:"text",open:false,onClose:()=>{}})), "");
});
