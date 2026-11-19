/**
 * User-authorized browser File System Access adapter for the canonical IDE.
 *
 * This is for Chromium web/PWA only. Tauri WebKit uses the authenticated native
 * runtime instead. A folder picker is a required user gesture; no guessed roots.
 * Browser FSA does not provide atomic CAS, revisions, PTY or LSP.
 */
import { normalizeWorkspacePath, type FileWorkspace, type WorkspaceEntry, type WorkspaceFile, type WorkspaceSearchHit, type WorkspaceWriteResult } from './files.js';
import { languageIdFromPath } from '../monaco/model.js';

type PermissionState = 'granted'|'prompt'|'denied';
type BrowserDir = FileSystemDirectoryHandle & {
  entries():AsyncIterableIterator<[string,FileSystemHandle]>;
  queryPermission?(options:{mode:'readwrite'}):Promise<PermissionState>;
  requestPermission?(options:{mode:'readwrite'}):Promise<PermissionState>;
};
const MAX_TEXT_BYTES=3*1024*1024;
const MAX_SEARCH_FILES=180;
const ALLOWED_SEARCH=/\.(tsx?|jsx?|mjs|cjs|html?|css|json|mdx?|txt|py|sql|ya?ml|toml|rs|go)$/i;
const isFolder=(h:FileSystemHandle):h is FileSystemDirectoryHandle=>h.kind==='directory';
// Browser-origin handles stay in this device's IndexedDB, keyed by verified user.
const FSA_DB='agentsam-ide-folders-v1',FSA_STORE='handles';
function accountKey(scopeKey:string):string{
  if(!scopeKey.trim())throw new Error('A verified account is required to remember a browser folder.');
  return 'account:'+scopeKey.trim();
}
function nameKey(scope:string):string{return 'agentsam.ide.fsa.name.'+scope;}
async function openDb():Promise<IDBDatabase|null>{
  if(typeof indexedDB==='undefined')return null;
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(FSA_DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(FSA_STORE))req.result.createObjectStore(FSA_STORE);};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function loadHandle(scope:string):Promise<BrowserDir|null>{
  try{
    const db=await openDb();if(!db)return null;
    try{return await new Promise<BrowserDir|null>((resolve,reject)=>{
      const req=db.transaction(FSA_STORE,'readonly').objectStore(FSA_STORE).get(scope);
      req.onsuccess=()=>resolve(req.result?.kind==='directory'?req.result as BrowserDir:null);
      req.onerror=()=>reject(req.error);
    });}finally{db.close();}
  }catch{return null;}
}
async function rememberHandle(scope:string,handle:BrowserDir):Promise<void>{
  try{localStorage.setItem(nameKey(scope),handle.name);}catch{}
  try{
    const db=await openDb();if(!db)return;
    try{await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction(FSA_STORE,'readwrite');
      tx.objectStore(FSA_STORE).put(handle,scope);
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
    });}finally{db.close();}
  }catch{/* Private browsing may only retain a name hint. */}
}
export type BrowserFsaRestore={name:string;workspace:FileWorkspace|null;handle:FileSystemDirectoryHandle|null};
/** Query only on page load; never request permission without a click. */
export async function restoreBrowserFsaIDEWorkspace(scopeKey:string):Promise<BrowserFsaRestore|null>{
  if(!browserFsaAvailable())return null;
  const scope=accountKey(scopeKey),root=await loadHandle(scope);
  if(!root){
    let name='';try{name=localStorage.getItem(nameKey(scope))||'';}catch{}
    return name?{name,workspace:null,handle:null}:null;
  }
  if(typeof root.entries!=='function')return {name:root.name,workspace:null,handle:null};
  const granted=await root.queryPermission?.({mode:'readwrite'}).catch(()=>undefined);
  return {name:root.name,workspace:granted==='granted'?createBrowserFsaWorkspace(root):null,handle:root};
}
/** Call from a direct click, with the handle preloaded on mount. */
export async function reconnectBrowserFsaIDEWorkspace(scopeKey:string,handle:FileSystemDirectoryHandle|null):Promise<{name:string;workspace:FileWorkspace}>{
  if(!handle)return chooseBrowserFsaIDEWorkspace(scopeKey);
  const root=handle as BrowserDir;
  if(typeof root.entries!=='function')return unavailable('Stored folder handle cannot enumerate directories. Select it again.');
  const permission=await root.queryPermission?.({mode:'readwrite'});
  if(permission!=='granted'&&await root.requestPermission?.({mode:'readwrite'})!=='granted')
    return unavailable('Folder permission was not granted. Select the folder again.');
  await rememberHandle(accountKey(scopeKey),root);
  return {name:root.name,workspace:createBrowserFsaWorkspace(root)};
}


