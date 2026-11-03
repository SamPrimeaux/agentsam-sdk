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
  async function installToSite(theme,siteId,button,container) {
    button.disabled=true;
    button.textContent='Installing…';
    try {
      const result=await requestJSON(
        '/api/admin/website-themes/'+encodeURIComponent(theme.slug)+'/install',
        {method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({site_id:siteId,version:theme.version})});
      if(typeof result.editor_url!=='string' ||
        !/^\/admin\/theme-project-editor\?project=[A-Za-z0-9_%\-]+&site_id=[A-Za-z0-9_%\-]+$/.test(result.editor_url))
        throw Error('Installer did not return a valid editor destination');
      // The same editor URL works in a standalone admin and the embedded app.
      const parent=window.parent&&window.parent!==window?window.parent:window;
      parent.location.assign(result.editor_url);
    }catch(error){
      button.disabled=false;
      button.textContent='Install & edit';
      showError(container,error);
    }
  }
  async function chooseInstallSite(theme,button,container) {
    button.disabled=true;
    button.textContent='Checking sites…';
    let data;
    try {
      data=await requestJSON('/api/admin/cms/sites');
      if(!Array.isArray(data.sites))throw Error('Site directory is unavailable');
    }catch(error){
      button.disabled=false;
      button.textContent='Install & edit';
      showError(container,error);
      return;
    }
    const sites=data.sites.filter(s=>s&&typeof s.id==='string');
    if(!sites.length){
      button.disabled=false;
      button.textContent='Install & edit';
      showError(container,new Error('Create an authorized CMS website under Pages before installing a theme.'));
      return;
    }
    if(sites.length===1){
      await installToSite(theme,sites[0].id,button,container);
      return;
    }
    button.disabled=false;
    button.textContent='Install & edit';
    const dialog=node('dialog','website-theme-install-dialog');
    const form=node('form','website-theme-install-form');
    form.method='dialog';
    const h=node('h3','', 'Install '+theme.name);
    const explanation=node('p','','Choose the website that will own this editable draft. Existing published sites will not be replaced.');
    const label=node('label','','Install into website');
    const select=node('select','website-theme-site-select');
    select.setAttribute('aria-label','Website to install theme into');
    select.append(new Option('Choose a website…',''));
    for(const s of sites){
      select.add(new Option((s.name||s.slug||s.id)+' · '+(s.slug||s.id)+
        ' ('+Number(s.page_count||0)+' pages)',s.id));
    }
    label.append(select);
    const actions=node('div','website-theme-install-actions');
    const cancel=node('button','btn ghost small','Cancel');
    cancel.type='button';
    const confirm=node('button','btn small','Install & open editor');
    confirm.type='button';
    confirm.disabled=true;
    select.addEventListener('change',()=>{confirm.disabled=!select.value;});
    cancel.addEventListener('click',()=>dialog.close());
    confirm.addEventListener('click',async()=>{
      const siteId=select.value;
      if(!sites.some(s=>s.id===siteId))return;
      confirm.disabled=true;
      dialog.close();
      await installToSite(theme,siteId,button,container);
    });
    actions.append(cancel,confirm);
    form.append(h,explanation,label,actions);
    dialog.append(form);
    dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    document.body.append(dialog);
    dialog.showModal();
    select.focus();
  }
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const current = filter.value;
    const visible = products.filter(p =>
      (current === 'all' || p.category === current) &&
      (!query || [p.name, p.description, p.category, ...(p.pages || [])].join(' ').toLowerCase().includes(query)));
    count.textContent = visible.length + ' website packages';
    root.replaceChildren();
    if (!visible.length) {
      root.append(node('p', 'theme-marketplace-empty', 'No matching website themes. Change your filters to browse the releases.'));
      return;
    }
    for (const theme of visible) {
      const item = node('article', 'theme-marketplace-item');
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
        const install = node('button','btn small','Install & edit');
        install.type='button';
        install.dataset.installTheme=theme.slug;
        install.addEventListener('click',()=>void chooseInstallSite(theme,install,body));
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
      filter.replaceChildren(new Option('All categories','all'));
      [...new Set(products.map(p=>p.category))].sort().forEach(c=>filter.add(new Option(c,c)));
      render();
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
