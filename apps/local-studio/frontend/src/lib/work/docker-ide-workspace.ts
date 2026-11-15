/**
 * Docker IDE host — uses the installed Tauri Docker bridge and existing
 * shared WorkspaceEditor. SSH/TLS remain configured Docker contexts on the
 * customer's own machine. No fake files or browser-socket access.
 */
import { getTauriInvoke, isPackagedDesktop } from '@/lib/desktop/tauri';
import type {
  FileWorkspace, WorkspaceEntry, WorkspaceFile, WorkspaceSearchHit,
  WorkspaceWriteResult, WorkspacePreview,
} from '@inneranimalmedia/agentsam-ide/workspace';

export type DockerContext = {name:string;current?:string;description?:string};
export type DockerContainer = {ID:string;Names:string;Image:string;State:string;Status:string};
type DockerAction = 'createContext'|'contexts'|'health'|'containers'|'images'|'logs'|'start'|'stop'|'restart'
  |'list'|'read'|'preview'|'write'|'create'|'mkdir'|'rename'|'delete';
type DockerResponse = {
  ok:boolean;contexts?:DockerContext[];containers?:DockerContainer[];
  entries?:WorkspaceEntry[];path?:string;content?:string;version?:string;
  contentBase64?:string;logs?:string;engine?:unknown;images?:unknown[];
};
export type DockerSelection = {context:string;container:string;root:string;allowWrites:boolean};

export async function dockerBridge(action:DockerAction, fields:Record<string,unknown> = {}):Promise<DockerResponse> {
  if(!isPackagedDesktop())throw Error('Docker requires an authorized Desktop runtime. Connect a device in Machines & Runtimes.');
  const invoke=getTauriInvoke();
  if(!invoke)throw Error('Native Docker bridge unavailable in this host.');
  const result=await invoke('docker_bridge',{request:{action,...fields}}) as DockerResponse;
  if(!result?.ok)throw Error('Docker operation was not confirmed by the native host.');
  return result;
}
export const listDockerContexts=async():Promise<DockerContext[]> =>
  (await dockerBridge('contexts')).contexts||[];
export const dockerEngineHealth=async(context:string):Promise<unknown> =>
  (await dockerBridge('health',{context})).engine;
export const listDockerContainers=async(context:string):Promise<DockerContainer[]> =>
  (await dockerBridge('containers',{context})).containers||[];
export const listDockerImages=async(context:string):Promise<unknown[]> =>
  (await dockerBridge('images',{context})).images||[];
export const dockerContainerLogs=async(context:string,container:string):Promise<string> =>
  (await dockerBridge('logs',{context,container})).logs||'';
export async function dockerContainerAction(context:string,container:string,action:'start'|'stop'|'restart',approved:boolean) {
  return dockerBridge(action,{context,container,approved});
}

