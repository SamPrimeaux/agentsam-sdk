/**
 * Canonical D1 writer for editor-owned section blocks.
 * __editor.blocks is a compatibility input, not a second persistence authority.
 * Never mutate generated/artifact-backed blocks or unclaimed imported Revise trees.
 */
export type BlockSource = {
  id:string; templateKey:string; enabled?:boolean; parentBlockId?:string|null;
};
export type BlockPlan = {
  id:string; templateKey:string; status:'active'|'hidden';
  parentBlockId:string|null; contentJson:string; sortOrder:number;
};
export type ProjectionResult = {
  status:'not_applicable'|'unchanged'|'applied';
  inserted:number; updated:number; archived:number;
};
type CanonicalRow = {
  id:string; block_key:string; block_type:string; sort_order:number;
  status:string; content_json:string; metadata_json:string;
  artifact_id:string|null; parent_block_id:string|null; source_path?:string|null;
};
export type SqlDb = {
  prepare(sql:string): {bind(...values:unknown[]): {run():Promise<unknown>; all():Promise<{results?:CanonicalRow[]}>}};
  batch(queries:Array<{run():Promise<unknown>}>):Promise<unknown>;
};
const INSTANCE_KEY=/^[a-z0-9][a-z0-9_-]{0,95}$/;
const TYPE_KEY=/^[a-z0-9][a-z0-9_-]{0,95}$/;
const OWNER='theme-studio-v1';
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function error(code:string):never {
  throw Object.assign(new Error('cms_block_'+code),{status:409,code:'cms_block_'+code});
}
function parsedMeta(raw:string):Record<string,unknown> {
  try {const meta:unknown=JSON.parse(raw);return isRecord(meta)?meta:{};}catch{return {};}
}
function objectJson(value:unknown):string {
  // Portable section libraries may expose an item as a plain label; normalize
  // that to a typed leaf without rewriting the preserved R2 source document.
  const normalized = typeof value==='string' ? {value} : value;
  if(!isRecord(normalized))error('invalid_block_settings');
  const result=JSON.stringify(normalized);
  if(result.length>131072)error('block_settings_too_large');
  return result;
}
const isOwned=(row:CanonicalRow)=>parsedMeta(row.metadata_json).source===OWNER;
const canAdopt=(row:CanonicalRow)=>!row.artifact_id&&!row.parent_block_id&&
  parsedMeta(row.metadata_json).legacy_source==='r2-section-content';
// Only an exact native block key/type can adopt a sourced Revise node. Aliases
// in __editor.blocks MUST NOT be guessed into source_path identities.
const canAdoptReviseNode=(row:CanonicalRow,plan:BlockPlan,parent:string|null)=>{
  const meta=parsedMeta(row.metadata_json);
  return !row.artifact_id && meta.source_theme==='revise' &&
    row.block_key===plan.id && row.block_type===plan.templateKey &&
    row.parent_block_id===parent && typeof row.source_path==='string' &&
    row.source_path.startsWith('$.blocks.');
};

/** Validate the editor document without altering D1. Parent is a block key, not a row ID. */
export function planEditorBlocks(content:unknown):BlockPlan[]|null {
  if(!isRecord(content)||!isRecord(content.__editor)||!Array.isArray(content.__editor.blocks))return null;
  const blocks:unknown[]=content.__editor.blocks;
  if(blocks.length>500)error('too_many_blocks');
  const seen=new Set<string>();
  const plan:BlockPlan[]=[];
  for(const entry of blocks){
    if(!isRecord(entry))error('invalid_block');
    const id=entry.id,templateKey=entry.templateKey;
    if(typeof id!=='string'||!INSTANCE_KEY.test(id)||typeof templateKey!=='string'||!TYPE_KEY.test(templateKey))
      error('invalid_block_identity');
    if(seen.has(id))error('duplicate_block_identity');
    seen.add(id);
    const rawParent=entry.parentBlockId;
    const parentBlockId=rawParent===undefined||rawParent===null?null:rawParent;
    if(parentBlockId!==null&&(typeof parentBlockId!=='string'||!INSTANCE_KEY.test(parentBlockId)))
      error('invalid_parent_identity');
    plan.push({id,templateKey,parentBlockId,status:entry.enabled===false?'hidden':'active',
      contentJson:objectJson(content[id]??{}),sortOrder:0});
  }
  const byKey=new Map(plan.map(p=>[p.id,p]));
  const cachedDepth=new Map<string,number>(),visiting=new Set<string>();
  const depth=(key:string):number=>{
    if(visiting.has(key))error('cyclic_block_parent');
    if(cachedDepth.has(key))return cachedDepth.get(key)!;
    visiting.add(key);
    const node=byKey.get(key)!;
    const d=node.parentBlockId&&byKey.has(node.parentBlockId)?1+depth(node.parentBlockId):0;
    if(d>16)error('block_depth_exceeded');
    visiting.delete(key);cachedDepth.set(key,d);return d;
  };
  const indexByParent=new Map<string,number>();
  for(const node of plan){
    depth(node.id);
    const parent=node.parentBlockId||'';
    const order=indexByParent.get(parent)||0;
    node.sortOrder=order*10;
    indexByParent.set(parent,order+1);
  }
  return plan;
}

