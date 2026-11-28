/**
 * Production D1 adapter for the existing InnerAnimalMedia brand registry.
 *
 * Canonical identity lives in `brands`; account-owned assets live in
 * `brand_asset` and `brand_asset_variant`. This adapter deliberately does not
 * introduce a parallel brand table or an account column on the shared registry.
 *
 * `execute` remains supported for backwards compatibility with existing hosts.
 */
const ARCHITECTURE_MODELS = new Set([
  'master_brand',
  'monolithic_sub',
  'standalone_brand',
  'endorsed_brand',
]);
const BRAND_STATUSES = new Set(['active', 'pending', 'paused', 'archived', 'parked']);
const BRAND_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ACCOUNT_ID = /^au_[a-z0-9]+$/i;

const CREATE_FIELDS = [
  'parent_brand_id', 'name', 'slug', 'display_name', 'tagline',
  'description', 'mission', 'architecture_model', 'status', 'priority',
  'tags', 'domain', 'alternate_domains', 'subdomain', 'meta_title',
  'meta_description', 'meta_keywords', 'og_image_url', 'twitter_handle',
  'canonical_base_url', 'theme_json', 'settings_json', 'timezone',
  'service_tier', 'is_public', 'requires_oauth', 'notes', 'usage_notes',
  'project_id', 'metadata_json',
];

const UPDATE_FIELDS = new Set(CREATE_FIELDS.filter((field) => field !== 'slug'));
UPDATE_FIELDS.add('architectureModel');
UPDATE_FIELDS.add('parentBrandId');
UPDATE_FIELDS.add('displayName');
UPDATE_FIELDS.add('alternateDomains');
UPDATE_FIELDS.add('metaTitle');
UPDATE_FIELDS.add('metaDescription');
UPDATE_FIELDS.add('metaKeywords');
UPDATE_FIELDS.add('ogImageUrl');
UPDATE_FIELDS.add('canonicalBaseUrl');
UPDATE_FIELDS.add('serviceTier');
UPDATE_FIELDS.add('usageNotes');
UPDATE_FIELDS.add('projectId');

function parseJson(value, fallback = null) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function serializeJson(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string') return value;
  return JSON.stringify(value);
}

