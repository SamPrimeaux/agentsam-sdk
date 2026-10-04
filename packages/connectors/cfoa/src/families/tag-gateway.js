/** Google Tag Gateway — zone setting API. */
import { receipt } from '../api-client.js';

const CAP = 'cloudflare.tag_gateway';

export async function tagGatewayStatus(client, zoneId) {
  const res = await client.request('GET', client.zonePath(zoneId, '/settings/google-tag-gateway/config'), {
    capabilityId: CAP,
    operation: 'tag_gateway.status',
  });
  return receipt(CAP, 'status', {
    ok: true,
    zone_id: zoneId,
    config: res.result,
    availability: 'available',
  });
}

export async function tagGatewayConfigure(client, zoneId, config = {}) {
  const body = {
    enabled: config.enabled !== false,
    measurementId: config.measurementId || config.measurement_id,
    endpoint: config.endpoint || '/metrics',
    hideOriginalIp: config.hideOriginalIp ?? config.hide_original_ip ?? true,
    setUpTag: config.setUpTag ?? config.set_up_tag ?? true,
  };
  const res = await client.request('PUT', client.zonePath(zoneId, '/settings/google-tag-gateway/config'), {
    capabilityId: CAP,
    operation: 'tag_gateway.configure',
    body,
  });
  return receipt(CAP, 'configure', { ok: true, zone_id: zoneId, config: res.result });
}

export async function tagGatewayDisable(client, zoneId) {
  const current = await tagGatewayStatus(client, zoneId);
  const prev = current.config || {};
  return tagGatewayConfigure(client, zoneId, {
    ...prev,
    enabled: false,
    measurementId: prev.measurementId,
    endpoint: prev.endpoint || '/metrics',
    hideOriginalIp: prev.hideOriginalIp,
    setUpTag: prev.setUpTag,
  });
}
