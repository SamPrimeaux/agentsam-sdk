import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {
  bounded, layoutModeFromContainer, normalizeWorkspaceLayout,
  DEFAULT_WORKSPACE_LAYOUT, CoProResizeHandle,
} from "../dist/workspace-layout.js";

test("container breakpoints respond to actual embedded width",()=>{
  assert.equal(layoutModeFromContainer(320),"mobile");
  assert.equal(layoutModeFromContainer(390),"mobile");
  assert.equal(layoutModeFromContainer(699),"mobile");
  assert.equal(layoutModeFromContainer(700),"compact");
  assert.equal(layoutModeFromContainer(1024),"compact");
  assert.equal(layoutModeFromContainer(1159),"compact");
  assert.equal(layoutModeFromContainer(1160),"wide");
  assert.equal(layoutModeFromContainer(1920),"wide");
});

test("persisted layout values are validated, bounded and unknown keys discarded",()=>{
  assert.deepEqual(normalizeWorkspaceLayout(null),DEFAULT_WORKSPACE_LAYOUT);
  const result=normalizeWorkspaceLayout({
    sourceWidth:30000,inspectorWidth:-100,timelineHeight:100000,
    sourceOpen:false,inspectorOpen:true,swapped:true,
    floating:"inject",floatX:-20,floatY:100000,sourceTool:"untrusted",inspectorTool:"untrusted",untrusted:"ignore",
  });
  assert.equal(result.sourceWidth,500);
  assert.equal(result.inspectorWidth,240);
  assert.equal(result.timelineHeight,550);
  assert.equal(result.sourceOpen,false);
  assert.equal(result.swapped,true);
  assert.equal(result.floating,null);
  assert.equal(result.sourceTool,"media");
  assert.equal(result.inspectorTool,"trim");
  assert.equal(result.floatX,0);
  assert.equal(result.floatY,1000);
  assert.equal("untrusted" in result,false);
});

test("resize semantics expose genuine keyboard-accessible separators",()=>{
  const html=renderToStaticMarkup(React.createElement(CoProResizeHandle,{
    label:"Resize timeline height",orientation:"horizontal",value:270,min:150,max:550,
    onDelta:()=>{},onReset:()=>{},
  }));
  assert.match(html,/role="separator"/);
  assert.match(html,/tabindex="0"/i);
  assert.match(html,/aria-label="Resize timeline height"/);
  assert.match(html,/aria-valuenow="270"/);
  assert.match(html,/aria-orientation="horizontal"/);
});

test("invalid width remains bounded and cannot produce NaN layout tracks",()=>{
  for(const value of [-Infinity,Infinity,NaN,-100,0,1000000]) {
    const width=bounded(value,220,500);
    assert.ok(Number.isFinite(width));
    assert.ok(width>=220&&width<=500);
  }
});