/**
 * Every canonical row mutation and its revision receipt is a single D1 batch.
 * Legacy migrated flat records can be adopted by exact block key and type.
 * Native nesting uses stable canonical row IDs; imported Revise roots remain untouched.
 */
export async function reconcileCanonicalBlocks(db:SqlDb,input:{
  accountId:string;sectionId:string;content:unknown;dryRun?:boolean;
  previousContent?:unknown;
}):Promise<ProjectionResult> {
  // Existing Revise donor documents have flat aliases over deeply imported
  // canonical source paths. Unchanged aliases are compatibility projections:
  // allow independent section setting edits without pretending to rewrite those
  // sourced children. Changed aliases must go through exact native identities.
  const current=input.content, previous=input.previousContent;
  if(isRecord(current)&&isRecord(previous)&&
     isRecord(current.__editor)&&isRecord(previous.__editor)&&
     current.__editor.sourceContract==='revise/site-section-v1'&&
     Array.isArray(current.__editor.blocks)&&Array.isArray(previous.__editor.blocks)&&
     JSON.stringify(current.__editor.blocks)===JSON.stringify(previous.__editor.blocks)&&
     current.__editor.blocks.every((entry:unknown)=>
       isRecord(entry)&&typeof entry.id==='string'&&
       JSON.stringify(current[entry.id])===JSON.stringify(previous[entry.id])))
    return {status:'not_applicable',inserted:0,updated:0,archived:0};
  const desired=planEditorBlocks(input.content);
  if(desired===null)return {status:'not_applicable',inserted:0,updated:0,archived:0};
  if(!input.accountId||!input.sectionId)error('missing_scope');

  const fetched=await db.prepare(
    `SELECT id,block_key,block_type,sort_order,status,content_json,metadata_json,
      artifact_id,parent_block_id,source_path FROM cms_section_blocks
      WHERE account_id=? AND section_id=? ORDER BY sort_order,id`
  ).bind(input.accountId,input.sectionId).all();
  const rows=fetched.results||[];
  const oldByKey=new Map(rows.map(r=>[r.block_key,r]));
  const oldById=new Map(rows.map(r=>[r.id,r]));
  const requested=new Set(desired.map(p=>p.id));
  const desiredByKey=new Map(desired.map(p=>[p.id,p]));
  const nextId=new Map<string,string>();
  for(const p of desired){
    const existing=oldByKey.get(p.id);
    nextId.set(p.id,existing?.id||'cmsb_'+crypto.randomUUID().replace(/-/g,'').slice(0,16));
  }
  const resolveParent=(p:BlockPlan):string|null=>{
    if(!p.parentBlockId)return null;
    const parent=nextId.get(p.parentBlockId)||oldByKey.get(p.parentBlockId)?.id||
      oldById.get(p.parentBlockId)?.id;
    if(!parent)error('unknown_parent:'+p.parentBlockId);
    const own=oldByKey.get(p.parentBlockId)||oldById.get(p.parentBlockId);
    if(own&&own.status==='archived'&&!desiredByKey.has(own.block_key))error('archived_parent');
    return parent;
  };
  const insertions:Array<{id:string;plan:BlockPlan;parent:string|null}>=[];
  const updates:Array<{id:string;plan:BlockPlan;parent:string|null;old:CanonicalRow;adopt:boolean}>=[];
  const archives:CanonicalRow[]=[];
  for(const plan of desired){
    const old=oldByKey.get(plan.id);
    const parent=resolveParent(plan);
    if(!old){insertions.push({id:nextId.get(plan.id)!,plan,parent});continue;}
    const adopt=canAdopt(old)||canAdoptReviseNode(old,plan,parent);
    if((!isOwned(old)&&!adopt)||old.artifact_id||old.block_type!==plan.templateKey)
      error('unmanaged_block_collision:'+plan.id);
    if(old.content_json!==plan.contentJson||Number(old.sort_order)!==plan.sortOrder||
       old.status!==plan.status||old.parent_block_id!==parent||adopt)
      updates.push({id:old.id,plan,parent,old,adopt});
  }
  for(const old of rows){
    if(!isOwned(old)||requested.has(old.block_key)||old.status==='archived')continue;
    const unclaimedChildren=rows.filter(r=>r.parent_block_id===old.id&&!isOwned(r));
    if(unclaimedChildren.length)error('unmanaged_child_on_removed_parent:'+old.block_key);
    archives.push(old);
  }
  // A legacy Revise tree can carry projection aliases distinct from the canonical
  // imported keys. Never silently manufacture a parallel block tree from aliases.
  if(rows.some(r=>!isOwned(r)&&!canAdopt(r)&&r.parent_block_id)&&
     desired.some(p=>!oldByKey.has(p.id)&&!p.parentBlockId))
    error('imported_tree_requires_native_identity_mapping');
  if(!insertions.length&&!updates.length&&!archives.length)
    return {status:'unchanged',inserted:0,updated:0,archived:0};
  if(input.dryRun)
    return {status:'applied',inserted:insertions.length,updated:updates.length,archived:archives.length};

  const statements:Array<{run():Promise<unknown>}>=[];
  const receipt=(id:string,operation:string,before:unknown,after:unknown)=>{
    statements.push(db.prepare(
      `INSERT INTO cms_revisions
       (account_id,entity_type,entity_id,revision_number,revision_kind,snapshot_json,metadata_json)
       SELECT ?,'block',?,COALESCE(MAX(revision_number),0)+1,'draft',?,?
       FROM cms_revisions WHERE account_id=? AND entity_type='block' AND entity_id=?`
    ).bind(input.accountId,id,JSON.stringify({operation,before,after}),
      JSON.stringify({source:OWNER}),input.accountId,id));
  };
  // Insert parent before child to respect the parent_block_id foreign key.
  const depth=(p:BlockPlan):number=>{
    if(!p.parentBlockId||!desiredByKey.has(p.parentBlockId))return 0;
    return 1+depth(desiredByKey.get(p.parentBlockId)!);
  };
  insertions.sort((a,b)=>depth(a.plan)-depth(b.plan));
  for(const {id,plan,parent} of insertions){
    const meta={source:OWNER,sourceBlockId:plan.id};
    statements.push(db.prepare(
      `INSERT INTO cms_section_blocks
        (id,account_id,section_id,parent_block_id,block_key,block_type,sort_order,status,content_json,metadata_json)
        VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(id,input.accountId,input.sectionId,parent,plan.id,plan.templateKey,
      plan.sortOrder,plan.status,plan.contentJson,JSON.stringify(meta)));
    receipt(id,'insert',null,{...plan,parent_block_id:parent});
  }
  for(const {id,plan,parent,old,adopt} of updates){
    const meta=adopt?JSON.stringify({...parsedMeta(old.metadata_json),
      source:OWNER,adoptedFrom:canAdopt(old)?'r2-section-content':'revise-import'}):old.metadata_json;
    statements.push(db.prepare(
      `UPDATE cms_section_blocks SET sort_order=?,status=?,content_json=?,
       parent_block_id=?,metadata_json=?,updated_at=datetime('now')
       WHERE id=? AND account_id=? AND section_id=?`
    ).bind(plan.sortOrder,plan.status,plan.contentJson,parent,meta,
      id,input.accountId,input.sectionId));
    receipt(id,adopt?'adopt':'update',
      {block_key:old.block_key,block_type:old.block_type,content_json:old.content_json,
       sort_order:old.sort_order,status:old.status,parent_block_id:old.parent_block_id,
       metadata_json:old.metadata_json},
      {...plan,parent_block_id:parent});
  }
  for(const old of archives){
    statements.push(db.prepare(
      `UPDATE cms_section_blocks SET status='archived',updated_at=datetime('now')
       WHERE id=? AND account_id=? AND section_id=?`
    ).bind(old.id,input.accountId,input.sectionId));
    receipt(old.id,'archive',
      {block_key:old.block_key,content_json:old.content_json,status:old.status,
       sort_order:old.sort_order,parent_block_id:old.parent_block_id},
      {status:'archived'});
  }
  await db.batch(statements);
  return {status:'applied',inserted:insertions.length,updated:updates.length,archived:archives.length};
}