function normalizeBrand(row) {
  if (!row) return null;
  const theme = parseJson(row.theme_json, {});
  const settings = parseJson(row.settings_json, {});
  const metadata = parseJson(row.metadata_json, {});
  const tags = parseJson(row.tags, row.tags);
  const alternateDomains = parseJson(row.alternate_domains, row.alternate_domains);
  return {
    ...row,
    parentBrandId: row.parent_brand_id || null,
    displayName: row.display_name || row.name,
    architectureModel: row.architecture_model,
    alternateDomains,
    theme,
    theme_json: theme,
    settings,
    settings_json: settings,
    metadata,
    metadata_json: metadata,
    tags,
    assetCount: Number(row.asset_count || 0),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeVariant(row) {
  return {
    ...row,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    fileSizeBytes: row.file_size_bytes == null ? null : Number(row.file_size_bytes),
    isPrimary: Number(row.is_primary) === 1,
    deliveryUrl: row.delivery_url || row.custom_domain_url || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function normalizeAsset(row, variants = []) {
  const meta = parseJson(row.meta_json, {});
  const normalizedVariants = variants.map(normalizeVariant);
  const primaryVariant = normalizedVariants.find((variant) => variant.isPrimary) || normalizedVariants[0] || null;
  return {
    ...row,
    assetKey: row.asset_key,
    brandSlug: row.brand_slug,
    altText: row.alt_text || null,
    metadata: meta,
    meta,
    variants: normalizedVariants,
    primaryVariant,
    previewUrl: primaryVariant?.deliveryUrl || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function rows(result) {
  return Array.isArray(result?.results) ? result.results : [];
}

function cleanString(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function fieldName(key) {
  const aliases = {
    architectureModel: 'architecture_model',
    parentBrandId: 'parent_brand_id',
    displayName: 'display_name',
    alternateDomains: 'alternate_domains',
    metaTitle: 'meta_title',
    metaDescription: 'meta_description',
    metaKeywords: 'meta_keywords',
    ogImageUrl: 'og_image_url',
    canonicalBaseUrl: 'canonical_base_url',
    serviceTier: 'service_tier',
    usageNotes: 'usage_notes',
    projectId: 'project_id',
    theme: 'theme_json',
    settings: 'settings_json',
    metadata: 'metadata_json',
  };
  return aliases[key] || key;
}

function asSqlValue(field, value) {
  if (field === 'meta_keywords') return Array.isArray(value) ? value.join(', ') : value;
  if (['tags', 'alternate_domains', 'theme_json', 'settings_json', 'metadata_json'].includes(field)) {
    return serializeJson(value);
  }
  return value;
}

function assertBrandInput(input, { creating = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('brand_registry_input_invalid');
  }
  if (creating) {
    const name = cleanString(input.name, 160);
    const slug = cleanString(input.slug, 80).toLowerCase();
    if (!name) throw new Error('brand_name_required');
    if (!BRAND_SLUG.test(slug)) throw new Error('brand_slug_invalid');
    const architecture = cleanString(input.architecture_model || input.architectureModel || 'standalone_brand', 40);
    if (!ARCHITECTURE_MODELS.has(architecture)) throw new Error('brand_architecture_invalid');
    const status = cleanString(input.status || 'active', 24);
    if (!BRAND_STATUSES.has(status)) throw new Error('brand_status_invalid');
    return { name, slug, architecture, status };
  }
  const keys = Object.keys(input).filter((key) => !['id', 'slug', 'approved'].includes(key));
  if (!keys.length || keys.some((key) => !UPDATE_FIELDS.has(key))) {
    throw new Error('brand_update_fields_invalid');
  }
  if ('name' in input && !cleanString(input.name, 160)) throw new Error('brand_name_required');
  const architecture = input.architecture_model ?? input.architectureModel;
  if (architecture !== undefined && !ARCHITECTURE_MODELS.has(String(architecture))) {
    throw new Error('brand_architecture_invalid');
  }
  if (input.status !== undefined && !BRAND_STATUSES.has(String(input.status))) {
    throw new Error('brand_status_invalid');
  }
  return input;
}

export class D1BrandRegistryAdapter {
  constructor({ db, accountId, allowWrites = false, execute } = {}) {
    this.kind = 'd1';
    this.db = db || null;
    this.accountId = accountId || null;
    this.allowWrites = allowWrites === true;
    this.execute = execute;
  }

  assertDatabase() {
    if (!this.db || typeof this.db.prepare !== 'function') {
      throw new Error('brand_registry_database_unavailable');
    }
  }

  assertWritable() {
    this.assertDatabase();
    if (!this.allowWrites) throw new Error('brand_registry_write_not_authorized');
  }

  resolveAccountId(query = {}) {
    const accountId = query.accountId || query.account_id || this.accountId;
    if (!accountId || !ACCOUNT_ID.test(String(accountId))) {
      throw new Error('brand_account_required');
    }
    return String(accountId);
  }

  async list(query = {}) {
    if (this.execute) return this.execute({ op: 'list', ...query });
    this.assertDatabase();
    const where = [];
    const args = [];
    const accountId = query.accountId || query.account_id || this.accountId;
    if (query.status) {
      where.push('b.status = ?');
      args.push(String(query.status));
    } else if (query.includeArchived !== true) {
      where.push("b.status != 'archived'");
    }
    if (query.parentBrandId || query.parent_brand_id) {
      where.push('b.parent_brand_id = ?');
      args.push(String(query.parentBrandId || query.parent_brand_id));
    }
    if (query.search) {
      where.push('(lower(b.name) LIKE ? OR lower(b.display_name) LIKE ? OR lower(b.slug) LIKE ?)');
      const needle = '%' + String(query.search).trim().toLowerCase() + '%';
      args.push(needle, needle, needle);
    }
    const limit = Math.max(1, Math.min(500, Number(query.limit) || 100));
    const offset = Math.max(0, Math.min(100000, Number(query.offset) || 0));
    const assetJoin = accountId
      ? 'LEFT JOIN (SELECT brand_slug, COUNT(*) AS asset_count FROM brand_asset WHERE account_id = ? GROUP BY brand_slug) ac ON ac.brand_slug = b.slug'
      : 'LEFT JOIN (SELECT brand_slug, 0 AS asset_count FROM brand_asset WHERE 1 = 0) ac ON ac.brand_slug = b.slug';
    const sql = `SELECT b.*, COALESCE(ac.asset_count, 0) AS asset_count
      FROM brands b
      ${assetJoin}
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY COALESCE(b.priority, 5), lower(COALESCE(b.display_name, b.name)), b.slug
      LIMIT ? OFFSET ?`;
    const bindArgs = accountId ? [String(accountId), ...args, limit, offset] : [...args, limit, offset];
    const result = await this.db.prepare(sql).bind(...bindArgs).all();
    const brands = rows(result).map(normalizeBrand);
    if (query.includeAssets === true) {
      for (const brand of brands) {
        const inventory = await this.listAssets({ accountId: this.resolveAccountId({ accountId }), brandSlug: brand.slug, limit: query.assetLimit || 500 });
        brand.assets = inventory;
        brand.assetCount = inventory.total;
      }
    }
    return brands;
  }

  async find(query = {}) {
    if (this.execute) return this.execute({ op: 'find', ...query });
    this.assertDatabase();
    const id = cleanString(query.id || query.brandId || query.brand_id, 160);
    const slug = cleanString(query.slug || query.brandSlug || query.brand_slug, 80).toLowerCase();
    if (!id && !slug) throw new Error('brand_identifier_required');
    const row = await this.db.prepare(
      `SELECT b.*, COALESCE(ac.asset_count, 0) AS asset_count
         FROM brands b
         LEFT JOIN (
           SELECT brand_slug, COUNT(*) AS asset_count
             FROM brand_asset WHERE account_id = ? GROUP BY brand_slug
         ) ac ON ac.brand_slug = b.slug
        WHERE ${id ? 'b.id = ?' : 'b.slug = ?'} LIMIT 1`
    ).bind(this.resolveAccountId(query), id || slug).first();
    const brand = normalizeBrand(row);
    if (brand && query.includeAssets === true) {
      const inventory = await this.listAssets({ accountId: this.resolveAccountId(query), brandSlug: brand.slug, limit: query.assetLimit || 500 });
      brand.assets = inventory;
      brand.assetCount = inventory.total;
    }
    return brand;
  }

  async listAssets(query = {}) {
    if (this.execute) return this.execute({ op: 'assets.list', ...query });
    this.assertDatabase();
    const accountId = this.resolveAccountId(query);
    const where = ['account_id = ?'];
    const args = [accountId];
    if (query.brandSlug || query.brand_slug) {
      where.push('brand_slug = ?');
      args.push(String(query.brandSlug || query.brand_slug).toLowerCase());
    }
    if (query.assetId || query.asset_id) {
      where.push('id = ?');
      args.push(String(query.assetId || query.asset_id));
    }
    const limit = Math.max(1, Math.min(500, Number(query.limit) || 100));
    const offset = Math.max(0, Math.min(100000, Number(query.offset) || 0));
    const totalRow = await this.db.prepare(
      `SELECT COUNT(*) AS total FROM brand_asset WHERE ${where.join(' AND ')}`
    ).bind(...args).first();
    const result = await this.db.prepare(
      `SELECT * FROM brand_asset WHERE ${where.join(' AND ')}
       ORDER BY brand_slug, category, COALESCE(title, asset_key), asset_key
       LIMIT ? OFFSET ?`
    ).bind(...args, limit, offset).all();
    const assets = rows(result);
    if (!assets.length) return { items: [], total: Number(totalRow?.total || 0), offset, limit, hasMore: false };
    const ids = assets.map((asset) => String(asset.id));
    const placeholders = ids.map(() => '?').join(',');
    const variantResult = await this.db.prepare(
      `SELECT v.* FROM brand_asset_variant v
       JOIN brand_asset a ON a.id = v.asset_id
       WHERE a.account_id = ? AND v.asset_id IN (${placeholders})
       ORDER BY v.asset_id, v.is_primary DESC, v.variant_key, v.file_format`
    ).bind(accountId, ...ids).all();
    const variantsByAsset = new Map();
    for (const variant of rows(variantResult)) {
      const key = String(variant.asset_id);
      if (!variantsByAsset.has(key)) variantsByAsset.set(key, []);
      variantsByAsset.get(key).push(variant);
    }
    const items = assets.map((asset) => normalizeAsset(asset, variantsByAsset.get(String(asset.id)) || []));
    const total = Number(totalRow?.total || 0);
    return { items, total, offset, limit, hasMore: offset + items.length < total };
  }

  async findAsset(query = {}) {
    if (this.execute) return this.execute({ op: 'assets.find', ...query });
    const result = await this.listAssets({ ...query, limit: 1, offset: 0 });
    return result.items[0] || null;
  }

  async listUnmatchedAssetSlugs(query = {}) {
    if (this.execute) return this.execute({ op: 'assets.unmatched', ...query });
    this.assertDatabase();
    const accountId = this.resolveAccountId(query);
    const result = await this.db.prepare(
      `SELECT a.brand_slug, COUNT(*) AS asset_count
         FROM brand_asset a
         LEFT JOIN brands b ON b.slug = a.brand_slug
        WHERE a.account_id = ? AND b.id IS NULL
        GROUP BY a.brand_slug ORDER BY a.brand_slug`
    ).bind(accountId).all();
    return rows(result).map((row) => ({
      brandSlug: String(row.brand_slug),
      brand_slug: String(row.brand_slug),
      assetCount: Number(row.asset_count || 0),
      asset_count: Number(row.asset_count || 0),
      status: 'unmatched_registry_slug',
    }));
  }

  async register(input = {}) {
    if (this.execute) return this.execute({ op: 'register', ...input });
    this.assertWritable();
    const validated = assertBrandInput(input, { creating: true });
    const parentBrandId = input.parent_brand_id || input.parentBrandId || null;
    if (parentBrandId && !await this.find({ id: String(parentBrandId) })) {
      throw new Error('brand_parent_not_found');
    }
    const values = {
      parent_brand_id: parentBrandId,
      name: validated.name,
      slug: validated.slug,
      display_name: input.display_name || input.displayName || validated.name,
      tagline: input.tagline || null,
      description: input.description || null,
      mission: input.mission || null,
      architecture_model: validated.architecture,
      status: validated.status,
      priority: Number.isFinite(Number(input.priority)) ? Number(input.priority) : 5,
      tags: serializeJson(input.tags) ?? null,
      domain: input.domain || null,
      alternate_domains: serializeJson(input.alternate_domains ?? input.alternateDomains) ?? null,
      subdomain: input.subdomain || null,
      meta_title: input.meta_title || input.metaTitle || null,
      meta_description: input.meta_description || input.metaDescription || null,
      meta_keywords: Array.isArray(input.meta_keywords ?? input.metaKeywords) ? (input.meta_keywords ?? input.metaKeywords).join(', ') : (input.meta_keywords ?? input.metaKeywords ?? null),
      og_image_url: input.og_image_url || input.ogImageUrl || null,
      twitter_handle: input.twitter_handle || input.twitterHandle || null,
      canonical_base_url: input.canonical_base_url || input.canonicalBaseUrl || null,
      theme_json: serializeJson(input.theme_json ?? input.theme) || '{}',
      settings_json: serializeJson(input.settings_json ?? input.settings) || '{}',
      timezone: input.timezone || 'America/Chicago',
      service_tier: input.service_tier || input.serviceTier || 'family',
      is_public: input.is_public === true || input.is_public === 1 ? 1 : 0,
      requires_oauth: input.requires_oauth === false || input.requires_oauth === 0 ? 0 : 1,
      notes: input.notes || null,
      usage_notes: input.usage_notes || input.usageNotes || null,
      project_id: input.project_id || input.projectId || null,
      metadata_json: serializeJson(input.metadata_json ?? input.metadata) || '{}',
    };
    const sql = `INSERT INTO brands (${CREATE_FIELDS.join(', ')}, created_at, updated_at)
      VALUES (${CREATE_FIELDS.map(() => '?').join(', ')}, datetime('now'), datetime('now'))`;
    try {
      await this.db.prepare(sql).bind(...CREATE_FIELDS.map((field) => values[field])).run();
    } catch (error) {
      const message = String(error?.message || error);
      if (/unique constraint failed: brands\\.slug/i.test(message)) throw new Error('brand_slug_conflict');
      if (/foreign key constraint failed/i.test(message)) throw new Error('brand_parent_not_found');
      throw error;
    }
    const brand = await this.find({ slug: validated.slug });
    if (!brand) throw new Error('brand_registry_create_unconfirmed');
    return { created: true, brand };
  }

  async update(identifier, input = {}) {
    if (this.execute) return this.execute({ op: 'update', id: identifier, ...input });
    this.assertWritable();
    const id = cleanString(typeof identifier === 'string' ? identifier : identifier?.id, 160);
    if (!id) throw new Error('brand_identifier_required');
    const validated = assertBrandInput(input);
    const entries = Object.entries(validated).map(([key, value]) => {
      const field = fieldName(key);
      return [field, asSqlValue(field, value)];
    });
    const parentEntry = entries.find(([field]) => field === 'parent_brand_id');
    if (parentEntry?.[1]) {
      const parent = await this.find({ id: String(parentEntry[1]) });
      if (!parent) throw new Error('brand_parent_not_found');
      if (String(parentEntry[1]) === id) throw new Error('brand_hierarchy_cycle');
      let cursor = parent;
      const visited = new Set([id]);
      while (cursor?.parent_brand_id) {
        const nextId = String(cursor.parent_brand_id);
        if (visited.has(nextId)) throw new Error('brand_hierarchy_cycle');
        visited.add(nextId);
        cursor = await this.find({ id: nextId });
      }
    }
    const sets = entries.map(([field]) => `${field} = ?`);
    sets.push("updated_at = datetime('now')");
    const result = await this.db.prepare(
      `UPDATE brands SET ${sets.join(', ')} WHERE id = ?`
    ).bind(...entries.map(([, value]) => value), id).run();
    if (Number(result?.meta?.changes ?? result?.changes ?? 0) < 1) {
      const existing = await this.find({ id });
      if (!existing) throw new Error('brand_not_found');
    }
    const brand = await this.find({ id });
    if (!brand) throw new Error('brand_update_unconfirmed');
    return { updated: true, brand };
  }

  async archive(identifier) {
    return this.update(identifier, { status: 'archived' });
  }
}

export { normalizeBrand, normalizeAsset, normalizeVariant };
