/**
 * Keyless SSL — Enterprise add-on. Advanced TLS only.
 * Private key NEVER travels through AgentSam / D1 / R2 / Local Studio vault.
 */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.keyless_ssl';

export async function keylessStatus(client, zoneId) {
  if (!zoneId) {
    return receipt(CAP, 'status', {
      ok: false,
      availability: 'enterprise_addon',
      authorized: null,
      message: 'zone_id required to probe Keyless SSL',
      learn: 'Cloudflare → SSL/TLS → Keyless SSL',
      note: 'Enterprise add-on. TLS private key stays on customer key server / HSM.',
    });
  }
  try {
    const res = await client.request('GET', client.zonePath(zoneId, '/keyless_certificates'), {
      capabilityId: CAP,
      operation: 'keyless.list',
    });
    return receipt(CAP, 'status', {
      ok: true,
      availability: 'available',
      authorized: true,
      zone_id: zoneId,
      configurations: res.result || [],
      private_key: 'customer_infrastructure',
      default_port: 2407,
    });
  } catch (err) {
    if (err.httpStatus === 403 || err.httpStatus === 401) {
      return receipt(CAP, 'status', {
        ok: false,
        availability: 'enterprise_addon',
        authorized: false,
        zone_id: zoneId,
        learn: 'Cloudflare → SSL/TLS → Keyless SSL',
        ...err.toJSON(),
      });
    }
    return receipt(CAP, 'status', {
      ok: false,
      availability: 'unavailable',
      authorized: false,
      zone_id: zoneId,
      message: err.message,
      learn: 'Cloudflare → SSL/TLS → Keyless SSL',
      required: 'Enterprise + Keyless SSL add-on',
    });
  }
}

export async function keylessList(client, zoneId) {
  const res = await client.request('GET', client.zonePath(zoneId, '/keyless_certificates'), {
    capabilityId: CAP,
    operation: 'keyless.list',
  });
  return receipt(CAP, 'list', { ok: true, zone_id: zoneId, keyless: res.result || [] });
}

export async function keylessInspect(client, zoneId, id) {
  const res = await client.request(
    'GET',
    client.zonePath(zoneId, `/keyless_certificates/${encodeURIComponent(id)}`),
    { capabilityId: CAP, operation: 'keyless.inspect' },
  );
  return receipt(CAP, 'inspect', { ok: true, zone_id: zoneId, keyless: res.result });
}

export async function keylessEnable(client, zoneId, id) {
  const res = await client.request(
    'PATCH',
    client.zonePath(zoneId, `/keyless_certificates/${encodeURIComponent(id)}`),
    { capabilityId: CAP, operation: 'keyless.enable', body: { enabled: true } },
  );
  return receipt(CAP, 'enable', { ok: true, zone_id: zoneId, keyless: res.result });
}

export async function keylessDisable(client, zoneId, id) {
  const res = await client.request(
    'PATCH',
    client.zonePath(zoneId, `/keyless_certificates/${encodeURIComponent(id)}`),
    { capabilityId: CAP, operation: 'keyless.disable', body: { enabled: false } },
  );
  return receipt(CAP, 'disable', { ok: true, zone_id: zoneId, keyless: res.result });
}

/**
 * Create Keyless config — certificate public material + key server address.
 * Does NOT accept or transmit the TLS private key.
 */
export async function keylessCreate(client, zoneId, body) {
  if (body?.private_key || body?.privateKey) {
    throw Object.assign(
      new Error('TLS private key must not be sent to AgentSam or Cloudflare Keyless create API'),
      { code: 'keyless_private_key_forbidden' },
    );
  }
  const res = await client.request('POST', client.zonePath(zoneId, '/keyless_certificates'), {
    capabilityId: CAP,
    operation: 'keyless.create',
    body,
  });
  return receipt(CAP, 'create', {
    ok: true,
    zone_id: zoneId,
    keyless: res.result,
    private_key: 'customer_infrastructure',
  });
}
