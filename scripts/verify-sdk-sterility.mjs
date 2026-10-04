#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonicalThemes = ['cypress','violet','grove','ember','forge','harbor','summit','resolve'];
const blocklist = JSON.parse(fs.readFileSync(path.join(root, 'scripts/privacy/blocked-identities.sha256.json'), 'utf8'));
const blocked = new Map(blocklist.entries.map((x) => [x.sha256, x.id]));
const gramLengths = [...new Set(blocklist.entries.map((x) => x.tokens))].sort((a,b) => a-b);
const findings = [];
const scopeArg = process.argv.includes('--scope') ? process.argv[process.argv.indexOf('--scope') + 1] : 'themes';
if (!['themes', 'repo'].includes(scopeArg)) {
  console.error('usage: node scripts/verify-sdk-sterility.mjs [--scope themes|repo]');
  process.exit(2);
}
const themeScopePrefixes = [
  'apps/theme-gallery-preview/',
  'apps/frontend/public/site/themes/',
  'apps/local-studio/frontend/public/site/themes/',
  'packages/theme-cypress/', 'packages/theme-violet/', 'packages/theme-grove/', 'packages/theme-ember/',
  'packages/theme-forge/', 'packages/theme-harbor/', 'packages/theme-summit/', 'packages/theme-resolve/',
  'packages/theme-scenes/', 'protocol/theme-refinery/', 'scripts/theme-refinery/',
  'scripts/stage-themes-to-site.mjs', 'scripts/sync-public-site.mjs',
  'package.json', 'package-lock.json', 'THIRD_PARTY_NOTICES.md',
  'test/integration/theme-package-registry.test.mjs',
];
function inScope(relative) {
  return scopeArg === 'repo' || themeScopePrefixes.some((prefix) => relative === prefix || relative.startsWith(prefix));
}

function sha(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}
function tokens(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
}
function scanIdentity(label, value) {
  const words = tokens(value);
  for (const n of gramLengths) {
    if (words.length < n) continue;
    for (let i = 0; i <= words.length - n; i += 1) {
      const candidate = words.slice(i, i + n).join(' ');
      const id = blocked.get(sha(candidate));
      if (id) findings.push(label + ': blocked identity fingerprint ' + id);
    }
  }
}
function isTextBuffer(buffer) {
  if (!buffer.length) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.02;
}

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8').split('\0').filter(Boolean);

for (const relative of tracked) {
  if (!inScope(relative)) continue;
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  scanIdentity('path ' + relative, relative);
  const buffer = fs.readFileSync(absolute);
  if (!isTextBuffer(buffer)) continue;
  scanIdentity('file ' + relative, buffer.toString('utf8'));
}

for (const id of canonicalThemes) {
  const packageDir = path.join(root, 'packages/theme-' + id);
  const galleryDir = path.join(root, 'apps/theme-gallery-preview/themes/' + id);
  if (!fs.existsSync(packageDir)) findings.push('missing canonical package: theme-' + id);
  if (!fs.existsSync(galleryDir)) findings.push('missing canonical gallery: ' + id);
  const packageJson = path.join(packageDir, 'package.json');
  if (fs.existsSync(packageJson)) {
    const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
    const expected = '@inneranimalmedia/theme-' + id;
    if (pkg.name !== expected) findings.push(packageJson + ': expected package name ' + expected);
  }
}

const highRiskRoots = [
  'apps/theme-gallery-preview',
  'packages/theme-cypress','packages/theme-violet','packages/theme-grove','packages/theme-ember',
  'packages/theme-forge','packages/theme-harbor','packages/theme-summit','packages/theme-resolve',
  'protocol/theme-refinery',
];
const forbiddenMetadataKeys = /"(?:donor_name|original_identity|source_path|customer_name|client_name|legacy_slug|legacy_package_dir)"\s*:/i;
const forbiddenSourceSchemes = /(?:local-donor|client-demos|worktree):\/\//i;

for (const relative of tracked) {
  if (!highRiskRoots.some((prefix) => relative === prefix || relative.startsWith(prefix + '/'))) continue;
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  const buffer = fs.readFileSync(absolute);
  if (!isTextBuffer(buffer)) continue;
  const text = buffer.toString('utf8');
  if (forbiddenMetadataKeys.test(text)) findings.push(relative + ': forbidden customer-lineage metadata key');
  if (forbiddenSourceSchemes.test(text)) findings.push(relative + ': forbidden donor source locator');
}

const notices = path.join(root, 'THIRD_PARTY_NOTICES.md');
if (!fs.existsSync(notices)) {
  findings.push('missing THIRD_PARTY_NOTICES.md');
} else {
  const text = fs.readFileSync(notices, 'utf8').toLowerCase();
  for (const phrase of ['do not imply','sponsorship','endorsement','partnership']) {
    if (!text.includes(phrase)) findings.push('THIRD_PARTY_NOTICES.md missing "' + phrase + '" language');
  }
}

if (findings.length) {
  console.error('SDK sterility check FAILED (' + findings.length + ' findings)');
  for (const finding of findings.slice(0, 200)) console.error('- ' + finding);
  process.exit(1);
}
console.log('SDK sterility check PASS · scope=' + scopeArg + ' · ' + canonicalThemes.length + ' canonical prebuilds');
