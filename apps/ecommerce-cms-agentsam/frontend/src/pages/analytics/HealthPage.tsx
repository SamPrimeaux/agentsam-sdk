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
 ok:boolean;range:string;generatedAt:string;probeIntervalMinutes:number|null;
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
 return <div className="card health-metric">
   <div className="muted text-xs health-metric-label">{label}</div>
   <div className={"mono fw-600 health-metric-value"+(muted?" is-muted":"")}>
     {textOrDash(value,label==="Error rate"?2:label==="Operations latency"?1:label==="Estimated model cost"?4:0)}{value!=null&&<span className="muted text-xs health-metric-unit">{unit}</span>}
   </div>
   <div className="muted text-xs health-metric-source">{value==null?"Unavailable · "+source:source}</div>
 </div>;
}
function NoSource({reason}:{reason:string}){
 return <div className="muted health-no-source">No verified telemetry for this panel. {reason}</div>;
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
  adminFetch<HealthResponse>("/api/analytics/health?range="+encodeURIComponent(range),{signal:ctl.signal})
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
   "/api/analytics/logs/recent?window=180",{signal});
 },[]);

 return <section className="analytics-health">
  <div className="page-head health-head">
   <div><h1 className="page-title">Health</h1>
    <p className="page-sub">Account-scoped operations, Cloudflare traffic and repository quality · {range}</p></div>
   <div className="page-actions health-actions">
    <Status ready={Boolean(data?.edge.available&&data?.app.available)} label={data?(data.edge.available&&data.app.available?"Sources connected":visibility?"Partial telemetry":"Telemetry unavailable"):"Loading sources"}/>
    <button type="button" className="btn" onClick={reload} disabled={loading}><Icon name="refresh" size={12}/> {loading?"Refreshing…":"Refresh"}</button>
    <button type="button" className="btn" aria-expanded={alertsOpen} onClick={()=>setAlertsOpen(v=>!v)}><Icon name="bell" size={12}/> Failures {failureCount!=null?"("+failureCount+")":""}</button>
   </div>
  </div>
  {error&&<div className="card health-error" role="alert">{error}</div>}
  {data&&<div className="muted text-xs health-source-line">
    Sources: {data.edge.available?data.edge.source:
      ["cloudflare_authorization_required","cloudflare_reconnect_required","cloudflare_account_selection_required","cloudflare_permission_denied"].includes(data.edge.reason||"")
        ?"Cloudflare needs reauthorization for HTTP Analytics and read-only Basin access"
        :data.edge.reason==="cloudflare_analytics_retention_limit"
          ?"Cloudflare adaptive HTTP history is limited to 31 days; select 30d or less"
          :"Cloudflare HTTP analytics unavailable"} · {data.app.available?data.app.source:"D1 analytics unavailable"}
    {["cloudflare_authorization_required","cloudflare_reconnect_required","cloudflare_account_selection_required","cloudflare_permission_denied"].includes(data.edge.reason||"")&&
      <> · <a href="/api/connections/cloudflare/start?capabilities=cloudflare.perm.account-analytics%2Ccloudflare.basin.read&return_to=%2Fadmin%2Fanalytics%2Fhealth">Reconnect Cloudflare</a></>}
    {" · "}D1 probe: {data.app.probes?.samples
      ? `${data.app.probes.passed}/${data.app.probes.samples} observed checks passed`
      : "No scheduled health-probe events are recorded"}
    {" · "}refreshed {new Date(data.generatedAt).toLocaleTimeString()}
    <span>Recorded D1 events are not a continuous uptime guarantee.</span>
  </div>}
  <div className="grid cols-4 health-metrics health-section-space">
   <SmallMetric label="HTTP requests" value={data?.edge.requests} unit="" source="Cloudflare HTTP requests"/>
   <SmallMetric label="Error rate" value={data?.edge.errorRate} unit="%" source="Cloudflare HTTP 5xx / requests"/>
   <SmallMetric label="Throughput" value={data?.edge.rpm} unit="req/min" source="Cloudflare requests / window"/>
   <SmallMetric label="AgentSam operations" value={data?.app.totals?.events} unit="" source="Account-scoped D1 event and tool-call ledgers"/>
  </div>
  <div className="grid cols-12 health-columns health-columns--primary health-section-space">
   <div className="card span-8 health-chart-panel">
    <div className="card-head"><div><div className="card-title">Operation history</div>
     <div className="card-sub">Observed D1 events and tool calls — never generated series</div></div>
     <Status ready={Boolean(data?.app.available)} label={data?.app.available?"D1 events":"No source"}/>
    </div>
    <div className="card-body">
     {hasTimeline?<AreaChart height={240} xLabels={timeline.map(x=>x.bucket)}
      series={[{name:"Events",data:timeline.map(x=>Number(x.events)),color:"var(--accent)"},
        {name:"Failures",data:timeline.map(x=>Number(x.failures)),color:"var(--bad)"}]}/>:
      <NoSource reason={data?.app.available?"Two or more observed date buckets are required for a trend.":"Account-scoped D1 event and tool-call ledgers are not accessible."}/>}
    </div>
   </div>
   <div className="card span-4 health-quality-panel">
    <div className="card-head"><div><div className="card-title">Operation quality</div><div className="card-sub">Actual events in selected period</div></div></div>
    <div className="card-body health-quality-grid">
     <SmallMetric label="Failed operations" value={failureCount} unit="" source="D1 event and tool-call failures"/>
     <SmallMetric label="Operations latency" value={data?.app.totals?.avgDurationMs} unit="ms mean" source="D1 and tool-call measured duration"/>
     <SmallMetric label="Estimated model cost" value={data?.app.totals?.costUsd} unit="USD" source="D1 and tool-call recorded cost estimate"/>
    </div>
   </div>
  </div>
  <div className="card health-operations-panel health-section-space">
   <div className="card-head"><div><div className="card-title">Operations · top activity</div><div className="card-sub">Successful and failed user/application actions</div></div></div>
   {operations.length?<>
    <div className="health-table-scroll" role="region" aria-label="Operations table" tabIndex={0}>
     <table className="tbl"><thead><tr><th>Domain</th><th>Operation</th><th className="num">Samples</th><th className="num">Failures</th><th className="num">Avg duration</th></tr></thead>
      <tbody>{operations.map((o,i)=><tr key={i}><td>{o.domain}</td><td>{o.operation}</td><td className="num mono">{o.samples}</td><td className="num mono">{o.failures}</td><td className="num mono">{o.duration_ms==null?"—":Math.round(o.duration_ms)+"ms"}</td></tr>)}</tbody>
     </table>
    </div>
    <div className="health-mobile-records" role="list" aria-label="Operations">
     {operations.map((o,i)=><article className="health-mobile-record" role="listitem" key={i}>
       <div className="health-record-title">{o.operation}</div>
       <div className="health-record-muted">{o.domain}</div>
       <div className="health-record-stats">
        <span><strong>{o.samples.toLocaleString()}</strong><small>Calls</small></span>
        <span><strong>{o.failures.toLocaleString()}</strong><small>Failed</small></span>
        <span><strong>{o.duration_ms==null?"—":Math.round(o.duration_ms)+"ms"}</strong><small>Avg time</small></span>
       </div>
      </article>)}
    </div>
   </>:<NoSource reason="No operation records in the selected range."/>}
  </div>
  <div className="grid cols-12 health-columns health-columns--secondary health-section-space">
   <div className="card span-6">
    <div className="card-head"><div><div className="card-title">Repository quality · drift and contract errors</div>
      <div className="card-sub">GitHub/deployment events and classified schema/contract findings, if recorded</div></div></div>
    {repo.length?<>
     <div className="health-table-scroll" role="region" aria-label="Repository quality table" tabIndex={0}>
      <table className="tbl"><thead><tr><th>Event</th><th>Code</th><th>Status</th></tr></thead>
       <tbody>{repo.map((x,i)=><tr key={i}><td>{x.operation}</td><td className="mono">{x.error_code||"—"}</td><td>{x.status}</td></tr>)}</tbody>
      </table>
     </div>
     <div className="health-mobile-records" role="list" aria-label="Repository events">
      {repo.map((x,i)=><article className="health-mobile-record" role="listitem" key={i}>
       <div className="health-record-title">{x.operation}</div>
       <div className="health-record-muted">{x.error_code||"No error code"} · {x.status}</div>
      </article>)}
     </div>
    </>:<NoSource reason="No repository-audit receipts ingested yet. CI package-authority findings will appear only after they are recorded as events."/>}
    <div className="card-foot"><span>Observed drift-classified events: {repo.length?driftEvents.length:"Not collected"}</span></div>
   </div>
   <div className="card span-6">
    <div className="card-head"><div><div className="card-title">Recent failures</div><div className="card-sub">Recorded error codes, not synthetic incidents</div></div>
     <Status ready={Boolean(data?.app.available)} label="D1 ledger"/></div>
    {failures.length?<>
     <div className="health-table-scroll" role="region" aria-label="Recent failures table" tabIndex={0}>
      <table className="tbl"><thead><tr><th>Operation</th><th>Error code</th><th>When</th></tr></thead>
       <tbody>{failures.slice(0,10).map((x,i)=><tr key={i}><td>{x.operation}</td><td className="mono">{x.error_code||"Unclassified"}</td><td className="muted text-xs">{new Date(x.occurred_at*1000).toLocaleString()}</td></tr>)}</tbody>
      </table>
     </div>
     <div className="health-mobile-records" role="list" aria-label="Recent failures">
      {failures.slice(0,10).map((x,i)=><article className="health-mobile-record" role="listitem" key={i}>
       <div className="health-record-title">{x.operation}</div>
       <div className="health-record-muted">{x.error_code||"Unclassified"}</div>
       <div className="health-record-time">{new Date(x.occurred_at*1000).toLocaleString()}</div>
      </article>)}
     </div>
    </>:<NoSource reason={data?.app.available?"No failures recorded in this period.":"No D1 event records available."}/>}
   </div>
  </div>
  {data?.basin.enabled&&<BasinOverviewPanel basin={data.basin}/>}
  {alertsOpen&&<section className="card health-failure-details" role="region" aria-label="Observed failures">
   <div className="card-head"><div><div className="card-title">Failure details</div><div className="card-sub">Recent recorded failures · {range}</div></div></div>
   {failures.length?failures.map((f,i)=><div key={i} className="health-failure-detail">
     <strong>{f.operation}</strong> <span className="muted">· {f.domain} · {f.error_code||"No error code"} · {new Date(f.occurred_at*1000).toLocaleString()}</span></div>):
    <NoSource reason="No failure details have been recorded."/>}
  </section>}
  <div className="health-logs">
  <LiveDiagnosticLogs range={range} poll={fetchLogs}
   onAsk={(selected,context)=>askAgentSamAboutLogs(selected,context as unknown as Record<string,unknown>)}/>
  </div>
 </section>;
}
