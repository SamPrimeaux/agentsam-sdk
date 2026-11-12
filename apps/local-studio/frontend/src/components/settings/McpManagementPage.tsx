import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Pencil, Plus, RefreshCw, Server, Trash2, X } from "lucide-react";
import { isPackagedDesktop, invokeStudioService, resolveDesktopStudioAccountId } from "@/lib/desktop/tauri";

type McpRecord = {
  id: string; key: string; name: string; url: string | null; authType: string;
  enabled: boolean; health: string; lastCheckedAt?: number | null;
  managed: boolean; readOnly: boolean;
};
type McpResult = {ok?: boolean; error?: string; servers?: McpRecord[]};
type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
const PATH="/api/settings/mcps";

/** The same account-authorized Settings service on desktop and web. */
async function mcpRequest(method:Method="GET",id="",body?:Record<string,unknown>):Promise<McpResult>{
  const path=PATH+(id?"/"+encodeURIComponent(id):"");
  let status:number;
  let payload:McpResult;
  if(isPackagedDesktop()){
    const response=await invokeStudioService({
      operation:"settings", account_id:await resolveDesktopStudioAccountId(), path, method,
      ...(body===undefined?{}:{body}),
    });
    status=response.status;
    payload=JSON.parse(response.body||"{}");
  }else{
    const response=await fetch(path,{
      method,credentials:"same-origin",
      headers:{accept:"application/json",...(body?{"content-type":"application/json"}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    status=response.status;
    payload=await response.json().catch(()=>({ok:false,error:"mcp_invalid_response"}));
  }
  if(status>=400||payload.ok!==true)throw new Error(payload.error||"mcp_request_failed");
  return payload;
}

type Draft = { id?: string; name:string; url:string };
const NEW:Draft={name:"",url:""};
function errorMessage(error:unknown){
  const code=error instanceof Error?error.message:"";
  if(code==="mcp_validation_failed")return "Enter a name and a public HTTPS MCP server URL.";
  if(code==="mcp_not_found_or_protected")return "This server is protected or is no longer available.";
  if(code==="mcp_connection_required")return "Connect and authorize this server in Plugins before it can be activated.";
  return "The MCP registry could not save that change. Your existing connections were not modified.";
}

export function McpManagementPage(){
  const [servers,setServers]=useState<McpRecord[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [draft,setDraft]=useState<Draft|null>(null);
  const [busy,setBusy]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState<string|null>(null);
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try {
      const response=await mcpRequest();
      if(!Array.isArray(response.servers))throw Error("mcp_inventory_invalid");
      setServers(response.servers);
    }catch(e){setError(errorMessage(e));}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  const mutate=async(method:Method,id="",body?:Record<string,unknown>)=>{
    setBusy(true);setError("");
    try{
      await mcpRequest(method,id,body);
      const verified=await mcpRequest();
      if(!Array.isArray(verified.servers))throw Error("mcp_inventory_invalid");
      setServers(verified.servers);setDraft(null);setConfirmDelete(null);
    }catch(e){setError(errorMessage(e));}
    finally{setBusy(false);}
  };
  const save=()=>{
    if(!draft)return;
    const name=draft.name.trim(),url=draft.url.trim();
    if(name.length<2||!/^https:\/\//i.test(url)){setError("Enter a name and a public HTTPS URL.");return;}
    void mutate(draft.id?"PUT":"POST",draft.id||"",{name,url});
  };
  return <section className="mx-auto w-full max-w-4xl space-y-5 pb-12" aria-label="MCP server registry">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-5">
      <div>
        <h2 className="text-lg font-semibold text-foreground">MCP servers</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Registered platform servers and your own MCP endpoints. Connection authorization, installed plugins and executable tools remain separate verified states.</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" disabled={loading||busy} onClick={()=>void load()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-40"><RefreshCw size={14}/> Refresh</button>
        <button type="button" disabled={busy} onClick={()=>{setError("");setDraft({...NEW});}} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground px-3 text-xs font-medium text-background disabled:opacity-40"><Plus size={14}/> Add server</button>
      </div>
    </header>

    {error?<p role="alert" className="rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive">{error}</p>:null}
    {draft?<div className="space-y-4 rounded-lg border border-border bg-card p-5">
      <header className="flex items-center justify-between"><h3 className="font-semibold">{draft.id?"Edit MCP server":"Register MCP server"}</h3><button type="button" aria-label="Close editor" onClick={()=>setDraft(null)}><X size={16}/></button></header>
      <label className="block text-xs font-medium">Name
        <input autoFocus maxLength={120} value={draft.name} onChange={e=>setDraft(v=>v?{...v,name:e.target.value}:v)} placeholder="My MCP server" className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
      </label>
      <label className="block text-xs font-medium">Server endpoint (HTTPS)
        <input inputMode="url" value={draft.url} onChange={e=>setDraft(v=>v?{...v,url:e.target.value}:v)} placeholder="https://example.com/mcp" className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
      </label>
      <p className="text-xs text-muted-foreground">A new endpoint is registered disabled. This does not authenticate it or grant AgentSam permission to execute its tools. Configure authenticated integrations in Plugins.</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={()=>setDraft(null)} className="rounded-md border border-border px-3 py-2 text-xs">Cancel</button>
        <button type="button" disabled={busy} onClick={save} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-xs text-background disabled:opacity-40"><Check size={14}/> Save server</button>
      </div>
    </div>:null}

    <div className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80">
      {loading?<p className="p-5 text-sm text-muted-foreground">Checking MCP registry…</p>:null}
      {!loading&&!servers.length?<p className="p-5 text-sm text-muted-foreground">No MCP servers are registered. Add an HTTPS server to begin.</p>:null}
      {!loading&&servers.map(server=><div key={server.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <Server size={16} className="mt-1 shrink-0 text-muted-foreground"/>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm font-medium">{server.name}</strong>
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">{server.managed?"My server":"Platform"}</span>
              <span className="text-[11px] text-muted-foreground">{server.enabled?"Enabled":"Disabled"}</span>
            </div>
            <div className="break-all font-mono text-[11px] text-muted-foreground">{server.url||"Platform-managed endpoint"}</div>
            <div className="text-[11px] text-muted-foreground">Last recorded health: {server.health||"unknown"}{server.lastCheckedAt?" · "+new Date(server.lastCheckedAt*1000).toLocaleString():" · not checked"} · {server.authType||"none"} auth</div>
          </div>
        </div>
        {server.managed?<div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{server.enabled?"Active":"Not connected"}</span>
          <button type="button" aria-label={"Edit "+server.name} title="Edit" disabled={busy} onClick={()=>setDraft({id:server.id,name:server.name,url:server.url||""})} className="rounded-md p-2 hover:bg-muted"><Pencil size={14}/></button>
          {confirmDelete===server.id?<span className="flex items-center gap-1"><button type="button" disabled={busy} className="text-xs text-destructive" onClick={()=>void mutate("DELETE",server.id)}>Confirm delete</button><button type="button" className="text-xs" onClick={()=>setConfirmDelete(null)}>Cancel</button></span>:<button type="button" aria-label={"Delete "+server.name} disabled={busy} onClick={()=>setConfirmDelete(server.id)} className="rounded-md p-2 hover:bg-muted"><Trash2 size={14}/></button>}
        </div>:<a href="/settings/customize?view=plugins" className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-2 text-xs hover:bg-muted">Plugins <ExternalLink size={12}/></a>}
      </div>)}
    </div>
  </section>;
}
