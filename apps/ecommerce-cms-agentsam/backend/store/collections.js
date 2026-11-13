import { collectionScope, listCmsCollections, getCmsCollection } from '../cms/collection-store.mjs';
import { normalizeCollectionRules, resolveCollectionMembers } from '@inneranimalmedia/agentsam-merch/collection-planning';

async function publicScope(env,url) {
  if(!url)throw new Error('storefront_host_required');
  // The request hostname selects a verified site; never let a customer choose another tenant.
  return collectionScope(env,{hostname:new URL(url).hostname});
}
function unavailable(error) {
  const message=String(error.message||error);
  return Response.json({ok:false,error:/cms_site|storefront_host/.test(message)?'storefront_site_not_found':'storefront_collections_unavailable'},
    {status:/cms_site|storefront_host/.test(message)?404:503});
}
function presentation(collection) {
  const meta=collection.metadata||{};
  return {...collection,eyebrow:String(meta.eyebrow||''),
    accent_color:String(meta.accent_color||'#ff7619'),
    hero_settings_json:JSON.stringify(meta.merch_hero||{}),
    product_plan_json:JSON.stringify(meta.merch_plan||[])};
}
async function catalog(env,scope) {
  const {results=[]}=await env.DB.prepare(`SELECT p.*,
    (SELECT count(*) FROM product_variants v WHERE v.product_id=p.id) AS variant_count,
    (SELECT COALESCE(sum(v.inventory_qty),0) FROM product_variants v WHERE v.product_id=p.id) AS total_inventory,
    (SELECT group_concat(DISTINCT v.size) FROM product_variants v WHERE v.product_id=p.id) AS sizes
    FROM products p WHERE p.site_id=? AND p.status='active' ORDER BY p.updated_at DESC,p.id`)
    .bind(scope.id).all();
  return results;
}
async function memberships(env,scope) {
  const {results=[]}=await env.DB.prepare(`SELECT collection_id,item_ref FROM cms_collection_items
    WHERE site_id=? AND account_id=? AND item_type='product' AND status='active'
    ORDER BY collection_id,sort_order,id`).bind(scope.id,scope.account_id).all();
  const byCollection=new Map();
  for(const row of results) {
    const ids=byCollection.get(row.collection_id)||[];
    ids.push(Number(row.item_ref));byCollection.set(row.collection_id,ids);
  }
  return byCollection;
}
function activeMembers(collection,products,mapped) {
  const rules=normalizeCollectionRules(collection.metadata?.merch_rules||{});
  return resolveCollectionMembers(products,mapped||[],rules);
}
export async function listStoreCollections(env,url) {
  try {
    const scope=await publicScope(env,url);
    const collections=await listCmsCollections(env,scope,{publicOnly:true});
    if(!collections.length)return Response.json({ok:true,collections:[]});
    const [products,mapped]=await Promise.all([catalog(env,scope),memberships(env,scope)]);
    return Response.json({ok:true,collections:collections.map(c=>({
      ...presentation(c),product_count:activeMembers(c,products,mapped.get(c.id)).length,
    }))});
  } catch(error) {return unavailable(error);}
}
export async function getStoreCollection(env,slug,url) {
  try {
    const scope=await publicScope(env,url);
    const collection=await getCmsCollection(env,scope,slug,{bySlug:true,publicOnly:true});
    if(!collection)return Response.json({ok:false,error:'Collection not found'},{status:404});
    const [products,mapped]=await Promise.all([catalog(env,scope),memberships(env,scope)]);
    const ids=activeMembers(collection,products,mapped.get(collection.id));
    const byId=new Map(products.map(p=>[Number(p.id),p]));
    const result=ids.slice(0,100).map(id=>byId.get(id)).filter(Boolean);
    return Response.json({ok:true,collection:{...presentation(collection),product_count:ids.length},
      products:result.map(p=>({...p,primary_image:p.image_url,price:(p.price_cents/100).toFixed(2)}))});
  } catch(error) {return unavailable(error);}
}
