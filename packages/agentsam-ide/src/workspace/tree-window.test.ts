import assert from 'node:assert/strict';
import test from 'node:test';
import { workspaceTreeWindow } from './tree-window.ts';

test('large workspace explorer virtualizes and keeps scroll positions',()=>{
  const atTop=workspaceTreeWindow(20000,0,350,30,10);
  assert.equal(atTop.start,0);
  assert.ok(atTop.end<=24,'only visible rows + overscan render');
  assert.equal(atTop.total,600000);
  const middle=workspaceTreeWindow(20000,300000,350,30,10);
  assert.ok(middle.start>9500&&middle.end<10100);
  assert.equal(middle.top+((middle.end-middle.start)*30)+middle.bottom,600000);
  const end=workspaceTreeWindow(20000,599900,350,30,10);
  assert.equal(end.end,20000);
});
test('empty and malformed viewport inputs stay bounded',()=>{
  assert.deepEqual(workspaceTreeWindow(0,0,0),{start:0,end:0,top:0,bottom:0,total:0});
  const window=workspaceTreeWindow(10,NaN,Infinity);
  assert.equal(window.start,0);
  assert.ok(window.end<=10);
});
