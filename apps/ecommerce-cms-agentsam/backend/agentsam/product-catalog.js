/** Created assets are product records; imports and provider catalogs never call this adapter. */
export async function resolveRepository(db, { provider, fullName, accountId }) {
  if (!provider || !fullName || !accountId) throw new Error('Repository identity and account are required');
  const { results } = await db.prepare(
    'SELECT id FROM code_repositories WHERE provider=? AND lower(repo_full_name)=lower(?) AND account_id=? AND is_active=1'
  ).bind(provider, fullName, accountId).all();
  if (results.length !== 1) throw new Error('RepositoryNotRegisteredOrAmbiguous');
  return results[0];
}

const PRODUCT_LIFECYCLE_STATES = new Set(['prototype', 'scaffolded', 'wired', 'production', 'deprecated']);
const PRODUCT_KINDS = new Set([
  'ui-component', 'sdk-package', 'integration', 'theme', 'section', 'block',
  'app', 'script', 'service', 'solution', 'product', 'collection', 'product-line',
]);
const PRODUCT_KIND_MAP = Object.freeze({
  app: 'app',
  theme: 'theme',
  integration: 'plugin',
  service: 'service',
  product: 'physical',
});

function commerceKind(kind) {
  return PRODUCT_KIND_MAP[kind] || 'digital_download';
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export async function recordCreatedProduct(db, product, creation) {
  if (!['developer', 'agentsam'].includes(creation?.origin) || !creation.accountId)
    throw new Error('Created-product provenance required');
  if (typeof product.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{1,119}$/.test(product.slug))
    throw new Error('Invalid product slug');
  if (typeof product.name !== 'string' || !product.name.trim())
    throw new Error('Product name required');
  if (!product.source_type || !product.source_id || /^completeful/i.test(product.source_type))
    throw new Error('A created resource source is required');
  if (!PRODUCT_KINDS.has(product.kind)) throw new Error('Unsupported product kind');
  if (!PRODUCT_LIFECYCLE_STATES.has(product.status || 'prototype')) throw new Error('Unsupported product lifecycle status');

  const repository = product.repository
    ? await resolveRepository(db, { ...product.repository, accountId: creation.accountId })
    : null;
  const existing = await db.prepare(
    'SELECT id,account_id FROM products WHERE slug=?'
  ).bind(product.slug).first();
  if (existing && existing.account_id !== creation.accountId)
    throw new Error('Product belongs to another account');

  const metadata = {
    ...parseObject(product.metadata),
    origin: creation.origin,
    account_id: creation.accountId,
  };
  const productId = existing?.id ?? null;
  const result = await db.prepare(`
    INSERT INTO products (
      slug,title,description,product_kind,digital_ref,catalog_kind,lifecycle_status,
      repository_id,source_type,source_id,canonical_path,package_name,version,
      metadata_json,tags_json,account_id,catalog_visibility,status
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft')
    ON CONFLICT(slug) DO UPDATE SET
      title=excluded.title,
      description=excluded.description,
      product_kind=excluded.product_kind,
      digital_ref=excluded.digital_ref,
      catalog_kind=excluded.catalog_kind,
      lifecycle_status=excluded.lifecycle_status,
      repository_id=excluded.repository_id,
      source_type=excluded.source_type,
      source_id=excluded.source_id,
      canonical_path=excluded.canonical_path,
      package_name=excluded.package_name,
      version=excluded.version,
      metadata_json=excluded.metadata_json,
      tags_json=excluded.tags_json,
      updated_at=datetime('now')
    WHERE products.account_id=excluded.account_id
  `).bind(
    product.slug,
    product.name,
    product.description || null,
    commerceKind(product.kind),
    product.kind === 'product' ? null : product.slug,
    product.kind,
    product.status || 'prototype',
    repository?.id || null,
    product.source_type,
    product.source_id,
    product.canonical_path || null,
    product.package_name || null,
    product.version || null,
    JSON.stringify(metadata),
    JSON.stringify(Array.isArray(product.tags) ? product.tags : []),
    creation.accountId,
    'internal',
  ).run();

  if (!result.meta?.changes) throw new Error('Product belongs to another account');
  const saved = await db.prepare('SELECT id FROM products WHERE slug=?').bind(product.slug).first();
  if (!saved?.id) throw new Error('Created product was not persisted');
  return { id: saved.id, updated: productId != null };
}
