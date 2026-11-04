#!/usr/bin/env node
/**
 * One authoring authority: packages/theme-contract/editor/*.mjs.
 * Browser-served modules must remain importable as standalone scripts at
 * /theme-editor/*.mjs (Worker static assets and browser ESM import maps).
 * Build them mechanically; never maintain a second implementation by hand.
 *
 * node scripts/sync-theme-contract.mjs          regenerate browser output
 * node scripts/sync-theme-contract.mjs --check  assert checked-in output matches
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES=['project','bridge','cms-adapter'];
const VERIFY=process.argv.includes('--check');
let failures=0;
for (const name of MODULES) {
  const source=join(ROOT,'packages/theme-contract/editor',name+'.mjs');
  const destination=join(ROOT,'frontend/theme-editor',name+'.mjs');
  const body=readFileSync(source,'utf8');
  const stamp='// GENERATED from packages/theme-contract/editor/'+name+'.mjs. DO NOT EDIT.\n';
  const generated=stamp+body;
  if(VERIFY){
    if(readFileSync(destination,'utf8')!==generated){
      console.error('[contract drift]',name,'rebuild with npm run sync:theme-contract');
      failures++;
    } else console.log('[contract aligned]',name);
  }else{
    writeFileSync(destination,generated);
    console.log('[contract generated]',name);
  }
}
if(failures)process.exitCode=1;
