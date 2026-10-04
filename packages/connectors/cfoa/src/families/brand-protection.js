/**
 * Brand Protection — subscription-gated.
 * Prefer /accounts/{id}/brand-protection/* ; Cloudforce One v2 when available.
 */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.brand_protection';

export async function brandProtectionStatus(client) {
  client.requireAccount('brand.status');
  try {
    const res = await client.request('GET', client.accountPath('/brand-protection/total-queries'), {
      capabilityId: CAP,
      operation: 'brand.status',
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      total_queries: res.result,
      account_id: client.accountId,
    });
  } catch (err) {
    if (err.httpStatus === 403 || err.httpStatus === 401) {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'subscription',
        authorized: false,
        message: 'Brand Protection unavailable or not authorized',
        learn: 'Cloudflare → Cloudforce One → Brand Protection',
        ...err.toJSON(),
      });
    }
    if (err.httpStatus === 404 || /not.?entitled|subscription|forbidden/i.test(err.message)) {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'unavailable',
        authorized: false,
        message: 'Cloudforce One / Brand Protection subscription required',
        learn: 'Cloudflare → Cloudforce One → Brand Protection',
      });
    }
    throw err;
  }
}

export async function brandQueries(client) {
  client.requireAccount('brand.queries');
  const res = await client.request('GET', client.accountPath('/brand-protection/queries'), {
    capabilityId: CAP,
    operation: 'brand.queries',
  });
  return receipt(CAP, 'queries', { ok: true, queries: res.result });
}

export async function brandQueryAdd(client, body) {
  client.requireAccount('brand.query_add');
  const res = await client.request('POST', client.accountPath('/brand-protection/queries'), {
    capabilityId: CAP,
    operation: 'brand.query.add',
    body,
  });
  return receipt(CAP, 'query_add', { ok: true, query: res.result });
}

export async function brandQueryRemove(client, queryId) {
  client.requireAccount('brand.query_remove');
  const res = await client.request('DELETE', client.accountPath(`/brand-protection/queries`), {
    capabilityId: CAP,
    operation: 'brand.query.remove',
    query: { id: queryId },
  });
  // Some delete variants use path — try path if query delete unsupported
  void res;
  try {
    const del = await client.request('DELETE', client.accountPath(`/brand-protection/queries/${encodeURIComponent(queryId)}`), {
      capabilityId: CAP,
      operation: 'brand.query.remove',
    });
    return receipt(CAP, 'query_remove', { ok: true, query_id: queryId, result: del.result });
  } catch {
    return receipt(CAP, 'query_remove', { ok: true, query_id: queryId, result: res.result });
  }
}

export async function brandMatches(client, query = {}) {
  client.requireAccount('brand.matches');
  const res = await client.request('GET', client.accountPath('/brand-protection/matches'), {
    capabilityId: CAP,
    operation: 'brand.matches',
    query,
  });
  return receipt(CAP, 'matches', { ok: true, matches: res.result });
}

export async function brandLogos(client) {
  client.requireAccount('brand.logos');
  const res = await client.request('GET', client.accountPath('/brand-protection/logos'), {
    capabilityId: CAP,
    operation: 'brand.logos',
  });
  return receipt(CAP, 'logos', { ok: true, logos: res.result });
}

export async function brandLogoMatches(client, logoId) {
  client.requireAccount('brand.logo_matches');
  const res = await client.request('GET', client.accountPath('/brand-protection/logo-matches'), {
    capabilityId: CAP,
    operation: 'brand.logo_matches',
    query: logoId ? { logo_id: logoId } : {},
  });
  return receipt(CAP, 'logo_matches', { ok: true, logo_id: logoId || null, matches: res.result });
}

export async function brandScanPage(client, url) {
  client.requireAccount('brand.scan');
  const res = await client.request('POST', client.accountPath('/brand-protection/scan-page'), {
    capabilityId: CAP,
    operation: 'brand.scan',
    body: { url },
  });
  return receipt(CAP, 'scan', { ok: true, result: res.result });
}
