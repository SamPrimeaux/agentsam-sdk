import { assertWorkspaceFile, normalizeWorkspacePath, type FileWorkspace, type WorkspaceEntry, type WorkspaceFile, type WorkspaceWriteResult, type WorkspaceDiagnostic } from '@inneranimalmedia/agentsam-ide/workspace';

type PageSection = { key:string; html:string; name?:string };
type ProjectPage = { slug:string; title:string; template:string; sections:PageSection[]; assetBase?:string };
type ProjectExtraFile = { path:string; content:string };
type ThemeProject = {
  id:string; name:string; revision:number; pages:ProjectPage[];
  tokens?:Record<string,string>;
  files?:ProjectExtraFile[];
  directories?:string[];
  [key:string]:unknown;
};

const validId=/^[A-Za-z0-9_-]{1,160}$/;
const pathForPage=(slug:string)=>'pages/'+slug+'/index.html';
const pathForSection=(slug:string,key:string)=>'pages/'+slug+'/sections/'+key+'.html';
const tokensPath='settings/tokens.json';

const fileContent=(project:ThemeProject,path:string):string|undefined=>{
  if(path===tokensPath)return JSON.stringify(project.tokens||{},null,2)+'\n';
  for(const page of project.pages){
    if(path===pathForPage(page.slug))return page.template;
    for(const section of page.sections)if(path===pathForSection(page.slug,section.key))return section.html;
  }
  return project.files?.find(item=>item.path===path)?.content;
};
const updateContent=(project:ThemeProject,path:string,content:string)=>{
  if(path===tokensPath){
    const tokens=JSON.parse(content) as unknown;
    if(!tokens||Array.isArray(tokens)||typeof tokens!=='object')throw Error('Design tokens must be a JSON object.');
    for(const [name,value] of Object.entries(tokens)){
      if(!/^--[a-zA-Z0-9-]+$/.test(name)||typeof value!=='string')throw Error('Tokens must map CSS variable names to strings.');
    }
    project.tokens=tokens as Record<string,string>;return;
  }
  for(const page of project.pages){
    if(path===pathForPage(page.slug)){page.template=content;return;}
    for(const section of page.sections)if(path===pathForSection(page.slug,section.key)){section.html=content;return;}
  }
  const extra=project.files?.find(item=>item.path===path);
  if(!extra)throw Error('File was removed or is not part of this project.');
  extra.content=content;
};
const isBuiltIn=(path:string,project:ThemeProject)=>path===tokensPath||
  project.pages.some(page=>path===pathForPage(page.slug)||page.sections.some(s=>path===pathForSection(page.slug,s.key)));
const hash=async(text:string)=>{
  const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return Array.from(new Uint8Array(data),byte=>byte.toString(16).padStart(2,'0')).join('');
};
const readonlyFile=(project:ThemeProject,path:string)=>({ canRename:!isBuiltIn(path,project), canDelete:!isBuiltIn(path,project) });
const asFile=async(project:ThemeProject,path:string):Promise<WorkspaceFile>=>{
  const content=fileContent(project,path);
  if(content===undefined)throw Error('File not found.');
  return assertWorkspaceFile({
    path,content,version:await hash(content),eol:content.includes('\r\n')?'CRLF':'LF',
    encoding:'UTF-8',...readonlyFile(project,path),
  });
};
const paths=(project:ThemeProject)=>{
  const values=[tokensPath,...project.pages.flatMap(page=>[
    pathForPage(page.slug),...page.sections.map(section=>pathForSection(page.slug,section.key)),
  ]),...(project.files||[]).map(file=>file.path)];
  return [...new Set(values)].sort();
};
const entries=(project:ThemeProject):WorkspaceEntry[]=>{
  const directories=new Set<string>(project.directories||[]);
  for(const path of paths(project)){
    const parts=path.split('/');
    for(let i=1;i<parts.length;i++)directories.add(parts.slice(0,i).join('/'));
  }
  return [
    ...[...directories].sort().map(path=>({path,kind:'folder' as const})),
    ...paths(project).map(path=>({path,kind:'file' as const})),
  ];
};

