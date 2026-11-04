/* Source-owned, released website packages for both hosted Online Store surfaces.
 * Color/appearance presets remain independent in cms_themes and /themes.
 * Installer persists through the canonical authenticated CMS site API. */
(() => {
  const API = window.__AGENTSAM_WEBSITE_THEMES_ENDPOINT;
  if (!API) return;
  const root = document.getElementById('theme-marketplace-grid');
  const search = document.getElementById('theme-marketplace-search');
  const filter = document.getElementById('theme-marketplace-filter');
  const count = document.getElementById('theme-marketplace-count');
  if (!root || !search || !filter || !count) return;
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
  const preferredSiteId = /^[A-Za-z0-9_-]{1,160}$/.test(queryParams.get('site_id') || '')
    ? queryParams.get('site_id') : null;
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
  // A Try action creates (or resumes) a self-contained draft site. It must
  // never pick the current/default/live site or interrupt dashboard startup
  // with a nested modal. Explicit installs into existing sites remain supported
  // by the authenticated backend for later site management.
  async function createPrivateDraft(theme,button,container) {
    if(button.disabled) return;
    button.disabled=true;
    const previous=button.textContent;
    button.textContent='Preparing draft…';
    const message=container.querySelector('.theme-install-message');
    if(message)message.textContent='Creating your private editable draft. Existing websites stay unchanged.';
    try {
      const result=await requestJSON(
        '/api/admin/website-themes/'+encodeURIComponent(theme.slug)+'/install',
        {method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({
            version:theme.version,
            ...(preferredSiteId ? {site_id:preferredSiteId} : {}),
          })});
      if(typeof result.editor_url!=='string' ||
        !/^\/admin\/theme-project-editor\?project=[A-Za-z0-9_%\-]+&site_id=[A-Za-z0-9_%\-]+$/.test(result.editor_url) ||
        !/^[A-Za-z0-9_-]{1,160}$/.test(result.site_id||''))
        throw Error('The installer did not return an owned draft and editor');
      if(message)message.textContent=result.unchanged
        ? 'Opening your previously saved draft…'
        : 'Your draft is ready. Opening its theme library…';
      // The site_id belongs to the newly created private draft site. Route to
      // the actual Online Store library, not a synthetic editor template.
      const embedded=window.parent&&window.parent!==window;
      const target=embedded?window.parent:window;
      const route=embedded
        ? '/apps/ecommerce-cms-agentsam?page=%2Fadmin%2Fstore&site_id='+encodeURIComponent(result.site_id)
        : '/admin/store?site_id='+encodeURIComponent(result.site_id);
      target.location.assign(route);
    }catch(error) {
      button.disabled=false;
      button.textContent=previous||'Try theme';
      if(message)message.textContent='The draft was not opened. Your existing sites have not been changed.';
      showError(container,error);
    }
  }
  // A Theme Store Try action is an install journey, not another catalog page.
  // Only auto-start after a navigation originating from our Theme Store.
  // Missing referrer (login/strict privacy) falls back to a visible confirmation.
  const showInstallStage = () => {
    count.textContent = 'Theme installation';
    const heading=document.querySelector('.theme-marketplace-heading');
    const controls=document.querySelector('.theme-marketplace-controls');
    if(heading)heading.hidden=true;
    if(controls)controls.hidden=true;
    const stage=node('div','theme-install-stage');
    stage.setAttribute('role','region');
    stage.setAttribute('aria-label','Theme installation');
    const name=selectedTheme?.name || selectedSlug || 'Selected theme';
    const title=node('h2','', 'Preparing '+name);
    const message=node('p','theme-install-message','Preparing your private theme draft.');
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
        ? 'This release is not ready to install. Your current store is unchanged.'
        : 'The selected theme is unavailable. Your current store is unchanged.';
      progress.hidden=true;
      action.textContent='Browse themes';
      action.onclick=()=>{location.assign(ORIGIN)};
      return;
    }
    action.onclick=()=>void createPrivateDraft(selectedTheme,action,stage);
    if(trustedHandoff) void createPrivateDraft(selectedTheme,action,stage);
    else {
      progress.hidden=true;
      message.textContent='Continue to add this theme to your store as a private draft.';
    }
  };
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const current = filter.value;
    const visible = products.filter(p =>
      (current === 'all' || p.category === current) &&
      (!query || [p.name, p.description, p.category, ...(p.pages || [])].join(' ').toLowerCase().includes(query)))
      .sort((a,b) => Number(b.slug === selectedTheme?.slug) - Number(a.slug === selectedTheme?.slug));
    count.textContent = visible.length + ' website packages';
    root.replaceChildren();
    if (selectedSlug) {
      const notice = node('div','theme-marketplace-selection');
      notice.setAttribute('role', 'status');
      if (!selectedTheme) {
        notice.textContent = 'The selected Theme Store package is not in this catalog. Browse available releases below.';
      } else if (selectedVersion && selectedTheme.version !== selectedVersion) {
        notice.textContent = selectedTheme.name + ' has changed from v' + selectedVersion +
          ' to v' + selectedTheme.version + '. Review the new version before installing.';
      } else {
        notice.textContent = selectedTheme.can_install
          ? selectedTheme.name + ' is ready as a private editable draft. Choose Try theme.'
          : selectedTheme.name + ' is available for preview. Editable installation is not verified yet.';
      }
      root.append(notice);
    }
    if (!visible.length) {
      root.append(node('p', 'theme-marketplace-empty', 'No matching website themes. Change your filters to browse the releases.'));
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
      const cover = trusted(theme.thumbnail_url, '/previews/');
      if (cover) {
        const image = node('img', 'theme-marketplace-thumb');
        image.src = cover;
        image.loading = 'lazy';
        image.alt = theme.name + ' website theme cover';
        visual.append(image);
      } else visual.append(node('div', 'theme-marketplace-unavailable', theme.name));
      visual.append(node('span', 'theme-marketplace-state',
        theme.can_install ? 'Editable installation ready' :
          theme.release_status === 'published' ? 'Verified package' : 'Preview'));
      const body = node('div', 'theme-marketplace-body');
      body.append(node('span', 'theme-marketplace-category', theme.category),
        node('h3', '', theme.name), node('p', '', theme.description),
        node('div', 'theme-marketplace-meta', theme.sku + ' · v' + theme.version +
          ' · '+(theme.can_install ? theme.editable_page_count+' editable pages' : theme.pages.length+' page layouts')));
      const actions = node('div', 'theme-marketplace-actions');
      const preview = trusted(theme.preview_url, '/theme-packages/');
      const detail = trusted(theme.detail_url, '/themes/');
      const download = trusted(theme.download_url, '/api/themes/');
      if (preview) actions.append(link('Preview original', preview));
      if (detail) actions.append(link('Explore theme', detail));
      if (theme.can_install) {
        const install = node('button','btn small','Try theme');
        install.type='button';
        install.dataset.installTheme=theme.slug;
        install.addEventListener('click',()=>void createPrivateDraft(theme,install,body));
        actions.append(install);
      } else if(theme.release_status==='published'&&download)
        actions.append(link('Get verified package',download,true));
      body.append(actions,node('p','theme-marketplace-disclaimer',
        theme.can_install
          ? 'Site-owned CMS draft · edits are saved as revisions · publishing is separate.'
          : theme.release_status==='published'
            ? 'Compiled package only. This version does not yet have a verified editable installer.'
            : 'Preview only. No verified downloadable release is published yet.'));
      if(theme.can_install && theme.manifest_page_count > theme.editable_page_count)
        body.append(node('p','theme-marketplace-disclaimer',
          (theme.manifest_page_count-theme.editable_page_count)+' additional source routes have no rendered editor content yet.'));
      item.append(visual,body);
      root.append(item);
    }
  };
  const load = async () => {
    count.textContent = 'Connecting to Theme Store…';
    root.replaceChildren(node('p', 'theme-marketplace-empty', 'Loading original website packages…'));
    try {
      const data=await requestJSON(API);
      if(!Array.isArray(data.products))throw Error('Website Theme Store unavailable');
      products=data.products.filter(p=>p&&p.slug&&p.name);
      selectedTheme = selectedSlug ? products.find(p=>p.slug===selectedSlug) || null : null;
      // Keep the requested theme visible rather than making the user search for
      // the exact package they already selected in the public marketplace.
      if (selectedTheme) { search.value=''; filter.value='all'; }
      if (installIntent && selectedSlug) {
        showInstallStage();
        return;
      }
      filter.replaceChildren(new Option('All categories','all'));
      [...new Set(products.map(p=>p.category))].sort().forEach(c=>filter.add(new Option(c,c)));
      render();
      if (selectedTheme) {
        root.querySelector('[data-theme-store-selection]')?.scrollIntoView({block:'center',behavior:'instant'});
      }
    }catch(error){
      count.textContent='Catalog unavailable';
      const message=node('div','theme-marketplace-empty');
      message.append(node('strong','','Theme Store unavailable'),node('p','',error.message));
      const retry=node('button','btn ghost small','Retry');
      retry.type='button';
      retry.addEventListener('click',load);
      message.append(retry);
      root.replaceChildren(message);
    }
  };
  search.addEventListener('input',render);
  filter.addEventListener('change',render);
  void load();
})();
