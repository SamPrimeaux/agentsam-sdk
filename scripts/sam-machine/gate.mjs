#!/usr/bin/env node
/**
 * Fail closed on incomplete SAM machine promises.
 * Example: node scripts/sam-machine/gate.mjs --input /tmp/sam-machine/acceptance.json --require js,python
 */
import fs from 'node:fs';
const args=process.argv.slice(2);
const opt=key=>{const i=args.indexOf(key);return i<0?null:args[i+1];};
const file=opt('--input');
if(!file)throw new Error('sam_gate_acceptance_file_required');
const report=JSON.parse(fs.readFileSync(file,'utf8'));
if(report.schema!=='sam.machine.acceptance.v1')throw new Error('sam_gate_wrong_schema');
const checks=new Map((report.checks||[]).map(x=>[x.name,x.ok===true]));
const gates={
  js:checks.get('js-public-api')===true && Number(report.kernel_handlers)>=21,
  python:checks.get('python-public-api')===true,
  typescript:false,
  go:false,
  rust:false,
  cpp:false,
  cms:false,
  copro:false,
  media:false,
  iam_write_scope:false,
  durable_execution:false,
  artifact_storage:false,
};
const requested=String(opt('--require')||'js,python').split(',').map(x=>x.trim()).filter(Boolean);
const expanded=requested.includes('all')?Object.keys(gates):requested;
for(const gate of expanded)if(!(gate in gates))throw new Error('sam_gate_unknown:'+gate);
const unresolved=expanded.filter(gate=>gates[gate]!==true);
process.stdout.write(JSON.stringify({schema:'sam.machine.release-gate.v1',ok:unresolved.length===0,
  required:expanded,passed:expanded.filter(x=>gates[x]),failed:unresolved,
  note:'Only tested clients pass. Generated operation constants cannot satisfy an execution gate.'},null,2)+'\n');
if(unresolved.length)process.exitCode=1;