export function createCmsThemeFileWorkspace(projectId:string,siteId?:string,scope:'site'|'studio'='site'):FileWorkspace{
  const studio=scope==='studio';
  if(!validId.test(projectId)||(!studio&&!validId.test(siteId||'')))throw Error('Select an authorized theme workspace.');
  const base='/api/admin/cms/theme-projects/'+encodeURIComponent(projectId);
  const query=studio?'scope=studio':'site_id='+encodeURIComponent(siteId||'');
  const scopeBody=studio?{scope:'studio'}:{site_id:siteId};
  const request=async(url:string,init:RequestInit={}):Promise<Record<string,any>>=>{
    const response=await fetch(url,{credentials:'include',cache:'no-store',...init});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||result.ok!==true){
      const error=new Error(result.error||'Operation failed ('+response.status+')') as Error & {status?:number};
      error.status=response.status;throw error;
    }
    return result;
  };
  const get=async():Promise<ThemeProject>=>{
    const payload=await request(base+'?'+query);
    return payload.project as ThemeProject;
  };
  const commit=async(project:ThemeProject):Promise<ThemeProject>=>{
    const payload=await request(base+'?'+query,{
      method:'PUT',headers:{'content-type':'application/json'},
      body:JSON.stringify({...scopeBody,project,expected_version:project.revision}),
    });
    return payload.project as ThemeProject;
  };
  const retryOperation=async(operation:(p:ThemeProject)=>void)=>{
    for(let count=0;count<2;count++){
      const project=await get();
      operation(project);
      try{return await commit(project);}
      catch(e){if((e as {status?:number}).status!==409||count===1)throw e;}
    }
    throw Error('Could not save the file.');
  };
  const validate=async(path:string,content:string):Promise<WorkspaceDiagnostic[]>=>{
    const found:WorkspaceDiagnostic[]=[];
    if(path.endsWith('.json')){
      try{JSON.parse(content);}catch(e){found.push({path,severity:'error',message:e instanceof Error?e.message:String(e),blocksSave:true});}
    }
    if(path.endsWith('.html')&&(!content.trim()||!/<[a-z!/]/i.test(content))){
      found.push({path,severity:'error',message:'The file must contain HTML markup.',blocksSave:true});
    }
    return found;
  };
  const write:FileWorkspace['write']=async(path,content,expectedVersion,options={}):Promise<WorkspaceWriteResult>=>{
    path=normalizeWorkspacePath(path);
    const validation=await validate(path,content);
    if(validation.some(item=>item.blocksSave))return{ok:false,code:'validation',message:validation[0].message,diagnostics:validation};
    try{
      for(let attempt=0;attempt<2;attempt++){
        const project=await get();
        const before=fileContent(project,path);
        if(before===undefined)return{ok:false,code:'unavailable',message:'The file no longer exists.'};
        if(!options.overwrite&&await hash(before)!==expectedVersion){
          return{ok:false,code:'version_conflict',message:'This file changed elsewhere.',current:await asFile(project,path)};
        }
        if(path.endsWith('/index.html')){
          const page=project.pages.find(item=>path===pathForPage(item.slug));
          if(page&&page.sections.some(section=>!content.includes('<!--theme-section:'+section.key+'-->')))
            return{ok:false,code:'validation',message:'The template must preserve its existing section placements.'};
        }
        updateContent(project,path,content);
        try{const saved=await commit(project);return{ok:true,file:await asFile(saved,path)};}
        catch(e){
          if((e as {status?:number}).status!==409||attempt===1)throw e;
        }
      }
      return{ok:false,code:'version_conflict',message:'Another editor changed the project.'};
    }catch(e){
      const status=(e as {status?:number}).status;
      return{ok:false,code:status===409?'version_conflict':status===403?'permission':'unavailable',
        message:e instanceof Error?e.message:String(e)};
    }
  };
  return {
    async list(){return entries(await get());},
    async read(path){return asFile(await get(),normalizeWorkspacePath(path));},
    write,
    async create(path,kind){
      path=normalizeWorkspacePath(path,kind);
      await retryOperation(project=>{
        if(kind==='folder'){
          project.directories=[...new Set([...(project.directories||[]),path])];
        }else{
          if(fileContent(project,path)!==undefined)throw Error('A file with this name already exists.');
          project.files=[...(project.files||[]),{path,content:''}];
        }
      });
      return{path,kind};
    },
    async rename(path,destination){
      path=normalizeWorkspacePath(path);destination=normalizeWorkspacePath(destination);
      await retryOperation(project=>{
        if(isBuiltIn(path,project))throw Error('This core file cannot be renamed; edit its contents instead.');
        if(fileContent(project,destination)!==undefined)throw Error('A file already exists at that path.');
        const source=project.files?.find(item=>item.path===path);
        if(!source)throw Error('File not found.');
        source.path=destination;
      });
      return{path:destination,kind:'file'};
    },
    async delete(path,expectedVersion){
      path=normalizeWorkspacePath(path);
      const project=await get();
      if(isBuiltIn(path,project))throw Error('Core theme files cannot be deleted.');
      const existing=fileContent(project,path);
      if(existing===undefined)throw Error('File not found.');
      if(expectedVersion&&await hash(existing)!==expectedVersion)throw Error('File has changed. Reload before deleting.');
      project.files=(project.files||[]).filter(item=>item.path!==path);
      await commit(project);
    },
    async search(query){
      if(!query.trim())return[];
      const project=await get();
      const hits:Awaited<ReturnType<FileWorkspace['search']>>=[];
      for(const path of paths(project)){
        const content=fileContent(project,path)||'';
        content.split(/\r?\n/).forEach((line,index)=>{
          const column=line.toLowerCase().indexOf(query.toLowerCase());
          if(column>=0&&hits.length<100)hits.push({path,line:index+1,column:column+1,preview:line.trim().slice(0,160)});
        });
      }
      return hits;
    },
    async history(path){
      normalizeWorkspacePath(path);
      const result=await request(base+'/history?'+query);
      return(result.revisions||[]).map((entry:{id:string;version:string;created_at:string;kind:string})=>({
        id:entry.id,path,version:entry.version,createdAt:entry.created_at,label:'Revision '+entry.id,
      }));
    },
    async restore(path,revisionId,expectedVersion){
      path=normalizeWorkspacePath(path);
      if(!/^\d{1,10}$/.test(revisionId))return{ok:false,code:'validation',message:'Invalid revision.'};
      const snapshot=await request(base+'/history/'+revisionId+'?'+query);
      const text=fileContent(snapshot.project as ThemeProject,path);
      if(text===undefined)return{ok:false,code:'unavailable',message:'This file did not exist in that revision.'};
      return write(path,text,expectedVersion);
    },
    validate,
  };
}
