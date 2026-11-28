import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("Side Stage dock preference and tab order are part of the existing persisted Work store", async () => {
  const store = await read("frontend/src/lib/work/store.ts");
  const layout = await read("frontend/src/lib/work/side-stage-layout.ts");
  assert.match(layout, /export type SideDock = "auto" \| "left" \| "right"/);
  assert.match(store, /sideDock: normalizeSideDock\(raw\?\.sideDock\)/);
  assert.match(store, /setSideDock: \(sideDock\) => set\(\{ sideDock \}\)/);
  assert.match(store, /reorderSideTab: \(id, targetId\) => set\(/);
  assert.match(store, /reorderSideTabs\(s\.sideTabs, id, targetId\)/);
  assert.match(store, /sideDock: s\.sideDock/);
});

test("Side Stage tabs support native drag-and-drop and keyboard reordering", async () => {
  const stage = await read("frontend/src/components/workbench/side-stage.tsx");
  assert.match(stage, /draggable=\{visibleTabs\.length > 1\}/);
  assert.match(stage, /onDragStart=\{\(event\) => handleTabDragStart/);
  assert.match(stage, /onDragOver=\{/);
  assert.match(stage, /onDrop=\{\(event\) => handleTabDrop/);
  assert.match(stage, /event\.altKey/);
  assert.match(stage, /reorderSideTab\(item\.id, target\.id\)/);
  assert.match(stage, /data-drop-target=/);
});

test("Side Stage layout can dock left or right while retaining resize and full-view controls", async () => {
  const page = await read("frontend/agentsam/AgentSamPage.tsx");
  const stage = await read("frontend/src/components/workbench/side-stage.tsx");
  const css = await read("frontend/agentsam/shell.css");
  assert.match(page, /state\.sideDock === 'auto'/);
  assert.match(page, /is-side-stage-first/);
  assert.match(page, /onDockChange=\{\(dock\) => state\.setSideDock\(dock\)\}/);
  assert.match(page, /agentsam\.studio\.agentPanelWidth/);
  assert.match(stage, /Move Side Stage to/);
  assert.match(stage, /Expand to full view/);
  assert.match(stage, /Close Side Stage/);
  assert.match(css, /\.agentsam-workspace\.is-side-stage-first/);
});

test("Work project selection no longer competes with the global breadcrumb slot", async () => {
  const page = await read("frontend/agentsam/AgentSamPage.tsx");
  const leadingStart = page.indexOf("const leadingControls =");
  const actionsStart = page.indexOf("const headerActions =", leadingStart);
  const layoutStart = page.indexOf("return <div className=\"agentsam-page-layout", actionsStart);
  assert.ok(leadingStart >= 0 && actionsStart > leadingStart && layoutStart > actionsStart);
  assert.doesNotMatch(page.slice(leadingStart, actionsStart), /WorkProjectSelect/);
  assert.match(page.slice(actionsStart, layoutStart), /WorkProjectSelect/);
});
