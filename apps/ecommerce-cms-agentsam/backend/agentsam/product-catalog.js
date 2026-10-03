/** Created assets only. Import/provider catalog code must never call this API. */
export async function resolveRepository(db, { provider, fullName, accountId }) {
  if (!provider || !fullName || !accountId) throw new Error('Repository identity and account are required');
  const { results } = await db.prepare('SELECT id FROM code_repositories WHERE provider=? AND lower(repo_full_name)=lower(?) AND account_id=? AND is_active=1')
    .bind(provider, fullName, accountId).all();
  if (results.length !== 1) throw new Error('RepositoryNotRegisteredOrAmbiguous');
  return results[0];
}
export async function recordCreatedProduct(db, product, creation) {
  if (!['developer','agentsam'].includes(creation?.origin) || !creation.accountId) throw new Error('Created-product provenance required');
  if (!product.source_type || !product.source_id || /^completeful/i.test(product.source_type)) throw new Error('A created resource source is required');
  const repository = product.repository ? await resolveRepository(db, {...product.repository, accountId: creation.accountId}) : null;
  const existing = await db.prepare('SELECT id,metadata FROM agentsam_products WHERE slug=?').bind(product.slug).first();
  if (existing && JSON.parse(existing.metadata).account_id !== creation.accountId) throw new Error('Product belongs to another account');
  const id = existing?.id || `prod_${crypto.randomUUID()}`;
  const result = await db.prepare(`INSERT INTO agentsam_products(id,slug,name,kind,status,repository_id,source_type,source_id,canonical_path,package_name,metadata)
    VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name,kind=excluded.kind,status=excluded.status,repository_id=excluded.repository_id,source_type=excluded.source_type,source_id=excluded.source_id,canonical_path=excluded.canonical_path,package_name=excluded.package_name,metadata=excluded.metadata
    WHERE json_extract(agentsam_products.metadata,'$.account_id')=json_extract(excluded.metadata,'$.account_id')`)
    .bind(id,product.slug,product.name,product.kind,product.status || 'prototype',repository?.id || null,product.source_type,product.source_id,product.canonical_path || null,product.package_name || null,JSON.stringify({...product.metadata,origin:creation.origin,account_id:creation.accountId})).run();
  if (!result.meta?.changes) throw new Error('Product belongs to another account');
  const saved = await db.prepare('SELECT id FROM agentsam_products WHERE slug=?').bind(product.slug).first();
  return {id:saved.id};
}
