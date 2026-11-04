import { collectionScope, listCmsCollections, getCmsCollection } from '../cms/collection-store.mjs';

async function publicScope(env,url) {
  if(!url)throw new Error('storefront_host_required');
  // The request hostname selects a verified site; callers cannot choose another tenant by ID.
  return collectionScope(env,{hostname:new URL(url).hostname});
}
function unavailable(error) {
  const message=String(error.message||error);
  return Response.json({ok:false,error:/cms_site|storefront_host/.test(message)?'storefront_site_not_found':'storefront_collections_unavailable'},
    {status:/cms_site|storefront_host/.test(message)?404:503});
}
export async function listStoreCollections(env,url) {
  try {
    const scope=await publicScope(env,url);
    return Response.json({ok:true,collections:await listCmsCollections(env,scope,{publicOnly:true})});
  } catch(error) {return unavailable(error);}
}
export async function getStoreCollection(env,slug,url) {
  try {
    const scope=await publicScope(env,url);
    const collection=await getCmsCollection(env,scope,slug,{bySlug:true,publicOnly:true});
    if(!collection)return Response.json({ok:false,error:'Collection not found'},{status:404});
    const {results=[]}=await env.DB.prepare(`SELECT p.*,
      (SELECT count(*) FROM product_variants v WHERE v.product_id=p.id) AS variant_count,
      (SELECT COALESCE(sum(v.inventory_qty),0) FROM product_variants v WHERE v.product_id=p.id) AS total_inventory,
      (SELECT group_concat(DISTINCT v.size) FROM product_variants v WHERE v.product_id=p.id) AS sizes
      FROM cms_collection_items i JOIN products p ON CAST(p.id AS TEXT)=i.item_ref AND p.site_id=i.site_id
      WHERE i.collection_id=? AND i.site_id=? AND i.account_id=? AND i.item_type='product' AND i.status='active'
      AND p.status='active' ORDER BY i.sort_order,i.id LIMIT 100`)
      .bind(collection.id,scope.id,scope.account_id).all();
    return Response.json({ok:true,collection:{...collection,product_count:results.length},
      products:results.map(p=>({...p,primary_image:p.image_url,price:(p.price_cents/100).toFixed(2)}))});
  } catch(error) {return unavailable(error);}
}
