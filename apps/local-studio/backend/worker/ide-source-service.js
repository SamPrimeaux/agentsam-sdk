/**
 * Authorized remote IDE source browse/read adapters.
 *
 * OAuth/token material stays on the Worker. No backend-key or workspace-root
 * parameters are accepted from clients. Multi-account selection is explicit.
 * Provider remote files are READ-ONLY until an atomic conditional-write contract
 * is validated for that provider; never call an unchecked PUT from Monaco.
 */
import { resolveConnectorAccess, connectorStatus } from './connector-oauth.js';
import {
  listCloudflareConnectionRecords,
  resolveCloudflareCredential,
} from '../../../../packages/connectors/cfoa/src/credential.js';

const CF_API = 'https://api.cloudflare.com/client/v4';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const MAX_TEXT_BYTES = 1024 * 1024;
const DRIVE_SCOPE = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.readonly',
];

function json(payload, status=200) {
  return Response.json(payload, { status, headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
function error(code, status=400) { return json({ok:false,error:code},status); }
const sanitize = v => String(v || '').trim();
const accountOk = v => /^[a-f0-9]{32}$/i.test(sanitize(v));
const driveIdOk = v => /^[A-Za-z0-9_-]{1,180}$/.test(sanitize(v));
const bucketOk = v => /^[A-Za-z0-9][A-Za-z0-9._-]{2,62}$/.test(sanitize(v));
const sourcePathOk = v => typeof v === 'string' && !v.includes('\0') && v.length < 1024 && !v.startsWith('/') && !v.split('/').some(part => part === '..');
function textType(mime, name='') {
  const type = sanitize(mime).toLowerCase().split(';')[0];
  return /^(text\/|application\/(json|javascript|xml|x-yaml|yaml)|image\/svg\+xml)/.test(type)
    || /\.(css|html?|jsx?|tsx?|json|md|mdx|txt|py|go|rs|sql|yaml|yml|toml|svg|sh|xml|conf)$/i.test(name);
}
function safeId(v) { return driveIdOk(v) ? v : null; }
function encodeObjectKey(key) {
  // Cloudflare's object REST endpoint requires literal "/" in keys.
  return key.split('/').map(encodeURIComponent).join('/');
}
async function boundedText(response) {
  if (Number(response.headers.get('content-length') || 0) > MAX_TEXT_BYTES) throw Error('file_too_large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks=[]; let length=0;
  try {
    while(true) {
      const {value,done}=await reader.read();
      if(done)break;
      length+=value.byteLength;
      if(length>MAX_TEXT_BYTES) { await reader.cancel(); throw Error('file_too_large'); }
      chunks.push(value);
    }
    const all=new Uint8Array(length);let offset=0;
    for(const chunk of chunks) {all.set(chunk,offset);offset+=chunk.byteLength;}
    // Reject malformed UTF-8 instead of corrupting a binary artifact.
    return new TextDecoder('utf-8',{fatal:true}).decode(all);
  } finally {reader.releaseLock();}
}

export function isIdeSourceRequest(path) {
  return /^\/api\/work\/ide\/(sources|drive\/(files|file)|r2\/(buckets|objects|file)|containers\/applications)$/.test(path);
}

async function googleAccess(env, owner, account, fetchImpl) {
  if (!account || !account.includes('@') || account.length>320) return {error:'drive_account_selection_required',status:400};
  const auth=await resolveConnectorAccess(env,owner,'google_drive',account,{requiredScopes:DRIVE_SCOPE,fetchImpl});
  if(!auth.ok) return {error:auth.code,status:auth.code==='oauth_insufficient_scope'?403:401};
  return {token:auth.accessToken};
}

async function cfAccess(env, owner, account, required, fetchImpl) {
  if(!accountOk(account))return {error:'cloudflare_account_selection_required',status:400};
  const credential=await resolveCloudflareCredential({
    env,ownerId:owner,authMode:'oauth',explicitAccountId:account,fetchImpl
  });
  if(credential.status!=='ready' || !credential.bearerToken || credential.accountId!==account)
    return {error:credential.error||'cloudflare_oauth_required',status:401};
  const granted = credential.grantedScopes || [];
  if (!required.some(scope=>granted.includes(scope))) return {error:'cloudflare_permission_missing',status:403};
  return {token:credential.bearerToken};
}
async function providerJson(fetchImpl,url,token,extraHeaders={}) {
  const response=await fetchImpl(url,{headers:{authorization:'Bearer '+token,accept:'application/json',...extraHeaders}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok || data.error || data.success===false) {
    // Do not expose upstream provider response bodies or credential-bearing URLs.
    return {error:response.status===401?'provider_reconnect_required':response.status===403?'provider_permission_denied':'provider_request_failed',
      status:response.status>=400&&response.status<500?response.status:502};
  }
  return {data};
}

export function normalizeR2Listing(body) {
  const objects=Array.isArray(body.result) ? body.result : [];
  const prefixes=Array.isArray(body.result_info?.delimited) ? body.result_info.delimited : [];
  return {
    entries:[
      ...prefixes.filter(p=>sourcePathOk(p)).map(p=>({id:p,name:p.split('/').filter(Boolean).at(-1),kind:'folder',path:p})),
      ...objects.filter(v=>sourcePathOk(v.key)).map(v=>({id:v.key,name:v.key.split('/').at(-1),kind:'file',
        path:v.key,size:Number(v.size||0),version:v.etag||null,mimeType:v.http_metadata?.contentType||null})),
    ],
    cursor:body.result_info?.cursor||null,
    truncated:Boolean(body.result_info?.is_truncated),
  };
}

export async function handleIdeSourceRequest(request, env, owner, opts={}) {
  if(!owner) return error('unauthorized',401);
  const url=new URL(request.url);
  if(!isIdeSourceRequest(url.pathname)) return error('not_found',404);
  if(request.method!=='GET') return error('method_not_allowed',405);
  const f=opts.fetchImpl||fetch;
  const sp=url.searchParams;
  const account=sanitize(sp.get('account'));
  try {
    if(url.pathname.endsWith('/sources')) {
      const [drive,cf]=await Promise.all([
        connectorStatus(env,owner,'google_drive'),
        listCloudflareConnectionRecords(env,owner),
      ]);
      return json({ok:true,googleDrive:drive.map(x=>({account:x.accountIdentifier,label:x.accountLabel})),
        cloudflare:cf.filter(x=>x.status==='connected'&&accountOk(x.cloudflareAccountId))
          .map(x=>({account:x.cloudflareAccountId,label:x.accountLabel,scopes:x.scopes}))});
    }
    if(url.pathname.includes('/drive/')) {
      const auth=await googleAccess(env,owner,account,f);
      if(auth.error)return error(auth.error,auth.status);
      if(url.pathname.endsWith('/files')) {
        const folder=sanitize(sp.get('folder')||'root');
        if(folder!=='root'&&!safeId(folder))return error('drive_folder_invalid');
        const page=sp.get('page')||'';
        if(page&&(!/^[A-Za-z0-9_./=+\-]{1,1024}$/.test(page)))return error('drive_page_invalid');
        const query=new URL(DRIVE_API+'/files');
        query.searchParams.set('q', "'"+folder+"' in parents and trashed = false");
        query.searchParams.set('fields','nextPageToken,files(id,name,mimeType,size,version,modifiedTime,capabilities(canEdit,canDownload))');
        query.searchParams.set('pageSize','100');
        query.searchParams.set('orderBy','folder,name');
        if(page)query.searchParams.set('pageToken',page);
        const response=await providerJson(f,query,auth.token);
        if(response.error)return error(response.error,response.status);
        const files=Array.isArray(response.data.files)?response.data.files:[];
        return json({ok:true,entries:files.map(x=>({
          id:x.id,name:x.name,kind:x.mimeType==='application/vnd.google-apps.folder'?'folder':'file',
          mimeType:x.mimeType,size:Number(x.size||0),version:x.version?String(x.version):null,
          readonly:true,canDownload:x.capabilities?.canDownload!==false,
        })),nextPageToken:response.data.nextPageToken||null});
      }
      const id=safeId(sp.get('id'));
      if(!id)return error('drive_file_invalid');
      const metadataUrl=new URL(DRIVE_API+'/files/'+encodeURIComponent(id));
      metadataUrl.searchParams.set('fields','id,name,mimeType,size,version,capabilities(canDownload,canEdit)');
      const info=await providerJson(f,metadataUrl,auth.token);
      if(info.error)return error(info.error,info.status);
      const meta=info.data;
      if(meta.capabilities?.canDownload===false)return error('drive_download_not_permitted',403);
      if(!textType(meta.mimeType,meta.name) && !String(meta.mimeType).startsWith('application/vnd.google-apps.'))
        return error('binary_file_not_editable',415);
      if(Number(meta.size||0)>MAX_TEXT_BYTES)return error('file_too_large',413);
      const isNative=String(meta.mimeType).startsWith('application/vnd.google-apps.');
      if(isNative && !['application/vnd.google-apps.document'].includes(meta.mimeType))
        return error('drive_native_format_requires_specialized_editor',415);
      const contentUrl=isNative
        ? DRIVE_API+'/files/'+encodeURIComponent(id)+'/export?mimeType='+encodeURIComponent('text/plain')
        : DRIVE_API+'/files/'+encodeURIComponent(id)+'?alt=media';
      const response=await f(contentUrl,{headers:{authorization:'Bearer '+auth.token,accept:'text/plain'}});
      if(!response.ok)return error(response.status===403?'drive_download_not_permitted':'drive_download_failed',response.status===403?403:502);
      const content=await boundedText(response);
      return json({ok:true,file:{id,name:meta.name,content,mimeType:meta.mimeType,
        version:String(meta.version||'unversioned'),readonly:true,
        note:isNative?'Google Docs export (read-only text projection)':'Drive file (read-only until conditional writes are verified)'}});
    }
    const cf=await cfAccess(env,owner,account,
      url.pathname.includes('/containers')?['containers.read']:['workers-r2.read','workers-r2-bucket-item.read'],f);
    if(cf.error)return error(cf.error,cf.status);
    const base=CF_API+'/accounts/'+account;
    if(url.pathname.endsWith('/containers/applications')) {
      const response=await providerJson(f,base+'/containers/applications',cf.token);
      if(response.error)return error(response.error,response.status);
      const apps=Array.isArray(response.data.result)?response.data.result:[];
      return json({ok:true,applications:apps.map(app=>({id:app.id,name:app.name,instances:app.instances||null})),
        filesystemAvailable:false,note:'Container management permissions do not grant a file mount. Connect a scoped container filesystem runtime.'});
    }
    if(url.pathname.endsWith('/r2/buckets')) {
      const response=await providerJson(f,base+'/r2/buckets?per_page=100',cf.token);
      if(response.error)return error(response.error,response.status);
      return json({ok:true,buckets:(response.data.result?.buckets||[]).map(b=>({name:b.name,jurisdiction:b.jurisdiction||'default'})),
        cursor:response.data.result_info?.cursor||null});
    }
    const bucket=sanitize(sp.get('bucket'));
    const jurisdiction=sanitize(sp.get('jurisdiction')||'default');
    if(!['default','us','eu','fedramp','fedramp-high'].includes(jurisdiction))return error('r2_jurisdiction_invalid');
    if(!bucketOk(bucket))return error('r2_bucket_invalid');
    const bucketBase=base+'/r2/buckets/'+encodeURIComponent(bucket)+'/objects';
    if(url.pathname.endsWith('/r2/objects')) {
      const prefix=sp.get('prefix')||'';
      if(prefix&&!sourcePathOk(prefix))return error('r2_prefix_invalid');
      const query=new URL(bucketBase);
      query.searchParams.set('delimiter','/');
      query.searchParams.set('per_page','100');
      if(prefix)query.searchParams.set('prefix',prefix);
      if(sp.get('cursor'))query.searchParams.set('cursor',sp.get('cursor').slice(0,1024));
      const response=await providerJson(f,query,cf.token,
        jurisdiction==='default'?{}:{'cf-r2-jurisdiction':jurisdiction});
      if(response.error)return error(response.error,response.status);
      return json({ok:true,...normalizeR2Listing(response.data)});
    }
    const key=sp.get('key')||'';
    if(!key||!sourcePathOk(key))return error('r2_key_invalid');
    const response=await f(bucketBase+'/'+encodeObjectKey(key),{
      headers:{authorization:'Bearer '+cf.token,...(jurisdiction==='default'?{}:{'cf-r2-jurisdiction':jurisdiction})},
    });
    if(!response.ok)return error(response.status===404?'r2_object_not_found':'r2_read_failed',response.status===404?404:502);
    const mime=response.headers.get('content-type')||'';
    if(!textType(mime,key))return error('binary_file_not_editable',415);
    const content=await boundedText(response);
    const version=String(response.headers.get('etag')||'').replace(/^"|"$/g,'');
    if(!version)return error('r2_version_unavailable',409);
    return json({ok:true,file:{id:key,name:key.split('/').at(-1),content,mimeType:mime,
      version,readonly:true,note:'Cloudflare OAuth R2 text object; editing is read-only until conditional writes are proven.'}});
  } catch (e) {
    return error(['file_too_large','r2_version_unavailable'].includes(e?.message)?e.message:'ide_provider_unavailable',
      e?.message==='file_too_large'?413:502);
  }
}
