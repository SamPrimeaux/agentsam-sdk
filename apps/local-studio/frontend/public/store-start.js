/* First-run merchant entry. Identity and site ownership belong to the existing
 * Local Studio authority; this client never trusts its URL as authorization. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const panels=['start-loading','start-guest','start-workspace','start-ready'];
  const params=new URLSearchParams(location.search);
  const siteParam=params.get('site_id');
  const requestedSite=/^[A-Za-z0-9_-]{1,128}$/.test(siteParam||'')?siteParam:null;
  let sites=[];
  let slugEdited=false;
  const slugFor = name => String(name||'').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80).replace(/-+$/,'');
  const show = name => panels.forEach(id => {$(id).hidden=id!==name;});
  const report=(message='')=>{ const el=$('start-error');el.hidden=!message;el.textContent=message; };
  const selectSite = site => {
    if (!sites.some(owned => owned.id===site.id)) return false;
    try {sessionStorage.setItem('agentsam.cms.selected-site.v1',site.id);} catch {}
    try {localStorage.setItem('agentsam.cms.selected-site.v1',site.id);} catch {}
    window.dispatchEvent(new CustomEvent('agentsam:cms-site-changed',{detail:{site_id:site.id}}));
    return true;
  };
  const siteLink=(page,site)=>page+'?site_id='+encodeURIComponent(site.id);
  const setReady=(site,{created=false,warning=null}={})=>{
    if (!selectSite(site)) return report('The selected site is not available to this account. Reload and try again.');
    $('start-ready-title').textContent=created?'Your store is ready.':'Welcome back to your store.';
    $('start-ready-copy').textContent=warning||
      'Your CMS workspace is account-owned. Continue managing pages, themes, and settings for this store.';
    $('start-ready-name').textContent=site.name||site.slug||'Store';
    $('start-ready-domain').textContent=site.primary_domain?
      site.primary_domain+' (verify connection in domain settings)':'Not connected yet';
    $('start-open-store').href=siteLink('/admin/store',site);
    $('start-open-pages').href=siteLink('/admin/pages',site);
    $('start-open-themes').href=siteLink('/admin/store',site);
    const newParams=new URLSearchParams(location.search);
    newParams.set('site_id',site.id);
    history.replaceState(null,'','/start?'+newParams);
    report();show('start-ready');
  };
  const existingSites = () => {
    const root=$('start-sites-list');root.replaceChildren();
    const active=sites.filter(site=>site.status!=='archived');
    $('start-existing').hidden=active.length===0;
    $('start-existing-count').textContent=String(active.length)+' site'+(active.length===1?'':'s');
    for (const site of active) {
      const a=document.createElement('a');
      a.className='site-entry';a.href=siteLink('/admin/store',site);
      a.addEventListener('click',()=>selectSite(site));
      const avatar=document.createElement('span');avatar.className='site-avatar';avatar.textContent=String(site.name||'S').charAt(0).toUpperCase();
      const info=document.createElement('span');info.className='site-info';
      const title=document.createElement('strong');title.textContent=site.name||site.slug||'Store';
      const details=document.createElement('small');details.textContent=site.primary_domain||site.slug||'No domain configured';
      info.append(title,details);
      const arrow=document.createElement('span');arrow.className='site-action';arrow.textContent='Open →';
      a.append(avatar,info,arrow);root.append(a);
    }
  };
  async function readJSON(url,options={}) {
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const data=await response.json().catch(()=>({}));
    return {response,data};
  }
  const safeNext=location.pathname+location.search;
  $('start-login').href='/auth/login?next='+encodeURIComponent(safeNext);
  $('start-signup').href='/auth/signup?next='+encodeURIComponent(safeNext);
  async function load() {
    show('start-loading');report();
    let auth;
    try {auth=await readJSON('/api/auth/me');}
    catch {report('Cannot reach identity services. Reload to retry.');show('start-guest');return;}
    if(auth.response.status===401 || !auth.data?.authenticated) {
      if(auth.response.status!==401) report('Identity status is temporarily unavailable. Sign in to try again.');
      show('start-guest');return;
    }
    try {
      const {response,data}=await readJSON('/api/cms/sites');
      if(response.status===401) {show('start-guest');return;}
      if(!response.ok || !data.ok) throw Error(data.error||'Could not list your stores');
      sites=Array.isArray(data.sites)?data.sites.filter(site=>site&&typeof site.id==='string'):[];
      existingSites();
      const requested=requestedSite&&sites.find(site=>site.id===requestedSite&&site.status!=='archived');
      if(requested) return setReady(requested);
      show('start-workspace');
    } catch(error) {show('start-workspace');report(error.message||'Store inventory is unavailable.');}
  }
  $('start-name').addEventListener('input',event=>{
    if(!slugEdited)$('start-slug').value=slugFor(event.target.value);
  });
  $('start-slug').addEventListener('input',event=>{
    slugEdited=true;
    const normalized=slugFor(event.target.value);
    if(normalized!==event.target.value){
      const el=event.target;el.value=normalized;
    }
  });
  $('start-create').addEventListener('submit',async event=>{
    event.preventDefault();report();
    const name=$('start-name').value.trim();
    const slug=$('start-slug').value.trim();
    if(name.length<2||name.length>120||!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||slug.length>80){
      report('Enter a store name and a valid lowercase identifier.');return;
    }
    const button=$('start-submit');button.disabled=true;button.textContent='Creating store…';
    try {
      const {response,data}=await readJSON('/api/cms/sites',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,slug})
      });
      if(!response.ok||!data?.ok){
        if (response.status===401) {
          location.assign('/auth/login?next='+encodeURIComponent(location.pathname+location.search));
          return;
        }
        // The authority can create a site before starter installation fails.
        // Reload the inventory instead of blindly creating a duplicate site.
        if(data?.site_id){
          const inventory=await readJSON('/api/cms/sites');
          if(inventory.response.ok&&inventory.data.ok){
            sites=inventory.data.sites||[];
            const partial=sites.find(site=>site.id===data.site_id);
            if(partial)return setReady(partial,{warning:'Your store record exists, but its starter setup needs attention. Open the store to inspect it.'});
          }
        }
        throw Error(data?.error==='cms_site_slug_invalid'?'Enter a valid store identifier.':
          response.status===409?'That store identifier is already in use for your account.':
          data?.detail||data?.error||'Could not create the store');
      }
      if(!data.site?.id || !data.site?.account_id)throw Error('The store was created without a verifiable owner.');
      sites=[...sites.filter(site=>site.id!==data.site.id),data.site];
      existingSites();
      setReady(data.site,{created:true});
    }catch(error){report(error.message||'Could not create the store.');}
    finally{button.disabled=false;button.textContent='Create store →';}
  });
  $('start-another').addEventListener('click',()=>{
    const query=new URLSearchParams(location.search);query.delete('site_id');
    history.replaceState(null,'','/start'+(query.size?'?'+query:''));
    $('start-name').value='';$('start-slug').value='';slugEdited=false;
    existingSites();report();show('start-workspace');
  });
  void load();
})();
