/**
 * Development-only source inventory. Never invents installed state or UI previews.
 * Everything in the output must point to an existing first-party source/manifest.
 */
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import { resolve, join, relative, extname, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const repo = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const out = resolve(fileURLToPath(new URL('.generated/component-inventory.json', import.meta.url)));
const items = [];
const seen = new Set();
const skip = /(?:^|\/)(?:node_modules|dist|build|\.output|reference|donor-root-src|test|tests|__tests__|generated|\.generated)(?:\/|$)/;
const record = (item) => {
  if (!item.source || seen.has(item.id)) return;
  seen.add(item.id);
  items.push(item);
};
const text = async (path) => readFile(path, 'utf8');
const readable = (path) => relative(repo, path).replaceAll(sep, '/');
async function walk(root, cb, depth=0) {
  if (depth > 12) return;
  let entries;
  try { entries = await readdir(root, {withFileTypes:true}); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || ['node_modules','dist','build','coverage','reference','__tests__','test','tests','generated'].includes(entry.name)) continue;
    const full=join(root,entry.name);
    if (skip.test(readable(full))) continue;
    if (entry.isDirectory()) await walk(full, cb, depth+1);
    else if (entry.isFile()) await cb(full);
  }
}

// Discover every first-party source root instead of manually curating package
// allowlists. This remains source scanning, NOT app/plugin install discovery.
const componentRoots = new Set(['apps/local-studio/frontend/src/components']);
for (const dir of await readdir(resolve(repo, 'packages'), {withFileTypes:true})) {
  if(dir.isDirectory() && !dir.name.startsWith('.'))componentRoots.add('packages/'+dir.name+'/src');
}
for (const dir of await readdir(resolve(repo, 'apps'), {withFileTypes:true})) {
  if(dir.isDirectory() && !dir.name.startsWith('.')) {
    componentRoots.add('apps/'+dir.name+'/frontend/src');
    componentRoots.add('apps/'+dir.name+'/src');
  }
}
for (const folder of componentRoots) {
  await walk(resolve(repo,folder), async full => {
    if (!/\.(tsx|jsx)$/.test(full) || /\.(test|spec|stories)\./.test(full)) return;
    const source=readable(full), contents=await text(full);
    const ast=ts.createSourceFile(full, contents, ts.ScriptTarget.Latest, true,
      full.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.JSX);
    const names=new Set();
    for (const node of ast.statements) {
      const modifiers=ts.canHaveModifiers(node) ? ts.getModifiers(node) || [] : [];
      const exported=modifiers.some(m=>m.kind===ts.SyntaxKind.ExportKeyword);
      if (!exported) continue;
      if ((ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node)) && node.name) names.add(node.name.text);
      if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) if(ts.isIdentifier(decl.name)) names.add(decl.name.text);
    }
    const rel=source.split('/');
    const owner=rel[0]==='packages' ? rel[1] : rel[1];
    const family=source.includes('/components/themes/') ? 'Theme & CMS'
      : source.includes('/components/workbench/canvas') ? 'Canvas'
      : source.includes('agentsam-nav/') ? 'Navigation'
      : source.includes('agentsam-workbench/') ? 'Workbench'
      : source.includes('/components/workbench/') ? 'Workbench'
      : source.includes('/components/media/') || source.includes('agentsam-content-studio/') ? 'Media & Content'
      : source.includes('/components/campaigns/') ? 'Growth'
      : source.includes('/cad-creator/') ? 'CAD'
      : source.includes('/samsketch/') ? 'SamSketch'
      : source.includes('copro-ui/') || source.includes('agentsam-copro-studio/') ? 'MovieMode'
      : source.includes('/pages/products/') ? 'Product Studio'
      : source.includes('ecommerce-cms-agentsam/frontend/') || source.includes('/components/sites/') ? 'Commerce CMS'
      : source.includes('agentsam-analytics/') || source.includes('analytics-ui/') || source.includes('financial-analytics/') ? 'Analytics'
      : source.includes('/components/settings/') || source.includes('agentsam-settings/') ? 'Settings'
      : source.includes('agentsam-work/') ? 'Work Surfaces'
      : source.includes('agentsam-ide/') ? 'IDE'
      : source.includes('agentsam-database-editor/') || source.includes('/components/database/') ? 'Database'
      : source.includes('/components/shell/') || source.includes('agentsam-shell-kit/') ? 'Platform Shell'
      : source.includes('/components/ui/') ? 'UI Primitives'
      : source.includes('agentsam-loading-scene/') ? 'Motion & Loading'
      : source.includes('agentsam-abs/') || source.includes('agentsam-browser-site/') ? 'Browser & ABS'
      : 'Other UI';
    for (const name of names) if (/^[A-Z][A-Za-z0-9]+$/.test(name)) {
      record({ id:'component:'+source+'#'+name,kind:'component',name,source,owner,
        family,detail:'Exported React component · '+source.split('/').slice(-1)[0],
        evidence:'export declaration',preview: name==='AgentComposer' ? 'composer'
          : name==='NavPinnedSummary' ? 'summary'
          : name==='NavConversationActions' ? 'chat-actions'
          : name==='NavOverflowMenu' ? 'overflow'
          : name==='NavTopbar' ? 'topbar' : null,
      });
    }
  });
}

