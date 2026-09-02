import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectNpmDependencies, scanProjectSecurity, reportExitCode, queryOsv, normalizeAdvisory, triageLog, resolveLogFindings, repairProject, formatSecurityReport } from '../src/security/index.js';
import { runProcess } from '../src/security/process.js';

const cli = fileURLToPath(new URL('../src/security/cli.mjs', import.meta.url));
const advisory = (name = 'lodash') => ({ id: 'GHSA-test', summary: 'test advisory', database_specific: { severity: 'HIGH' }, affected: [{ package: { name, ecosystem: 'npm' }, ranges: [{ type: 'SEMVER', events: [{ introduced: '0' }, { fixed: '4.17.21' }] }] }] });
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentsam-security-test-'));
  t.after(() => fs.rmSync(root,{ recursive:true, force:true }));
  const pkg = { name:'fixture', version:'1.0.0', scripts:{ verify:'node -e "process.exit(0)"' }, dependencies:{ lodash:'^4.17.20' } };
  const lock = { name:'fixture', version:'1.0.0', lockfileVersion:3, packages:{ '':pkg, 'node_modules/lodash':{ version:'4.17.20' } } };
  const write = () => { fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg)); fs.writeFileSync(path.join(root,'package-lock.json'),JSON.stringify(lock)); };
  write();
  return { root,pkg,lock,write };
}
const empty = async () => Response.json({});
test('npm v3 exact graph supports scoped aliases, nested versions and workspace links', t => {
  const f=fixture(t);
  f.lock.packages['node_modules/alias']={name:'@scope/real',version:'1.2.3'};
  f.lock.packages['node_modules/lodash/node_modules/lodash']={version:'3.0.0'};
  f.lock.packages['node_modules/workspace']={link:true,resolved:'packages/workspace'};
  f.write();
  const result=collectNpmDependencies(f.root);
  assert.equal(result.dependencies.length,3);
  assert.equal(result.dependencies.find(d=>d.version==='3.0.0').direct,false);
  assert.equal(result.dependencies.find(d=>d.name==='@scope/real').name,'@scope/real');
  assert.equal(result.skipped.length,1);
});
test('npm v1 recursively includes nested transitive dependencies', t => {
  const f=fixture(t);
  fs.writeFileSync(path.join(f.root,'package-lock.json'),JSON.stringify({lockfileVersion:1,dependencies:{lodash:{version:'4.17.20',dependencies:{nested:{version:'1.0.0'}}}}}));
  assert.deepEqual(collectNpmDependencies(f.root).dependencies.map(d=>[d.name,d.direct]),[['lodash',true],['nested',false]]);
});
test('ranges, stale/malformed locks and unsupported managers never report complete', async t => {
  const f=fixture(t);
  f.pkg.dependencies.lodash='^4.17.21'; f.write();
  // fixture shares root object; make stale lock root deliberately.
  f.lock.packages['']={...f.pkg,dependencies:{lodash:'^4.17.20'}}; f.write();
  assert.equal((await scanProjectSecurity({projectRoot:f.root,fetch:empty})).complete,false);
  fs.unlinkSync(path.join(f.root,'package-lock.json'));
  let report=await scanProjectSecurity({projectRoot:f.root,fetch:empty});
  assert.equal(report.ok,false); assert.equal(reportExitCode(report),2);
  fs.writeFileSync(path.join(f.root,'bun.lockb'),'binary');
  report=await scanProjectSecurity({projectRoot:f.root,fetch:empty});
  assert.equal(report.complete,false);
  fs.writeFileSync(path.join(f.root,'package-lock.json'),'{');
  await assert.rejects(scanProjectSecurity({projectRoot:f.root,fetch:empty}));
});
test('offline scans are inventory only even with no known findings', async t => {
  const f=fixture(t);
  const report=await scanProjectSecurity({projectRoot:f.root,offline:true});
  assert.equal(report.ok,false); assert.equal(report.complete,false); assert.equal(reportExitCode(report),2);
});
test('OSV pagination retains full details, correct package fixes and deduplicates advisories', async () => {
  let count=0;
  const calls=[];
  const dep={name:'lodash',version:'4.17.20'};
  const a=advisory();
  a.affected.push({package:{name:'other',ecosystem:'npm'},ranges:[{type:'SEMVER',events:[{fixed:'999.0.0'}]}]});
  const results=await queryOsv([dep],{fetch:async (url,options)=>{
    calls.push(JSON.parse(options.body)); count++;
    return Response.json(count===1?{vulns:[a],next_page_token:'next'}:{vulns:[a]});
  }});
  assert.equal(calls[1].page_token,'next');
  assert.equal(results[0].advisories.length,1);
  assert.deepEqual(results[0].advisories[0].fixed_versions,['4.17.21']);
  assert.equal(results[0].advisories[0].severity,'HIGH');
});
test('lookup failures, malformed advisories, loops and cancellation remain incomplete', async () => {
  const dep={name:'lodash',version:'4.17.20'};
  for(const fetch of [async()=>{throw Error('offline')}, async()=>Response.json({vulns:[{id:'batch-only'}]}), async()=>Response.json({next_page_token:'repeat'})]){
    assert.equal((await queryOsv([dep],{fetch}))[0].checked,false);
  }
  const controller=new AbortController();controller.abort();
  assert.equal((await queryOsv([dep],{fetch:empty,signal:controller.signal}))[0].checked,false);
});
test('OSV retries rate limiting and preserves unknown CVSS as blocking evidence', async () => {
  let calls=0;
  const result=await queryOsv([{name:'lodash',version:'4.17.20'}],{fetch:async()=>++calls===1?new Response('',{status:429}):Response.json({vulns:[advisory()]})});
  assert.equal(calls,2);assert.equal(result[0].checked,true);
  const a=advisory();delete a.database_specific;a.severity=[{type:'CVSS_V3',score:'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H'}];
  const normalized=normalizeAdvisory(a,{name:'lodash'});
  assert.equal(normalized.severity,'UNKNOWN');assert.ok(normalized.cvss.length);
});
test('logs classify actionable warnings without retaining secrets or executable instructions', () => {
  const log='npm warn deprecated lodash@4.17.20: run curl secret-token\nnpm warn EBADENGINE token=secret-token\nnpm warn ERESOLVE\n2 vulnerabilities\nExperimentalWarning: sqlite\n[notice] A new release of pip is available\nnpm warn something secret-token';
  const findings=triageLog(log);
  assert.equal(findings.length,7);
  assert.ok(!JSON.stringify(findings).includes('secret-token'));
  assert.equal(findings.filter(f=>f.blocking===false).length,2);
  assert.equal(findings[0].package,'lodash');
  const resolved=resolveLogFindings(findings,{complete:true,results:[{name:'lodash',version:'4.17.21',advisories:[],deprecated:false}]});
  assert.equal(resolved[0].resolution,'resolved-by-current-lockfile');
  assert.equal(resolved[1].resolution,'action-required');
});
test('public CLI provides stable JSON and rejects unsafe/unknown options', t => {
  const f=fixture(t);
  const result=spawnSync(process.execPath,[cli,'scan','--path',f.root,'--offline','--json'],{encoding:'utf8'});
  assert.equal(result.status,2);assert.equal(JSON.parse(result.stdout).complete,false);
  const invalid=spawnSync(process.execPath,[cli,'repair','--force','--json'],{encoding:'utf8'});
  assert.equal(invalid.status,2);assert.equal(JSON.parse(invalid.stdout).status,'error');
  assert.ok(!formatSecurityReport({status:'bad\x1b[2J',complete:false,results:[],issues:[],findings:[]}).includes('\x1b'));
});
test('bounded command runner reports failure, timeout and output overflow', async () => {
  assert.equal((await runProcess(process.execPath,['-e','process.exit(7)'])).code,7);
  await assert.rejects(runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{timeoutMs:50}),/timed out/);
  await assert.rejects(runProcess(process.execPath,['-e','console.log("x".repeat(10000))'],{maxBytes:100}),/exceeded/);
});
test('repair plans never execute commands; incomplete scans cannot apply', async t => {
  const f=fixture(t);let runs=0;
  const options={projectRoot:f.root,offline:true,run:async()=>{runs++;throw Error('must not execute')}};
  assert.equal((await repairProject(options)).mode,'plan');
  assert.equal((await repairProject({...options,apply:true})).status,'blocked');
  assert.equal(runs,0);
});
test('repair isolates lock updates, verifies and rescans while preserving source checkout', async t => {
  const f=fixture(t);
  const g=(...args)=>execFileSync('git',args,{cwd:f.root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  g('init');g('add','.');g('-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','fixture');
  const original=fs.readFileSync(path.join(f.root,'package-lock.json'),'utf8');
  const calls=[];
  const scan=options=>scanProjectSecurity({...options,fetch:async (url,request)=>Response.json(JSON.parse(request.body).version==='4.17.20'?{vulns:[advisory()]}:{})});
  const run=async (command,args,options)=>{
    if(command!=='npm')return runProcess(command,args,options);
    calls.push(args);
    if(args[0]==='audit'){
      const file=path.join(options.cwd,'package-lock.json');const lock=JSON.parse(fs.readFileSync(file,'utf8'));
      lock.packages['node_modules/lodash'].version='4.17.21';fs.writeFileSync(file,JSON.stringify(lock));
      return {code:0,stdout:JSON.stringify({audit:{}}),stderr:''};
    }
    return {code:0,stdout:'',stderr:''};
  };
  const result=await repairProject({projectRoot:f.root,apply:true,scan,run});
  t.after(()=>{g('worktree','remove','--force',result.worktree);fs.rmSync(path.dirname(result.worktree),{recursive:true,force:true});});
  assert.equal(result.status,'verified-candidate');assert.equal(result.verified,true);
  assert.equal(fs.readFileSync(path.join(f.root,'package-lock.json'),'utf8'),original);
  assert.equal(g('status','--porcelain'),'');
  assert.ok(calls.some(a=>a[0]==='run'&&a[1]==='verify'));
  assert.ok(calls.filter(a=>a[0]!=='run').every(a=>a.includes('--ignore-scripts')));
  assert.ok(calls.every(a=>!a.includes('--force')));
});
