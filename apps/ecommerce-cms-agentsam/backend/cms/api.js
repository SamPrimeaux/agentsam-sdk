import { ROUTE_MANIFEST } from "../lib/route-manifest.js";
import { handleCollectionApi } from "./collection-store.mjs";
import { attachCmsDefinitions, listCmsDefinitions, listCmsComponentCatalog } from "./definition-registry.mjs";
import { listStoreThemes, selectThemePreview } from "./theme-authority.mjs";
import { listThemeProjects, getThemeProject, createThemeProject, installThemeDraft, saveThemeProject, listThemeProjectHistory, getThemeProjectSnapshot } from "./theme-project-store.mjs";
import { ensureCmsSiteStarter } from "./site-starter.mjs";
import { readCanonicalComposition } from "./canonical-composition.mjs";
import { listCanonicalPageRows, cmsPageStorageMode } from "./page-inventory.mjs";
import {
  getSiteOwnedPage, createSiteOwnedPage, updateSiteOwnedPage,
  saveSiteOwnedSectionDraft,
} from "./site-owned-page-adapter.mjs";
import { ensureDefaultCmsSite, listCmsSites, createCmsSite, resolveCmsSite } from "./site-context.mjs";
import {
  buildCatalogInstanceContent,
  isCatalogInstalledContent,
  resolveCatalogTemplate,
  loadEmbedCatalog,
} from "./catalog-resource.mjs";
import { createAuthoringEngine } from "../../cms/authoring/engine.ts";
import { reconcileCanonicalBlocks } from "../../cms/authoring/block-projection.ts";
import { validateThemeSettings, validateThemeCss, validateSectionStyles } from "./theme-style-contract.mjs";
import { attachGeneratedImplementations, inspectGeneratedSection, persistGeneratedImplementation } from "./generated-section.mjs";
import {normalizeSettingFields} from "../../frontend/static/js/generated-settings-schema.mjs";
import { guardSectionWrite } from "../../frontend/static/js/generation-namespace.mjs";
import { cmsStorefrontRoutes, resolvePageAuthority } from "./page-authority.js";
import {
  getRegistryPage,
  listRegistryPages,
  mergeWithRegistry,
  registryForAdmin,
  PAGE_REGISTRY,
} from "./registry.js";
// The same concrete section definitions are loaded by the browser and Worker.
import "../../packages/theme-contract/runtime/portable-sections.js";
import { reviseAtlas } from "../../packages/theme-contract/runtime/revise-atlas-source.js";
// The Worker validates the exact same Revise section contract the browser renders.
globalThis.ThemeReviseAtlas = reviseAtlas;
const PORTABLE = globalThis.ThemePortableSections;
import {
  draftKey,
  publishedKey,
  publishedSnapshotKey,
  writeSectionDraft,
  publishSectionToR2,
  loadSectionsFromR2,
  readR2Json,
  writeR2Json,
  readSectionContent,
  D1_CONTENT_PLACEHOLDER,
} from "./r2-store.js";

const KV_PREFIX = "cms:page:";
const CMS_STOREFRONT_ROUTES = cmsStorefrontRoutes(ROUTE_MANIFEST);

/** Phase C — D1 stores pointers only, not section bodies */
const WRITE_D1_CONTENT_JSON = false;

function json(data, init = {}) {
  return Response.json(data, init);
}

function parseContent(raw) {
  if (!raw || raw === D1_CONTENT_PLACEHOLDER) return {};
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw || {};
  } catch {
    return {};
  }
}

function extractPreview(content) {
  if (!content || typeof content !== "object") return "";
  const text =
    content.subheadline ||
    content.headline ||
    content.titleLine2 ||
    content.titleLine1 ||
    content.eyebrow ||
    "";
  return String(text).replace(/\s+/g, " ").trim();
}

function previewFromRegistry(slug) {
  const page = getRegistryPage(slug);
  if (!page?.sections?.length) return "";
  return extractPreview(page.sections[0].content);
}

function kvKey(slug) {
  return `${KV_PREFIX}${slug}:v1`;
}

async function loadSectionRows(env, pageId, { publishedOnly = false } = {}) {
  let query = `SELECT section_key, sort_order, content_json, content_r2_key, content_version, content_hash, status, updated_at
               FROM page_sections WHERE page_id = ?`;
  if (publishedOnly) query += ` AND status = 'published'`;
  query += ` ORDER BY sort_order ASC, id ASC`;

  const { results } = await env.DB.prepare(query).bind(pageId).all();
  return results;
}

// Canonical editor-owned rows take precedence over legacy __editor.blocks cache.
// Never project draft block data into a published snapshot. Imported/unknown
// trees stay untouched until they have an explicit, provenance-safe identity map.
function applyCanonicalEditorRows(section, blockRows) {
  if (!blockRows?.length || blockRows.some(row => {
    try { return JSON.parse(row.metadata_json || '{}').source !== 'theme-studio-v1'; }
    catch { return true; }
  })) return section;
  const content = structuredClone(section.content || {});
  const oldKeys = new Set((content.__editor?.blocks || []).map(row => row.id));
  const byId = new Map(blockRows.map(row => [row.id, row]));
  const active = blockRows.filter(row => row.status !== 'archived');
  for (const id of oldKeys) if (!active.some(row => row.block_key === id)) delete content[id];
  for (const row of active) {
    let settings;
    try { settings = JSON.parse(row.content_json || '{}'); }
    catch { throw new Error('cms_canonical_invalid_block_content:' + row.id); }
    content[row.block_key] = settings;
  }
  content.__editor = {...(content.__editor || {}),blocks: active
    .sort((a,b) => (a.parent_block_id || '').localeCompare(b.parent_block_id || '') ||
      Number(a.sort_order) - Number(b.sort_order) || a.id.localeCompare(b.id))
    .map(row => ({
      id:row.block_key,templateKey:row.block_type,
      enabled:row.status === 'active',
      ...(row.parent_block_id ? {parentBlockId:byId.get(row.parent_block_id)?.block_key} : {}),
    }))};
  return {...section,content};
}

async function hydratePageCanonicalBlocks(env, pageId, sections) {
  const {results=[]} = await env.DB.prepare(
    `SELECT c.section_key,b.id,b.parent_block_id,b.block_key,b.block_type,b.sort_order,
      b.status,b.content_json,b.metadata_json
     FROM cms_pages p
     JOIN cms_page_sections c ON c.page_id=p.id AND c.account_id=p.account_id
     JOIN cms_section_blocks b ON b.section_id=c.id AND b.account_id=c.account_id
     WHERE p.legacy_page_id=? ORDER BY c.section_key,b.sort_order,b.id`
  ).bind(pageId).all();
  const byKey=new Map();
  for(const row of results) {
    if(!byKey.has(row.section_key))byKey.set(row.section_key,[]);
    byKey.get(row.section_key).push(row);
  }
  return sections.map(section=>applyCanonicalEditorRows(section,byKey.get(section.key)));
}

async function loadSectionsFromDb(env, slug, pageId, { publishedOnly = false } = {}) {
  const rows = await loadSectionRows(env, pageId, { publishedOnly });
  const sections = await loadSectionsFromR2(env, slug, rows, { publishedOnly });
  return publishedOnly ? sections : hydratePageCanonicalBlocks(env, pageId, sections);
}

async function previewForPage(env, slug, pageId, previewJson) {
  const fromD1 = extractPreview(parseContent(previewJson));
  if (fromD1) return fromD1;

  const first = await env.DB.prepare(
    `SELECT section_key, content_r2_key FROM page_sections WHERE page_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1`
  )
    .bind(pageId)
    .first();

  if (first) {
    const doc = await readSectionContent(env, slug, first.section_key, {
      key: first.content_r2_key,
    });
    if (doc?.content) return extractPreview(doc.content);
  }

  return previewFromRegistry(slug);
}

async function loadPageRow(env, slug) {
  return env.DB.prepare(`SELECT id, slug, title, status, updated_at FROM pages WHERE slug = ?`)
    .bind(slug)
    .first();
}

function d1Changes(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

async function currentSectionVersion(env, pageId, sectionKey) {
  const row = await env.DB.prepare(
    `SELECT content_version FROM page_sections WHERE page_id = ? AND section_key = ?`
  )
    .bind(pageId, sectionKey)
    .first();
  return Number(row?.content_version ?? 0);
}

/** Keep the actual CMS section and block identities aligned with the saved
 * R2 draft. The old page_sections row is a compatibility pointer, not a source
 * for new component registrations. A missing canonical page is reported, never
 * invented from PAGE_REGISTRY. Unmanaged block rows are never overwritten. */
async function syncCanonicalDraftPointer(env, legacySectionId, content, r2Meta) {
  let canonical = await env.DB.prepare(
    `SELECT s.id,s.account_id,s.inline_content_json,p.site_id FROM cms_page_sections s
       JOIN cms_pages p ON p.id=s.page_id AND p.account_id=s.account_id
       WHERE s.legacy_section_id=? LIMIT 1`
  ).bind(legacySectionId).first();
  if (!canonical) {
    // The AgentSam generated-section acceptance path owns its own canonical
    // insert and revision; do not pre-create a competing section placement.
    if (content?.__editor?.generated) return {status:'generated_revision_owner'};
    // Sections added in Theme Studio after the data-family migration require
    // a canonical placement. Derive ownership ONLY from the existing cms_pages
    // account-scoped link, never from merchant-submitted IDs or page presets.
    try {
    await env.DB.prepare(`INSERT INTO cms_page_sections
      (account_id,page_id,legacy_section_id,section_key,section_type,sort_order,
       status,inline_content_json,content_object_key,content_version,content_hash)
      SELECT p.account_id,p.id,s.id,s.section_key,?,s.sort_order,
             'draft',?,?,?,?
      FROM page_sections s JOIN cms_pages p ON p.legacy_page_id=s.page_id
      WHERE s.id=? AND s.status!='removed'
        AND NOT EXISTS (SELECT 1 FROM cms_page_sections c WHERE c.legacy_section_id=s.id)`)
      .bind(content?.__editor?.templateKey || 'section',JSON.stringify(content),
        r2Meta.key,r2Meta.version,r2Meta.content_hash,legacySectionId).run();
    } catch (error) {
      // Old host fixtures and installations may not yet have the canonical
      // data-family columns. Save the existing R2 draft normally but report
      // that migration must finish before canonical linkage is possible.
      if (/no such column|has no column named|no such table/i.test(String(error?.message)))
        return {status:'unlinked',reason:'canonical_schema_not_ready'};
      throw error;
    }
    canonical = await env.DB.prepare(
      `SELECT s.id,s.account_id,s.inline_content_json,p.site_id FROM cms_page_sections s
       JOIN cms_pages p ON p.id=s.page_id AND p.account_id=s.account_id
       WHERE s.legacy_section_id=? LIMIT 1`
    ).bind(legacySectionId).first();
  }
  if (!canonical) return {status:'unlinked',reason:'canonical_page_missing'};
  // Section drafts can race across tabs. Never let an earlier, already-saved
  // R2 version overwrite the canonical pointer or block projection of a later
  // successful optimistic-lock commit.
  const current = await env.DB.prepare(`SELECT content_version FROM page_sections WHERE id=?`)
    .bind(legacySectionId).first();
  if (Number(current?.content_version) !== Number(r2Meta.version))
    return {status:'superseded',reason:'later_section_version_committed'};
  const pointer = await env.DB.prepare(`UPDATE cms_page_sections
    SET inline_content_json=?,content_object_key=?,content_version=?,content_hash=?,
        status='draft',updated_at=datetime('now')
    WHERE id=? AND legacy_section_id=?
      AND (content_version IS NULL OR content_version <= ?)`)
    .bind(JSON.stringify(content),r2Meta.key,r2Meta.version,r2Meta.content_hash,
      canonical.id,legacySectionId,r2Meta.version).run();
  if (d1Changes(pointer) !== 1)
    return {status:'superseded',reason:'canonical_pointer_has_newer_version'};
  if (content?.__editor?.generated) return {status:'generated_revision_owner'};
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
     content_object_key,content_hash,snapshot_json,metadata_json)
    SELECT ?, ?, 'section', ?, ?, 'draft', ?, ?, '{}',
           '{"source":"cms-editor-save","r2_authoritative":true}'
    WHERE NOT EXISTS (SELECT 1 FROM cms_revisions
      WHERE site_id=? AND entity_type='section' AND entity_id=? AND revision_kind='draft'
        AND revision_number=? AND content_object_key=?)`)
    .bind(canonical.account_id,canonical.site_id,canonical.id,r2Meta.version,r2Meta.key,r2Meta.content_hash,
      canonical.site_id,canonical.id,r2Meta.version,r2Meta.key).run();
  try {
    const blocks=await reconcileCanonicalBlocks(env.DB,{
      accountId:canonical.account_id,sectionId:canonical.id,content,
      previousContent:parseContent(canonical.inline_content_json),
      siteId:canonical.site_id,
    });
    return {status:'linked',blocks};
  } catch (error) {
    // A section save has already committed its immutable R2 version and legacy
    // pointer. Never claim the canonical block projection succeeded, and never
    // destroy imported/foreign blocks to make the save appear successful.
    const reason=String(error?.code || error?.message || 'unknown');
    console.warn('CMS canonical block projection blocked:',reason);
    return {status:'blocked',reason};
  }
}

async function persistSectionDraft(
  env,
  slug,
  pageId,
  sectionKey,
  content,
  sortOrder = 0,
  { expectedVersion = null } = {}
) {
  if (content?.__editor?.templateKey === "portable") {
    const check = PORTABLE.validate(content.__editor.themePreset, content);
    if (!check.ok) return { error: check.error, status: 400 };
  }
  const hasExpected =
    expectedVersion !== null && expectedVersion !== undefined && expectedVersion !== "";
  const parsedExpected = hasExpected ? Number(expectedVersion) : null;
  if (hasExpected && !Number.isInteger(parsedExpected)) {
    return { error: "expected_version must be an integer", status: 400 };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await env.DB.prepare(
      `SELECT id, content_version FROM page_sections WHERE page_id = ? AND section_key = ?`
    )
      .bind(pageId, sectionKey)
      .first();

    const currentVersion = Number(existing?.content_version ?? 0);
    if (hasExpected && parsedExpected !== currentVersion) {
      return {
        error: "This section changed in another tab. Reload before saving.",
        code: "cms_version_conflict",
        status: 409,
        expected_version: parsedExpected,
        current_version: currentVersion,
      };
    }

    // Reject incompatible canonical identities BEFORE committing the R2 version
    // or advancing the legacy pointer. A half-saved editor action is not success.
    if (existing && !content?.__editor?.generated) {
      const canonical = await env.DB.prepare(
        `SELECT s.id,s.account_id,s.inline_content_json,p.site_id
           FROM cms_page_sections s
           JOIN cms_pages p ON p.id=s.page_id AND p.account_id=s.account_id
          WHERE s.legacy_section_id=?`
      ).bind(existing.id).first();
      if (canonical) {
        try {
          await reconcileCanonicalBlocks(env.DB,{
            accountId:canonical.account_id,sectionId:canonical.id,content,dryRun:true,
            previousContent:parseContent(canonical.inline_content_json),
            siteId:canonical.site_id,
          });
        } catch(error) {
          return {error:String(error?.code || error?.message),status:409,
            code:'cms_canonical_block_write_rejected'};
        }
      }
    }
    const r2Meta = await writeSectionDraft(env, slug, sectionKey, content, {
      version: currentVersion,
    });
    const d1Json = WRITE_D1_CONTENT_JSON
      ? JSON.stringify(content)
      : D1_CONTENT_PLACEHOLDER;

    if (existing) {
      const result = await env.DB.prepare(
        `UPDATE page_sections
         SET content_json = ?, content_r2_key = ?, content_version = ?, content_hash = ?,
             status = 'draft', updated_at = datetime('now')
         WHERE id = ? AND content_version = ?`
      )
        .bind(
          d1Json,
          r2Meta.key,
          r2Meta.version,
          r2Meta.content_hash,
          existing.id,
          currentVersion
        )
        .run();

      if (d1Changes(result) === 1) {
        const canonical = await syncCanonicalDraftPointer(env, existing.id, content, r2Meta);
        if (canonical.status === 'blocked' || canonical.status === 'unlinked')
          return {error:'Canonical CMS persistence incomplete: '+(canonical.reason || canonical.status),
            code:'cms_canonical_block_write_failed',status:409,canonical};
        return {...r2Meta,canonical};
      }

      if (hasExpected) {
        const latest = await currentSectionVersion(env, pageId, sectionKey);
        return {
          error: "This section changed in another tab. Reload before saving.",
          code: "cms_version_conflict",
          status: 409,
          expected_version: parsedExpected,
          current_version: latest,
        };
      }
      continue;
    }

    try {
      await env.DB.prepare(
        `INSERT INTO page_sections
         (page_id, section_key, sort_order, content_json, content_r2_key, content_version, content_hash, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', datetime('now'))`
      )
        .bind(
          pageId,
          sectionKey,
          sortOrder,
          d1Json,
          r2Meta.key,
          r2Meta.version,
          r2Meta.content_hash
        )
        .run();
    } catch (error) {
      if (attempt >= 2) throw error;
      continue;
    }
    // The legacy row is committed. Never retry the INSERT because a separate
    // canonical mirror is unavailable; that would turn success into a false
    // cms_version_conflict on the next optimistic-lock iteration.
    const created = await env.DB.prepare(
      `SELECT id FROM page_sections WHERE page_id=? AND section_key=?`
    ).bind(pageId,sectionKey).first();
    const canonical = created ? await syncCanonicalDraftPointer(env, created.id, content, r2Meta) : {status:"unlinked",reason:"legacy_section_missing"};
    return {...r2Meta,canonical};
  }

  const latest = await currentSectionVersion(env, pageId, sectionKey);
  return {
    error: "This section changed while it was being saved. Reload and try again.",
    code: "cms_version_conflict",
    status: 409,
    current_version: latest,
  };
}

