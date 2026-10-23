import test from 'node:test';
import assert from 'node:assert/strict';
import { createOcctBrowserProvider } from '../src/browser.ts';

function fakeOcct() {
  const files = new Map();
  const calls = { radii: [], translations: [], mesh: 0, booleanBuilds: 0, paths: [] };
  class Sphere {
    constructor(radius) { calls.radii.push(radius); this.radius = radius; }
    Shape() { return { Moved(location) { calls.translations.push(location.transform.translation); return { kind: 'moved-cutter' }; } }; }
  }
  class Transform { SetTranslation_1(vector) { this.translation = vector.values; } }
  class Vector { constructor(...values) { this.values = values; } }
  class Location { constructor(transform) { this.transform = transform; } }
  class BooleanCut {
    constructor(outer, cutter) { this.outer = outer; this.cutter = cutter; }
    Build() { calls.booleanBuilds += 1; }
    IsDone() { return true; }
    Shape() { return { kind: 'boolean-result' }; }
  }
  class Writer {
    constructor(path) { this.path = path.value; calls.paths.push(this.path); }
    Perform_2() {
      files.set(this.path, Uint8Array.from([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 12, 0, 0, 0, 0]));
      return true;
    }
  }
  const shapeTool = { NewShape: () => ({}), SetShape() {} };
  const oc = {
    BRepPrimAPI_MakeSphere_1: Sphere,
    gp_Trsf_1: Transform,
    gp_Vec_4: Vector,
    TopLoc_Location_2: Location,
    BRepAlgoAPI_Cut_3: BooleanCut,
    BRepMesh_IncrementalMesh_2: class { constructor() { calls.mesh += 1; } },
    TDocStd_Document: class { Main() { return {}; } },
    TCollection_ExtendedString_1: class {},
    XCAFDoc_DocumentTool: { ShapeTool: () => ({ get: () => shapeTool }) },
    TCollection_AsciiString_2: class { constructor(value) { this.value = value; } },
    Handle_TDocStd_Document_2: class {},
    TColStd_IndexedDataMapOfStringString_1: class {},
    Message_ProgressRange_1: class {},
    RWGltf_CafWriter: Writer,
    FS: {
      readFile(path) { const bytes = files.get(path); if (!bytes) throw Error('missing_file'); return bytes.slice(); },
      unlink(path) { if (!files.delete(path)) throw Error('missing_file'); },
    },
  };
  return { oc, calls, files };
}

const params = { outerRadius: 1.2, cutterRadius: 0.78, cutX: 0.65, cutY: 0, cutZ: 0.2 };

test('browser OCCT loader is lazy and reused, Boolean results are GLB, and temporary files are removed', async () => {
  const fake = fakeOcct();
  let loads = 0;
  const provider = createOcctBrowserProvider({ loadEngine: async () => { loads += 1; return fake.oc; } });
  assert.equal(loads, 0);
  const first = await provider.createBooleanGLB(params);
  const second = await provider.createBooleanGLB(params);
  assert.equal(loads, 1);
  assert.equal(fake.calls.booleanBuilds, 2);
  assert.equal(fake.calls.mesh, 2);
  assert.deepEqual(fake.calls.radii, [1.2, 0.78, 1.2, 0.78]);
  assert.deepEqual(fake.calls.translations, [[0.65, 0, 0.2], [0.65, 0, 0.2]]);
  assert.equal(new TextDecoder().decode(new Uint8Array(first, 0, 4)), 'glTF');
  assert.equal(new TextDecoder().decode(new Uint8Array(second, 0, 4)), 'glTF');
  assert.notEqual(fake.calls.paths[0], fake.calls.paths[1]);
  assert.equal(fake.files.size, 0);
});

test('browser OCCT validates parameters before loading the kernel', async () => {
  let loads = 0;
  const provider = createOcctBrowserProvider({ loadEngine: async () => { loads += 1; return fakeOcct().oc; } });
  await assert.rejects(provider.createBooleanGLB({ ...params, outerRadius: 0 }), /occt_invalid_boolean_parameters/);
  assert.equal(loads, 0);
});

test('browser kernel failures can be retried instead of poisoning the cached promise', async () => {
  const fake = fakeOcct();
  let loads = 0;
  const provider = createOcctBrowserProvider({ loadEngine: async () => {
    loads += 1;
    if (loads === 1) throw Error('wasm_load_failed');
    return fake.oc;
  } });
  await assert.rejects(provider.createBooleanGLB(params), /wasm_load_failed/);
  await provider.createBooleanGLB(params);
  assert.equal(loads, 2);
});
