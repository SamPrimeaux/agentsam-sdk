/** HTTP adapter for the canonical products table. Release records remain read-only. */
const scope = `(p.account_id = ? OR p.repository_id IN
  (SELECT id FROM code_repositories WHERE account_id = ? AND is_active = 1)
  OR p.site_id IN (SELECT id FROM cms_sites WHERE account_id = ?))`;
const answer = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
});
async function revision(row) {
  const bytes = new TextEncoder().encode(JSON.stringify([
    row.id, row.slug, row.title, row.description, row.collection, row.image_url,
    row.catalog_kind, row.lifecycle_status, row.package_name, row.version, row.metadata_json,
    row.repository_id, row.display_name, row.sku, row.catalog_visibility,
    row.product_kind, row.status, row.site_id, row.account_id, row.updated_at,
  ]));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    value => value.toString(16).padStart(2, '0')).join('');
}
async function present(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.title,
    kind: row.catalog_kind || row.product_kind,
    status: row.lifecycle_status || row.status,
    commerce_status: row.status,
    product_kind: row.product_kind,
    site_id: row.site_id || null,
    version: row.version || null,
    package_name: row.package_name || null,
    repository_id: row.repository_id || null,
    display_name: row.display_name || null,
    catalog_visibility: row.catalog_visibility || 'internal',
    sku: row.sku || null,
    price_cents: Number(row.price_cents || 0),
    description: row.description || '',
    collection: row.collection || '',
    thumbnail_url: row.image_url || '',
    revision: await revision(row),
  };
}

export async function handleStudioPlatformProducts(request, env, userId) {
  if (!userId) return answer({ error: 'unauthorized' }, 401);
  if (!env.DB) return answer({ error: 'Product catalog unavailable' }, 503);
  const url = new URL(request.url);
  const match = /^\/api\/admin\/platform\/products(?:\/(\d+))?$/.exec(url.pathname);
  if (!match) return answer({ error: 'Product not found' }, 404);

  if (request.method === 'GET' && !match[1]) {
    const { results } = await env.DB.prepare(
      `SELECT p.* FROM products p WHERE ${scope}
       ORDER BY lower(COALESCE(p.display_name,p.title)), p.id`
    ).bind(userId, userId, userId).all();
    return answer({ products: await Promise.all((results || []).map(present)) });
  }

  if (request.method !== 'PATCH' || !match[1]) return answer({ error: 'Method not allowed' }, 405);
  if (request.headers.has('origin') && request.headers.get('origin') !== url.origin)
    return answer({ error: 'Invalid request origin' }, 403);

  const row = await env.DB.prepare(
    `SELECT p.* FROM products p WHERE p.id = ? AND ${scope}`
  ).bind(Number(match[1]), userId, userId, userId).first();
  if (!row) return answer({ error: 'Product not found' }, 404);

  let input;
  try { input = await request.json(); } catch { return answer({ error: 'Invalid JSON' }, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input))
    return answer({ error: 'Invalid product details' }, 400);
  if (input.revision !== await revision(row))
    return answer({ error: 'Product changed. Reload before saving your changes.' }, 409);
  if (Object.keys(input).some(key => !['revision', 'name', 'description', 'collection', 'thumbnail_url'].includes(key)))
    return answer({ error: 'Only product presentation details may be edited here' }, 400);

  const name = String(input.name ?? '').trim();
  const description = String(input.description ?? '').trim();
  const collection = String(input.collection ?? '').trim();
  const thumbnailUrl = input.thumbnail_url === undefined ? (row.image_url || '') : String(input.thumbnail_url ?? '').trim();
  if (!name || name.length > 160 || description.length > 8000 ||
      collection.length > 120 || thumbnailUrl.length > 2048)
    return answer({ error: 'Invalid product details' }, 400);
  if (thumbnailUrl && !/^https:\/\/[^\s<>"']+$/.test(thumbnailUrl) &&
      !/^\/(?!\/)[^\s<>"']+$/.test(thumbnailUrl))
    return answer({ error: 'Use a relative or HTTPS image URL' }, 400);

  const result = await env.DB.prepare(
    `UPDATE products AS p
       SET title = ?, description = ?, collection = ?, image_url = ?, updated_at = datetime('now')
     WHERE p.id = ? AND p.slug = ? AND p.title = ? AND p.description IS ?
       AND p.collection IS ? AND p.image_url IS ? AND p.catalog_kind IS ?
       AND p.lifecycle_status IS ? AND p.package_name IS ? AND p.version IS ?
       AND p.metadata_json IS ? AND p.repository_id IS ? AND p.display_name IS ?
       AND p.sku IS ? AND p.catalog_visibility = ? AND p.product_kind = ?
       AND p.status = ? AND p.site_id IS ? AND p.account_id IS ? AND p.updated_at IS ?
       AND ${scope}`
  ).bind(
    name, description, collection, thumbnailUrl || null,
    row.id, row.slug, row.title, row.description, row.collection, row.image_url,
    row.catalog_kind, row.lifecycle_status, row.package_name, row.version,
    row.metadata_json, row.repository_id, row.display_name, row.sku,
    row.catalog_visibility, row.product_kind, row.status, row.site_id, row.account_id, row.updated_at,
    userId, userId, userId,
  ).run();
  if (result.meta?.changes !== 1)
    return answer({ error: 'Product changed. Reload before saving your changes.' }, 409);

  const updated = await env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(row.id).first();
  return answer({ product: await present(updated) });
}
