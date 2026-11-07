/** Remote sources use the shared IDE's FileWorkspace contract, not a new editor. */
import type { FileWorkspace, WorkspaceEntry, WorkspaceFile } from '@inneranimalmedia/agentsam-ide/workspace';
import { languageFromPath } from '@/lib/utils';
import { invokeStudioService, isPackagedDesktop, resolveDesktopStudioAccountId } from '@/lib/desktop/tauri';

export type IDESourceDiscovery = {
  ok: true;
  googleDrive: Array<{account:string;label:string}>;
  cloudflare: Array<{account:string;label:string;scopes:string[]}>;
};
type RemoteEntry = {id:string; name:string; kind:'file'|'folder'; mimeType?:string; size?:number};
type RemoteListing = {ok:true;entries:RemoteEntry[];nextPageToken?:string|null;cursor?:string|null;truncated?:boolean};
type RemoteFile = {ok:true;file:{id:string;name:string;content:string;version:string;readonly:true;mimeType:string;note?:string}};
type Buckets = {ok:true;buckets:Array<{name:string;jurisdiction:string}>;cursor?:string|null};
type Containers = {ok:true;applications:Array<{id:string;name:string;instances?:unknown}>;filesystemAvailable:false;note:string};
type ErrorResponse = {ok:false;error:string};

export async function remoteIdeRequest<T>(url:string):Promise<T> {
  if(!url.startsWith('/api/work/ide/'))throw Error('remote_ide_path_invalid');
  if(isPackagedDesktop()) {
    const accountId=await resolveDesktopStudioAccountId();
    const response=await invokeStudioService({operation:'work',account_id:accountId,method:'GET',path:url});
    let body: T | ErrorResponse;
    try {body=JSON.parse(response.body) as T;} catch{throw Error('ide_remote_invalid_response');}
    if(!response.ok||(body as ErrorResponse).ok===false)throw Error((body as ErrorResponse).error||'ide_remote_unavailable');
    return body as T;
  }
  const response=await fetch(url,{method:'GET',credentials:'same-origin',headers:{accept:'application/json'}});
  const body=await response.json().catch(()=>({ok:false,error:'ide_remote_invalid_response'})) as T & ErrorResponse;
  if(!response.ok||body.ok===false)throw Error(body.error||'ide_remote_unavailable');
  return body;
}
export function discoverIDESources(){return remoteIdeRequest<IDESourceDiscovery>('/api/work/ide/sources');}
export function listIDER2Buckets(account:string) {
  return remoteIdeRequest<Buckets>('/api/work/ide/r2/buckets?account='+encodeURIComponent(account));
}
export function listIDEContainers(account:string) {
  return remoteIdeRequest<Containers>('/api/work/ide/containers/applications?account='+encodeURIComponent(account));
}

export type RemoteIDESelection = {source:'drive'|'r2';account:string;bucket?:string;jurisdiction?:string};
function safeSegment(name:string) {
  const plain=name.replace(/[\\/<>{}:|?*"\x00-\x1f]/g,'_');
  return encodeURIComponent(plain).slice(0,90);
}
function identityHash(s:string) {
  let n=2166136261;
  for(let i=0;i<s.length;i++){n^=s.charCodeAt(i);n=Math.imul(n,16777619);}
  return (n>>>0).toString(16);
}
function disabled():never {throw Error('This provider is read-only until version-safe writes are supported.');}
export function createRemoteIDEWorkspace(selection:RemoteIDESelection):FileWorkspace {
  const nodes=new Map<string,{id:string;kind:'file'|'folder';displayName:string}>();
  const base = selection.source==='drive'
    ? '/api/work/ide/drive/'
    : '/api/work/ide/r2/';
  async function list(directory?:string):Promise<WorkspaceEntry[]> {
    const parent=directory?.replace(/\/$/,'')||'';
    const remoteParent=parent?nodes.get(parent):null;
    if(parent&&(!remoteParent||remoteParent.kind!=='folder'))throw Error('Selected provider folder is unavailable.');
    const request=(cursor:string)=> {
      if(selection.source==='drive'){
        const params=new URLSearchParams({account:selection.account,folder:remoteParent?.id||'root'});
        if(cursor)params.set('page',cursor);
        return remoteIdeRequest<RemoteListing>(base+'files?'+params);
      }
      const params=new URLSearchParams({account:selection.account,bucket:selection.bucket||'',prefix:remoteParent?.id||''});
      if(selection.jurisdiction)params.set('jurisdiction',selection.jurisdiction);
      if(cursor)params.set('cursor',cursor);
      return remoteIdeRequest<RemoteListing>(base+'objects?'+params);
    };
    const entries:WorkspaceEntry[]=[];
    const seen=new Set<string>();
    let cursor='';
    for(let page=0;page<10;page++){
      const result=await request(cursor);
      for(const item of result.entries){
        if(!item.id||!item.name || !['file','folder'].includes(item.kind))continue;
        const path=(parent?parent+'/':'')+safeSegment(item.name)+'~'+identityHash(item.id);
        if(seen.has(path))continue;
        seen.add(path);
        nodes.set(path,{id:item.id,kind:item.kind,displayName:item.name});
        entries.push({path,kind:item.kind,displayName:item.name,readonly:true,language:languageFromPath(item.name),size:item.size});
      }
      cursor=selection.source==='drive'?result.nextPageToken||'':result.cursor||'';
      if(!cursor) return entries;
    }
    throw Error('Provider folder contains more than 1,000 entries. Narrow your selection; results were not partially loaded.');
  }
  const read=async(path:string):Promise<WorkspaceFile>=>{
    const item=nodes.get(path);
    if(!item||item.kind!=='file')throw Error('Select a file in the authorized provider tree.');
    const params=new URLSearchParams({account:selection.account});
    if(selection.source==='drive')params.set('id',item.id);
    else {params.set('bucket',selection.bucket||'');params.set('key',item.id);if(selection.jurisdiction)params.set('jurisdiction',selection.jurisdiction);}
    const result=await remoteIdeRequest<RemoteFile>(base+'file?'+params);
    return {path,content:result.file.content,version:result.file.version,
      language:languageFromPath(item.displayName),displayName:item.displayName,readonly:true,canRename:false,canDelete:false};
  };
  return {
    list, read,
    async write(){return {ok:false,code:'readonly',message:'Provider conditional-write protection has not been validated.'};},
    async create(){return disabled();},async rename(){return disabled();},async delete(){return disabled();},
    async search(){return disabled();},async history(){return disabled();},async restore(){return disabled();},
    configuration:{readonly:true},
  };
}
