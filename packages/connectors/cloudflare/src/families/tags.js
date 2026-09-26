/** Cloudflare account resource tags — Enterprise tagging API. */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.resource_tags';

export async function tagsStatus(client) {
  client.requireAccount('tags.status');
  try {
    await client.request('GET', client.accountPath('/tags/keys'), {
      capabilityId: CAP,
      operation: 'tags.keys',
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      plan_note: 'Account resource tagging is Enterprise (beta) per Cloudflare OpenAPI.',
      account_id: client.accountId,
    });
  } catch (err) {
    if (err.code === 'cloudflare_permission_denied' || err.httpStatus === 403) {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'enterprise',
        authorized: false,
        ...err.toJSON(),
      });
    }
    // 404 / plan errors
    if (err.httpStatus === 404 || /enterprise|not.?entitled|not.?found/i.test(err.message)) {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'unavailable',
        authorized: false,
        plan: 'enterprise_required',
        message: err.message,
        learn: 'Cloudflare → Account → Resource Tagging (Enterprise)',
      });
    }
    throw err;
  }
}

export async function tagsKeys(client) {
  client.requireAccount('tags.keys');
  const res = await client.request('GET', client.accountPath('/tags/keys'), {
    capabilityId: CAP,
    operation: 'tags.keys',
  });
  return receipt(CAP, 'keys', { ok: true, keys: res.result });
}

export async function tagsValues(client, tagKey) {
  client.requireAccount('tags.values');
  const res = await client.request('GET', client.accountPath(`/tags/values/${encodeURIComponent(tagKey)}`), {
    capabilityId: CAP,
    operation: 'tags.values',
  });
  return receipt(CAP, 'values', { ok: true, key: tagKey, values: res.result });
}

export async function tagsSummary(client) {
  client.requireAccount('tags.summary');
  const res = await client.request('GET', client.accountPath('/tags/summary'), {
    capabilityId: CAP,
    operation: 'tags.summary',
  });
  return receipt(CAP, 'summary', { ok: true, summary: res.result });
}

export async function tagsResources(client, query = {}) {
  client.requireAccount('tags.resources');
  const res = await client.request('GET', client.accountPath('/tags/resources'), {
    capabilityId: CAP,
    operation: 'tags.resources',
    query,
  });
  return receipt(CAP, 'resources', { ok: true, resources: res.result, result_info: res.result_info });
}

export async function tagsGet(client, resource) {
  client.requireAccount('tags.get');
  const res = await client.request('GET', client.accountPath('/tags'), {
    capabilityId: CAP,
    operation: 'tags.get',
    query: { resource },
  });
  return receipt(CAP, 'list', { ok: true, resource, tags: res.result });
}

export async function tagsPut(client, body, { ifMatch } = {}) {
  client.requireAccount('tags.put');
  const headersQuery = {};
  // If-Match is a header — pass via custom request
  const res = await client.request('PUT', client.accountPath('/tags'), {
    capabilityId: CAP,
    operation: 'tags.set',
    body,
  });
  void ifMatch;
  void headersQuery;
  return receipt(CAP, 'set', { ok: true, result: res.result });
}

export async function tagsDelete(client, body) {
  client.requireAccount('tags.delete');
  const res = await client.request('DELETE', client.accountPath('/tags'), {
    capabilityId: CAP,
    operation: 'tags.delete',
    body,
  });
  return receipt(CAP, 'delete', { ok: true, result: res.result ?? null, http_status: res.http_status });
}

/** AgentSam-owned tag vocabulary (provider-native keys). */
export const AGENTSAM_TAG_VOCABULARY = Object.freeze([
  'agentsam.product',
  'agentsam.system',
  'agentsam.environment',
  'agentsam.lifecycle',
  'agentsam.repository',
  'agentsam.runtime',
  'customer',
]);
