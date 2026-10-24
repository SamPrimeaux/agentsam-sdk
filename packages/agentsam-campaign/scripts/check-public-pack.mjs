#!/usr/bin/env node
/** Verify the public npm tarball is contract-only, with no installation data. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const permitted = new Set([
  'README.md', 'LICENSE', 'package.json',
  'src/index.js', 'src/project.js', 'src/storage.js', 'src/http.js',
  'sql/README.md', 'sql/0001_campaign_core.sql', 'sql/verify.sql',
]);
const result = JSON.parse(execFileSync('npm', [
  'pack', '--json', '--dry-run', '--ignore-scripts',
], { cwd, encoding: 'utf8' }));
const files = result?.[0]?.files?.map(item => item.path) || [];
if (!files.length) throw new Error('campaign_public_package_empty');
const unapproved = files.filter(file => !permitted.has(file));
const missing = [...permitted].filter(file => !files.includes(file));
if (unapproved.length || missing.length) {
  throw new Error('campaign_public_pack_contract_violation: ' + JSON.stringify({unapproved, missing}));
}
// Contract-only modules must never contain embedded credentials or literal
// deployment URL/email addresses. Extend this gate without adding real names.
for (const file of files) {
  if (file === 'package.json') continue;
  const contents = readFileSync(path.join(cwd, file), 'utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(contents)) {
    throw new Error('campaign_private_key_in_pack: ' + file);
  }
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.(?:com|org|net|gov|edu)\b/i.test(contents)) {
    throw new Error('campaign_email_address_in_pack: ' + file);
  }
}
console.log('Campaign public pack verified:', files.join(', '));
