#!/usr/bin/env node
/**
 * Enforce the distribution boundary: storefront themes live in
 * inneranimalmedia-theme-store. The SDK retains only its cross-product
 * theme-scenes creative runtime, which is not a storefront theme.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const storefrontThemePackages = [
  'packages/heuristic-theme',
  'packages/theme-cypress',
  'packages/theme-violet',
  'packages/theme-grove',
  'packages/theme-ember',
  'packages/theme-forge',
  'packages/theme-iasf',
  'packages/theme-harbor',
  'packages/theme-summit',
  'packages/theme-resolve',
];
const failures = [];
for (const path of storefrontThemePackages) {
  if (existsSync(resolve(root, path))) failures.push(`${path} still exists in the SDK`);
}
const manifest = readJson('package.json');
for (const path of storefrontThemePackages) {
  if ((manifest.files || []).includes(path)) failures.push(`${path} is still included in npm files`);
  if ((manifest.workspaces || []).includes(path)) failures.push(`${path} is still an SDK workspace`);
}
const scenes = readJson('packages/theme-scenes/package.json');
if (!scenes.exports?.['./cms']) failures.push('theme-scenes CMS adapter export is missing');
if (scenes.exports?.['./registry']) failures.push('theme-scenes must not own a storefront theme registry');
if (!/cross-product|creative scene/i.test(scenes.description || '')) {
  failures.push('theme-scenes is not described as a cross-product creative package');
}
if ((manifest.files || []).includes('packages/theme-scenes') === false) {
  failures.push('theme-scenes must remain in the SDK release package');
}
if ((manifest.workspaces || []).includes('packages/theme-scenes') === false) {
  failures.push('theme-scenes must remain an SDK workspace');
}
if (failures.length) {
  console.error('[theme ownership verification failed]');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('[theme ownership verified] storefront themes are distributed by inneranimalmedia-theme-store; theme-scenes remains in the SDK as a cross-product creative runtime.');
}
