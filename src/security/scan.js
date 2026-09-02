import { collectNpmDependencies } from './inventory.js';
import { queryOsv } from './osv.js';
import { triageLog, resolveLogFindings } from './logs.js';

export async function scanProjectSecurity(options = {}) {
  const inventory = collectNpmDependencies(options.projectRoot);
  const results = options.offline
    ? inventory.dependencies.map(d => ({ ...d, checked: false, advisories: [] }))
    : await queryOsv(inventory.dependencies, options);
  const complete = !options.offline && !options.signal?.aborted && !inventory.issues.length && results.every(r => r.checked);
  const logFindings = resolveLogFindings(triageLog(options.log || ''), { complete, results });
  const findings = [
    ...results.flatMap(r => r.advisories.map(a => ({ kind: 'vulnerability', package: r.name, version: r.version, advisory: a, action: 'audit-fix-within-ranges' }))),
    ...results.filter(r => r.deprecated).map(r => ({ kind: 'deprecated', package: r.name, version: r.version, action: 'update-within-ranges' })),
    ...logFindings.filter(f => f.resolution === 'action-required'),
  ];
  return {
    schema_version: 1, scanner: 'agentsam-sca', checked_at: new Date().toISOString(),
    project_root: inventory.root, lockfile: inventory.lockfile, lock_fingerprint: inventory.fingerprint,
    complete, status: !complete ? 'incomplete' : findings.length ? 'action-required' : 'clean',
    ok: complete && findings.length === 0,
    dependency_count: results.length, checked_count: results.filter(r => r.checked).length,
    issues: inventory.issues, skipped: inventory.skipped, results, findings, log_findings: logFindings,
  };
}
export const reportExitCode = report => report.complete === false ? 2 : report.ok ? 0 : 1;
export function remediationPlan(report) {
  return {
    mode: 'plan', ok: report.ok, complete: report.complete, status: report.status,
    scan: report,
    steps: [
      { action: 'npm-audit-fix', automatic: report.complete, constraints: 'Existing manifest ranges; no force; no lifecycle scripts during resolution.' },
      ...(report.findings.some(f => f.kind === 'deprecated') ? [{ action: 'npm-update', automatic: report.complete, constraints: 'Existing ranges; package manifests unchanged.' }] : []),
      { action: 'verify', automatic: report.complete, constraints: 'Fresh install, configured project verification script, advisory rescan and warning triage.' },
    ],
    manual: report.findings.filter(f => !['vulnerability', 'deprecated', 'audit'].includes(f.kind)),
  };
}