function validate(selection:DockerSelection) {
  if(!selection.context || !selection.container || !selection.root?.startsWith('/') ||
    selection.root==='/' || selection.root.includes('..')) throw Error('Choose an engine, container and non-root workspace directory.');
}
function fileType(path:string):WorkspacePreview['kind']|null {
  const ext=path.split('.').pop()?.toLowerCase()||'';
  if(['png','jpg','jpeg','webp','gif','avif','bmp','ico','svg'].includes(ext))return 'image';
  if(['mp4','webm','mov','m4v','ogg'].includes(ext))return 'video';
  if(['mp3','wav','m4a','aac','flac','oga'].includes(ext))return 'audio';
  if(ext==='pdf')return 'pdf';
  return null;
}
function contentType(path:string):string {
  const ext=path.split('.').pop()?.toLowerCase();
  const types:Record<string,string>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',
    gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon',
    mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',m4v:'video/mp4',ogg:'video/ogg',
    mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac',flac:'audio/flac',oga:'audio/ogg',pdf:'application/pdf'};
  return types[ext||'']||'application/octet-stream';
}
function fromBase64(content:string):Uint8Array<ArrayBuffer> {
  const decoded=atob(content);
  const buffer=new ArrayBuffer(decoded.length);
  const bytes=new Uint8Array(buffer);
  for(let i=0;i<decoded.length;i++)bytes[i]=decoded.charCodeAt(i);
  return bytes;
}
function fileLanguage(path:string):string {
  const ext=path.split('.').pop()?.toLowerCase();
  const map:Record<string,string>={ts:'typescript',tsx:'typescript',js:'javascript',jsx:'javascript',
    md:'markdown',mdx:'markdown',html:'html',css:'css',json:'json',py:'python',rs:'rust',go:'go',sql:'sql',yml:'yaml',yaml:'yaml'};
  return map[ext||'']||'plaintext';
}
export function createDockerIDEWorkspace(selection:DockerSelection):FileWorkspace {
  validate(selection);
  const args={context:selection.context,container:selection.container,root:selection.root};
  const call=(action:DockerAction,fields:Record<string,unknown>={})=>dockerBridge(action,{...args,...fields});
  const read=async(path:string):Promise<WorkspaceFile>=>{
    const res=await call('read',{path});
    if(!res.version || typeof res.content!=='string')throw Error('Docker did not return a versioned text file.');
    return {path,content:res.content,version:res.version,language:fileLanguage(path)};
  };
  const source:FileWorkspace={
    async list(directory='.') {
      const res=await call('list',{path:directory});
      return (res.entries||[]).filter(item=>item.path&&['file','folder'].includes(item.kind));
    },
    read,
    async write(path,content,expectedVersion,options):Promise<WorkspaceWriteResult> {
      if(!selection.allowWrites)return {ok:false,code:'read_only',message:'Enable Docker file editing before saving.'};
      if(!expectedVersion&&!options?.overwrite)return {ok:false,code:'version_required',message:'Read the saved version first.'};
      // Container file writes always require CAS. Do not silently bypass the version guard.
      const version=expectedVersion || (await read(path)).version;
      try {
        const out=await call('write',{path,content,expectedVersion:version,approved:true});
        return {ok:true,file:{path,content,version:out.version||'',language:fileLanguage(path)}};
      }catch(e){return {ok:false,code:'docker_write_failed',message:String(e)};}
    },
    async create(path,kind):Promise<WorkspaceEntry> {
      if(!selection.allowWrites)throw Error('Docker file editing is disabled.');
      await call(kind==='folder'?'mkdir':'create',{path,content:'',approved:true});
      return {path,kind};
    },
    async rename(path,destination):Promise<WorkspaceEntry> {
      if(!selection.allowWrites)throw Error('Docker file editing is disabled.');
      const originParent=path.split('/').slice(0,-1).join('/');
      const targetParent=destination.split('/').slice(0,-1).join('/');
      if(originParent!==targetParent)throw Error('Move files within the same folder; cross-directory moves require a container-aware operation.');
      await call('rename',{path,destination:destination.split('/').at(-1),approved:true});
      return {path:destination,kind:'file'};
    },
    async delete(path,expectedVersion):Promise<void> {
      if(!selection.allowWrites)throw Error('Docker file editing is disabled.');
      const version=expectedVersion||(await read(path)).version;
      await call('delete',{path,expectedVersion:version,approved:true});
    },
    async search(query):Promise<WorkspaceSearchHit[]> {
      const all=await source.list('.');
      const textFiles=all.filter(e=>e.kind==='file' && /\.(tsx?|jsx?|html?|css|json|mdx?|txt|py|rs|go|sql|yaml|yml)$/i.test(e.path));
      if(textFiles.length>120)throw Error('Docker workspace is too large for unindexed text search.');
      const hits:WorkspaceSearchHit[]=[];
      for(const file of textFiles){
        let doc:WorkspaceFile;
        try{doc=await read(file.path);}catch{continue;}
        doc.content.split(/\r?\n/).forEach((line,index)=>{
          const column=query?line.toLowerCase().indexOf(query.toLowerCase()):-1;
          if(column>=0&&hits.length<100)hits.push({path:file.path,line:index+1,column:column+1,preview:line.slice(0,180)});
        });
        if(hits.length>=100)break;
      }
      return hits;
    },
    async history(){throw Error('Container filesystem does not expose revision history. Use repository history for versioned projects.');},
    async restore(){throw Error('Docker filesystem history is unavailable.');},
    async preview(path) {
      const kind=fileType(path);
      if(!kind)return null;
      const response=await call('preview',{path});
      if(!response.contentBase64)throw Error('Docker preview had no content.');
      const bytes=fromBase64(response.contentBase64);
      const url=URL.createObjectURL(new Blob([bytes],{type:contentType(path)}));
      return {kind,url,contentType:contentType(path),size:bytes.length,release:()=>URL.revokeObjectURL(url)};
    },
    configuration:{readonly:!selection.allowWrites,manualSave:true,
      supportedLanguages:['typescript','javascript','markdown','html','css','json','python','sql','rust','go']}
  };
  return source;
}