function checkedParts(path:string):string[] {
  return normalizeWorkspacePath(path).split('/');
}
async function directory(root:BrowserDir,path:string,create=false):Promise<BrowserDir> {
  let current=root;
  if(!path||path==='.')return current;
  for(const part of checkedParts(path))current=await current.getDirectoryHandle(part,{create}) as BrowserDir;
  return current;
}
async function fileHandle(root:BrowserDir,path:string,create=false):Promise<FileSystemFileHandle> {
  const parts=checkedParts(path);
  const parent=await directory(root,parts.slice(0,-1).join('/'));
  return parent.getFileHandle(parts.at(-1)!,{create});
}
async function sha256(bytes:ArrayBuffer):Promise<string> {
  const digest=await crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
function unavailable(message:string):never { throw new Error(message); }

export function browserFsaAvailable():boolean {
  return typeof window!=='undefined'
    && typeof (window as Window & {showDirectoryPicker?:unknown}).showDirectoryPicker==='function';
}

export async function chooseBrowserFsaIDEWorkspace(scopeKey:string):Promise<{name:string;workspace:FileWorkspace}> {
  if(!browserFsaAvailable())return unavailable('Browser folder access requires Chromium and a secure origin. Use the native Local Studio runtime on desktop.');
  const picker=window as unknown as Window & {showDirectoryPicker(options:{mode:'readwrite'}):Promise<BrowserDir>};
  const selected=await picker.showDirectoryPicker({mode:'readwrite'});
  if(!selected||selected.kind!=='directory')return unavailable('No folder selected.');
  // The native kind discriminant narrows away the extra Chromium FSA methods.
  // Verify enumeration before restoring the richer browser directory contract.
  if(typeof (selected as BrowserDir).entries!=='function')
    return unavailable('This browser cannot enumerate the selected directory.');
  const root=selected as BrowserDir;
  const permission=await root.queryPermission?.({mode:'readwrite'});
  if(permission && permission!=='granted' && await root.requestPermission?.({mode:'readwrite'})!=='granted')
    return unavailable('The selected folder did not grant read/write access.');
  await rememberHandle(accountKey(scopeKey),root);
  return {name:root.name,workspace:createBrowserFsaWorkspace(root)};
}

/** Exported for explicit, authorized handles and small deterministic integration tests. */
export function createBrowserFsaWorkspace(root:BrowserDir):FileWorkspace {
  async function read(path:string):Promise<WorkspaceFile> {
    const name=normalizeWorkspacePath(path);
    const handle=await fileHandle(root,name);
    const file=await handle.getFile();
    if(file.size>MAX_TEXT_BYTES)return unavailable('File exceeds the 3 MiB editable-text limit.');
    const bytes=await file.arrayBuffer();
    const content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    return {path:name,content,version:await sha256(bytes),language:languageIdFromPath(name),canRename:false,canDelete:true};
  }
  const api:FileWorkspace={
    async list(path='.') {
      const target=await directory(root,path);
      const entries:WorkspaceEntry[]=[];
      for await(const [name,handle] of target.entries()){
        if(!name||name==='.'||name==='..'||name.includes('/'))continue;
        const rel=(path==='.'||!path?'':path+'/')+name;
        entries.push({path:rel,kind:isFolder(handle)?'folder':'file',displayName:name,
          ...(isFolder(handle)?{}:{language:languageIdFromPath(rel)})});
        if(entries.length>5000)return unavailable('Folder contains more than 5,000 entries. Open a smaller directory.');
      }
      return entries.sort((a,b)=>a.kind===b.kind?a.path.localeCompare(b.path):a.kind==='folder'?-1:1);
    },
    read,
    async write(path,content,expectedVersion,options):Promise<WorkspaceWriteResult> {
      try{
        if(!expectedVersion&&!options?.overwrite)return {ok:false,code:'missing_version',message:'Read the saved file before writing.'};
        const current=await read(path);
        if(!options?.overwrite&&current.version!==expectedVersion)
          return {ok:false,code:'version_conflict',message:'File changed on disk. Reload or compare before saving.',current};
        if(new TextEncoder().encode(content).byteLength>MAX_TEXT_BYTES)
          return {ok:false,code:'file_too_large',message:'File exceeds the 3 MiB text limit.'};
        const handle=await fileHandle(root,path);
        // Chromium FSA has no atomic compare-and-swap. Manual Save only, with
        // a current-disk preflight and verified readback; no silent autosave.
        const writer=await handle.createWritable({keepExistingData:false});
        try{await writer.write(content);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}
        const saved=await read(path);
        if(saved.content!==content)return {ok:false,code:'write_unverified',message:'File write did not match the text after readback.'};
        return {ok:true,file:saved};
      }catch(error){return {ok:false,code:'offline',message:error instanceof Error?error.message:String(error)};}
    },
    async create(path,kind) {
      const parts=checkedParts(path);
      const parent=await directory(root,parts.slice(0,-1).join('/'));
      if(kind==='folder')await parent.getDirectoryHandle(parts.at(-1)!,{create:true});
      else await parent.getFileHandle(parts.at(-1)!,{create:true});
      return {path,kind};
    },
    async rename(){
      return unavailable('Browser FSA does not offer a verified atomic rename here. Use the authorized native workspace or repository provider.');
    },
    async delete(path,expectedVersion){
      if(!expectedVersion)return unavailable('A saved file version is required before delete.');
      const current=await read(path);
      if(current.version!==expectedVersion)return unavailable('Delete refused: the file changed on disk.');
      const parts=checkedParts(path);
      const parent=await directory(root,parts.slice(0,-1).join('/'));
      await parent.removeEntry(parts.at(-1)!,{recursive:false});
    },
    async search(query) {
      const needle=query.trim().toLowerCase();
      if(!needle)return [];
      const hits:WorkspaceSearchHit[]=[];
      const stack=['.'];let searched=0;
      while(stack.length){
        const prefix=stack.pop()!;
        for(const entry of await api.list(prefix)){
          if(entry.kind==='folder'){stack.push(entry.path);continue;}
          if(!ALLOWED_SEARCH.test(entry.path))continue;
          if(++searched>MAX_SEARCH_FILES)return unavailable('More than 180 text files: use the indexed host search provider.');
          let text:string;try{text=(await read(entry.path)).content;}catch{continue;}
          text.split(/\r?\n/).forEach((line,index)=>{
            const column=line.toLowerCase().indexOf(needle);
            if(column>=0&&hits.length<100)hits.push({path:entry.path,line:index+1,column:column+1,preview:line.slice(0,200)});
          });
        }
      }
      return hits;
    },
    async history(){return unavailable('Browser folder permissions do not include version history. Connect a Git-backed runtime for history.');},
    async restore(){return unavailable('Browser folder permissions do not include revision restoration.');},
    configuration:{manualSave:true,supportedLanguages:['typescript','javascript','html','css','json','markdown','python','sql']},
  };
  return api;
}
