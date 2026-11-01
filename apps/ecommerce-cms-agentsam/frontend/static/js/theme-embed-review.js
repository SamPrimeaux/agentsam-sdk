/* Packaged Ecommerce CMS embed catalog + install UI.
 * Catalog entries are templates. Install creates a page-owned CMS section
 * instance (cms_page_sections + cms_section_blocks) via the admin CMS API.
 */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).has('showcase')) return;
  const drawer = document.querySelector('[data-drawer-panel="app-embeds"]');
  const inspector = document.querySelector('.theme-editor-panel');
  if (!drawer || !inspector) return;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const editableFields = ['first_name','last_name','email','phone','message'];
  const fieldLabel = value => ({
    first_name:'First name',last_name:'Last name',email:'Email address',
    phone:'Phone',message:'Message'
  })[value] || value;
  const local = new Map();
  let catalog = [], installed = [], selected = '', search = '', busy = false;
  const pageSlug = () => new URLSearchParams(location.search).get('slug') || 'home';
  const pane = document.createElement('section');
  pane.className = 'te-embed-review-inspector';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'Storefront embed configuration');
  inspector.append(pane);
  const dialog = document.createElement('dialog');
  dialog.className = 'te-embed-review-dialog';
  dialog.setAttribute('aria-label', 'Storefront embed interactive preview');
  document.body.append(dialog);
  const get = key => {
    const app = catalog.find(item => item.key === key);
    if (!app) return null;
    if (!local.has(key)) local.set(key, structuredClone(app.default_config || {}));
    return {app, config:local.get(key)};
  };
  const note = value => {
    const node = pane.querySelector('[data-embed-note]');
    if (node) node.textContent = value;
  };
  const close = () => {
    pane.hidden = true;
    pane.replaceChildren();
    selected = '';
    inspector.querySelector('#te-inspector-body')?.removeAttribute('aria-hidden');
    renderList();
  };
  const field = (name,label,value,type='text',extras='') =>
    '<label class="ter-field"><span>'+esc(label)+'</span><input type="'+type+'" data-embed-input="'+esc(name)+'" value="'+esc(value)+'" '+extras+'></label>';
  const checkbox = (name,label,value) =>
    '<label class="ter-check"><span>'+esc(label)+'</span><input type="checkbox" data-embed-check="'+esc(name)+'"'+(value?' checked':'')+'></label>';
  const select = (name,label,value,options) =>
    '<label class="ter-field"><span>'+esc(label)+'</span><select data-embed-select="'+esc(name)+'">'+
    options.map(option=>'<option value="'+esc(option)+'"'+(option===value?' selected':'')+'>'+esc(option.replace(/-/g,' '))+'</option>').join('')+
    '</select></label>';
  const installedFor = key => installed.filter(item => item.catalog_key === key);

  async function api(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || ('Request failed (' + response.status + ')'));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function refreshInstalled() {
    const payload = await api('/api/admin/cms/pages/' + encodeURIComponent(pageSlug()) + '/catalog-resources');
    installed = Array.isArray(payload.installed) ? payload.installed : [];
    return payload;
  }

  function renderList() {
    const root = drawer.querySelector('[data-embed-list]');
    const installedRoot = drawer.querySelector('[data-embed-installed]');
    if (!root) return;
    const items = catalog.filter(app =>
      !search || [app.name,app.category,app.tagline].join(' ').toLowerCase().includes(search));
    root.innerHTML = items.length ? items.map(app => {
      const count = installedFor(app.key).length;
      return '<button type="button" class="ter-app-card'+(selected===app.key?' is-selected':'')+'" data-embed-open="'+esc(app.key)+'">'+
        '<span class="ter-app-icon" aria-hidden="true">'+
          ({'megaphone':'◩','mail':'✉','mail-open':'▣','send':'↗'}[app.icon]||'⊞')+'</span>'+
        '<span class="ter-app-copy"><strong>'+esc(app.name)+'</strong><small>'+esc(app.tagline)+'</small>'+
        '<span class="ter-app-meta">'+esc(app.category)+' · '+(count? (count+' installed') : 'Available template')+'</span></span></button>';
    }).join('') : '<p class="ter-muted">No matching embed types. Try another search.</p>';
    root.querySelectorAll('[data-embed-open]').forEach(button => button.addEventListener('click', () => open(button.dataset.embedOpen)));
    if (installedRoot) {
      installedRoot.innerHTML = installed.length
        ? installed.map(item =>
          '<button type="button" class="ter-app-card" data-embed-instance="'+esc(item.section_key)+'">'+
            '<span class="ter-app-copy"><strong>'+esc(item.catalog_key || item.section_key)+'</strong>'+
            '<small>'+esc(item.section_key)+' · '+(item.enabled?'visible':'hidden')+'</small></span></button>'
        ).join('')
        : '<p class="ter-muted">No storefront embeds are installed on this page yet.</p>';
      installedRoot.querySelectorAll('[data-embed-instance]').forEach(button => {
        button.addEventListener('click', () => {
          const row = installed.find(item => item.section_key === button.dataset.embedInstance);
          if (row?.catalog_key) {
            local.set(row.catalog_key, structuredClone(row.settings || {}));
            open(row.catalog_key, row);
          }
        });
      });
    }
  }

  function open(key, instance = null) {
    const item = get(key);
    if (!item) return;
    selected=key;
    const {app,config:c}=item;
    const hasFields = Array.isArray(c.fields);
    const instances = installedFor(key);
    pane.innerHTML =
      '<header class="ter-inspector-head"><div><strong>'+esc(app.name)+'</strong>'+
      '<small>'+(instance ? ('Installed · '+esc(instance.section_key)) : (instances.length ? (instances.length+' installed on this page') : 'Catalog template'))+'</small></div>'+
      '<button type="button" data-embed-close aria-label="Close embed inspector">×</button></header>'+
      '<div class="ter-inspector-scroll"><p class="ter-notice">'+(
        instance
          ? 'Editing an installed CMS instance. Save writes through the page draft provider.'
          : 'Configure settings, then install into this page. Installation creates a persisted section and block identity.'
      )+'</p>'+
      '<details open><summary>Content</summary>'+
      field('heading','Heading',c.heading||'')+field('subtitle','Supporting text',c.subtitle||'')+
      field('button_label','Button label',c.button_label||'')+
      (c.button_href!=null?field('button_href','Link target',c.button_href):'')+'</details>'+
      '<details open><summary>Placement and behavior</summary>'+
      checkbox('enabled','Show on storefront draft',!!c.enabled)+
      select('placement','Placement',c.placement||'inline',['inline','top','center','bottom-right','bottom-left'])+
      select('trigger','Trigger',c.trigger||'manual',['manual','immediate','delay','scroll','exit-intent'])+
      field('delay_ms','Delay (milliseconds)',Number(c.delay_ms)||0,'number','min="0" max="60000" step="100"')+
      checkbox('dismissible','Dismissible',c.dismissible!==false)+'</details>'+
      '<details><summary>Appearance</summary>'+
      field('background','Background',c.background||'#141414','color')+
      field('accent','Accent',c.accent||'#8b181b','color')+'</details>'+
      (hasFields?'<details open><summary>Form and consent</summary>'+
        '<p class="ter-muted">Required fields are enforced for interactive preview and stored on the installed instance.</p>'+
        editableFields.map(name => {
          const included=(c.fields||[]).includes(name);
          const required=(c.required_fields||[]).includes(name);
          return '<div class="ter-form-row">'+checkbox('field:'+name,fieldLabel(name),included)+
            '<label class="ter-required">Required <input aria-label="'+esc(fieldLabel(name)+' required')+'" type="checkbox" data-embed-required="'+esc(name)+'"'+(required?' checked':'')+(included?'':' disabled')+'></label></div>';
        }).join('')+
        (app.key.startsWith('newsletter')?checkbox('double_opt_in','Double opt-in',c.double_opt_in!==false):'')+
        '</details>':'')+
      '<div class="ter-actions">'+
      (instance
        ? '<button type="button" data-embed-save-instance data-section-key="'+esc(instance.section_key)+'">Save instance</button>'+
          '<button type="button" data-embed-remove-instance data-section-key="'+esc(instance.section_key)+'">Remove</button>'
        : '<button type="button" data-embed-install>Install into page</button>')+
      '<button type="button" data-embed-preview>Open interactive preview</button>'+
      '<button type="button" data-embed-reset>Reset to manifest defaults</button></div>'+
      '<p class="ter-muted" data-embed-note role="status">'+(
        instance ? 'Installed CMS instance · edits persist on Save' : 'Template selected · not installed until you click Install'
      )+'</p></div>';
    pane.hidden=false;
    inspector.querySelector('#te-inspector-body')?.setAttribute('aria-hidden','true');
    pane.querySelector('[data-embed-close]').addEventListener('click',close);
    bindControls(item, instance);
    renderList();
    if (matchMedia('(max-width: 700px)').matches) inspector.scrollIntoView({block:'start',behavior:'smooth'});
  }

  function bindControls({app,config:c}, instance) {
    pane.querySelectorAll('[data-embed-input],[data-embed-select]').forEach(input => {
      input.addEventListener('input', () => {
        const key=input.dataset.embedInput||input.dataset.embedSelect;
        let value=input.value;
        if(key==='delay_ms')value=Math.max(0,Math.min(60000,Number(value)||0));
        else value=value.slice(0, key==='subtitle'?400:160);
        c[key]=value;
        note(instance ? 'Draft settings changed · Save to persist' : 'Template settings updated');
      });
    });
    pane.querySelectorAll('[data-embed-check]').forEach(input => input.addEventListener('change', () => {
      const key=input.dataset.embedCheck;
      if(key.startsWith('field:')){
        const name=key.slice(6);
        c.fields=editableFields.filter(f=>f===name?input.checked:(c.fields||[]).includes(f));
        if(!input.checked)c.required_fields=(c.required_fields||[]).filter(f=>f!==name);
        open(app.key, instance);
        return;
      }
      c[key]=input.checked;
      note(instance ? 'Draft settings changed · Save to persist' : 'Template settings updated');
    }));
    pane.querySelectorAll('[data-embed-required]').forEach(input => input.addEventListener('change', () => {
      const name=input.dataset.embedRequired;
      const required=new Set(c.required_fields||[]);
      input.checked?required.add(name):required.delete(name);
      c.required_fields=[...required];
      note(instance ? 'Draft settings changed · Save to persist' : 'Required field selection updated');
    }));
    pane.querySelector('[data-embed-preview]')?.addEventListener('click',()=>preview(app.key));
    pane.querySelector('[data-embed-reset]')?.addEventListener('click',()=>{
      local.delete(app.key);open(app.key, instance);note('Defaults restored');
    });
    pane.querySelector('[data-embed-install]')?.addEventListener('click', () => void install(app.key));
    pane.querySelector('[data-embed-save-instance]')?.addEventListener('click', (event) => {
      void saveInstance(event.currentTarget.dataset.sectionKey, app.key);
    });
    pane.querySelector('[data-embed-remove-instance]')?.addEventListener('click', (event) => {
      void removeInstance(event.currentTarget.dataset.sectionKey, app.key);
    });
  }

  async function install(key) {
    if (busy) return;
    const item = get(key);
    if (!item) return;
    busy = true;
    note('Installing into page…');
    try {
      const result = await api('/api/admin/cms/pages/' + encodeURIComponent(pageSlug()) + '/catalog-resources', {
        method: 'POST',
        body: JSON.stringify({ catalogKey: key, settings: item.config }),
      });
      await refreshInstalled();
      const row = installed.find(entry => entry.section_key === result.section_key) || null;
      open(key, row);
      note('Installed as ' + result.section_key + ' · draft saved');
      window.dispatchEvent(new CustomEvent('theme-editor:catalog-installed', { detail: result }));
    } catch (error) {
      note(error.message || 'Install failed');
    } finally {
      busy = false;
      renderList();
    }
  }

  async function saveInstance(sectionKey, catalogKey) {
    if (busy || !sectionKey) return;
    const item = get(catalogKey);
    if (!item) return;
    busy = true;
    note('Saving instance…');
    try {
      const content = {
        ...structuredClone(item.config),
        'embed-root': structuredClone(item.config),
        __editor: {
          templateKey: 'storefront_embed',
          catalogKey,
          definitionKey: catalogKey,
          catalogLabel: item.app.name,
          source: 'catalog-install',
          visibility: { enabled: item.config.enabled !== false },
          blocks: [{ id: 'embed-root', templateKey: catalogKey, enabled: item.config.enabled !== false }],
        },
      };
      await api('/api/admin/cms/pages/' + encodeURIComponent(pageSlug()) + '/sections/' + encodeURIComponent(sectionKey), {
        method: 'PUT',
        body: JSON.stringify({ content }),
      });
      await refreshInstalled();
      const row = installed.find(entry => entry.section_key === sectionKey) || null;
      open(catalogKey, row);
      note('Saved · reload will restore these settings');
      window.dispatchEvent(new CustomEvent('theme-editor:catalog-saved', { detail: { section_key: sectionKey, catalog_key: catalogKey } }));
    } catch (error) {
      note(error.message || 'Save failed');
    } finally {
      busy = false;
      renderList();
    }
  }

  async function removeInstance(sectionKey, catalogKey) {
    if (busy || !sectionKey) return;
    busy = true;
    note('Removing instance…');
    try {
      await api('/api/admin/cms/pages/' + encodeURIComponent(pageSlug()) + '/sections/' + encodeURIComponent(sectionKey), {
        method: 'DELETE',
      });
      await refreshInstalled();
      open(catalogKey);
      note('Removed from page draft');
      window.dispatchEvent(new CustomEvent('theme-editor:catalog-removed', { detail: { section_key: sectionKey } }));
    } catch (error) {
      note(error.message || 'Remove failed');
    } finally {
      busy = false;
      renderList();
    }
  }

  function preview(key) {
    const item=get(key);
    if(!item)return;
    const {app,config:c}=item;
    const fields=Array.isArray(c.fields)?c.fields.filter(f=>editableFields.includes(f)):[];
    const required=new Set(c.required_fields||[]);
    dialog.innerHTML='<div class="ter-dialog-head"><div><small>AgentSam · Interactive preview</small><strong>'+esc(app.name)+'</strong>'+
      '</div><button type="button" data-embed-dismiss aria-label="Close preview">×</button></div>'+
      '<div class="ter-dialog-content" style="--ter-surface:'+esc(/^#[0-9a-f]{6}$/i.test(c.background)?c.background:'#141414')+
        ';--ter-accent:'+esc(/^#[0-9a-f]{6}$/i.test(c.accent)?c.accent:'#8b181b')+'">'+
        '<h2>'+esc(c.heading||app.name)+'</h2><p>'+esc(c.subtitle||'')+'</p>'+
        (fields.length?'<form data-embed-form novalidate>'+
          fields.map(name => '<label>'+esc(fieldLabel(name))+(required.has(name)?' *':'')+
            (name==='message'?'<textarea name="message" rows="3" '+(required.has(name)?'required':'')+'></textarea>':
            '<input type="'+(name==='email'?'email':'text')+'" name="'+esc(name)+'" '+(required.has(name)?'required':'')+'>')+'</label>').join('')+
          '<button type="submit">'+esc(c.button_label||'Submit')+'</button>'+
          '<p role="status" data-embed-validation>Preview validation only · submissions are not sent from this dialog</p></form>':
          '<button type="button" data-embed-dismiss>'+esc(c.button_label||'Explore')+'</button>')+
        '</div><p class="ter-dialog-footer">Interactive preview of the selected settings. Installation uses the CMS save path.</p>';
    dialog.querySelectorAll('[data-embed-dismiss]').forEach(button => button.addEventListener('click',()=>dialog.close()));
    dialog.querySelector('[data-embed-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      const form=event.currentTarget;
      const status=form.querySelector('[data-embed-validation]');
      const missing=fields.find(field => required.has(field) && !String(form.elements.namedItem(field)?.value||'').trim());
      if(missing){status.textContent=fieldLabel(missing)+' is required.';return;}
      const email=form.elements.namedItem('email')?.value?.trim();
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){status.textContent='Enter a valid email address.';return;}
      status.textContent='Preview validation passed. No information was sent.';
    });
    dialog.showModal();
  }

  async function boot() {
    const empty=drawer.querySelector('#te-embed-empty');
    if (empty) empty.remove();
    const searchInput=drawer.querySelector('#te-embed-search');
    drawer.insertAdjacentHTML('beforeend',
      '<div class="ter-catalog-label">Installed on this page</div><div data-embed-installed role="group" aria-label="Installed storefront embeds"></div>'+
      '<div class="ter-catalog-label">Available storefront components <span>Catalog</span></div>'+
      '<div data-embed-list role="group" aria-label="Available storefront embed types"></div>'+
      '<p class="ter-catalog-foot">Templates become installed CMS instances with their own section and block identities.</p>');
    if(searchInput)searchInput.placeholder='Search storefront components';
    searchInput?.addEventListener('input',event => {
      search=event.target.value.toLowerCase().trim();
      renderList();
    });
    try{
      const response=await fetch('/admin/theme-editor/embed-catalog.json',{credentials:'same-origin'});
      if(!response.ok)throw Error('Catalog unavailable');
      const data=await response.json();
      if(data.schema!=='agentsam.theme-embed-ui-catalog.v1' || !Array.isArray(data.apps))throw Error('Invalid catalog');
      catalog=data.apps.filter(app=>app.key && app.name && app.default_config);
      try { await refreshInstalled(); } catch { installed = []; }
      renderList();
    }catch{
      drawer.querySelector('[data-embed-list]').innerHTML=
        '<p role="status" class="ter-muted">Unable to load the packaged embed catalog. Installed components were not changed.</p>';
    }
  }
  document.querySelectorAll('[data-drawer-mode]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.drawerMode!=='app-embeds')close();
  }));
  document.addEventListener('theme-editor:selection',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  window.ThemeEmbedReview={
    getCatalog:()=>catalog.map(app=>app.key),
    getDraft:key=>get(key)?.config||null,
    getInstalled:()=>installed.slice(),
    open,close,preview,install,refreshInstalled,
    isPreviewOnly:false,
  };
  void boot();
})();
