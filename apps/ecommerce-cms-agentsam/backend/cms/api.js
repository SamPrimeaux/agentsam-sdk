import {
  getRegistryPage,
  listRegistryPages,
  mergeWithRegistry,
  registryForAdmin,
  PAGE_REGISTRY,
} from "./registry.js";
import {
  draftKey,
  publishedKey,
  writeSectionDraft,
  publishSectionToR2,
  loadSectionsFromR2,
  readR2Json,
  readSectionContent,
  D1_CONTENT_PLACEHOLDER,
} from "./r2-store.js";

const KV_PREFIX = "cms:page:";

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

async function loadSectionsFromDb(env, slug, pageId, { publishedOnly = false } = {}) {
  const rows = await loadSectionRows(env, pageId, { publishedOnly });
  return loadSectionsFromR2(env, slug, rows, { publishedOnly });
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

async function persistSectionDraft(
  env,
  slug,
  pageId,
  sectionKey,
  content,
  sortOrder = 0,
  { expectedVersion = null } = {}
) {
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

      if (d1Changes(result) === 1) return r2Meta;

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
      return r2Meta;
    } catch (error) {
      if (attempt >= 2) throw error;
    }
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

  const sections = await loadSectionsFromDb(env, slug, page.id, { publishedOnly: true });
  if (!sections.length) return null;

  return {
    slug: page.slug,
    title: page.title,
    status: page.status,
    updated_at: page.updated_at,
    sections: sections.map(({ key, sort_order, status, content, updated_at }) => ({
      key,
      sort_order,
      status,
      content,
      updated_at,
    })),
    source: "r2",
  };
}

export async function writePublishedSnapshot(env, slug) {
  const snapshot = await buildPublishedSnapshot(env, slug);
  if (!snapshot) {
    await env.CMS_CACHE?.delete(kvKey(slug));
    return null;
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

  const snapshot = await buildPublishedSnapshot(env, slug);
  if (snapshot) {
    if (env.CMS_CACHE) {
      await env.CMS_CACHE.put(kvKey(slug), JSON.stringify(snapshot));
    }
    return snapshot;
  }

  return null;
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
    sections: mergeWithRegistry(slug, sections),
    source: "preview",
  };
}

