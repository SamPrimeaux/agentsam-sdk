/** Host-bound adapter to the existing authorized Cloudflare connector route. */
import { resolveCoreAuthority } from '../../lib/core-client.js';
import { resolveLocalStudioHostOrigin } from '../../lib/app-authority.js';

export const R2_INVENTORY_OPERATION = 'cloudflare.r2.objects.inventory';
function fail(code) { const error = new Error(code); error.code = code; throw error; }

export function createCloudflareR2InventoryHandler({ home, root, resolveAuthority = resolveCoreAuthority, fetchImpl = globalThis.fetch, resolveOrigin = resolveLocalStudioHostOrigin } = {}) {
  return async (input, identity) => {
    if (!identity?.actorId || !identity?.accountId || !identity?.installationId) fail('missing_trusted_identity');
    const bucket = input.bucketRef;
    if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) fail('r2_bucket_invalid');
    const prefix = input.prefix ?? '';
    const delimiter = input.delimiter ?? '/';
    if (delimiter !== '/' && delimiter !== '') fail('r2_delimiter_invalid');
    const pageSize = input.pageSize ?? 100;
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 1000) fail('r2_page_size_invalid');
    const authority = await resolveAuthority({ home, signal: identity.signal });
    if (!authority?.value) fail('account_auth_required');
    const url = new URL(`/api/connections/cloudflare/r2/buckets/${encodeURIComponent(bucket)}/objects`, resolveOrigin({root}));
    url.searchParams.set('delimiter', delimiter);
    url.searchParams.set('per_page', String(pageSize));
    if (prefix) url.searchParams.set('prefix', prefix);
    if (input.cursor) url.searchParams.set('cursor', input.cursor);
    if (input.connectionRef) url.searchParams.set('connection_id', input.connectionRef);
    const response = await fetchImpl(url, { method:'GET', redirect:'error', headers:{ Accept:'application/json', Authorization:`Bearer ${authority.value}` }, signal:identity.signal });
    const page = await response.json().catch(() => null);
    if (!response.ok || page?.ok !== true) fail(typeof page?.error === 'string' ? page.error : `r2_inventory_http_${response.status}`);
    if (page.bucket !== bucket || page.prefix !== prefix || page.delimiter !== delimiter || !Array.isArray(page.objects) || !Array.isArray(page.prefixes) || typeof page.truncated !== 'boolean' || !(page.cursor === null || typeof page.cursor === 'string')) fail('r2_inventory_invalid_response');
    if (page.truncated && (!page.cursor || page.cursor === input.cursor)) fail('r2_inventory_invalid_cursor');
    if (page.objects.some(o => typeof o?.key !== 'string' || !o.key.startsWith(prefix) || !Number.isFinite(o.size) || o.size < 0) || page.prefixes.some(p => typeof p !== 'string' || !p.startsWith(prefix))) fail('r2_inventory_invalid_response');
    return {ok:true,bucket,prefix,delimiter,objects:page.objects,prefixes:page.prefixes,cursor:page.cursor,truncated:page.truncated};
  };
}