async function publishSectionsToR2(env, slug, pageId) {
  const { results } = await env.DB.prepare(
    `SELECT section_key, content_json, content_r2_key, content_version, status FROM page_sections WHERE page_id = ?`
  )
    .bind(pageId)
    .all();

  for (const row of results) {
    if (row.status === "removed") continue;
    let draft = await readR2Json(env, row.content_r2_key || draftKey(slug, row.section_key));
    if (!draft) {
      const content = parseContent(row.content_json);
      if (Object.keys(content).length) {
        draft = { content, version: row.content_version || 1 };
      }
    }
    if (draft) {
      await publishSectionToR2(env, slug, row.section_key, draft);
    }
  }
}

export async function buildPublishedSnapshot(env, slug) {
  const page = await loadPageRow(env, slug);
  if (!page || page.status !== "published") return null;

  const sections = await attachGeneratedImplementations(env, slug,
    await loadSectionsFromDb(env, slug, page.id, { publishedOnly: true }));
  if (!sections.length) return null;

  return {
    slug: page.slug,
    title: page.title,
    status: page.status,
    updated_at: page.updated_at,
    sections: sections.map(({ key, sort_order, status, content, updated_at, implementation }) => ({
      key,
      sort_order,
      status,
      content,
      updated_at,
      ...(implementation ? { implementation } : {}),
    })),
    source: "r2",
  };
}

export async function writePublishedSnapshot(env, slug) {
  const snapshot = await buildPublishedSnapshot(env, slug);
  if (!snapshot) {
    // A draft/partial failure must never erase the last published storefront.
    return null;
  }
  // Publish the ordered page composition as one R2 manifest. Draft edits may
  // change D1 section status/order while this immutable public snapshot remains.
  if (env.WEBSITE_ASSETS) {
    const key = publishedSnapshotKey(slug);
    const stored = await writeR2Json(env, key, snapshot);
    if (!stored) throw new Error("Cannot persist published page snapshot");
    const check = await readR2Json(env, key);
    if (!check || JSON.stringify(check) !== JSON.stringify(snapshot)) {
      throw new Error("Published page snapshot failed R2 read-back");
    }
  }
  if (env.CMS_CACHE) {
    await env.CMS_CACHE.put(kvKey(slug), JSON.stringify(snapshot), {
      metadata: { updated_at: snapshot.updated_at },
    });
  }
  return snapshot;
}

export async function getPublishedPage(env, slug) {
  if (env.CMS_CACHE) {
    const cached = await env.CMS_CACHE.get(kvKey(slug), "json");
    if (cached?.sections?.length) return { ...cached, source: "kv" };
  }

  // Cache eviction must not turn a private working revision into a public
  // outage or leak its reordered/edited D1 rows into the storefront.
  const durable = await readR2Json(env, publishedSnapshotKey(slug));
  if (durable?.slug === slug && Array.isArray(durable.sections) && durable.sections.length) {
    if (env.CMS_CACHE) await env.CMS_CACHE.put(kvKey(slug), JSON.stringify(durable));
    return { ...durable, source: "r2-manifest" };
  }

  // Compatibility for published pages created before the R2 manifest existed.
  const snapshot = await buildPublishedSnapshot(env, slug);
  if (snapshot) {
    if (env.CMS_CACHE) await env.CMS_CACHE.put(kvKey(slug), JSON.stringify(snapshot));
    return snapshot;
  }
  return null;
}

/** Account gate for private storefront draft HTML AND draft JSON endpoints.
 * The legacy page row is not an authorization authority; canonical cms_pages
 * is. Global site settings must belong to the same account as the page.
 */
export async function canReadCmsDraft(env, slug, accountId) {
  if (typeof accountId !== "string" || !accountId.trim() || !/^[a-z0-9-]+$/.test(slug)) return false;
  const slugs = slug === "site" ? ["site"] : ["site", slug];
  for (const scopedSlug of slugs) {
    const page = await env.DB.prepare(
      "SELECT id FROM cms_pages WHERE account_id = ? AND slug = ? LIMIT 1"
    ).bind(accountId, scopedSlug).first();
    if (!page) return false;
  }
  return true;
}

export async function getPreviewPage(env, slug) {
  const page = await loadPageRow(env, slug);
  if (!page) {
    const reg = getRegistryPage(slug);
    if (!reg) return null;
    return { ...reg, status: "draft", source: "preview" };
  }

  const sections = await loadSectionsFromDb(env, slug, page.id);
  return {
    slug: page.slug,
    title: page.title,
    status: page.status,
    updated_at: page.updated_at,
    sections: await attachGeneratedImplementations(env, slug, mergeWithRegistry(slug, sections)),
    source: "preview",
  };
}

export async function listPagesAdmin(env, accountId, siteId = null) {
  // Site-owned canonical instances are the page inventory authority.
  // Legacy page/section pointers are consumed only by the existing editor and
  // storefront renderer until their R2 revisions are fully reconciled.
  const site = siteId
    ? await resolveCmsSite(env.DB, { accountId, siteId })
    : await ensureDefaultCmsSite(env.DB, accountId);
  const rows = await listCanonicalPageRows(env.DB, accountId, site.id);
  const pages = [];
  for (const row of rows) {
    const legacyId = row.legacy_page_id == null ? null : Number(row.legacy_page_id);
    const published = legacyId == null ? null : await getPublishedPage(env, row.slug);
    const content = legacyId == null ? [] : await loadSectionsFromDb(env, row.slug, legacyId);
    const linked = content.some((section) => section.content?.__editor?.source === "live-storefront");
    const canonicalPreview = extractPreview(parseContent(row.preview_json));
    pages.push({
      id: row.id,
      site_id: row.site_id,
      route_path: row.route_path,
      is_homepage: Boolean(row.is_homepage),
      legacy_page_id: legacyId,
      slug: row.slug,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      section_count: row.section_count,
      preview: canonicalPreview || (legacyId == null ? "" : await previewForPage(env, row.slug, legacyId, null)),
      source: "cms-d1",
      ...resolvePageAuthority(row.slug, CMS_STOREFRONT_ROUTES, {
        seeded: true,
        cmsPublished: Boolean(published),
        cmsDraftLinked: linked,
      }),
    });
  }

  // Only show persisted pages belonging to the selected site.
  // PAGE_REGISTRY fixtures are not customer pages and must never appear just
  // because an account's site has is_default=1.
  pages.sort((a, b) => String(a.title || a.slug).localeCompare(String(b.title || b.slug)));
  return { ok: true, source: "cms_pages+cms_page_sections", site, pages };
}

function cmsSlug(value) {
  return String(value || "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function cmsObjectJson(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function ensureSiteGlobalPage(env, accountId, site) {
  const existing = await env.DB.prepare(
    "SELECT id FROM cms_pages WHERE account_id=? AND site_id=? AND slug='site' LIMIT 1"
  ).bind(accountId, site.id).first();
  if (existing) return existing;
  const id = "cmsp_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  await env.DB.prepare(`INSERT INTO cms_pages
    (id,account_id,site_id,slug,route_path,title,page_type,status,template_key,
     is_homepage,nav_visible,sort_order,seo_json,metadata_json,created_at,updated_at)
    VALUES (?,?,?,'site',NULL,'Global settings','global','draft','global',0,0,-100,'{}','{}',datetime('now'),datetime('now'))
    ON CONFLICT(site_id,slug) DO NOTHING`)
    .bind(id, accountId, site.id).run();
  return env.DB.prepare(
    "SELECT id FROM cms_pages WHERE account_id=? AND site_id=? AND slug='site' LIMIT 1"
  ).bind(accountId, site.id).first();
}

async function resolveCmsPageScope(env, accountId, { siteId = null, slug = null, pageId = null } = {}) {
  if (!accountId) return { error: "cms_page_account_required", status: 403 };
  let site;
  try {
    site = siteId
      ? await resolveCmsSite(env.DB, { accountId, siteId })
      : await resolveCmsSite(env.DB, { accountId, createDefault: true });
  } catch (error) {
    const message = String(error?.message || error);
    return { error: message, status: /not_found|required/.test(message) ? 404 : 400 };
  }
  const select = `SELECT id,account_id,site_id,legacy_page_id,slug,route_path,title,
      page_type,status,template_key,is_homepage,nav_visible,sort_order,
      seo_json,metadata_json,created_at,updated_at
    FROM cms_pages WHERE account_id=? AND site_id=? AND `;
  let page = pageId
    ? await env.DB.prepare(select + "id=? LIMIT 1").bind(accountId, site.id, pageId).first()
    : slug
      ? await env.DB.prepare(select + "slug=? LIMIT 1").bind(accountId, site.id, slug).first()
      : null;
  // Global theme settings are a real site-owned CMS document, not one
  // account-wide legacy slug shared by every site.
  if (!page && !pageId && slug === "site") {
    await ensureSiteGlobalPage(env, accountId, site);
    page = await env.DB.prepare(select + "slug=? LIMIT 1").bind(accountId, site.id, slug).first();
  }
  if (!page) return { error: "cms_page_not_found", status: 404, site };
  // page_id is the stable identity. The slug in the URL is only a route handle
  // and may be stale after a legitimate slug change.
  return { site, page };
}

async function readCanonicalPageSections(env, page) {
  const composition = await readCanonicalComposition(env, page.account_id, page.slug, page.site_id);
  if (!composition) return [];
  return Promise.all(composition.sections.map(async (section) => {
    let content = section.settings || {};
    if (section.contentObjectKey) {
      const document = await readR2Json(env, section.contentObjectKey);
      if (!document || !document.content || typeof document.content !== "object") {
        throw new Error("cms_section_content_unavailable");
      }
      content = document.content;
    }
    return {
      id: section.id,
      key: section.key,
      name: section.type,
      sort_order: section.order,
      status: section.status,
      version: Number(section.contentVersion || 0),
      content,
      source: section.contentObjectKey ? "r2" : "cms-d1",
      __ownerSlug: page.slug,
    };
  }));
}

export async function createPageAdmin(env, accountId, siteId, body = {}) {
  const storageMode = await cmsPageStorageMode(env.DB);
  if (storageMode === "site-owned-legacy") {
    return { error: "cms_site_identity_migration_required", status: 503 };
  }
  if (storageMode === "site-owned") {
    return createSiteOwnedPage(env, accountId, siteId, body);
  }
  if (!accountId) return { error: "Account required", status: 403 };
  const title = String(body.title || "").trim();
  if (!title || title.length > 200) return { error: "Page title is required and must be 200 characters or fewer", status: 400 };
  const slug = cmsSlug(body.slug || title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    return { error: "Page URL handle must contain lowercase letters, numbers, and hyphens", status: 400 };
  }
  const pageType = String(body.page_type || body.pageType || "standard");
  if (!["standard", "scene", "global"].includes(pageType)) {
    return { error: "Unsupported page type", status: 400 };
  }
  if (slug === "site" && pageType !== "global") {
    return { error: "The 'site' handle is reserved for site-wide Theme Editor settings", status: 409 };
  }
  if (pageType === "global" && slug !== "site") {
    return { error: "Global settings must use the reserved 'site' identity", status: 400 };
  }
  let site;
  try {
    site = siteId
      ? await resolveCmsSite(env.DB, { accountId, siteId })
      : await resolveCmsSite(env.DB, { accountId, createDefault: true });
  } catch (error) {
    const message = String(error?.message || error);
    return { error: message, status: /not_found|required/.test(message) ? 404 : 400 };
  }
  const routePath = pageType === "global"
    ? null
    : String(body.route_path || body.routePath || `/${slug}`).trim();
  if (routePath !== null && (!/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?\/?$/.test(routePath) || routePath.startsWith("//"))) {
    return { error: "Page route must be a local path such as /about or /journal/first-post", status: 400 };
  }
  const homepage = routePath === "/";
  if (homepage) {
    const existingHome = await env.DB.prepare(
      "SELECT id FROM cms_pages WHERE account_id=? AND site_id=? AND is_homepage=1 LIMIT 1"
    ).bind(accountId, site.id).first();
    if (existingHome) return { error: "This site already has a homepage", status: 409 };
  }
  const maxOrder = await env.DB.prepare(
    "SELECT COALESCE(MAX(sort_order),-10) AS max_sort_order FROM cms_pages WHERE account_id=? AND site_id=?"
  ).bind(accountId, site.id).first();
  const id = "cmsp_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const now = new Date().toISOString();
  const seo = cmsObjectJson(body.seo);
  const metadata = cmsObjectJson(body.metadata);
  try {
    await env.DB.prepare(`INSERT INTO cms_pages
      (id,account_id,site_id,slug,route_path,title,page_type,status,template_key,
       is_homepage,nav_visible,sort_order,seo_json,metadata_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'draft',?,?,?,?,?,?,?,?)`)
      .bind(
        id, accountId, site.id, slug, routePath, title, pageType,
        body.template_key || body.templateKey || null, homepage ? 1 : 0,
        body.nav_visible === false ? 0 : 1, Number(maxOrder?.max_sort_order || 0) + 10,
        JSON.stringify(seo), JSON.stringify(metadata), now, now,
      ).run();
  } catch (error) {
    const message = String(error?.message || error);
    return { error: /unique|constraint/i.test(message) ? "A page with that URL already exists on this site" : message,
      status: /unique|constraint/i.test(message) ? 409 : 500 };
  }
  const page = await env.DB.prepare(
    "SELECT id,account_id,site_id,slug,route_path,title,page_type,status,template_key,is_homepage,nav_visible,sort_order,seo_json,metadata_json,created_at,updated_at FROM cms_pages WHERE id=? AND account_id=? AND site_id=?"
  ).bind(id, accountId, site.id).first();
  if (!page) return { error: "Page creation could not be verified", status: 500 };
  return { ok: true, site, page };
}

async function legacyPageLinkMatches(env, page) {
  if (page?.legacy_page_id == null) return false;
  try {
    const legacy = await env.DB.prepare("SELECT id,slug FROM pages WHERE id=? LIMIT 1")
      .bind(page.legacy_page_id).first();
    return Boolean(legacy && legacy.slug === page.slug);
  } catch {
    return false;
  }
}

export async function getPageAdminForSite(env, accountId, slug, siteId = null, pageId = null) {
  const storageMode = await cmsPageStorageMode(env.DB);
  if (storageMode === "site-owned" || storageMode === "site-owned-legacy") {
    return getSiteOwnedPage(env, accountId, slug, siteId, pageId);
  }
  const scope = await resolveCmsPageScope(env, accountId, { siteId, slug, pageId });
  if (scope.error) {
    if (scope.site?.is_default && !pageId) return getPageAdmin(env, slug);
    return null;
  }
  const { page, site } = scope;
  if (await legacyPageLinkMatches(env, page)) {
    try {
      const legacyData = await getPageAdmin(env, page.slug);
      if (legacyData?.page) {
        return {
          ...legacyData,
          page: {
            ...legacyData.page,
            id: page.id,
            site_id: site.id,
            route_path: page.route_path,
            page_type: page.page_type,
            template_key: page.template_key,
            title: page.title,
            status: page.status,
          },
        };
      }
    } catch {
      // Canonical content remains readable if an old compatibility table is absent.
    }
  }
  const sections = await readCanonicalPageSections(env, page);
  return {
    ok: true,
    seeded: true,
    source: "cms-d1",
    page: {
      id: page.id,
      site_id: site.id,
      slug: page.slug,
      route_path: page.route_path,
      title: page.title,
      page_type: page.page_type,
      template_key: page.template_key,
      status: page.status,
      updated_at: page.updated_at,
      is_homepage: Boolean(page.is_homepage),
      sections,
      missing_source_sections: [],
      ...resolvePageAuthority(page.slug, CMS_STOREFRONT_ROUTES, {
        seeded: true,
        cmsPublished: page.status === "published",
      }),
    },
  };
}

export async function updatePageMetaForSite(env, accountId, slug, siteId, pageId, body = {}) {
  const storageMode = await cmsPageStorageMode(env.DB);
  if (storageMode === "site-owned" || storageMode === "site-owned-legacy") {
    return updateSiteOwnedPage(env, accountId, slug, siteId, pageId, body);
  }
  const scope = await resolveCmsPageScope(env, accountId, { siteId, slug, pageId });
  if (scope.error) {
    if (scope.site?.is_default && !pageId) return updatePageMeta(env, slug, body);
    return scope;
  }
  const { page, site } = scope;
  const title = body.title == null ? page.title : String(body.title).trim();
  if (!title || title.length > 200) return { error: "Page title is required and must be 200 characters or fewer", status: 400 };
  if (body.status && body.status !== "draft") {
    return { error: "Publishing must use the verified CMS release workflow", status: 409 };
  }
  let nextSlug = page.slug;
  if (body.slug != null) {
    nextSlug = cmsSlug(body.slug);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(nextSlug) || nextSlug.length > 80) {
      return { error: "Page URL handle is invalid", status: 400 };
    }
    if (page.page_type === "global" && nextSlug !== "site") {
      return { error: "The site-wide Theme Editor identity cannot be renamed", status: 409 };
    }
    if (nextSlug !== page.slug && page.legacy_page_id != null) {
      return { error: "This legacy-backed page must be re-keyed through the site migration before its URL can change", status: 409 };
    }
  }
  let routePath = page.route_path;
  if (page.page_type === "global" && (body.route_path != null || body.routePath != null)) {
    return { error: "Site-wide Theme Editor settings do not have a public route", status: 409 };
  }
  if (body.route_path != null || body.routePath != null) {
    routePath = String(body.route_path || body.routePath).trim();
    if (!/^\/(?:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)?\/?$/.test(routePath) || routePath.startsWith("//")) {
      return { error: "Page route path is invalid", status: 400 };
    }
  } else if (nextSlug !== page.slug && routePath === `/${page.slug}`) {
    routePath = `/${nextSlug}`;
  }
  try {
    await env.DB.prepare(`UPDATE cms_pages
      SET title=?,slug=?,route_path=?,status='draft',updated_at=datetime('now')
      WHERE id=? AND account_id=? AND site_id=?`)
      .bind(title, nextSlug, routePath, page.id, accountId, site.id).run();
  } catch (error) {
    const message = String(error?.message || error);
    return { error: /unique|constraint/i.test(message) ? "A page with that URL already exists on this site" : message,
      status: /unique|constraint/i.test(message) ? 409 : 500 };
  }
  const updated = await env.DB.prepare(
    "SELECT id,site_id,slug,route_path,title,page_type,status,template_key,updated_at FROM cms_pages WHERE id=? AND account_id=? AND site_id=?"
  ).bind(page.id, accountId, site.id).first();
  return { ok: true, page: updated };
}

async function canonicalSectionContent(env, row) {
  if (row.content_object_key) {
    const document = await readR2Json(env, row.content_object_key);
    if (!document || !document.content || typeof document.content !== "object") {
      throw new Error("cms_section_content_unavailable");
    }
    return document.content;
  }
  try {
    const parsed = JSON.parse(row.inline_content_json || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    throw new Error("cms_section_content_invalid");
  }
}

async function insertCanonicalPageSection(env, scope, body = {}) {
  const templateKey = String(body.templateKey || body.template_key || "").trim();
  const themePreset = String(body.themePreset || body.theme_preset || "").trim();
  const portable = PORTABLE.get(themePreset);
  if (templateKey === "portable" && !portable) {
    return { error: "Section preset is not implemented", status: 400 };
  }
  if (portable && templateKey !== "portable") {
    return { error: "Section preset/template mismatch", status: 400 };
  }
  const nativeTemplate = portable ? null : PAGE_REGISTRY[scope.page.slug]?.sections?.[templateKey];
  const template = portable ? { defaultContent: PORTABLE.defaults(themePreset) } : nativeTemplate;
  if (!template) return { error: "Section template is not registered for this page", status: 400 };
  if (!env.WEBSITE_ASSETS) return { error: "CMS R2 storage is not available", status: 503 };

  const supplied = body.content !== undefined && body.content !== null;
  if (supplied) {
    if (!portable) return { error: "Content import requires a portable renderer", status: 400 };
    const validation = PORTABLE.validate(themePreset, body.content);
    if (!validation.ok) return { error: validation.error || "Section content is invalid", status: 400 };
  }
  const content = structuredClone(supplied ? body.content : (template.defaultContent || {}));
  content.__editor = {
    ...(content.__editor || {}),
    templateKey,
    ...(themePreset ? { themePreset } : {}),
    visibility: { ...(content.__editor?.visibility || {}), enabled: true },
  };
  if (portable) {
    const validation = PORTABLE.validate(themePreset, content);
    if (!validation.ok) return { error: validation.error || "Section content is invalid", status: 400 };
  }

  const allRows = await env.DB.prepare(
    "SELECT id,section_key,sort_order,status,content_version FROM cms_page_sections WHERE account_id=? AND page_id=? ORDER BY sort_order,id"
  ).bind(scope.page.account_id, scope.page.id).all();
  const rows = allRows.results || [];
  const removed = rows.find(row => row.section_key === templateKey && row.status === "removed");
  const activeExists = rows.some(row => row.section_key === templateKey && !["removed", "archived"].includes(row.status));
  const sectionKey = removed?.section_key || (templateKey === "portable"
    ? `${sectionKeyBase(themePreset.split("/").pop())}-${crypto.randomUUID().slice(0, 8)}`
    : activeExists ? `${sectionKeyBase(templateKey)}-${crypto.randomUUID().slice(0, 8)}` : templateKey);
  const existing = rows.find(row => row.section_key === sectionKey);
  const sectionId = existing?.id || ("cmss_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20));
  const currentVersion = Number(existing?.content_version || 0);

  const ordered = rows.filter(row => !["removed", "archived"].includes(row.status) && row.id !== sectionId)
    .map(row => ({ id: row.id }));
  const requestedIndex = Number(body.toIndex);
  const toIndex = Number.isInteger(requestedIndex)
    ? Math.max(0, Math.min(requestedIndex, ordered.length))
    : ordered.length;
  ordered.splice(toIndex, 0, { id: sectionId });
  const sortOrder = ordered.findIndex(row => row.id === sectionId) * 10;

  const saved = await writeSectionDraft(env, scope.page.id, sectionKey, content, { version: currentVersion });
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].id === sectionId) continue;
    await env.DB.prepare("UPDATE cms_page_sections SET sort_order=?,updated_at=datetime('now') WHERE id=? AND account_id=? AND page_id=?")
      .bind(index * 10, ordered[index].id, scope.page.account_id, scope.page.id).run();
  }
  const sectionType = portable?.type || templateKey;
  const metadata = JSON.stringify({ source: portable ? "portable-section" : "native-section", themePreset: themePreset || null });
  if (existing) {
    const changed = await env.DB.prepare(`UPDATE cms_page_sections
      SET section_type=?,sort_order=?,status='draft',inline_content_json='{}',content_object_key=?,
          content_version=?,content_hash=?,metadata_json=?,updated_at=datetime('now')
      WHERE id=? AND account_id=? AND page_id=? AND content_version=?`)
      .bind(sectionType, sortOrder, saved.key, saved.version, saved.content_hash, metadata,
        sectionId, scope.page.account_id, scope.page.id, currentVersion).run();
    if (d1Changes(changed) !== 1) return { error: "Section changed while it was being added. Reload and try again.", status: 409 };
  } else {
    await env.DB.prepare(`INSERT INTO cms_page_sections
      (id,account_id,page_id,section_key,section_type,sort_order,status,inline_content_json,
       content_object_key,content_version,content_hash,metadata_json)
      VALUES (?,?,?,?,?,?,'draft','{}',?,?,?,?)`)
      .bind(sectionId, scope.page.account_id, scope.page.id, sectionKey, sectionType, sortOrder,
        saved.key, saved.version, saved.content_hash, metadata).run();
  }
  const latest = await env.DB.prepare(
    "SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?"
  ).bind(scope.page.account_id, scope.site.id, sectionId).first();
  const revisionNumber = Number(latest?.n || 0) + 1;
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
     content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,'section',?,?,'draft',?,?,?,?)`)
    .bind(scope.page.account_id, scope.site.id, sectionId, revisionNumber, saved.key, saved.content_hash,
      JSON.stringify({ content }), JSON.stringify({ source: "cms-editor-save", r2_authoritative: true })).run();
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, scope.page.account_id, scope.site.id).run();
  return { ok: true, section_key: sectionKey, version: saved.version, section: {
    id: sectionId, key: sectionKey, name: sectionType, sort_order: sortOrder,
    status: "draft", version: saved.version, content, source: "r2",
  } };
}

