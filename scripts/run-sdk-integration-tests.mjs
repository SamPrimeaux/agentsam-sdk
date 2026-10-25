#!/usr/bin/env node
/**
 * SDK integration tests exercise shipped packages, not a retired standalone
 * CMS editor rebuilt in every clean checkout. Its original scaffold proof
 * remains explicitly runnable with npm run test:cms:legacy-scaffold.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const integrationDir = path.join(root, 'test/integration');
const legacy = 'cms-app-scaffold.test.mjs';
const filenames = fs.readdirSync(integrationDir)
  .filter((name) => name.endsWith('.test.mjs') && name !== legacy)
  .sort();
if (!filenames.length) throw new Error('SDK integration tests missing');
if (!fs.existsSync(path.join(integrationDir, legacy))) {
  throw new Error('Legacy CMS scaffold test moved: update explicit legacy lane');
}
console.log('SDK integration tests:', filenames.length, '| standalone CMS scaffold is an explicit legacy lane');
const result = spawnSync(process.execPath, [
  '--test', ...filenames.map((name) => path.join(integrationDir, name)),
], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
