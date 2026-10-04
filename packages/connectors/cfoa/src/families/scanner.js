/** Cloudflare URL Scanner v2 — real API. */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.url_scanner';

export async function scannerStatus(client) {
  client.requireAccount('scanner.status');
  try {
    // Lightweight authorized probe: empty search
    await client.request('GET', client.accountPath('/urlscanner/v2/search'), {
      capabilityId: CAP,
      operation: 'scanner.search',
      query: { q: 'page.domain:example.com', size: 1 },
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      account_id: client.accountId,
      permission: 'Account → URL Scanner → Edit',
    });
  } catch (err) {
    if (err.code === 'cloudflare_permission_denied') {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'available',
        authorized: false,
        ...err.toJSON(),
      });
    }
    // Search may 400 on query — still proves auth if not 401/403
    if (err.httpStatus && err.httpStatus !== 401 && err.httpStatus !== 403) {
      return receipt(CAP, 'status', {
        ok: true,
        availability: 'available',
        authorized: true,
        account_id: client.accountId,
        note: 'probe_non_auth_error',
      });
    }
    throw err;
  }
}

export async function scannerScan(client, url, options = {}) {
  client.requireAccount('scanner.scan');
  const body = { url, ...options };
  const res = await client.request('POST', client.accountPath('/urlscanner/v2/scan'), {
    capabilityId: CAP,
    operation: 'scanner.scan',
    body,
  });
  return receipt(CAP, 'scan', { ok: true, scan: res.result });
}

export async function scannerBulk(client, urls = []) {
  client.requireAccount('scanner.bulk');
  const body = (urls || []).map((u) => (typeof u === 'string' ? { url: u } : u));
  const res = await client.request('POST', client.accountPath('/urlscanner/v2/bulk'), {
    capabilityId: CAP,
    operation: 'scanner.bulk',
    body,
  });
  return receipt(CAP, 'bulk', { ok: true, scans: res.result });
}

export async function scannerResult(client, scanId) {
  client.requireAccount('scanner.result');
  const res = await client.request('GET', client.accountPath(`/urlscanner/v2/result/${encodeURIComponent(scanId)}`), {
    capabilityId: CAP,
    operation: 'scanner.result',
  });
  return receipt(CAP, 'result', { ok: true, scan_id: scanId, result: res.result });
}

export async function scannerSearch(client, query = {}) {
  client.requireAccount('scanner.search');
  const res = await client.request('GET', client.accountPath('/urlscanner/v2/search'), {
    capabilityId: CAP,
    operation: 'scanner.search',
    query,
  });
  return receipt(CAP, 'search', { ok: true, results: res.result, result_info: res.result_info });
}

export async function scannerHar(client, scanId) {
  client.requireAccount('scanner.har');
  const res = await client.request('GET', client.accountPath(`/urlscanner/v2/har/${encodeURIComponent(scanId)}`), {
    capabilityId: CAP,
    operation: 'scanner.har',
  });
  return receipt(CAP, 'har', { ok: true, scan_id: scanId, har: res.result });
}

export async function scannerDom(client, scanId) {
  client.requireAccount('scanner.dom');
  const res = await client.request('GET', client.accountPath(`/urlscanner/v2/dom/${encodeURIComponent(scanId)}`), {
    capabilityId: CAP,
    operation: 'scanner.dom',
    raw: true,
  });
  return receipt(CAP, 'dom', {
    ok: true,
    scan_id: scanId,
    dom: Buffer.isBuffer(res.body) ? res.body.toString('utf8') : res.body,
  });
}

export async function scannerScreenshot(client, scanId) {
  client.requireAccount('scanner.screenshot');
  const res = await client.request(
    'GET',
    client.accountPath(`/urlscanner/v2/screenshots/${encodeURIComponent(scanId)}.png`),
    { capabilityId: CAP, operation: 'scanner.screenshot', raw: true },
  );
  return receipt(CAP, 'screenshot', {
    ok: true,
    scan_id: scanId,
    content_type: 'image/png',
    bytes: res.body?.length || 0,
    png_base64: Buffer.isBuffer(res.body) ? res.body.toString('base64') : null,
  });
}
