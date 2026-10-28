/**
 * Account-first operational metrics from real D1 tool call receipts.
 * No workspace provisioning, no generated sample rows, and no raw command inputs.
 */
const validRange = new Set(['24h','7d','30d','90d','YTD','All']);
export function toolUsageSince(value, nowUnix=Math.floor(Date.now()/1000)) {
  const range=validRange.has(value)?value:'30d';
  if(range==='All')return 0;
  if(range==='YTD')return Math.floor(Date.UTC(new Date(nowUnix*1000).getUTCFullYear(),0,1)/1000);
  const seconds={ '24h':86400,'7d':604800,'30d':2592000,'90d':7776000 };
  return nowUnix-seconds[range];
}
const count=(v)=>Number.isFinite(Number(v))?Number(v):0;
const nullable=(v)=>v==null?null:count(v);
const ratio=(n,d)=>d>0?n/d:null;
/**
 * Caller must supply session-authenticated accountId. URL/query/body cannot
 * grant visibility into other accounts, even to a generic bridge-key caller.
 */
export async function queryAccountToolUsage(env,accountId,rawRange='30d'){
  if(!accountId || typeof accountId!=='string')throw new Error('authenticated_account_required');
  if(!env?.DB?.prepare)throw new Error('analytics_db_unavailable');
  const range=validRange.has(rawRange)?rawRange:'30d';
  const since=toolUsageSince(range);
  const q=(sql)=>env.DB.prepare(sql).bind(accountId,since);
  const [summary,byTool,byDay]=await Promise.all([
    q(`SELECT COUNT(*) calls,
       SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes,
       SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) failures,
       AVG(duration_ms) average_duration_ms,
       COALESCE(SUM(cost_usd),0) recorded_cost_usd,
       MIN(created_at_unix) first_event_unix,
       MAX(created_at_unix) last_event_unix
       FROM agentsam_tool_call_log WHERE account_id=? AND created_at_unix>=?`).first(),
    q(`SELECT tool_key,COUNT(*) calls,
       SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes,
       SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) failures,
       AVG(duration_ms) average_duration_ms,MAX(duration_ms) max_duration_ms,
       COALESCE(SUM(cache_hit),0) cache_hits,
       COALESCE(SUM(cost_usd),0) recorded_cost_usd
       FROM agentsam_tool_call_log WHERE account_id=? AND created_at_unix>=?
       GROUP BY tool_key ORDER BY calls DESC LIMIT 100`).all(),
    q(`SELECT strftime('%Y-%m-%d',created_at_unix,'unixepoch') day,
       COUNT(*) calls,SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) successes,
       SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) failures
       FROM agentsam_tool_call_log WHERE account_id=? AND created_at_unix>=?
       GROUP BY day ORDER BY day ASC LIMIT 365`).all(),
  ]);
  const calls=count(summary?.calls),successes=count(summary?.successes);
  return {
    schema:'agentsam.tool-usage.v2',range,generated_at:new Date().toISOString(),
    source:'agentsam_tool_call_log',scope:'authenticated_account',
    coverage:{first_event_unix:nullable(summary?.first_event_unix),
      last_event_unix:nullable(summary?.last_event_unix),measured_calls:calls},
    totals:{calls,successes,failures:count(summary?.failures),success_rate:ratio(successes,calls),
      average_duration_ms:nullable(summary?.average_duration_ms),
      recorded_cost_usd:count(summary?.recorded_cost_usd)},
    by_tool:(byTool?.results||[]).map(r=>({
      tool_key:String(r.tool_key||'unknown'),calls:count(r.calls),successes:count(r.successes),
      failures:count(r.failures),success_rate:ratio(count(r.successes),count(r.calls)),
      average_duration_ms:nullable(r.average_duration_ms),
      max_duration_ms:nullable(r.max_duration_ms),
      cache_hits:count(r.cache_hits),recorded_cost_usd:count(r.recorded_cost_usd),
    })),
    by_day:(byDay?.results||[]).map(r=>({day:String(r.day),
      calls:count(r.calls),successes:count(r.successes),failures:count(r.failures)})),
  };
}
