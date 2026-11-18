import { createHash } from 'node:crypto';

/** Test-only host repository. No SQL, DDL, database bootstrapping, or filesystem state. */
const stores = new Map();
const copy = value => structuredClone(value);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const err = code => { throw Object.assign(new Error(code),{code}); };
const scopeKey = ctx => {
  if(!ctx?.accountId || !ctx?.installationId || !ctx?.actorId) err('cms_trusted_identity_required');
  return ctx.accountId + ':' + ctx.installationId;
};
const key = (ctx,id) => scopeKey(ctx) + ':' + id;
export function createCmsMemoryRepository({namespace='test:'+crypto.randomUUID()}={}) {
  if(!stores.has(namespace)) stores.set(namespace,{pages:new Map(),publications:new Map(),revisions:new Map()});
  const store=stores.get(namespace);
  const row=(ctx,id)=>store.pages.get(key(ctx,id));
  function append(ctx,id,document,effect) {
    const k=key(ctx,id), all=store.revisions.get(k)||[];
    all.push({version:document.version,document:copy(document),effect,createdAt:document.updatedAt});
    store.revisions.set(k,all);
  }
  const createPage=(ctx,{pageId,title,slug,idempotencyKey})=>{
    const existing=row(ctx,pageId);
    if(existing) {
      if(idempotencyKey && existing.createKey===idempotencyKey && existing.slug===slug && existing.title===title)
        return {document:copy(existing),duplicate:true};
      err('cms_page_already_exists');
    }
    const now=new Date().toISOString();
    const document={id:pageId,title,slug,version:1,sections:[],publishedVersion:null,
      createdAt:now,updatedAt:now,createKey:idempotencyKey||null,dedupe:{}};
    store.pages.set(key(ctx,pageId),copy(document));append(ctx,pageId,document,'draft_create');
    return {document:copy(document),duplicate:false};
  };
  const mutate=(ctx,{pageId,expectedVersion,effect,idempotencyKey,fingerprint,apply})=>{
    const before=row(ctx,pageId);
    if(!before)err('cms_page_not_found');
    if(idempotencyKey && before.dedupe?.[idempotencyKey]){
      const record=before.dedupe[idempotencyKey];
      if(record.fingerprint!==fingerprint)err('cms_idempotency_key_conflict');
      return {document:copy(before),result:copy(record.result),duplicate:true};
    }
    if(before.version!==expectedVersion)err('cms_version_conflict');
    const next=copy(before),result=apply(next);
    if(result?.then)err('cms_transaction_apply_must_be_synchronous');
    next.version=before.version+1;next.updatedAt=new Date().toISOString();
    if(idempotencyKey){
      next.dedupe ||= {};
      next.dedupe[idempotencyKey]={fingerprint,result:{...result,version:next.version}};
    }
    store.pages.set(key(ctx,pageId),copy(next));append(ctx,pageId,next,effect);
    if(effect==='live_publish'){
      const published=copy(before);
      const k=key(ctx,pageId), all=store.publications.get(k)||[];
      all.push({document:published,version:published.version,digest:hash(published)});
      store.publications.set(k,all);
    }
    return {document:copy(next),result:copy(result),duplicate:false};
  };
  return {
    createPage,
    readPage:(ctx,id)=>copy(row(ctx,id)||null),
    mutate,
    history:(ctx,id,limit=30)=>copy((store.revisions.get(key(ctx,id))||[]).slice(-limit).reverse().map(r=>({
      version:r.version,effect:r.effect,createdAt:r.createdAt
    }))),
    getRevision:(ctx,id,version)=>copy((store.revisions.get(key(ctx,id))||[]).find(r=>r.version===version)?.document||null),
    getPublication:(ctx,id,version=null)=>{
      const items=store.publications.get(key(ctx,id))||[];
      return copy((version==null?items.at(-1):items.find(p=>p.version===version))||null);
    },
    stats:ctx=>({
      pages:[...store.pages.keys()].filter(x=>x.startsWith(scopeKey(ctx)+':')).length,
      publications:[...store.publications.keys()].filter(x=>x.startsWith(scopeKey(ctx)+':')).length
    }),
    close:()=>{}
  };
}