const manifestRoots=['apps','packages'];
for (const folder of manifestRoots) {
  await walk(resolve(repo,folder),async full=>{
    if (!full.endsWith('/agentsam.app.json')) return;
    const source=readable(full);
    let obj; try {obj=JSON.parse(await text(full));} catch {return;}
    const routeVal=obj.routes?.entry ?? obj.routes?.home ?? obj.routes?.['app.home']?.path
      ?? obj.routes?.['app.authenticated']?.path ?? obj.routes?.mounts?.[0]?.path;
    const route=typeof routeVal==='string' && routeVal.startsWith('/') ? routeVal : undefined;
    record({id:'app:'+source,kind:'app',family:'Apps',name:obj.display_name||obj.name||obj.id,
      source,owner:obj.package||source.split('/')[1],route,
      detail: [obj.category, obj.kind, ...(Array.isArray(obj.surfaces)?obj.surfaces:[]).slice(0,3)].filter(x=>typeof x==='string').join(' · ') || 'Installable app contract',
      evidence:'agentsam.app.json',capabilities:(Array.isArray(obj.capabilities)?obj.capabilities:[]).filter(x=>typeof x==='string').slice(0,20),
      version:obj.version||null});
  });
}
try {
  const source='packages/agentsam-embeds/agentsam.embeds.json';
  const embeds=JSON.parse(await text(resolve(repo,source)));
  for (const embed of embeds.storefront_embeds||[]) record({
    id:'embed:'+embed.key,kind:'embed',family:'Embeds',name:embed.name,
    source,owner:'@inneranimalmedia/agentsam-embeds',detail:embed.tagline||'CMS storefront embed contract',
    evidence:'storefront_embeds.'+embed.key,capabilities:embed.capabilities||[],surfaces:embed.surfaces||[],
  });
} catch {}
try {
  const source='apps/ecommerce-cms-agentsam/apps/registry.json';
  const registry=JSON.parse(await text(resolve(repo,source)));
  for (const row of registry.apps||[]) {
    const contract='apps/ecommerce-cms-agentsam/'+row.contract;
    let data;try{data=JSON.parse(await text(resolve(repo,contract)));}catch{continue;}
    record({id:'integration:'+data.id,kind:'integration',family:'Plugins & integrations',name:data.display_name||data.name||data.id,
      source:contract,owner:data.package||'ecommerce-cms-agentsam',detail:'Bundled CMS integration contract (not proof of account connection)',
      evidence:source+' → '+row.contract,route:typeof data.routes?.home==='string'?data.routes.home:undefined,
      capabilities:data.capabilities||[]});
  }
} catch {}
// Implementation entrypoints, not assumed registered/installed plugins.
for (const source of [
  'apps/local-studio/frontend/src/components/settings/IntegrationsPage.tsx',
  'apps/ecommerce-cms-agentsam/backend/agentsam/mcp-client.js',
  'apps/ecommerce-cms-agentsam/backend/agentsam/tools-registry.js',
]) {
  try {await stat(resolve(repo,source));record({id:'integration-source:'+source,kind:'integration',family:'Plugins & integrations',
      name:source.split('/').at(-1).replace(/\.(tsx|js)$/,''),source,owner:source.split('/')[1],
      detail:'Integration implementation source; live installation state requires account data',evidence:'existing file'});}catch{}
}
for (const [source, name, route] of [
  ['apps/local-studio/frontend/src/components/workbench/canvas/stage.tsx','Native Canvas Stage','/canvas'],
  ['apps/local-studio/frontend/src/components/workbench/canvas/cms-handoff.tsx','Canvas website draft export (optional)','/canvas'],
  ['apps/local-studio/frontend/src/components/themes/ThemeEditorFrame.tsx','CMS Theme Editor Bridge','/themes'],
  ['apps/local-studio/frontend/src/components/themes/ThemeStorePage.tsx','Theme Studio','/themes'],
]) {
  try {await stat(resolve(repo,source));record({id:'theme:'+source,kind:'theme',family:'Theme & CMS',name,source,route,
    owner:'local-studio',detail:'Existing design and CMS authoring boundary',evidence:'existing source'});}catch{}
}

items.sort((a,b)=>a.family.localeCompare(b.family)||a.name.localeCompare(b.name)||a.source.localeCompare(b.source));
const families=[...new Set(items.map(x=>x.family))];
const counts=Object.fromEntries(['component','app','embed','integration','theme'].map(kind=>[kind,items.filter(x=>x.kind===kind).length]));
const payload={schema:'agentsam.component-atlas.v1',authority:'repository source files and manifests',sourceRevision:process.env.AGENTSAM_SOURCE_SHA||'working-tree',generatedAt:new Date().toISOString(),counts,families,items};
await mkdir(dirname(out),{recursive:true});
await writeFile(out,JSON.stringify(payload,null,2)+'\n');
console.log('Source-backed inventory: '+items.length+' entries ('+Object.entries(counts).map(([k,n])=>k+':'+n).join(', ')+')');
console.log('Families: '+families.join(', '));