async function updateCanonicalPageSection(env, scope, sectionKey, body = {}) {
  if (!env.WEBSITE_ASSETS) return { error: "CMS R2 storage is not available", status: 503 };
  const row = await env.DB.prepare(
    "SELECT * FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed') LIMIT 1"
  ).bind(scope.page.account_id, scope.page.id, sectionKey).first();
  if (!row) return { error: "Section not found", status: 404 };
  const content = body?.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { error: "content object required", status: 400 };
  }
  const currentVersion = Number(row.content_version || 0);
  const expectedVersion = Number(body.expected_version ?? body.expectedVersion ?? currentVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) {
    return { error: "This section changed in another tab. Reload before saving.", status: 409,
      code: "cms_version_conflict", current_version: currentVersion, expected_version: expectedVersion };
  }
  const themePreset = String(content.__editor?.themePreset || "");
  if (themePreset && PORTABLE.get(themePreset)) {
    const validation = PORTABLE.validate(themePreset, content);
    if (!validation.ok) return { error: validation.error || "Section content is invalid", status: 400 };
  }
  const saved = await writeSectionDraft(env, scope.page.id, sectionKey, content, { version: currentVersion });
  const result = await env.DB.prepare(`UPDATE cms_page_sections
    SET content_object_key=?,content_version=?,content_hash=?,status='draft',updated_at=datetime('now')
    WHERE id=? AND account_id=? AND page_id=? AND content_version=?`)
    .bind(saved.key, saved.version, saved.content_hash, row.id, scope.page.account_id, scope.page.id, currentVersion).run();
  if (d1Changes(result) !== 1) {
    return { error: "This section changed in another tab. Reload before saving.", status: 409,
      code: "cms_version_conflict" };
  }
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
     content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,'section',?,?,'draft',?,?, '{}',?)
    ON CONFLICT DO NOTHING`)
    .bind(scope.page.account_id, scope.site.id, row.id, saved.version, saved.key,
      saved.content_hash, JSON.stringify({ source: "cms-editor-save", r2_authoritative: true })).run();
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, scope.page.account_id, scope.site.id).run();
  return { ok: true, section_key: sectionKey, version: saved.version, content_hash: saved.content_hash,
    canonical: { status: "linked" } };
}

async function duplicateCanonicalPageSection(env, scope, sectionKey) {
  if (!env.WEBSITE_ASSETS) return { error: "CMS R2 storage is not available", status: 503 };
  const row = await env.DB.prepare(
    "SELECT * FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed') LIMIT 1"
  ).bind(scope.page.account_id, scope.page.id, sectionKey).first();
  if (!row) return { error: "Section not found", status: 404 };
  const content = await canonicalSectionContent(env, row);
  const newKey = `${sectionKeyBase(sectionKey)}-${crypto.randomUUID().slice(0, 8)}`;
  const rows = await env.DB.prepare(
    "SELECT id,sort_order FROM cms_page_sections WHERE account_id=? AND page_id=? AND status NOT IN ('archived','removed') ORDER BY sort_order,id"
  ).bind(scope.page.account_id, scope.page.id).all();
  const ordered = [...(rows.results || [])];
  const sourceIndex = ordered.findIndex(item => item.id === row.id);
  const id = "cmss_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  ordered.splice(sourceIndex < 0 ? ordered.length : sourceIndex + 1, 0, { id });
  const sortOrder = ordered.findIndex(item => item.id === id) * 10;
  const saved = await writeSectionDraft(env, scope.page.id, newKey, content, { version: 0 });
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].id === id) continue;
    await env.DB.prepare("UPDATE cms_page_sections SET sort_order=?,updated_at=datetime('now') WHERE id=? AND account_id=? AND page_id=?")
      .bind(index * 10, ordered[index].id, scope.page.account_id, scope.page.id).run();
  }
  await env.DB.prepare(`INSERT INTO cms_page_sections
    (id,account_id,page_id,section_key,section_type,sort_order,status,inline_content_json,
     content_object_key,content_version,content_hash,metadata_json)
    VALUES (?,?,?,?,?,?,'draft','{}',?,?,?,?)`)
    .bind(id, scope.page.account_id, scope.page.id, newKey, row.section_type, sortOrder,
      saved.key, saved.version, saved.content_hash, row.metadata_json || "{}").run();
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, scope.page.account_id, scope.site.id).run();
  return { ok: true, section_key: newKey };
}

async function moveCanonicalPageSection(env, scope, sectionKey, body = {}) {
  const rows = await env.DB.prepare(
    "SELECT id,section_key FROM cms_page_sections WHERE account_id=? AND page_id=? AND status NOT IN ('archived','removed') ORDER BY sort_order,id"
  ).bind(scope.page.account_id, scope.page.id).all();
  const ordered = [...(rows.results || [])];
  const from = ordered.findIndex(row => row.section_key === sectionKey);
  if (from < 0) return { error: "Section not found", status: 404 };
  const to = Number(body.toIndex);
  if (!Number.isInteger(to)) return { error: "toIndex integer required", status: 400 };
  const [moved] = ordered.splice(from, 1);
  ordered.splice(Math.max(0, Math.min(to, ordered.length)), 0, moved);
  for (let index = 0; index < ordered.length; index += 1) {
    await env.DB.prepare("UPDATE cms_page_sections SET sort_order=?,updated_at=datetime('now') WHERE id=? AND account_id=? AND page_id=?")
      .bind(index * 10, ordered[index].id, scope.page.account_id, scope.page.id).run();
  }
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, scope.page.account_id, scope.site.id).run();
  return { ok: true, section_key: sectionKey, to_index: to };
}

async function setCanonicalPageSectionVisibility(env, scope, sectionKey, body = {}) {
  const row = await env.DB.prepare(
    "SELECT * FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed') LIMIT 1"
  ).bind(scope.page.account_id, scope.page.id, sectionKey).first();
  if (!row) return { error: "Section not found", status: 404 };
  const content = await canonicalSectionContent(env, row);
  content.__editor = {
    ...(content.__editor || {}),
    visibility: { ...(content.__editor?.visibility || {}), enabled: body.enabled !== false },
  };
  const saved = await updateCanonicalPageSection(env, scope, sectionKey, {
    content, expected_version: Number(row.content_version || 0),
  });
  if (saved.error) return saved;
  const status = body.enabled === false ? "hidden" : "draft";
  await env.DB.prepare("UPDATE cms_page_sections SET status=?,updated_at=datetime('now') WHERE id=? AND account_id=? AND page_id=?")
    .bind(status, row.id, scope.page.account_id, scope.page.id).run();
  return { ok: true, section_key: sectionKey, enabled: status !== "hidden", version: saved.version };
}

async function removeCanonicalPageSection(env, scope, sectionKey) {
  const row = await env.DB.prepare(
    "SELECT * FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed') LIMIT 1"
  ).bind(scope.page.account_id, scope.page.id, sectionKey).first();
  if (!row) return { error: "Section not found", status: 404 };
  const content = await canonicalSectionContent(env, row);
  content.__editor = {
    ...(content.__editor || {}),
    removed: true,
    visibility: { ...(content.__editor?.visibility || {}), enabled: false },
  };
  const saved = await updateCanonicalPageSection(env, scope, sectionKey, {
    content, expected_version: Number(row.content_version || 0),
  });
  if (saved.error) return saved;
  await env.DB.prepare("UPDATE cms_page_sections SET status='removed',updated_at=datetime('now') WHERE id=? AND account_id=? AND page_id=?")
    .bind(row.id, scope.page.account_id, scope.page.id).run();
  return { ok: true, section_key: sectionKey, removed: true, version: saved.version };
}

async function canonicalEditableSection(env, scope, sectionKey) {
  const row = await env.DB.prepare(
    "SELECT * FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed') LIMIT 1"
  ).bind(scope.page.account_id, scope.page.id, sectionKey).first();
  if (!row) return { error: "Section not found", status: 404 };
  const content = await canonicalSectionContent(env, row);
  const themePreset = String(content.__editor?.themePreset || "");
  const templateKey = String(content.__editor?.templateKey || "");
  const definition = templateKey === "portable"
    ? PORTABLE.get(themePreset)
    : PAGE_REGISTRY[scope.page.slug]?.sections?.[templateKey];
  if (!definition) return { error: "Section does not have a registered block implementation", status: 409 };
  if (!content.__editor || typeof content.__editor !== "object") content.__editor = {};
  if (!Array.isArray(content.__editor.blocks)) {
    content.__editor.blocks = structuredClone(definition.defaultContent?.__editor?.blocks || []);
  }
  return { row, content, definition };
}

async function insertCanonicalPageBlock(env, scope, sectionKey, body = {}) {
  const editable = await canonicalEditableSection(env, scope, sectionKey);
  if (editable.error) return editable;
  const templateKey = String(body.templateKey || body.template_key || "").trim();
  const definition = editable.definition.blocks?.find(block => block.key === templateKey);
  if (!definition) return { error: "Block template is not registered", status: 409 };
  const existing = editable.content.__editor.blocks;
  const sameType = existing.filter(block => block.templateKey === templateKey);
  if (Number.isFinite(definition.max) && sameType.length >= Number(definition.max)) {
    return { error: "Block limit reached", status: 409 };
  }
  const blockId = `${sectionKeyBase(templateKey)}-${crypto.randomUUID().slice(0, 8)}`;
  editable.content[blockId] = structuredClone(definition.defaultContent || {});
  const parsedIndex = Number(body.toIndex);
  const toIndex = Number.isInteger(parsedIndex) ? Math.max(0, Math.min(parsedIndex, existing.length)) : existing.length;
  existing.splice(toIndex, 0, { id: blockId, templateKey, enabled: true });
  const saved = await updateCanonicalPageSection(env, scope, sectionKey, {
    content: editable.content, expected_version: Number(editable.row.content_version || 0),
  });
  if (saved.error) return saved;
  return { ok: true, section_key: sectionKey, block_id: blockId, template_key: templateKey, version: saved.version };
}

async function duplicateCanonicalPageBlock(env, scope, sectionKey, blockId) {
  const editable = await canonicalEditableSection(env, scope, sectionKey);
  if (editable.error) return editable;
  const index = editable.content.__editor.blocks.findIndex(block => block.id === blockId);
  if (index < 0) return { error: "Block not found", status: 404 };
  const source = editable.content.__editor.blocks[index];
  const definition = editable.definition.blocks?.find(block => block.key === source.templateKey);
  if (!definition) return { error: "Block template is not registered", status: 409 };
  const sameType = editable.content.__editor.blocks.filter(block => block.templateKey === source.templateKey);
  if (Number.isFinite(definition.max) && sameType.length >= Number(definition.max)) {
    return { error: "Block limit reached", status: 409 };
  }
  const newId = `${sectionKeyBase(source.templateKey)}-${crypto.randomUUID().slice(0, 8)}`;
  editable.content[newId] = structuredClone(editable.content[blockId] || definition.defaultContent || {});
  editable.content.__editor.blocks.splice(index + 1, 0, { id: newId, templateKey: source.templateKey, enabled: true });
  const saved = await updateCanonicalPageSection(env, scope, sectionKey, {
    content: editable.content, expected_version: Number(editable.row.content_version || 0),
  });
  if (saved.error) return saved;
  return { ok: true, section_key: sectionKey, block_id: newId, version: saved.version };
}

async function moveCanonicalPageBlock(env, scope, sectionKey, blockId, body = {}) {
  const editable = await canonicalEditableSection(env, scope, sectionKey);
  if (editable.error) return editable;
  const blocks = editable.content.__editor.blocks;
  const from = blocks.findIndex(block => block.id === blockId);
  if (from < 0) return { error: "Block not found", status: 404 };
  const to = Number(body.toIndex);
  if (!Number.isInteger(to)) return { error: "toIndex integer required", status: 400 };
  const [moved] = blocks.splice(from, 1);
  blocks.splice(Math.max(0, Math.min(to, blocks.length)), 0, moved);
  const saved = await updateCanonicalPageSection(env, scope, sectionKey, {
    content: editable.content, expected_version: Number(editable.row.content_version || 0),
  });
  if (saved.error) return saved;
  return { ok: true, section_key: sectionKey, block_id: blockId, to_index: to, version: saved.version };
}

async function removeCanonicalPageBlock(env, scope, sectionKey, blockId) {
  const editable = await canonicalEditableSection(env, scope, sectionKey);
  if (editable.error) return editable;
  const blocks = editable.content.__editor.blocks;
  const index = blocks.findIndex(block => block.id === blockId);
  if (index < 0) return { error: "Block not found", status: 404 };
  const meta = blocks[index];
  const definition = editable.definition.blocks?.find(block => block.key === meta.templateKey);
  const sameType = blocks.filter(block => block.templateKey === meta.templateKey);
  if (definition && Number.isFinite(definition.min) && sameType.length <= Number(definition.min)) {
    return { error: "At least one block of this type is required", status: 409 };
  }
  blocks.splice(index, 1);
  delete editable.content[blockId];
  const saved = await updateCanonicalPageSection(env, scope, sectionKey, {
    content: editable.content, expected_version: Number(editable.row.content_version || 0),
  });
  if (saved.error) return saved;
  return { ok: true, section_key: sectionKey, block_id: blockId, removed: true, version: saved.version };
}

export async function getPageAdmin(env, slug) {
  const page = await loadPageRow(env, slug);
  if (!page) {
    const reg = getRegistryPage(slug);
    if (!reg) return null;
    return {
      ok: true,
      page: { ...reg, status: "draft", ...resolvePageAuthority(slug, CMS_STOREFRONT_ROUTES) },
      seeded: false,
    };
  }

  const sections = await attachGeneratedImplementations(env, slug, await loadSectionsFromDb(env, slug, page.id));
  // This is factual D1 inventory, not synthetic registry content. An editor may
  // explicitly stage missing source-backed sections as private drafts without
  // replacing the already published snapshot or modifying existing rows.
  const actualKeys = new Set(sections.map((section) => section.key));
  const missingSourceSections = Object.keys(PAGE_REGISTRY[slug]?.sections || {})
    .filter((key) => !actualKeys.has(key));
  // Imported storefront pages only expose sections actually present in their source.
  // Re-inventing absent newsletter/hero defaults would produce a false editor tree.
  const hasLiveImport = sections.some((section) => section.content?.__editor?.source === "live-storefront");
  return {
    ok: true,
    seeded: true,
    page: {
      slug: page.slug,
      title: page.title,
      status: page.status,
      updated_at: page.updated_at,
      missing_source_sections: missingSourceSections,
      sections: hasLiveImport ? sections.filter((section) => section.status !== "removed") : mergeWithRegistry(slug, sections),
      ...resolvePageAuthority(slug, CMS_STOREFRONT_ROUTES, {
        seeded: true,
        cmsPublished: Boolean(await getPublishedPage(env, slug)),
        cmsDraftLinked: hasLiveImport,
      }),
    },
  };
}

/**
 * Explicitly create a non-published CMS draft from the actual, same-origin
 * storefront markup. No registry seeding, KV update, or live publication.
 *
 * A consuming editor sends only its discovered, CMS-addressable sections;
 * sections without a real renderer stay in the storefront untouched.
 */
export async function importLivePageDraft(env, slug, body = {}) {
  const route = CMS_STOREFRONT_ROUTES.find((item) => item.page === slug);
  const definition = PAGE_REGISTRY[slug];
  if (!route || !definition) return { error: "Unknown storefront page", status: 404 };

  const existing = await loadPageRow(env, slug);
  const replacing = Boolean(existing);
  // A cached published snapshot can remain active even when D1 has newer drafts.
  // Never replace that live authority through the legacy-source import endpoint.
  const activePublication = replacing ? await getPublishedPage(env, slug) : null;
  if (replacing && (existing.status === "published" || activePublication || body.mode !== "reconcile")) {
    return { error: "This page has published CMS content or requires explicit draft reconciliation.", status: 409 };
  }
  const sections = body?.sections;
  if (!Array.isArray(sections) || sections.length === 0 || sections.length > 50) {
    return { error: "At least one live section is required", status: 400 };
  }
  const known = new Set(Object.keys(definition.sections));
  const seen = new Set();
  for (const section of sections) {
    if (!section || !known.has(section.key) || seen.has(section.key) ||
        !section.content || Array.isArray(section.content) || typeof section.content !== "object" ||
        JSON.stringify(section.content).length > 100_000) {
      return { error: "Invalid or duplicate source section", status: 400 };
    }
    seen.add(section.key);
  }

  let page = existing;
  let archiveKey = null;
  let rows = [];
  if (existing) {
    const previous = await loadSectionsFromDb(env, slug, existing.id);
    const priorVersions = await env.DB.prepare(
      "SELECT section_key, content_version, status FROM page_sections WHERE page_id = ?"
    ).bind(existing.id).all();
    rows = priorVersions.results || [];
    const byKey = new Map(rows.map((row) => [row.section_key, row]));
    for (const section of sections) {
      const actual = Number(byKey.get(section.key)?.content_version ?? 0);
      if (!Number.isInteger(section.expected_version) || section.expected_version !== actual) {
        return { error: "A section changed while importing. Reload first.", status: 409 };
      }
    }
    archiveKey = "cms/pages/" + slug + "/imports/before-live-" + crypto.randomUUID() + ".json";
    const archived = await writeR2Json(env, archiveKey, {
      slug, source: "pre-live-reconciliation", saved_at: new Date().toISOString(),
      sections: previous,
    });
    if (!archived) return { error: "Cannot archive previous CMS draft; import aborted.", status: 503 };
  } else {
    await env.DB.prepare(
      "INSERT INTO pages (slug, title, status, updated_at) VALUES (?, ?, 'draft', datetime('now'))"
    ).bind(slug, definition.title).run();
    page = await loadPageRow(env, slug);
  }

  for (const section of sections) {
    const content = structuredClone(section.content);
    content.__editor = { ...(content.__editor || {}), source: "live-storefront" };
    const order = definition.sections[section.key].sortOrder;
    const result = await persistSectionDraft(env, slug, page.id, section.key, content, order, {
      expectedVersion: replacing ? section.expected_version : null,
    });
    if (result.error) return result;
  }

  // Explicit reconciliation retires unseen legacy sections without deleting
  // immutable history. The previous composition is backed up in R2.
  let retired = 0;
  if (replacing) {
    for (const row of rows) {
      if (seen.has(row.section_key) || row.status === "removed") continue;
      const result = await env.DB.prepare(
        "UPDATE page_sections SET status = 'removed', updated_at = datetime('now') WHERE page_id = ? AND section_key = ? AND content_version = ?"
      ).bind(page.id, row.section_key, row.content_version).run();
      if (d1Changes(result) !== 1) return { error: "Concurrent CMS edit detected. Reload before continuing.", status: 409 };
      retired += 1;
    }
  }
  await env.DB.prepare("UPDATE pages SET status = 'draft', updated_at = datetime('now') WHERE id = ?")
    .bind(page.id).run();
  return {
    ok: true, slug, status: "draft", imported_sections: sections.length,
    retired_sections: retired, archive_key: archiveKey,
    live_route: route.path, published: false,
  };
}

export async function updatePageMeta(env, slug, body) {
  let page = await loadPageRow(env, slug);
  if (!page) {
    const seeded = await seedPageFromRegistry(env, slug);
    if (seeded.error) return seeded;
    page = await loadPageRow(env, slug);
  }

  const title = body?.title?.trim();
  const status = body?.status;

  if (title) {
    await env.DB.prepare(
      `UPDATE pages SET title = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(title, page.id)
      .run();
  }

  if (status === "draft" || status === "published") {
    await env.DB.prepare(
      `UPDATE pages SET status = ?, updated_at = datetime('now') WHERE id = ?`
    )
      .bind(status, page.id)
      .run();
    if (status === "published") {
      await publishSectionsToR2(env, slug, page.id);
      await writePublishedSnapshot(env, slug);
    } else {
      await env.CMS_CACHE?.delete(kvKey(slug));
    }
  }

  return { ok: true };
}

