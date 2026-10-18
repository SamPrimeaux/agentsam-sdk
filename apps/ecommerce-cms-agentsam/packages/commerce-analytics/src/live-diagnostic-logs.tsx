import "./live-diagnostic-logs.css";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {diagnosticContext,formatDiagnosticLog,normalizeDiagnosticLog} from "./diagnostic-log.js";
import type {DiagnosticLogContext} from "./diagnostic-log.js";

export type LiveLogsResponse={ok:boolean;logs:DiagnosticLogContext[];source:string;error?:string;generatedAt?:string};
export type LiveLogsProps={
  range:string;poll?: (signal:AbortSignal)=>Promise<LiveLogsResponse>;
  onAsk:(selected:DiagnosticLogContext[],context:ReturnType<typeof diagnosticContext>)=>void|Promise<void>;
};

const LOG_CAP=240;
const POLL_MS=8500;
/** Generic app-widget; no Cloudflare credentials, dialogs or assistant transport. */
export function LiveDiagnosticLogs({range,poll,onAsk}:LiveLogsProps){
 const [active,setActive]=useState(false);
 const [loading,setLoading]=useState(false);
 const [records,setRecords]=useState<DiagnosticLogContext[]>([]);
 const [source,setSource]=useState("Cloudflare Log Explorer");
 const [error,setError]=useState("");
 const [filter,setFilter]=useState<"all"|"error"|"warn">("all");
 const [search,setSearch]=useState("");
 const [selected,setSelected]=useState<string[]>([]);
 const [details,setDetails]=useState<string[]>([]);
 const [menu,setMenu]=useState<string|null>(null);
 const [copyMessage,setCopyMessage]=useState("");
 const ref=useRef<HTMLDivElement>(null);
 const anchor=useRef<string|null>(null);
 const stopped=useRef(false);
 const clearedIds=useRef(new Set<string>());
 const selectedIds=useMemo(()=>new Set(selected),[selected]);
 const visible=useMemo(()=>records.filter(r=>(filter==="all"||r.severity===filter)&&
   (!search||[r.message,r.service,r.route,r.errorCode,r.requestId,r.rayId].join(" ").toLowerCase().includes(search.toLowerCase()))),[records,filter,search]);
 const chosen=useMemo(()=>selected.length?visible.filter(r=>selectedIds.has(r.id)):visible,[visible,selected,selectedIds]);
 const stop=useCallback(()=>{
  stopped.current=true;setActive(false);setLoading(false);
 },[]);
 useEffect(()=>{
   if(!active||!poll)return;
   stopped.current=false;
   let disposed=false,controller:AbortController|null=null,timer:ReturnType<typeof setTimeout>|null=null;
   const loop=async()=>{
     if(disposed||stopped.current)return;
     controller=new AbortController();setLoading(true);
     try{
       const result=await poll(controller.signal);
       if(disposed||stopped.current)return;
       if(!result.ok)throw new Error(result.error||"Cloudflare logs unavailable");
       setSource(result.source);
       setError("");
       const incoming=(result.logs||[]).map(normalizeDiagnosticLog).filter(Boolean) as DiagnosticLogContext[];
       setRecords(existing=>{
         const unique=new Map(existing.map(x=>[x.id,x]));
         for(const row of incoming)if(!clearedIds.current.has(row.id))unique.set(row.id,row);
         return Array.from(unique.values()).sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,LOG_CAP);
       });
     }catch(err){
       if(disposed||stopped.current||controller?.signal.aborted)return;
       setError(err instanceof Error?err.message:"Logs unavailable");
       stopped.current=true;
       setActive(false); // a failed source must not become a fake "Live" status
     }finally{
       if(!disposed){setLoading(false);if(!stopped.current)timer=setTimeout(loop,POLL_MS);}
     }
   };
   void loop();
   const onVisibility=()=>{if(document.visibilityState==="hidden")stop();};
   document.addEventListener("visibilitychange",onVisibility);
   return ()=>{disposed=true;controller?.abort();if(timer)clearTimeout(timer);document.removeEventListener("visibilitychange",onVisibility);};
 },[active,poll,stop]);
 const choose=(event:React.MouseEvent,record:DiagnosticLogContext,index:number)=>{
   if(event.shiftKey&&anchor.current){
     const start=visible.findIndex(x=>x.id===anchor.current);
     if(start>=0){setSelected(visible.slice(Math.min(start,index),Math.max(start,index)+1).map(x=>x.id));return;}
   }
   anchor.current=record.id;
   if(event.metaKey||event.ctrlKey)setSelected(x=>x.includes(record.id)?x.filter(id=>id!==record.id):[...x,record.id]);
   else setSelected([record.id]);
 };
 const copy=async(items=chosen)=>{
   const printable=items.slice(0,LOG_CAP).map(formatDiagnosticLog).filter(Boolean).join("\n\n---\n\n");
   if(!printable)return;
   try{await navigator.clipboard.writeText(printable);setCopyMessage("Copied "+items.length+" sanitized logs");}
   catch{setCopyMessage("Clipboard unavailable; select the log text and copy.");}
 };
 const ask=(items=chosen)=>{
   const subset=items.slice(0,20);
   if(!subset.length)return;
   Promise.resolve().then(()=>onAsk(subset,diagnosticContext(subset,{range,level:filter,search})))
     .catch(()=>setCopyMessage("Side Assistant unavailable. Try opening it from the admin toolbar."));
 };
 const isDetails=(id:string)=>details.includes(id);
 const toggleDetails=(id:string)=>setDetails(x=>x.includes(id)?x.filter(y=>y!==id):[...x,id]);
 return <section className="card" aria-label="Live log stream" data-logs-running={active?"true":"false"}>
   <div className="card-head" style={{gap:10,flexWrap:"wrap"}}>
     <div><div className="card-title">Live logs</div>
       <div className="card-sub">Inspect Worker/application activity on demand · {source}</div></div>
     {!active?<button className="btn" type="button" disabled={!poll} onClick={()=>{clearedIds.current.clear();setError("");setActive(true);}}>
       Start live logs</button>:
      <div className="row gap-2"><span className="pill good" role="status">● Live</span>
        <button className="btn" type="button" onClick={stop} aria-label="Stop live logs">■ Stop</button></div>}
   </div>
   {!active&&!records.length&&!error&&
     <div className="muted" style={{padding:"24px 15px"}}>Log queries are off. Start live logs to inspect real Worker trace events; nothing runs in the background.</div>}
   {(active||records.length>0)&&<>
     <div className="row gap-2 live-log-controls" style={{padding:"7px 12px",flexWrap:"wrap"}}>
       <div className="row gap-1" role="group" aria-label="Filter log severity">
         {(["all","error","warn"] as const).map(level=>
           <button key={level} type="button" className={"btn"+(filter===level?" primary":"")}
            aria-pressed={filter===level} onClick={()=>{setFilter(level);setSelected([]);}}>
            {level==="all"?"All":level==="error"?"Errors":"Warnings"}</button>)}
       </div>
       <input aria-label="Search live logs" placeholder="Search logs…" value={search} maxLength={120}
         onChange={e=>{setSearch(e.target.value);setSelected([]);}}
         style={{flex:"1 1 130px",minWidth:0,maxWidth:290,padding:"7px 9px",border:"1px solid var(--line-soft)",
           borderRadius:7,background:"var(--bg-2)",color:"var(--fg)"}}/>
       <span className="muted text-xs">{selected.length?selected.length+" selected":visible.length+" visible"}</span>
     </div>
     <div className="live-log-terminal" ref={ref} aria-label="Selectable Worker logs" role="region" tabIndex={0}>
       {visible.length===0?<div className="live-log-empty">{loading?"Reading Cloudflare logs…":"No logs in this view. Check filter, source, and collection permissions."}</div>:
        visible.map((log,index)=>
         <div key={log.id} className={"live-log-line"+(selectedIds.has(log.id)?" is-selected":"")} data-log-id={log.id}>
           <button type="button" className="live-log-row"
             aria-pressed={selectedIds.has(log.id)} onClick={e=>choose(e,log,index)}>
             <span className="live-log-time">{new Date(log.timestamp).toLocaleTimeString()}</span>
             <span className={"live-log-level is-"+log.severity}>{log.severity.toUpperCase()}</span>
             <span className="live-log-service">{log.service}</span>
             <span className="live-log-message">{log.message}</span>
             {log.status!=null&&<span className="live-log-status">{log.status}</span>}
             {log.durationMs!=null&&<span className="live-log-duration">{log.durationMs}ms</span>}
           </button>
           <button type="button" className="live-log-more" aria-label={"Actions for "+log.service+" log"}
             aria-expanded={menu===log.id} onClick={()=>setMenu(menu===log.id?null:log.id)}>⋯</button>
           {menu===log.id&&<div className="live-log-row-actions">
             <button type="button" onClick={()=>{void copy([log]);setMenu(null);}}>Copy</button>
             <button type="button" onClick={()=>{ask([log]);setMenu(null);}}>Ask AgentSam</button>
             <button type="button" onClick={()=>{toggleDetails(log.id);setMenu(null);}}>View details</button>
           </div>}
           {isDetails(log.id)&&<pre className="live-log-details">{formatDiagnosticLog(log)}</pre>}
         </div>)}
     </div>
     <div className="row gap-2" style={{padding:"10px 12px",justifyContent:"flex-end",flexWrap:"wrap"}}>
       <span className="muted text-xs" style={{marginRight:"auto"}}>{loading?"Querying…":active?"Refreshes every 8.5s while open":"Paused"} · click / shift-click rows</span>
       <button className="btn" type="button" disabled={!chosen.length} onClick={()=>void copy()}>Copy</button>
       <button className="btn" type="button" disabled={!chosen.length} onClick={()=>ask()}>Ask AgentSam</button>
       <button className="btn" type="button" onClick={()=>{for(const r of records)clearedIds.current.add(r.id);setRecords([]);setSelected([]);setDetails([]);setMenu(null);}}>Clear</button>
     </div>
   </>}
   {error&&<div className="muted" role="alert" style={{padding:"8px 12px",color:"var(--bad)"}}>
     {error}. Connect a Cloudflare Logs Read token and enable the workers_trace_events Log Explorer dataset.
   </div>}
   {copyMessage&&<div className="muted text-xs" role="status" style={{padding:"0 12px 10px"}}>{copyMessage}</div>}
 </section>;
}
