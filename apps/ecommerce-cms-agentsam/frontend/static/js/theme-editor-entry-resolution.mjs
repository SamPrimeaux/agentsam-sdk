/**
 * Resolve the current editor destination from account-owned CMS data.
 * No demo pages, global homepage assumptions, or hidden site switches.
 */
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const SLUG=/^[a-z][a-z0-9-]{0,63}$/;
function link(path,params) {
  const url=new URL(path,'https://agentsam.invalid');
  for(const [k,v] of Object.entries(params))if(v!==null&&v!==undefined&&v!=='')url.searchParams.set(k,String(v));
  return url.pathname+url.search;
}
export function chooseThemeEditorSite({sites=[],requestedSiteId='',rememberedSiteId=''}) {
  const owned=(Array.isArray(sites)?sites:[]).filter(s=>s&&ID.test(String(s.id||'')));
  if(requestedSiteId){
    if(!ID.test(requestedSiteId))return {kind:'unavailable',reason:'invalid_site_id'};
    const site=owned.find(s=>s.id===requestedSiteId);
    return site?{kind:'site',site}:{kind:'unavailable',reason:'site_not_owned'};
  }
  const remembered=owned.find(s=>s.id===rememberedSiteId);
  if(remembered)return {kind:'site',site:remembered};
  if(owned.length===1)return {kind:'site',site:owned[0]};
  return {kind:'unavailable',reason:owned.length?'site_selection_required':'no_sites'};
}
function selectedPage(pages,{slug='',pageId=''}={}) {
  if(pageId)return pages.find(p=>p.id===pageId)||null;
  if(slug)return pages.find(p=>p.slug===slug)||null;
  return pages.find(p=>p.is_homepage===true||p.is_homepage===1)||
    pages.find(p=>p.route_path==='/')||pages.find(p=>p.slug==='home')||pages[0]||null;
}
function selectedProjectPage(project,slug='') {
  const pages=Array.isArray(project.pages)?project.pages:[];
  return (slug?pages.find(p=>p.slug===slug):null)||
    pages.find(p=>p.slug==='home')||pages[0]||null;
}
export function planThemeEditorEntry({site,location,projects=[],pages=[]}) {
  if(!site||!ID.test(String(site.id||'')))return {kind:'unavailable',reason:'site_not_owned'};
  const params=new URL(location,'https://agentsam.invalid').searchParams;
  const pageId=params.get('page_id')||'';
  const slug=params.get('slug')||'';
  if(pageId&&!ID.test(pageId))return {kind:'unavailable',reason:'invalid_page_id'};
  if(slug&&!SLUG.test(slug))return {kind:'unavailable',reason:'invalid_page_slug'};
  const canonical=(Array.isArray(pages)?pages:[]).filter(p=>p&&p.slug!=='site'&&p.site_id===site.id);
  const selected=selectedPage(canonical,{slug,pageId});
  if(pageId&&(!selected||selected.id!==pageId))return {kind:'unavailable',reason:'page_not_in_site'};
  const installed=(Array.isArray(projects)?projects:[]).filter(p=>
    p&&ID.test(String(p.id||''))&&Array.isArray(p.pages)&&p.pages.length>0);
  if(!pageId&&installed.length) {
    const project=installed.find(p=>p.pages.some(page=>page.slug===slug))||installed[0];
    const page=selectedProjectPage(project,slug);
    if(page) return {kind:'redirect',resource:'theme-project',
      to:link('/admin/theme-project-editor',{project:project.id,site_id:site.id,page:page.slug})};
  }
  if(selected)return {kind:'redirect',resource:'cms-page',
    to:link('/admin/theme-editor',{slug:selected.slug,site_id:site.id,page_id:selected.id||null})};
  return {kind:'redirect',resource:'empty-site',to:link('/admin/pages',{site_id:site.id})};
}
