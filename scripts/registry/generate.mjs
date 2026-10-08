#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { CLI_COMMAND_CATALOG } from '../../src/cli/command-catalog.js';
import { getCapabilityManifest } from '../../src/capabilities/manifest.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=(name)=>fs.readFileSync(path.join(root,name),'utf8');
const check=process.argv.includes('--check');
const index=JSON.parse(read('packages/catalog/generated/packages.json'));
const capabilities=Object.values(getCapabilityManifest().capabilities);
const commands=CLI_COMMAND_CATALOG.map(row=>({
 id:row.id, aliases:row.aliases||[], summary:row.summary, topic:row.topic,
 usage:row.usage?.length?row.usage:['agentsam '+row.id], operation:row.operation||null
}));
const known=new Set(commands.flatMap(row=>[row.id,...row.aliases]));
const dispatched=[...new Set([...read('src/cli.js').matchAll(/\bcommand === '([^']+)'/g)]
 .map(match=>match[1]).filter(x=>!x.startsWith('-')))];
const missing=dispatched.filter(id=>!known.has(id));
if(missing.length)throw new Error('Uncatalogued CLI dispatch roots: '+missing.join(', '));
const packages=index.packages.map(row=>{
 const related=capabilities.filter(c=>c.package===row.name);
 const commandsFound=new Set(row.commands||[]);
 for(const cap of related)if(cap.cli)commandsFound.add(cap.cli);
 for(const c of commands)if(related.some(cap=>cap.id===c.operation))commandsFound.add(c.usage[0]);
 const use=new Set(row.use_when||[]);
 for(const cap of related)if(cap.description)use.add(cap.description);
 if(!use.size&&row.purpose)use.add(row.purpose);
 const review=new Set(row.review_required||[]);
 if(use.size)review.delete('use_when');
 if(commandsFound.size)review.delete('commands');
 return {...row,commands:[...commandsFound].sort(),use_when:[...use],
  review_required:[...review].sort(),readiness:'unverified'};
}).sort((a,b)=>a.id.localeCompare(b.id));
const data={schema:'agentsam.registry.generated.v1',
 authority:['src/cli/command-catalog.js','protocol/capabilities/manifest.json','packages/catalog/generated/packages.json'],
 counts:{commands:commands.length,capabilities:capabilities.length,packages:packages.length},
 commands,capabilities:capabilities.map(c=>({id:c.id,description:c.description,package:c.package,
 cli:c.cli||null,agent_callable:'requires-handler-check',status:c.status})),packages};
const generated='src/registry/generated/inventory.json';
const commandBlock='cli:\n  commands:\n'+commands.map(c=>'    - '+c.id).join('\n')+'\n\n';
const q=(s)=>JSON.stringify(String(s));
const packageBlock='  inventory:\n'+packages.map(p=>
 '    - id: '+q(p.id)+'\n      name: '+q(p.name)+
 '\n      path: '+q(p.evidence?.directory||'')+'\n      readiness: unverified'
).join('\n')+'\n';
const begin='  # BEGIN AGENTSAM GENERATED INVENTORY\n';
const end='  # END AGENTSAM GENERATED INVENTORY\n';
const block=begin+packageBlock+end;
let yaml=read('agentsam.yaml');
const cliRegex=/^cli:\n[\s\S]*?(?=^boundaries:)/m;
if(!cliRegex.test(yaml))throw new Error('agentsam.yaml cli section missing');
yaml=yaml.replace(cliRegex,commandBlock);
if(yaml.includes(begin)){
 const start=yaml.indexOf(begin),finish=yaml.indexOf(end,start);
 if(finish<0)throw new Error('inventory marker not closed');
 yaml=yaml.slice(0,start)+block+yaml.slice(finish+end.length);
}else yaml=yaml.replace(/^packages:\n/m,'packages:\n'+block);
const files=[[generated,JSON.stringify(data,null,2)+'\n'],['agentsam.yaml',yaml]];
const drift=files.filter(([name,body])=>!fs.existsSync(path.join(root,name))||read(name)!==body).map(([name])=>name);
if(check){
  // A locally generated, git-ignored inventory can pass on a developer machine
  // and fail in Actions. Ensure the release evidence is actually committed.
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', generated], {
      cwd: root, stdio: 'ignore',
    });
  } catch {
    console.error('Registry inventory is not tracked by Git: ' + generated +
      ' (check .gitignore and commit the generated file)');
    process.exitCode = 1;
  }
 if(drift.length){console.error('Registry drift: '+drift.join(', '));process.exitCode=1;}
 else if(!process.exitCode) console.log('Registry PASS: '+commands.length+' commands, '+capabilities.length+' capabilities, '+packages.length+' packages');
}else{
 fs.mkdirSync(path.dirname(path.join(root,generated)),{recursive:true});
 for(const [name,body]of files)fs.writeFileSync(path.join(root,name),body);
 console.log('Generated registry: '+commands.length+' commands, '+capabilities.length+' capabilities, '+packages.length+' packages');
}
