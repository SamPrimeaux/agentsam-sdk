#!/usr/bin/env node
/** Local reproducible source registry projection. No D1/token side effects. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildUniversalSource, commandSeedSql, skillSeedSql } from '../../src/registry/universal-source.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const files={
  'protocol/registry/universal-catalog.v1.json':null,
  'migrations/d1/generated/20261123_portable_cli_seed.sql':null,
  'migrations/d1/generated/20261123_source_skill_seed.sql':null,
};
const data=buildUniversalSource({root});
files['protocol/registry/universal-catalog.v1.json']=JSON.stringify(data,null,2)+'\n';
files['migrations/d1/generated/20261123_portable_cli_seed.sql']=commandSeedSql(data.commands);
files['migrations/d1/generated/20261123_source_skill_seed.sql']=skillSeedSql(data.skills);
const check=process.argv.includes('--check');
const write=process.argv.includes('--write');
if(check&&write)throw new Error('choose --check OR --write');
if(write) {
  for(const [name,content] of Object.entries(files)){
    fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});
    fs.writeFileSync(path.join(root,name),content,'utf8');
  }
} else if(check) {
  for(const [name,content] of Object.entries(files)){
    const target=path.join(root,name);
    const actual=fs.existsSync(target)?fs.readFileSync(target,'utf8'):'';
    if(actual!==content) {
      let offset=0;
      while(offset<actual.length && offset<content.length && actual[offset]===content[offset]) offset++;
      const start=Math.max(0,offset-96),end=offset+160;
      console.error('[universal-registry] drift detail '+JSON.stringify({
        file:name,offset,actualLength:actual.length,generatedLength:content.length,
        committed:actual.slice(start,end),generated:content.slice(start,end),
      }));
      throw new Error('universal_registry_generated_artifact_drift:'+name);
    }
  }
}
const report=JSON.stringify({schema:data.schema,counts:data.counts,mode:write?'write':check?'check':'preview',
  non_publishable:data.commands.filter(c=>c.release_state!=='verified').length,
  note:'no records were marked published, activated or executed'},null,2);
// npm pack --json uses stdout as a machine-readable tarball list.
// Lifecycle hooks must never contaminate it with our own JSON or progress.
if (write || check) console.error('[universal-registry] ' + report);
else console.log(report);
