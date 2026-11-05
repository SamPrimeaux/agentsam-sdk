import { useEffect, useMemo, useState } from 'react';
import { WorkspaceEditor } from '@inneranimalmedia/agentsam-ide/surface';
import '@inneranimalmedia/agentsam-ide/surface/workspace-editor.css';
import { createCmsThemeFileWorkspace } from './CmsThemeFileWorkspace';
import { isPackagedDesktop } from '@/lib/desktop/tauri';

const idPattern=/^[A-Za-z0-9_-]{1,160}$/;

export function CmsThemeCodeEditor({ projectId, siteId }: { projectId:string; siteId:string }) {
  const [name,setName]=useState('Code editor');
  const [error,setError]=useState('');
  const workspace=useMemo(()=>idPattern.test(projectId)&&idPattern.test(siteId)
    ?createCmsThemeFileWorkspace(projectId,siteId):null,[projectId,siteId]);
  useEffect(()=>{
    if(!workspace)return;
    const controller=new AbortController();
    const url='/api/admin/cms/theme-projects/'+encodeURIComponent(projectId)+'?site_id='+encodeURIComponent(siteId);
    void fetch(url,{credentials:'include',signal:controller.signal,cache:'no-store'})
      .then(async response=>{
        const data=await response.json();
        if(!response.ok||data.ok!==true)throw Error(data.error||'Theme unavailable');
        if(!controller.signal.aborted)setName(data.project?.name||'Code editor');
      }).catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:String(cause));});
    return()=>controller.abort();
  },[workspace,projectId,siteId]);
  if(!workspace)return <p role="alert" className="p-6">Choose a website and installed theme to edit.</p>;
  if(error)return <p role="alert" className="p-6">{error}</p>;
  const goBack=()=>{
    const query=new URLSearchParams({
      page:'/admin/theme-project-editor',
      project:projectId,
      site_id:siteId,
    });
    const route='/apps/ecommerce-cms-agentsam?'+query.toString();
    if (isPackagedDesktop()) window.location.hash='#'+route;
    else window.location.assign(route);
  };
  return <div className="h-full min-h-0 w-full" data-theme-code-editor>
    <WorkspaceEditor workspace={workspace} workspaceId={siteId+':'+projectId} label={name}
      onExit={goBack}/>
  </div>;
}
