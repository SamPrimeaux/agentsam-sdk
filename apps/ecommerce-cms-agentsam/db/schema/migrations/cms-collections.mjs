import { readFileSync } from 'node:fs';

// Reuse the declared site-first schema rather than keeping another CREATE shape.
const declared = readFileSync(new URL('../../migrations/004_cms_site_first.sql', import.meta.url), 'utf8');
const start = declared.indexOf('CREATE TABLE cms_collections (');
const end = declared.indexOf(';', declared.indexOf('CREATE INDEX idx_cms_collection_items_order', start)) + 1;
if (start < 0 || end <= start) throw new Error('cms_collection_schema_missing');
const canonical = declared.slice(start, end);
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const columns = async (sql, table) => new Set((await sql.all('PRAGMA table_info(' + table + ')')).map(r => r.name));

/** Read-only migration plan. No request handler runs DDL or imports node:fs. */
export async function planCmsCollectionAlignment(sql, { legacySiteId = null, claimUnscopedProducts = false } = {}) {
  const tables = new Set((await sql.all("SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name));
  if (!tables.has('cms_sites')) throw new Error('cms_sites_required');
  const statements = [];
  const existing = tables.has('cms_collections');
  let cols = existing ? await columns(sql, 'cms_collections') : new Set();
  if (!existing) statements.push(canonical);
  else {
    if (!cols.has('site_id')) throw new Error('collection_site_mapping_required');
    const orphan = await sql.all('SELECT c.id FROM cms_collections c LEFT JOIN cms_sites s ON s.id=c.site_id WHERE s.id IS NULL LIMIT 1');
    if (orphan.length) throw new Error('collection_site_mapping_required');
    const duplicates = await sql.all("SELECT site_id,slug FROM cms_collections WHERE slug IS NOT NULL GROUP BY site_id,slug HAVING count(*)>1 LIMIT 1");
    if (duplicates.length) throw new Error('collection_duplicate_site_slug');
    const additions = {
      account_id: 'TEXT REFERENCES accounts(id)',
      tags_json: "TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tags_json) AND json_type(tags_json)='array')",
      status: "TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived'))",
      visibility: "TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','private','unlisted'))",
      sort_order: 'INTEGER NOT NULL DEFAULT 0',
      metadata_json: "TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(metadata_json))",
    };
    for (const [name, type] of Object.entries(additions)) if (!cols.has(name)) statements.push('ALTER TABLE cms_collections ADD COLUMN ' + name + ' ' + type + ';');
    if (!cols.has('account_id')) statements.push('UPDATE cms_collections SET account_id=(SELECT account_id FROM cms_sites WHERE id=cms_collections.site_id);');
    const badOwner = cols.has('account_id') ? await sql.all('SELECT c.id FROM cms_collections c JOIN cms_sites s ON s.id=c.site_id WHERE c.account_id IS NULL OR c.account_id<>s.account_id LIMIT 1') : [];
    if (badOwner.length) throw new Error('collection_owner_mismatch');
    if (cols.has('tags') && !cols.has('tags_json')) statements.push("UPDATE cms_collections SET tags_json=CASE WHEN json_valid(tags) AND json_type(tags)='array' THEN tags ELSE '[]' END;");
    if (cols.has('is_public') && !cols.has('status')) statements.push("UPDATE cms_collections SET status=CASE WHEN is_public=1 THEN 'active' ELSE 'draft' END,visibility=CASE WHEN is_public=1 THEN 'public' ELSE 'private' END;");
    if (!cols.has('metadata_json')) {
      const pairs = ['schema_origin', "'asset-collections'"];
      for (const name of ['thumbnail_url','thumbnail_asset_id','sku','sort_by','created_by'])
        if (cols.has(name)) pairs.push(name, name);
      statements.push('UPDATE cms_collections SET metadata_json=json_object(' + pairs.map((p,i)=>i%2===0?quote(p):p).join(',') + ');');
    }
    statements.push("UPDATE cms_collections SET slug='collection-'||id WHERE slug IS NULL OR trim(slug)='';");
    statements.push('CREATE UNIQUE INDEX IF NOT EXISTS idx_cms_collections_site_slug ON cms_collections(site_id,slug);');
    statements.push('CREATE INDEX IF NOT EXISTS idx_cms_collections_site_status ON cms_collections(site_id,status,sort_order,name);');
    if (!tables.has('cms_collection_items')) {
      const itemStart = canonical.indexOf('CREATE TABLE cms_collection_items (');
      statements.push(canonical.slice(itemStart));
    }
    // Additive compatibility: preserve the old media relationships and columns.
    if (cols.has('tags') && cols.has('is_public')) {
      statements.push(`CREATE TRIGGER IF NOT EXISTS cms_collections_compat_insert AFTER INSERT ON cms_collections BEGIN
        UPDATE cms_collections SET
          account_id=COALESCE(NEW.account_id,(SELECT account_id FROM cms_sites WHERE id=NEW.site_id)),
          tags_json=CASE WHEN NEW.account_id IS NULL AND json_type(NEW.tags)='array' THEN NEW.tags ELSE NEW.tags_json END,
          status=CASE WHEN NEW.account_id IS NULL AND NEW.is_public=1 THEN 'active' ELSE NEW.status END,
          visibility=CASE WHEN NEW.account_id IS NULL THEN CASE WHEN NEW.is_public=1 THEN 'public' ELSE 'private' END ELSE NEW.visibility END
        WHERE id=NEW.id;
        UPDATE cms_collections SET tags=tags_json,is_public=CASE WHEN status='active' AND visibility='public' THEN 1 ELSE 0 END WHERE id=NEW.id;
      END;`);
      statements.push(`CREATE TRIGGER IF NOT EXISTS cms_collections_compat_update AFTER UPDATE OF tags_json,status,visibility ON cms_collections
        WHEN OLD.tags_json IS NOT NEW.tags_json OR OLD.status IS NOT NEW.status OR OLD.visibility IS NOT NEW.visibility
        BEGIN UPDATE cms_collections SET tags=NEW.tags_json,is_public=CASE WHEN NEW.status='active' AND NEW.visibility='public' THEN 1 ELSE 0 END WHERE id=NEW.id;
      END;`);
      statements.push(`CREATE TRIGGER IF NOT EXISTS cms_collections_legacy_update AFTER UPDATE OF tags,is_public ON cms_collections
        WHEN (OLD.tags IS NOT NEW.tags AND NEW.tags IS NOT NEW.tags_json) OR
          (OLD.is_public IS NOT NEW.is_public AND NEW.is_public <> CASE WHEN NEW.status='active' AND NEW.visibility='public' THEN 1 ELSE 0 END)
        BEGIN UPDATE cms_collections SET
          tags_json=CASE WHEN json_type(NEW.tags)='array' THEN NEW.tags ELSE tags_json END,
          status=CASE WHEN NEW.is_public=1 THEN 'active' ELSE status END,
          visibility=CASE WHEN NEW.is_public=1 THEN 'public' ELSE 'private' END WHERE id=NEW.id;
      END;`);
    }
    // The deployed table cannot acquire a composite FK through ALTER TABLE.
    statements.push(`CREATE TRIGGER IF NOT EXISTS cms_collections_owner_insert BEFORE INSERT ON cms_collections
      WHEN NEW.account_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM cms_sites WHERE id=NEW.site_id AND account_id=NEW.account_id)
      BEGIN SELECT RAISE(ABORT,'cms_collection_owner_mismatch'); END;`);
    statements.push(`CREATE TRIGGER IF NOT EXISTS cms_collections_owner_update BEFORE UPDATE OF account_id,site_id ON cms_collections
      WHEN NOT EXISTS(SELECT 1 FROM cms_sites WHERE id=NEW.site_id AND account_id=NEW.account_id)
      BEGIN SELECT RAISE(ABORT,'cms_collection_owner_mismatch'); END;`);
  }

  if (tables.has('cms_collection_assets')) statements.push(`INSERT OR IGNORE INTO cms_collection_items
    (id,account_id,site_id,collection_id,item_type,item_ref,sort_order)
    SELECT 'cmscoli_asset_'||lower(hex(randomblob(12))),c.account_id,c.site_id,a.collection_id,'asset',a.asset_id,COALESCE(a.order_index,0)
    FROM cms_collection_assets a JOIN cms_collections c ON c.id=a.collection_id;`);

  if (tables.has('products')) {
    const pc = await columns(sql,'products');
    if (!pc.has('site_id')) statements.push('ALTER TABLE products ADD COLUMN site_id TEXT REFERENCES cms_sites(id);');
    statements.push('CREATE INDEX IF NOT EXISTS idx_products_site_status ON products(site_id,status,updated_at);');
  }
  if (legacySiteId) {
    const sites = await sql.all('SELECT id,account_id FROM cms_sites WHERE id=?',[legacySiteId]);
    if (sites.length!==1) throw new Error('legacy_collection_site_required');
    const site = sites[0];
    if (!tables.has('store_collections') || !tables.has('store_collection_products')) throw new Error('legacy_collection_tables_required');
    if (claimUnscopedProducts) {
      const siteCount = await sql.all('SELECT count(*) n FROM cms_sites');
      const accountCount = await sql.all('SELECT count(*) n FROM accounts');
      if (Number(siteCount[0].n)!==1 || Number(accountCount[0].n)!==1) throw new Error('product_mapping_must_be_explicit_for_multisite');
      statements.push('UPDATE products SET site_id='+quote(site.id)+' WHERE site_id IS NULL;');
    }
    const prefix = 'cmscol_store_' + site.id + '_';
    const current=existing?await sql.all('SELECT id,site_id,slug FROM cms_collections'):[];
    const sourceRows=await sql.all('SELECT id,slug FROM store_collections');
    const pending=sourceRows.filter(row=>!current.some(c=>c.id===prefix+row.id));
    if(pending.some(row=>current.some(c=>c.site_id===site.id&&c.slug===row.slug)))
      throw new Error('legacy_collection_slug_conflict_requires_mapping');
    const pendingIds=pending.map(row=>quote(row.id)).join(',')||'NULL';

    statements.push(`INSERT OR IGNORE INTO cms_collections
      (id,account_id,site_id,name,slug,description,kind,allowed_item_types_json,rule_json,tags_json,seo_title,seo_description,status,visibility,sort_order,metadata_json,created_at,updated_at)
      SELECT ${quote(prefix)}||id,${quote(site.account_id)},${quote(site.id)},title,slug,description,'manual','["product"]',NULL,'[]',seo_title,seo_description,status,'public',sort_order,
      json_object('legacy_store_collection_id',CAST(id AS TEXT),'image_url',image_url,'eyebrow',eyebrow,'accent_color',accent_color),created_at,updated_at FROM store_collections WHERE id IN (${pendingIds});`);
    statements.push(`INSERT OR IGNORE INTO cms_collection_items
      (id,account_id,site_id,collection_id,item_type,item_ref,sort_order)
      SELECT 'cmscoli_store_'||lower(hex(randomblob(12))),${quote(site.account_id)},${quote(site.id)},${quote(prefix)}||cp.collection_id,'product',CAST(cp.product_id AS TEXT),cp.sort_order
      FROM store_collection_products cp JOIN products p ON p.id=cp.product_id AND p.site_id=${quote(site.id)} WHERE cp.collection_id IN (${pendingIds});`);
  }
  statements.push('CREATE INDEX IF NOT EXISTS idx_cms_collection_items_ref ON cms_collection_items(site_id,item_type,item_ref,status);');
  statements.push(`CREATE TRIGGER IF NOT EXISTS cms_collection_items_scope_insert BEFORE INSERT ON cms_collection_items
    WHEN NOT EXISTS(SELECT 1 FROM cms_collections WHERE id=NEW.collection_id AND account_id=NEW.account_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'cms_collection_item_scope_mismatch'); END;`);
  statements.push(`CREATE TRIGGER IF NOT EXISTS cms_collection_items_scope_update BEFORE UPDATE OF collection_id,account_id,site_id ON cms_collection_items
    WHEN NOT EXISTS(SELECT 1 FROM cms_collections WHERE id=NEW.collection_id AND account_id=NEW.account_id AND site_id=NEW.site_id)
    BEGIN SELECT RAISE(ABORT,'cms_collection_item_scope_mismatch'); END;`);
  return { sql: statements.join('\n'), preserves_legacy_tables: true, legacy_site_id: legacySiteId };
}

export async function alignCmsCollections(sql, options = {}) {
  const plan = await planCmsCollectionAlignment(sql,options);
  await sql.exec(plan.sql);
  return { aligned:true, legacy_site_id:plan.legacy_site_id };
}
