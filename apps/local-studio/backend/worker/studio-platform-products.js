/** HTTP adapter for existing agentsam_products; release state stays read-only. */
const scope = `(json_extract(p.metadata,'$.account_id') = ? OR p.repository_id IN
  (SELECT id FROM code_repositories WHERE account_id = ? AND is_active = 1))`;
const answer = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type':'application/json', 'cache-control':'private, no-store' } });
function metadata(value) { try { const data = JSON.parse(value || '{}'); return data && typeof data === 'object' && !Array.isArray(data) ? data : {}; } catch { return {}; } }
async function revision(row) {
  const bytes = new TextEncoder().encode(JSON.stringify([row.name, row.metadata]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
async function present(row) {
  const data = metadata(row.metadata); const details = data.product_profile || {};
  return { id:row.id, slug:row.slug, name:row.name, kind:row.kind, status:row.status, version:row.version,
    package_name:row.package_name, description:details.description || '', collection:details.collection || '',
    thumbnail_url:details.thumbnail_url || '', revision:await revision(row) };
}
export async function handleStudioPlatformProducts(request, env, userId) {
  if (!userId) return answer({ error:'unauthorized' }, 401);
  if (!env.DB) return answer({ error:'Product registry unavailable' }, 503);
  const url = new URL(request.url);
  const match = /^\/api\/admin\/platform\/products(?:\/(prod_[a-zA-Z0-9_-]+))?$/.exec(url.pathname);
  if (!match) return answer({ error:'Product not found' }, 404);
  if (request.method === 'GET' && !match[1]) {
    const { results } = await env.DB.prepare(`SELECT p.* FROM agentsam_products p WHERE ${scope} ORDER BY lower(p.name),p.id`).bind(userId,userId).all();
    return answer({ products:await Promise.all((results || []).map(present)) });
  }
  if (request.method !== 'PATCH' || !match[1]) return answer({ error:'Method not allowed' }, 405);
  if (request.headers.has('origin') && request.headers.get('origin') !== url.origin) return answer({ error:'Invalid request origin' }, 403);
  const row = await env.DB.prepare(`SELECT p.* FROM agentsam_products p WHERE p.id=? AND ${scope}`).bind(match[1],userId,userId).first();
  if (!row) return answer({ error:'Product not found' }, 404);
  let input; try { input = await request.json(); } catch { return answer({ error:'Invalid JSON' }, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return answer({ error:'Invalid product details' }, 400);
  if (input.revision !== await revision(row)) return answer({ error:'Product changed. Reload before saving your changes.' }, 409);
  if (Object.keys(input).some(key => !['revision','name','description','collection','thumbnail_url'].includes(key))) return answer({ error:'Only product details may be edited here' }, 400);
  const name = String(input.name || '').trim();
  const details = { description:String(input.description || '').trim(), collection:String(input.collection || '').trim(), thumbnail_url:String(input.thumbnail_url || '').trim() };
  if (!name || name.length > 160 || details.description.length > 8000 || details.collection.length > 120 || details.thumbnail_url.length > 2048) return answer({ error:'Invalid product details' }, 400);
  if (details.thumbnail_url && !/^https:\/\/[^\s<>"']+$/.test(details.thumbnail_url) && !/^\/(?!\/)[^\s<>"']+$/.test(details.thumbnail_url)) return answer({ error:'Use a relative or HTTPS image URL' }, 400);
  const next = JSON.stringify({ ...metadata(row.metadata), product_profile:details });
  const result = await env.DB.prepare(`UPDATE agentsam_products AS p SET name=?,metadata=? WHERE p.id=? AND p.name=? AND p.metadata IS ? AND ${scope}`)
    .bind(name,next,row.id,row.name,row.metadata,userId,userId).run();
  if (result.meta?.changes !== 1) return answer({ error:'Product changed. Reload before saving your changes.' }, 409);
  return answer({ ok:true, product:await present({ ...row,name,metadata:next }) });
}
