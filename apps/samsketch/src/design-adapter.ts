import type { DesignWorkspaceAdapter, DesignSelection, DesignWorkspaceSnapshot } from "../../../packages/agentsam-contracts/src/design-workspace";
import { openScene, createScene } from "./scene-api";
type Vector = [number,number,number];
type Item = {id:string;name:string;kind:string;position:Vector;rotation:Vector;scale:Vector;color:string;material:string;visible:boolean;partOverrides?:Record<string,Partial<Item>>};
type Scene = {version:1;name:string;brand:"agentsam"|"inneranimalmedia";chapter:number;items:Item[]};
export interface SketchEngine {
  document(): Scene;
  id(): string|null;
  savedHash(): string|null;
  selection(): DesignSelection[];
  parts(itemId:string): string[];
  load(id:string,hash:string,document:unknown): void;
  select(selection:DesignSelection[]): void;
  modify(itemId:string,partId:string|undefined,patch:Record<string,unknown>): void;
  undo():void;
  redo():void;
  save():Promise<void>;
}
export const documentRevision = async (value:unknown) => [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,"0")).join("");
const vector = (v:unknown) => Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==="number"&&Number.isFinite(x)&&Math.abs(x)<=100000);
export function validateSketchPatch(patch:unknown, part=false): asserts patch is Record<string,unknown> {
  if (!patch||typeof patch!=="object"||Array.isArray(patch)||!Object.keys(patch).length) throw new Error("design_patch_invalid");
  for (const [key,value] of Object.entries(patch)) {
    const valid = ["position","rotation","scale"].includes(key) ? vector(value)
      : key==="color" ? typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value)
      : key==="visible" ? typeof value==="boolean"
      : key==="name"&&!part ? typeof value==="string"&&!!value.trim()&&value.length<=160
      : key==="material"&&!part ? ["clay","metal","glass"].includes(String(value)) : false;
    if (!valid) throw new Error("design_patch_invalid");
  }
}
export function createSamSketchDesignAdapter(engine:SketchEngine):DesignWorkspaceAdapter {
  const snapshot = async (accountId:string):Promise<DesignWorkspaceSnapshot> => ({
    contract:"agentsam.design-workspace.v1",
    resource:{id:engine.id()!,kind:"sketch",appId:"samsketch",title:engine.document().name,href:"/samsketch?document="+encodeURIComponent(engine.id()!),accountId},
    capabilities:["open","create","select","inspect","modify","preview","save","undo","redo"],
    revision:await documentRevision(engine.document()),savedRevision:engine.savedHash(),
    dirty:await documentRevision(engine.document())!==engine.savedHash(),selection:engine.selection(),status:"ready",
  });
  return {
    kind:"sketch",
    async open(scope,id) {
      const result=await openScene(id); // Server proves ownership even for an already-open scene.
      if(engine.id()!==id) {
        if(engine.id()&&await documentRevision(engine.document())!==engine.savedHash())throw new Error("design_unsaved_changes");
        engine.load(id,result.scene.contentHash,result.document);
      } else if(engine.savedHash()!==result.scene.contentHash)throw new Error("design_revision_conflict");
      return snapshot(scope.accountId);
    },
    async createDraft(scope,request) {
      if(request.projectId||request.siteId)throw new Error("sketch_creation_scope_unsupported");
      if(engine.id()&&await documentRevision(engine.document())!==engine.savedHash())throw new Error("design_unsaved_changes");
      const id="sketch_"+(await documentRevision([scope.authUserId,request.idempotencyKey])).slice(0,40);
      const initial=request.initial as {name?:unknown}|undefined;
      const name=typeof initial?.name==="string"&&initial.name.trim()?initial.name.trim().slice(0,120):"Untitled scene";
      await createScene(id,{version:1,name,brand:"agentsam",chapter:0,items:[]});
      const result=await openScene(id);
      engine.load(id,result.scene.contentHash,result.document);
      return snapshot(scope.accountId);
    },
    async execute(_scope,operation) {
      if(operation.resourceId!==engine.id())throw new Error("design_operation_resource_mismatch");
      const serialized=JSON.stringify(engine.document());
      const previousRevision=await documentRevision(engine.document());
      if(serialized!==JSON.stringify(engine.document()))throw new Error("design_revision_conflict");
      if(["modify","save","undo","redo"].includes(operation.kind)&&operation.expectedRevision!==previousRevision)throw new Error("design_revision_conflict");
      const targets=[...(operation.selection||engine.selection())];
      for(const target of targets){
        const item=engine.document().items.find(row=>row.id===(target.parentId||target.id));
        if(!item||(target.parentId&&!engine.parts(item.id).includes(target.id)))throw new Error("design_selection_not_found");
      }
      if(operation.kind==="select")engine.select(targets);
      else if(operation.kind==="modify"){
        if(targets.length!==1)throw new Error("design_exact_selection_required");
        const target=targets[0],patch=operation.payload;
        validateSketchPatch(patch,!!target.parentId);
        engine.modify(target.parentId||target.id,target.parentId?target.id:undefined,patch);
      } else if(operation.kind==="save")await engine.save();
      else if(operation.kind==="undo")engine.undo();
      else if(operation.kind==="redo")engine.redo();
      else if(!["inspect","preview"].includes(operation.kind))throw new Error("design_capability_unavailable");
      const revision=await documentRevision(engine.document());
      return {operationId:operation.id,resourceId:operation.resourceId,kind:operation.kind,previousRevision,revision,
        status:revision===previousRevision&&operation.kind!=="select"&&operation.kind!=="save"?"unchanged":"applied",affected:targets};
    },
  };
}
