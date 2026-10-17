import { useCallback, useEffect, useMemo, useState } from "react";
import { AreaChart, Icon, BasinOverviewPanel, LiveDiagnosticLogs } from "@inneranimalmedia/commerce-analytics";
import type {DiagnosticLogContext} from "@inneranimalmedia/commerce-analytics";
import { adminFetch } from "../../lib/api";
import type { RangeKey } from "../../lib/types";

type PageProps={range:RangeKey;tenant?:string};
type Operation={domain:string;operation:string;samples:number;failures:number;duration_ms:number|null};
type Failure={domain:string;operation:string;error_code:string|null;status:string;occurred_at:number};
type Timeline={bucket:string;events:number;failures:number};
type Basin={enabled:boolean;status:string;source:string;checkedAt:string|null;
  warehouses:Array<{id:string;label:string}>;pipelines:Array<{id:string;label:string;status:string;lastEventAt:string|null}>;
  catalogTables:Array<{name:string;namespace:string;rows:number|null}>};
type HealthResponse={
 ok:boolean;range:string;generatedAt:string;probeIntervalMinutes:number;
 edge:{available:boolean;reason?:string;source:string;requests:number|null;errors:number|null;
   errorRate:number|null;rpm:number|null;byStatus:Array<{status:string;requests:number}>};
 app:{available:boolean;reason?:string;source?:string;
   totals:{events:number;failures:number;successes:number;costUsd:number|null;avgDurationMs:number|null}|null;
   timeline:Timeline[];operations:Operation[];failures:Failure[];repository:Failure[];
   probes:{samples:number;passed:number;lastSeen:number|null}|null};
 basin:Basin;dataAvailability:{cloudflare:boolean;operations:boolean;basin:boolean};
};
const textOrDash=(value:number|null|undefined,digits=0)=>value==null||!Number.isFinite(value)?"—":value.toLocaleString(undefined,{maximumFractionDigits:digits});
function SmallMetric({label,value,unit,source,muted=false}:{label:string;value:number|null|undefined;unit:string;source:string;muted?:boolean}){
 return <div className="card" style={{padding:15,minWidth:0}}>
   <div className="muted text-xs" style={{letterSpacing:".05em",textTransform:"uppercase"}}>{label}</div>
   <div className="mono fw-600" style={{fontSize:"clamp(22px,2.3vw,29px)",marginTop:10,color:muted?"var(--muted)":"inherit"}}>
     {textOrDash(value,label==="Error rate"?2:label==="Operations latency"?1:label==="Estimated model cost"?4:0)}{value!=null&&<span className="muted text-xs" style={{paddingLeft:5}}>{unit}</span>}
   </div>
   <div className="muted text-xs" style={{marginTop:12}}>{value==null?"Unavailable · "+source:source}</div>
 </div>;
}
function NoSource({reason}:{reason:string}){
 return <div className="muted" style={{padding:"24px 16px",lineHeight:1.6}}>No verified telemetry for this panel. {reason}</div>;
}
function Status({ready,label}:{ready:boolean;label:string}){
 return <span className={ready?"pill good":"pill"}><span className={ready?"dot":"muted"} />{label}</span>;
}

declare global {
 interface Window {
  openAgentsamDrawer?:()=>void;
  initAgentsamDrawer?:()=>void;
  setAgentsamPageContext?:(context:Record<string,unknown>)=>void;
 }
}
let assistantLoader:Promise<void>|null=null;
function ensureAssistant():Promise<void>{
 if(window.initAgentsamDrawer && window.setAgentsamPageContext)return Promise.resolve();
 if(!assistantLoader){
  assistantLoader=new Promise<void>((resolve,reject)=>{
   const script=document.createElement("script");
   script.src="/admin/js/agentsam.js";
   script.onload=()=>window.initAgentsamDrawer?resolve():reject(new Error("Assistant module did not initialize"));
   script.onerror=()=>reject(new Error("Side Assistant assets could not be loaded"));
   document.head.append(script);
   if(!document.getElementById("health-agentsam-styles")){
    const css=document.createElement("link");css.id="health-agentsam-styles";
    css.rel="stylesheet";css.href="/admin/css/agentsam.css";document.head.append(css);
   }
  }).catch(error=>{assistantLoader=null;throw error;});
 }
 return assistantLoader;
}
export async function askAgentSamAboutLogs(logs:DiagnosticLogContext[],context:Record<string,unknown>){
 await ensureAssistant();
 window.initAgentsamDrawer?.();
 window.setAgentsamPageContext?.(context);
 window.openAgentsamDrawer?.();
 const input=document.getElementById("agentsam-input") as HTMLTextAreaElement|null;
 if(!input)throw new Error("Side Assistant composer unavailable");
 input.value="Help me diagnose these selected logs. Explain what failed, the likely cause, which service/code path is involved, and the safest next check. Do not execute repairs without my approval.";
 input.dispatchEvent(new Event("input",{bubbles:true}));
 input.focus();
 // Deliberately no sendAgentsamMessage call.
}

