/**
 * FNF host adapter: reads the existing account-scoped D1 AgentSam event ledger
 * and Cloudflare Analytics SQL Worker binding. No synthetic operational data.
 * Reusable contracts/query orchestration belong to agentsam-analytics and the
 * Cloudflare connector; this file supplies tenant/resource configuration.
 */
import { requireApplicationAccountId } from "../lib/account-context.js";
import { trackAgentSamEvent } from "../agentsam/analytics.js";

const ranges = { "24h":86400, "7d":604800, "30d":2592000, "90d":7776000 };
const number = (v) => v == null || !Number.isFinite(Number(v)) ? null : Number(v);
const unavailable = (reason) => ({ available:false,reason });
function safeRange(range) {
  return Object.prototype.hasOwnProperty.call(ranges,range) ? range : "30d";
}
export function normalizeHealthRange(input, now = Date.now()) {
  const range = safeRange(input);
  const seconds = range === "90d" ? ranges["90d"] : ranges[range];
  return { range, since:Math.floor(now/1000)-seconds, start:new Date(now-seconds*1000).toISOString() };
}
async function ledger(env, since) {
  if (!env.DB?.prepare) return { ...unavailable("d1_not_bound"), totals:null,timeline:[],operations:[],failures:[],repository:[],probes:null };
  try {
    const results = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) AS events,
        SUM(CASE WHEN status = 'failed' OR event_type = 'error' THEN 1 ELSE 0 END) AS failures,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successes,
        COALESCE(SUM(estimated_cost_usd),0) AS cost_usd,
        ROUND(AVG(CASE WHEN duration_ms > 0 THEN duration_ms END),2) AS avg_duration_ms
        FROM agentsam_analytics WHERE account_id = ? AND created_at_unix >= ?`).bind(requireApplicationAccountId(),since).first(),
      env.DB.prepare(`SELECT date_key AS bucket, COUNT(*) AS events,
        SUM(CASE WHEN status='failed' OR event_type='error' THEN 1 ELSE 0 END) AS failures
        FROM agentsam_analytics WHERE account_id=? AND created_at_unix>=?
        GROUP BY date_key ORDER BY date_key ASC LIMIT 100`).bind(requireApplicationAccountId(),since).all(),
      env.DB.prepare(`SELECT COALESCE(operation,event_name) AS operation, event_type AS domain, COUNT(*) AS samples,
        SUM(CASE WHEN status='failed' OR event_type='error' THEN 1 ELSE 0 END) AS failures,
        AVG(duration_ms) AS duration_ms
        FROM agentsam_analytics WHERE account_id=? AND created_at_unix>=?
        GROUP BY event_type, COALESCE(operation,event_name) ORDER BY samples DESC LIMIT 12`).bind(requireApplicationAccountId(),since).all(),
      env.DB.prepare(`SELECT event_type AS domain, COALESCE(operation,event_name) AS operation,
        error_code, status, created_at_unix AS occurred_at
        FROM agentsam_analytics WHERE account_id=? AND created_at_unix>=?
          AND (status='failed' OR event_type='error')
        ORDER BY created_at_unix DESC LIMIT 15`).bind(requireApplicationAccountId(),since).all(),
      env.DB.prepare(`SELECT COALESCE(operation,event_name) AS operation, error_code, status,
        created_at_unix AS occurred_at
        FROM agentsam_analytics WHERE account_id=? AND created_at_unix>=?
          AND (event_type='github' OR event_type='deployment' OR error_code LIKE '%drift%'
          OR error_code LIKE '%schema%' OR error_code LIKE '%contract%')
        ORDER BY created_at_unix DESC LIMIT 20`).bind(requireApplicationAccountId(),since).all(),
      env.DB.prepare(`SELECT COUNT(*) AS samples,
        SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS passed,
        MAX(created_at_unix) AS last_seen
        FROM agentsam_analytics WHERE account_id=? AND created_at_unix>=?
        AND event_name='health.probe'`).bind(requireApplicationAccountId(),since).first(),
    ]);
    return {
      available:true,reason:null,source:"D1 agentsam_analytics",
      totals:{events:number(results[0]?.events)??0,failures:number(results[0]?.failures)??0,
        successes:number(results[0]?.successes)??0,costUsd:number(results[0]?.cost_usd),
        avgDurationMs:number(results[0]?.avg_duration_ms)},
      timeline:results[1]?.results||[],operations:results[2]?.results||[],
      failures:results[3]?.results||[],repository:results[4]?.results||[],
      probes:{samples:number(results[5]?.samples)??0,passed:number(results[5]?.passed)??0,
        lastSeen:number(results[5]?.last_seen)},
    };
  } catch (err) {
    return {...unavailable("analytics_ledger_unavailable"),totals:null,timeline:[],operations:[],failures:[],repository:[],probes:null};
  }
}
async function cloudflare(env, start, seconds) {
  if (typeof env.ANALYTICS_SQL?.query !== 'function')
    return {...unavailable("analytics_sql_binding_not_configured"),source:"Cloudflare Analytics SQL",requests:null,errors:null,errorRate:null,rpm:null,byStatus:[]};
  try {
    // Account scope comes from Analytics SQL Worker binding; hostname filters
    // the app on accounts where additional sites/apps are also hosted.
    const result=await env.ANALYTICS_SQL.query({
      query:`SELECT edgeResponseStatus AS status, COUNT(*) AS requests
        FROM events.httpRequests
        WHERE timestamp >= $start AND clientRequestHTTPHost IN ($host, $www)
        GROUP BY edgeResponseStatus ORDER BY requests DESC LIMIT 100`,
      params:{start,host:"fuelnfreetime.com",www:"www.fuelnfreetime.com"},
    });
    const rows=Array.isArray(result?.data)?result.data:null;
    if(!rows)throw new Error("analytics_sql_invalid_response");
    const total=rows.reduce((n,r)=>n+(number(r.requests)||0),0);
    const errors=rows.reduce((n,r)=>n+(Number(r.status)>=500?(number(r.requests)||0):0),0);
    return {available:true,reason:null,source:"Cloudflare Analytics SQL · events.httpRequests",
      requests:total,errors,errorRate:total?100*errors/total:null,rpm:total/(seconds/60),
      byStatus:rows.map(r=>({status:String(r.status),requests:number(r.requests)||0})),
      sampled:true};
  } catch (error) {
    return {...unavailable("cloudflare_analytics_query_unavailable"),source:"Cloudflare Analytics SQL",
      requests:null,errors:null,errorRate:null,rpm:null,byStatus:[]};
  }
}
async function basin(env) {
  // Basin isn't an Analytics SQL binding. An installed provider/host adapter
  // must resolve access and supply query/discovery; never invent warehouses.
  const adapter=env.BASIN_OVERVIEW_ADAPTER;
  if(typeof adapter?.inspect === "function"){
    try{
      const found=await adapter.inspect({accountId:requireApplicationAccountId()});
      if(found?.authorized === true) {
        return {enabled:true,status:"connected",source:"Cloudflare Basin provider discovery",
          warehouses:Array.isArray(found.warehouses)?found.warehouses:[],
          pipelines:Array.isArray(found.pipelines)?found.pipelines:[],
          catalogTables:Array.isArray(found.catalogTables)?found.catalogTables:[],
          checkedAt:new Date().toISOString()};
      }
      return {enabled:true,status:"permission_required",source:"provider discovery",warehouses:[],pipelines:[],catalogTables:[],checkedAt:null};
    }catch{return {enabled:true,status:"error",source:"provider discovery",warehouses:[],pipelines:[],catalogTables:[],checkedAt:null};}
  }
  // Configured without a live adapter may be displayed as setup-required,
  // but must never report a connected warehouse or made-up tables.
  if(env.BASIN_WAREHOUSE)return {enabled:true,status:"permission_required",source:"Basin configuration",warehouses:[],pipelines:[],catalogTables:[],checkedAt:null};
  // A connected installation is *not* proof that its Basin-specific API
  // permissions are sufficient. Show the capability, never fabricate resources.
  if (env.DB?.prepare) {
    try {
      const plugin=await env.DB.prepare(
        "SELECT plugin_key, setup_status FROM agentsam_plugins WHERE account_id=? AND is_enabled=1 AND (plugin_key LIKE '%basin%' OR provider_key LIKE '%basin%') LIMIT 1"
      ).bind(requireApplicationAccountId()).first();
      if (plugin) return {enabled:true,status:"permission_required",source:"AgentSam integration installation",
        warehouses:[],pipelines:[],catalogTables:[],checkedAt:null};
    } catch { /* plugin registry not deployed; absence is not connectivity */ }
  }
  return {enabled:false,status:"unavailable",source:"not configured",warehouses:[],pipelines:[],catalogTables:[],checkedAt:null};
}
export async function getHealthAnalytics(env, rawRange="30d") {
  const {range,since,start}=normalizeHealthRange(rawRange);
  const seconds=ranges[range];
  const [app,edge,lake]=await Promise.all([ledger(env,since),cloudflare(env,start,seconds),basin(env)]);
  return {ok:true,range,generatedAt:new Date().toISOString(),probeIntervalMinutes:30,
    edge,app,basin:lake,origin:{edge:edge.source,app:app.source||"D1 agentsam_analytics"},
    dataAvailability:{cloudflare:edge.available,operations:app.available,basin:lake.status==="connected"}};
}

/**
 * 30-minute Cron health check. It records actual Worker/D1 availability, not
 * a simulated uptime percentage. This uses the existing event ledger.
 */
export async function recordScheduledHealthProbe(env) {
  const started=Date.now();
  let ok=false;
  let reason=null;
  try{
    if(!env.DB?.prepare)throw new Error("db_not_bound");
    const row=await env.DB.prepare("SELECT 1 AS alive").first();
    ok=row?.alive===1;
    if(!ok)reason="d1_ping_failed";
  }catch{reason="d1_probe_failed";}
  await trackAgentSamEvent(env,{
    event_type:"cloudflare",event_name:"health.probe",operation:"health.probe",
    status:ok?"success":"failed",source:"scheduled_probe",
    duration_ms:Date.now()-started,
    error_code:reason,
    metadata:{interval_minutes:30,checked_binding:"DB"},
  });
  return {ok,source:"D1 health probe",elapsedMs:Date.now()-started};
}
