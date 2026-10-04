/**
 * Cloudflare Snippets — zone-scoped tiny edge logic.
 *
 * CRITICAL: PUT /snippets/snippet_rules replaces the zone's entire rules collection.
 * Always: read → reconcile (preserve foreign rules) → plan → approve → PUT → verify.
 *
 * OAuth scope: Cloudflare documents Snippets Read/Write as API permissions.
 * Scope string is NOT invented here — if oauthScopes is empty, capability is token_required
 * until the OAuth app catalog exposes a verified identifier.
 */
import { receipt } from '../api-client.js';
import crypto from 'node:crypto';

const CAP = 'cloudflare.snippets';
const AGENTSAM_RULE_PREFIX = '[AgentSam]';

function hashText(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);
}

export async function snippetsStatus(client, zoneId) {
  try {
    const res = await client.request('GET', client.zonePath(zoneId, '/snippets'), {
      capabilityId: CAP,
      operation: 'snippets.list',
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      zone_id: zoneId,
      snippet_count: Array.isArray(res.result) ? res.result.length : null,
      auth: client.authMeta(),
      limits_note: 'Snippets: ~5ms CPU, 2MB memory, 32KB package; Pro+; proxied DNS required.',
    });
  } catch (err) {
    if (err.code === 'cloudflare_permission_denied') {
      return receipt(CAP, 'status', {
        ok: false,
        zone_id: zoneId,
        authorized: false,
        status: 'token_required_or_unauthorized',
        permission: 'Snippets Read / Snippets Write',
        note: 'OAuth scope string not assumed — use CLOUDFLARE_API_TOKEN with Snippets Write if OAuth catalog lacks it.',
        ...err.toJSON(),
      });
    }
    if (err.httpStatus === 404 || /plan|not.?entitled|pro/i.test(err.message)) {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'unavailable_on_plan',
        zone_id: zoneId,
        message: err.message,
        learn: 'Cloudflare → Rules → Snippets (Pro / Business / Enterprise)',
      });
    }
    throw err;
  }
}

export async function snippetsList(client, zoneId) {
  const res = await client.request('GET', client.zonePath(zoneId, '/snippets'), {
    capabilityId: CAP,
    operation: 'snippets.list',
  });
  return receipt(CAP, 'list', { ok: true, zone_id: zoneId, snippets: res.result || [] });
}

export async function snippetsInspect(client, zoneId, name) {
  const res = await client.request('GET', client.zonePath(zoneId, `/snippets/${encodeURIComponent(name)}`), {
    capabilityId: CAP,
    operation: 'snippets.inspect',
  });
  return receipt(CAP, 'inspect', { ok: true, zone_id: zoneId, snippet: res.result });
}

export async function snippetsContent(client, zoneId, name) {
  const res = await client.request(
    'GET',
    client.zonePath(zoneId, `/snippets/${encodeURIComponent(name)}/content`),
    { capabilityId: CAP, operation: 'snippets.content', raw: true },
  );
  const text = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : String(res.body || '');
  return receipt(CAP, 'content', {
    ok: true,
    zone_id: zoneId,
    snippet_name: name,
    content_sha256_16: hashText(text),
    bytes: text.length,
    // Include content only in structured result for tooling — still redacted from default human format
    content: text,
  });
}

export async function snippetsPut(client, zoneId, name, body, { yes = false } = {}) {
  if (!yes) {
    return receipt(CAP, 'plan', {
      ok: true,
      planned: true,
      zone_id: zoneId,
      snippet_name: name,
      operation: 'PUT /snippets/{name}',
      note: 'Pass --yes to apply. Re-fetch after apply for verification.',
      body_preview: typeof body === 'string' ? { content_sha256_16: hashText(body) } : body,
    });
  }
  const res = await client.request('PUT', client.zonePath(zoneId, `/snippets/${encodeURIComponent(name)}`), {
    capabilityId: CAP,
    operation: 'snippets.put',
    body,
  });
  const verify = await snippetsInspect(client, zoneId, name);
  return receipt(CAP, 'apply', {
    ok: true,
    zone_id: zoneId,
    snippet_name: name,
    result: res.result,
    verification: verify.snippet || null,
    auth: client.authMeta(),
  });
}

export async function snippetsDelete(client, zoneId, name, { yes = false } = {}) {
  if (!yes) {
    return receipt(CAP, 'plan', {
      ok: true,
      planned: true,
      zone_id: zoneId,
      snippet_name: name,
      operation: 'DELETE',
    });
  }
  const res = await client.request('DELETE', client.zonePath(zoneId, `/snippets/${encodeURIComponent(name)}`), {
    capabilityId: CAP,
    operation: 'snippets.delete',
  });
  return receipt(CAP, 'delete', { ok: true, zone_id: zoneId, snippet_name: name, result: res.result });
}

export async function snippetsRulesList(client, zoneId) {
  const res = await client.request('GET', client.zonePath(zoneId, '/snippets/snippet_rules'), {
    capabilityId: CAP,
    operation: 'snippets.rules.list',
  });
  return receipt(CAP, 'rules.list', { ok: true, zone_id: zoneId, rules: res.result || [] });
}

/**
 * Plan a rules collection write that PRESERVES non-AgentSam rules.
 * desiredRules: AgentSam-owned rules to upsert (matched by description prefix + snippet name).
 */
export function reconcileSnippetRules(existingRules = [], desiredAgentSamRules = []) {
  const foreign = (existingRules || []).filter((r) => {
    const desc = String(r.description || r.rule?.description || '');
    return !desc.startsWith(AGENTSAM_RULE_PREFIX);
  });
  const owned = (desiredAgentSamRules || []).map((r) => ({
    ...r,
    description: String(r.description || '').startsWith(AGENTSAM_RULE_PREFIX)
      ? r.description
      : `${AGENTSAM_RULE_PREFIX} ${r.description || r.snippet || 'edge'}`.trim(),
  }));
  const next = [...foreign, ...owned];
  return {
    existing_count: (existingRules || []).length,
    foreign_preserved: foreign.length,
    agentsam_rules: owned.length,
    next_count: next.length,
    rules: next,
    dropped_agentsam_replaced: (existingRules || []).length - foreign.length,
  };
}

export async function snippetsRulesPlan(client, zoneId, desiredAgentSamRules = []) {
  const current = await snippetsRulesList(client, zoneId);
  const plan = reconcileSnippetRules(current.rules, desiredAgentSamRules);
  return receipt(CAP, 'rules.plan', {
    ok: true,
    zone_id: zoneId,
    planned: true,
    ...plan,
    warning: 'PUT replaces the entire snippet_rules collection — foreign rules are preserved by reconcile.',
  });
}

export async function snippetsRulesApply(client, zoneId, desiredAgentSamRules = [], { yes = false } = {}) {
  const plan = await snippetsRulesPlan(client, zoneId, desiredAgentSamRules);
  if (!yes) return plan;
  const res = await client.request('PUT', client.zonePath(zoneId, '/snippets/snippet_rules'), {
    capabilityId: CAP,
    operation: 'snippets.rules.apply',
    body: { rules: plan.rules },
  });
  const after = await snippetsRulesList(client, zoneId);
  return receipt(CAP, 'rules.apply', {
    ok: true,
    zone_id: zoneId,
    result: res.result,
    before_count: plan.existing_count,
    after_count: (after.rules || []).length,
    foreign_preserved: plan.foreign_preserved,
    verification: after.rules,
    auth: client.authMeta(),
  });
}

export { AGENTSAM_RULE_PREFIX };
