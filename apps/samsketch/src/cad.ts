/* Browser-side OCC authoring, loaded only on explicit CAD generation.
   A generated GLB is used by the regular Three.js showcase renderer.
   Never load the CAD WASM on marketing-page entry. */
import wasmUrl from "opencascade.js/dist/opencascade.full.wasm?url";

let engine: Promise<any> | null = null;
async function openCad(): Promise<any> {
  if (!engine) engine = import("opencascade.js/dist/opencascade.full.js").then(async m => {
    const oc = await m.default({ locateFile: (name: string) => name.endsWith(".wasm") ? wasmUrl : name });
    return oc;
  }).catch(e => { engine = null; throw e; });
  return engine;
}
export type CadParameters = { outerRadius:number; cutterRadius:number; cutX:number; cutY:number; cutZ:number; };
export async function createBooleanGLB(parameters:CadParameters): Promise<ArrayBuffer> {
  const oc=await openCad();
  const { outerRadius,cutterRadius,cutX,cutY,cutZ }=parameters;
  const outer=new oc.BRepPrimAPI_MakeSphere_1(outerRadius);
  const cutter=new oc.BRepPrimAPI_MakeSphere_1(cutterRadius);
  const transform=new oc.gp_Trsf_1();
  transform.SetTranslation_1(new oc.gp_Vec_4(cutX,cutY,cutZ));
  const location=new oc.TopLoc_Location_2(transform);
  const cutterShape=cutter.Shape().Moved(location,false);
  const operation=new oc.BRepAlgoAPI_Cut_3(outer.Shape(),cutterShape,new oc.Message_ProgressRange_1());
  operation.Build(new oc.Message_ProgressRange_1());
  if (operation.IsDone && !operation.IsDone()) throw Error("OpenCascade Boolean subtraction failed");
  const shape=operation.Shape();
  new oc.BRepMesh_IncrementalMesh_2(shape,0.05,false,0.15,false);
  const document=new oc.TDocStd_Document(new oc.TCollection_ExtendedString_1());
  const shapeTool=oc.XCAFDoc_DocumentTool.ShapeTool(document.Main()).get();
  shapeTool.SetShape(shapeTool.NewShape(),shape);
  const filename="/showcase-cut.glb";
  const writer=new oc.RWGltf_CafWriter(new oc.TCollection_AsciiString_2(filename),true);
  const ok=writer.Perform_2(new oc.Handle_TDocStd_Document_2(document),new oc.TColStd_IndexedDataMapOfStringString_1(),new oc.Message_ProgressRange_1());
  if(ok===false) throw Error("OpenCascade GLB export failed");
  const bytes=oc.FS.readFile(filename,{encoding:"binary"}) as Uint8Array;
  return new Uint8Array(bytes).buffer;
}
