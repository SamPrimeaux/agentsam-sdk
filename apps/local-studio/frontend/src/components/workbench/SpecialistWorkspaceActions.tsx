import { useEffect, useRef, useState, type RefObject } from "react";
import { Save, Undo2, Redo2 } from "lucide-react";
import { DesignWorkspaceRegistry, createDesignWorkspaceFrameAdapter } from "@inneranimalmedia/agentsam-contracts";
import type { DesignWorkspaceOperation } from "@inneranimalmedia/agentsam-contracts";

/** Actual engine adapter controls. A missing/unsupported capability is never a clickable decoration. */
export function SpecialistWorkspaceActions({kind,frame,resourceId}:{
  kind:"sketch"|"cad";frame:RefObject<HTMLIFrameElement|null>;resourceId?:string|null;
}) {
  const binding=useRef<ReturnType<typeof createDesignWorkspaceFrameAdapter>|null>(null);
  const registry=useRef(new DesignWorkspaceRegistry());
  const [capabilities,setCapabilities]=useState<readonly string[]>([]);
  const [busy,setBusy]=useState(false),[status,setStatus]=useState("");
  useEffect(()=>{
    const transport=createDesignWorkspaceFrameAdapter(kind,()=>frame.current);
    const unregister=registry.current.register(transport.adapter);binding.current=transport;
    return()=>{binding.current=null;unregister();transport.dispose();};
  },[kind,frame]);
  useEffect(()=>{
    let active=true;setCapabilities([]);setStatus("");
    if(resourceId)void binding.current?.state().then(({snapshot})=>{
      if(active)setCapabilities(snapshot.capabilities);
    }).catch(error=>{if(active)setStatus(error.message);});
    return()=>{active=false;};
  },[resourceId]);
  const execute=async(operationKind:string)=>{
    if(busy||!binding.current)return;
    setBusy(true);setStatus("");
    try{
      const {scope,snapshot}=await binding.current.state();
      const operation:DesignWorkspaceOperation={id:crypto.randomUUID(),kind:operationKind,resourceId:snapshot.resource.id,expectedRevision:snapshot.revision,selection:snapshot.selection};
      const receipt=await registry.current.execute(scope,snapshot,operation);
      setStatus(operationKind==="save"?"Saved to your account":receipt.status==="unchanged"?"No changes":operationKind==="undo"?"Change undone":"Change restored");
      window.dispatchEvent(new CustomEvent("agentsam:design-receipt",{detail:receipt}));
    }catch(error){setStatus(error instanceof Error?error.message:"Workspace operation failed");}
    finally{setBusy(false);}
  };
  if(!resourceId)return null;
  return <div className="flex min-w-0 items-center gap-1" aria-label="Document actions">
    {([["undo",Undo2,"Undo"],["redo",Redo2,"Redo"],["save",Save,"Save"]] as const).filter(([action])=>capabilities.includes(action)).map(([action,Icon,label])=>
      <button key={action} type="button" title={label} aria-label={label} disabled={busy} onClick={()=>void execute(action)}
        className="rounded border border-border p-1.5 text-muted-foreground hover:bg-muted disabled:opacity-40"><Icon size={14}/></button>)}
    {status&&<span className="max-w-64 truncate px-2 text-[11px] text-muted-foreground" role="status" title={status}>{status}</span>}
  </div>;
}