async function syncGeneratedRevision(env, slug, key, content, meta, metadata = {}) {
  const legacyPage = await env.DB.prepare("SELECT id FROM pages WHERE slug=? LIMIT 1").bind(slug).first();
  const instance=legacyPage ? await env.DB.prepare(`SELECT s.id,s.account_id,p.site_id FROM cms_page_sections s
    JOIN cms_pages p ON p.id=s.page_id AND p.account_id=s.account_id
    WHERE p.legacy_page_id=? AND s.section_key=?`).bind(legacyPage.id,key).first() : null;
  if (!instance) throw new Error("Canonical generated section is missing");
  await env.DB.prepare(`UPDATE cms_page_sections SET status='draft',content_object_key=?,
    content_version=?,content_hash=?,updated_at=datetime('now') WHERE id=? AND account_id=?`)
    .bind(meta.key,meta.version,meta.content_hash,instance.id,instance.account_id).run();
  const previous=await env.DB.prepare(`SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions
    WHERE account_id=? AND entity_type='section' AND entity_id=?`)
    .bind(instance.account_id,instance.id).first();
  const next=Number(previous?.n||0)+1;
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?, 'section',? ,?,'draft',?,?,?,?)`)
    .bind(instance.account_id,instance.site_id,instance.id,next,meta.key,meta.content_hash,
      JSON.stringify({content,artifactId:content.__editor.artifactId,definitionKey:content.__editor.definitionKey}),
      JSON.stringify({source:"agentsam",...metadata})).run();
  return next;
}

export async function listGeneratedRevisions(env, slug, key, accountId, siteId = null, pageId = null) {
  if (!accountId) return { error: "Account required", status: 403 };
  const scope = await resolveCmsPageScope(env, accountId, { siteId, pageId, slug });
  if (scope.error) return scope;
  const section = await env.DB.prepare(
    "SELECT id FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed') LIMIT 1"
  ).bind(accountId, scope.page.id, key).first();
  if (!section) return { error: "Generated section not found", status: 404 };
  const response = await env.DB.prepare(`SELECT revision_number,content_hash,created_at,metadata_json,snapshot_json
    FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?
    ORDER BY revision_number DESC LIMIT 50`)
    .bind(accountId, scope.site.id, section.id).all();
  const revisions = (response.results || []).flatMap((revision) => {
    let metadata = {};
    let snapshot = {};
    try { metadata = JSON.parse(revision.metadata_json || "{}"); } catch {}
    try { snapshot = JSON.parse(revision.snapshot_json || "{}"); } catch {}
    if (metadata.source !== "agentsam" && !snapshot.artifactId && !snapshot.content?.__editor?.generated) return [];
    return [{
      number: revision.revision_number, createdAt: revision.created_at, hash: revision.content_hash,
      metadata,
    }];
  });
  return { ok: true, revisions };
}

export async function restoreGeneratedRevision(env, slug, key, accountId, body = {}, siteId = null, pageId = null) {
  if (!accountId) return { error: "Account required", status: 403 };
  const number = Number(body.revisionNumber);
  if (!Number.isInteger(number) || number < 1) return { error: "Invalid revision number", status: 422 };
  const scope = await resolveCmsPageScope(env, accountId, { siteId, pageId, slug });
  if (scope.error) return scope;
  const section = await env.DB.prepare(
    "SELECT * FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed') LIMIT 1"
  ).bind(accountId, scope.page.id, key).first();
  if (!section) return { error: "Generated section not found", status: 404 };
  const old = await env.DB.prepare(`SELECT snapshot_json FROM cms_revisions WHERE account_id=? AND site_id=?
    AND entity_type='section' AND entity_id=? AND revision_number=? LIMIT 1`)
    .bind(accountId, scope.site.id, section.id, number).first();
  if (!old) return { error: "Revision not found", status: 404 };
  let saved;
  try { saved = JSON.parse(old.snapshot_json); }
  catch { return { error: "Invalid revision snapshot", status: 409 }; }
  if (!saved.content?.__editor?.generated || !saved.artifactId) {
    return { error: "Not a generated revision", status: 409 };
  }
  const artifact = await env.DB.prepare(
    "SELECT id FROM cms_artifacts WHERE account_id=? AND id=? AND status='ready'"
  ).bind(accountId, saved.artifactId).first();
  if (!artifact) return { error: "Revision artifact unavailable", status: 409 };

  if (await legacyPageLinkMatches(env, scope.page)) {
    const row = await env.DB.prepare(`SELECT ps.content_version,ps.sort_order,ps.status,ps.page_id
      FROM page_sections ps JOIN pages p ON p.id=ps.page_id
      WHERE ps.id=? AND p.id=?`)
      .bind(section.legacy_section_id, scope.page.legacy_page_id).first();
    if (!row || row.status === "removed") return { error: "Section not editable", status: 409 };
    if (Number(body.expectedVersion) !== Number(row.content_version)) {
      return { error: "Draft changed since revision load", status: 409 };
    }
    const meta = await persistSectionDraft(env, scope.page.slug, row.page_id, key, saved.content, row.sort_order,
      { expectedVersion: row.content_version });
    if (meta.error) return meta;
    const revision = await syncGeneratedRevision(env, scope.page.slug, key, saved.content, meta, { restoredFrom: number });
    await markPageDraft(env, row.page_id, scope.page.slug);
    return { ok: true, published: false, section_key: key, version: meta.version, revision_number: revision };
  }

  const currentVersion = Number(section.content_version || 0);
  if (Number(body.expectedVersion) !== currentVersion) {
    return { error: "Draft changed since revision load", status: 409, code: "cms_version_conflict" };
  }
  const savedDraft = await writeSectionDraft(env, scope.page.id, key, saved.content, { version: currentVersion });
  const changed = await env.DB.prepare(`UPDATE cms_page_sections
    SET content_object_key=?,content_version=?,content_hash=?,status='draft',updated_at=datetime('now')
    WHERE id=? AND account_id=? AND page_id=? AND content_version=?`)
    .bind(savedDraft.key, savedDraft.version, savedDraft.content_hash, section.id, accountId, scope.page.id, currentVersion).run();
  if (d1Changes(changed) !== 1) return { error: "Draft changed since revision load", status: 409, code: "cms_version_conflict" };
  const latest = await env.DB.prepare(
    "SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?"
  ).bind(accountId, scope.site.id, section.id).first();
  const revisionNumber = Number(latest?.n || 0) + 1;
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,'section',?,?,'draft',?,?,?,?)`)
    .bind(accountId, scope.site.id, section.id, revisionNumber, savedDraft.key, savedDraft.content_hash,
      JSON.stringify({ content: saved.content, artifactId: saved.artifactId, definitionKey: saved.content.__editor.definitionKey }),
      JSON.stringify({ source: "agentsam", restoredFrom: number })).run();
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, accountId, scope.site.id).run();
  return { ok: true, published: false, section_key: key, version: savedDraft.version, revision_number: revisionNumber };
}

