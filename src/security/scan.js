import { collectNpmDependencies } from './inventory.js';
import { queryOsv } from './osv.js';
import { triageLog, resolveLogFindings } from './logs.js';
import { scanTrustBoundary } from './trust-boundary.js';

export async function scanProjectSecurity(options = {}) {
  const inventory = collectNpmDependencies(options.projectRoot);
  const results = options.offline
    ? inventory.dependencies.map(d => ({ ...d, checked: false, advisories: [] }))
    : await queryOsv(inventory.dependencies, options);
  const dependencyComplete = !options.offline && !options.signal?.aborted && !inventory.issues.length && results.every(r => r.checked);
  const scanBoundary = options.scanBoundary || scanTrustBoundary;
  const trustBoundary = await scanBoundary(inventory.root, options);
  const complete = dependencyComplete && trustBoundary.complete;
  const logFindings = resolveLogFindings(triageLog(options.log || ''), { complete: dependencyComplete, results });
  const dependencyFindings = [
    ...results.flatMap(r => r.advisories.map(a => ({ kind: 'vulnerability', section: 'dependencies', package: r.name, version: r.version, advisory: a, action: 'audit-fix-within-ranges' }))),
    ...results.filter(r => r.deprecated).map(r => ({ kind: 'deprecated', section: 'dependencies', package: r.name, version: r.version, action: 'update-within-ranges' })),
    ...logFindings.filter(f => f.resolution === 'action-required').map((f) => ({ ...f, section: 'logs' })),
  ];
  const boundaryFindings = (trustBoundary.findings || []).map((item) => ({
    ...item,
    section: 'trust-boundary',
    action: item.repair?.action || 'review-trust-boundary',
  }));
  const findings = [...dependencyFindings, ...boundaryFindings];
  return {
    schema_version: 1, scanner: 'agentsam-sca', checked_at: new Date().toISOString(),
    project_root: inventory.root, lockfile: inventory.lockfile, lock_fingerprint: inventory.fingerprint,
    complete, status: !complete ? 'incomplete' : findings.length ? 'action-required' : 'clean',
    ok: complete && findings.length === 0,
    dependency_count: results.length, checked_count: results.filter(r => r.checked).length,
    dependency_complete: dependencyComplete,
    issues: inventory.issues, skipped: inventory.skipped, results, findings, log_findings: logFindings,
    trust_boundary: trustBoundary,
  };
}
export const reportExitCode = report => report.complete === false ? 2 : report.ok ? 0 : 1;
export function remediationPlan(report) {
  const boundaryRepairs = report.trust_boundary?.repair_suggestions || [];
  return {
    mode: 'plan', ok: report.ok, complete: report.complete, status: report.status,
    scan: report,
    steps: [
      { action: 'npm-audit-fix', automatic: report.dependency_complete !== false, constraints: 'Existing manifest ranges; no force; no lifecycle scripts during resolution.' },
      ...(report.findings.some(f => f.kind === 'deprecated') ? [{ action: 'npm-update', automatic: report.dependency_complete !== false, constraints: 'Existing ranges; package manifests unchanged.' }] : []),
      ...boundaryRepairs.map((repair) => ({ ...repair, constraints: 'Preserve the existing public contract where possible; verify the repaired import graph against a fresh Merkle/filemeta snapshot.' })),
      { action: 'verify', automatic: report.complete, constraints: 'Fresh install, configured project verification script, advisory rescan, warning triage, and trust-boundary rescan.' },
    ],
    boundary_repairs: boundaryRepairs,
    manual: report.findings.filter(f => !['vulnerability', 'deprecated', 'audit'].includes(f.kind)),
  };
}