export async function listPagesAdmin(env) {
  const { results } = await env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.status, p.updated_at,
            (SELECT COUNT(*) FROM page_sections s WHERE s.page_id = p.id) AS section_count,
            (SELECT content_json FROM page_sections s
             WHERE s.page_id = p.id ORDER BY sort_order ASC, id ASC LIMIT 1) AS preview_json
     FROM pages p
     ORDER BY p.title ASC`
  ).all();

  const pages = [];
  for (const row of results) {
    pages.push({
      id: row.id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      updated_at: row.updated_at,
      section_count: row.section_count,
      preview: await previewForPage(env, row.slug, row.id, row.preview_json),
    });
  }

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
      preview: previewFromRegistry(registryPage.slug),
      source: "registry",
    });
  }

  pages.sort((a, b) => String(a.title || a.slug).localeCompare(String(b.title || b.slug)));
  return { ok: true, pages };
}

export async function getPageAdmin(env, slug) {
  const page = await loadPageRow(env, slug);
  if (!page) {
    const reg = getRegistryPage(slug);
    if (!reg) return null;
    return { ok: true, page: { ...reg, status: "draft" }, seeded: false };
  }

  const sections = await loadSectionsFromDb(env, slug, page.id);
  return {
    ok: true,
    seeded: true,
    page: {
      slug: page.slug,
      title: page.title,
      status: page.status,
      updated_at: page.updated_at,
      sections: mergeWithRegistry(slug, sections),
    },
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
  if (!content || typeof content !== "object") {
    return { error: "content object required", status: 400 };
  }

  const meta = await persistSectionDraft(env, slug, page.id, sectionKey, content, 0, {
    // A registry-only page reports version 0 to the browser. Seeding creates v1 inside
    // this request, so the first real user save must not conflict with that initialization.
    expectedVersion: seededNow ? null : body?.expected_version,
  });
  if (meta.error) return meta;

  await env.DB.prepare(`UPDATE pages SET status = 'draft', updated_at = datetime('now') WHERE id = ?`)
    .bind(page.id)
    .run();

  return { ok: true, version: meta.version, updated_at: meta.updated_at };
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
    .bind(pageId)
    .run();
  // Keep the last published KV snapshot live while a draft is being edited.
  // Publishing replaces it atomically via writePublishedSnapshot().
  void slug;
}

async function rewriteSectionOrder(env, pageId, orderedKeys) {
  let order = 0;
  for (const key of orderedKeys) {
    await env.DB.prepare(
      `UPDATE page_sections SET sort_order = ?, updated_at = datetime('now') WHERE page_id = ? AND section_key = ?`
    ).bind(order, pageId, key).run();
    order += 10;
  }
}

async function sectionContentForRow(env, slug, row) {
  const doc = await readSectionContent(env, slug, row.section_key, {
    key: row.content_r2_key,
  });
  return doc?.content || {};
}

export async function insertSection(env, slug, body = {}) {
  const def = PAGE_REGISTRY[slug];
  if (!def) return { error: "Unknown page", status: 404 };

  const templateKey = String(body.templateKey || body.template_key || "").trim();
  const template = def.sections?.[templateKey];
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

  const content = structuredClone(template.defaultContent || {});
  content.__editor = {
    ...(content.__editor || {}),
    templateKey,
    visibility: { ...(content.__editor?.visibility || {}), enabled: true },
  };

  const existing = rows.find((row) => row.section_key === sectionKey);
  const meta = await persistSectionDraft(env, slug, page.id, sectionKey, content, sortOrder);
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
  const templateKey = source.__editor?.templateKey || (PAGE_REGISTRY[slug]?.sections?.[sectionKey] ? sectionKey : null);
  if (!templateKey || !PAGE_REGISTRY[slug]?.sections?.[templateKey]) {
    return { error: "Section template is not registered", status: 409 };
  }

  const newKey = `${sectionKeyBase(templateKey)}-${crypto.randomUUID().slice(0, 8)}`;
  const content = structuredClone(source);
  content.__editor = {
    ...(content.__editor || {}),
    templateKey,
    visibility: { ...(content.__editor?.visibility || {}), enabled: true },
  };

  await persistSectionDraft(env, slug, page.id, newKey, content, Number(sourceRow.sort_order || 0) + 5);
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
  await persistSectionDraft(env, slug, page.id, sectionKey, content, row.sort_order);
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
  await persistSectionDraft(env, slug, page.id, sectionKey, content, row.sort_order);
  await env.DB.prepare(
    `UPDATE page_sections SET status = 'removed', updated_at = datetime('now') WHERE page_id = ? AND section_key = ?`
  ).bind(page.id, sectionKey).run();
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

  await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order
  );
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: blockId, template_key: templateKey };
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

  await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order
  );
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: newId };
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

  await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order
  );
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: blockId, to_index: toIndex };
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

  await persistSectionDraft(
    env,
    slug,
    editable.page.id,
    sectionKey,
    editable.content,
    editable.row.sort_order
  );
  await markPageDraft(env, editable.page.id, slug);

  return { ok: true, section_key: sectionKey, block_id: blockId, removed: true };
}

export async function publishPage(env, slug) {
  let page = await loadPageRow(env, slug);
  if (!page) {
    const seeded = await seedPageFromRegistry(env, slug);
    if (seeded.error) return seeded;
    page = await loadPageRow(env, slug);
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
  return { ok: true, published_at: snapshot?.updated_at || null };
}

export async function seedPageFromRegistry(env, slug) {
  const reg = getRegistryPage(slug);
  if (!reg) return { error: "Unknown page", status: 404 };

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

export async function handleAdminCmsApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/admin/cms/warm" && method === "POST") {
    const { warmAllCmsPages } = await import("./deploy.js");
    return json(await warmAllCmsPages(env));
  }

  if (path === "/api/admin/cms/registry" && method === "GET") {
    return json(registryForAdmin());
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
    return json(await listPagesAdmin(env));
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

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections$/);
  if (m && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
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

  m = path.match(/^\/api\/admin\/cms\/pages\/([a-z0-9-]+)\/sections\/([a-z0-9-]+)\/blocks$/);
  if (m && method === "POST") {
    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, { status: 400 });
    }
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
