/** Account-owned project measurements, derived from recorded ledgers.
 * Legacy estimates are presented separately, never added to measured hours.
 */
const clean = v => String(v ?? '').trim();
const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;
const json = (data,status=200) => new Response(JSON.stringify(data),{
  status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}
});
export async function ownedProject(db,owner,id) {
  if(!clean(owner)||!clean(id)) return null;
  return db.prepare('SELECT id, tenant_id, name FROM projects WHERE id=? AND owner_user_id=? LIMIT 1')
    .bind(id,owner).first();
}
const elapsedExpression = "CASE WHEN source IN ('work_timer','manual') AND " +
  "started_at IS NOT NULL AND ended_at IS NOT NULL AND " +
  "ended_at >= started_at AND (ended_at-started_at) BETWEEN 0 AND 86400 " +
  "AND hours >= 0 THEN ended_at-started_at ELSE NULL END";

export async function readProjectMeasurements(db,owner,id,{authorized=false}={}) {
  if(!authorized && !await ownedProject(db,owner,id)) return null;
  const measured=await db.prepare(
    "SELECT COUNT("+elapsedExpression+") entries,COALESCE(SUM("+elapsedExpression+"),0) seconds " +
    "FROM time_entries WHERE project_id=?"
  ).bind(id).first();
  const excluded=await db.prepare(
     "SELECT COUNT(*) entries FROM time_entries WHERE project_id=? " +
    "AND ("+elapsedExpression+") IS NULL AND ended_at IS NOT NULL"
  ).bind(id).first();
  const active=await db.prepare(
    "SELECT id,started_at,description FROM time_entries WHERE project_id=? AND user_id=? " +
    "AND source='work_timer' AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1"
  ).bind(id,owner).first();
  const cost=await db.prepare(
    "SELECT COUNT(*) entries,SUM(amount) usd,SUM(total_tokens) tokens FROM project_costs " +
     "WHERE CAST(project_id AS TEXT)=? AND COALESCE(currency,'USD')='USD'"
  ).bind(id).first();
  let legacy=null;
  try {legacy=await db.prepare(
    "SELECT legacy_hours,legacy_cost,legacy_tokens FROM project_metrics WHERE project_id=?"
  ).bind(id).first();}catch{/* Migration not yet applied: do not invent legacy data. */}
  const seconds=num(measured?.seconds), entries=num(measured?.entries), costCount=num(cost?.entries);
  return {
    projectId:id,
    measured:{hours:Math.round(seconds/36)/100,seconds,entries,available:entries>0,
      excludedEntries:num(excluded?.entries),
      basis:'completed_manual_or_work_timer_with_valid_elapsed_duration'},
    activeTimer:active?{id:clean(active.id),startedAt:num(active.started_at),label:clean(active.description)}:null,
    costs:costCount?{currency:'USD',recordedTotal:Math.round(num(cost.usd)*100)/100,
      lineItems:costCount,apiTokens:num(cost.tokens)}:null,
    legacy:legacy&&legacy.legacy_hours!==null?{hours:num(legacy.legacy_hours),
      cost:num(legacy.legacy_cost),tokens:num(legacy.legacy_tokens),status:'unverified_legacy'}:null,
  };
}
export async function refreshProjectMetrics(db,owner,id) {
  const m=await readProjectMeasurements(db,owner,id);
  if(!m)return null;
  await db.prepare(
    "INSERT INTO project_metrics (project_id,total_hours,total_cost,api_tokens_used,time_entry_count,cost_entry_count,last_updated,measurement_status) " +
    "VALUES(?,?,?,?,?,?,datetime('now'),?) ON CONFLICT(project_id) DO UPDATE SET " +
    "total_hours=excluded.total_hours,total_cost=excluded.total_cost,api_tokens_used=excluded.api_tokens_used," +
    "time_entry_count=excluded.time_entry_count,cost_entry_count=excluded.cost_entry_count," +
    "last_updated=excluded.last_updated,measurement_status=excluded.measurement_status"
  ).bind(id,m.measured.hours,m.costs?.recordedTotal??0,m.costs?.apiTokens??0,
    m.measured.entries,m.costs?.lineItems??0,
    m.measured.available||m.costs?'measured':'unmeasured').run();
  return m;
}
export async function handleProjectTimer(request,db,owner,id,action) {
  const p=await ownedProject(db,owner,id);
  if(!p)return json({ok:false,error:'project_not_found'},404);
  const input=await request.json().catch(()=>({}));
  if(action==='start'){
    const label=clean(input.label).slice(0,180)||'Project work';
    const active=await db.prepare(
      "SELECT id FROM time_entries WHERE user_id=? AND project_id=? AND source='work_timer' " +
      "AND ended_at IS NULL LIMIT 1"
    ).bind(owner,id).first();
    if(active)return json({ok:false,error:'timer_already_running'},409);
    try{
      await db.prepare(
        "INSERT INTO time_entries (id,user_id,tenant_id,workspace_id,project_id,project_name," +
        "description,hours,rate_cents,started_at,ended_at,source,billable,approved,created_at,updated_at) " +
        "VALUES(?,?,?,?,?,?,?,?,?,unixepoch(),NULL,'work_timer',0,0,unixepoch(),unixepoch())"
      ).bind('te_'+crypto.randomUUID().replace(/-/g,'').slice(0,20),
        owner,clean(p.tenant_id),null,id,clean(p.name),label,0,0).run();
    }catch(err){
      if(/unique|constraint/i.test(String(err)))return json({ok:false,error:'timer_already_running'},409);
      throw err;
    }
  }else if(action==='stop'){
    const timer=clean(input.timerId);
    if(!timer||timer.length>90)return json({ok:false,error:'timer_id_required'},400);
    const result=await db.prepare(
      "UPDATE time_entries SET ended_at=unixepoch(),hours=ROUND((unixepoch()-started_at)/3600.0,6)," +
      "updated_at=unixepoch() WHERE id=? AND project_id=? AND user_id=? " +
      "AND source='work_timer' AND ended_at IS NULL"
    ).bind(timer,id,owner).run();
    if(!num(result?.meta?.changes))return json({ok:false,error:'timer_not_active'},409);
  }else return json({ok:false,error:'invalid_action'},400);
  const measurements=await readProjectMeasurements(db,owner,id,{authorized:true});
  let metricsPersisted=true;
  try{await refreshProjectMetrics(db,owner,id);}catch(err){
    metricsPersisted=false;console.error('project_metrics_refresh_failed',String(err));
  }
  return json({ok:true,measurements,metricsPersisted});
}