export default function HealthPage({range}:PageProps){
 useEffect(()=>()=>{window.setAgentsamPageContext?.({selected_logs:[],context_type:null,filters:null});},[]);
 const [data,setData]=useState<HealthResponse|null>(null);
 const [error,setError]=useState<string|null>(null);
 const [loading,setLoading]=useState(false);
 const [refresh,setRefresh]=useState(0);
 const [alertsOpen,setAlertsOpen]=useState(false);
 const reload=useCallback(()=>setRefresh(v=>v+1),[]);
 useEffect(()=>{
  const ctl=new AbortController();setLoading(true);setError(null);setData(null);
  adminFetch<HealthResponse>("/api/admin/analytics/health?range="+encodeURIComponent(range),{signal:ctl.signal})
   .then(value=>{if(!ctl.signal.aborted)setData(value)})
   .catch(err=>{if(!ctl.signal.aborted)setError(err?.message||"Health data unavailable")})
   .finally(()=>{if(!ctl.signal.aborted)setLoading(false)});
  return ()=>ctl.abort();
 },[range,refresh]);
 const timeline=useMemo(()=>data?.app.timeline||[],[data]);
 const hasTimeline=timeline.length>=2;
 const visibility=data?.edge.available||data?.app.available;
 const failureCount=data?.app.totals?.failures;
 const operations=data?.app.operations||[];
 const failures=data?.app.failures||[];
 const repo=data?.app.repository||[];
 const driftEvents=repo.filter(x=>/drift|contract|schema/i.test(x.error_code||""));
 const fetchLogs=useCallback(async (signal:AbortSignal)=>{
  return adminFetch<{ok:boolean;logs:DiagnosticLogContext[];source:string;error?:string}>(
   "/api/admin/analytics/logs/recent?window=180",{signal});
 },[]);

 return <>
  <div className="page-head">
   <div><h1 className="page-title">Health</h1>
    <p className="page-sub">Observed operations, Cloudflare traffic and repository quality · {range} · 30-minute health probe</p></div>
   <div className="page-actions">
    <Status ready={Boolean(data?.edge.available&&data?.app.available)} label={data?(data.edge.available&&data.app.available?"Sources connected":visibility?"Partial telemetry":"Telemetry unavailable"):"Loading sources"}/>
    <button type="button" className="btn" onClick={reload} disabled={loading}><Icon name="refresh" size={12}/> {loading?"Refreshing…":"Refresh"}</button>
    <button type="button" className="btn" aria-expanded={alertsOpen} onClick={()=>setAlertsOpen(v=>!v)}><Icon name="bell" size={12}/> Failures {failureCount!=null?"("+failureCount+")":""}</button>
   </div>
  </div>
  {error&&<div className="card" role="alert" style={{padding:14,color:"var(--bad)",marginBottom:14}}>{error}</div>}
  {data&&<div className="muted text-xs" style={{marginBottom:13}}>
    Sources: {data.edge.available?data.edge.source:"Cloudflare SQL unavailable"} · {data.app.available?data.app.source:"D1 analytics unavailable"}
    {" · "}D1 probe: {data.app.probes?.samples
      ? `${data.app.probes.passed}/${data.app.probes.samples} observed checks passed`
      : "waiting for 30-minute samples"}
    {" · "}refreshed {new Date(data.generatedAt).toLocaleTimeString()}
    <span style={{marginLeft:6}}>Probe pass rate is not a continuous uptime guarantee.</span>
  </div>}
  <div className="grid cols-4" style={{marginBottom:14}}>
   <SmallMetric label="HTTP requests" value={data?.edge.requests} unit="" source="Cloudflare HTTP requests"/>
   <SmallMetric label="Error rate" value={data?.edge.errorRate} unit="%" source="Cloudflare HTTP 5xx / requests"/>
   <SmallMetric label="Throughput" value={data?.edge.rpm} unit="req/min" source="Cloudflare requests / window"/>
   <SmallMetric label="AgentSam operations" value={data?.app.totals?.events} unit="" source="D1 account-scoped event ledger"/>
  </div>
  <div className="grid cols-12" style={{marginBottom:14}}>
   <div className="card span-8">
    <div className="card-head"><div><div className="card-title">Operation history</div>
     <div className="card-sub">Observed D1 events and failures — never generated series</div></div>
     <Status ready={Boolean(data?.app.available)} label={data?.app.available?"D1 events":"No source"}/>
    </div>
    <div className="card-body">
     {hasTimeline?<AreaChart height={240} xLabels={timeline.map(x=>x.bucket)}
      series={[{name:"Events",data:timeline.map(x=>Number(x.events)),color:"var(--accent)"},
        {name:"Failures",data:timeline.map(x=>Number(x.failures)),color:"var(--bad)"}]}/>:
      <NoSource reason={data?.app.available?"Two or more observed date buckets are required for a trend.":"D1 event ledger not accessible."}/>}
    </div>
   </div>
   <div className="card span-4">
    <div className="card-head"><div><div className="card-title">Operation quality</div><div className="card-sub">Actual events in selected period</div></div></div>
    <div className="card-body" style={{display:"grid",gap:14}}>
     <SmallMetric label="Failed operations" value={failureCount} unit="" source="D1 failed/error events"/>
     <SmallMetric label="Operations latency" value={data?.app.totals?.avgDurationMs} unit="ms mean" source="D1 measured operation duration"/>
     <SmallMetric label="Estimated model cost" value={data?.app.totals?.costUsd} unit="USD" source="D1 recorded estimate"/>
    </div>
   </div>
  </div>
  <div className="card" style={{marginBottom:14}}>
   <div className="card-head"><div><div className="card-title">Operations · top activity</div><div className="card-sub">Successful and failed user/application actions</div></div></div>
   {operations.length?<div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Domain</th><th>Operation</th><th className="num">Samples</th><th className="num">Failures</th><th className="num">Avg duration</th></tr></thead>
    <tbody>{operations.map((o,i)=><tr key={i}><td>{o.domain}</td><td>{o.operation}</td><td className="num mono">{o.samples}</td><td className="num mono">{o.failures}</td><td className="num mono">{o.duration_ms==null?"—":Math.round(o.duration_ms)+"ms"}</td></tr>)}</tbody></table></div>:
    <NoSource reason="No operation records in the selected range."/>}
  </div>
  <div className="grid cols-12" style={{marginBottom:14}}>
   <div className="card span-6">
    <div className="card-head"><div><div className="card-title">Repository quality · drift and contract errors</div>
      <div className="card-sub">GitHub/deployment events and classified schema/contract findings, if recorded</div></div></div>
    {repo.length?<div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Event</th><th>Code</th><th>Status</th></tr></thead>
    <tbody>{repo.map((x,i)=><tr key={i}><td>{x.operation}</td><td className="mono">{x.error_code||"—"}</td><td>{x.status}</td></tr>)}</tbody></table></div>:
    <NoSource reason="No repository-audit receipts ingested yet. CI package-authority findings will appear only after they are recorded as events."/>}
    <div className="card-foot"><span>Observed drift-classified events: {repo.length?driftEvents.length:"Not collected"}</span></div>
   </div>
   <div className="card span-6">
    <div className="card-head"><div><div className="card-title">Recent failures</div><div className="card-sub">Recorded error codes, not synthetic incidents</div></div>
     <Status ready={Boolean(data?.app.available)} label="D1 ledger"/></div>
    {failures.length?<div style={{overflowX:"auto"}}><table className="tbl"><thead><tr><th>Operation</th><th>Error code</th><th>When</th></tr></thead>
    <tbody>{failures.slice(0,10).map((x,i)=><tr key={i}><td>{x.operation}</td><td className="mono">{x.error_code||"Unclassified"}</td><td className="muted text-xs">{new Date(x.occurred_at*1000).toLocaleString()}</td></tr>)}</tbody></table></div>:
    <NoSource reason={data?.app.available?"No failures recorded in this period.":"No D1 event records available."}/>}
   </div>
  </div>
  {data?.basin.enabled&&<BasinOverviewPanel basin={data.basin}/>}
  {alertsOpen&&<section className="card" role="region" aria-label="Observed failures" style={{marginTop:14}}>
   <div className="card-head"><div><div className="card-title">Failure details</div><div className="card-sub">Recent recorded failures · {range}</div></div></div>
   {failures.length?failures.map((f,i)=><div key={i} style={{padding:"9px 15px",borderBottom:"1px solid var(--border)"}}>
     <strong>{f.operation}</strong> <span className="muted">· {f.domain} · {f.error_code||"No error code"} · {new Date(f.occurred_at*1000).toLocaleString()}</span></div>):
    <NoSource reason="No failure details have been recorded."/>}
  </section>}
  <div style={{marginTop:14}}>
  <LiveDiagnosticLogs range={range} poll={fetchLogs}
   onAsk={(selected,context)=>askAgentSamAboutLogs(selected,context as unknown as Record<string,unknown>)}/>
  </div>
 </>;
}