export async function updateSection(env, slug, sectionKey, body) {
  let page = await loadPageRow(env, slug);
  let seededNow = false;
  if (!page) {
    const seeded = await seedPageFromRegistry(env, slug);
    if (seeded.error) return seeded;
    page = await loadPageRow(env, slug);
    seededNow = true;
  }

  const content = body?.content;
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { error: "content object required", status: 400 };
  }

  if (slug === "site" && sectionKey === "brand" && content.__editor?.themeSettings !== undefined) {
    const checked = validateThemeSettings(content.__editor.themeSettings);
    if (!checked.ok) return {error: checked.error, status: 422};
  }

  if (content.__editor?.customCss !== undefined) {
    const checked = validateThemeCss(content.__editor.customCss);
    if (!checked.ok) return {error: checked.error, status: 422};
  }

  // Generated code/semantic type cannot be changed by ordinary inspector autosave.
  let generated = false;
  if (content.__editor?.generated) {
    const existing = await env.DB.prepare(`SELECT content_r2_key FROM page_sections
      WHERE page_id=? AND section_key=? AND status!='removed'`).bind(page.id,sectionKey).first();
    if (!existing) return {error:"Generated section not found",status:404};
    const original=await readSectionContent(env,slug,sectionKey,{key:existing.content_r2_key});
    const previous=original?.content;
    if (!previous?.__editor?.generated ||
      previous.__editor.artifactId!==content.__editor.artifactId ||
      previous.__editor.definitionKey!==content.__editor.definitionKey ||
      previous.__editor.templateKey!==content.__editor.templateKey) {
      return {error:"Generated code is immutable in field editor",status:409};
    }
    const keys=Object.keys(previous).filter((key)=>key!=="__editor");
    if (Object.keys(content).filter((key)=>key!=="__editor").some((key)=>!keys.includes(key)) ||
      keys.some((key)=>typeof content[key]!==typeof previous[key])) {
      return {error:"Generated settings must preserve their schema",status:422};
    }
    const declared=previous.__editor?.generatedSettingsSchema;
    if(declared && Object.keys(declared).length){
      if(JSON.stringify(content.__editor?.generatedSettingsSchema||{})!==JSON.stringify(declared))
        return {error:'Generated definition schema cannot be altered by instance editing',status:422};
      try {
        const instance=Object.fromEntries(Object.entries(content).filter(([key])=>key!=='__editor'));
        const {settings:validated}=normalizeSettingFields(declared,instance);
        // The instance's top-level settings are authoritative values. The
        // inspector cache is a projection and must follow them on every save.
        content.__editor.generatedSettings={...validated};
      }catch(error){return {error:error.message,status:422};}
    }
    generated=true;
  }
  const meta = await persistSectionDraft(env, slug, page.id, sectionKey, content, 0, {
    // A registry-only page reports version 0 to the browser. Seeding creates v1 inside
    // this request, so the first real user save must not conflict with that initialization.
    expectedVersion: seededNow ? null : body?.expected_version,
  });
  if (meta.error) return meta;
  if (generated) await syncGeneratedRevision(env,slug,sectionKey,content,meta);

  await env.DB.prepare(`UPDATE pages SET status = 'draft', updated_at = datetime('now') WHERE id = ?`)
    .bind(page.id)
    .run();

  return { ok: true, version: meta.version, updated_at: meta.updated_at, canonical: meta.canonical };
}

function sectionKeyBase(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48) || "section";
}

async function ensurePage(env, slug) {
  let page = await loadPageRow(env, slug);
  if (!page) {
    const seeded = await seedPageFromRegistry(env, slug);
    if (seeded.error) return seeded;
    page = await loadPageRow(env, slug);
  }
  return { page };
}

async function orderedSectionRows(env, pageId) {
  const { results } = await env.DB.prepare(
    `SELECT id, section_key, sort_order, content_r2_key, content_version, status, updated_at
     FROM page_sections
     WHERE page_id = ?
     ORDER BY sort_order ASC, id ASC`
  ).bind(pageId).all();
  return results || [];
}

async function markPageDraft(env, pageId, slug) {
  await env.DB.prepare(`UPDATE pages SET status = 'draft', updated_at = datetime('now') WHERE id = ?`)
    .bind(pageId).run();
  // Canonical page identity is resolved through the existing legacy section
  // bridge, so no other tenant's similarly named page can be affected.
  await env.DB.prepare(`UPDATE cms_pages SET status='draft',updated_at=datetime('now')
    WHERE id IN (SELECT page_id FROM cms_page_sections WHERE legacy_section_id IN
      (SELECT id FROM page_sections WHERE page_id=?))`).bind(pageId).run();
  // Keep the last public KV/R2 snapshot unchanged until explicit Publish.
  void slug;
}

async function rewriteSectionOrder(env, pageId, orderedKeys) {
  let order = 0;
  for (const key of orderedKeys) {
    await env.DB.prepare(
      `UPDATE page_sections SET sort_order = ?, updated_at = datetime('now') WHERE page_id = ? AND section_key = ?`
    ).bind(order, pageId, key).run();
    // Keep the canonical D1 presentation order aligned for installed instances.
    await env.DB.prepare(`UPDATE cms_page_sections SET sort_order=?,updated_at=datetime('now')
      WHERE legacy_section_id=(SELECT id FROM page_sections WHERE page_id=? AND section_key=?)`)
      .bind(order,pageId,key).run();
    order += 10;
  }
}

async function sectionContentForRow(env, slug, row) {
  const doc = await readSectionContent(env, slug, row.section_key, {
    key: row.content_r2_key,
  });
  const section = applyCanonicalEditorRows({key:row.section_key,content:doc?.content || {}},
    (await env.DB.prepare(
      `SELECT b.id,b.parent_block_id,b.block_key,b.block_type,b.sort_order,b.status,
              b.content_json,b.metadata_json
       FROM cms_page_sections c JOIN cms_section_blocks b
         ON b.section_id=c.id AND b.account_id=c.account_id
       WHERE c.legacy_section_id=? ORDER BY b.sort_order,b.id`
    ).bind(row.id).all()).results || []);
  return section.content;
}

/**
 * Reapply a previously stored immutable section revision as a NEW draft.
 * The normal save path updates canonical block IDs and revision receipts;
 * the source revision object is never mutated or promoted to live content.
 */
export async function restoreSectionRevision(env, slug, sectionKey, accountId, body = {}, siteId = null, pageId = null) {
  if (!accountId) return { error: "Account required", status: 403 };
  const revisionNumber = Number(body.revision_number ?? body.revisionNumber);
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1) {
    return { error: "Valid revision_number required", status: 400 };
  }
  const scope = await resolveCmsPageScope(env, accountId, { siteId, pageId, slug });
  if (scope.error) return scope;
  if (!(await legacyPageLinkMatches(env, scope.page))) {
    return { error: "This section uses the site-first revision store", status: 409 };
  }
  const canonical = await env.DB.prepare(
    `SELECT s.id,s.legacy_section_id,s.account_id
      FROM cms_page_sections s
      WHERE s.account_id=? AND s.page_id=? AND s.section_key=? AND s.status NOT IN ('removed','archived')
      LIMIT 1`
  ).bind(accountId, scope.page.id, sectionKey).first();
  if (!canonical?.legacy_section_id) return { error: "Canonical section not found", status: 404 };
  const legacy = await env.DB.prepare(
    "SELECT id,page_id,sort_order,content_version,status FROM page_sections WHERE id=?"
  ).bind(canonical.legacy_section_id).first();
  if (!legacy || legacy.status === "removed") return { error: "Source section unavailable", status: 409 };
  if (body.expected_version !== undefined && Number(body.expected_version) !== Number(legacy.content_version)) {
    return { error: "Draft changed since the requested restore", status: 409, code: "cms_version_conflict" };
  }
  const revision = await env.DB.prepare(`SELECT content_object_key FROM cms_revisions
    WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?
      AND revision_number=? AND content_object_key IS NOT NULL
    ORDER BY CASE revision_kind WHEN 'draft' THEN 0 WHEN 'history' THEN 1 ELSE 2 END LIMIT 1`)
    .bind(accountId, scope.site.id, canonical.id, revisionNumber).first();
  if (!revision?.content_object_key) return { error: "Revision not found", status: 404 };
  const snapshot = await readR2Json(env, revision.content_object_key);
  if (snapshot?.section_key !== sectionKey || !snapshot.content ||
      typeof snapshot.content !== "object" || Array.isArray(snapshot.content)) {
    return { error: "Revision content unavailable or corrupt", status: 409 };
  }
  if (snapshot.content.__editor?.generated) {
    return { error: "Use generated-restore for generated sections", status: 409 };
  }
  const saved = await persistSectionDraft(env, scope.page.slug, legacy.page_id, sectionKey,
    structuredClone(snapshot.content), legacy.sort_order, { expectedVersion: legacy.content_version });
  if (saved.error) return saved;
  if (saved.canonical?.status !== "linked") {
    return { error: "Canonical restore synchronization incomplete", status: 409 };
  }
  await markPageDraft(env, legacy.page_id, scope.page.slug);
  return { ok: true, section_key: sectionKey, restored_revision: revisionNumber,
    version: saved.version, canonical: saved.canonical };
}

