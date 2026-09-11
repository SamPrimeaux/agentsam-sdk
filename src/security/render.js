import { stripVTControlCharacters } from 'node:util';

export const safeText = value => stripVTControlCharacters(String(value ?? '')).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ').replace(/[\u202a-\u202e\u2066-\u2069]/g, '');

function renderBoundaryFinding(item, lines) {
  const evidence = [item.kind, item.source, item.target ? `→ ${item.target}` : null, item.specifier, item.env].filter(Boolean).join(' · ');
  lines.push('  ! ' + safeText(evidence));
  lines.push('    Next: ' + safeText(item.action || item.repair?.action || 'review-trust-boundary'));
  if (item.repair?.summary) lines.push('    ' + safeText(item.repair.summary));
}

export function formatSecurityReport(report, { color = false } = {}) {
  const scan = report.after || report.scan || report.before || report;
  const label = safeText(report.status || scan.status).toUpperCase();
  const title = 'Agent Sam · security · ' + label;
  const boundary = scan.trust_boundary;
  const lines = [color ? '\x1b[1;36m' + title + '\x1b[0m' : title,
    '',
    'Dependencies',
    '  Checked: ' + scan.checked_count + '/' + scan.dependency_count + ' packages',
    '  Coverage: ' + (scan.dependency_complete ? 'complete' : 'INCOMPLETE — dependency graph not fully verified')];
  for (const issue of scan.issues || []) lines.push('  ! ' + safeText(issue));
  for (const item of (scan.findings || []).filter((finding) => finding.section !== 'trust-boundary')) {
    lines.push('  ! ' + safeText([item.kind, item.package, item.version, item.advisory?.id, item.advisory?.severity].filter(Boolean).join(' · ')));
    lines.push('    Next: ' + safeText(item.action));
    if (item.advisory?.url) lines.push('    ' + safeText(item.advisory.url));
    if (item.advisory?.fixed_versions?.length) lines.push('    Fixed releases (not compatibility promises): ' + safeText(item.advisory.fixed_versions.join(', ')));
  }
  const informational = (scan.log_findings || []).filter(f => f.resolution === 'informational').length;
  if (informational) lines.push('  Informational log notices: ' + informational);

  if (boundary) {
    lines.push('', 'Trust boundary',
      '  AST files: ' + safeText(boundary.ast_files),
      '  Browser graph: ' + safeText(boundary.browser_reachable_files) + ' reachable files from ' + safeText(boundary.browser_roots) + ' browser roots',
      '  Evidence: merkle=' + safeText(boundary.merkle_root) + ' metadata=' + safeText(boundary.metadata_root),
      '  Coverage: ' + (boundary.complete ? 'complete for indexed JS/TS syntax' : 'INCOMPLETE — parse errors prevent a clean boundary result'));
    for (const item of boundary.findings || []) renderBoundaryFinding(item, lines);
    if (!boundary.findings?.length) lines.push('  ✓ no indexed client/server boundary contradictions detected');
  }

  if (report.worktree) lines.push('', '  Candidate: ' + safeText(report.worktree), '  Branch: ' + safeText(report.branch));
  if (report.reason) lines.push('  Reason: ' + safeText(report.reason));
  if (report.mode === 'plan') lines.push('  Apply dependency-only automatic repair in an isolated worktree: agentsam security repair --apply');
  return lines.join('\n') + '\n';
}
