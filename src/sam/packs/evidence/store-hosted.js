import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { assertSafeKey } from './naming.js';
import { evidenceError } from './contract.js';

/**
 * Host-injected remote EvidenceStore backed by CAD Creator's existing R2
 * authority. No account/project literals, Cloudflare keys, or user-supplied URLs.
 * The host's authenticated request port owns OAuth and dispatch.
 */
export function createHostedEvidenceStore({ appManifest, request, principal } = {}) {
  const route = appManifest?.storage?.evidenceEndpoint;
  if (typeof route !== 'string' || !/^\/api\/cad\/evidence$/.test(route))
    throw evidenceError('evidence_hosted_endpoint_manifest_required');
  if (typeof request !== 'function') throw evidenceError('evidence_hosted_authenticated_request_required');
  const digest = value => createHash('sha256').update(value).digest('hex');

  function locator(key) {
    assertSafeKey(key);
    if (key.split('/').length < 3) throw evidenceError('evidence_hosted_project_run_and_file_required');
    return route + '/' + key.split('/').map(encodeURIComponent).join('/');
  }
  async function call(url, method, body, headers = {}) {
    const response = await request(url, { method, headers, ...(body ? { body } : {}) }, principal);
    if (!response || typeof response.status !== 'number') throw evidenceError('evidence_hosted_invalid_response');
    return response;
  }
  async function fail(response) {
    const value = await response.json().catch(() => ({}));
    throw evidenceError(typeof value?.error === 'string' ? value.error : 'evidence_hosted_request_failed');
  }
  return {
    async put(key, body) {
      const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
      const sha256 = digest(data);
      const res = await call(locator(key), 'PUT', data, { 'content-type': 'application/octet-stream', 'x-content-sha256': sha256 });
      if (!res.ok) await fail(res);
      const value = await res.json();
      if (!value?.ok || value.sha256 !== sha256 || value.bytes !== data.length || value.key !== key)
        throw evidenceError('evidence_hosted_receipt_mismatch');
      return { key, bytes: data.length, sha256, ...(value.db ? { registration: value.db } : {}) };
    },
    async get(key) {
      const res = await call(locator(key), 'GET');
      if (res.status === 404) return null;
      if (!res.ok) await fail(res);
      const body = Buffer.from(await res.arrayBuffer());
      const reported = res.headers.get('x-content-sha256');
      if (!reported || reported !== digest(body)) throw evidenceError('evidence_hosted_hash_mismatch');
      return body;
    },
    async has(key) {
      const res = await call(locator(key), 'HEAD');
      if (res.status === 404) return false;
      if (!res.ok) await fail(res);
      return true;
    },
    async list(prefix) {
      assertSafeKey(prefix);
      if (prefix.split('/').length < 2) throw evidenceError('evidence_hosted_project_run_required');
      const base = route + '/' + prefix.split('/').map(encodeURIComponent).join('/');
      const keys = [];
      let cursor = '';
      do {
        const url = base + '?list=1' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
        const res = await call(url, 'GET');
        if (!res.ok) await fail(res);
        const data = await res.json();
        if (!data.ok || !Array.isArray(data.keys)) throw evidenceError('evidence_hosted_list_invalid');
        for (const key of data.keys) {
          assertSafeKey(key);
          if (!key.startsWith(prefix + '/')) throw evidenceError('evidence_hosted_list_scope_escape');
          keys.push(key);
        }
        cursor = data.cursor || '';
      } while (cursor);
      return keys.sort();
    },
    async open(key) {
      const bytes = await this.get(key);
      if (bytes === null) return null;
      return { size: bytes.length, stream(range) {
        const start = Number.isInteger(range?.start) ? range.start : 0;
        const end = Number.isInteger(range?.end) ? range.end + 1 : bytes.length;
        return Readable.from(bytes.subarray(start, end));
      } };
    },
  };
}