async function restoreCanonicalPageSectionRevision(env, scope, sectionKey, body = {}) {
  if (!env.WEBSITE_ASSETS) return { error: "CMS R2 storage is not available", status: 503 };
  const revisionNumber = Number(body.revision_number ?? body.revisionNumber);
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1) {
    return { error: "Valid revision_number required", status: 400 };
  }
  const section = await env.DB.prepare(
    "SELECT * FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('removed','archived') LIMIT 1"
  ).bind(scope.page.account_id, scope.page.id, sectionKey).first();
  if (!section) return { error: "Section not found", status: 404 };
  const revision = await env.DB.prepare(`SELECT content_object_key FROM cms_revisions
    WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?
      AND revision_number=? AND content_object_key IS NOT NULL
    ORDER BY CASE revision_kind WHEN 'draft' THEN 0 WHEN 'history' THEN 1 ELSE 2 END LIMIT 1`)
    .bind(scope.page.account_id, scope.site.id, section.id, revisionNumber).first();
  if (!revision?.content_object_key) return { error: "Revision not found", status: 404 };
  const snapshot = await readR2Json(env, revision.content_object_key);
  if (snapshot?.section_key !== sectionKey || !snapshot.content ||
      typeof snapshot.content !== "object" || Array.isArray(snapshot.content)) {
    return { error: "Revision content unavailable or corrupt", status: 409 };
  }
  if (snapshot.content.__editor?.generated) {
    return { error: "Use generated-restore for generated sections", status: 409 };
  }
  const currentVersion = Number(section.content_version || 0);
  const expectedVersion = Number(body.expected_version ?? body.expectedVersion ?? currentVersion);
  if (!Number.isInteger(expectedVersion) || expectedVersion !== currentVersion) {
    return { error: "Draft changed since the requested restore", status: 409, code: "cms_version_conflict" };
  }
  const saved = await writeSectionDraft(env, scope.page.id, sectionKey, structuredClone(snapshot.content), {
    version: currentVersion,
  });
  const changed = await env.DB.prepare(`UPDATE cms_page_sections
    SET content_object_key=?,content_version=?,content_hash=?,status='draft',updated_at=datetime('now')
    WHERE id=? AND account_id=? AND page_id=? AND content_version=?`)
    .bind(saved.key, saved.version, saved.content_hash, section.id,
      scope.page.account_id, scope.page.id, currentVersion).run();
  if (d1Changes(changed) !== 1) {
    return { error: "Draft changed since the requested restore", status: 409, code: "cms_version_conflict" };
  }
  const latest = await env.DB.prepare(
    "SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?"
  ).bind(scope.page.account_id, scope.site.id, section.id).first();
  const nextRevision = Number(latest?.n || 0) + 1;
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
     content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,'section',?,?,'draft',?,?,?,?)`)
    .bind(scope.page.account_id, scope.site.id, section.id, nextRevision, saved.key, saved.content_hash,
      JSON.stringify({ section_key: sectionKey, content: snapshot.content }),
      JSON.stringify({ source: "cms-editor-restore", restoredFrom: revisionNumber })).run();
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, scope.page.account_id, scope.site.id).run();
  return { ok: true, section_key: sectionKey, restored_revision: revisionNumber, version: saved.version };
}

/**
 * Ensure the legacy storefront page pointer is linked to the account-owned
 * cms_pages row so catalog installs can project into cms_section_blocks.
 */
async function ensureCanonicalCmsPage(env, accountId, slug, legacyPage) {
  if (!accountId || !legacyPage?.id) return { error: "Account and page required", status: 403 };
  const site = await resolveCmsSite(env.DB, { accountId, createDefault: true });
  let canonical = await env.DB.prepare(
    `SELECT id, site_id, account_id, legacy_page_id FROM cms_pages
      WHERE account_id=? AND site_id=? AND slug=? LIMIT 1`
  ).bind(accountId, site.id, slug).first();
  if (!canonical) {
    const route = CMS_STOREFRONT_ROUTES.find((item) => item.page === slug);
    await env.DB.prepare(
      `INSERT INTO cms_pages
        (account_id, site_id, legacy_page_id, slug, route_path, title, status, is_homepage)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?)`
    ).bind(
      accountId,
      site.id,
      legacyPage.id,
      slug,
      route?.path || `/${slug}`,
      legacyPage.title || slug,
      slug === "home" || route?.path === "/" ? 1 : 0,
    ).run();
    canonical = await env.DB.prepare(
      `SELECT id, site_id, account_id, legacy_page_id FROM cms_pages
        WHERE account_id=? AND site_id=? AND slug=? LIMIT 1`
    ).bind(accountId, site.id, slug).first();
  } else if (canonical.legacy_page_id == null) {
    await env.DB.prepare(
      `UPDATE cms_pages SET legacy_page_id=?, updated_at=datetime('now')
        WHERE id=? AND account_id=? AND legacy_page_id IS NULL`
    ).bind(legacyPage.id, canonical.id, accountId).run();
    canonical.legacy_page_id = legacyPage.id;
  } else if (Number(canonical.legacy_page_id) !== Number(legacyPage.id)) {
    return { error: "Canonical page is linked to a different legacy page", status: 409 };
  }
  if (!canonical) return { error: "Canonical CMS page could not be created", status: 500 };
  return { site, canonical };
}

/**
 * Catalog → install vertical slice.
 * Selects a packaged storefront embed template and installs a page-owned
 * section instance with its own cms_page_sections / cms_section_blocks identity.
 */
export async function installCatalogResource(env, slug, accountId, body = {}) {
  if (!accountId) return { error: "Account required", status: 403 };
  if (!PAGE_REGISTRY[slug]) return { error: "Unknown page", status: 404 };
  const template = resolveCatalogTemplate(body.catalogKey || body.catalog_key || body.key);
  if (!template) return { error: "Unknown or non-installable catalog template", status: 400 };

  const ensured = await ensurePage(env, slug);
  if (ensured.error) return ensured;
  const page = ensured.page;
  const linked = await ensureCanonicalCmsPage(env, accountId, slug, page);
  if (linked.error) return linked;

  const rows = await orderedSectionRows(env, page.id);
  const base = sectionKeyBase(template.key);
  let sectionKey = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  while (rows.some((row) => row.section_key === sectionKey)) {
    sectionKey = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }
  const sortOrder = rows.length ? Math.max(...rows.map((row) => Number(row.sort_order || 0))) + 10 : 0;
  const content = buildCatalogInstanceContent(template, body.settings || body.config || {});
  const meta = await persistSectionDraft(env, slug, page.id, sectionKey, content, sortOrder);
  if (meta.error) return meta;
  if (meta.canonical?.status !== "linked") {
    return {
      error: "Catalog install did not project into canonical CMS blocks",
      status: 409,
      code: "cms_catalog_install_unlinked",
      canonical: meta.canonical,
    };
  }

  const toIndex = Number.isInteger(body.toIndex)
    ? Math.max(0, Math.min(body.toIndex, rows.filter((row) => row.status !== "removed").length))
    : undefined;
  if (toIndex !== undefined) {
    const activeKeys = (await orderedSectionRows(env, page.id))
      .filter((row) => row.status !== "removed")
      .map((row) => row.section_key);
    const currentIndex = activeKeys.indexOf(sectionKey);
    if (currentIndex >= 0) activeKeys.splice(currentIndex, 1);
    activeKeys.splice(toIndex, 0, sectionKey);
    await rewriteSectionOrder(env, page.id, activeKeys);
  }
  await markPageDraft(env, page.id, slug);

  const composition = await readCanonicalComposition(env, accountId, slug, linked.site.id);
  const installed = composition?.sections?.find((section) => section.key === sectionKey) || null;
  return {
    ok: true,
    section_key: sectionKey,
    catalog_key: template.key,
    definition_key: template.key,
    template_key: content.__editor.templateKey,
    version: meta.version,
    canonical: meta.canonical,
    instance: installed,
  };
}

async function installCanonicalCatalogResource(env, scope, body = {}) {
  if (!env.WEBSITE_ASSETS) return { error: "CMS R2 storage is not available", status: 503 };
  const template = resolveCatalogTemplate(body.catalogKey || body.catalog_key || body.key);
  if (!template) return { error: "Unknown or non-installable catalog template", status: 400 };
  const rows = await env.DB.prepare(
    "SELECT id,section_key,sort_order FROM cms_page_sections WHERE account_id=? AND page_id=? AND status NOT IN ('archived','removed') ORDER BY sort_order,id"
  ).bind(scope.page.account_id, scope.page.id).all();
  const base = sectionKeyBase(template.key);
  let sectionKey = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  while ((rows.results || []).some(row => row.section_key === sectionKey)) {
    sectionKey = `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }
  const content = buildCatalogInstanceContent(template, body.settings || body.config || {});
  const id = "cmss_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20);
  const ordered = [...(rows.results || []).map(row => ({ id: row.id }))];
  const requestedIndex = Number(body.toIndex);
  const toIndex = Number.isInteger(requestedIndex)
    ? Math.max(0, Math.min(requestedIndex, ordered.length))
    : ordered.length;
  ordered.splice(toIndex, 0, { id });
  const sortOrder = ordered.findIndex(row => row.id === id) * 10;
  const saved = await writeSectionDraft(env, scope.page.id, sectionKey, content, { version: 0 });
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].id === id) continue;
    await env.DB.prepare("UPDATE cms_page_sections SET sort_order=?,updated_at=datetime('now') WHERE id=? AND account_id=? AND page_id=?")
      .bind(index * 10, ordered[index].id, scope.page.account_id, scope.page.id).run();
  }
  await env.DB.prepare(`INSERT INTO cms_page_sections
    (id,account_id,page_id,section_key,section_type,sort_order,status,inline_content_json,
     content_object_key,content_version,content_hash,metadata_json)
    VALUES (?,?,?,?,?,?,'draft','{}',?,?,?,?)`)
    .bind(id, scope.page.account_id, scope.page.id, sectionKey, "storefront_embed", sortOrder,
      saved.key, saved.version, saved.content_hash,
      JSON.stringify({ source: "catalog-install", catalogKey: template.key, artifactBacked: true })).run();
  try {
    await reconcileCanonicalBlocks(env.DB, {
      accountId: scope.page.account_id,
      sectionId: id,
      content,
      previousContent: {},
      siteId: scope.site.id,
    });
  } catch (error) {
    await env.DB.prepare("UPDATE cms_page_sections SET status='removed',updated_at=datetime('now') WHERE id=? AND account_id=? AND page_id=?")
      .bind(id, scope.page.account_id, scope.page.id).run();
    return { error: "Catalog install could not be projected into canonical CMS blocks: " + String(error?.code || error?.message || error),
      status: 409, code: "cms_catalog_install_unlinked" };
  }
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,
     content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,'section',?,1,'draft',?,?,?,?)`)
    .bind(scope.page.account_id, scope.site.id, id, saved.key, saved.content_hash,
      JSON.stringify({ content, catalogKey: template.key }),
      JSON.stringify({ source: "catalog-install", catalogKey: template.key })).run();
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, scope.page.account_id, scope.site.id).run();
  const composition = await readCanonicalComposition(env, scope.page.account_id, scope.page.slug, scope.site.id);
  const projected = composition?.sections?.find(section => section.key === sectionKey) || null;
  const installed = projected ? {
    ...projected,
    settings: await canonicalSectionContent(env, {
      content_object_key: projected.contentObjectKey,
      inline_content_json: JSON.stringify(projected.settings || {}),
    }),
  } : null;
  return {
    ok: true, section_key: sectionKey, catalog_key: template.key,
    definition_key: template.key, template_key: content.__editor.templateKey,
    version: saved.version, canonical: { status: "linked" }, instance: installed,
  };
}

export async function listInstalledCatalogResources(env, slug, accountId, siteId = null, pageId = null) {
  if (!accountId) return { error: "Account required", status: 403 };
  const catalog = loadEmbedCatalog().apps.map((app) => ({
    key: app.key,
    name: app.name,
    category: app.category,
    installable: Array.isArray(app.surfaces) &&
      (app.surfaces.includes("cms_block") || app.surfaces.includes("storefront_embed")),
  }));
  const scope = await resolveCmsPageScope(env, accountId, { siteId, pageId, slug });
  if (scope.error) {
    if (pageId) return scope;
    return { ok: true, slug, catalog, installed: [], authority: null };
  }
  const composition = await readCanonicalComposition(env, accountId, scope.page.slug, scope.site.id);
  if (!composition) {
    return { ok: true, slug, catalog, installed: [], authority: null };
  }
  const installed = [];
  for (const section of composition.sections) {
    // Canonical section bodies live in R2; the D1 inline JSON is deliberately
    // only a pointer placeholder on site-first pages.
    const settings = await canonicalSectionContent(env, {
      content_object_key: section.contentObjectKey,
      inline_content_json: JSON.stringify(section.settings || {}),
    });
    if (!isCatalogInstalledContent(settings) && section.type !== "storefront_embed") continue;
    const editor = settings.__editor || {};
    const metadata = section.metadata || {};
    const catalogKey = editor.catalogKey || metadata.catalogKey || null;
    installed.push({
      section_id: section.id,
      section_key: section.key,
      catalog_key: catalogKey,
      definition_key: editor.definitionKey || catalogKey,
      status: section.status,
      enabled: editor.visibility?.enabled !== false,
      version: section.contentVersion,
      settings: Object.fromEntries(
        Object.entries(settings).filter(([key]) => key !== "__editor" && key !== "embed-root"),
      ),
      blocks: section.blocks || [],
    });
  }
  return {
    ok: true,
    slug,
    authority: composition.authority,
    catalog,
    installed,
  };
}

export async function insertSection(env, slug, body = {}) {
  const def = PAGE_REGISTRY[slug];
  if (!def) return { error: "Unknown page", status: 404 };

  const templateKey = String(body.templateKey || body.template_key || "").trim();
  const themePreset = String(body.themePreset || body.theme_preset || "").trim();
  const portable = PORTABLE.get(themePreset);
  if (templateKey === "portable" && !portable)
    return { error: "Section preset is not implemented", status: 400 };
  if (portable && templateKey !== "portable")
    return { error: "Section preset/template mismatch", status: 400 };
  const template = portable ? { defaultContent: PORTABLE.defaults(themePreset) } : def.sections?.[templateKey];
  if (!template) return { error: "Unknown section template", status: 400 };

  const ensured = await ensurePage(env, slug);
  if (ensured.error) return ensured;
  const page = ensured.page;
  const rows = await orderedSectionRows(env, page.id);

  const removedCanonical = rows.find((row) => row.section_key === templateKey && row.status === "removed");
  let sectionKey = removedCanonical?.section_key || null;
  let sortOrder = rows.length ? Math.max(...rows.map((row) => Number(row.sort_order || 0))) + 10 : 0;

  if (!sectionKey) {
    const canonicalExists = rows.some((row) => row.section_key === templateKey && row.status !== "removed");
    sectionKey = canonicalExists
      ? `${sectionKeyBase(templateKey)}-${crypto.randomUUID().slice(0, 8)}`
      : templateKey;
  }

  // A donor section can be imported with its real customer data in ONE
  // draft write. Preview-only fixture content is never silently published.
  const supplied = body.content !== undefined && body.content !== null;
  if (supplied) {
    if (!portable) return { error: "Content import requires a portable renderer", status: 400 };
    const validation = PORTABLE.validate(themePreset, body.content);
    if (!validation.ok) return { error: validation.error, status: 400 };
  }
  const content = structuredClone(supplied ? body.content : (template.defaultContent || {}));
  content.__editor = {
    ...(content.__editor || {}),
    templateKey,
    ...(themePreset ? { themePreset } : {}),
    visibility: { ...(content.__editor?.visibility || {}), enabled: true },
  };

  const existing = rows.find((row) => row.section_key === sectionKey);
  const meta = await persistSectionDraft(env, slug, page.id, sectionKey, content, sortOrder);
  if (meta.error) return meta;
  if (existing?.status === "removed") {
    await env.DB.prepare(
      `UPDATE page_sections SET status = 'draft', updated_at = datetime('now') WHERE page_id = ? AND section_key = ?`
    ).bind(page.id, sectionKey).run();
  }

  const nextRows = await orderedSectionRows(env, page.id);
  const activeKeys = nextRows.filter((row) => row.status !== "removed").map((row) => row.section_key);
  const currentIndex = activeKeys.indexOf(sectionKey);
  if (currentIndex >= 0) activeKeys.splice(currentIndex, 1);
  const toIndex = Number.isInteger(body.toIndex)
    ? Math.max(0, Math.min(body.toIndex, activeKeys.length))
    : activeKeys.length;
  activeKeys.splice(toIndex, 0, sectionKey);
  await rewriteSectionOrder(env, page.id, activeKeys);
  await markPageDraft(env, page.id, slug);

  return { ok: true, section_key: sectionKey, template_key: templateKey, version: meta.version };
}

export async function duplicateSection(env, slug, sectionKey, body = {}) {
  const ensured = await ensurePage(env, slug);
  if (ensured.error) return ensured;
  const page = ensured.page;
  const rows = await orderedSectionRows(env, page.id);
  const sourceRow = rows.find((row) => row.section_key === sectionKey && row.status !== "removed");
  if (!sourceRow) return { error: "Section not found", status: 404 };

  const source = await sectionContentForRow(env, slug, sourceRow);
  const portable = source.__editor?.templateKey === "portable" ? PORTABLE.get(source.__editor?.themePreset) : null;
  const templateKey = portable ? "portable" : (source.__editor?.templateKey || (PAGE_REGISTRY[slug]?.sections?.[sectionKey] ? sectionKey : null));
  const generated = source.__editor?.generated === true;
  let canonicalSource = null;
  if (generated) {
    canonicalSource = await env.DB.prepare(`SELECT s.account_id,s.page_id FROM cms_page_sections s
      JOIN cms_pages p ON p.id=s.page_id AND p.account_id=s.account_id
      WHERE s.legacy_section_id=? AND p.slug=?`).bind(sourceRow.id,slug).first();
    if (!canonicalSource) return {error:"Canonical generated section is missing",status:409};
    const verified = await env.DB.prepare("SELECT id FROM cms_artifacts WHERE id=? AND account_id=? AND status='ready'")
      .bind(source.__editor.artifactId,canonicalSource.account_id).first();
    if (!verified) return {error:"Generated implementation is not available",status:409};
  }
  if (!templateKey || (!generated && !portable && !PAGE_REGISTRY[slug]?.sections?.[templateKey])) {
    return { error: "Section template is not registered", status: 409 };
  }

  const newKey = `${sectionKeyBase(templateKey)}-${crypto.randomUUID().slice(0, 8)}`;
  const content = structuredClone(source);
  content.__editor = {
    ...(content.__editor || {}),
    templateKey,
    visibility: { ...(content.__editor?.visibility || {}), enabled: true },
  };

  const saved = await persistSectionDraft(env, slug, page.id, newKey, content, Number(sourceRow.sort_order || 0) + 5);
  if (saved.error) return saved;
  if (generated) {
    const created=await env.DB.prepare("SELECT id FROM page_sections WHERE page_id=? AND section_key=?")
      .bind(page.id,newKey).first();
    await env.DB.prepare(`INSERT INTO cms_page_sections
      (account_id,page_id,legacy_section_id,section_key,section_type,sort_order,status,content_object_key,content_version,content_hash,metadata_json)
      VALUES (?,?,?,?,?,?,'draft',?,?,?,?)`)
      .bind(canonicalSource.account_id,canonicalSource.page_id,created.id,newKey,templateKey,
        Number(sourceRow.sort_order||0)+5,saved.key,saved.version,saved.content_hash,
        JSON.stringify({artifactId:source.__editor.artifactId,definitionKey:templateKey})).run();
    await syncGeneratedRevision(env,slug,newKey,content,saved,{duplicatedFrom:sectionKey});
  }
  const activeKeys = (await orderedSectionRows(env, page.id))
    .filter((row) => row.status !== "removed")
    .map((row) => row.section_key);
  const from = activeKeys.indexOf(newKey);
  if (from >= 0) activeKeys.splice(from, 1);
  const sourceIndex = activeKeys.indexOf(sectionKey);
  activeKeys.splice(sourceIndex < 0 ? activeKeys.length : sourceIndex + 1, 0, newKey);
  await rewriteSectionOrder(env, page.id, activeKeys);
  await markPageDraft(env, page.id, slug);

  return { ok: true, section_key: newKey, template_key: templateKey };
}

export async function moveSection(env, slug, sectionKey, body = {}) {
  const ensured = await ensurePage(env, slug);
  if (ensured.error) return ensured;
  const page = ensured.page;
  const rows = await orderedSectionRows(env, page.id);
  const activeKeys = rows.filter((row) => row.status !== "removed").map((row) => row.section_key);
  const fromIndex = activeKeys.indexOf(sectionKey);
  if (fromIndex < 0) return { error: "Section not found", status: 404 };

  const parsed = Number(body.toIndex);
  if (!Number.isInteger(parsed)) return { error: "toIndex integer required", status: 400 };
  const toIndex = Math.max(0, Math.min(parsed, activeKeys.length - 1));
  activeKeys.splice(fromIndex, 1);
  activeKeys.splice(toIndex, 0, sectionKey);
  await rewriteSectionOrder(env, page.id, activeKeys);
  await markPageDraft(env, page.id, slug);

  return { ok: true, section_key: sectionKey, to_index: toIndex };
}

export async function setSectionVisibility(env, slug, sectionKey, body = {}) {
  const ensured = await ensurePage(env, slug);
  if (ensured.error) return ensured;
  const page = ensured.page;
  const rows = await orderedSectionRows(env, page.id);
  const row = rows.find((entry) => entry.section_key === sectionKey && entry.status !== "removed");
  if (!row) return { error: "Section not found", status: 404 };

  const content = await sectionContentForRow(env, slug, row);
  content.__editor = {
    ...(content.__editor || {}),
    visibility: {
      ...(content.__editor?.visibility || {}),
      enabled: body.enabled !== false,
    },
  };
  const saved=await persistSectionDraft(env, slug, page.id, sectionKey, content, row.sort_order);
  if (saved.error) return saved;
  if (content.__editor?.generated) await syncGeneratedRevision(env,slug,sectionKey,content,saved);
  await markPageDraft(env, page.id, slug);

  return { ok: true, section_key: sectionKey, enabled: body.enabled !== false };
}

export async function removeSection(env, slug, sectionKey) {
  const ensured = await ensurePage(env, slug);
  if (ensured.error) return ensured;
  const page = ensured.page;
  const rows = await orderedSectionRows(env, page.id);
  const row = rows.find((entry) => entry.section_key === sectionKey && entry.status !== "removed");
  if (!row) return { error: "Section not found", status: 404 };

  const content = await sectionContentForRow(env, slug, row);
  content.__editor = {
    ...(content.__editor || {}),
    removed: true,
    visibility: { ...(content.__editor?.visibility || {}), enabled: false },
  };
  const saved=await persistSectionDraft(env, slug, page.id, sectionKey, content, row.sort_order);
  if (saved.error) return saved;
  if (content.__editor?.generated) await syncGeneratedRevision(env,slug,sectionKey,content,saved,{removed:true});
  await env.DB.prepare(
    `UPDATE page_sections SET status = 'removed', updated_at = datetime('now') WHERE page_id = ? AND section_key = ?`
  ).bind(page.id, sectionKey).run();
  // A removed section must be removed from the canonical page composition too.
  // Preserve its block rows and revisions for undo/history; do not cascade-delete.
  await env.DB.prepare(`UPDATE cms_page_sections SET status='removed',updated_at=datetime('now')
    WHERE legacy_section_id=?`).bind(row.id).run();
  await markPageDraft(env, page.id, slug);

  return { ok: true, section_key: sectionKey, removed: true };
}

function sectionDefinitionForInstance(slug, sectionKey, content) {
  const templateKey =
    content?.__editor?.templateKey ||
    (PAGE_REGISTRY[slug]?.sections?.[sectionKey] ? sectionKey : null);
  if (!templateKey) return { templateKey: null, section: null };
  return {
    templateKey,
    section: PAGE_REGISTRY[slug]?.sections?.[templateKey] || null,
  };
}

function ensureBlockState(content, sectionDef) {
  content.__editor = { ...(content.__editor || {}) };
  if (!Array.isArray(content.__editor.blocks)) {
    content.__editor.blocks = structuredClone(
      sectionDef?.defaultContent?.__editor?.blocks || []
    );
  }
  return content.__editor.blocks;
}

function blockDefinition(sectionDef, templateKey) {
  return (sectionDef?.blocks || []).find((block) => block.key === templateKey) || null;
}

function blockIdBase(value) {
  return String(value || "block")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 44) || "block";
}

async function editableSection(env, slug, sectionKey) {
  const ensured = await ensurePage(env, slug);
  if (ensured.error) return ensured;
  const page = ensured.page;
  const rows = await orderedSectionRows(env, page.id);
  const row = rows.find(
    (entry) => entry.section_key === sectionKey && entry.status !== "removed"
  );
  if (!row) return { error: "Section not found", status: 404 };
  const content = await sectionContentForRow(env, slug, row);
  const resolved = sectionDefinitionForInstance(slug, sectionKey, content);
  if (!resolved.section) {
    return { error: "Section template is not registered", status: 409 };
  }
  return { page, row, content, ...resolved };
}

export async function insertBlock(env, slug, sectionKey, body = {}) {
  const editable = await editableSection(env, slug, sectionKey);
  if (editable.error) return editable;

  const templateKey = String(body.templateKey || body.template_key || "").trim();
  const def = blockDefinition(editable.section, templateKey);
  if (!def) return { error: "Unknown block template", status: 400 };

  const blocks = ensureBlockState(editable.content, editable.section);
  const sameType = blocks.filter((block) => block.templateKey === templateKey);
  if (Number.isFinite(def.max) && sameType.length >= Number(def.max)) {
    return { error: "Block limit reached", status: 409 };
  }

  const blockId = `${blockIdBase(templateKey)}-${crypto.randomUUID().slice(0, 8)}`;
  editable.content[blockId] = structuredClone(def.defaultContent || {});
  const meta = { id: blockId, templateKey, enabled: true };

  const toIndex = Number.isInteger(body.toIndex)
    ? Math.max(0, Math.min(body.toIndex, blocks.length))
    : blocks.length;
  blocks.splice(toIndex, 0, meta);

  const saved = await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order,
    { expectedVersion: editable.row.content_version }
  );
  if (saved.error) return saved;
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: blockId, template_key: templateKey, canonical: saved.canonical };
}

export async function duplicateBlock(env, slug, sectionKey, blockId) {
  const editable = await editableSection(env, slug, sectionKey);
  if (editable.error) return editable;

  const blocks = ensureBlockState(editable.content, editable.section);
  const sourceIndex = blocks.findIndex((block) => block.id === blockId);
  if (sourceIndex < 0) return { error: "Block not found", status: 404 };

  const sourceMeta = blocks[sourceIndex];
  const def = blockDefinition(editable.section, sourceMeta.templateKey);
  if (!def) return { error: "Block template is not registered", status: 409 };

  const sameType = blocks.filter((block) => block.templateKey === sourceMeta.templateKey);
  if (Number.isFinite(def.max) && sameType.length >= Number(def.max)) {
    return { error: "Block limit reached", status: 409 };
  }

  const newId = `${blockIdBase(sourceMeta.templateKey)}-${crypto.randomUUID().slice(0, 8)}`;
  editable.content[newId] = structuredClone(
    editable.content[blockId] || def.defaultContent || {}
  );
  blocks.splice(sourceIndex + 1, 0, {
    id: newId,
    templateKey: sourceMeta.templateKey,
    enabled: true,
  });

  const saved = await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order,
    { expectedVersion: editable.row.content_version }
  );
  if (saved.error) return saved;
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: newId, canonical: saved.canonical };
}

export async function moveBlock(env, slug, sectionKey, blockId, body = {}) {
  const editable = await editableSection(env, slug, sectionKey);
  if (editable.error) return editable;

  const blocks = ensureBlockState(editable.content, editable.section);
  const fromIndex = blocks.findIndex((block) => block.id === blockId);
  if (fromIndex < 0) return { error: "Block not found", status: 404 };

  const parsed = Number(body.toIndex);
  if (!Number.isInteger(parsed)) return { error: "toIndex integer required", status: 400 };
  const toIndex = Math.max(0, Math.min(parsed, blocks.length - 1));
  const [moved] = blocks.splice(fromIndex, 1);
  blocks.splice(toIndex, 0, moved);

  const saved = await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order,
    { expectedVersion: editable.row.content_version }
  );
  if (saved.error) return saved;
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: blockId, to_index: toIndex, canonical: saved.canonical };
}

export async function removeBlock(env, slug, sectionKey, blockId) {
  const editable = await editableSection(env, slug, sectionKey);
  if (editable.error) return editable;

  const blocks = ensureBlockState(editable.content, editable.section);
  const index = blocks.findIndex((block) => block.id === blockId);
  if (index < 0) return { error: "Block not found", status: 404 };

  const meta = blocks[index];
  const def = blockDefinition(editable.section, meta.templateKey);
  const sameType = blocks.filter((block) => block.templateKey === meta.templateKey);
  if (def && Number.isFinite(def.min) && sameType.length <= Number(def.min)) {
    return { error: "At least one block of this type is required", status: 409 };
  }

  blocks.splice(index, 1);
  delete editable.content[blockId];

  const saved = await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order,
    { expectedVersion: editable.row.content_version }
  );
  if (saved.error) return saved;
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: blockId, removed: true, canonical: saved.canonical };
}

export async function publishPage(env, slug) {
  let page = await loadPageRow(env, slug);
  if (!page) {
    const seeded = await seedPageFromRegistry(env, slug);
    if (seeded.error) return seeded;
    page = await loadPageRow(env, slug);
  }

  // A missing or corrupted immutable generated implementation must block
  // publication before mutating D1 status or the last public R2 snapshot.
  const proposed = await attachGeneratedImplementations(env,slug,await loadSectionsFromDb(env,slug,page.id));
  if (proposed.some((section)=>section.status!=="removed" &&
      section.content?.__editor?.generated && !section.implementation)) {
    return {error:"Generated section implementation is not verified in R2",status:409};
  }
  await publishSectionsToR2(env, slug, page.id);

  await env.DB.prepare(
    `UPDATE page_sections SET status = 'published', updated_at = datetime('now') WHERE page_id = ? AND status != 'removed'`
  )
    .bind(page.id)
    .run();

  await env.DB.prepare(
    `UPDATE pages SET status = 'published', updated_at = datetime('now') WHERE id = ?`
  )
    .bind(page.id)
    .run();

  const snapshot = await writePublishedSnapshot(env, slug);
  if (snapshot) {
    await env.DB.prepare(`UPDATE cms_page_sections SET status='published',updated_at=datetime('now')
      WHERE legacy_section_id IN (SELECT id FROM page_sections WHERE page_id=? AND status!='removed')`)
      .bind(page.id).run();
    await env.DB.prepare(`UPDATE cms_pages SET status='published',updated_at=datetime('now')
      WHERE id IN (SELECT page_id FROM cms_page_sections
        WHERE legacy_section_id IN (SELECT id FROM page_sections WHERE page_id=?))`)
      .bind(page.id).run();
  }
  return { ok: true, published_at: snapshot?.updated_at || null };
}

export async function seedPageFromRegistry(env, slug) {
  const reg = getRegistryPage(slug);
  if (!reg) return { error: "Unknown page", status: 404 };
  if (reg.status === "draft") {
    // Revise pages must enter through the versioned R2 + D1 draft installer;
    // never silently bootstrap a private draft as a published storefront.
    return { error: "Draft-only page requires CMS import", status: 409 };
  }

  await env.DB.prepare(
    `INSERT INTO pages (slug, title, status, updated_at)
     VALUES (?, ?, 'published', datetime('now'))
     ON CONFLICT(slug) DO UPDATE SET title = excluded.title, updated_at = datetime('now')`
  )
    .bind(slug, reg.title)
    .run();

  const page = await loadPageRow(env, slug);

  for (const section of reg.sections) {
    const r2Meta = await writeSectionDraft(env, slug, section.key, section.content, { version: 0 });
    await publishSectionToR2(env, slug, section.key, {
      content: section.content,
      version: r2Meta.version,
    });

    const r2_key = r2Meta.key;
    const d1Json = WRITE_D1_CONTENT_JSON ? JSON.stringify(section.content) : D1_CONTENT_PLACEHOLDER;

    await env.DB.prepare(
      `INSERT INTO page_sections
       (page_id, section_key, sort_order, content_json, content_r2_key, content_version, content_hash, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'published', datetime('now'))
       ON CONFLICT(page_id, section_key) DO UPDATE SET
         sort_order = excluded.sort_order,
         content_json = excluded.content_json,
         content_r2_key = excluded.content_r2_key,
         content_version = excluded.content_version,
         content_hash = excluded.content_hash,
         status = 'published',
         updated_at = datetime('now')`
    )
      .bind(
        page.id,
        section.key,
        section.sort_order,
        d1Json,
        r2_key,
        r2Meta.version,
        r2Meta.content_hash
      )
      .run();
  }

  await env.DB.prepare(`UPDATE pages SET status = 'published', updated_at = datetime('now') WHERE id = ?`)
    .bind(page.id)
    .run();

  await writePublishedSnapshot(env, slug);
  return { ok: true, slug };
}

/** Backfill R2 from legacy D1 content_json rows */
export async function backfillSectionsToR2(env) {
  const { results } = await env.DB.prepare(
    `SELECT ps.id, ps.page_id, ps.section_key, ps.content_json, ps.content_r2_key, ps.content_version, ps.status,
            p.slug
     FROM page_sections ps
     JOIN pages p ON p.id = ps.page_id`
  ).all();

  let migrated = 0;
  for (const row of results) {
    if (row.content_r2_key) continue;
    const content = parseContent(row.content_json);
    if (!Object.keys(content).length) continue;

    const r2Meta = await writeSectionDraft(env, row.slug, row.section_key, content, {
      version: row.content_version || 0,
    });
    if (row.status === "published") {
      await publishSectionToR2(env, row.slug, row.section_key, {
        content,
        version: r2Meta.version,
      });
    }

    await env.DB.prepare(
      `UPDATE page_sections
       SET content_json = ?, content_r2_key = ?, content_version = ?, content_hash = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind(D1_CONTENT_PLACEHOLDER, r2Meta.key, r2Meta.version, r2Meta.content_hash, row.id)
      .run();

    migrated++;
  }

  return { ok: true, migrated };
}

