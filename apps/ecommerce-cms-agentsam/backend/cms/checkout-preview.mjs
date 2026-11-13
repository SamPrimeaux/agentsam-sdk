/**
 * Account-owned, provider-free checkout journey for merchant UX acceptance.
 * No card data, provider tokens, real orders, payments, subscriptions or
 * entitlements are ever created here. Persistent in CMS D1, independent of
 * the real payment provider and the shared order ledger.
 */
const STEPS=['choose-plan','start-trial','goals','setup','first-run'];
const GOALS=new Set(['website','store','branding','content','automation','analytics','ai-assistant']);
const sitePattern=/^[a-zA-Z0-9_-]{1,120}$/;
const bodyLimit=16_000;
const json=(value,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
function failure(error,status=400){return json({ok:false,error},status);}
function text(value,max=100){
  return typeof value==='string'&&value.trim()&&value.trim().length<=max ? value.trim():null;
}
function decoded(row){
  if(!row)return null;
  let journey={};
  try{journey=JSON.parse(row.journey_json||'{}');}catch{}
  return {
    id:row.id,site_id:row.site_id,customer_label:row.customer_label,
    selected_offer_sku:row.selected_offer_sku,step:row.step,status:row.status,
    journey,revision:row.revision,updated_at:row.updated_at,
  };
}
async function site(db,accountId,siteId){
  if(!sitePattern.test(siteId||''))return null;
  const row=await db.prepare(
    "SELECT id,account_id,name,status FROM cms_sites WHERE id=? AND account_id=? AND status!='archived' LIMIT 1"
  ).bind(siteId,accountId).first();
  return row||null;
}
async function isPlatformAccount(db,accountId){
  const row=await db.prepare("SELECT account_id FROM cms_definitions WHERE id='cmsd_store_global_header' LIMIT 1").first();
  return row?.account_id===accountId;
}
async function offers(env,accountId,siteId){
  // products_catalog is a legacy platform pricing inventory, not an
  // account-scoped merchant table. Only the platform owner's previews see it.
  if(await isPlatformAccount(env.DB,accountId)){
    const {results=[]}=await env.DB.prepare(
      "SELECT id,name,tagline,price_cents,billing_interval,product_line FROM products_catalog WHERE is_active=1 AND price_cents>=0 ORDER BY sort_order,id LIMIT 60"
    ).all();
    return results.map(row=>({id:String(row.id),name:row.name,
      description:row.tagline||'',price_cents:row.price_cents,
      billing_interval:row.billing_interval||'one_time',
      category:row.product_line}));
  }
  // Other accounts see only products on their own selected site. Older
  // standalone ecommerce databases predate products.site_id: they must NOT
  // expose an unscoped global product inventory in a multi-tenant preview.
  const columns=await env.DB.prepare('PRAGMA table_info(products)').all();
  if(!(columns.results||[]).some(column=>column.name==='site_id'))return [];
  const {results=[]}=await env.DB.prepare(
    "SELECT id,title,description,price_cents,product_kind FROM products WHERE site_id=? AND status='active' AND price_cents>=0 ORDER BY id LIMIT 60"
  ).bind(siteId).all();
  return results.map(row=>({id:'product:'+row.id,name:row.title,
    description:row.description||'',price_cents:row.price_cents,
    billing_interval:'one_time',category:row.product_kind}));
}
async function readBody(request){
  if(Number(request.headers.get('content-length')||0)>bodyLimit)return null;
  try{
    const source=await request.text();
    if(source.length>bodyLimit)return null;
    const body=JSON.parse(source);
    return body&&typeof body==='object'&&!Array.isArray(body)?body:null;
  }catch{return null;}
}
async function previewById(env,accountId,siteId,id){
  return env.DB.prepare(
    'SELECT * FROM cms_checkout_previews WHERE id=? AND account_id=? AND site_id=? LIMIT 1'
  ).bind(id,accountId,siteId).first();
}

export async function handleCheckoutPreviewApi(request,env,url,{accountId}={}){
  const prefix='/api/admin/cms/checkout-previews';
  const pathname=url.pathname;
  if(pathname!==prefix&&!pathname.startsWith(prefix+'/'))return null;
  if(!accountId)return failure('account_required',403);
  const method=request.method;
  const siteId=url.searchParams.get('site_id');
  const current=await site(env.DB,accountId,siteId);
  if(!current)return failure('site_not_found',404);
  if(pathname===prefix+'/offers'&&method==='GET'){
    return json({ok:true,mode:'preview',payment_provider:null,site_id:current.id,
      offers:await offers(env,accountId,current.id)});
  }
  if(pathname===prefix&&method==='GET'){
    const {results=[]}=await env.DB.prepare(
      'SELECT * FROM cms_checkout_previews WHERE account_id=? AND site_id=? ORDER BY updated_at DESC LIMIT 20'
    ).bind(accountId,current.id).all();
    return json({ok:true,previews:results.map(decoded)});
  }
  if(pathname===prefix&&method==='POST'){
    const body=await readBody(request);
    if(!body)return failure('invalid_preview_body');
    if(Object.keys(body).some(key=>!['offer_id','customer_label'].includes(key)))
      return failure('unsupported_preview_field');
    const label=text(body.customer_label,120)||'customer123';
    if(body.customer_label!=null&&!text(body.customer_label,120))return failure('customer_label_invalid');
    const selected=typeof body.offer_id==='string'?body.offer_id:'';
    const available=await offers(env,accountId,current.id);
    const offer=available.find(row=>row.id===selected);
    if(!offer)return failure('offer_not_available_for_site',422);
    const id='cprev_'+crypto.randomUUID().replaceAll('-','').slice(0,24);
    const journey={offer,goals:[],site_name:current.name};
    await env.DB.prepare(
      "INSERT INTO cms_checkout_previews(id,account_id,site_id,customer_label,selected_offer_sku,step,status,journey_json) VALUES (?,?,?,?,?,'start-trial','draft',?)"
    ).bind(id,accountId,current.id,label,selected,JSON.stringify(journey)).run();
    return json({ok:true,mode:'preview',preview:decoded(await previewById(env,accountId,current.id,id))},201);
  }
  const match=/^\/api\/admin\/cms\/checkout-previews\/(cprev_[a-f0-9]{24})$/.exec(pathname);
  if(!match)return failure('preview_not_found',404);
  const row=await previewById(env,accountId,current.id,match[1]);
  if(!row)return failure('preview_not_found',404);
  if(method==='GET')return json({ok:true,mode:'preview',preview:decoded(row)});
  if(method!=='PATCH')return failure('method_not_allowed',405);
  const body=await readBody(request);
  if(!body)return failure('invalid_preview_body');
  if(Object.keys(body).some(key=>!['expected_revision','step','goals','site_name'].includes(key)))
    return failure('unsupported_preview_field');
  if(!Number.isInteger(body.expected_revision)||body.expected_revision<1)
    return failure('expected_revision_required',400);
  if(body.expected_revision!==row.revision)return failure('preview_changed_reload',409);
  if(row.status!=='draft')return failure('preview_already_finished',409);
  const next=String(body.step||'');
  const currentIndex=STEPS.indexOf(row.step),nextIndex=STEPS.indexOf(next);
  if(nextIndex<0||nextIndex>currentIndex+1)
    return failure('preview_step_out_of_order',422);
  let journey;
  try{journey=JSON.parse(row.journey_json||'{}');}catch{return failure('preview_state_corrupt',409);}
  if(body.goals!==undefined){
    if(next!=='goals'&&next!=='setup')return failure('goals_step_required',422);
    if(!Array.isArray(body.goals)||body.goals.length>GOALS.size||
        body.goals.some(value=>!GOALS.has(value)))
      return failure('invalid_preview_goals');
    journey.goals=[...new Set(body.goals)];
  }
  if(body.site_name!==undefined){
    if(next!=='setup'&&next!=='first-run')return failure('setup_step_required',422);
    const name=text(body.site_name,100);
    if(!name)return failure('invalid_preview_site_name');
    journey.site_name=name;
  }
  const status=next==='first-run'?'completed':'draft';
  // A completed preview is not a paid order, an entitlement, or an account.
  const saved=await env.DB.prepare(
    "UPDATE cms_checkout_previews SET step=?,status=?,journey_json=?,revision=revision+1,updated_at=unixepoch() WHERE id=? AND account_id=? AND site_id=? AND revision=? AND status='draft'"
  ).bind(next,status,JSON.stringify(journey),row.id,accountId,current.id,row.revision).run();
  if(!saved.meta?.changes)return failure('preview_changed_reload',409);
  return json({ok:true,mode:'preview',preview:decoded(await previewById(env,accountId,current.id,row.id))});
}
