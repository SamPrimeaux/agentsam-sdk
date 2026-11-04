/* Site-scoped editor entry. Sets its handshake before theme-editor.js runs. */
(function () {
  // Standalone documents get their own query. Embedded Local Studio uses an
  // about:srcdoc iframe, so the same authoritative route may instead be in
  // its same-origin parent under ?page=/admin/theme-editor?site_id=...
  function editorRouteParams() {
    const local=new URLSearchParams(location.search);
    try {
      if(window.parent===window)return local;
      const parent=window.parent;
      void parent.document; // Throws for cross-origin hosts.
      const outer=new URL(parent.location.href);
      const route=outer.searchParams.get('page');
      if(route){
        const inner=new URL(route,outer.origin);
        if(inner.origin===outer.origin &&
            (inner.pathname==='/admin/theme-editor' ||
             inner.pathname==='/ecommerce-cms-agentsam/admin/theme-editor')){
          for(const [name,value] of inner.searchParams){
            if(!local.has(name))local.set(name,value);
          }
        }
      }
      if(outer.pathname==='/apps/ecommerce-cms-agentsam' &&
          !local.has('site_id') && outer.searchParams.has('site_id'))
        local.set('site_id',outer.searchParams.get('site_id'));
    }catch{ /* Parent is a different origin; never read its site selection. */ }
    return local;
  }
  const params=editorRouteParams();
  // Explicit source-code and standalone showcase modes have their own host.
  if(params.has('source')||params.has('showcase'))return;
  const selectedSiteKey='agentsam.cms.selected-site.v1';
  function report(message) {
    const panel=document.createElement('section');
    panel.id='cms-theme-entry-error';
    panel.setAttribute('role','alert');
    panel.style.cssText='max-width:620px;margin:4rem auto;padding:2rem;border:1px solid #dddde6;border-radius:14px;background:#fff;color:#20202a;font:15px system-ui;';
    const title=document.createElement('h2');
    title.textContent='Unable to open Theme Editor';
    const description=document.createElement('p');
    description.textContent=message;
    const link=document.createElement('a');
    link.href='/admin/store';
    link.textContent='Open Online Store';
    panel.append(title,description,link);
    document.body?.replaceChildren(panel);
  }
  async function read(path) {
    const res=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
    if(!res.ok)throw Error('cms_request_'+res.status);
    const data=await res.json();
    if(data.ok===false)throw Error(data.error||'cms_request_invalid');
    return data;
  }
  window.__agentsamThemeEditorEntryReady=(async () => {
    try {
      const {chooseThemeEditorSite,planThemeEditorEntry}=await import('/admin/js/theme-editor-entry-resolution.mjs');
      const inventory=await read('/api/admin/cms/sites');
      let rememberedSiteId='';
      try {rememberedSiteId=sessionStorage.getItem(selectedSiteKey)||'';}catch {}
      const scope=chooseThemeEditorSite({
        sites:inventory.sites||[],
        requestedSiteId:params.get('site_id')||'',
        rememberedSiteId,
      });
      if(scope.kind!=='site'){
        if(scope.reason==='site_not_owned'||scope.reason==='invalid_site_id'){
          report('The requested website does not belong to this account. Choose an owned site in Online Store.');
          return {ready:false,reason:scope.reason};
        }
        location.replace('/admin/store');
        return {ready:false,redirected:true,reason:scope.reason};
      }
      try {sessionStorage.setItem(selectedSiteKey,scope.site.id);}catch {}
      const siteId=encodeURIComponent(scope.site.id);
      const [pageData,projectData]=await Promise.all([
        read('/api/admin/cms/pages?site_id='+siteId),
        read('/api/admin/cms/theme-projects?site_id='+siteId),
      ]);
      const editorLocation=location.origin==='null'
        ? '/admin/theme-editor?'+params.toString() : location.href;
      const plan=planThemeEditorEntry({
        site:scope.site,location:editorLocation,
        pages:pageData.pages||[],projects:projectData.projects||[],
      });
      if(plan.kind!=='redirect'){
        report('This page is not part of the selected website. Open Online Store to choose the correct page.');
        return {ready:false,reason:plan.reason};
      }
      // about:srcdoc has a null URL origin even when its parent is a trusted
      // same-origin Local Studio document. Its baseURI retains that host.
      const assetOrigin=location.origin==='null'
        ? new URL(document.baseURI).origin : location.origin;
      const destination=new URL(plan.to,assetOrigin);
      const current=new URL(location.href);
      if(destination.pathname===current.pathname &&
         destination.searchParams.get('slug')===current.searchParams.get('slug') &&
         destination.searchParams.get('page_id')===current.searchParams.get('page_id') &&
         destination.searchParams.get('site_id')===current.searchParams.get('site_id')){
        window.cmsActiveSiteId=scope.site.id;
        return {ready:true,site_id:scope.site.id};
      }
      location.replace(destination.pathname+destination.search);
      return {ready:false,redirected:true,resource:plan.resource};
    }catch(error){
      report('Website ownership and pages could not be verified. No draft has been modified.');
      return {ready:false,reason:String(error?.message||error)};
    }
  })();
})();
