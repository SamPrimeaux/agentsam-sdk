/**
 * GitHub IDE files use the existing account-bound Local Studio OAuth vault.
 * No tokens reach the client. All reads/writes are scoped to an explicitly
 * selected OAuth account, repository, branch and relative path.
 */
import { resolveGithubConnectorAccess } from './connector-oauth.js';

const API = 'https://api.github.com';
const MAX_BYTES = 1024 * 1024;
const safeRepo = value => /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value || '') && !value.split('/').some(p=>p==='.'||p==='..');
const safeBranch = value => typeof value==='string' && value.length>0 && value.length<180 &&
  !/(^\/|\.\.|[\x00-\x20~^:?*\\\[]|\/$|\.lock$|@\{)/.test(value);
const safePath = value => typeof value==='string' && value.length>0 && value.length<850 &&
  !value.startsWith('/') && !value.includes('\\') && !value.includes('\0') &&
  !value.split('/').some(p=>!p||p==='.'||p==='..');
const toPath = p => p.split('/').map(encodeURIComponent).join('/');
function json(value,status=200){return Response.json(value,{status,headers:{'cache-control':'private, no-store','x-content-type-options':'nosniff'}});}
function error(code,status=400){return json({ok:false,error:code},status);}
const providerCode = status => status===401?'github_reconnect_required':status===403?'github_permission_denied':status===404?'github_resource_not_found':status===409||status===422?'version_conflict':'github_provider_error';

async function requestProvider(fetchImpl,token,path,method='GET',payload){
  const response=await fetchImpl(API+path,{
    method,
    headers:{authorization:'Bearer '+token,accept:'application/vnd.github+json',
      'x-github-api-version':'2022-11-28',...(payload?{'content-type':'application/json'}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{}),
  });
  if(!response.ok)return {ok:false,status:response.status,code:providerCode(response.status)};
  return {ok:true,data:await response.json().catch(()=>null)};
}
function decodeText(encoded) {
  const raw=encoded.replace(/\s/g,'');
  if(raw.length>Math.ceil(MAX_BYTES*4/3)+8)throw Error('file_too_large');
  const binary=atob(raw);
  if(binary.length>MAX_BYTES)throw Error('file_too_large');
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new TextDecoder('utf-8',{fatal:true}).decode(bytes);
}
function encodeText(content){
  const bytes=new TextEncoder().encode(content);
  if(bytes.length>MAX_BYTES)throw Error('file_too_large');
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
export function isGithubIdeSourceRequest(path){
  return /^\/api\/work\/ide\/github\/(repos|tree|file)$/.test(path);
}
export async function handleGithubIdeSourceRequest(request,env,owner,opts={}){
  if(!owner)return error('unauthorized',401);
  const url=new URL(request.url);
  if(!isGithubIdeSourceRequest(url.pathname))return error('not_found',404);
  const {searchParams:sp}=url;
  const account=String(sp.get('account')||'').trim();
  const fetchImpl=opts.fetchImpl||fetch;
  const grant=await resolveGithubConnectorAccess(env,owner,account,{fetchImpl});
  if(!grant.ok)return error(grant.code,grant.code==='github_oauth_refresh_unavailable'?503:401);
  const token=grant.accessToken;
  const method=request.method;
  if(url.pathname.endsWith('/repos')){
    if(method!=='GET')return error('method_not_allowed',405);
    const page=Number(sp.get('page')||1);
    if(!Number.isInteger(page)||page<1||page>10)return error('github_page_invalid');
    // GitHub App user tokens can reach only installed repos also accessible to
    // the user. Enumerate installations instead of treating it as OAuth repo scope.
    const installed=await requestProvider(fetchImpl,token,'/user/installations?per_page=100');
    if(!installed.ok)return error(installed.code,installed.status);
    const installs=installed.data?.installations;
    if(!Array.isArray(installs)||installs.length>30||Number(installed.data.total_count||0)>30)
      return error('github_installation_listing_too_large',409);
    const all=new Map();
    for(const installation of installs) {
      if(!Number.isSafeInteger(installation.id)||installation.id<=0)continue;
      const contentsWrite=installation.permissions?.contents==='write';
      for(let part=1;part<=10;part++){
        const result=await requestProvider(fetchImpl,token,
          '/user/installations/'+installation.id+'/repositories?per_page=100&page='+part);
        if(!result.ok)return error(result.code,result.status);
        const repos=result.data?.repositories;
        if(!Array.isArray(repos))return error('github_listing_invalid',502);
        for(const repo of repos){
          if(!safeRepo(repo.full_name))continue;
          all.set(repo.full_name,{
            fullName:repo.full_name,defaultBranch:repo.default_branch,
            private:Boolean(repo.private),
            canPush:contentsWrite && Boolean(repo.permissions?.push||repo.permissions?.admin),
          });
        }
        if(part===10&&Number(result.data.total_count||0)>1000)
          return error('github_repo_listing_too_large',409);
        if(repos.length<100)break;
      }
    }
    const ordered=[...all.values()].sort((a,b)=>a.fullName.localeCompare(b.fullName));
    if(ordered.length>1000)return error('github_repo_listing_too_large',409);
    const start=(page-1)*100;
    return json({ok:true,repositories:ordered.slice(start,start+100),
      nextPage:ordered.length>start+100?page+1:null,truncated:false});
  }
  const repo=String(sp.get('repo')||'');
  const branch=String(sp.get('branch')||'');
  if(!safeRepo(repo)||!safeBranch(branch))return error('github_repository_and_branch_required');
  const filePath=String(sp.get('path')||'');
  if(filePath && !safePath(filePath))return error('github_path_invalid');
  const urlPath='/repos/'+repo+'/contents'+(filePath?'/'+toPath(filePath):'');
  if(url.pathname.endsWith('/tree')){
    if(method!=='GET')return error('method_not_allowed',405);
    const result=await requestProvider(fetchImpl,token,urlPath+'?ref='+encodeURIComponent(branch));
    if(!result.ok)return error(result.code,result.status);
    if(!Array.isArray(result.data))return error('github_folder_expected',400);
    return json({ok:true,entries:result.data.filter(x=>['file','dir'].includes(x.type)&&safePath(x.path)).map(x=>({
      id:x.path,name:x.name,kind:x.type==='dir'?'folder':'file',size:Number(x.size||0),
      version:x.sha||null,
    }))});
  }
  if(!filePath)return error('github_file_path_required');
  if(method==='GET'){
    const result=await requestProvider(fetchImpl,token,urlPath+'?ref='+encodeURIComponent(branch));
    if(!result.ok)return error(result.code,result.status);
    const file=result.data;
    if(!file || file.type!=='file' || file.encoding!=='base64' || !/^[a-f0-9]{40}$/i.test(file.sha||''))
      return error('github_text_file_unavailable',415);
    if(Number(file.size||0)>MAX_BYTES)return error('file_too_large',413);
    try{return json({ok:true,file:{id:file.path,name:file.name,content:decodeText(file.content||''),
      version:file.sha,readonly:false}});}
    catch(e){return error(e.message==='file_too_large'?'file_too_large':'binary_file_not_editable',e.message==='file_too_large'?413:415);}
  }
  if(method!=='PUT')return error('method_not_allowed',405);
  let body;
  try{body=await request.json();}catch{return error('invalid_json');}
  if(typeof body.content!=='string'||!(/^[a-f0-9]{40}$/i.test(body.expectedSha||''))||
      body.branch!==branch || body.path!==filePath)return error('github_version_required');
  let encoded;
  try{encoded=encodeText(body.content);}catch{return error('file_too_large',413);}
  const result=await requestProvider(fetchImpl,token,urlPath,'PUT',{
    message:'Edit '+filePath+' via AgentSam IDE',
    content:encoded,sha:body.expectedSha,branch,
  });
  if(!result.ok)return error(result.code,result.status===422?409:result.status);
  const version=result.data?.content?.sha;
  if(!/^[a-f0-9]{40}$/i.test(version||''))return error('github_write_unverified',502);
  return json({ok:true,file:{id:filePath,name:filePath.split('/').at(-1),content:body.content,version,readonly:false}});
}
