/* Packaged Ecommerce CMS embed configuration UI.
 * Manifest source, ephemeral preview state. NO D1 writes, form submissions,
 * installation claims, provider connections or theme publish side effects.
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
  let catalog = [], selected = '', search = '';
  const pane = document.createElement('section');
  pane.className = 'te-embed-review-inspector';
  pane.hidden = true;
  pane.setAttribute('aria-label', 'App embed preview configuration');
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

  function renderList() {
    const root = drawer.querySelector('[data-embed-list]');
    if (!root) return;
    const items = catalog.filter(app =>
      !search || [app.name,app.category,app.tagline].join(' ').toLowerCase().includes(search));
    root.innerHTML = items.length ? items.map(app =>
      '<button type="button" class="ter-app-card'+(selected===app.key?' is-selected':'')+'" data-embed-open="'+esc(app.key)+'">'+
        '<span class="ter-app-icon" aria-hidden="true">'+
          ({'megaphone':'◩','mail':'✉','mail-open':'▣','send':'↗'}[app.icon]||'⊞')+'</span>'+
        '<span class="ter-app-copy"><strong>'+esc(app.name)+'</strong><small>'+esc(app.tagline)+'</small>'+
        '<span class="ter-app-meta">'+esc(app.category)+' · Configure preview</span></span></button>'
    ).join('') : '<p class="ter-muted">No matching embed types. Try another search.</p>';
    root.querySelectorAll('[data-embed-open]').forEach(button => button.addEventListener('click', () => open(button.dataset.embedOpen)));
  }
  function open(key) {
    const item = get(key);
    if (!item) return;
    selected=key;
    const {app,config:c}=item;
    const hasFields = Array.isArray(c.fields);
    pane.innerHTML =
      '<header class="ter-inspector-head"><div><strong>'+esc(app.name)+'</strong>'+
      '<small>UI review · Not installed</small></div><button type="button" data-embed-close aria-label="Close embed inspector">×</button></header>'+
      '<div class="ter-inspector-scroll"><p class="ter-notice">Configure and preview this storefront component. No live form, subscriber, or CMS component is created.</p>'+
      '<details open><summary>Content</summary>'+
      field('heading','Heading',c.heading||'')+field('subtitle','Supporting text',c.subtitle||'')+
      field('button_label','Button label',c.button_label||'')+
      (c.button_href!=null?field('button_href','Link target',c.button_href):'')+'</details>'+
      '<details open><summary>Placement and behavior</summary>'+
      checkbox('enabled','Show in preview',!!c.enabled)+
      select('placement','Placement',c.placement||'inline',['inline','top','center','bottom-right','bottom-left'])+
      select('trigger','Trigger',c.trigger||'manual',['manual','immediate','delay','scroll','exit-intent'])+
      field('delay_ms','Delay (milliseconds)',Number(c.delay_ms)||0,'number','min="0" max="60000" step="100"')+
      checkbox('dismissible','Dismissible',c.dismissible!==false)+'</details>'+
      '<details><summary>Appearance</summary>'+
      field('background','Background',c.background||'#141414','color')+
      field('accent','Accent',c.accent||'#8b181b','color')+'</details>'+
      (hasFields?'<details open><summary>Form and consent</summary>'+
        '<p class="ter-muted">Choose preview fields. Required fields are validated locally; nothing is submitted.</p>'+
        editableFields.map(name => {
          const included=(c.fields||[]).includes(name);
          const required=(c.required_fields||[]).includes(name);
          return '<div class="ter-form-row">'+checkbox('field:'+name,fieldLabel(name),included)+
            '<label class="ter-required">Required <input aria-label="'+esc(fieldLabel(name)+' required')+'" type="checkbox" data-embed-required="'+esc(name)+'"'+(required?' checked':'')+(included?'':' disabled')+'></label></div>';
        }).join('')+
        (app.key.startsWith('newsletter')?checkbox('double_opt_in','Double opt-in preview',c.double_opt_in!==false):'')+
        '</details>':'')+
      '<div class="ter-actions"><button type="button" data-embed-preview>Open interactive preview</button>'+
      '<button type="button" data-embed-reset>Reset to manifest defaults</button></div>'+
      '<p class="ter-muted" data-embed-note role="status">Session-only preview · Not saved to site</p></div>';
    pane.hidden=false;
    inspector.querySelector('#te-inspector-body')?.setAttribute('aria-hidden','true');
    pane.querySelector('[data-embed-close]').addEventListener('click',close);
    bindControls(item);
    renderList();
    if (matchMedia('(max-width: 700px)').matches) inspector.scrollIntoView({block:'start',behavior:'smooth'});
  }
  function bindControls({app,config:c}) {
    pane.querySelectorAll('[data-embed-input],[data-embed-select]').forEach(input => {
      input.addEventListener('input', () => {
        const key=input.dataset.embedInput||input.dataset.embedSelect;
        let value=input.value;
        if(key==='delay_ms')value=Math.max(0,Math.min(60000,Number(value)||0));
        else value=value.slice(0, key==='subtitle'?400:160);
        c[key]=value;
        note('Preview configuration updated · Not published');
      });
    });
    pane.querySelectorAll('[data-embed-check]').forEach(input => input.addEventListener('change', () => {
      const key=input.dataset.embedCheck;
      if(key.startsWith('field:')){
        const name=key.slice(6);
        c.fields=editableFields.filter(f=>f===name?input.checked:(c.fields||[]).includes(f));
        if(!input.checked)c.required_fields=(c.required_fields||[]).filter(f=>f!==name);
        open(app.key);
        return;
      }
      c[key]=input.checked;
      note('Preview configuration updated · Not published');
    }));
    pane.querySelectorAll('[data-embed-required]').forEach(input => input.addEventListener('change', () => {
      const name=input.dataset.embedRequired;
      const required=new Set(c.required_fields||[]);
      input.checked?required.add(name):required.delete(name);
      c.required_fields=[...required];
      note('Required field selection updated · Preview only');
    }));
    pane.querySelector('[data-embed-preview]').addEventListener('click',()=>preview(app.key));
    pane.querySelector('[data-embed-reset]').addEventListener('click',()=>{
      local.delete(app.key);open(app.key);note('Defaults restored · Preview only');
    });
  }
  function preview(key) {
    const item=get(key);
    if(!item)return;
    const {app,config:c}=item;
    const fields=Array.isArray(c.fields)?c.fields.filter(f=>editableFields.includes(f)):[];
    const required=new Set(c.required_fields||[]);
    dialog.innerHTML='<div class="ter-dialog-head"><div><small>AgentSam · Safe preview</small><strong>'+esc(app.name)+'</strong>'+
      '</div><button type="button" data-embed-dismiss aria-label="Close preview">×</button></div>'+
      '<div class="ter-dialog-content" style="--ter-surface:'+esc(/^#[0-9a-f]{6}$/i.test(c.background)?c.background:'#141414')+
        ';--ter-accent:'+esc(/^#[0-9a-f]{6}$/i.test(c.accent)?c.accent:'#8b181b')+'">'+
        '<h2>'+esc(c.heading||app.name)+'</h2><p>'+esc(c.subtitle||'')+'</p>'+
        (fields.length?'<form data-embed-form novalidate>'+
          fields.map(name => '<label>'+esc(fieldLabel(name))+(required.has(name)?' *':'')+
            (name==='message'?'<textarea name="message" rows="3" '+(required.has(name)?'required':'')+'></textarea>':
            '<input type="'+(name==='email'?'email':'text')+'" name="'+esc(name)+'" '+(required.has(name)?'required':'')+'>')+'</label>').join('')+
          '<button type="submit">'+esc(c.button_label||'Submit')+'</button>'+
          '<p role="status" data-embed-validation>Preview only · No data is transmitted</p></form>':
          '<button type="button" data-embed-dismiss>'+esc(c.button_label||'Explore')+'</button>')+
        '</div><p class="ter-dialog-footer">This is a simulated component. No form, mailing list, or storefront change has been made.</p>';
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
    drawer.insertAdjacentHTML('beforeend','<div class="ter-catalog-label">Available storefront components <span>UI review</span></div>'+
      '<div data-embed-list role="group" aria-label="Available storefront embed types"></div>'+
      '<p class="ter-catalog-foot">Manifest-defined components. Nothing is installed or connected until its CMS integration is approved.</p>');
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
      renderList();
    }catch{
      drawer.querySelector('[data-embed-list]').innerHTML=
        '<p role="status" class="ter-muted">Unable to load the packaged embed catalog. No installed components were changed.</p>';
    }
  }
  document.querySelectorAll('[data-drawer-mode]').forEach(button=>button.addEventListener('click',()=>{
    if(button.dataset.drawerMode!=='app-embeds')close();
  }));
  document.addEventListener('theme-editor:selection',close);
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  window.ThemeEmbedReview={getCatalog:()=>catalog.map(app=>app.key),getDraft:key=>get(key)?.config||null,
    open,close,preview,isPreviewOnly:true};
  void boot();
})();
