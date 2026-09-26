/** Zone Token Validation (JWT) — real API. */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.token_validation';

export async function tokenValidationStatus(client, zoneId) {
  try {
    const res = await client.request('GET', client.zonePath(zoneId, '/token_validation/config'), {
      capabilityId: CAP,
      operation: 'token_validation.config.list',
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      zone_id: zoneId,
      configs: res.result || [],
    });
  } catch (err) {
    if (err.code === 'cloudflare_permission_denied') {
      return receipt(CAP, 'status', { ok: false, authorized: false, zone_id: zoneId, ...err.toJSON() });
    }
    throw err;
  }
}

export async function tokenValidationListConfigs(client, zoneId) {
  const res = await client.request('GET', client.zonePath(zoneId, '/token_validation/config'), {
    capabilityId: CAP,
    operation: 'token_validation.config.list',
  });
  return receipt(CAP, 'config.list', { ok: true, zone_id: zoneId, configs: res.result || [] });
}

export async function tokenValidationGetConfig(client, zoneId, configId) {
  const res = await client.request(
    'GET',
    client.zonePath(zoneId, `/token_validation/config/${encodeURIComponent(configId)}`),
    { capabilityId: CAP, operation: 'token_validation.config.get' },
  );
  return receipt(CAP, 'config.get', { ok: true, zone_id: zoneId, config: res.result });
}

export async function tokenValidationCreateConfig(client, zoneId, body) {
  const res = await client.request('POST', client.zonePath(zoneId, '/token_validation/config'), {
    capabilityId: CAP,
    operation: 'token_validation.config.create',
    body,
  });
  return receipt(CAP, 'config.create', { ok: true, zone_id: zoneId, config: res.result });
}

export async function tokenValidationEditConfig(client, zoneId, configId, body) {
  const res = await client.request(
    'PATCH',
    client.zonePath(zoneId, `/token_validation/config/${encodeURIComponent(configId)}`),
    { capabilityId: CAP, operation: 'token_validation.config.edit', body },
  );
  return receipt(CAP, 'config.edit', { ok: true, zone_id: zoneId, config: res.result });
}

export async function tokenValidationDeleteConfig(client, zoneId, configId) {
  const res = await client.request(
    'DELETE',
    client.zonePath(zoneId, `/token_validation/config/${encodeURIComponent(configId)}`),
    { capabilityId: CAP, operation: 'token_validation.config.delete' },
  );
  return receipt(CAP, 'config.delete', { ok: true, zone_id: zoneId, result: res.result });
}

export async function tokenValidationListRules(client, zoneId) {
  const res = await client.request('GET', client.zonePath(zoneId, '/token_validation/rules'), {
    capabilityId: CAP,
    operation: 'token_validation.rules.list',
  });
  return receipt(CAP, 'rules.list', { ok: true, zone_id: zoneId, rules: res.result || [] });
}

export async function tokenValidationCreateRule(client, zoneId, body) {
  const res = await client.request('POST', client.zonePath(zoneId, '/token_validation/rules'), {
    capabilityId: CAP,
    operation: 'token_validation.rules.create',
    body,
  });
  return receipt(CAP, 'rules.create', { ok: true, zone_id: zoneId, rule: res.result });
}

export async function tokenValidationDeleteRule(client, zoneId, ruleId) {
  const res = await client.request(
    'DELETE',
    client.zonePath(zoneId, `/token_validation/rules/${encodeURIComponent(ruleId)}`),
    { capabilityId: CAP, operation: 'token_validation.rules.delete' },
  );
  return receipt(CAP, 'rules.delete', { ok: true, zone_id: zoneId, result: res.result });
}
