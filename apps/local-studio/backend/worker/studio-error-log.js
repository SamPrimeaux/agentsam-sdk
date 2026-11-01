/**
 * Thin agentsam_error_log writer for Local Studio Worker.
 * Same D1 table / fingerprint semantics as IAM telemetry — no parallel store.
 */

function trim(value) {
  return value == null ? '' : String(value).trim();
}

function parseContext(value) {
  if (value == null || value === '') return {};
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...parsed }
      : { value: parsed };
  } catch {
    return { raw_context: String(value).slice(0, 48000) };
  }
}

function normalizeErrorMessageForFingerprint(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\b(?:aerr|err|atcl|cidxrun|cidxgen|run|job|req|conn)_[a-z0-9_-]{8,}\b/gi, ':id')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, ':uuid')
    .replace(/\b[0-9a-f]{16,}\b/gi, ':hex')
    .replace(/\b\d{7,}\b/g, ':number')
    .replace(/\s+/g, ' ')
    .slice(0, 2000);
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function buildErrorFingerprint(accountId, o, msg) {
  const context = parseContext(o?.contextJson ?? o?.context_json);
  const source = trim(o?.source || 'unknown').toLowerCase();
  const errorCode = trim(o?.errorCode ?? o?.error_code).toLowerCase();
  const errorType = trim((o?.errorType ?? o?.error_type) || 'unknown').toLowerCase();
  const scope = trim(
    context.connection_id ??
      context.repository_id ??
      context.target_id ??
      context.source_id ??
      null,
  ).toLowerCase();
  return sha256Hex([
    accountId,
    source,
    errorCode,
    errorType,
    normalizeErrorMessageForFingerprint(msg),
    scope,
  ].join('\u0000'));
}

/**
 * @param {any} env
 * @param {{
 *   accountId?: string|null,
 *   account_id?: string|null,
 *   sessionId?: string|null,
 *   errorCode?: string|null,
 *   errorType: string,
 *   errorMessage: string,
 *   source: string,
 *   sourceId?: string|null,
 *   contextJson?: string|Record<string,unknown>|null,
 *   stackTrace?: string|null,
 * }} o
 */
export async function writeStudioErrorLog(env, o = {}) {
  if (!env?.DB?.prepare) return { ok: false, error: 'no_db' };
  const accountId = trim(o.accountId ?? o.account_id);
  if (!accountId) return { ok: false, error: 'account_id_required' };
  const msg = o.errorMessage != null ? String(o.errorMessage).slice(0, 8000) : '';
  if (!msg) return { ok: false, error: 'error_message_required' };

  const context = parseContext(o.contextJson ?? o.context_json);
  let contextJson = JSON.stringify(context);
  if (contextJson.length > 50000) {
    contextJson = JSON.stringify({ truncated: true, preview: contextJson.slice(0, 48000) });
  }
  const fingerprint = await buildErrorFingerprint(accountId, o, msg);
  const id = `aerr_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

  try {
    const row = await env.DB.prepare(
      `INSERT INTO agentsam_error_log (
         id, account_id, session_id, error_code, error_type, error_message,
         source, source_id, context_json, stack_trace, resolved, resolved_at,
         error_fingerprint, occurrence_count, first_seen_at, last_seen_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, 1, unixepoch(), unixepoch())
       ON CONFLICT(account_id, error_fingerprint) WHERE error_fingerprint IS NOT NULL
       DO UPDATE SET
         session_id = COALESCE(excluded.session_id, agentsam_error_log.session_id),
         error_code = COALESCE(excluded.error_code, agentsam_error_log.error_code),
         error_type = excluded.error_type,
         error_message = excluded.error_message,
         source_id = COALESCE(excluded.source_id, agentsam_error_log.source_id),
         context_json = excluded.context_json,
         stack_trace = COALESCE(excluded.stack_trace, agentsam_error_log.stack_trace),
         occurrence_count = agentsam_error_log.occurrence_count + 1,
         last_seen_at = unixepoch()
       RETURNING id`,
    )
      .bind(
        id,
        accountId,
        o.sessionId != null ? String(o.sessionId).slice(0, 200) : null,
        o.errorCode != null ? String(o.errorCode).slice(0, 120) : null,
        String(o.errorType || 'unknown').slice(0, 120),
        msg,
        String(o.source || 'local-studio').slice(0, 200),
        o.sourceId != null ? String(o.sourceId).slice(0, 200) : null,
        contextJson,
        o.stackTrace != null ? String(o.stackTrace).slice(0, 12000) : null,
        fingerprint,
      )
      .first();
    return { ok: true, id: String(row?.id || id), fingerprint };
  } catch (error) {
    // Fallback without fingerprint unique constraint (older schemas).
    try {
      await env.DB.prepare(
        `INSERT INTO agentsam_error_log (
           id, account_id, session_id, error_code, error_type, error_message,
           source, source_id, context_json, stack_trace, resolved, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, unixepoch())`,
      ).bind(
        id,
        accountId,
        o.sessionId != null ? String(o.sessionId).slice(0, 200) : null,
        o.errorCode != null ? String(o.errorCode).slice(0, 120) : null,
        String(o.errorType || 'unknown').slice(0, 120),
        msg,
        String(o.source || 'local-studio').slice(0, 200),
        o.sourceId != null ? String(o.sourceId).slice(0, 200) : null,
        contextJson,
        o.stackTrace != null ? String(o.stackTrace).slice(0, 12000) : null,
      ).run();
      return { ok: true, id, fingerprint };
    } catch (fallbackError) {
      console.warn('[studio_error_log]', fallbackError?.message || fallbackError || error?.message || error);
      return { ok: false, error: String(fallbackError?.message || fallbackError || error?.message || error) };
    }
  }
}

export function scheduleStudioErrorLog(env, ctx, o = {}) {
  const accountId = trim(o.accountId ?? o.account_id);
  const msg = o.errorMessage != null ? String(o.errorMessage).slice(0, 8000) : '';
  if (!env?.DB || !accountId || !msg) return;
  const task = writeStudioErrorLog(env, o).catch((error) => {
    console.warn('[studio_error_log_schedule]', error?.message || error);
  });
  if (ctx?.waitUntil) ctx.waitUntil(task);
}
