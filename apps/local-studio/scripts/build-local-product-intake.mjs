#!/usr/bin/env node
/** Read source-owned reusable packages; create preview candidates, not sellable products. */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repo = resolve(appRoot, '../..');
const candidates = [];
const packages = join(repo, 'packages');
for (const name of readdirSync(packages)) {
  if (!name.startsWith('theme-') || ['theme-contract', 'theme-scenes'].includes(name)) continue;
  const source = join(packages, name, 'package.json');
  if (!existsSync(source)) continue;
  const product = JSON.parse(readFileSync(source, 'utf8'));
  if (!product.name?.startsWith('@inneranimalmedia/theme-')) continue;
  const slug = name.slice('theme-'.length);
  candidates.push({ id: `preview:template:${slug}`, name: `${slug.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' ')} Theme`,
    category: 'templates', kind: 'theme', version: product.version, package_name: product.name,
    description: product.description || 'Source-owned theme package',
    source_path: `packages/${name}/package.json`, registry_status: 'source-only', catalog_visibility: 'preview' });
}
for (const info of [
  { path: 'packages/copro-templates/package.json', category:'templates', id:'copro-templates', label:'MovieMode Creative Templates', kind:'template-pack' },
  { path: 'packages/agentsam-rapid-rust/package.json', category:'templates', id:'rapid-rust', label:'AgentSam Rapid Rust Starter', kind:'starter-kit' },
]) {
  const source = join(repo, info.path);
  if (!existsSync(source)) continue;
  const data = JSON.parse(readFileSync(source,'utf8'));
  candidates.push({ id:`preview:template:${info.id}`, name:info.label, category:info.category, kind:info.kind,
    version:data.version || 'local', package_name:data.name || info.id, description:data.description || 'Reusable source package',
    source_path:info.path, registry_status:'source-only', catalog_visibility:'preview' });
}
// Functional workflows and their source proofs: preview candidates are not commercial releases.
for (const info of [
  { id:'media-intake', name:'Creative Media Inventory', file:'apps/local-studio/scripts/build-local-media-intake.mjs', description:'Scans authorized Mac media folders into a private, read-only preview index.' },
  { id:'field-operations-ingest', name:'Companion Animation Intake', file:'apps/local-studio/scripts/ingest-field-operations-pack.py', description:'Validates and stages the approved four-character APNG pack into canonical companion runtime assets.' },
  { id:'companion-staging', name:'Companion Asset Packaging', file:'apps/local-studio/scripts/stage-inneranimal-companions.mjs', description:'Validates companion manifests, frame counts, and packaged runtime artwork before a build.' },
  { id:'brand-verification', name:'Brand Asset Verification', file:'apps/local-studio/scripts/verify-brand-assets.mjs', description:'Runs source-owned brand asset integrity checks.' },
]) {
  if (!existsSync(join(repo, info.file))) continue;
  candidates.push({ id:`preview:automation:${info.id}`, name:info.name, category:'automations', kind:'workflow',
    version:'local', description:info.description, source_path:info.file,
    registry_status:'internal-workflow', catalog_visibility:'preview' });
}
const packagedPipeline = join(homedir(), 'Downloads', 'InnerAnimalMedia-Media-Pipeline-Kit.zip');
if (existsSync(packagedPipeline)) candidates.push({ id:'preview:automation:media-pipeline',
  name:'InnerAnimalMedia Media Pipeline', category:'automations', kind:'workflow-pack', version:'local',
  description:'Existing archived media kit containing pipeline/build.py, scene generator, output receipts, and previews.',
  source_path:'Downloads/InnerAnimalMedia-Media-Pipeline-Kit.zip', registry_status:'package-awaiting-review', catalog_visibility:'preview' });

const counts=Object.fromEntries(['templates','automations'].map(c=>[c,candidates.filter(x=>x.category===c).length]));
const output=join(appRoot,'.local-media-intake','products.json');
mkdirSync(join(appRoot,'.local-media-intake'),{recursive:true});
writeFileSync(output,JSON.stringify({schema_version:1,generated_at:new Date().toISOString(),counts,candidates},null,2));
console.log(`[product-intake] ${candidates.length} verified, source-backed candidates: ${JSON.stringify(counts)}. Nothing registered or published.`);
