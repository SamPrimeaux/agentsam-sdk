#!/usr/bin/env node
/**
 * Derived documentation projection. Never a second catalog/SSOT.
 * Inputs: the canonical CLI catalog, protocol manifest, setup recipes, package
 * inventory, and independently authored APP manifests.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLI_COMMAND_CATALOG } from '../../src/cli/command-catalog.js';
import { listCapabilityRecipes } from '../../src/lib/setup/recipes.js';
import { listAppManifests } from '../../src/commands/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('protocol/capabilities/manifest.json'));
const packages = JSON.parse(read('packages/catalog/generated/packages.json')).packages;
const capabilities = Object.values(manifest.capabilities).sort((a,b) => a.id.localeCompare(b.id));
const commands = [...CLI_COMMAND_CATALOG].sort((a,b) => a.id.localeCompare(b.id));
const recipes = listCapabilityRecipes().sort((a,b) => a.id.localeCompare(b.id));
const apps = listAppManifests(root);
const md = value => String(value ?? '—').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
const code = value => value ? '\u0060' + md(value).replace(/\u0060/g, "'") + '\u0060' : '—';
const description = (value, limit=180) => {
  const s=md(value); return s.length>limit ? s.slice(0,limit-1)+'…' : s;
};
const rows = (values) => values.map(row=>'| '+row.map(md).join(' | ')+' |').join('\n');
const count = (list, predicate) => list.filter(predicate).length;
const out = [
  '# AgentSam registry reference (generated)',
  '',
  '> GENERATED FILE — DO NOT HAND EDIT. Run `node scripts/registry/generate-docs.mjs` to regenerate, or `node scripts/registry/generate-docs.mjs --check` to detect drift.',
  '',
  '**Purpose:** source-backed documentation of existing machinery. This is an index of declarations and packaging, **not** proof of installation, handler readiness, provider permissions, or a shipped user journey.',
  '',
  '## Registry summary',
  '',
  '| Source authority | Count | Meaning |',
  '| --- | ---: | --- |',
  ...rows([
    [code('src/cli/command-catalog.js'), commands.length, 'Registered top-level CLI command entries'],
    [code('protocol/capabilities/manifest.json'), capabilities.length, 'Capability and agent-primitive declarations'],
    [code('src/lib/setup/recipes.js'), recipes.length, 'Native prerequisite install recipes'],
    [code('apps/*/agentsam.app.json and packages/*/agentsam.app.json'), apps.length, 'APP manifests discoverable from this checkout'],
    [code('packages/catalog/generated/packages.json'), packages.length, 'Package inventory rows (not npm publication proof)'],
  ]).split('\n'),
  '',
  'Manifest status: '+count(capabilities,c=>c.status==='stable')+' stable, '+count(capabilities,c=>c.status==='experimental')+' experimental, '+count(capabilities,c=>c.deterministic===false)+' explicitly non-deterministic. Host binding and approval remain separate.',
  '',
  '## CLI command authority',
  '',
  '| CLI root | Topic | Catalog summary |',
  '| --- | --- | --- |',
  rows(commands.map(c=>[code('agentsam '+c.id),c.topic||'—',description(c.summary)])),
  '',
  '## Protocol capabilities and primitives',
  '',
  '| ID | Domain | Kind | Status | Deterministic | Effect classification | CLI mapping |',
  '| --- | --- | --- | --- | --- | --- | --- |',
  rows(capabilities.map(c=>[code(c.id),c.domain||'—',c.kind||'—',c.status||'unclassified',c.deterministic===true?'yes':c.deterministic===false?'no':'unspecified',code(c.side_effects||'none'),code(c.cli)])),
  '',
  'A `stable` declaration may still lack a resolved handler or permission in a particular host. Consult `capability.status` and the authorized host; `capability.invoke` is allowlisted, not a general-purpose CLI proxy.',
  '',
  '## Native prerequisite recipes',
  '',
  '| Recipe | Risk | Approval required | Provides | Platforms |',
  '| --- | --- | --- | --- | --- |',
  rows(recipes.map(r=>[code(r.id),r.risk||'—',r.requiresApproval===false?'no':'yes',(r.capabilityProvided||[]).map(code).join(', '),(r.supportedPlatforms||[]).map(code).join(', ')])),
  '',
  'Run `agentsam setup --list` for the current recipe catalog. `agentsam setup runtime` is a distinct GOAP/adapter placement lane; neither installs a third-party APP into Local Studio.',
  '',
  '## APP definitions in the checkout',
  '',
  '| APP ID | Manifest name | Package | CLI binary |',
  '| --- | --- | --- | --- |',
  rows(apps.map(a=>[code(a.id),description(a.name||a.id,70),code(a.manifest?.package),code(a.bin)])),
  '',
  'An APP definition is not a user-scoped installation. `agentsam app install <id>` currently prints distribution instructions; it does not persist an installed APP record or activate its runtime.',
  '',
  '## Package inventory',
  '',
  '| Package ID | npm name | Catalog status | Purpose |',
  '| --- | --- | --- | --- |',
  rows([...packages].sort((a,b)=>String(a.id).localeCompare(String(b.id))).map(p=>[code(p.id),code(p.name),p.catalog_status||p.status||'not reviewed',description(p.purpose,115)])),
  '',
  'Packages may be public distributions, shared implementation, local application dependencies, or infrastructure. Directory placement alone does not define the intent or distribution status. The package catalog is a projection, not platform `agentsam_products` or install-state authority.',
  '',
  '## Ownership and verification',
  '',
  '- Setup: [capability install planner](../contracts/capability-install-planner.md)',
  '- Workflow entrypoints: [CLI workflows](AGENTSAM-CLI-WORKFLOWS.md)',
  '- Portable apps: [application contract](../architecture/AGENTSAM_APPLICATION_CONTRACT.md)',
  '- Product taxonomy: [portfolio ADR](../adr/ADR-0003-product-portfolio-and-package-taxonomy.md)',
  '- Account and machine credentials: [environment vocabulary](../contracts/environment-vocabulary.md)',
  '- Release readiness: [delivery closure](../standards/DELIVERY_CLOSURE.md)',
  '',
].join('\n');
const target = 'docs/reference/AGENTSAM-REGISTRY.generated.md';
const check=process.argv.includes('--check');
if(check) {
  if (!fs.existsSync(path.join(root,target)) || read(target)!==out) {
    const committed=fs.existsSync(path.join(root,target))?read(target):'';
    let first=0;
    while(first<Math.min(committed.length,out.length)&&committed[first]===out[first]) first++;
    console.error('Documentation drift: '+target+'; regenerate with node scripts/registry/generate-docs.mjs');
    console.error('Difference at offset '+first+'; actual length='+committed.length+', expected length='+out.length);
    console.error('Committed context: '+JSON.stringify(committed.slice(Math.max(0,first-90),first+140)));
    console.error('Generated context: '+JSON.stringify(out.slice(Math.max(0,first-90),first+140)));
    process.exitCode=1;
  } else console.log('Registry docs PASS: '+commands.length+' commands, '+capabilities.length+' capabilities, '+recipes.length+' recipes, '+apps.length+' APPs, '+packages.length+' packages');
} else {
  fs.mkdirSync(path.dirname(path.join(root,target)),{recursive:true});
  fs.writeFileSync(path.join(root,target),out);
  console.log('Generated '+target);
}
