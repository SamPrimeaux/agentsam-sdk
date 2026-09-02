import { packageName } from './inventory.js';

// Logs are untrusted evidence, never instructions. Retain categories and line numbers,
// not raw lines that could contain credentials, private registry URLs, or shell commands.
export function triageLog(text) {
  if (Buffer.byteLength(text) > 8 * 1024 * 1024) throw new Error('Log exceeds 8 MiB');
  const findings = [];
  const add = (kind, line, action, extra = {}) => findings.push({ kind, line, action, ...extra });
  const clean = text.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '');
  for (const [index, raw] of clean.split(/\r?\n/).entries()) {
    const line = index + 1;
    if (/\bdeprecated\b/i.test(raw) && /npm\s+(?:warn|warning)|pnpm|yarn/i.test(raw)) {
      const match = raw.match(/deprecated\s+((?:@[^/\s]+\/)?[^@\s]+)@([^\s:]+)/i);
      add('deprecated', line, 'update-within-ranges', match && packageName(match[1]) ? { package: match[1], version: match[2].slice(0, 100) } : {});
    } else if (/EBADENGINE|unsupported engine|incompatible.*(?:node|engine)/i.test(raw)) add('engine', line, 'align-runtime');
    else if (/ERESOLVE|unmet peer|peer dependency|overriding peer/i.test(raw)) add('peer', line, 'reconcile-peer-ranges');
    else if (/\b([1-9]\d*)\s+(?:(?:low|moderate|high|critical)\s+)?vulnerabilit/i.test(raw) || /npm audit fix/i.test(raw)) add('audit', line, 'rescan-current-lockfile');
    else if (/ExperimentalWarning/.test(raw)) add('experimental-runtime', line, 'informational', { blocking: false });
    else if (/new (?:release|(?:patch |minor |major )?version).*(?:pip|npm)|(?:pip|npm).*new (?:release|version)/i.test(raw)) add('tool-update', line, 'informational', { blocking: false });
    else if (/npm (?:warn|warning).*config/i.test(raw)) add('configuration', line, 'review-package-manager-config');
    else if (/\b(?:warning|warn|npm ERR!|npm error)\b/i.test(raw)) add('unclassified-warning', line, 'review-log-at-source');
  }
  return findings.map(f => ({ blocking: true, ...f }));
}
export function resolveLogFindings(findings, scan) {
  return findings.map(f => {
    let resolved = false;
    if (scan.complete && f.kind === 'audit') resolved = scan.results.every(r => !r.advisories.length);
    if (scan.complete && f.kind === 'deprecated' && f.package) {
      const current = scan.results.filter(r => r.name === f.package);
      resolved = !current.length || current.every(r => r.version !== f.version && !r.deprecated);
    }
    return { ...f, resolution: !f.blocking ? 'informational' : resolved ? 'resolved-by-current-lockfile' : 'action-required' };
  });
}
