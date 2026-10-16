import test from 'node:test'; import assert from 'node:assert/strict';
import { openScadCompile } from '../src/lib/cad/openscad.js';
test('missing OpenSCAD never reports native success (throws or success:false)', async () => {
  let r = null, threw = false;
  try { r = await openScadCompile({ source: 'cube([10,10,10]);', openscadBin: '/nonexistent/openscad' }); } catch { threw = true; }
  assert.ok(threw || (r.success === false && r.verified === false && /openscad_native_unavailable/.test(r.error || '')));
});
test('real OpenSCAD compiles verifiable STL artifact', { skip: !process.env.AGENTSAM_TEST_OPENSCAD && 'set AGENTSAM_TEST_OPENSCAD=1' }, async () => {
  const src = 'width=60; difference(){ cube([width,30,10]); translate([30,15,-1]) cylinder(h=12,r=6,$fn=64); }';
  const r = await openScadCompile({ source: src, filename: 'bracket.stl' });
  assert.equal(r.success, true); assert.ok((r.artifactContent || '').includes('facet'));
});
