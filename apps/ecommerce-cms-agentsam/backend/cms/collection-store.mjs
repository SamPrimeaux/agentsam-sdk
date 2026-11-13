import { resolveCmsSite } from './site-context.mjs';
import { normalizeCollectionRules } from '@inneranimalmedia/agentsam-merch/collection-planning';

const TYPES = new Set(['product','asset','content','page']);
const fail = (code,status=400) => { const error=new Error(code); error.status=status; throw error; };
const parse = (value,fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const identifier = value => typeof value==='string' && /^[A-Za-z0-9_-]{1,180}$/.test(value);
const text = (value,max,key) => { const s=String(value??'').trim(); if(s.length>max)fail(key); return s; };
export async function collectionScope(env,{accountId,siteId=null,hostname=null}={}) {
  if(!accountId && !hostname)fail('cms_collection_account_required',403);
  return resolveCmsSite(env.DB,{accountId,siteId,hostname});
}
export function collectionJson(row) {
  if(!row)return null;
  const parsed=parse(row.metadata_json||'{}',{});
  const metadata=parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  return {...row,title:row.name,image_url:metadata.image_url||metadata.thumbnail_url||null,
    tags:parse(row.tags_json||'[]',[]),allowed_item_types:parse(row.allowed_item_types_json||'[]',[]),
    metadata,product_count:Number(row.product_count||0)};
}
const selection = `SELECT c.*,
  (SELECT count(*) FROM cms_collection_items i WHERE i.collection_id=c.id
    AND i.site_id=c.site_id AND i.account_id=c.account_id AND i.item_type='product' AND i.status='active') AS product_count
  FROM cms_collections c`;
export async function listCmsCollections(env,scope,{publicOnly=false}={}) {
  const {results=[]}=await env.DB.prepare(selection+
    " WHERE c.site_id=? AND c.account_id=?"+(publicOnly?" AND c.status='active' AND c.visibility='public'":"")+
    " ORDER BY c.sort_order,lower(c.name),c.id").bind(scope.id,scope.account_id).all();
  return results.map(collectionJson);
}
export async function getCmsCollection(env,scope,id,{bySlug=false,publicOnly=false}={}) {
  const row=await env.DB.prepare(selection+" WHERE c.site_id=? AND c.account_id=? AND c."+
    (bySlug?'slug':'id')+"=?"+(publicOnly?" AND c.status='active' AND c.visibility='public'":"")+" LIMIT 1")
    .bind(scope.id,scope.account_id,String(id)).first();
  return collectionJson(row);
}
function values(input,previous=null) {
  const name=text(input.name??input.title??previous?.name,120,'collection_name_too_long');
  if(!name)fail('collection_name_required');
  const slug=text(input.slug??previous?.slug??name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),180,'collection_slug_too_long');
  if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail('collection_slug_invalid');
  const status=input.status??previous?.status??'draft';
  const visibility=input.visibility??previous?.visibility??'public';
  if(!['draft','active','archived'].includes(status)||!['public','private','unlisted'].includes(visibility))fail('collection_state_invalid');
  const allowed=input.allowed_item_types??previous?.allowed_item_types??['product','asset','content','page'];
  if(!Array.isArray(allowed)||!allowed.length||allowed.some(t=>!TYPES.has(t)))fail('collection_item_types_invalid');
  const tags=input.tags??previous?.tags??[];
  if(!Array.isArray(tags)||tags.length>100||tags.some(t=>typeof t!=='string'||t.length>120))fail('collection_tags_invalid');
  const sort=input.sort_order??previous?.sort_order??0;
  if(!Number.isSafeInteger(sort))fail('collection_order_invalid');
  const metadata={...(previous?.metadata||{})};
  // Collections Studio presentation lives with the canonical site-owned
  // collection, not in a second merchant table or an unscoped global preset.
  if(Object.hasOwn(input,'eyebrow')) metadata.eyebrow=text(input.eyebrow,120,'collection_eyebrow_invalid');
  if(Object.hasOwn(input,'accent_color')) {
    const color=text(input.accent_color,30,'collection_accent_invalid');
    if(!/^#[0-9a-fA-F]{6}$/.test(color))fail('collection_accent_invalid');
    metadata.accent_color=color;
  }
  if(Object.hasOwn(input,'hero_settings_json')) {
    const hero=typeof input.hero_settings_json==='string'
      ?parse(input.hero_settings_json,null):input.hero_settings_json;
    if(!hero||typeof hero!=='object'||Array.isArray(hero)||JSON.stringify(hero).length>8000)
      fail('collection_hero_invalid');
    metadata.merch_hero=hero;
  }
  if(Object.hasOwn(input,'product_plan_json')) {
    const plan=typeof input.product_plan_json==='string'
      ?parse(input.product_plan_json,null):input.product_plan_json;
    if(!Array.isArray(plan)||plan.length>100||plan.some(p=>!p||typeof p.catalog_product_id!=='string'||p.catalog_product_id.length>160))
      fail('collection_plan_invalid');
    metadata.merch_plan=plan;
  }
  if(Object.hasOwn(input,'merch_rules')) {
    try {
      metadata.merch_rules=normalizeCollectionRules(input.merch_rules);
    } catch {
      fail('collection_membership_rules_invalid',422);
    }
  }
  if(JSON.stringify(metadata).length>16000)fail('collection_metadata_too_large');
  if(Object.hasOwn(input,'image_url')) {
    const image=text(input.image_url,2048,'collection_image_invalid');
    if(image&&!/^https?:\/\//.test(image)&&!/^\/(?!\/)/.test(image))fail('collection_image_invalid');
    metadata.image_url=image||null;
  }
  return {name,slug,description:text(input.description??previous?.description,20000,'collection_description_too_long'),
    status,visibility,sort,allowed:[...new Set(allowed)],tags,metadata,
    seo_title:text(input.seo_title??previous?.seo_title,180,'collection_seo_title_too_long'),
    seo_description:text(input.seo_description??previous?.seo_description,320,'collection_seo_description_too_long')};
}
export async function saveCmsCollection(env,scope,input={},id=null) {
  const previous=id?await getCmsCollection(env,scope,id):null;
  if(id&&!previous)fail('collection_not_found',404);
  if(input.kind && input.kind!=='manual')fail('smart_collection_rule_editor_unavailable',422);
  const v=values(input,previous);
  const key=id||'cmscol_'+crypto.randomUUID().replaceAll('-','');
  const previousMillis=typeof previous?.updated_at==='string'?Date.parse(previous.updated_at):Number(previous?.updated_at);
  const timestamp=new Date(Math.max(Date.now(),Number.isFinite(previousMillis)?previousMillis+1:0)).toISOString();
  if(previous) {
    const expected=input.expected_updated_at??previous.updated_at;
    const result=await env.DB.prepare(`UPDATE cms_collections SET name=?,slug=?,description=?,allowed_item_types_json=?,tags_json=?,
      seo_title=?,seo_description=?,status=?,visibility=?,sort_order=?,metadata_json=?,updated_at=?
      WHERE id=? AND site_id=? AND account_id=? AND updated_at=?`)
      .bind(v.name,v.slug,v.description,JSON.stringify(v.allowed),JSON.stringify(v.tags),v.seo_title,v.seo_description,v.status,v.visibility,v.sort,
        JSON.stringify(v.metadata),timestamp,key,scope.id,scope.account_id,expected).run();
    if(!result.meta?.changes)fail('collection_changed_reload_before_saving',409);
  } else {
    await env.DB.prepare(`INSERT INTO cms_collections
      (id,account_id,site_id,name,slug,description,kind,allowed_item_types_json,tags_json,seo_title,seo_description,status,visibility,sort_order,metadata_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,'manual',?,?,?,?,?,?,?,?,?,?)`)
      .bind(key,scope.account_id,scope.id,v.name,v.slug,v.description,JSON.stringify(v.allowed),JSON.stringify(v.tags),v.seo_title,v.seo_description,
        v.status,v.visibility,v.sort,JSON.stringify(v.metadata),timestamp,timestamp).run();
  }
  return getCmsCollection(env,scope,key);
}
export async function listCmsCollectionItems(env,scope,id,{publicOnly=false,limit=100,offset=0}={}) {
  const collection=await getCmsCollection(env,scope,id,{publicOnly});
  if(!collection)fail('collection_not_found',404);
  if(!Number.isSafeInteger(limit)||limit<1||limit>100||!Number.isSafeInteger(offset)||offset<0)fail('collection_pagination_invalid');
  const {results=[]}=await env.DB.prepare(`SELECT id,item_type,item_ref,sort_order,status,presentation_json FROM cms_collection_items
    WHERE collection_id=? AND site_id=? AND account_id=?`+(publicOnly?" AND status='active'":"")+
    " ORDER BY sort_order,id LIMIT ? OFFSET ?").bind(id,scope.id,scope.account_id,limit,offset).all();
  return results;
}
async function authorizeItem(env,scope,item) {
  if(item.item_type==='product') return Boolean(await env.DB.prepare('SELECT id FROM products WHERE CAST(id AS TEXT)=? AND site_id=?')
    .bind(item.item_ref,scope.id).first());
  if(item.item_type==='page') return Boolean(await env.DB.prepare('SELECT id FROM cms_pages WHERE id=? AND site_id=? AND account_id=?')
    .bind(item.item_ref,scope.id,scope.account_id).first());
  // Shared media/content ownership belongs to its installed resolver, not a second CMS registry.
  return typeof env.resolveCmsCollectionItem==='function' &&
    Boolean(await env.resolveCmsCollectionItem({accountId:scope.account_id,siteId:scope.id,...item}));
}
export async function replaceCmsCollectionItems(env,scope,id,items) {
  const collection=await getCmsCollection(env,scope,id);
  if(!collection)fail('collection_not_found',404);
  if(collection.kind!=='manual')fail('smart_collection_membership_is_rule_owned',422);
  if(!Array.isArray(items)||items.length>1000)fail('collection_items_invalid');
  const {results:existing=[]}=await env.DB.prepare('SELECT id,item_type,item_ref,presentation_json FROM cms_collection_items WHERE collection_id=? AND site_id=? AND account_id=?')
    .bind(id,scope.id,scope.account_id).all();
  const byRef=new Map(existing.map(row=>[row.item_type+':'+row.item_ref,row]));
  const seen=new Set(),writes=[];
  for(let index=0;index<items.length;index++) {
    const item=items[index];
    if(!item||!TYPES.has(item.item_type)||!identifier(String(item.item_ref||''))||
      !collection.allowed_item_types.includes(item.item_type))fail('collection_item_invalid');
    const ref=String(item.item_ref),key=item.item_type+':'+ref;
    if(seen.has(key))fail('collection_item_duplicate');
    seen.add(key);
    if(!await authorizeItem(env,scope,{...item,item_ref:ref}))fail('collection_item_not_found_or_unauthorized',404);
    const status=item.status??'active';
    if(!['active','hidden','archived'].includes(status))fail('collection_item_status_invalid');
    writes.push(env.DB.prepare(`INSERT INTO cms_collection_items
      (id,account_id,site_id,collection_id,item_type,item_ref,sort_order,status,presentation_json)
      VALUES (?,?,?,?,?,?,?,?,?)`).bind(byRef.get(key)?.id||'cmscoli_'+crypto.randomUUID().replaceAll('-',''),scope.account_id,scope.id,id,item.item_type,ref,index,status,byRef.get(key)?.presentation_json||'{}'));
  }
  await env.DB.batch([env.DB.prepare('DELETE FROM cms_collection_items WHERE collection_id=? AND site_id=? AND account_id=?')
    .bind(id,scope.id,scope.account_id),...writes]);
  return listCmsCollectionItems(env,scope,id);
}
export async function productCollectionIds(env,scope,productId) {
  const {results=[]}=await env.DB.prepare(`SELECT i.collection_id FROM cms_collection_items i JOIN cms_collections c ON c.id=i.collection_id
    WHERE i.site_id=? AND i.account_id=? AND c.site_id=i.site_id AND c.account_id=i.account_id
      AND i.item_type='product' AND i.item_ref=? AND i.status='active' ORDER BY i.sort_order,i.collection_id`)
    .bind(scope.id,scope.account_id,String(productId)).all();
  return results.map(r=>r.collection_id);
}
/** Caller includes these statements in its existing atomic product/variant save. */
export async function productCollectionWrites(env,scope,productId,ids) {
  if(!Array.isArray(ids)||ids.length>100||ids.some(id=>!identifier(id))||new Set(ids).size!==ids.length)fail('collection_selection_invalid');
  for(const id of ids) {
    const collection=await getCmsCollection(env,scope,id);
    if(!collection||collection.kind!=='manual'||!collection.allowed_item_types.includes('product'))fail('collection_not_found_or_unauthorized',404);
  }
  if(!await authorizeItem(env,scope,{item_type:'product',item_ref:String(productId)}))fail('product_not_found',404);
  const {results:existing=[]}=await env.DB.prepare("SELECT id,collection_id,sort_order FROM cms_collection_items WHERE site_id=? AND account_id=? AND item_type='product' AND item_ref=?")
    .bind(scope.id,scope.account_id,String(productId)).all();
  const byCollection=new Map(existing.map(row=>[row.collection_id,row]));
  const remove=existing.filter(row=>!ids.includes(row.collection_id));
  const writes=remove.map(row=>env.DB.prepare('DELETE FROM cms_collection_items WHERE id=? AND site_id=? AND account_id=?')
    .bind(row.id,scope.id,scope.account_id));
  for(const id of ids) {
    const old=byCollection.get(id);
    if(old) {
      writes.push(env.DB.prepare("UPDATE cms_collection_items SET status='active' WHERE id=? AND site_id=? AND account_id=?")
        .bind(old.id,scope.id,scope.account_id));
    } else {
      writes.push(env.DB.prepare(`INSERT INTO cms_collection_items
        (id,account_id,site_id,collection_id,item_type,item_ref,sort_order)
        VALUES (?,?,?,?,'product',?,(SELECT COALESCE(MAX(sort_order),-1)+1 FROM cms_collection_items WHERE collection_id=?))`)
        .bind('cmscoli_'+crypto.randomUUID().replaceAll('-',''),scope.account_id,scope.id,id,String(productId),id));
    }
  }
  return writes;
}
export async function handleCollectionApi(request,env,url,context) {
  const match=url.pathname.match(/^\/api\/admin\/(?:cms\/)?collections(?:\/([A-Za-z0-9_-]+)(\/items)?)?$/);
  if(!match)return null;
  try {
    const scope=await collectionScope(env,{accountId:context.accountId,siteId:url.searchParams.get('site_id')});
    const [,id,items]=match;
    if(!id&&request.method==='GET')return Response.json({ok:true,site_id:scope.id,collections:await listCmsCollections(env,scope)});
    if(!id&&request.method==='POST')return Response.json({ok:true,site_id:scope.id,collection:await saveCmsCollection(env,scope,await request.json())},{status:201});
    if(id&&!items&&request.method==='GET') {
      const collection=await getCmsCollection(env,scope,id);
      if(!collection)fail('collection_not_found',404);
      return Response.json({ok:true,site_id:scope.id,collection});
    }
    if(id&&!items&&request.method==='PUT')return Response.json({ok:true,collection:await saveCmsCollection(env,scope,await request.json(),id)});
    if(id&&items&&request.method==='GET')return Response.json({ok:true,items:await listCmsCollectionItems(env,scope,id,{
      limit:Number(url.searchParams.get('limit')||100),offset:Number(url.searchParams.get('offset')||0)})});
    if(id&&items&&request.method==='PUT')return Response.json({ok:true,items:await replaceCmsCollectionItems(env,scope,id,(await request.json()).items)});
    return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  } catch(error) {
    const message=String(error.message||error);
    const status=error.status||(/unique/i.test(message)?409:/cms_site_not_found/.test(message)?404:/cms_site_required|selection_required/.test(message)?409:/no such (?:column|table)/.test(message)?503:400);
    return Response.json({ok:false,error:status===503?'cms_collection_migration_required':message},{status});
  }
}