/** @deprecated */ export const seedPageFromStub = seedPageFromRegistry;

export async function bootstrapAllPages(env) {
  const slugs = Object.keys(PAGE_REGISTRY);
  const results = [];
  for (const slug of slugs) {
    if (PAGE_REGISTRY[slug]?.defaultStatus === "draft") {
      results.push({slug, status: "skipped_draft"});
      continue;
    }
    results.push(await seedPageFromRegistry(env, slug));
  }
  return { ok: true, pages: results };
}

export async function handlePublicCmsApi(request, env, url) {
  const path = url.pathname;
  const preview = url.searchParams.get("preview") === "1";

  const match = path.match(/^\/api\/cms\/pages\/([a-z0-9-]+)$/);
  if (!match || request.method !== "GET") {
    return json({ error: "Not found" }, { status: 404 });
  }

  const slug = match[1];

  if (preview) {
    const { getSessionUser } = await import("../lib/auth.js");
    const user = await getSessionUser(request, env);
    if (!user) return json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canReadCmsDraft(env, slug, user.account_id))) {
      return json({ error: "CMS draft not available for this account" }, { status: 403 });
    }

    const page = await getPreviewPage(env, slug);
    if (!page) return json({ error: "Page not found" }, { status: 404 });
    return json({ ok: true, page });
  }

  const page = await getPublishedPage(env, slug);
  if (!page) return json({ error: "Page not found" }, { status: 404 });

  return json(
    { ok: true, page },
    {
      headers: {
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
      },
    }
  );
}

/**
 * Install or revise a semantic section in the existing private draft.
 * The generator stream itself never writes D1 or publishes anything.
 */
