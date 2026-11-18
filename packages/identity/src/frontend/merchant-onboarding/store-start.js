/* Portable merchant onboarding. Host supplies route projection via config.
 * No concrete identity, API, admin or public mount URL belongs in this app. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let config;
  const configUrl = new URL('./config', document.currentScript?.src || document.baseURI);
  function projectedUrl(route) {
    if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//'))
      throw Error('Invalid configured merchant destination');
    return route;
  }
  const siteLink=(kind,site)=> projectedUrl(config.destinations[kind]
    .replace('{site_id}',encodeURIComponent(site.id)));
  const entryLink=(query)=> config.entry + (query?.size ? '?' + query.toString() : '');
  const identityLink=kind=>{
    const url=new URL(projectedUrl(config.identity[kind]), location.origin);
    url.searchParams.set('next',location.pathname+location.search);
    return url.pathname+url.search;
  };
  const panels=['start-loading','start-guest','start-workspace','start-ready'];
  const params=new URLSearchParams(location.search);
  let requestedSite=null;
  let sites=[];
  let slugEdited=false;
  const slugFor = name => String(name||'').trim().toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80).replace(/-+$/,'');
  const show = name => panels.forEach(id => {$(id).hidden=id!==name;});
  const report=(message='')=>{ const el=$('start-error');el.hidden=!message;el.textContent=message; };
  const selectSite = site => {
    if (!sites.some(owned => owned.id===site.id)) return false;
    if(config.selectionStorageKey){
      try {sessionStorage.setItem(config.selectionStorageKey,site.id);} catch {}
      try {localStorage.setItem(config.selectionStorageKey,site.id);} catch {}
    }
    if(config.selectionEvent) window.dispatchEvent(new CustomEvent(config.selectionEvent,{detail:{site_id:site.id}}));
    return true;
  };
  const setReady=(site,{created=false,warning=null}={})=>{
    if (!selectSite(site)) return report('The selected site is not available to this account. Reload and try again.');
    $('start-ready-title').textContent=created?'Your store is ready.':'Welcome back to your store.';
    $('start-ready-copy').textContent=warning||
      'Your CMS workspace is account-owned. Continue managing pages, themes, and settings for this store.';
    $('start-ready-name').textContent=site.name||site.slug||'Store';
    $('start-ready-domain').textContent=site.primary_domain?
      site.primary_domain+' (verify connection in domain settings)':'Not connected yet';
    $('start-open-store').href=siteLink('store',site);
    $('start-open-pages').href=siteLink('pages',site);
    $('start-open-themes').href=siteLink('themes',site);
    const newParams=new URLSearchParams(location.search);
    newParams.set(config.siteIdParam,site.id);
    history.replaceState(null,'',entryLink(newParams));
    report();show('start-ready');
  };
  const existingSites = () => {
    const root=$('start-sites-list');root.replaceChildren();
    const active=sites.filter(site=>site.status!=='archived');
    $('start-existing').hidden=active.length===0;
    $('start-existing-count').textContent=String(active.length)+' site'+(active.length===1?'':'s');
    for (const site of active) {
      const a=document.createElement('a');
      a.className='site-entry';a.href=siteLink('store',site);
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
  function setIdentityLinks() {
    $('start-login').href=identityLink('login');
    $('start-signup').href=identityLink('signup');
  }
  async function load() {
    show('start-loading');report();
    let auth;
    try {auth=await readJSON(config.identity.me);}
    catch {report('Cannot reach identity services. Reload to retry.');show('start-guest');return;}
    if(auth.response.status===401 || !auth.data?.authenticated) {
      if(auth.response.status!==401) report('Identity status is temporarily unavailable. Sign in to try again.');
      show('start-guest');return;
    }
    try {
      const {response,data}=await readJSON(config.sites.list);
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
      const {response,data}=await readJSON(config.sites.create,{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,slug})
      });
      if(!response.ok||!data?.ok){
        if (response.status===401) {
          location.assign(identityLink('login'));
          return;
        }
        // The authority can create a site before starter installation fails.
        // Reload the inventory instead of blindly creating a duplicate site.
        if(data?.site_id){
          const inventory=await readJSON(config.sites.list);
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
    const query=new URLSearchParams(location.search);query.delete(config.siteIdParam);
    history.replaceState(null,'',entryLink(query));
    $('start-name').value='';$('start-slug').value='';slugEdited=false;
    existingSites();report();show('start-workspace');
  });
  async function boot() {
    try {
      const response = await fetch(configUrl, {credentials:'same-origin',cache:'no-store'});
      if (!response.ok) throw Error('Merchant onboarding configuration unavailable');
      const payload = await response.json();
      if (!payload?.identity?.me || !payload?.sites?.list || !payload?.sites?.create ||
          !payload?.destinations?.store || !payload?.destinations?.pages ||
          !payload?.identity?.login || !payload?.identity?.signup || !payload?.entry)
        throw Error('Merchant onboarding host routes are incomplete');
      config = payload;
      const siteParam=params.get(config.siteIdParam);
      requestedSite=/^[A-Za-z0-9_-]{1,128}$/.test(siteParam||'')?siteParam:null;
      const name=String(config.branding?.name || 'Store Builder');
      $('merchant-brand').firstChild.textContent=name;
      $('merchant-copyright').textContent=name;
      $('merchant-footer-brand').textContent=name;
      $('merchant-identity-label').textContent=name+' / Commerce';
      setIdentityLinks();
      await load();
    } catch(error) {
      show('start-loading');
      $('start-loading').querySelector('h2').textContent='Setup is unavailable';
      report(error?.message || 'Merchant onboarding routes are unavailable.');
    }
  }
  void boot();
})();
