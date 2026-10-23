/**
 * Browser OCCT adapter. Hosts inject the OpenCascade.js loader so each app can
 * resolve its own WASM asset URL and keep the 50 MB kernel out of initial loads.
 * All Boolean and GLB-export logic lives here rather than in each app.
 */
export type CadParameters = {
  outerRadius: number;
  cutterRadius: number;
  cutX: number;
  cutY: number;
  cutZ: number;
};

export type OcctBrowserRuntime = Record<string, any>;
export type OcctBrowserLoader = () => Promise<OcctBrowserRuntime>;

export function createOcctBrowserProvider({ loadEngine }: { loadEngine: OcctBrowserLoader }) {
  if (typeof loadEngine !== 'function') throw new Error('occt_browser_loader_required');
  let engine: Promise<OcctBrowserRuntime> | null = null;
  let outputSequence = 0;

  async function openCad(): Promise<OcctBrowserRuntime> {
    if (!engine) {
      engine = Promise.resolve().then(loadEngine).catch(error => {
        engine = null;
        throw error;
      });
    }
    return engine;
  }

  async function createBooleanGLB(parameters: CadParameters): Promise<ArrayBuffer> {
    const { outerRadius, cutterRadius, cutX, cutY, cutZ } = parameters;
    if (![outerRadius, cutterRadius, cutX, cutY, cutZ].every(Number.isFinite) || outerRadius <= 0 || cutterRadius <= 0) {
      throw new Error('occt_invalid_boolean_parameters');
    }

    const oc = await openCad();
    const outer = new oc.BRepPrimAPI_MakeSphere_1(outerRadius);
    const cutter = new oc.BRepPrimAPI_MakeSphere_1(cutterRadius);
    const transform = new oc.gp_Trsf_1();
    transform.SetTranslation_1(new oc.gp_Vec_4(cutX, cutY, cutZ));
    const location = new oc.TopLoc_Location_2(transform);
    const cutterShape = cutter.Shape().Moved(location, false);
    const operation = new oc.BRepAlgoAPI_Cut_3(
      outer.Shape(), cutterShape, new oc.Message_ProgressRange_1(),
    );
    operation.Build(new oc.Message_ProgressRange_1());
    if (typeof operation.IsDone === 'function' && !operation.IsDone()) {
      throw new Error('occt_boolean_cut_failed');
    }

    const shape = operation.Shape();
    new oc.BRepMesh_IncrementalMesh_2(shape, 0.05, false, 0.15, false);
    const document = new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
    const shapeTool = oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()).get();
    shapeTool.SetShape(shapeTool.NewShape(), shape);

    // Unique names prevent overlapping export calls from overwriting each other in WASM FS.
    const filename = `/agentsam-occt-${++outputSequence}.glb`;
    try {
      const writer = new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2(filename), true);
      const ok = writer.Perform_2(
        new oc.Handle_TDocStd_Document_2(document),
        new oc.TColStd_IndexedDataMapOfStringString_1(),
        new oc.Message_ProgressRange_1(),
      );
      if (ok === false) throw new Error('occt_glb_export_failed');
      const raw = oc.FS.readFile(filename, { encoding: 'binary' }) as Uint8Array;
      const bytes = Uint8Array.from(raw);
      if (bytes.length < 12 || bytes[0] !== 0x67 || bytes[1] !== 0x6c || bytes[2] !== 0x54 || bytes[3] !== 0x46) {
        throw new Error('occt_glb_export_invalid');
      }
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } finally {
      try { oc.FS.unlink(filename); } catch { /* Preserve the primary geometry/export error. */ }
    }
  }

  async function doctor() {
    try {
      await openCad();
      return { engine: 'occt', available: true, ready: true, execution_lane: 'browser-wasm' };
    } catch (error) {
      return { engine: 'occt', available: false, ready: false,
        reason: error instanceof Error ? error.message : 'occt_browser_kernel_unavailable',
        execution_lane: 'browser-wasm' };
    }
  }

  return { createBooleanGLB, doctor };
}