export async function acceptGeneratedSection(env, slug, accountId, body = {}, siteId = null, pageId = null) {
  if (!accountId) return { error: "Account required", status: 403 };
  const scope = await resolveCmsPageScope(env, accountId, { siteId, pageId, slug });
  if (scope.error) return scope;
  const pageSlug = scope.page.slug;
  const legacyBacked = await legacyPageLinkMatches(env, scope.page);
  const legacyPage = legacyBacked ? await loadPageRow(env, pageSlug) : null;
  if (legacyBacked && (!legacyPage || Number(legacyPage.id) !== Number(scope.page.legacy_page_id))) {
    return { error: "The legacy page identity no longer matches this site", status: 409 };
  }

  const existingKey = String(body.sectionKey || "");
  const replacing = Boolean(existingKey);
  let current = null;
  if (replacing) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(existingKey)) return { error: "Invalid section key", status: 422 };
    const row = legacyBacked
      ? await env.DB.prepare("SELECT id,content_version,sort_order FROM page_sections WHERE page_id=? AND section_key=? AND status!='removed'")
        .bind(legacyPage.id, existingKey).first()
      : await env.DB.prepare("SELECT id,content_version,sort_order FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=? AND status NOT IN ('archived','removed')")
        .bind(accountId, scope.page.id, existingKey).first();
    if (!row) return { error: "Generated section not found", status: 404 };
    const draft = legacyBacked
      ? await readSectionContent(env, pageSlug, existingKey)
      : { content: await canonicalSectionContent(env, await env.DB.prepare(
          "SELECT * FROM cms_page_sections WHERE id=? AND account_id=? AND page_id=?"
        ).bind(row.id, accountId, scope.page.id).first()) };
    if (!draft?.content?.__editor?.generated) return { error: "Cannot replace a built-in section with generated code", status: 409 };
    if (Number(body.expectedVersion) !== Number(row.content_version)) return { error: "Draft changed since last edit", status: 409 };
    if (draft.content.__editor.definitionKey !== body.record?.definition?.type) {
      return { error: "Changing the semantic section type is not supported", status: 422 };
    }
    current = { row, draft };
  }

  const type = String(body.record?.definition?.type || "");
  const sectionKey = existingKey || (type.slice(0, 28) + "-" + crypto.randomUUID().slice(0, 8));
  let written;
  try {
    written = await persistGeneratedImplementation(env, accountId, body.record, sectionKey, body.provenance || {});
  } catch (error) {
    return { error: "Unable to persist generated artifact: " + error.message, status: 500 };
  }
  if (!written.ok) return written;
  const content = {
    ...written.settings,
    __editor: {
      ...(current?.draft?.content?.__editor || {}),
      templateKey: written.type,
      definitionKey: written.type,
      definitionVersion: written.version,
      artifactId: written.artifactId,
      generatedSettingsSchema: written.fields,
      generatedSettings: written.settings,
      implementationClass: "artifact_static",
      generated: true,
      source: "agentsam",
      visibility: current?.draft?.content?.__editor?.visibility || { enabled: true },
    },
  };
  const position = current?.row?.sort_order ?? Number((await env.DB.prepare(
    legacyBacked
      ? "SELECT MAX(sort_order) AS n FROM page_sections WHERE page_id=?"
      : "SELECT MAX(sort_order) AS n FROM cms_page_sections WHERE account_id=? AND page_id=?"
  ).bind(...(legacyBacked ? [legacyPage.id] : [accountId, scope.page.id])).first())?.n || 0) + 10;

  if (legacyBacked) {
    const meta = await persistSectionDraft(env, pageSlug, legacyPage.id, sectionKey, content, position,
      { expectedVersion: replacing ? body.expectedVersion : 0 });
    if (meta.error) return meta;
    const legacy = await env.DB.prepare("SELECT id FROM page_sections WHERE page_id=? AND section_key=?")
      .bind(legacyPage.id, sectionKey).first();
    await env.DB.prepare(`INSERT INTO cms_page_sections
      (account_id,page_id,legacy_section_id,section_key,section_type,sort_order,status,content_object_key,content_version,content_hash,metadata_json)
      VALUES (?,?,?,?,?,?,'draft',?,?,?,?)
      ON CONFLICT(page_id,section_key) DO UPDATE SET section_type=excluded.section_type,
        sort_order=excluded.sort_order,status='draft',content_object_key=excluded.content_object_key,
        content_version=excluded.content_version,content_hash=excluded.content_hash,
        metadata_json=excluded.metadata_json,updated_at=datetime('now')`)
      .bind(accountId, scope.page.id, legacy?.id ?? null, sectionKey, written.type, position,
        meta.key, meta.version, meta.content_hash, JSON.stringify({ definitionKey: written.type, artifactId: written.artifactId })).run();
    const section = await env.DB.prepare(
      "SELECT id FROM cms_page_sections WHERE account_id=? AND page_id=? AND section_key=?"
    ).bind(accountId, scope.page.id, sectionKey).first();
    const latest = await env.DB.prepare(
      "SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions WHERE account_id=? AND entity_type='section' AND entity_id=?"
    ).bind(accountId, section.id).first();
    const revisionNumber = Number(latest?.n || 0) + 1;
    await env.DB.prepare(`INSERT INTO cms_revisions
      (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key,content_hash,snapshot_json,metadata_json)
      VALUES (?,?,'section',?,?,'draft',?,?,?,?)`)
      .bind(accountId, scope.site.id, section.id, revisionNumber, meta.key, meta.content_hash,
        JSON.stringify({ content, artifactId: written.artifactId, definitionKey: written.type }),
        JSON.stringify({ source: "agentsam", version: written.version })).run();
    await markPageDraft(env, legacyPage.id, pageSlug);
    return { ok: true, published: false, section_key: sectionKey, artifact_id: written.artifactId,
      definition_key: written.type, version: meta.version, revision_number: revisionNumber };
  }

  const currentVersion = Number(current?.row?.content_version || 0);
  const saved = await writeSectionDraft(env, scope.page.id, sectionKey, content, { version: currentVersion });
  let sectionId = current?.row?.id || ("cmss_" + crypto.randomUUID().replaceAll("-", "").slice(0, 20));
  if (current) {
    const changed = await env.DB.prepare(`UPDATE cms_page_sections
      SET section_type=?,sort_order=?,status='draft',content_object_key=?,content_version=?,content_hash=?,
          metadata_json=?,updated_at=datetime('now')
      WHERE id=? AND account_id=? AND page_id=? AND content_version=?`)
      .bind(written.type, position, saved.key, saved.version, saved.content_hash,
        JSON.stringify({ definitionKey: written.type, artifactId: written.artifactId }),
        sectionId, accountId, scope.page.id, currentVersion).run();
    if (d1Changes(changed) !== 1) return { error: "Draft changed since last edit", status: 409, code: "cms_version_conflict" };
  } else {
    await env.DB.prepare(`INSERT INTO cms_page_sections
      (id,account_id,page_id,section_key,section_type,sort_order,status,inline_content_json,
       content_object_key,content_version,content_hash,metadata_json)
      VALUES (?,?,?,?,?,?,'draft','{}',?,?,?,?)`)
      .bind(sectionId, accountId, scope.page.id, sectionKey, written.type, position,
        saved.key, saved.version, saved.content_hash,
        JSON.stringify({ definitionKey: written.type, artifactId: written.artifactId })).run();
  }
  const latest = await env.DB.prepare(
    "SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions WHERE account_id=? AND site_id=? AND entity_type='section' AND entity_id=?"
  ).bind(accountId, scope.site.id, sectionId).first();
  const revisionNumber = Number(latest?.n || 0) + 1;
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,site_id,entity_type,entity_id,revision_number,revision_kind,content_object_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,?,'section',?,?,'draft',?,?,?,?)`)
    .bind(accountId, scope.site.id, sectionId, revisionNumber, saved.key, saved.content_hash,
      JSON.stringify({ content, artifactId: written.artifactId, definitionKey: written.type }),
      JSON.stringify({ source: "agentsam", version: written.version })).run();
  await env.DB.prepare("UPDATE cms_pages SET status='draft',updated_at=datetime('now') WHERE id=? AND account_id=? AND site_id=?")
    .bind(scope.page.id, accountId, scope.site.id).run();
  return { ok: true, published: false, section_key: sectionKey, artifact_id: written.artifactId,
    definition_key: written.type, version: saved.version, revision_number: revisionNumber };
}

export async function handleAdminCmsApi(request, env, url, context = {}) {
  const collectionResponse=await handleCollectionApi(request,env,url,context);
  if(collectionResponse)return collectionResponse;
  const path = url.pathname;
  const method = request.method;
  const siteId = url.searchParams.get("site_id") || null;
  const pageId = url.searchParams.get("page_id") || null;
  const pageMode = async (slug) => {
    const scope = await resolveCmsPageScope(env, context.accountId, { siteId, pageId, slug });
    if (scope.error) {
      if (scope.site?.is_default && !pageId) return { legacy: true, fallback: true };
      return scope;
    }
    return { scope, canonical: !(await legacyPageLinkMatches(env, scope.page)) };
  };

  if (path === "/api/admin/cms/warm" && method === "POST") {
    const { warmAllCmsPages } = await import("./deploy.js");
    return json(await warmAllCmsPages(env));
  }

  const historyMatch = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/generated-revisions$/);
  if (historyMatch && method === "GET") {
    const result = await listGeneratedRevisions(env, historyMatch[1], historyMatch[2], context.accountId, siteId, pageId);
    return json(result,{status:result.status||200});
  }
  const restoreMatch = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/generated-restore$/);
  if (restoreMatch && method === "POST") {
    let body;
    try {body=await request.json();} catch {return json({error:"Invalid JSON"},{status:400});}
    const result = await restoreGeneratedRevision(env, restoreMatch[1], restoreMatch[2], context.accountId, body, siteId, pageId);
    return json(result,{status:result.status||200});
  }

  const generatedMatch = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/generated-accept$/);
  if (generatedMatch && method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return json({error:"Invalid JSON"}, {status:400}); }
    const result = await acceptGeneratedSection(env, generatedMatch[1], context.accountId, body, siteId, pageId);
    return json(result,{status:result.status || 200});
  }

  if (path === "/api/admin/cms/theme-projects" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const selectedSite=url.searchParams.get('site_id') || null;
    if (!selectedSite) return json({ok:false,error:'site_id_required'}, {status:400});
    let site;
    try { site=await resolveCmsSite(env.DB,{accountId:context.accountId,siteId:selectedSite}); }
    catch (error) {return json({ok:false,error:String(error.message||error)},{status:409});}
    // Listing installed theme projects must be a pure account/site-scoped
    // read. The previous starter seeder could inject Heuristic pages and
    // globals into an otherwise independent marketplace draft on editor open.
    const result = await listThemeProjects(env, context.accountId, site.id);
    return json(result, { status: result.status || (result.ok ? 200 : 503) });
  }
  if (path === "/api/admin/cms/theme-projects" && method === "POST") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const selectedSite = body.site_id || url.searchParams.get("site_id") || null;
    if (!selectedSite) return json({ok:false,error:'site_id_required'}, {status:400});
    const result = await createThemeProject(env, context.accountId, body.project, selectedSite);
    return json(result, { status: result.status || (result.ok ? 201 : 400) });
  }
  const projectHistoryMatch = path.match(/^\/api\/admin\/cms\/theme-projects\/([A-Za-z0-9_-]{1,160})\/history(?:\/([0-9]{1,10}))?$/);
  if (projectHistoryMatch && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const selected = url.searchParams.get("site_id") || null;
    const result = projectHistoryMatch[2]
      ? await getThemeProjectSnapshot(env, context.accountId, projectHistoryMatch[1], projectHistoryMatch[2], selected)
      : await listThemeProjectHistory(env, context.accountId, projectHistoryMatch[1], selected);
    return json(result, { status: result.status || (result.ok ? 200 : 404) });
  }
  const themeProjectMatch = path.match(/^\/api\/admin\/cms\/theme-projects\/([A-Za-z0-9_-]{1,160})$/);
  if (themeProjectMatch && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const result = await getThemeProject(env, context.accountId, themeProjectMatch[1], url.searchParams.get("site_id") || null);
    return json(result, { status: result.status || (result.ok ? 200 : 404) });
  }
  if (themeProjectMatch && method === "PUT") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await saveThemeProject(env, context.accountId, themeProjectMatch[1], body.project, body.expected_version, body.site_id || url.searchParams.get("site_id") || null);
    return json(result, { status: result.status || (result.ok ? 200 : 400) });
  }
  const themeInstallMatch = path.match(/^\/api\/admin\/cms\/themes\/([a-z][a-z0-9-]{0,63})\/install$/);
  if (themeInstallMatch && method === "POST") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await installThemeDraft(env, context.accountId, themeInstallMatch[1], body, body.site_id || url.searchParams.get("site_id") || null);
    return json(result, { status: result.status || (result.ok ? 201 : 400) });
  }

  if (path === "/api/admin/cms/themes" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const result = await listStoreThemes(env, context.accountId, url.searchParams.get("site_id") || null);
    return json(result, { status: result.ok ? 200 : 503 });
  }
  if (path === "/api/admin/cms/theme-selection" && method === "PUT") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await selectThemePreview(env, body.slug, context.accountId,
      body.expected_version ?? null, body.site_id || url.searchParams.get("site_id") || null);
    return json(result, { status: result.status || 200 });
  }

  if (path === "/api/admin/cms/registry" && method === "GET") {
    // The studio bridge may supply a portable registry without a logged-in
    // account. In hosted admin, discover only definitions for this session.
    if (!context.accountId) return json(registryForAdmin());
    const definitions = await listCmsDefinitions(env, context.accountId, { status: "active" });
    const registry = attachCmsDefinitions(registryForAdmin(), definitions);
    let catalog = [];
    try {
      catalog = await listCmsComponentCatalog(env, context.accountId);
    } catch {
      // A missing catalog must not take down the editor's native registry.
      registry.catalogError = "cms_component_catalog_unavailable";
    }
    return json({ ...registry, catalog });
  }

  if (path === "/api/admin/cms/composition" && method === "GET") {
    // Read-only preview of the canonical D1 authoring tree. This is not the
    // public publication snapshot, which is separately signed/published to R2.
    if (!context.accountId) return json({ error:"Account required" }, {status:403});
    const requestedSlug = url.searchParams.get("slug") || "";
    if (!/^[a-z0-9-]{1,100}$/.test(requestedSlug))
      return json({error:"Invalid page slug"},{status:400});
    const composition = await readCanonicalComposition(env,context.accountId,requestedSlug,url.searchParams.get("site_id") || null);
    return composition
      ? json({ok:true,composition})
      : json({error:"Canonical page not found"},{status:404});
  }

  if (path === "/api/admin/cms/definitions" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const filters = {
      kind: url.searchParams.get("kind") || undefined,
      status: url.searchParams.get("status") || "active",
      key: url.searchParams.get("key") || undefined,
      version: url.searchParams.get("version") || undefined,
    };
    try {
      const definitions = await listCmsDefinitions(env, context.accountId, filters);
      const authoring = createAuthoringEngine(definitions);
      return json({ ok: true, definitions, authoring_diagnostics: authoring.diagnostics });
    } catch (error) {
      if (/^invalid_definition_/.test(String(error.message))) {
        return json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  }

  if (path === "/api/admin/cms/bootstrap" && method === "POST") {
    return json(await bootstrapAllPages(env));
  }

  if (path === "/api/admin/cms/backfill-r2" && method === "POST") {
    const backfill = await backfillSectionsToR2(env);
    for (const slug of Object.keys(PAGE_REGISTRY)) {
      await writePublishedSnapshot(env, slug);
    }
    return json(backfill);
  }

  if (path === "/api/admin/cms/sites" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const sites = await listCmsSites(env.DB, context.accountId);
    // Site names are not unique. Show actual page counts so two similarly
    // named client sites cannot be mistaken for the same editable website.
    // Ownership comes from cms_sites, never from a client-provided site ID.
    const { results = [] } = await env.DB.prepare(`
      SELECT p.site_id, COUNT(*) AS pages FROM cms_pages p
      INNER JOIN cms_sites owner ON owner.id=p.site_id
      WHERE owner.account_id=? GROUP BY p.site_id
    `).bind(context.accountId).all();
    const counts = new Map(results.map(row => [row.site_id, Number(row.pages || 0)]));
    const sitesWithCounts = sites.map(site => ({ ...site, page_count: counts.get(site.id) || 0 }));
    return json({
      ok: true, sites: sitesWithCounts,
      default_site_id: sitesWithCounts.find(site => site.is_default)?.id || null,
    });
  }
  if (path === "/api/admin/cms/sites" && method === "POST") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    try {
      const site = await createCmsSite(env.DB, context.accountId, body.site || body);
      const seeded=await ensureCmsSiteStarter(env,context.accountId,site.id);
      if(!seeded.ok) return json({ok:false,error:seeded.error||'cms_starter_install_failed',
        site_id:site.id,retryable:true},{status:seeded.status||503});
      return json({ ok: true, site, starter: {installed:true, editor_url:seeded.editor_url} }, { status: 201 });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /invalid|required/.test(message) ? 400 : /unique|constraint/i.test(message) ? 409 : 500;
      return json({ error: message }, { status });
    }
  }

  if (path === "/api/admin/cms/pages" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    try {
      return json(await listPagesAdmin(env, context.accountId, siteId));
    } catch (error) {
      const message = String(error?.message || error);
      return json({ error: message }, { status: /not_found|required/.test(message) ? 404 : 400 });
    }
  }
  if (path === "/api/admin/cms/pages" && method === "POST") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await createPageAdmin(env, context.accountId, siteId, body);
    if (result.error) return json({ error: result.error }, { status: result.status || 400 });
    return json(result, { status: 201 });
  }

  let m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)$/);
  if (m && method === "GET") {
    const data = await getPageAdminForSite(env, context.accountId, m[1], siteId, pageId);
    if (!data) return json({ error: "Page not found in the selected site" }, { status: 404 });
    return json(data);
  }
  if (m && method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const result = await updatePageMetaForSite(env, context.accountId, m[1], siteId, pageId, body);
    if (result.error) return json({ error: result.error }, { status: result.status || 400 });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/publish$/);
  if (m && method === "POST") {
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    if (mode.canonical) {
      return json({ error: "This page needs an installed, verified theme renderer before it can be published", code: "cms_page_renderer_required" }, { status: 409 });
    }
    const result = await publishPage(env, m[1]);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/seed$/);
  if (m && method === "POST") {
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    if (mode.canonical) {
      return json({ error: "Registry seeding is only available for legacy-backed pages; use the site-scoped section catalog instead", status: 409 }, { status: 409 });
    }
    const result = await seedPageFromRegistry(env, mode.scope.page.slug);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/import-live$/);
  if (m && method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    if (mode.canonical) {
      return json({ error: "Live-source reconciliation is not yet supported for site-first pages. Existing content remains unchanged.", code: "cms_live_import_legacy_only" }, { status: 409 });
    }
    const result = await importLivePageDraft(env, mode.scope.page.slug, body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/catalog-resources$/);
  if (m && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = await listInstalledCatalogResources(env, m[1], context.accountId, siteId, pageId);
    if (result.error) return json({ error: result.error }, { status: result.status || 400 });
    return json(result);
  }
  if (m && method === "POST") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await installCanonicalCatalogResource(env, mode.scope, body)
      : await installCatalogResource(env, mode.scope.page.slug, context.accountId, body);
    if (result.error) return json(result, { status: result.status || 400 });
    return json(result, { status: 201 });
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections$/);
  if (m && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const styleGate = validateSectionStyles(body?.content);
    if (!styleGate.ok) return json({ error: styleGate.error }, { status: 422 });
    const generatedGate = await guardSectionWrite(body);
    if (!generatedGate.ok) return json({ error: generatedGate.error }, { status: generatedGate.status });
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await insertCanonicalPageSection(env, mode.scope, body)
      : await insertSection(env, m[1], body);
    if (result.error) return json({ error: result.error }, { status: result.status || 400 });
    return json(result, { status: 201 });
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/duplicate$/);
  if (m && method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      /* optional body */
    }
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await duplicateCanonicalPageSection(env, mode.scope, m[2])
      : await duplicateSection(env, m[1], m[2], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/move$/);
  if (m && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await moveCanonicalPageSection(env, mode.scope, m[2], body)
      : await moveSection(env, m[1], m[2], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/visibility$/);
  if (m && method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await setCanonicalPageSectionVisibility(env, mode.scope, m[2], body)
      : await setSectionVisibility(env, m[1], m[2], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  // Restore an immutable section revision through the same canonical writer.
  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/restore$/);
  if(m && method === 'POST'){
    let body;
    try{body=await request.json();}catch{return json({error:'Invalid JSON'},{status:400});}
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await restoreCanonicalPageSectionRevision(env, mode.scope, m[2], body)
      : await restoreSectionRevision(env, m[1], m[2], context.accountId, body, siteId, pageId);
    return json(result,{status:result.status||200});
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/blocks$/);
  if (m && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const styleGate = validateSectionStyles(body?.content);
    if (!styleGate.ok) return json({ error: styleGate.error }, { status: 422 });
    const generatedGate = await guardSectionWrite(body);
    if (!generatedGate.ok) return json({ error: generatedGate.error }, { status: generatedGate.status });
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await insertCanonicalPageBlock(env, mode.scope, m[2], body)
      : await insertBlock(env, m[1], m[2], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/blocks\/([a-z0-9-]+)\/duplicate$/);
  if (m && method === "POST") {
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await duplicateCanonicalPageBlock(env, mode.scope, m[2], m[3])
      : await duplicateBlock(env, m[1], m[2], m[3]);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/blocks\/([a-z0-9-]+)\/move$/);
  if (m && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await moveCanonicalPageBlock(env, mode.scope, m[2], m[3], body)
      : await moveBlock(env, m[1], m[2], m[3], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/blocks\/([a-z0-9-]+)$/);
  if (m && method === "DELETE") {
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await removeCanonicalPageBlock(env, mode.scope, m[2], m[3])
      : await removeBlock(env, m[1], m[2], m[3]);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)$/);
  if (m && method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const styleGate = validateSectionStyles(body?.content);
    if (!styleGate.ok) return json({ error: styleGate.error }, { status: 422 });
    const generatedGate = await guardSectionWrite(body);
    if (!generatedGate.ok) return json({ error: generatedGate.error }, { status: generatedGate.status });
    if(['site-owned','site-owned-legacy'].includes(await cmsPageStorageMode(env.DB))) {
      const saved=await saveSiteOwnedSectionDraft(env,context.accountId,m[1],siteId,pageId,m[2],body);
      return json(saved,{status:saved.status||(saved.ok?200:400)});
    }
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await updateCanonicalPageSection(env, mode.scope, m[2], body)
      : await updateSection(env, m[1], m[2], body);
    if (result.error) return json(result, { status: result.status });
    return json(result);
  }
  if (m && method === "DELETE") {
    const mode = await pageMode(m[1]);
    if (mode.error) return json({ error: mode.error }, { status: mode.status || 404 });
    const result = mode.canonical
      ? await removeCanonicalPageSection(env, mode.scope, m[2])
      : await removeSection(env, m[1], m[2]);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  return null;
}
