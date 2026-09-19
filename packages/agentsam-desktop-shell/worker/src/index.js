/**
 * agentsam-desktop-updates
 *
 * Serves Tauri's "dynamic update server" contract:
 *   GET /updates/:app_id/:target/:arch/:current_version
 *     -> 200 { version, notes, pub_date, url, signature }  (update available)
 *     -> 204                                                (already current / nothing found)
 *
 * Publishing a release (called by a release script after `tauri build`
 * produces the signed artifact + .sig, and it's uploaded to R2):
 *   POST /updates/:app_id/publish
 *     Authorization: Bearer <UPDATE_PUBLISH_SECRET>
 *     { target, arch, version, url, signature, notes? }
 *
 * One shared D1 table serves every brand -- releases are scoped by
 * app_id, so Inner Animals / Meauxbility / AgentSam builds never see
 * each other's updates.
 */

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Minimal semver compare -- good enough for "is candidate newer than
// current", not a full semver-range implementation. Handles the
// common MAJOR.MINOR.PATCH case; anything else falls back to string
// inequality so it fails safe (visible, not silent).
function isNewer(candidate, current) {
  const cParts = String(candidate).split('.').map(Number);
  const curParts = String(current).split('.').map(Number);
  if (cParts.some(Number.isNaN) || curParts.some(Number.isNaN)) {
    return candidate !== current;
  }
  for (let i = 0; i < 3; i++) {
    const c = cParts[i] || 0;
    const u = curParts[i] || 0;
    if (c > u) return true;
    if (c < u) return false;
  }
  return false;
}

async function handleCheck(env, appId, target, arch, currentVersion) {
  if (!env.DB) return jsonResponse({ error: 'db_unavailable' }, 503);

  const row = await env.DB.prepare(
    `SELECT version, url, signature, notes, pub_date
       FROM desktop_shell_releases
      WHERE app_id = ? AND target = ? AND arch = ?
      ORDER BY created_at DESC
      LIMIT 1`,
  )
    .bind(appId, target, arch)
    .first()
    .catch(() => null);

  if (!row) return new Response(null, { status: 204 });
  if (!isNewer(row.version, currentVersion)) {
    return new Response(null, { status: 204 });
  }

  return jsonResponse({
    version: row.version,
    notes: row.notes || '',
    pub_date: row.pub_date,
    url: row.url,
    signature: row.signature,
  });
}

async function handlePublish(request, env, appId) {
  const authHeader = request.headers.get('authorization') || '';
  const expected = `Bearer ${env.UPDATE_PUBLISH_SECRET || ''}`;
  if (!env.UPDATE_PUBLISH_SECRET || authHeader !== expected) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  if (!env.DB) return jsonResponse({ error: 'db_unavailable' }, 503);

  const body = await request.json().catch(() => null);
  if (!body) return jsonResponse({ error: 'invalid_json' }, 400);

  const { target, arch, version, url, signature, notes } = body;
  if (!target || !arch || !version || !url || !signature) {
    return jsonResponse(
      { error: 'missing_field', required: ['target', 'arch', 'version', 'url', 'signature'] },
      400,
    );
  }

  const id = `rel_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = Math.floor(Date.now() / 1000);
  const pubDate = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO desktop_shell_releases (id, app_id, target, arch, version, url, signature, notes, pub_date, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, appId, target, arch, version, url, signature, notes || null, pubDate, now)
    .run();

  return jsonResponse({ ok: true, id, app_id: appId, target, arch, version, pub_date: pubDate });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    // expects: updates, :app_id, ...rest
    if (parts[0] !== 'updates' || !parts[1]) {
      return jsonResponse({ error: 'not_found' }, 404);
    }
    const appId = parts[1];

    if (request.method === 'POST' && parts[2] === 'publish') {
      return handlePublish(request, env, appId);
    }

    if (request.method === 'GET' && parts.length === 5) {
      const [, , target, arch, currentVersion] = parts;
      return handleCheck(env, appId, target, arch, decodeURIComponent(currentVersion));
    }

    return jsonResponse({ error: 'not_found' }, 404);
  },
};
