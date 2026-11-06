import type { DesignWorkspaceAdapter, DesignWorkspaceSnapshot, DesignSelection } from "../../../../../packages/agentsam-contracts/src/design-workspace";
import type { ProjectState } from "@inneranimalmedia/agentsam-cad-shared";
import { loadHostedProject, saveHostedProject, canEditHostedCadSelection, type CadHostedSelection } from "./hosted-project-source";
export interface CadWorkspaceEngine {
  project():ProjectState;
  hosted():CadHostedSelection|null;
  selection():DesignSelection[];
  load(value:CadHostedSelection):void;
  select(target:DesignSelection|null):void;
  update(value:ProjectState):void;
}
const hash=async(value:unknown)=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,"0")).join("");
const vector=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(x=>typeof x==="number"&&Number.isFinite(x)&&Math.abs(x)<=100000);
export function patchCadSceneElement(project:ProjectState,id:string,payload:unknown):ProjectState {
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||!Object.keys(payload).length)throw new Error("design_patch_invalid");
  if(!project.sceneElements?.some(row=>row.id===id))throw new Error("cad_scene_element_required");
  for(const [key,value]of Object.entries(payload)){
    const valid=key==="offset"?vector(value):key==="rotation"?typeof value==="number"&&Number.isFinite(value)&&Math.abs(value)<=36000
      :key==="visible"?typeof value==="boolean":key==="color"?typeof value==="string"&&/^#[0-9a-f]{6}$/i.test(value)
      :key==="note"?typeof value==="string"&&value.length<=2000:key==="name"?typeof value==="string"&&!!value.trim()&&value.length<=512:false;
    if(!valid)throw new Error("design_patch_invalid");
  }
  return {...project,sceneElements:project.sceneElements.map(row=>row.id===id?{...row,...payload}:row)};
}
export function createCadDesignAdapter(engine:CadWorkspaceEngine):DesignWorkspaceAdapter {
  const savedHash=()=>engine.hosted()?.revision.documents[0]?.contentHash||engine.hosted()?.revision.models[0]?.contentHash||null;
  const snapshot=async(accountId:string):Promise<DesignWorkspaceSnapshot>=>{
    const hosted=engine.hosted(),project=engine.project(),revision=await hash(project);
    if(!hosted)throw new Error("cad_project_not_open");
    const writable=canEditHostedCadSelection(hosted);
    return {contract:"agentsam.design-workspace.v1",
      resource:{id:project.id,kind:"cad",appId:"cad-creator",title:project.name,href:"/cad?project="+encodeURIComponent(project.id),accountId,projectId:project.id},
      capabilities:["open","inspect","select","preview",...(writable?["modify","save"]:[])],
      revision,savedRevision:savedHash(),dirty:hosted.project?JSON.stringify(project)!==JSON.stringify(hosted.project):false,
      selection:engine.selection(),status:writable?"ready":"read-only"};
  };
  return {
    kind:"cad",
    async open(scope,id){
      const current=engine.hosted();
      const loaded=await loadHostedProject(id,current?.registry.project.id===id?current.revision.revision:undefined);
      if(current?.registry.project.id!==id){
        if(current?.project&&JSON.stringify(engine.project())!==JSON.stringify(current.project))throw new Error("design_unsaved_changes");
        engine.load(loaded);
      } else if((loaded.revision.documents[0]?.contentHash||loaded.revision.models[0]?.contentHash)!==savedHash())throw new Error("design_revision_conflict");
      return snapshot(scope.accountId);
    },
    async execute(_scope,operation){
      if(operation.resourceId!==engine.project().id)throw new Error("design_operation_resource_mismatch");
      const serialized=JSON.stringify(engine.project()),previousRevision=await hash(engine.project());
      if(serialized!==JSON.stringify(engine.project()))throw new Error("design_revision_conflict");
      if(["modify","save"].includes(operation.kind)&&operation.expectedRevision!==previousRevision)throw new Error("design_revision_conflict");
      const targets=[...(operation.selection||engine.selection())];
      if(operation.kind==="select"){
        if(targets.length>1)throw new Error("design_exact_selection_required");
        const target=targets[0];
        if(target&&!["sceneElements","walls","doors","windows","rooms","furniture","parametricObjects"].some(key=>(engine.project() as any)[key]?.some((row:any)=>row.id===target.id)))throw new Error("design_selection_not_found");
        engine.select(target||null);
      }else if(operation.kind==="modify"){
        if(!canEditHostedCadSelection(engine.hosted()))throw new Error("design_workspace_read_only");
        if(targets.length!==1)throw new Error("design_exact_selection_required");
        engine.update(patchCadSceneElement(engine.project(),targets[0].id,operation.payload));
      }else if(operation.kind==="save"){
        const hosted=engine.hosted();
        if(!hosted||!canEditHostedCadSelection(hosted))throw new Error("design_workspace_read_only");
        const receipt=await saveHostedProject(engine.project().id,engine.project(),hosted.revision.revision,fetch,savedHash()||undefined);
        if(!receipt.verified)throw new Error("design_save_not_confirmed");
        const saved=await loadHostedProject(engine.project().id,hosted.revision.revision==="current"?"current":receipt.revisionId);
        if(serialized!==JSON.stringify(engine.project()))throw new Error("design_changed_during_save_reopen_to_verify");
        engine.load(saved);
      }else if(!["inspect","preview"].includes(operation.kind))throw new Error("design_capability_unavailable");
      const revision=await hash(engine.project());
      return {operationId:operation.id,resourceId:operation.resourceId,kind:operation.kind,previousRevision,revision,affected:targets,status:operation.kind==="save"||operation.kind==="select"||revision!==previousRevision?"applied":"unchanged"};
    },
  };
}
