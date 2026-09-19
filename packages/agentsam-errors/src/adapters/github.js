import { classifyProviderFailure } from './provider.js';
import { ERROR_REASON } from '../vocabulary.js';

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) if (String(key).toLowerCase() === wanted) return String(value || '');
  return '';
}

export function classifyGitHubFailure(evidence = {}, context = {}) {
  const status = Number(evidence.status || 0);
  const text = `${evidence.code || ''} ${evidence.message || ''}`.toLowerCase();
  let reason = context.reason;
  if (!reason && evidence.installation_state === 'missing') reason = ERROR_REASON.GITHUB_INSTALLATION_MISSING;
  else if (!reason && status === 403 && (header(evidence.headers, 'x-ratelimit-remaining') === '0' || /rate limit exceeded/.test(text))) reason = ERROR_REASON.GITHUB_RATE_LIMITED;
  else if (!reason && status === 403 && /secondary rate limit|abuse detection/.test(text)) reason = ERROR_REASON.GITHUB_SECONDARY_RATE_LIMITED;
  else if (!reason && status === 403) reason = ERROR_REASON.GITHUB_SCOPE_INSUFFICIENT;
  else if (!reason && status === 404 && (context.resource?.type === 'repository' || /repository/.test(text))) reason = ERROR_REASON.GITHUB_REPOSITORY_NOT_FOUND;
  return classifyProviderFailure('github', evidence, { ...context, reason, domain: context.domain || 'repository' });
}
