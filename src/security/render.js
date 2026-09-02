import { stripVTControlCharacters } from 'node:util';

export const safeText = value => stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/[\u202a-\u202e\u2066-\u2069]/g, '');
export function formatSecurityReport(report, { color = false } = {}) {
  const scan = report.after || report.scan || report.before || report;
  const label = safeText(report.status || scan.status).toUpperCase();
  const title = 'Agent Sam · dependency health · ' + label;
  const lines = [color ? '\x1b[1;36m' + title + '\x1b[0m' : title,
    '  Checked: ' + scan.checked_count + '/' + scan.dependency_count + ' packages',
    '  Coverage: ' + (scan.complete ? 'complete' : 'INCOMPLETE — not a clean bill of health')];
  for (const issue of scan.issues || []) lines.push('  ! ' + safeText(issue));
  for (const item of scan.findings || []) {
    lines.push('  ! ' + safeText([item.kind, item.package, item.version, item.advisory?.id, item.advisory?.severity].filter(Boolean).join(' · ')));
    lines.push('    Next: ' + safeText(item.action));
    if (item.advisory?.url) lines.push('    ' + safeText(item.advisory.url));
    if (item.advisory?.fixed_versions?.length) lines.push('    Fixed releases (not compatibility promises): ' + safeText(item.advisory.fixed_versions.join(', ')));
  }
  const informational = (scan.log_findings || []).filter(f => f.resolution === 'informational').length;
  if (informational) lines.push('  Informational log notices: ' + informational);
  if (report.worktree) lines.push('  Candidate: ' + safeText(report.worktree), '  Branch: ' + safeText(report.branch));
  if (report.reason) lines.push('  Reason: ' + safeText(report.reason));
  if (report.mode === 'plan') lines.push('  Apply in an isolated worktree: agentsam security repair --apply');
  return lines.join('\n') + '\n';
}
