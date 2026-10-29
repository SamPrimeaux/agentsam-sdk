#!/usr/bin/env node
// A generated public UI catalog, not a connection/install registry.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const app = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(app, '../..');
const manifests = [
  resolve(app, 'agentsam.app.json'),
  resolve(app, 'apps/resend/agentsam.app.json'),
];
const apps = [];
for (const file of manifests) {
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  for (const embed of manifest.storefront_embeds || []) {
    if (!embed.key || apps.some(entry => entry.key === embed.key)) throw Error('Duplicate or invalid embed: ' + embed.key);
    apps.push({
      key: embed.key, name: embed.name, icon: embed.icon, tagline: embed.tagline,
      category: embed.category, provider: manifest.name || manifest.id || 'core',
      default_config: embed.default_config,
      surfaces: embed.surfaces,
    });
  }
}
const target = resolve(app, 'frontend/static/theme-editor/embed-catalog.json');
const output = JSON.stringify({ schema:'agentsam.theme-embed-ui-catalog.v1', source:'package-manifests',
  preview_only:true, apps }, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if ((await readFile(target, 'utf8')) !== output) {
    console.error('Theme embed UI catalog out of sync with packaged manifests');
    process.exitCode = 1;
  } else console.log('Theme embed catalog matches source manifests (' + apps.length + ')');
} else {
  await mkdir(dirname(target), { recursive:true });
  await writeFile(target, output);
  console.log('Generated ' + apps.length + ' manifest-backed Theme Studio embed UI entries');
}
