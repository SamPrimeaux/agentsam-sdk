import { ROUTE_MANIFEST } from "../lib/route-manifest.js";
import { attachCmsDefinitions, listCmsDefinitions } from "./definition-registry.mjs";
import { listStoreThemes, selectThemePreview } from "./theme-authority.mjs";
import { listThemeProjects, getThemeProject, createThemeProject, installThemeDraft, saveThemeProject } from "./theme-project-store.mjs";
import { readCanonicalComposition } from "./canonical-composition.mjs";
import { listCanonicalPageRows } from "./page-inventory.mjs";
import { createAuthoringEngine } from "../../cms/authoring/engine.ts";
import { reconcileCanonicalBlocks } from "../../cms/authoring/block-projection.ts";
import { validateThemeSettings, validateThemeCss } from "./theme-style-contract.mjs";
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
    `SELECT id,account_id,inline_content_json FROM cms_page_sections WHERE legacy_section_id=? LIMIT 1`
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
       status,inline_content_json,content_r2_key,content_version,content_hash)
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
      `SELECT id,account_id,inline_content_json FROM cms_page_sections WHERE legacy_section_id=? LIMIT 1`
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
    SET inline_content_json=?,content_r2_key=?,content_version=?,content_hash=?,
        status='draft',updated_at=datetime('now')
    WHERE id=? AND legacy_section_id=?
      AND (content_version IS NULL OR content_version <= ?)`)
    .bind(JSON.stringify(content),r2Meta.key,r2Meta.version,r2Meta.content_hash,
      canonical.id,legacySectionId,r2Meta.version).run();
  if (d1Changes(pointer) !== 1)
    return {status:'superseded',reason:'canonical_pointer_has_newer_version'};
  if (content?.__editor?.generated) return {status:'generated_revision_owner'};
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,entity_type,entity_id,revision_number,revision_kind,
     content_r2_key,content_hash,snapshot_json,metadata_json)
    SELECT ?, 'section', ?, ?, 'draft', ?, ?, '{}',
           '{"source":"cms-editor-save","r2_authoritative":true}'
    WHERE NOT EXISTS (SELECT 1 FROM cms_revisions
      WHERE entity_type='section' AND entity_id=? AND revision_kind='draft'
        AND revision_number=? AND content_r2_key=?)`)
    .bind(canonical.account_id,canonical.id,r2Meta.version,r2Meta.key,r2Meta.content_hash,
      canonical.id,r2Meta.version,r2Meta.key).run();
  try {
    const blocks=await reconcileCanonicalBlocks(env.DB,{
      accountId:canonical.account_id,sectionId:canonical.id,content,
      previousContent:parseContent(canonical.inline_content_json),
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
        `SELECT id,account_id,inline_content_json FROM cms_page_sections WHERE legacy_section_id=?`
      ).bind(existing.id).first();
      if (canonical) {
        try {
          await reconcileCanonicalBlocks(env.DB,{
            accountId:canonical.account_id,sectionId:canonical.id,content,dryRun:true,
            previousContent:parseContent(canonical.inline_content_json),
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

export async function listPagesAdmin(env, accountId) {
  // Site-owned canonical instances are the page inventory authority.
  // Legacy page/section pointers are consumed only by the existing editor and
  // storefront renderer until their R2 revisions are fully reconciled.
  const rows = await listCanonicalPageRows(env.DB, accountId);
  const pages = [];
  for (const row of rows) {
    const legacyId = row.legacy_page_id == null ? null : Number(row.legacy_page_id);
    const published = legacyId == null ? null : await getPublishedPage(env, row.slug);
    const content = legacyId == null ? [] : await loadSectionsFromDb(env, row.slug, legacyId);
    const linked = content.some((section) => section.content?.__editor?.source === "live-storefront");
    const canonicalPreview = extractPreview(parseContent(row.preview_json));
    pages.push({
      id: row.id,
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

  // The route catalog may expose a live page that has not been imported yet.
  // Clearly distinguish that discovery-only entry from a real CMS document.
  const existing = new Set(pages.map((page) => page.slug));
  for (const registryPage of listRegistryPages()) {
    if (existing.has(registryPage.slug)) continue;
    pages.push({
      id: null,
      slug: registryPage.slug,
      title: registryPage.title,
      status: "draft",
      updated_at: null,
      section_count: registryPage.section_count,
      preview: "Live storefront exists; CMS has not imported this page",
      source: "registry",
      ...resolvePageAuthority(registryPage.slug, CMS_STOREFRONT_ROUTES),
    });
  }

  pages.sort((a, b) => String(a.title || a.slug).localeCompare(String(b.title || b.slug)));
  return { ok: true, source: "cms_pages+cms_page_sections", pages };
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
  const instance=await env.DB.prepare(`SELECT s.id,s.account_id FROM cms_page_sections s
    JOIN cms_pages p ON p.id=s.page_id AND p.account_id=s.account_id
    WHERE p.slug=? AND s.section_key=?`).bind(slug,key).first();
  if (!instance) throw new Error("Canonical generated section is missing");
  await env.DB.prepare(`UPDATE cms_page_sections SET status='draft',content_r2_key=?,
    content_version=?,content_hash=?,updated_at=datetime('now') WHERE id=? AND account_id=?`)
    .bind(meta.key,meta.version,meta.content_hash,instance.id,instance.account_id).run();
  const previous=await env.DB.prepare(`SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions
    WHERE account_id=? AND entity_type='section' AND entity_id=?`)
    .bind(instance.account_id,instance.id).first();
  const next=Number(previous?.n||0)+1;
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,entity_type,entity_id,revision_number,revision_kind,content_r2_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,'section',? ,?,'draft',?,?,?,?)`)
    .bind(instance.account_id,instance.id,next,meta.key,meta.content_hash,
      JSON.stringify({content,artifactId:content.__editor.artifactId,definitionKey:content.__editor.definitionKey}),
      JSON.stringify({source:"agentsam",...metadata})).run();
  return next;
}

export async function listGeneratedRevisions(env,slug,key,accountId) {
  if (!accountId) return {error:"Account required",status:403};
  const instance=await env.DB.prepare(`SELECT s.id FROM cms_page_sections s JOIN cms_pages p ON p.id=s.page_id
    WHERE s.account_id=? AND p.account_id=? AND p.slug=? AND s.section_key=?`)
    .bind(accountId,accountId,slug,key).first();
  if (!instance) return {error:"Generated section not found",status:404};
  const response=await env.DB.prepare(`SELECT revision_number,content_hash,created_at,metadata_json FROM cms_revisions
    WHERE account_id=? AND entity_type='section' AND entity_id=? ORDER BY revision_number DESC LIMIT 50`)
    .bind(accountId,instance.id).all();
  return {ok:true,revisions:(response.results||[]).map((revision)=>({
    number:revision.revision_number,createdAt:revision.created_at,hash:revision.content_hash,
    metadata:JSON.parse(revision.metadata_json||"{}"),
  }))};
}

export async function restoreGeneratedRevision(env,slug,key,accountId,body={}) {
  if (!accountId) return {error:"Account required",status:403};
  const number=Number(body.revisionNumber);
  if (!Number.isInteger(number)||number<1) return {error:"Invalid revision number",status:422};
  const target=await env.DB.prepare(`SELECT s.id,s.legacy_section_id FROM cms_page_sections s
    JOIN cms_pages p ON p.id=s.page_id AND p.account_id=s.account_id
    WHERE s.account_id=? AND p.slug=? AND s.section_key=?`)
    .bind(accountId,slug,key).first();
  if (!target) return {error:"Generated section not found",status:404};
  const row=await env.DB.prepare(`SELECT ps.content_version,ps.sort_order,ps.status,ps.page_id FROM page_sections ps
    JOIN pages p ON p.id=ps.page_id WHERE ps.id=? AND p.slug=?`)
    .bind(target.legacy_section_id,slug).first();
  if (!row||row.status==="removed") return {error:"Section not editable",status:409};
  if (Number(body.expectedVersion)!==Number(row.content_version)) return {error:"Draft changed since revision load",status:409};
  const old=await env.DB.prepare(`SELECT snapshot_json FROM cms_revisions WHERE account_id=?
    AND entity_type='section' AND entity_id=? AND revision_number=? LIMIT 1`)
    .bind(accountId,target.id,number).first();
  if (!old) return {error:"Revision not found",status:404};
  let saved;
  try {saved=JSON.parse(old.snapshot_json);} catch {return {error:"Invalid revision snapshot",status:409};}
  if (!saved.content?.__editor?.generated || !saved.artifactId) return {error:"Not a generated revision",status:409};
  const artifact=await env.DB.prepare("SELECT id FROM cms_artifacts WHERE account_id=? AND id=? AND status='ready'")
    .bind(accountId,saved.artifactId).first();
  if (!artifact) return {error:"Revision artifact unavailable",status:409};
  const meta=await persistSectionDraft(env,slug,row.page_id,key,saved.content,row.sort_order,{expectedVersion:row.content_version});
  if (meta.error) return meta;
  const revision=await syncGeneratedRevision(env,slug,key,saved.content,meta,{restoredFrom:number});
  await markPageDraft(env,row.page_id,slug);
  return {ok:true,published:false,section_key:key,version:meta.version,revision_number:revision};
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
export async function restoreSectionRevision(env, slug, sectionKey, accountId, body = {}) {
  if (!accountId) return {error:'Account required',status:403};
  const revisionNumber=Number(body.revision_number);
  if (!Number.isSafeInteger(revisionNumber) || revisionNumber < 1)
    return {error:'Valid revision_number required',status:400};
  const canonical=await env.DB.prepare(
    `SELECT s.id,s.legacy_section_id,s.account_id
      FROM cms_page_sections s JOIN cms_pages p
        ON p.id=s.page_id AND p.account_id=s.account_id
      WHERE p.account_id=? AND p.slug=? AND s.section_key=? AND s.status!='removed'
      LIMIT 1`
  ).bind(accountId,slug,sectionKey).first();
  if(!canonical?.legacy_section_id)return {error:'Canonical section not found',status:404};
  const legacy=await env.DB.prepare(
    `SELECT id,page_id,sort_order,content_version,status FROM page_sections WHERE id=?`
  ).bind(canonical.legacy_section_id).first();
  if(!legacy||legacy.status==='removed')return {error:'Source section unavailable',status:409};
  if(body.expected_version!==undefined&&Number(body.expected_version)!==Number(legacy.content_version))
    return {error:'Draft changed since the requested restore',status:409,code:'cms_version_conflict'};
  const revision=await env.DB.prepare(
    `SELECT content_r2_key FROM cms_revisions
       WHERE account_id=? AND entity_type='section' AND entity_id=?
         AND revision_number=? AND content_r2_key IS NOT NULL
       ORDER BY CASE revision_kind WHEN 'draft' THEN 0 WHEN 'history' THEN 1 ELSE 2 END
       LIMIT 1`
  ).bind(accountId,canonical.id,revisionNumber).first();
  if(!revision?.content_r2_key)return {error:'Revision not found',status:404};
  const snapshot=await readR2Json(env,revision.content_r2_key);
  if(snapshot?.section_key!==sectionKey || !snapshot.content ||
     typeof snapshot.content!=='object' || Array.isArray(snapshot.content))
    return {error:'Revision content unavailable or corrupt',status:409};
  if(snapshot.content.__editor?.generated)
    return {error:'Use generated-restore for generated sections',status:409};
  const saved=await persistSectionDraft(env,slug,legacy.page_id,sectionKey,
    structuredClone(snapshot.content),legacy.sort_order,
    {expectedVersion:legacy.content_version});
  if(saved.error)return saved;
  if(saved.canonical?.status!=='linked')
    return {error:'Canonical restore synchronization incomplete',status:409};
  await markPageDraft(env,legacy.page_id,slug);
  return {ok:true,section_key:sectionKey,restored_revision:revisionNumber,
    version:saved.version,canonical:saved.canonical};
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
      (account_id,page_id,legacy_section_id,section_key,section_type,sort_order,status,content_r2_key,content_version,content_hash,metadata_json)
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
export async function acceptGeneratedSection(env, slug, accountId, body = {}) {
  if (!accountId) return { error:"Account required",status:403 };
  const page = await loadPageRow(env,slug);
  if (!page) return { error:"Open a private working draft before installing generated sections",status:409 };
  const canonical = await env.DB.prepare("SELECT id FROM cms_pages WHERE account_id = ? AND slug = ?").bind(accountId,slug).first();
  if (!canonical) return {error:"Canonical CMS page is not available for this account",status:409};

  const existingKey = String(body.sectionKey || "");
  const replacing = Boolean(existingKey);
  let current = null;
  if (replacing) {
    if (!/^[a-z][a-z0-9-]{1,63}$/.test(existingKey)) return {error:"Invalid section key",status:422};
    const row = await env.DB.prepare("SELECT id,content_version,sort_order FROM page_sections WHERE page_id = ? AND section_key = ? AND status != 'removed'")
      .bind(page.id,existingKey).first();
    if (!row) return {error:"Generated section not found",status:404};
    const draft = await readSectionContent(env,slug,existingKey);
    if (!draft?.content?.__editor?.generated) return {error:"Cannot replace a built-in section with generated code",status:409};
    if (Number(body.expectedVersion) !== Number(row.content_version)) return {error:"Draft changed since last edit",status:409};
    if (draft.content.__editor.definitionKey !== body.record?.definition?.type) return {error:"Changing the semantic section type is not supported",status:422};
    current = { row, draft };
  }
  const type = String(body.record?.definition?.type || "");
  const sectionKey = existingKey || (type.slice(0,28) + "-" + crypto.randomUUID().slice(0,8));
  let written;
  try {
    written = await persistGeneratedImplementation(env,accountId,body.record,sectionKey,body.provenance || {});
  } catch(error) {
    return {error:"Unable to persist generated artifact: " + error.message,status:500};
  }
  if (!written.ok) return written;
  const content = { ...written.settings,
    __editor: {
      ...(current?.draft?.content?.__editor || {}),
      templateKey: written.type,
      definitionKey: written.type,
      definitionVersion: written.version,
      artifactId: written.artifactId,
      generatedSettingsSchema: written.fields,
      generatedSettings: written.settings,
      implementationClass: 'artifact_static',
      generated: true,
      source:"agentsam",
      visibility: current?.draft?.content?.__editor?.visibility || {enabled:true},
    },
  };
  const position = current?.row?.sort_order ??
    (Number((await env.DB.prepare("SELECT MAX(sort_order) AS n FROM page_sections WHERE page_id = ?").bind(page.id).first())?.n || 0) + 10);
  const meta = await persistSectionDraft(env,slug,page.id,sectionKey,content,position,
    {expectedVersion: replacing ? body.expectedVersion : 0});
  if (meta.error) return meta;

  const legacy = await env.DB.prepare("SELECT id FROM page_sections WHERE page_id = ? AND section_key = ?")
    .bind(page.id,sectionKey).first();
  await env.DB.prepare(`INSERT INTO cms_page_sections
    (account_id,page_id,legacy_section_id,section_key,section_type,sort_order,status,content_r2_key,content_version,content_hash,metadata_json)
    VALUES (?,?,?,?,?,?,'draft',?,?,?,?)
    ON CONFLICT(page_id,section_key) DO UPDATE SET section_type=excluded.section_type,
      sort_order=excluded.sort_order,status='draft',content_r2_key=excluded.content_r2_key,
      content_version=excluded.content_version,content_hash=excluded.content_hash,
      metadata_json=excluded.metadata_json,updated_at=datetime('now')`)
    .bind(accountId,canonical.id,legacy?.id ?? null,sectionKey,written.type,position,
      meta.key,meta.version,meta.content_hash,JSON.stringify({definitionKey:written.type,artifactId:written.artifactId})).run();
  const section = await env.DB.prepare("SELECT id FROM cms_page_sections WHERE account_id = ? AND page_id = ? AND section_key = ?")
    .bind(accountId,canonical.id,sectionKey).first();
  const latest = await env.DB.prepare("SELECT COALESCE(MAX(revision_number),0) AS n FROM cms_revisions WHERE account_id = ? AND entity_type = 'section' AND entity_id = ?")
    .bind(accountId,section.id).first();
  await env.DB.prepare(`INSERT INTO cms_revisions
    (account_id,entity_type,entity_id,revision_number,revision_kind,content_r2_key,content_hash,snapshot_json,metadata_json)
    VALUES (?,'section',?,?,'draft',?,?,?,?)`)
    .bind(accountId,section.id,Number(latest?.n||0)+1,meta.key,meta.content_hash,
      JSON.stringify({content,artifactId:written.artifactId,definitionKey:written.type}),
      JSON.stringify({source:"agentsam",version:written.version})).run();
  await markPageDraft(env,page.id,slug);
  return {ok:true,published:false,section_key:sectionKey,artifact_id:written.artifactId,
    definition_key:written.type,version:meta.version,revision_number:Number(latest?.n||0)+1};
}

export async function handleAdminCmsApi(request, env, url, context = {}) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/admin/cms/warm" && method === "POST") {
    const { warmAllCmsPages } = await import("./deploy.js");
    return json(await warmAllCmsPages(env));
  }

  const historyMatch = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/generated-revisions$/);
  if (historyMatch && method === "GET") {
    const result=await listGeneratedRevisions(env,historyMatch[1],historyMatch[2],context.accountId);
    return json(result,{status:result.status||200});
  }
  const restoreMatch = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/generated-restore$/);
  if (restoreMatch && method === "POST") {
    let body;
    try {body=await request.json();} catch {return json({error:"Invalid JSON"},{status:400});}
    const result=await restoreGeneratedRevision(env,restoreMatch[1],restoreMatch[2],context.accountId,body);
    return json(result,{status:result.status||200});
  }

  const generatedMatch = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/generated-accept$/);
  if (generatedMatch && method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return json({error:"Invalid JSON"}, {status:400}); }
    const result = await acceptGeneratedSection(env,generatedMatch[1],context.accountId,body);
    return json(result,{status:result.status || 200});
  }

  if (path === "/api/admin/cms/theme-projects" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const result = await listThemeProjects(env, context.accountId);
    return json(result, { status: result.status || (result.ok ? 200 : 503) });
  }
  if (path === "/api/admin/cms/theme-projects" && method === "POST") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await createThemeProject(env, context.accountId, body.project);
    return json(result, { status: result.status || (result.ok ? 201 : 400) });
  }
  const themeProjectMatch = path.match(/^\\/api\\/admin\\/cms\\/theme-projects\\/([A-Za-z0-9_-]{1,160})$/);
  if (themeProjectMatch && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const result = await getThemeProject(env, context.accountId, themeProjectMatch[1]);
    return json(result, { status: result.status || (result.ok ? 200 : 404) });
  }
  if (themeProjectMatch && method === "PUT") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await saveThemeProject(env, context.accountId, themeProjectMatch[1], body.project, body.expected_version);
    return json(result, { status: result.status || (result.ok ? 200 : 400) });
  }
  const themeInstallMatch = path.match(/^\\/api\\/admin\\/cms\\/themes\\/([a-z][a-z0-9-]{0,63})\\/install$/);
  if (themeInstallMatch && method === "POST") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await installThemeDraft(env, context.accountId, themeInstallMatch[1], body);
    return json(result, { status: result.status || (result.ok ? 201 : 400) });
  }

  if (path === "/api/admin/cms/themes" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    const result = await listStoreThemes(env, context.accountId);
    return json(result, { status: result.ok ? 200 : 503 });
  }
  if (path === "/api/admin/cms/theme-selection" && method === "PUT") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await selectThemePreview(env, body.slug, context.accountId,
      body.expected_version ?? null);
    return json(result, { status: result.status || 200 });
  }

  if (path === "/api/admin/cms/registry" && method === "GET") {
    // The studio bridge may supply a portable registry without a logged-in
    // account. In hosted admin, discover only definitions for this session.
    if (!context.accountId) return json(registryForAdmin());
    const definitions = await listCmsDefinitions(env, context.accountId, { status: "active" });
    return json(attachCmsDefinitions(registryForAdmin(), definitions));
  }

  if (path === "/api/admin/cms/composition" && method === "GET") {
    // Read-only preview of the canonical D1 authoring tree. This is not the
    // public publication snapshot, which is separately signed/published to R2.
    if (!context.accountId) return json({ error:"Account required" }, {status:403});
    const requestedSlug = url.searchParams.get("slug") || "";
    if (!/^[a-z0-9-]{1,100}$/.test(requestedSlug))
      return json({error:"Invalid page slug"},{status:400});
    const composition = await readCanonicalComposition(env,context.accountId,requestedSlug);
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

  if (path === "/api/admin/cms/pages" && method === "GET") {
    if (!context.accountId) return json({ error: "Account required" }, { status: 403 });
    return json(await listPagesAdmin(env, context.accountId));
  }

  let m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)$/);
  if (m && method === "GET") {
    const data = await getPageAdmin(env, m[1]);
    if (!data) return json({ error: "Page not found" }, { status: 404 });
    return json(data);
  }
  if (m && method === "PUT") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const result = await updatePageMeta(env, m[1], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/publish$/);
  if (m && method === "POST") {
    const result = await publishPage(env, m[1]);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/seed$/);
  if (m && method === "POST") {
    const result = await seedPageFromRegistry(env, m[1]);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/import-live$/);
  if (m && method === "POST") {
    let body;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid JSON" }, { status: 400 }); }
    const result = await importLivePageDraft(env, m[1], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections$/);
  if (m && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
    const generatedGate = await guardSectionWrite(body);
    if (!generatedGate.ok) return json({ error: generatedGate.error }, { status: generatedGate.status });
    const result = await insertSection(env, m[1], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/duplicate$/);
  if (m && method === "POST") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      /* optional body */
    }
    const result = await duplicateSection(env, m[1], m[2], body);
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
    const result = await moveSection(env, m[1], m[2], body);
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
    const result = await setSectionVisibility(env, m[1], m[2], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  // Restore an immutable section revision through the same canonical writer.
  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/restore$/);
  if(m && method === 'POST'){
    let body;
    try{body=await request.json();}catch{return json({error:'Invalid JSON'},{status:400});}
    const result=await restoreSectionRevision(env,m[1],m[2],context.accountId,body);
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
    const generatedGate = await guardSectionWrite(body);
    if (!generatedGate.ok) return json({ error: generatedGate.error }, { status: generatedGate.status });
    const result = await insertBlock(env, m[1], m[2], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/blocks\/([a-z0-9-]+)\/duplicate$/);
  if (m && method === "POST") {
    const result = await duplicateBlock(env, m[1], m[2], m[3]);
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
    const result = await moveBlock(env, m[1], m[2], m[3], body);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/blocks\/([a-z0-9-]+)$/);
  if (m && method === "DELETE") {
    const result = await removeBlock(env, m[1], m[2], m[3]);
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
    const generatedGate = await guardSectionWrite(body);
    if (!generatedGate.ok) return json({ error: generatedGate.error }, { status: generatedGate.status });
    const result = await updateSection(env, m[1], m[2], body);
    if (result.error) return json(result, { status: result.status });
    return json(result);
  }
  if (m && method === "DELETE") {
    const result = await removeSection(env, m[1], m[2]);
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  }

  return null;
}
