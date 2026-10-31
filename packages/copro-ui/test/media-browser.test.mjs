import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CoProMediaBrowser } from "../dist/media-browser.js";
import { CoProSystemIcon } from "../dist/system-icon.js";

const mediaItems = [
  { id:"asset:used", name:"dreamhouse-cut.mp4", kind:"video", url:"blob:used", durationUs:8_000_000, thumbnails:["https://assets.test/dreamhouse.jpg"] },
  { id:"asset:unused", name:"ambient-bed.wav", kind:"audio", url:"blob:audio", durationUs:12_000_000 },
];

const creativeAssets = [
  { id:"chapter-divider", category:"template", name:"Chapter Divider", group:"Editorial", durationUs:4_000_000, previewUrl:"https://assets.test/chapter.svg" },
  { id:"rise-in", category:"animation", name:"Rise In", durationUs:800_000, previewUrl:"https://assets.test/rise.svg" },
  { id:"cross-warp", category:"transition", name:"Cross Warp", previewUrl:"https://assets.test/warp.svg" },
  { id:"film-grain", category:"overlay", name:"Film Grain", previewUrl:"https://assets.test/grain.svg" },
  { id:"warm-film", category:"treatment", name:"Warm Film", previewUrl:"https://assets.test/warm.svg" },
  { id:"typewriter", category:"graphic", name:"Typewriter", previewUrl:"https://assets.test/type.svg" },
];

function render(section, overrides = {}) {
  return renderToStaticMarkup(React.createElement(CoProMediaBrowser, {
    section,
    mediaItems,
    projectMediaIds:new Set(["asset:used"]),
    creativeAssets,
    selectedClipId:"clip:1",
    onImportFiles:()=>{},
    onAddMedia:()=>{},
    onUseCreativeAsset:()=>{},
    onOpenCreativeTemplate:()=>{},
    ...overrides,
  }));
}

test("Import is a real multi-file dropzone with explicit supported media types", () => {
  const html = render("import");
  assert.ok(html.includes("Drop files here or browse"));
  assert.ok(html.includes('type="file"'));
  assert.ok(html.includes('multiple=""'));
  assert.ok(html.includes('accept="video/*,audio/*,image/*"'));
  assert.ok(html.includes("Originals stay intact"));
});

test("Media shows only source files referenced by the current project", () => {
  const html = render("media");
  assert.ok(html.includes("Media in this project"));
  assert.ok(html.includes("dreamhouse-cut.mp4"));
  assert.ok(!html.includes("ambient-bed.wav"));
  assert.ok(html.includes("Add to timeline"));
});

test("Yours shows all imported source media, including items not yet used in the project", () => {
  const html = render("yours");
  assert.ok(html.includes("Your media"));
  assert.ok(html.includes("dreamhouse-cut.mp4"));
  assert.ok(html.includes("ambient-bed.wav"));
});

test("Creative Library exposes all six catalog lanes with real preview artwork and counts", () => {
  const html = render("library");
  for (const label of ["Creative assets","All assets","Compositions","Motion","Transitions","Overlays","Looks","Graphics","Chapter Divider","Rise In","Cross Warp","Film Grain","Warm Film","Typewriter"]) {
    assert.ok(html.includes(label),label);
  }
  for (const src of ["chapter.svg","rise.svg","warp.svg","grain.svg","warm.svg","type.svg"]) {
    assert.ok(html.includes(src),src);
  }
  assert.ok(html.includes("6 ASSETS"));
});

test("media browser styles provide responsive catalog and import affordances", async () => {
  const { readFile } = await import("node:fs/promises");
  const css = await readFile(new URL("../styles/copro.css",import.meta.url),"utf8");
  assert.ok(css.includes(".mm-creative-library-grid"));
  assert.ok(css.includes(".mm-import-dropzone"));
  assert.ok(css.includes(".mm-media-browser-content"));
  assert.ok(css.includes(".copro-system-icon"));
  assert.ok(css.includes(".mm-media-wip-card"));
  assert.ok(css.includes("@media(max-width:759px)"));
});

test("Subprojects, Generate and Spaces remain discoverable as honest WIP surfaces", () => {
  const panels = [
    ["subprojects", "Compound clips", "ENGINE INTEGRATION"],
    ["generate", "Media generation", "PROVIDER CONNECTION"],
    ["spaces", "Connected spaces", "STORAGE CONNECTION"],
  ];
  for (const [section, title, status] of panels) {
    const html = render(section, { onNavigate: () => {} });
    assert.ok(html.includes(title), title);
    assert.ok(html.includes(status), status);
    assert.ok(html.includes("WIP"));
    assert.ok(html.includes("Browse") || html.includes("Use imported media"));
  }
});

test("canonical AgentSam SVG icon markup inherits the active UI color", () => {
  const markup = '<?xml version="1.0"?><svg id="icon-film" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 3h18"/></svg>';
  const html = renderToStaticMarkup(React.createElement(CoProSystemIcon, {
    name: "film",
    icons: { film: markup },
    size: 21,
  }));
  assert.ok(html.includes('class="copro-system-icon"'));
  assert.ok(html.includes('width="24"') && html.includes('stroke="currentColor"'));
  assert.ok(!html.includes('id="icon-film"'));
  assert.ok(!html.includes('<?xml'));
});
