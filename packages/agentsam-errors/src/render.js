import { normalizeError } from './normalize.js';

export function renderError(error) {
  const d = normalizeError(error);
  const context = [d.domain, d.tool, d.stage].filter(Boolean).join(' · ');
  const lines = [`✗ ${d.message}`, `  ${d.code} · ${d.reason}`];
  if (context) lines.push(`  ${context}`);
  lines.push(`  severity: ${d.severity} · resolution: ${d.resolution_owner}`);
  if (d.remediation?.message) lines.push(`  fix: ${d.remediation.message}`);
  else if (d.remediation?.action && d.remediation.action !== 'none') lines.push(`  remediation: ${d.remediation.action}`);
  lines.push(`  retry: ${d.retryable ? 'yes' : 'no'}${d.retry_after_ms != null ? ` · after ${d.retry_after_ms}ms` : ''}`);
  if (d.request_id) lines.push(`  request_id: ${d.request_id}`);
  if (d.trace_id) lines.push(`  trace_id: ${d.trace_id}`);
  lines.push(`  fingerprint: ${d.fingerprint}`);
  return lines.join('\n');
}
