#!/usr/bin/env node
/** Install our built IDE package into an unrelated npm project, and test the public exports. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as bundleForBrowser } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = mkdtempSync(path.join(tmpdir(), 'agentsam-ide-package-'));
const consumer = path.join(temp, 'different-customer');
try {
  const packaged = execFileSync('npm', ['pack', path.join(root, 'packages/agentsam-ide'), '--pack-destination', temp, '--silent'], { cwd:root, encoding:'utf8' }).trim().split('\n').at(-1);
  if (!packaged?.endsWith('.tgz')) throw new Error('ide_tarball_missing');
  mkdirSync(consumer);
  writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name:'customer-ide-package-consumer', private:true,type:'module'},null,2));
  execFileSync('npm', ['install','--offline','--no-audit','--no-fund','--ignore-scripts','--legacy-peer-deps',path.join(temp,packaged)], {cwd:consumer,stdio:'pipe'});
  const installed = JSON.parse(readFileSync(path.join(consumer,'node_modules/@inneranimalmedia/agentsam-ide/package.json'),'utf8'));
  for(const required of ['monaco/editor.js','monaco/index.js','workspace/index.js','monaco/editor.d.ts','lsp/contract.d.ts','lsp/host.mjs','lsp/host.d.mts']) {
    const { existsSync } = await import('node:fs');
    if(!existsSync(path.join(consumer,'node_modules/@inneranimalmedia/agentsam-ide/dist',required))) throw new Error('missing_export_file: '+required);
  }
  const script = [
    "import { workspaceDocumentUri } from '@inneranimalmedia/agentsam-ide';",
    "import { WorkspaceSaveQueue } from '@inneranimalmedia/agentsam-ide/workspace';",
    "import assert from 'node:assert/strict';",
    "import {LspHost,resolveLanguageServerBinary} from '@inneranimalmedia/agentsam-ide/lsp/host';",
    "import {workspaceRootFileUri} from '@inneranimalmedia/agentsam-ide/lsp';",
    "assert.equal(typeof LspHost,'function');assert.equal(typeof resolveLanguageServerBinary,'function');",
    "assert.equal(workspaceRootFileUri('/tmp/demo'),'file:///tmp/demo');",
    "assert.notEqual(workspaceDocumentUri({workspaceId:'a',path:'src/App.tsx'}),workspaceDocumentUri({workspaceId:'b',path:'src/App.tsx'}));",
    "const queue = new WorkspaceSaveQueue({write:async()=>({ok:true,version:'v2'})});",
    "queue.acceptDiskVersion('src/App.tsx','v1');queue.edit('src/App.tsx','test');await queue.flush('src/App.tsx');",
    "assert.equal(queue.version('src/App.tsx'),'v2');console.log('CONSUMER_IMPORT_PASS');",
  ].join('\n');
  writeFileSync(path.join(consumer,'verify.mjs'),script);
  const result = execFileSync(process.execPath,['verify.mjs'],{cwd:consumer,encoding:'utf8'}).trim();
  if(!result.includes('CONSUMER_IMPORT_PASS'))throw new Error(result);
  // Bundle precisely the published browser entry. Node-only process modules must
  // never enter its import graph even though the package offers a separate Node entry.
  const browserEntry=path.join(consumer,'node_modules/@inneranimalmedia/agentsam-ide/dist/lsp/index.js');
  const bundle=await bundleForBrowser({entryPoints:[browserEntry],bundle:true,platform:'browser',format:'esm',write:false,metafile:true});
  const inputs=Object.keys(bundle.metafile.inputs);
  if(inputs.some(name=>/\bhost\.mjs$|(^|[\/])node:child_process|(^|[\/])node:fs/.test(name)))throw new Error('browser_lsp_bundle_imported_node_host');
  if(bundle.outputFiles.some(file=>/node:child_process|node:fs|spawn\(/.test(file.text)))throw new Error('browser_lsp_output_contains_node_runtime');
  const contract=JSON.parse(JSON.stringify(installed.exports));
  if(!contract['./lsp/contract']||!contract['./lsp/host']||installed.sideEffects!==false)throw new Error('lsp_package_contract_incomplete');
  console.log(JSON.stringify({ok:true,package:installed.name,version:installed.version,source:'packed-tarball',consumer:'unrelated-npm-project',editor_bundle:true,workspace_queue:true,headless_exports:true,browser_node_isolation:true,typed_lsp_contract:true,packaged_node_host:true}));
} finally { rmSync(temp,{recursive:true,force:true}); }
