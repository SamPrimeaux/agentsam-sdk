import { connectorStatus, resolveGithubConnectorAccess } from './connector-oauth.js';
import { SUPPORTED_WIDGET_DATA_ADAPTERS } from './widget-data-adapters.js';

const reply = (body,status=200) => Response.json(body,{status,headers:{
  'cache-control':'private, no-store','x-content-type-options':'nosniff',
}});
const clean = value => typeof value === 'string' ? value.trim() : '';
const fail = (code,status=400,extra={}) => Object.assign(new Error(code),{status,extra});
const repositoryValue = value => {
  const repo=clean(value);
  return /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ? repo : '';
};
const safeRef = value => {
  const ref=clean(value);
  return ref && ref.length<=160 && /^[A-Za-z0-9._/-]+$/.test(ref) &&
    !ref.includes('..') && !ref.startsWith('/') && !ref.endsWith('/') && !ref.includes('//') ? ref : '';
};
async function installedConfiguration(db,accountId,key) {
  const row=await db.prepare(
    "SELECT p.preferences_json FROM agentsam_widget_installations i " +
    "LEFT JOIN agentsam_widget_preferences p ON p.installation_id=i.id " +
    "WHERE i.account_id=? AND i.widget_key=? AND i.surface='agentsam_stage' " +
    "AND i.instance_key='default' AND i.enabled=1 LIMIT 1"
  ).bind(accountId,key).first();
  if(!row) throw fail('widget_not_installed',404);
  try {
    const value=JSON.parse(row.preferences_json||'{}');
    return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  } catch { return {}; }
}
async function githubToken(env,userId,configuration,options) {
  const getConnections=options.connectorStatusImpl||connectorStatus;
  const resolveAccess=options.resolveGithubConnectorAccessImpl||resolveGithubConnectorAccess;
  const connections=await getConnections(env,userId,'github');
  if(!Array.isArray(connections)||!connections.length) throw fail('github_oauth_required',503);
  const preferred=clean(configuration.githubAccount);
  const selected=preferred
    ? connections.find(connection=>connection.accountIdentifier===preferred)
    : connections.length===1 ? connections[0] : null;
  if(preferred&&!selected) throw fail('github_account_not_connected',409);
  if(!selected) throw fail('github_account_selection_required',409,{
    accounts:connections.map(connection=>({id:connection.accountIdentifier,label:connection.accountLabel||connection.accountIdentifier})),
  });
  const grant=await resolveAccess(env,userId,selected.accountIdentifier,{fetchImpl:options.fetchImpl||fetch});
  if(!grant?.ok||!grant.accessToken) {
    const code=grant?.code||'github_oauth_unavailable';
    const status=code==='github_account_selection_required'?409:
      code==='github_oauth_required'||code==='github_oauth_storage_unavailable'||code==='github_oauth_vault_unavailable'?503:
      code==='github_oauth_refresh_unavailable'||code==='github_oauth_refresh_storage_failed'?502:
      code==='github_oauth_refresh_concurrent_retry'?409:401;
    throw fail(code,status);
  }
  return grant.accessToken;
}
async function githubJson(path,token,fetchImpl) {
  let response;
  try {
    response=await fetchImpl('https://api.github.com'+path,{
      headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json',
        'x-github-api-version':'2022-11-28','user-agent':'agentsam-local-studio'},
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12_000),
    });
  } catch { throw fail('github_api_unavailable',502); }
  if(response.status===401) throw fail('github_oauth_reconnect_required',503);
  if(response.status===403) throw fail('github_permission_denied',403);
  if(response.status===404) throw fail('github_resource_not_found',404);
  if(!response.ok) throw fail('github_api_unavailable',502);
  const data=await response.json().catch(()=>null);
  if(!data||typeof data!=='object') throw fail('github_response_invalid',502);
  return data;
}
function repoPath(repo) { return repo.split('/').map(encodeURIComponent).join('/'); }
async function loadPullRequest(env,userId,configuration,options) {
  const repo=repositoryValue(configuration.repository);
  const number=Number(configuration.pullNumber);
  if(!repo||!Number.isSafeInteger(number)||number<1) throw fail('widget_configuration_required',409);
  const token=await githubToken(env,userId,configuration,options);
  const pull=await githubJson('/repos/'+repoPath(repo)+'/pulls/'+number,token,options.fetchImpl||fetch);
  return {
    repository:repo,number:Number(pull.number)||number,title:clean(pull.title)||('Pull request #'+number),
    url:'https://github.com/'+repo+'/pull/'+number,
    state:pull.merged?'merged':pull.state==='closed'?'closed':'open',
    draft:Boolean(pull.draft),mergeable:typeof pull.mergeable==='boolean'?pull.mergeable:null,
    mergeableState:clean(pull.mergeable_state)||null,
    baseBranch:clean(pull.base?.ref)||null,headBranch:clean(pull.head?.ref)||null,
    commit:clean(pull.head?.sha)||null,
    files:Number.isSafeInteger(pull.changed_files)?pull.changed_files:null,
    commits:Number.isSafeInteger(pull.commits)?pull.commits:null,
    additions:Number.isSafeInteger(pull.additions)?pull.additions:null,
    deletions:Number.isSafeInteger(pull.deletions)?pull.deletions:null,
    updatedAt:clean(pull.updated_at)||null,mergedAt:clean(pull.merged_at)||null,
    fetchedAt:new Date().toISOString(),
  };
}
async function rowsForCommit(db,sql,sha) {
  try { const result=await db.prepare(sql).bind(sha).all(); return result?.results||[]; }
  catch { return []; }
}
function checkStatus(status,conclusion) {
  if(status!=='completed') return 'pending';
  if(['success','neutral','skipped'].includes(String(conclusion||'').toLowerCase())) return 'passed';
  if(['failure','timed_out','action_required','cancelled','stale'].includes(String(conclusion||'').toLowerCase())) return 'failed';
  return 'unknown';
}
async function loadReleaseReadiness(env,userId,configuration,options) {
  const repo=repositoryValue(configuration.repository);
  const ref=safeRef(configuration.ref||'main');
  if(!repo||!ref) throw fail('widget_configuration_required',409);
  const token=await githubToken(env,userId,configuration,options);
  const path='/repos/'+repoPath(repo)+'/commits/'+encodeURIComponent(ref);
  const commit=await githubJson(path,token,options.fetchImpl||fetch);
  const sha=clean(commit.sha);
  if(!/^[a-f0-9]{40}$/i.test(sha)) throw fail('github_commit_response_invalid',502);
  const fetcher=options.fetchImpl||fetch;
  const [checksResult,statusResult,gates,quality]=await Promise.all([
    githubJson(path+'/check-runs?per_page=100',token,fetcher).then(value=>({ok:true,value})).catch(()=>({ok:false,value:null})),
    githubJson(path+'/status',token,fetcher).then(value=>({ok:true,value})).catch(()=>({ok:false,value:null})),
    rowsForCommit(env.DB,'SELECT gate_key, ok, created_at FROM agentsam_gate_runs WHERE git_sha=? ORDER BY created_at DESC LIMIT 50',sha),
    rowsForCommit(env.DB,'SELECT run_context, status, pass_count, fail_count, warn_count, created_at FROM quality_runs WHERE commit_sha=? ORDER BY created_at DESC LIMIT 20',sha),
  ]);
  const liveChecks=Array.isArray(checksResult.value?.check_runs)?checksResult.value.check_runs:[];
  const statuses=Array.isArray(statusResult.value?.statuses)?statusResult.value.statuses:[];
  const checks=[];
  if(liveChecks.length) {
    for(const item of liveChecks) checks.push({
      name:clean(item.name)||'GitHub check',status:checkStatus(item.status,item.conclusion),
      source:'github-check-run',url:clean(item.html_url)||null,
    });
  } else {
    for(const item of statuses) checks.push({
      name:clean(item.context)||'GitHub commit status',
      status:item.state==='success'?'passed':item.state==='failure'||item.state==='error'?'failed':item.state==='pending'?'pending':'unknown',
      source:'github-commit-status',url:clean(item.target_url)||null,
    });
  }
  for(const item of gates) checks.push({
    name:'AgentSam gate · '+(clean(item.gate_key)||'verification'),
    status:Number(item.ok)===1?'passed':'failed',source:'agentsam-gate',
  });
  for(const item of quality) {
    const raw=String(item.status||'').toLowerCase();
    const status=Number(item.fail_count)>0||['failed','failure','error'].includes(raw)?'failed':
      ['passed','pass','success'].includes(raw)?'passed':
      ['pending','running','in_progress'].includes(raw)?'pending':'unknown';
    checks.push({
      name:'AgentSam quality · '+(clean(item.run_context)||'quality run')+
        ' ('+Number(item.pass_count||0)+' passed, '+Number(item.fail_count||0)+' failed)',
      status,source:'agentsam-quality',
    });
  }
  const counts={passed:0,failed:0,pending:0,unknown:0,total:checks.length};
  for(const item of checks) counts[item.status]++;
  const state=counts.total===0?'no_evidence':counts.failed?'blocked':counts.pending?'running':counts.unknown?'partial':'clear';
  return {
    repository:repo,ref,commit:sha,state,counts,checks:checks.slice(0,40),
    blockers:checks.filter(item=>item.status==='failed').map(item=>item.name).slice(0,12),
    fetchedAt:new Date().toISOString(),
    sources:{githubChecks:checksResult.ok||statusResult.ok,agentSamReceipts:gates.length+quality.length>0},
  };
}

export async function handleStudioWidgetData(request,env,accountId,userId,options={}) {
  if(request.method!=='GET') return reply({ok:false,error:'method_not_allowed'},405);
  if(!accountId||!userId) return reply({ok:false,error:'unauthorized'},401);
  if(!env?.DB?.prepare) return reply({ok:false,error:'widget_storage_unavailable'},503);
  const key=new URL(request.url).searchParams.get('key')||'';
  if(!SUPPORTED_WIDGET_DATA_ADAPTERS.has(
    key==='pull-request-summary'?'github.pull-request':
    key==='release-readiness'?'github.commit-readiness':''
  )) return reply({ok:false,error:'widget_data_adapter_not_supported'},404);
  try {
    const configuration=await installedConfiguration(env.DB,accountId,key);
    const data=key==='pull-request-summary'
      ? await loadPullRequest(env,userId,configuration,options)
      : await loadReleaseReadiness(env,userId,configuration,options);
    return reply({ok:true,widget:key,data});
  } catch(error) {
    const code=clean(error?.message)||'widget_data_unavailable';
    const status=Number(error?.status)||503;
    return reply({ok:false,error:code,...(error?.extra||{})},status);
  }
}
