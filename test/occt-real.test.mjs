import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { createOcctNativeProvider } from '../src/lib/cad/occt-native-provider.mjs';
const bin = process.env.AGENTSAM_OCCT_BIN;
test('real OCCT: create 10in box -> inspect STEP reopen (exact volume)', { skip: !bin && 'Set AGENTSAM_OCCT_BIN to a built agentsam-occt' }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'occt-real-'));
  const p = createOcctNativeProvider({ binary: bin });
  assert.equal((await p.doctor()).ready, true);
  const out = await p.execute('design_model_build', { kind: 'box', width: 10, depth: 10, height: 10, units: 'in' }, { artifactRoot: root });
  assert.deepEqual(out.dimensions_mm, [254, 254, 254]); assert.equal(out.volume_mm3, 16387064);
  const insp = await p.execute('design_model_inspect', { artifact: { path: out.artifact.path } }, { artifactRoot: root });
  assert.equal(insp.volume_mm3, 16387064);
});
