import test from 'node:test'; import assert from 'node:assert/strict';
import { createOcctNativeProvider } from '../../src/lib/cad/occt-native-provider.mjs';
test('OCCT unavailable on this machine fails closed, never fake-ready', async () => {
  const p = createOcctNativeProvider({ binary: '/nonexistent/agentsam-occt' });
  const d = await p.doctor();
  assert.equal(d.available, false); assert.equal(d.ready, false); assert.match(d.reason, /not_configured/);
  await assert.rejects(p.execute('design_model_build', { kind:'box', width:10, depth:10, height:10, units:'in' }, { artifactRoot:'/tmp' }), /not_configured|not_ready/);
});
test('OCCT inches convert to mm at boundary (10in cube = 254mm sides)', async () => {
  // fake process honoring the real receipt protocol proves conversion + STEP roundtrip math without a local OCCT install
  const run = async (_bin, args) => {
    if (args[0]==='--doctor') return { stdout: 'AGENTSAM_RESULT={"ok":true,"engine":"occt","version":"7.8","capabilities":["solid.box.create","solid.cut","solid.inspect.step","solid.export.step"]}' };
    if (args[0]==='--box') { const [w,d,h]=args.slice(1,4).map(Number); return { stdout: `AGENTSAM_RESULT={"ok":true,"engine":"occt","operation":"solid.box.create","volume_mm3":${w*d*h}}` }; }
    if (args[0]==='--inspect') return { stdout: 'AGENTSAM_RESULT={"ok":true,"engine":"occt","operation":"solid.inspect.step","volume_mm3":16387064}' };
    throw new Error('unexpected');
  };
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'occt-'));
  const p = createOcctNativeProvider({ binary: process.execPath, runProcess: async (...a) => { const r = await run(...a); if (a[1][0]==='--box') fs.writeFileSync(a[1].at(-1),'STEP'); return r; } });
  const out = await p.execute('design_model_build', { kind:'box', width:10, depth:10, height:10, units:'in' }, { artifactRoot: root });
  assert.deepEqual(out.dimensions_mm, [254,254,254]); assert.ok(Math.abs(out.volume_mm3 - 16387064) < 1);
});
