/**
 * Independent, private Canvas documents. Storage authority: agentsam_artifacts
 * plus immutable ARTIFACTS objects. Generation authority: existing executions
 * and execution_steps. Caller supplies a verified auth_users.id, never a site.
 */
const BASE = /^\/api\/work\/canvases(?:\/(canvas_[a-z0-9-]{12,80})(?:\/(directions|events|history|restore|runs)(?:\/(run_[a-z0-9-]{12,80})(?:\/(execute|cancel|retry))?)?)?)?$/;
const KIND = 'design-canvas';
const EXECUTION = 'canvas-generation';
const MAX_BYTES = 2_000_000;
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const RUN_ID = /^run_[a-z0-9-]{12,80}$/;
const TYPES = new Set(['frame', 'text', 'button', 'image', 'input', 'link', 'html']);
const STYLE = new Set(['color','background','backgroundColor','fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','textAlign','textDecoration','border','borderColor','borderWidth','borderStyle','borderRadius','boxShadow','opacity','padding','paddingTop','paddingRight','paddingBottom','paddingLeft','display','alignItems','justifyContent','flexDirection','gap','overflow','objectFit','whiteSpace']);
const clean = v => typeof v === 'string' ? v.trim() : '';
const obj = v => v && typeof v === 'object' && !Array.isArray(v);
const meta = row => { try { const v=JSON.parse(row.metadata_json || '{}'); return obj(v)?v:{}; } catch { return {}; } };
const number = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 100000;
const encode = v => new TextEncoder().encode(JSON.stringify(v));
const sha = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
const respond = (body,status=200,headers={}) => Response.json(body,{status,headers:{'cache-control':'private, no-store',...headers}});
const now = () => Math.floor(Date.now()/1000);
const rowQuery = "SELECT * FROM agentsam_artifacts WHERE id=? AND user_id=? AND artifact_type='design-canvas' AND archived_at IS NULL";
const runQuery = "SELECT * FROM agentsam_executions WHERE id=? AND user_id=? AND execution_key=? AND execution_type='canvas-generation'";
export class CanvasError extends Error { constructor(code,status=400){super(code);this.status=status;} }
export const isCanvasRequest = path => BASE.test(path);
export const blankCanvasDocument = () => ({version:1,name:'Untitled Canvas',host:'design',brief:'',artboards:[],tokens:{},components:[],assets:[],dataRequirements:[],provenance:{}});
export const canvasSummary = row => ({id:row.id,name:row.name,revision:Number(meta(row).revision)||1,contentHash:row.content_hash,updatedAt:new Date(Number(row.updated_at)*1000).toISOString(),artboardCount:meta(row).artboardCount||0,archived:!!row.archived_at});
const runSummary = row => row ? {id:row.id,status:row.status,canvasId:row.execution_key,...meta(row),startedAt:new Date(row.started_at_unix*1000).toISOString(),completedAt:row.completed_at_unix?new Date(row.completed_at_unix*1000).toISOString():null} : null;

