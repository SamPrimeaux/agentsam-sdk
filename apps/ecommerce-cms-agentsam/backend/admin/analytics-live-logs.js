/**
 * On-demand Cloudflare Log Explorer Worker trace reader.
 * Never queried by cron, page load, or the Health KPI read model.
 * Cloudflare REST API is called only by authenticated operator request.
 */
import {normalizeDiagnosticLog} from "../../packages/commerce-analytics/src/diagnostic-log.js";

const SERVICE="fuelnfreetime";
const API="https://api.cloudflare.com/client/v4";
const bounded=(value,fallback=180)=>["120","180","300"].includes(String(value))?Number(value):fallback;
function readObject(raw){
 if(raw&&typeof raw==="object")return raw;
 if(typeof raw==="string"){try{const parsed=JSON.parse(raw);return parsed&&typeof parsed==="object"?parsed:{};}catch{}}
 return {};
}
function toMessage(x){
 if(typeof x==="string")return x;
 if(Array.isArray(x))return x.map(toMessage).join(" ");
 if(x&&typeof x==="object")return JSON.stringify(x);
 return String(x??"");
}
function workerEvent(row){
 const get=(...keys)=>{for(const key of keys)if(row[key]!=null)return row[key];return null;};
 const stamp=Number(get("eventtimestampms","EventTimestampMs"));
 const timestamp=Number.isFinite(stamp)&&stamp>0?new Date(stamp).toISOString():null;
 if(!timestamp)return [];
 const service=String(get("scriptname","ScriptName")||SERVICE).slice(0,90);
 const info=readObject(get("event","Event"));
 const request=readObject(info.request||info.Request);
 const route=request.url?String(request.url).split("?")[0].replace(/^https?:\/\/[^/]+/,""):request.pathname||"";
 const cpu=get("cputimems","CPUTimeMs"),wall=get("walltimems","WallTimeMs");
 const version=readObject(get("scriptversion","ScriptVersion"));
 const meta={event_type:String(get("eventtype","EventType")||""),worker:service,
   cpu_time_ms:Number(cpu)||0,wall_time_ms:Number(wall)||0,script_version:String(version.id||"")};
 const rawLogs=get("logs","Logs");
 const logs=Array.isArray(rawLogs)?rawLogs:typeof rawLogs==="string"?readObject(rawLogs):[];
 const entries=Array.isArray(logs)?logs:[];
 const base={source:"cloudflare-workers",service,timestamp,route,
   rayId:request.cf?.ray||request.rayId||request.headers?.["cf-ray"]||"",requestId:request.headers?.["x-request-id"]||"",
   durationMs:wall!=null?Number(wall):null,metadata:meta};
 const result=entries.slice(0,16).map((log)=>{
   const raw=typeof log==="object"&&log?log:{message:log};
   return normalizeDiagnosticLog({...base,severity:raw.level||raw.Level||"info",
     message:toMessage(raw.message??raw.Message??raw.data??""),timestamp:raw.timestamp||raw.Timestamp||timestamp});
 }).filter(Boolean);
 const exception=get("exceptions","Exceptions");
 if(Array.isArray(exception))for(const err of exception.slice(0,6)){
   result.push(normalizeDiagnosticLog({...base,severity:"error",message:toMessage(err.message||err.Message||err),
     errorCode:err.name||err.type||"worker_exception"}));
 }
 if(result.length===0){
   const outcome=String(get("outcome","Outcome")||"ok");
   result.push(normalizeDiagnosticLog({...base,severity:outcome==="ok"?"info":"error",
     message:"Worker invocation: "+outcome,errorCode:outcome==="ok"?"":outcome}));
 }
 return result.filter(Boolean);
}
export function normalizeWorkerTraceRows(rows){
 if(!Array.isArray(rows))return [];
 const logs=rows.slice(0,80).flatMap(workerEvent);
 const unique=new Map();
 for(const log of logs)unique.set(log.id,log);
 return [...unique.values()].sort((a,b)=>b.timestamp.localeCompare(a.timestamp)).slice(0,180);
}
export async function fetchCloudflareLiveLogs(env,{windowSeconds=180,fetchImpl=fetch,now=Date.now()}={}){
 const account=String(env.CLOUDFLARE_ACCOUNT_ID||"").trim();
 const token=String(env.CLOUDFLARE_API_TOKEN||"").trim();
 if(!/^[a-f0-9]{32}$/i.test(account)||!token)
   return {ok:false,status:424,error:"cloudflare_logs_credential_required",logs:[],source:"Cloudflare Log Explorer"};
 const duration=bounded(windowSeconds);
 const stamp=new Date(now-duration*1000);
 const date=stamp.toISOString().slice(0,10);
 // Values are constant/validated. No client-provided SQL, account, script or dataset.
 const sql="SELECT EventTimestampMs, ScriptName, Outcome, EventType, Event, Logs, Exceptions, CPUTimeMs, WallTimeMs, ScriptVersion"+
   " FROM workers_trace_events WHERE date >= '"+date+"'"+
   " AND ScriptName = '"+SERVICE+"'"+
   " AND EventTimestampMs >= "+Math.floor(stamp.getTime())+
   " ORDER BY EventTimestampMs DESC LIMIT 80";
 try{
   const res=await fetchImpl(API+"/accounts/"+account+"/logs/explorer/query/sql",{
     method:"POST",headers:{Authorization:"Bearer "+token,"content-type":"text/plain","accept":"application/json"},
     body:sql,signal:AbortSignal.timeout(9000),
   });
   if(!res.ok)return {ok:false,status:res.status===403?424:503,
     error:res.status===403?"cloudflare_logs_permission_required":"cloudflare_log_explorer_unavailable",logs:[],source:"Cloudflare Log Explorer"};
   const json=await res.json();
   if(!json?.success||!Array.isArray(json?.result))
     return {ok:false,status:424,error:"workers_trace_events_not_queryable",logs:[],source:"Cloudflare Log Explorer"};
   return {ok:true,source:"Cloudflare Log Explorer · workers_trace_events",logs:normalizeWorkerTraceRows(json.result),
     generatedAt:new Date(now).toISOString(),windowSeconds:duration};
 }catch{
   return {ok:false,status:503,error:"cloudflare_log_explorer_unavailable",logs:[],source:"Cloudflare Log Explorer"};
 }
}
