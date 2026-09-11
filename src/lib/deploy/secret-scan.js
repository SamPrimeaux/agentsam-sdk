/** Scan deployable files for live secrets. Fixtures and .example placeholders are allowed. */
import fs from 'node:fs';

const FIXTURES = new Set([
  'sillynotreal',
  'sillynotreal-secret',
  'CHANGEME',
  'replace-me',
  'your-token-here',
  '***',
]);

const LIVE_PATTERNS = [
  { re: /\bsk-[A-Za-z0-9]{20,}\b/g, label: 'openai-like' },
  { re: /\bxai-[A-Za-z0-9]{20,}\b/g, label: 'xai-like' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, label: 'aws-like' },
];

const ASSIGN_RE = /((?:CLOUDFLARE_OAUTH_CLIENT_SECRET|CLOUDFLARE_API_TOKEN|IAM_CLIENT_SECRET|VAULT_MASTER_KEY)\s*=\s*)([^\s#]+)/g;

function isExample(filename = '') {
  return filename.endsWith('.example') || filename.includes('.env.cloudflare.example');
}

export function scanTextForSecrets(text, { filename = '' } = {}) {
  const findings = [];
  const src = String(text || '');
  for (const { re, label } of LIVE_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      if (FIXTURES.has(m[0])) continue;
      findings.push({ filename, label, preview: `${m[0].slice(0, 5)}…` });
    }
  }
  if (isExample(filename)) return findings;
  ASSIGN_RE.lastIndex = 0;
  let m;
  while ((m = ASSIGN_RE.exec(src))) {
    const val = m[2].replace(/^[\'"]|[\'"]$/g, '');
    if (!val || FIXTURES.has(val) || val.includes('your-') || val.length < 16) continue;
    findings.push({ filename, label: 'assigned-secret', preview: `${m[1].trim()}[redacted]` });
  }
  return findings;
}

export function scanFilesForSecrets(files = []) {
  const findings = [];
  for (const file of files) {
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    findings.push(...scanTextForSecrets(fs.readFileSync(file, 'utf8'), { filename: file }));
  }
  return findings;
}

export function assertNoDeploySecrets(files = []) {
  const findings = scanFilesForSecrets(files);
  if (findings.length) {
    const err = new Error('secret_scan_failed: ' + findings.map((f) => f.label).join(', '));
    err.code = 'secret_scan_failed';
    err.findings = findings;
    throw err;
  }
  return { ok: true, findings: [] };
}
