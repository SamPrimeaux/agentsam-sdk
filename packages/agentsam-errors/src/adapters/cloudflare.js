import { classifyProviderFailure } from './provider.js';
import { ERROR_REASON } from '../vocabulary.js';

export function classifyCloudflareFailure(evidence = {}, context = {}) {
  const status = Number(evidence.status || evidence.http_status || evidence.httpStatus || 0);
  const cf = Number(evidence.cloudflare_code || evidence.cloudflareCode || evidence.provider_code || evidence.code || 0) || null;
  const text = `${evidence.message || ''} ${evidence.error || ''}`.toLowerCase();
  let reason = context.reason;
  if (!reason && cf === 1033) reason = ERROR_REASON.TUNNEL_CONNECTOR_UNAVAILABLE;
  else if (!reason && cf === 1102) reason = ERROR_REASON.CLOUDFLARE_WORKERS_CPU_EXHAUSTED;
  else if (!reason && (status === 521)) reason = ERROR_REASON.TRANSPORT_REFUSED;
  else if (!reason && (status === 522 || status === 523 || status === 530)) reason = ERROR_REASON.TRANSPORT_UNREACHABLE;
  else if (!reason && status === 524) reason = ERROR_REASON.TRANSPORT_TIMEOUT;
  else if (!reason && status === 525) reason = ERROR_REASON.TLS_HANDSHAKE_FAILED;
  else if (!reason && status === 526) reason = ERROR_REASON.TLS_CERTIFICATE_INVALID;
  else if (!reason && /service binding/.test(text)) reason = ERROR_REASON.CLOUDFLARE_SERVICE_BINDING_UNAVAILABLE;
  else if (!reason && /durable object/.test(text)) reason = ERROR_REASON.CLOUDFLARE_DURABLE_OBJECT_UNAVAILABLE;
  else if (!reason && /\bd1\b/.test(text)) reason = ERROR_REASON.CLOUDFLARE_D1_UNAVAILABLE;
  else if (!reason && /\br2\b/.test(text)) reason = ERROR_REASON.CLOUDFLARE_R2_UNAVAILABLE;
  return classifyProviderFailure('cloudflare', { ...evidence, code: cf ?? evidence.code }, { ...context, reason, domain: context.domain || 'transport' });
}
