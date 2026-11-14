/* Source-owned, released website packages for both hosted Online Store surfaces.
 * A Try opens an account-owned Theme Studio workspace; a CMS site is optional
 * and is created only later when the customer chooses a publish destination. */
(() => {
  const API = window.__AGENTSAM_WEBSITE_THEMES_ENDPOINT;
  if (!API) return;
  const root = document.getElementById('theme-marketplace-grid');
  const search = document.getElementById('theme-marketplace-search');
  const filter = document.getElementById('theme-marketplace-filter');
  const count = document.getElementById('theme-marketplace-count');
  if (!root) return;
  const ORIGIN = 'https://themes.inneranimalmedia.com';
  let products = [];
  // The public Theme Store hands the selected SKU/version to this authenticated
  // Sites surface. This is a selection hint, not installation authorization.
  const queryParams = (() => {
    const local = new URLSearchParams(window.location.search);
    try {
      if (!local.has('theme_sku') && window.parent && window.parent !== window) {
        return new URLSearchParams(window.parent.location.search);
      }
    } catch { /* embedded cross-origin frame: only honor our own URL */ }
    return local;
  })();
  const selectedSku = queryParams.get('theme_sku') || '';
  const selectedSlug = /^iam\.theme\.[a-z][a-z0-9-]{0,63}$/.test(selectedSku)
    ? selectedSku.slice('iam.theme.'.length) : null;
  const selectedVersion = /^\d+\.\d+\.\d+$/.test(queryParams.get('theme_version') || '')
    ? queryParams.get('theme_version') : null;
  const installIntent = queryParams.get('action') === 'try';
  // A public Try never binds to a previously selected or live website.
  // site_id in a public URL is context for browsing, not install authority.
  const trustedHandoff = (() => {
    // In embedded CMS the iframe referrer is AgentSam itself. The outer
    // authenticated route retains the actual Theme Store navigation referrer.
    const refs=[document.referrer];
    try {
      if (window.parent && window.parent !== window &&
          window.parent.location.origin === window.location.origin)
        refs.push(window.parent.document.referrer);
    } catch { /* Cross-origin parent; never treat it as trusted. */ }
    return refs.some(ref => {
      try { return new URL(ref).origin === ORIGIN; }
      catch { return false; }
    });
  })();
  let selectedTheme = null;
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  };
  const trusted = (url, prefix) => {
    try {
      const value = new URL(url);
      return value.origin === ORIGIN && value.pathname.startsWith(prefix) ? value.href : null;
    } catch { return null; }
  };
  const link = (label, href, primary = false) => {
    const a = node('a', primary ? 'btn small' : 'btn ghost small', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };
  const requestJSON = async (url, options) => {
    const res = await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
    const data = await res.json().catch(()=>({}));
    if(!res.ok||data.ok!==true)throw Error(data.error||'Request failed (HTTP '+res.status+')');
    return data;
  };
  const showError = (container, error) => {
    container.querySelector('.theme-marketplace-error')?.remove();
    const message=node('p','theme-marketplace-error',error?.message||String(error));
    message.setAttribute('role','alert');
    container.append(message);
  };
  // A Try action creates (or resumes) an account-owned authoring workspace.
  // It does not create a CMS site or select a customer's existing website.
  // An explicit site_id remains available for deliberate site-bound installs.
  async function openStudioWorkspace(theme,button,container) {
    if(button.disabled) return;
    button.disabled=true;
    const previous=button.textContent;
    button.textContent='Opening Theme Studio…';
    const message=container.querySelector('.theme-install-message');
    if(message)message.textContent='Preparing your private Theme Studio workspace. No website or domain is required.';
    try {
      const result=await requestJSON(
        '/api/admin/website-themes/'+encodeURIComponent(theme.slug)+'/install',
        {method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({version:theme.version})});
      if(typeof result.editor_url!=='string' || !['studio','site'].includes(result.scope))
        throw Error('The installer did not return an owned Theme Studio workspace');
      const editor=new URL(result.editor_url,location.origin);
      if(editor.origin!==location.origin || editor.pathname!=='/admin/theme-project-editor' ||
        editor.searchParams.get('project')!==result.project_id ||
        (result.scope==='studio' && (editor.searchParams.get('scope')!=='studio' || editor.searchParams.has('site_id'))) ||
        (result.scope==='site' && (!/^[A-Za-z0-9_-]{1,160}$/.test(result.site_id||'') || editor.searchParams.get('site_id')!==result.site_id)))
        throw Error('The installer returned an invalid editor destination');
      if(message)message.textContent=result.unchanged
        ? 'Opening your saved Theme Studio workspace…'
        : 'Your workspace is ready. Opening Theme Studio…';
      const embedded=window.parent&&window.parent!==window;
      const target=embedded?window.parent:window;
      const appRoute=new URLSearchParams({page:editor.pathname,project:result.project_id});
      if(result.scope==='studio') appRoute.set('scope','studio');
      else appRoute.set('site_id',result.site_id);
      const route=embedded
        ? '/apps/ecommerce-cms-agentsam?'+appRoute.toString()
        : editor.pathname+editor.search;
      target.location.assign(route);
    }catch(error) {
      button.disabled=false;
      button.textContent=previous||'Add';
      if(message)message.textContent='The draft was not opened. Your existing sites have not been changed.';
      showError(container,error);
    }
  }
  // A Theme Store Try action is an install journey, not another catalog page.
  // Only auto-start after a navigation originating from our Theme Store.
  // Missing referrer (login/strict privacy) falls back to a visible confirmation.
  const showInstallStage = () => {
    if (count) count.textContent = '';
    const heading=document.querySelector('.theme-marketplace-heading');
    const controls=document.querySelector('.theme-marketplace-controls');
    if(heading)heading.hidden=true;
    if(controls)controls.hidden=true;
    const stage=node('div','theme-install-stage');
    stage.setAttribute('role','region');
    stage.setAttribute('aria-label','Theme installation');
    const name=selectedTheme?.name || selectedSlug || 'Selected theme';
    const title=node('h2','', 'Preparing '+name);
    const message=node('p','theme-install-message','Preparing your private Theme Studio workspace. No site or domain needed.');
    message.setAttribute('role','status');
    const progress=node('div','theme-install-progress');
    progress.setAttribute('aria-hidden','true');
    const bar=node('div','theme-install-progress-bar');
    progress.append(bar);
    const action=node('button','btn','Continue');
    action.type='button';
    stage.append(title,message,progress,action);
    root.replaceChildren(stage);
    if (!selectedTheme || !selectedTheme.can_install || (selectedVersion && selectedTheme.version!==selectedVersion)) {
      message.textContent=selectedTheme
        ? 'This release is not ready to add to Theme Studio.'
        : 'The selected theme is unavailable. No workspace has been created.';
      progress.hidden=true;
      action.textContent='Browse themes';
      action.onclick=()=>{location.assign(ORIGIN)};
      return;
    }
    action.onclick=()=>void openStudioWorkspace(selectedTheme,action,stage);
    if(trustedHandoff) void openStudioWorkspace(selectedTheme,action,stage);
    else {
      progress.hidden=true;
      message.textContent='Continue to open this theme in your private Theme Studio workspace. No site or domain is required.';
    }
  };
  const render = () => {
    const query = search?.value.trim().toLowerCase() || '';
    const current = filter?.value || 'all';
    const visible = products.filter(p =>
      (current === 'all' || p.category === current) &&
      (!query || [p.name, p.description, p.category, ...(p.pages || [])].join(' ').toLowerCase().includes(query)))
      .sort((a,b) => Number(b.slug === selectedTheme?.slug) - Number(a.slug === selectedTheme?.slug));
    if (count) count.textContent = visible.length + ' of ' + products.length + ' themes';
    root.replaceChildren();
    if (!visible.length) {
      root.append(node('p', 'theme-marketplace-empty', 'Choose a theme from the Theme Store.'));
      return;
    }
    for (const theme of visible) {
      const item = node('article', 'theme-marketplace-item');
      if (theme.slug === selectedTheme?.slug) {
        item.dataset.themeStoreSelection = 'true';
        item.style.outline = '2px solid var(--c-accent, #5a7df7)';
        item.style.outlineOffset = '3px';
      }
      const visual = node('div', 'theme-marketplace-visual');
      const cover = trusted(theme.thumbnail_url, '/site-media/' + theme.slug + '/') ||
        trusted(theme.thumbnail_url, '/previews/');
      if (cover) {
        const image = node('img', 'theme-marketplace-thumb');
        image.src = cover;
        image.loading = 'lazy';
        image.alt = theme.name + ' website theme cover';
        visual.append(image);
      } else visual.append(node('div', 'theme-marketplace-unavailable', theme.name));
      const preview = trusted(theme.preview_url, '/theme-packages/' + theme.slug + '/') ||
        trusted(theme.preview_url, '/themes/' + theme.slug + '/presets/' + theme.slug + '/demo/');
      if (preview) {
        const overlay = link('', preview);
        overlay.className = 'theme-marketplace-preview';
        overlay.setAttribute('aria-label', 'Preview ' + theme.name);
        visual.append(overlay);
      }
      const body = node('div', 'theme-marketplace-body');
      const identity = node('div', 'theme-marketplace-identity');
      identity.append(node('h3', '', theme.name),
        node('span', 'theme-marketplace-developer', 'by ' + (theme.developer || theme.author || 'InnerAnimalMedia')));
      if (theme.can_install) {
        const install = node('button','btn ghost small theme-marketplace-add','Add');
        install.type='button';
        install.dataset.installTheme=theme.slug;
        install.setAttribute('aria-label', 'Add ' + theme.name);
        install.addEventListener('click',()=>void openStudioWorkspace(theme,install,item));
        body.append(identity,install);
      } else {
        const detail = trusted(theme.detail_url, '/themes/' + theme.slug + '/');
        const view = detail && link('View theme', detail);
        if (view) body.append(identity,view);
        else body.append(identity);
      }
      item.append(visual,body);
      root.append(item);
    }
  };
  const load = async () => {
    if (count) count.textContent = '';
    // Keep the bounded discovery skeleton while the catalog loads.
    try {
      const data=await requestJSON(API);
      if(!Array.isArray(data.products))throw Error('Website Theme Store unavailable');
      products=data.products.filter(p=>p&&p.slug&&p.name);
      selectedTheme = selectedSlug ? products.find(p=>p.slug===selectedSlug) || null : null;
      // Keep the requested theme visible rather than making the user search for
      // the exact package they already selected in the public marketplace.
      if (selectedTheme) { if (search) search.value=''; if (filter) filter.value='all'; }
      if (installIntent && selectedSlug) {
        showInstallStage();
        return;
      }

      render();
      if (selectedTheme) {
        root.querySelector('[data-theme-store-selection]')?.scrollIntoView({block:'center',behavior:'instant'});
      }
    }catch(error){
      if (count) count.textContent='';
      const message=node('div','theme-marketplace-empty');
      message.append(node('strong','','Theme Store unavailable'),node('p','',error.message));
      const retry=node('button','btn ghost small','Retry');
      retry.type='button';
      retry.addEventListener('click',load);
      message.append(retry);
      root.replaceChildren(message);
    }
  };
  search?.addEventListener('input',render);
  filter?.addEventListener('change',render);
  void load();
})();
