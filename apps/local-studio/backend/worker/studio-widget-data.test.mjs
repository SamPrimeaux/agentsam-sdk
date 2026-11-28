import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {handleStudioWidgetData} from './studio-widget-data.js';

function fixture(key,configuration) {
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec([
    'CREATE TABLE agentsam_widget_installations(id TEXT PRIMARY KEY,account_id TEXT,widget_key TEXT,surface TEXT,instance_key TEXT,enabled INTEGER)',
    'CREATE TABLE agentsam_widget_preferences(installation_id TEXT PRIMARY KEY,preferences_json TEXT)',
    'CREATE TABLE agentsam_gate_runs(git_sha TEXT,gate_key TEXT,ok INTEGER,created_at INTEGER)',
    'CREATE TABLE quality_runs(commit_sha TEXT,run_context TEXT,status TEXT,pass_count INTEGER,fail_count INTEGER,warn_count INTEGER,created_at INTEGER)',
  ].join(';')+';');
  sqlite.prepare('INSERT INTO agentsam_widget_installations VALUES (?,?,?,?,?,1)').run('i1','alice',key,'agentsam_stage','default');
  sqlite.prepare('INSERT INTO agentsam_widget_preferences VALUES (?,?)').run('i1',JSON.stringify(configuration));
  const db={prepare(query){const stmt=sqlite.prepare(query);return {bind(...args){return {
    first:async()=>stmt.get(...args),all:async()=>({results:stmt.all(...args)}),
  };}};}};
  return {sqlite,db};
}
const connections=[{accountIdentifier:'samprimeaux',accountLabel:'SamPrimeaux'}];
const resolve=async()=>({ok:true,accessToken:'server-only-github-token'});
const options=(fetchImpl)=>({fetchImpl,connectorStatusImpl:async()=>connections,resolveGithubConnectorAccessImpl:resolve});
const request=key=>new Request('https://agentsam.test/api/widgets/data?key='+key);

test('pull request widget reads live GitHub state and does not trust its former snapshot',async()=>{
  const {db}=fixture('pull-request-summary',{repository:'owner/repo',pullNumber:42,snapshot:{state:'open',files:1}});
  let requested='';
  const fetchImpl=async(url,init)=>{
    requested=String(url);
    assert.equal(new Headers(init.headers).get('authorization'),'Bearer server-only-github-token');
    return Response.json({
      number:42,title:'A real pull request',state:'closed',merged:true,draft:false,mergeable:true,
      mergeable_state:'clean',base:{ref:'main'},head:{ref:'feature',sha:'a'.repeat(40)},
      changed_files:8,commits:3,additions:120,deletions:40,updated_at:'2026-11-27T22:00:00Z',
      merged_at:'2026-11-27T22:30:00Z',
    });
  };
  const response=await handleStudioWidgetData(request('pull-request-summary'),{DB:db},'alice','user-1',options(fetchImpl));
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.match(requested,/repos\/owner\/repo\/pulls\/42$/);
  assert.equal(payload.data.state,'merged');
  assert.equal(payload.data.files,8);
  assert.equal(payload.data.commits,3);
  assert.equal(payload.data.headBranch,'feature');
  assert.equal(payload.data.commit,'a'.repeat(40));
  assert.equal(payload.data.url,'https://github.com/owner/repo/pull/42');
});

test('release readiness is scoped to the resolved commit and combines only matching SDK receipts',async()=>{
  const {db,sqlite}=fixture('release-readiness',{repository:'owner/repo',ref:'main'});
  const sha='b'.repeat(40);
  sqlite.prepare('INSERT INTO agentsam_gate_runs VALUES (?,?,?,?)').run(sha,'workbench-build',1,1790000000);
  sqlite.prepare('INSERT INTO quality_runs VALUES (?,?,?,?,?,?,?)').run(sha,'release-check','passed',5,0,0,1790000000);
  const fetchImpl=async url=>{
    const path=new URL(url).pathname;
    if(path.endsWith('/commits/main')) return Response.json({sha});
    if(path.endsWith('/check-runs')) return Response.json({check_runs:[
      {name:'Build',status:'completed',conclusion:'success',html_url:'https://github.com/owner/repo/actions/runs/1'},
      {name:'Integration tests',status:'completed',conclusion:'failure',html_url:'https://github.com/owner/repo/actions/runs/2'},
    ]});
    if(path.endsWith('/status')) return Response.json({statuses:[]});
    throw new Error('unexpected '+path);
  };
  const response=await handleStudioWidgetData(request('release-readiness'),{DB:db},'alice','user-1',options(fetchImpl));
  const payload=await response.json();
  assert.equal(response.status,200);
  assert.equal(payload.data.commit,sha);
  assert.equal(payload.data.counts.total,4);
  assert.equal(payload.data.counts.passed,3);
  assert.equal(payload.data.counts.failed,1);
  assert.equal(payload.data.state,'blocked');
  assert.deepEqual(payload.data.blockers,['Integration tests']);
});

test('missing GitHub authorization produces a connect state, never snapshot fallback',async()=>{
  const {db}=fixture('pull-request-summary',{repository:'owner/repo',pullNumber:42,snapshot:{title:'fake'}});
  const response=await handleStudioWidgetData(request('pull-request-summary'),{DB:db},'alice','user-1',{
    connectorStatusImpl:async()=>[],resolveGithubConnectorAccessImpl:resolve,fetchImpl:async()=>{throw new Error('must not fetch');},
  });
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'github_oauth_required');
});

test('uninstalled widgets and unsupported data keys fail closed',async()=>{
  const {db}=fixture('pull-request-summary',{repository:'owner/repo',pullNumber:42});
  const missing=await handleStudioWidgetData(request('release-readiness'),{DB:db},'alice','user-1',options(async()=>Response.json({})));
  assert.equal(missing.status,404);
  const unsupported=await handleStudioWidgetData(request('weather'),{DB:db},'alice','user-1');
  assert.equal(unsupported.status,404);
});
