#!/usr/bin/env node
/**
 * Build-time pre-render of data-free Settings route shells.
 * Nitro SSR succeeds in Node but fails in Cloudflare workerd for the Settings
 * route family. Serve these exact, canonical app route HTML shells behind
 * Worker authentication and hydrate their normal React UI in the browser.
 *
 * No account data, cookies, D1/R2 reads, credentials, or third-party API calls.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const studio=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const nitro=(await import(path.join(studio,'.output/server/index.mjs'))).default;
const units=[
  'general','agents','customize','design','git-prs','codebase',
  'network','runtime','themes','storage','keys','usage',
  'notifications','docs','integrations',
];
for(const unit of units){
  const url='https://agentsam.inneranimalmedia.com/settings/'+unit;
  const rendered=await nitro.fetch(new Request(url),{},{
    waitUntil(){},passThroughOnException(){},
  });
  const html=await rendered.text();
  if(rendered.status!==200 || !html.startsWith('<!DOCTYPE html>') ||
     !html.includes('/assets/') || html.length<2500)
    throw new Error('Settings SSR shell invalid for '+unit+': HTTP '+rendered.status);
  const directory=path.join(studio,'.output/public/studio-settings-shell',unit);
  await mkdir(directory,{recursive:true});
  await writeFile(path.join(directory,'index.html'),html,'utf8');
}
console.log('[settings-shell] Staged '+units.length+' source-rendered, data-free Settings routes');
