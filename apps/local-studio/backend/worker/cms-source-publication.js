/**
 * Atomic CMS publication for registered HTML-source pages.
 * Immutable R2 versions + site-scoped D1 pointer CAS preserve rollback.
 * Draft writes never mutate the public R2 file.
 */
const HTML_LIMIT = 1024 * 1024;
const result = (body, status = 200) => Response.json(body, {
  status, headers: { 'cache-control': 'private, no-store' },
});
const prefixFor = (slug, id) => 'sites/' + slug + '/public/_cms-publications/' + id + '/';
const isOwnedPublic = (slug, key) => typeof key === 'string' &&
  key.startsWith('sites/' + slug + '/public/') &&
  !key.includes('..') && !key.includes('\\');
const isOwnedDraft = (slug, key) => typeof key === 'string' &&
  key.startsWith('sites/' + slug + '/cms/drafts/') &&
  !key.includes('..') && !key.includes('\\');
const validHtml = (html) => typeof html === 'string' &&
  /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(html) &&
  new TextEncoder().encode(html).byteLength <= HTML_LIMIT;
async function sha256(html) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
async function requireHtml(r2, key) {
  const value = await r2.get(key);
  if (!value) return null;
  const html = await value.text();
  return validHtml(html) ? html : null;
}
async function ensureImmutableHtml(r2, key, html, expectedHash) {
  if (!validHtml(html) || await sha256(html) !== expectedHash)
    throw new Error('cms_source_publication_html_invalid');
  const existing = await r2.get(key);
  if (existing && await sha256(await existing.text()) !== expectedHash)
    throw new Error('cms_source_publication_immutable_key_collision');
  if (!existing) {
    await r2.put(key, html, {
      httpMetadata: { contentType: 'text/html; charset=utf-8' },
      customMetadata: { kind: 'cms-published-html', sha256: expectedHash },
    });
  }
  const verification = await requireHtml(r2, key);
  if (!verification || await sha256(verification) !== expectedHash)
    throw new Error('cms_source_publication_r2_verification_failed');
}
export async function changePublishedCmsSource({
  operation, body, website: r2, page, metadata, siteSlug, db, siteId, canPublish,
}) {
  if (!canPublish) return result({ ok: false, error: 'cms_source_publish_forbidden' }, 403);
  if (!['publish', 'rollback'].includes(operation) || body?.confirm !== operation)
    return result({ ok: false, error: 'cms_source_explicit_confirmation_required' }, 400);
  if (!/^[a-zA-Z0-9_-]+$/.test(page.id) ||
      !isOwnedPublic(siteSlug, page.content_object_key))
    return result({ ok: false, error: 'cms_source_publication_scope_violation' }, 409);
  const version = Number(metadata.cms_source_version || 0);
  if (!Number.isInteger(body.expected_version) || body.expected_version !== version)
    return result({ ok: false, error: 'cms_source_version_conflict', version }, 409);

  const oldKey = page.content_object_key;
  const destinationPrefix = prefixFor(siteSlug, page.id);
  const previousHtml = await requireHtml(r2, oldKey);
  if (!previousHtml) return result({ ok: false, error: 'cms_source_published_object_missing' }, 409);
  const previousHash = await sha256(previousHtml);
  let targetKey, targetHash;
  let previousKey = oldKey;
  if (!oldKey.startsWith(destinationPrefix)) {
    previousKey = destinationPrefix + 'baseline-' + previousHash + '.html';
    await ensureImmutableHtml(r2, previousKey, previousHtml, previousHash);
  }

  if (operation === 'publish') {
    const draftKey = metadata.cms_source_draft_key;
    if (!isOwnedDraft(siteSlug, draftKey))
      return result({ ok: false, error: 'cms_source_publish_requires_private_draft' }, 409);
    const html = await requireHtml(r2, draftKey);
    if (!html) return result({ ok: false, error: 'cms_source_draft_missing_or_invalid' }, 409);
    targetHash = await sha256(html);
    if (metadata.cms_source_sha256 !== targetHash)
      return result({ ok: false, error: 'cms_source_draft_integrity_mismatch' }, 409);
    targetKey = destinationPrefix + 'v' + (version + 1) + '-' + targetHash + '.html';
    await ensureImmutableHtml(r2, targetKey, html, targetHash);
  } else {
    if (metadata.cms_source_draft_key)
      return result({ ok: false, error: 'cms_source_rollback_requires_clean_draft_state' }, 409);
    targetKey = metadata.cms_source_previous_key;
    if (!isOwnedPublic(siteSlug, targetKey) || !targetKey.startsWith(destinationPrefix))
      return result({ ok: false, error: 'cms_source_rollback_target_unavailable' }, 409);
    const html = await requireHtml(r2, targetKey);
    if (!html) return result({ ok: false, error: 'cms_source_rollback_object_missing' }, 409);
    targetHash = await sha256(html);
  }

  const now = Math.floor(Date.now() / 1000);
  const receipt = {
    kind: operation, version: version + 1, page_id: page.id,
    published_at: now, key: targetKey, sha256: targetHash,
    previous_key: previousKey, verified: true,
  };
  const nextMetadata = { ...metadata,
    cms_source_kind: 'r2_html',
    cms_source_version: version + 1,
    cms_source_previous_key: previousKey,
    cms_source_published_sha256: targetHash,
    cms_source_publication: receipt,
  };
  delete nextMetadata.cms_source_draft_key;
  delete nextMetadata.cms_source_sha256;
  const priorDraft = metadata.cms_source_draft_key || '';
  const update = await db.prepare(
    "UPDATE cms_pages SET content_object_key = ?, metadata_json = ?, " +
    "status = 'published', published_at = ?, updated_at = ? " +
    "WHERE id = ? AND site_id = ? AND content_object_key = ? " +
    "AND COALESCE(CAST(json_extract(metadata_json,'$.cms_source_version') AS INTEGER),0) = ? " +
    "AND COALESCE(json_extract(metadata_json,'$.cms_source_draft_key'),'') = ?"
  ).bind(targetKey, JSON.stringify(nextMetadata), now, now,
    page.id, siteId, oldKey, version, priorDraft).run();
  if ((update.meta?.changes || 0) !== 1)
    return result({ ok: false, error: 'cms_source_version_conflict', version }, 409);
  return result({
    ok: true, status: 'published', version: version + 1,
    published_at: now, content_object_key: targetKey, receipt,
  });
}
