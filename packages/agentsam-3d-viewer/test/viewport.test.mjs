import test from 'node:test';
import assert from 'node:assert/strict';
import { createThreeViewport } from '../src/index.js';

class FakeElement {
  constructor(tag = 'div') { this.tagName = tag; this.style = {}; this.children = []; this.attributes = {}; this.clientWidth = 640; this.clientHeight = 360; this.parentNode = null; }
  get firstChild() { return this.children[0] ?? null; }
  appendChild(child) { child.parentNode?.removeChild?.(child); this.children.push(child); child.parentNode = this; return child; }
  insertBefore(child, before) { child.parentNode?.removeChild?.(child); const index = this.children.indexOf(before); this.children.splice(index < 0 ? this.children.length : index, 0, child); child.parentNode = this; return child; }
  removeChild(child) { const index = this.children.indexOf(child); if (index >= 0) this.children.splice(index, 1); child.parentNode = null; return child; }
  remove() { this.parentNode?.removeChild?.(this); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

function fakeRuntime() {
  const events = { render: 0, disposedRenderer: 0, disposedControls: 0, resize: 0 };
  class Vector3 { set(...values) { this.values = values; return this; } copy(value) { this.values = value.values; return this; } clone() { const out = new Vector3(); out.values = [...(this.values || [0,0,0])]; return out; } add(value) { this.values = this.values.map((v,i)=>v+(value.values?.[i]||0)); return this; } }
  class Scene { add() {} }
  class Color { constructor(value) { this.value = value; } }
  class Camera { constructor(fov, aspect, near, far) { this.fov=fov;this.aspect=aspect;this.near=near;this.far=far;this.position=new Vector3();this.up=new Vector3(); } updateProjectionMatrix() { events.resize += 1; } }
  class Renderer { constructor(options) { this.options=options;this.domElement=new FakeElement('canvas');this.shadowMap={};this.capabilities={getMaxAnisotropy:()=>8}; } setPixelRatio(value) { this.pixelRatio=value; } setSize(width,height,updateStyle) { this.size={width,height,updateStyle}; } render() { events.render += 1; } dispose() { events.disposedRenderer += 1; } }
  class Controls { constructor(camera,element) { this.camera=camera;this.element=element;this.target=new Vector3();this.cameraUpAtConstruction=[...(camera.up.values||[])]; } update() {} dispose() { events.disposedControls += 1; } }
  return { events, runtime: { THREE: {
    Scene, Color, PerspectiveCamera: Camera, WebGLRenderer: Renderer,
    SRGBColorSpace: 'srgb', NoToneMapping: 'none',
  }, OrbitControls: Controls } };
}

function withFakeDom(run) {
  const old = { document:globalThis.document, window:globalThis.window, ResizeObserver:globalThis.ResizeObserver, requestAnimationFrame:globalThis.requestAnimationFrame, cancelAnimationFrame:globalThis.cancelAnimationFrame };
  let observer;
  globalThis.document = { hidden:false, createElement:(tag)=>new FakeElement(tag) };
  globalThis.window = { devicePixelRatio:2, addEventListener(){}, removeEventListener(){} };
  globalThis.ResizeObserver = class { constructor(callback) { this.callback=callback;this.disconnected=false;observer=this; } observe() {} disconnect() { this.disconnected=true; } };
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  try { return run(() => observer); }
  finally {
    for (const [key,value] of Object.entries(old)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key]=value;
    }
  }
}

test('shared viewport reuses host runtime, keeps direct canvas behind overlays, resizes and disposes cleanly', () => withFakeDom((getObserver) => {
  const host = new FakeElement('main');
  const overlay = new FakeElement('div');
  host.appendChild(overlay);
  const { runtime, events } = fakeRuntime();
  const viewport = createThreeViewport(host, runtime, {
    wrapper:false, insertCanvasFirst:true, background:'transparent', preserveDrawingBuffer:true,
    autoRender:false, lights:false, minDistance:4, maxDistance:35,
  });
  assert.equal(viewport.root, host);
  assert.equal(host.children[0], viewport.renderer.domElement);
  assert.equal(host.children[1], overlay);
  assert.equal(viewport.renderer.options.preserveDrawingBuffer, true);
  assert.equal(viewport.controls.minDistance, 4);
  assert.equal(viewport.controls.maxDistance, 35);
  const observer = getObserver();
  observer.callback();
  assert.equal(viewport.renderer.size.width, 640);
  assert.equal(viewport.renderer.size.height, 360);
  viewport.dispose();
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0], overlay);
  assert.equal(events.disposedRenderer, 1);
  assert.equal(events.disposedControls, 1);
  assert.equal(observer.disconnected, true);
}));

test('shared viewport supports custom-camera hosts with no OrbitControls, and still resizes/disposes', () => withFakeDom((getObserver) => {
  const host = new FakeElement('section');
  const {runtime,events}=fakeRuntime();
  delete runtime.OrbitControls;
  const viewport=createThreeViewport(host,runtime,{wrapper:false,controls:false,lights:false,autoRender:false});
  assert.equal(viewport.controls,null);
  viewport.render();
  getObserver().callback();
  assert.equal(viewport.renderer.size.width,640);
  viewport.dispose();
  assert.equal(events.render,1);
  assert.equal(events.disposedRenderer,1);
  assert.equal(events.disposedControls,0);
  assert.equal(host.children.length,0);
}));

test('shared viewport establishes robotics Z-up camera before OrbitControls are constructed',()=>withFakeDom(()=>{
  const host=new FakeElement('div');
  const {runtime,events}=fakeRuntime();
  const viewport=createThreeViewport(host,runtime,{wrapper:false,autoRender:false,lights:false,cameraUp:[0,0,1],maxPixelRatio:2});
  assert.deepEqual(viewport.controls.cameraUpAtConstruction,[0,0,1]);
  assert.equal(viewport.renderer.pixelRatio,2);
  viewport.dispose();
  assert.equal(events.disposedControls,1);
}));
