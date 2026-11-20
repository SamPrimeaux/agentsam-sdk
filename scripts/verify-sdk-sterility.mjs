#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const blocklist = JSON.parse(fs.readFileSync(path.join(root, 'scripts/privacy/blocked-identities.sha256.json'), 'utf8'));
const blocked = new Map(blocklist.entries.map((entry) => [entry.sha256, entry.id]));
const gramLengths = [...new Set(blocklist.entries.map((entry) => entry.tokens))].sort((a, b) => a - b);
const findings = [];
const scopeArg = process.argv.includes('--scope') ? process.argv[process.argv.indexOf('--scope') + 1] : 'themes';
if (!['themes', 'repo'].includes(scopeArg)) {
  console.error('usage: node scripts/verify-sdk-sterility.mjs [--scope themes|repo]');
  process.exit(2);
}
const themeScopePrefixes = [
  'packages/theme-scenes/',
  'packages/iamscene/src/',
  'packages/iamscene/package.json',
  'packages/iamscene/agentsam.package.json',
  'packages/THEME_PACKAGES.md',
  'package.json', 'package-lock.json',
  'apps/ecommerce-cms-agentsam/package.json',
  'apps/ecommerce-cms-agentsam/package-lock.json',
  'apps/ecommerce-cms-agentsam/npm-shrinkwrap.json',
  'apps/ecommerce-cms-agentsam/backend/cms/site-starter-preset.mjs',
  'scripts/verify-theme-packages.mjs',
  'scripts/verify-sdk-sterility.mjs',
];
const storefrontThemePackages = [
  'packages/heuristic-theme','packages/theme-cypress','packages/theme-violet',
  'packages/theme-grove','packages/theme-ember','packages/theme-forge',
  'packages/theme-iasf','packages/theme-harbor','packages/theme-summit','packages/theme-resolve',
];
function inScope(relative) {
  return scopeArg === 'repo' || themeScopePrefixes.some((prefix) => relative === prefix || relative.startsWith(prefix));
}
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function tokens(value) { return String(value || '').toLowerCase().match(/[a-z0-9]+/g) || []; }
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

const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).toString('utf8').split('\0').filter(Boolean);
const files = [...new Set([...tracked, ...untracked])];
for (const relative of files) {
  if (!inScope(relative)) continue;
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  scanIdentity('path ' + relative, relative);
  const buffer = fs.readFileSync(absolute);
  if (isTextBuffer(buffer)) scanIdentity('file ' + relative, buffer.toString('utf8'));
}

if (scopeArg === 'themes') {
  for (const relative of storefrontThemePackages) {
    if (fs.existsSync(path.join(root, relative))) findings.push(relative + ': storefront theme source must live in inneranimalmedia-theme-store');
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const relative of storefrontThemePackages) {
    if ((manifest.files || []).includes(relative)) findings.push(relative + ': still included in SDK npm files');
    if ((manifest.workspaces || []).includes(relative)) findings.push(relative + ': still registered as an SDK workspace');
  }
  for (const key of Object.keys(manifest.exports || {})) {
    if (key.startsWith('./theme/')) findings.push(key + ': storefront theme subpath export remains in SDK');
  }
  const scenes = JSON.parse(fs.readFileSync(path.join(root, 'packages/theme-scenes/package.json'), 'utf8'));
  if (!scenes.exports?.['./cms']) findings.push('theme-scenes CMS adapter export is missing');
  if (scenes.exports?.['./registry']) findings.push('theme-scenes must not own a storefront theme registry');
}

const forbiddenMetadataKeys = /"(?:donor_name|original_identity|source_path|customer_name|client_name|legacy_slug|legacy_package_dir)"\s*:/i;
const forbiddenSourceSchemes = /(?:local-donor|client-demos|worktree):\/\//i;
const highRiskRoots = scopeArg === 'themes'
  ? ['packages/theme-scenes','packages/iamscene/src']
  : ['packages','apps','protocol','scripts'];
for (const relative of files) {
  if (!highRiskRoots.some((prefix) => relative === prefix || relative.startsWith(prefix + '/'))) continue;
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) continue;
  const buffer = fs.readFileSync(absolute);
  if (!isTextBuffer(buffer)) continue;
  const content = buffer.toString('utf8');
  if (forbiddenMetadataKeys.test(content)) findings.push(relative + ': forbidden customer-lineage metadata key');
  if (forbiddenSourceSchemes.test(content)) findings.push(relative + ': forbidden donor source locator');
}

if (scopeArg === 'repo') {
  const notices = path.join(root, 'THIRD_PARTY_NOTICES.md');
  if (!fs.existsSync(notices)) findings.push('missing THIRD_PARTY_NOTICES.md');
  else {
    const content = fs.readFileSync(notices, 'utf8').toLowerCase();
    for (const phrase of ['do not imply','sponsorship','endorsement','partnership']) {
      if (!content.includes(phrase)) findings.push('THIRD_PARTY_NOTICES.md missing "' + phrase + '" language');
    }
  }
}

if (findings.length) {
  console.error('SDK sterility check FAILED (' + findings.length + ' findings)');
  for (const finding of findings.slice(0, 200)) console.error('- ' + finding);
  process.exit(1);
}
console.log('SDK sterility check PASS · scope=' + scopeArg + (scopeArg === 'themes'
  ? ' · storefront themes are external; theme-scenes and iamscene are clean creative runtimes'
  : ' · repository identity scan clean'));