function safeUrl(v){return typeof v==='string' && v.length<=8192 && (/^https:\/\//i.test(v)||/^\/(?!\/)/.test(v)||/^#[A-Za-z0-9_-]+$/.test(v));}
function validStyle(style){
 if(!obj(style)||Object.keys(style).length>60)return false;
 return Object.entries(style).every(([k,v])=>STYLE.has(k)&&(typeof v==='number'?Number.isFinite(v):typeof v==='string'&&v.length<500&&!/url\s*\(|expression\s*\(|@import|javascript:/i.test(v)));
}
export function validateCanvasDocument(doc){
 if(!obj(doc)||doc.version!==1||!clean(doc.name)||doc.name.length>160||!clean(doc.host)||doc.host.length>80||typeof doc.brief!=='string'||doc.brief.length>12000||!Array.isArray(doc.artboards)||doc.artboards.length>64)return false;
 if(!obj(doc.tokens)||!Array.isArray(doc.components)||doc.components.length>256||!Array.isArray(doc.assets)||doc.assets.length>1000||!Array.isArray(doc.dataRequirements)||doc.dataRequirements.length>200||!obj(doc.provenance))return false;
 const ids=new Set();let count=0;
 function nodes(items,depth=0){
  if(!Array.isArray(items)||depth>20)return false;
  for(const n of items){
   if(++count>5000||!obj(n)||!ID.test(n.id)||ids.has(n.id)||!TYPES.has(n.type)||!clean(n.name)||n.name.length>160||![n.x,n.y,n.width,n.height].every(number)||n.width<0||n.height<0)return false;
   ids.add(n.id);
   if(n.style!==undefined&&!validStyle(n.style))return false;
   if(n.text!==undefined&&(typeof n.text!=='string'||n.text.length>50000))return false;
   // HTML remains an explicitly sandboxed Canvas object. Never silently convert it into CMS markup.
   if(n.sourceHtml!==undefined&&(n.type!=='html'||typeof n.sourceHtml!=='string'||n.sourceHtml.length>200000||!n.sourceHtml.trim()))return false;
   if(n.type==='html'&&!n.sourceHtml)return false;
   if(n.sourceBase!==undefined&&(n.type!=='html'||typeof n.sourceBase!=='string'||!/^\/design-canvas\/sources\/[a-z0-9-]+\/$/.test(n.sourceBase)))return false;
   if(n.src!==undefined&&!safeUrl(n.src))return false;
   if(n.action!==undefined&&(!obj(n.action)||!['navigate','toggle','submit'].includes(n.action.type)||typeof n.action.target!=='string'||n.action.target.length>2048||(n.action.type==='navigate'&&!safeUrl(n.action.target))))return false;
   if(n.responsive!==undefined){
    if(!obj(n.responsive)||Object.keys(n.responsive).length>12)return false;
    for(const [key,r] of Object.entries(n.responsive)){
     if(!/^\d{2,4}$/.test(key)||!obj(r))return false;
     for(const f of ['x','y','width','height'])if(r[f]!==undefined&&!number(r[f]))return false;
     if(r.style!==undefined&&!validStyle(r.style))return false;
    }
   }
   if(n.children!==undefined&&!nodes(n.children,depth+1))return false;
  }return true;
 }
 for(const board of doc.artboards){
  if(!obj(board)||!ID.test(board.id)||ids.has(board.id)||!clean(board.name)||board.name.length>160||![board.x,board.y,board.width,board.height].every(number)||board.width<1||board.height<1)return false;
  ids.add(board.id);
  if(!nodes(board.nodes))return false;
  if(board.background!==undefined&&(typeof board.background!=='string'||board.background.length>128||/url\s*\(|expression\s*\(/i.test(board.background)))return false;
  if(board.route!==undefined&&(typeof board.route!=='string'||!/^\/(?!\/)/.test(board.route)||board.route.length>500))return false;
 }
 for(const c of doc.components){if(!obj(c)||!ID.test(c.id)||!clean(c.name)||!nodes([c.node]))return false;}
 if(doc.directions!==undefined&&(!Array.isArray(doc.directions)||doc.directions.length!==4||new Set(doc.directions.map(d=>d?.id)).size!==4||!doc.directions.every(d=>obj(d)&&ID.test(d.id)&&clean(d.title)&&clean(d.description)&&clean(d.creativeIntent))))return false;
 return encode(doc).byteLength<=MAX_BYTES;
}
async function body(request){
 if(Number(request.headers.get('content-length')||0)>MAX_BYTES+20000)throw new CanvasError('payload_too_large',413);
 const raw=await request.text();if(raw.length>MAX_BYTES+20000)throw new CanvasError('payload_too_large',413);
 try{const data=JSON.parse(raw||'{}');if(!obj(data))throw new Error();return data;}catch{throw new CanvasError('invalid_json');}
}
function requireDocument(document){if(!validateCanvasDocument(document))throw new CanvasError('invalid_document');}
async function readStored(env,row){
 const asset=await env.ARTIFACTS.get(row.r2_key);
 if(!asset)throw new CanvasError('canvas_asset_missing_or_invalid',424);
 const bytes=await asset.arrayBuffer();
 if(await sha(bytes)!==row.content_hash)throw new CanvasError('canvas_asset_missing_or_invalid',424);
 let document;try{document=JSON.parse(new TextDecoder().decode(bytes));}catch{throw new CanvasError('canvas_asset_missing_or_invalid',424);}
 requireDocument(document);return document;
}
export async function readCanvas(env,owner,id){
 const row=await env.DB.prepare(rowQuery).bind(id,owner).first();
 if(!row)return null;
 return {canvas:canvasSummary(row),document:await readStored(env,row)};
}
async function putVerified(env,owner,id,revision,document){
 requireDocument(document);
 const bytes=encode(document),hash=await sha(bytes);
 const key='canvas/'+encodeURIComponent(owner)+'/'+id+'/rev-'+revision+'-'+crypto.randomUUID()+'.json';
 await env.ARTIFACTS.put(key,bytes,{httpMetadata:{contentType:'application/json'}});
 const check=await env.ARTIFACTS.get(key);
 if(!check||await sha(await check.arrayBuffer())!==hash){await env.ARTIFACTS.delete?.(key);throw new CanvasError('canvas_write_unverified',502);}
 return {key,hash,size:bytes.byteLength};
}
export async function saveCanvas(env,owner,id,document,expectedHash,activeRun=null){
 requireDocument(document);
 const row=await env.DB.prepare(rowQuery).bind(id,owner).first();
 if(!row)throw new CanvasError('canvas_not_found',404);
 if(!expectedHash||row.content_hash!==expectedHash)throw new CanvasError('revision_conflict',409);
 const prior=meta(row),revision=(Number(prior.revision)||1)+1;
 const asset=await putVerified(env,owner,id,revision,document);
 const history=[...(Array.isArray(prior.history)?prior.history:[]),{revision:revision-1,r2_key:row.r2_key,content_hash:row.content_hash,name:row.name,updated_at:row.updated_at}].slice(-100);
 try{
  const guard=activeRun?" AND EXISTS (SELECT 1 FROM agentsam_executions WHERE id=? AND user_id=? AND execution_key=? AND status='running' AND json_extract(metadata_json,'$.lease')=? AND json_extract(metadata_json,'$.cancelRequested')=0)":"";
  const values=[document.name,asset.key,asset.size,asset.hash,JSON.stringify({...prior,revision,artboardCount:document.artboards.length,history}),id,owner,expectedHash];
  if(activeRun)values.push(activeRun.id,owner,id,activeRun.lease);
  const result=await env.DB.prepare("UPDATE agentsam_artifacts SET name=?,r2_key=?,file_size_bytes=?,content_hash=?,metadata_json=?,updated_at=unixepoch() WHERE id=? AND user_id=? AND artifact_type='design-canvas' AND archived_at IS NULL AND content_hash=?"+guard).bind(...values).run();
  if(result.meta?.changes!==1){
   if(activeRun){const active=await getRun(env,owner,id,activeRun.id);if(!active||active.status!=='running'||meta(active).lease!==activeRun.lease)throw new CanvasError('generation_cancelled',409);}
   throw new CanvasError('revision_conflict',409);
  }
 }catch(error){await env.ARTIFACTS.delete?.(asset.key);throw error;}
 return {canvas:canvasSummary({...row,name:document.name,content_hash:asset.hash,updated_at:now(),metadata_json:JSON.stringify({...prior,revision,artboardCount:document.artboards.length,history})}),document};
}
async function createCanvas(env,owner,data){
 const id=data.id;if(typeof id!=='string'||!/^canvas_[a-z0-9-]{12,80}$/.test(id))throw new CanvasError('invalid_canvas_id');
 const existing=await env.DB.prepare("SELECT id,user_id,artifact_type,archived_at FROM agentsam_artifacts WHERE id=?").bind(id).first();
 if(existing){
  if(existing.user_id!==owner||existing.artifact_type!==KIND||existing.archived_at)throw new CanvasError('canvas_id_conflict',409);
  return {...await readCanvas(env,owner,id),created:false};
 }
 const document=data.document||blankCanvasDocument();requireDocument(document);
 const user=await env.DB.prepare("SELECT default_account_id FROM auth_users WHERE id=?").bind(owner).first();
 if(!user)throw new CanvasError('unauthorized',401);
 const asset=await putVerified(env,owner,id,1,document);
 try{
  const result=await env.DB.prepare("INSERT OR IGNORE INTO agentsam_artifacts (id,user_id,tenant_id,name,artifact_type,r2_key,source,file_size_bytes,content_hash,r2_bucket,scope,visibility,artifact_status,validation_status,mime_type,metadata_json) VALUES (?,?,?,?,'design-canvas',?,'canvas.editor',?,?,'artifacts','user','private','draft','asset-verified','application/json',?)")
   .bind(id,owner,clean(user.default_account_id)||owner,document.name,asset.key,asset.size,asset.hash,JSON.stringify({revision:1,artboardCount:document.artboards.length,history:[]})).run();
  if(result.meta?.changes!==1){await env.ARTIFACTS.delete?.(asset.key);const current=await readCanvas(env,owner,id);if(!current)throw new CanvasError('canvas_id_conflict',409);return {...current,created:false};}
 }catch(error){await env.ARTIFACTS.delete?.(asset.key);throw error;}
 return {...await readCanvas(env,owner,id),created:true};
}
async function requireProject(env,owner,id){
 if(!id)return null;
 if(typeof id!=='string'||!ID.test(id))throw new CanvasError('invalid_project_id');
 const project=await env.DB.prepare('SELECT id,name,description,project_type FROM projects WHERE id=? AND owner_user_id=?').bind(id,owner).first();
 if(!project)throw new CanvasError('project_not_found',404);
 return project;
}
async function getRun(env,owner,id,runId){return env.DB.prepare(runQuery).bind(runId,owner,id).first();}
async function latestRun(env,owner,id){
 return env.DB.prepare("SELECT * FROM agentsam_executions WHERE user_id=? AND execution_key=? AND execution_type='canvas-generation' ORDER BY started_at_unix DESC,rowid DESC LIMIT 1").bind(owner,id).first();
}
async function emitEvent(env,owner,id,runId,type,payload={},lease=null){
 const eventId='estep_'+crypto.randomUUID();
 const guard=lease?" AND status='running' AND json_extract(metadata_json,'$.lease')=?":"";
 const values=[eventId,runId,id,type,JSON.stringify({type,payload}),owner,runId,owner,id];
 if(lease)values.push(lease);
 const inserted=await env.DB.prepare("INSERT INTO agentsam_execution_steps (id,execution_id,node_key,node_type,step_type,status,output_json,account_id,started_at,completed_at) SELECT ?,?,?,'canvas',?,'success',?,?,unixepoch(),unixepoch() WHERE EXISTS (SELECT 1 FROM agentsam_executions WHERE id=? AND user_id=? AND execution_key=?"+guard+")").bind(...values).run();
 if(inserted.meta?.changes!==1)throw new CanvasError('generation_cancelled',409);
 const plan=type==='generation.plan'&&payload.plan;
 const updatedValues=[...(plan?[JSON.stringify(payload.plan)]:[]),runId,owner,id,...(lease?[lease]:[])];
 const set=plan?"json_set(metadata_json,'$.checkpoint.plan',json(?),'$.heartbeat',unixepoch())":"json_set(metadata_json,'$.heartbeat',unixepoch())";
 const updated=await env.DB.prepare("UPDATE agentsam_executions SET metadata_json="+set+" WHERE id=? AND user_id=? AND execution_key=?"+guard).bind(...updatedValues).run();
 if(lease&&updated.meta?.changes!==1)throw new CanvasError('generation_cancelled',409);
 return eventId;
}
async function createRun(env,owner,id,data){
 if(!RUN_ID.test(data.id))throw new CanvasError('invalid_run_id');
 const existing=await getRun(env,owner,id,data.id);if(existing)return {run:runSummary(existing),created:false};
 const current=await readCanvas(env,owner,id);if(!current)throw new CanvasError('canvas_not_found',404);
 if(data.base_revision!==current.canvas.revision)throw new CanvasError('revision_conflict',409);
 const instruction=clean(data.instruction);
 if(data.skill_ids!==undefined&&(!Array.isArray(data.skill_ids)||data.skill_ids.length>16||!data.skill_ids.every(s=>typeof s==='string'&&ID.test(s))))throw new CanvasError('invalid_skill_ids');
 if(instruction.length>12000)throw new CanvasError('instruction_too_long');
 const direction=current.document.directions?.find(d=>d.id===data.direction_id);
 if(!direction&&!instruction)throw new CanvasError('direction_required');
 if(data.selection!==undefined&&(!Array.isArray(data.selection)||data.selection.length>100||!data.selection.every(x=>typeof x==='string'&&ID.test(x))))throw new CanvasError('invalid_selection');
 if(data.selection?.length){
  const ids=new Set();const visit=nodes=>nodes.forEach(n=>{ids.add(n.id);visit(n.children||[]);});current.document.artboards.forEach(a=>{ids.add(a.id);visit(a.nodes);});
  if(data.selection.some(x=>!ids.has(x)))throw new CanvasError('selection_not_found',404);
 }
 const user=await env.DB.prepare('SELECT default_account_id FROM auth_users WHERE id=?').bind(owner).first();if(!user)throw new CanvasError('unauthorized',401);
 const metadata={canvasId:id,base_revision:current.canvas.revision,base_hash:current.canvas.contentHash,direction_id:direction?.id,direction,instruction,skill_ids:data.skill_ids||[],selection:data.selection||[],provider:clean(data.provider),model_id:clean(data.model_id),cancelRequested:false,checkpoint:{},heartbeat:now()};
 const result=await env.DB.prepare("INSERT OR IGNORE INTO agentsam_executions (id,tenant_id,workspace_id,user_id,execution_type,run_id,execution_key,status,started_at_unix,account_id,metadata_json) SELECT ?,?,?,?,'canvas-generation',?,?,'queued',unixepoch(),?,? WHERE NOT EXISTS (SELECT 1 FROM agentsam_executions WHERE execution_type='canvas-generation' AND execution_key=? AND user_id=? AND status IN ('queued','running'))")
  .bind(data.id,clean(user.default_account_id)||owner,'',owner,data.id,id,clean(user.default_account_id)||owner,JSON.stringify(metadata),id,owner).run();
 if(result.meta?.changes!==1){
  const retry=await getRun(env,owner,id,data.id);if(retry)return {run:runSummary(retry),created:false};
  throw new CanvasError('generation_already_active',409);
 }
 await emitEvent(env,owner,id,data.id,'run.queued',{canvasId:id,revision:current.canvas.revision});
 return {run:runSummary(await getRun(env,owner,id,data.id)),created:true};
}

async function generationService(context){
 return context.canvasRuntime?.generationService || import('./work-canvas-generation.js');
}
async function setRunStatus(env,owner,id,runId,status,error=null,lease=null){
 const sql="UPDATE agentsam_executions SET status=?,completed_at_unix=unixepoch(),metadata_json=json_set(metadata_json,'$.error',json(?),'$.heartbeat',unixepoch()) WHERE id=? AND user_id=? AND execution_key=?"+(lease?" AND json_extract(metadata_json,'$.lease')=? AND status='running'":"");
 const values=[status,JSON.stringify(error),runId,owner,id];if(lease)values.push(lease);
 return env.DB.prepare(sql).bind(...values).run();
}
async function executeRun(request,env,owner,id,runId,context){
 const row=await getRun(env,owner,id,runId);if(!row)throw new CanvasError('run_not_found',404);
 if(row.status!=='queued'&&row.status!=='interrupted')throw new CanvasError('run_not_executable',409);
 const lease=crypto.randomUUID();
 const claimed=await env.DB.prepare("UPDATE agentsam_executions SET status='running',completed_at_unix=NULL,metadata_json=json_set(metadata_json,'$.lease',?,'$.heartbeat',unixepoch(),'$.cancelRequested',json('false')) WHERE id=? AND user_id=? AND execution_key=? AND status IN ('queued','interrupted') AND NOT EXISTS (SELECT 1 FROM agentsam_executions other WHERE other.execution_type='canvas-generation' AND other.execution_key=? AND other.user_id=? AND other.id<>? AND other.status IN ('queued','running'))")
  .bind(lease,runId,owner,id,id,owner,runId).run();
 if(claimed.meta?.changes!==1)throw new CanvasError('run_already_running',409);
 let cancelled=false,controllerRef;
 const disconnect=async()=>{
  cancelled=true;
  await setRunStatus(env,owner,id,runId,'interrupted',{code:'connection_lost',recoverable:true},lease).catch(()=>{});
 };
 const signal=request.signal;
 signal?.addEventListener('abort',disconnect,{once:true});
 const stream=new ReadableStream({
  start(controller){
   controllerRef=controller;
   const send=value=>{if(!cancelled){try{controller.enqueue(new TextEncoder().encode(JSON.stringify(value)+'\n'));}catch{cancelled=true;}}};
   const task=(async()=>{
    let current=await readCanvas(env,owner,id);
    const initial=meta(row);
    if(!current)throw new CanvasError('canvas_not_found',404);
    if(current.canvas.contentHash!==(initial.checkpoint?.contentHash||initial.base_hash))throw new CanvasError('revision_conflict',409);
    const shouldCancel=async()=>{
     if(cancelled||signal?.aborted)return true;
     const active=await getRun(env,owner,id,runId);
     return !active||active.status!=='running'||meta(active).lease!==lease||meta(active).cancelRequested===true;
    };
    const emit=async(type,payload={})=>{
     if(await shouldCancel())throw new CanvasError('generation_cancelled',409);
     await emitEvent(env,owner,id,runId,type,payload,lease);
     send({type,payload,runId});
    };
    await emit('run.started',{canvasId:id,revision:current.canvas.revision});
    const service=await generationService(context);
    await service.executeCanvasGeneration({
     env,user:{id:owner},document:current.document,run:{...runSummary(row),...initial,checkpoint:initial.checkpoint||{}},
     runtime:context.canvasRuntime,
     shouldCancel,emit,
     apply:async(document,operation={})=>{
      if(await shouldCancel())throw new CanvasError('generation_cancelled',409);
      current=await saveCanvas(env,owner,id,document,current.canvas.contentHash,{id:runId,lease});
      await env.DB.prepare("UPDATE agentsam_executions SET metadata_json=json_set(metadata_json,'$.checkpoint.contentHash',?,'$.checkpoint.revision',?,'$.heartbeat',unixepoch()) WHERE id=? AND user_id=? AND execution_key=? AND json_extract(metadata_json,'$.lease')=? AND status='running'")
       .bind(current.canvas.contentHash,current.canvas.revision,runId,owner,id,lease).run();
      await emit('canvas.saved',{canvas:current.canvas,operation});
      return current;
     },
    });
    if(await shouldCancel())throw new CanvasError('generation_cancelled',409);
    const completed=await setRunStatus(env,owner,id,runId,'completed',null,lease);
    if(completed.meta?.changes!==1)throw new CanvasError('generation_cancelled',409);
    await emitEvent(env,owner,id,runId,'run.completed',{canvasId:id,revision:current.canvas.revision});
    send({type:'run.status',status:'completed'});
   })().catch(async error=>{
    const code=error instanceof CanvasError?error.message:clean(error?.code)||clean(error?.message)||'generation_failed';
    const current=await getRun(env,owner,id,runId).catch(()=>null);
    if(current&&current.status==='running'&&meta(current).lease===lease){
     const status=cancelled?'interrupted':['generation_cancelled','canvas_generation_cancelled'].includes(code)?'cancelled':'failed';
     const detail={code,recoverable:true};
     await emitEvent(env,owner,id,runId,'run.'+status,detail).catch(()=>{});
     await setRunStatus(env,owner,id,runId,status,detail,lease);
     send({type:'run.status',status,error:detail});
    }
   }).finally(()=>{
    signal?.removeEventListener('abort',disconnect);
    try{controller.close();}catch{}
   });
   context.waitUntil?.(task);
  },
  async cancel(){await disconnect();},
 });
 return new Response(stream,{headers:{'content-type':'application/x-ndjson','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
}
async function events(env,owner,id,after){
 const rows=await env.DB.prepare("SELECT s.rowid AS sequence,s.id,s.execution_id,s.output_json,s.created_at_unix FROM agentsam_execution_steps s JOIN agentsam_executions e ON e.id=s.execution_id WHERE e.user_id=? AND e.execution_key=? AND e.execution_type='canvas-generation' AND s.rowid>? ORDER BY s.rowid LIMIT 200")
  .bind(owner,id,after).all();
 const events=(rows.results||[]).map(r=>{
  let value;try{value=JSON.parse(r.output_json);}catch{value={type:'invalid_receipt',payload:{}};}
  return {sequence:r.sequence,id:r.id,runId:r.execution_id,type:value.type,payload:value.payload,createdAt:new Date(r.created_at_unix*1000).toISOString()};
 });
 return {events,cursor:events.length?events[events.length-1].sequence:after};
}
export async function handleCanvasRequest(request,env,owner,context={}){
 const url=new URL(request.url),match=BASE.exec(url.pathname);
 if(!match)return respond({ok:false,error:'not_found'},404);
 if(!owner)return respond({ok:false,error:'unauthorized'},401);
 const method=request.method.toUpperCase();
 if(!['GET','HEAD','OPTIONS'].includes(method)){
  const origin=request.headers.get('origin');
  if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')return respond({ok:false,error:'cross_origin_request'},403);
 }
 if(!env.DB?.prepare||!env.ARTIFACTS?.get||!env.ARTIFACTS?.put)return respond({ok:false,error:'storage_unavailable'},503);
 const [,id,section,runId,action]=match;
 try{
  if(!id&&method==='GET'){
   const archived=url.searchParams.get('archived')==='1';
   const rows=await env.DB.prepare("SELECT * FROM agentsam_artifacts WHERE user_id=? AND artifact_type='design-canvas' AND archived_at IS "+(archived?'NOT NULL':'NULL')+" ORDER BY updated_at DESC LIMIT 200").bind(owner).all();
   return respond({ok:true,canvases:(rows.results||[]).map(canvasSummary)});
  }
  if(!id&&method==='POST'){
   const result=await createCanvas(env,owner,await body(request));
   return respond({ok:true,...result},result.created?201:200);
  }
  if(!id)throw new CanvasError('method_not_allowed',405);
  const row=await env.DB.prepare(rowQuery).bind(id,owner).first();
  if(!row)throw new CanvasError('canvas_not_found',404);
  if(!section){
   if(method==='GET')return respond({ok:true,canvas:canvasSummary(row),document:await readStored(env,row)},200,{etag:'"'+row.content_hash+'"'});
   if(method==='PUT'){
    const data=await body(request),expected=request.headers.get('if-match');
    if(expected!=='"'+row.content_hash+'"')throw new CanvasError('revision_conflict',409);
    const result=await saveCanvas(env,owner,id,data.document,row.content_hash);
    return respond({ok:true,...result},200,{etag:'"'+result.canvas.contentHash+'"'});
   }
   if(method==='DELETE'||method==='PATCH'){
    if(method==='PATCH'&&(await body(request)).archived!==true)throw new CanvasError('invalid_archive_request');
    const active=await latestRun(env,owner,id);
    if(active&&['queued','running'].includes(active.status))throw new CanvasError('generation_active',409);
    if(request.headers.get('if-match')!=='"'+row.content_hash+'"')throw new CanvasError('revision_conflict',409);
    const result=await env.DB.prepare("UPDATE agentsam_artifacts SET archived_at=unixepoch(),updated_at=unixepoch() WHERE id=? AND user_id=? AND artifact_type='design-canvas' AND archived_at IS NULL AND content_hash=?").bind(id,owner,row.content_hash).run();
    if(result.meta?.changes!==1)throw new CanvasError('revision_conflict',409);
    return respond({ok:true,archived:true});
   }
  }
  if(section==='history'&&method==='GET'){
   const history=meta(row).history||[];
   return respond({ok:true,canvas:canvasSummary(row),revisions:[...history,{revision:meta(row).revision||1,content_hash:row.content_hash,name:row.name,updated_at:row.updated_at}].map(r=>({revision:r.revision,contentHash:r.content_hash,name:r.name,updatedAt:new Date(r.updated_at*1000).toISOString()}))});
  }
  if(section==='restore'&&method==='POST'){
   if(request.headers.get('if-match')!=='"'+row.content_hash+'"')throw new CanvasError('revision_conflict',409);
   const data=await body(request),revision=(meta(row).history||[]).find(r=>r.revision===data.revision);
   if(!revision)throw new CanvasError('revision_not_found',404);
   const document=await readStored(env,revision);
   return respond({ok:true,...await saveCanvas(env,owner,id,document,row.content_hash)});
  }
  if(section==='directions'){
   const document=await readStored(env,row);
   if(method==='GET')return respond({ok:true,directions:document.directions||[],canvas:canvasSummary(row),document});
   if(method==='POST'){
    const data=await body(request),project=await requireProject(env,owner,data.projectId);
    if(data.brief!==undefined&&(typeof data.brief!=='string'||data.brief.length>12000))throw new CanvasError('invalid_brief');
    const next={...document,brief:data.brief??document.brief,provenance:{...document.provenance,...(project?{projectId:project.id}:{})}};
    const service=await generationService(context);
    const prepared=await service.prepareCanvasDirections({env,user:{id:owner},document:next,context:{...data,host:document.host,project},runtime:context.canvasRuntime});
    const directions=Array.isArray(prepared)?prepared:prepared.directions;
    next.directions=directions;
    const result=await saveCanvas(env,owner,id,next,row.content_hash);
    return respond({ok:true,...result,directions,receipt:{provider:prepared.provider,model_id:prepared.model_id,response_id:prepared.response_id,usage:prepared.usage}});
   }
  }
  if(section==='events'&&method==='GET'){
   const after=Number(url.searchParams.get('after')||0);
   if(!Number.isSafeInteger(after)||after<0)throw new CanvasError('invalid_cursor');
   return respond({ok:true,...await events(env,owner,id,after),canvas:canvasSummary(row),run:runSummary(await latestRun(env,owner,id))});
  }
  if(section==='runs'){
   if(!runId&&method==='POST'){
    const result=await createRun(env,owner,id,await body(request));return respond({ok:true,...result},result.created?202:200);
   }
   if(!runId&&method==='GET'){
    const rows=await env.DB.prepare("SELECT * FROM agentsam_executions WHERE user_id=? AND execution_key=? AND execution_type='canvas-generation' ORDER BY started_at_unix DESC,rowid DESC LIMIT 100").bind(owner,id).all();
    return respond({ok:true,runs:(rows.results||[]).map(runSummary)});
   }
   if(runId){
    const run=await getRun(env,owner,id,runId);if(!run)throw new CanvasError('run_not_found',404);
    if(!action&&method==='GET')return respond({ok:true,run:runSummary(run)});
    if(action==='execute'&&method==='POST')return await executeRun(request,env,owner,id,runId,context);
    if(action==='cancel'&&method==='POST'){
     if(!['queued','running','interrupted'].includes(run.status))return respond({ok:true,run:runSummary(run)});
     const cancelledRun=await env.DB.prepare("UPDATE agentsam_executions SET status='cancelled',completed_at_unix=unixepoch(),metadata_json=json_set(metadata_json,'$.cancelRequested',json('true'),'$.heartbeat',unixepoch()) WHERE id=? AND user_id=? AND execution_key=? AND status IN ('queued','running','interrupted')").bind(runId,owner,id).run();
     if(cancelledRun.meta?.changes===1)await emitEvent(env,owner,id,runId,'run.cancelled',{requestedBy:'user'});
     return respond({ok:true,run:runSummary(await getRun(env,owner,id,runId))});
    }
    if(action==='retry'&&method==='POST'){
     if(run.status==='running'&&Number(meta(run).heartbeat)>now()-120)throw new CanvasError('run_already_running',409);
     if(run.status==='completed')throw new CanvasError('run_already_completed',409);
     const data=await body(request);
     if(data.base_revision!==canvasSummary(row).revision)throw new CanvasError('revision_conflict',409);
     const retry=await env.DB.prepare("UPDATE agentsam_executions SET status='queued',completed_at_unix=NULL,metadata_json=json_set(metadata_json,'$.cancelRequested',json('false'),'$.error',json('null'),'$.base_hash',?,'$.base_revision',?,'$.checkpoint.contentHash',?,'$.heartbeat',unixepoch()) WHERE id=? AND user_id=? AND execution_key=? AND NOT EXISTS (SELECT 1 FROM agentsam_executions other WHERE other.execution_type='canvas-generation' AND other.execution_key=? AND other.user_id=? AND other.id<>? AND other.status IN ('queued','running'))")
      .bind(row.content_hash,canvasSummary(row).revision,row.content_hash,runId,owner,id,id,owner,runId).run();
     if(retry.meta?.changes!==1)throw new CanvasError('generation_already_active',409);
     await emitEvent(env,owner,id,runId,'run.retry_requested',{revision:canvasSummary(row).revision});
     return respond({ok:true,run:runSummary(await getRun(env,owner,id,runId))});
    }
   }
  }
  throw new CanvasError('method_not_allowed',405);
 }catch(error){
  if(error instanceof CanvasError)return respond({ok:false,error:error.message},error.status);
  const code=clean(error?.code)||clean(error?.message);
  console.error('canvas_request_failed',code);
  return respond({ok:false,error:code&&/^[a-z][a-z0-9_]{0,100}$/.test(code)?code:'canvas_request_failed'},Number(error?.status)||500);
 }
}
