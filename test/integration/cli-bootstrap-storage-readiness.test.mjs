import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { discoverProjectStores } from '../../src/knowledge/store-discovery.js';
import { selectedModel } from '../../src/commands/shell.js';
import { writeCliPreferences } from '../../src/lib/cli-preferences.js';

const root=fileURLToPath(new URL('../../',import.meta.url));

test('core SAM import is safe when CMS module cannot be required',()=>{
  const code=`
    const Module=require('node:module');
    const previous=Module._load;
    Module._load=function(spec,...rest){
      if(spec==='@inneranimalmedia/agentsam-cms'){
        const error=new Error('Cannot find CMS');error.code='MODULE_NOT_FOUND';throw error;
      }
      return previous.call(this,spec,...rest);
    };
    (async()=>{
      const {createSamOS}=await import('./src/sam/os.js');
      const core=createSamOS({core:true});
      const ids=core.list().map(x=>x.id);
      if(core.status().core_count!==ids.length ||
        !['terminal.exec','security.scan','repository.inspect'].every(id=>ids.includes(id)))
        throw Error('core SAM not ready');
      // PR #227 now imports the bundled CMS implementation from SDK source,
      // so core startup must be independent of external workspace links.
      process.stdout.write('core_ready_without_external_cms_link');
    })().catch(e=>{console.error(e);process.exitCode=1;});
  `;
  const output=execFileSync(process.execPath,['-e',code],{cwd:root,encoding:'utf8'});
  assert.match(output,/core_ready_without_external_cms_link/);
});

test('TOML binding inventory discovers D1/R2/Vectorize/Hyperdrive without leaking vars or touching repo',async(t)=>{
  const repo=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-wrangler-discovery-'));
  t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
  fs.writeFileSync(path.join(repo,'package.json'),'{}');
  const toml=`name='example'
[vars]
API_TOKEN = 'do-not-emit'
[[d1_databases]]
binding='DB'
database_name='legacy-production'
[[r2_buckets]]
binding='ASSETS'
bucket_name='objects'
[[vectorize]]
binding='EMBED'
index_name='existing-index'
[[env.preview.d1_databases]]
binding='DB'
database_name='preview-db'
[[env.production.hyperdrive]]
binding='POSTGRES'
id='pool-id'
`;
  fs.writeFileSync(path.join(repo,'wrangler.toml'),toml);
  const before=fs.readdirSync(repo).sort();
  const inventory=await discoverProjectStores(repo,{DATABASE_URL:'postgres://hidden:password@host/test'});
  assert.equal(inventory.candidates.find(x=>x.driver==='d1'&&x.environment===null)?.name,'legacy-production');
  assert.equal(inventory.candidates.find(x=>x.driver==='d1'&&x.environment==='preview')?.name,'preview-db');
  assert.ok(inventory.candidates.some(x=>x.driver==='r2'));
  assert.ok(inventory.candidates.some(x=>x.driver==='vectorize'));
  assert.ok(inventory.candidates.some(x=>x.driver==='postgres-hyperdrive'));
  assert.ok(inventory.candidates.filter(x=>x.role==='application').every(x=>x.selectable===false));
  assert.doesNotMatch(JSON.stringify(inventory),/do-not-emit|hidden:password/);
  assert.deepEqual(fs.readdirSync(repo).sort(),before);
});

test('auto model selection cannot silently fall back to a random model catalog entry',t=>{
 const repo=fs.mkdtempSync(path.join(os.tmpdir(),'agentsam-auto-model-'));
 t.after(()=>fs.rmSync(repo,{recursive:true,force:true}));
 fs.writeFileSync(path.join(repo,'package.json'),'{}');
 writeCliPreferences(repo,{modelPreference:'auto'});
 assert.throws(()=>selectedModel(repo),/No verified chat model selected/);
});
