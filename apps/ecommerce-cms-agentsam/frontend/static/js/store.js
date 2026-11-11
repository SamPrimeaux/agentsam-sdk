// In-page navigation must update the address, including when entered from an editor.
if (location.pathname.startsWith('/admin/')) {
  const route = new URL(location.href);
  route.pathname = '/admin/store';
  ['project','page','slug','section','block','previewMode','page_id'].forEach(key=>route.searchParams.delete(key));
  history.replaceState(history.state,'',route.pathname+route.search);
}
renderShell("/admin/store", `
  <div class="online-store">
    <header class="online-store-head">
      <div class="online-store-title">
        ${storeIcon()}
        <h1>Online Store</h1>
      </div>
      <div class="online-store-actions">
        <button type="button" class="online-store-pill" id="store-visibility-btn" aria-haspopup="true">
          <span class="online-store-pill-dot" aria-hidden="true"></span>
          <span id="store-visibility-label">Online Store</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="btn ghost small" id="view-storefront-btn" disabled title="Connect a site to preview the published storefront">View site</button>
        <button type="button" class="online-store-icon-btn" aria-label="More actions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>
        </button>
      </div>
    </header>
    <div class="online-store-site-context" id="online-store-site-context"></div>

    <section class="online-store-card online-store-active is-loading" aria-label="Current theme" aria-busy="true">
      <div class="online-store-previews">
        <div class="online-store-preview online-store-preview--desktop">
          <iframe id="theme-preview-desktop" title="Desktop storefront preview" loading="eager"></iframe><span class="online-store-preview-caption">Desktop · Verified live only</span>
        </div>
        <div class="online-store-preview online-store-preview--mobile">
          <iframe id="theme-preview-mobile" title="Mobile storefront preview" loading="eager"></iframe><span class="online-store-preview-caption">Mobile</span>
        </div>
      </div>
      <div class="online-store-theme-meta">
        <div>
          <div class="online-store-theme-name">
            <span id="active-theme-name"></span>
            <span class="online-store-badge online-store-badge--pending" id="active-theme-status" hidden></span>
          </div>
          <div class="online-store-theme-sub" id="active-theme-saved"></div>
          <div class="online-store-version" id="active-theme-version" hidden>
            <span class="online-store-version-dot" aria-hidden="true"></span>
            <span id="active-version-text"></span>
          </div>
        </div>
        <div class="online-store-theme-actions">
          <button type="button" class="online-store-icon-btn" aria-label="Theme options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>
          </button>
          <a href="#theme-product-marketplace" class="btn primary" id="edit-theme-btn">Browse website themes</a>
        </div>
      </div>
    </section>

    <header class="online-store-drafts-head">
      <div>
        <h2>Draft themes</h2>
      </div>
      <div class="online-store-actions"><a class="btn ghost small" id="new-theme-btn" hidden>+ New</a><button type="button" class="btn ghost small" id="import-theme-btn">Import <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></div>
    </header>

    <section class="online-store-card online-store-drafts" id="draft-themes" aria-label="Draft themes"></section>
    <section class="theme-marketplace" id="theme-product-marketplace" aria-label="Discover themes">
      <header class="theme-marketplace-heading">
        <h2>Discover themes</h2>
        <a href="https://themes.inneranimalmedia.com/" class="btn ghost small" id="browse-themes-shortcut">Visit Theme Store</a>
      </header>
      <div class="theme-marketplace-grid" id="theme-marketplace-grid" aria-live="polite">
        <div class="theme-marketplace-skeleton" aria-label="Loading themes"></div>
        <div class="theme-marketplace-skeleton" aria-hidden="true"></div>
        <div class="theme-marketplace-skeleton" aria-hidden="true"></div>
      </div>
    </section>
  </div>
`);

function storeIcon() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 9 5 5h14l1 4M4 9h16v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM5.5 13V20h13v-7" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
}

function fmtStoreDate(iso) {
  if (!iso) return "—";
  const raw = String(iso);
  const d = new Date(/[zZ]$|[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).replace(",", " at");
}

function themeVersion(theme) {
  return theme.package_version || theme.version || null;
}

function escapeThemeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}
function renderDraftRow(theme) {
  const name=escapeThemeText(theme.name||"Untitled theme");
  const meta=escapeThemeText('Added: '+fmtStoreDate(theme.created_at));
  const preview=theme.installed && theme.edit_href;
  return `
    <div class="online-store-draft-row" data-draft-id="${escapeThemeText(theme.id)}">
      <div class="online-store-draft-thumb" aria-hidden="true">${theme.snapshot_url?'<img src="'+escapeThemeText(theme.snapshot_url)+'" alt="" loading="lazy">':preview?'<iframe data-saved-draft-preview title="" tabindex="-1" sandbox="allow-scripts" loading="lazy"></iframe>':''}</div>
      <div class="online-store-draft-copy">
        <div class="online-store-draft-name">${name}</div>
        <div class="online-store-draft-meta">${meta}</div>

      </div>
      <div class="online-store-draft-actions">

        ${theme.installed && theme.edit_href
          ? '<a class="btn ghost small" href="'+escapeThemeText(scopedStoreEditorHref(theme.edit_href,theme.site_id))+'">Edit theme</a>'
          : ''}
      </div>
    </div>`;
}
function paintStoreDrafts(drafts) {
  const container=document.getElementById("draft-themes");
  if(!container)return;
  container.innerHTML=(drafts||[]).map(renderDraftRow).join("");
  container.querySelectorAll('[data-saved-draft-preview]').forEach(frame=>{
    const row=frame.closest('[data-draft-id]');
    const draft=(drafts||[]).find(item=>item.id===row.dataset.draftId);
    if(draft) savedDraftMarkup(draft).then(markup=>{if(frame.isConnected)frame.srcdoc=markup;}).catch(()=>frame.remove());
  });
}
document.addEventListener("agentsam:theme-draft-added",event=>{
  const draft=event.detail;
  if(!draft?.id)return;
  const container=document.getElementById("draft-themes");
  const existing=Array.from(container?.querySelectorAll("[data-draft-id]")||[]).some(node=>node.dataset.draftId===draft.id);
  if(existing)return;
  container?.insertAdjacentHTML("afterbegin",renderDraftRow(draft));
  const frame=container?.firstElementChild?.querySelector('[data-saved-draft-preview]');
  if(frame) savedDraftMarkup(draft).then(markup=>{if(frame.isConnected)frame.srcdoc=markup;}).catch(()=>frame.remove());
  container?.scrollIntoView({behavior:"smooth",block:"center"});
});

// Render the actual *published* storefront. The old ?preview=1 selected an
// authenticated CMS draft and did not represent the active live theme.
const STOREFRONT_PREVIEW_WIDTHS = { desktop: 1440, mobile: 390 };
let storefrontPreviewObserver = null;

function setPreviewFrames(href) {
  let url;
  try { url = new URL(href || "/", location.origin); }
  catch { url = new URL("/", location.origin); }
  if (url.origin !== location.origin) {
    // An external live storefront cannot be assumed embeddable. Never replace
    // it with the AgentSam homepage and claim that it is the customer's theme.
    for (const id of ["theme-preview-desktop","theme-preview-mobile"]) {
      const frame = document.getElementById(id);
      const shell = frame.parentElement;
      frame.removeAttribute("src");
      shell.dataset.previewStatus = "external";
      shell.querySelector(".online-store-preview-message")?.remove();
      const msg = document.createElement("div");
      msg.className = "online-store-preview-message";
      const label = document.createElement("p");
      label.textContent = "This storefront opens on a separate domain.";
      const open = document.createElement("a");
      open.className = "btn ghost small";
      open.href = url.href;
      open.target = "_blank";
      open.rel = "noopener noreferrer";
      open.textContent = "Open live storefront";
      msg.append(label,open);
      shell.appendChild(msg);
    }
    return;
  }
  url.searchParams.delete("preview");
  url.searchParams.delete("_");
  const route = url.pathname + url.search + url.hash;

  if (storefrontPreviewObserver) storefrontPreviewObserver.disconnect();
  const frames = [
    ["desktop", document.getElementById("theme-preview-desktop")],
    ["mobile", document.getElementById("theme-preview-mobile")]
  ];
  function fitFrame(device, iframe) {
    const shell = iframe.parentElement;
    const width = shell.clientWidth;
    if (width <= 0) return;
    const virtualWidth = STOREFRONT_PREVIEW_WIDTHS[device];
    const scale = width / virtualWidth;
    iframe.style.width = virtualWidth + "px";
    iframe.style.height = Math.max(844, Math.ceil(shell.clientHeight / scale)) + "px";
    iframe.style.transform = "scale(" + scale + ")";
  }
  if ("ResizeObserver" in window) {
    storefrontPreviewObserver = new ResizeObserver(() => {
      frames.forEach(([device, iframe]) => fitFrame(device, iframe));
    });
  }
  frames.forEach(([device, iframe]) => {
    const shell = iframe.parentElement;
    shell.dataset.previewStatus = "loading";
    const priorMessage = shell.querySelector(".online-store-preview-message");
    if (priorMessage) priorMessage.remove();
    fitFrame(device, iframe);
    storefrontPreviewObserver?.observe(shell);
    iframe.onload = () => {
      try {
        const doc = iframe.contentDocument;
        if (!doc || !doc.body || !doc.body.children.length) throw new Error("empty preview");
        shell.dataset.previewStatus = "ready";
      } catch {
        shell.dataset.previewStatus = "failed";
        const message = document.createElement("div");
        message.className = "online-store-preview-message";
        message.textContent = "Preview unavailable — open the published store";
        shell.appendChild(message);
      }
    };
    iframe.onerror = () => {
      shell.dataset.previewStatus = "failed";
      const message = document.createElement("div");
      message.className = "online-store-preview-message";
      message.textContent = "Preview unavailable — open the published store";
      shell.appendChild(message);
    };
    iframe.src = route;
  });
}

function setStoreViewButton(url) {
  const view=document.getElementById("view-storefront-btn");
  if(!view)return;
  const trusted=typeof url==="string" && /^https:\/\/[^\s<>"']+$/.test(url);
  view.disabled=!trusted;
  view.title=trusted ? "Open your connected published storefront" : "Connect a site before opening its storefront";
  view.onclick=trusted ? ()=>window.open(url,"_blank","noopener,noreferrer") : null;
}
function showThemeUnavailable(state, message) {
  const status=document.getElementById("active-theme-status");
  const name=document.getElementById("active-theme-name");
  const saved=document.getElementById("active-theme-saved");
  const edit=document.getElementById("edit-theme-btn");
  const card=document.querySelector('.online-store-active');
  if(card){card.hidden=true;card.classList.remove('is-loading');card.setAttribute('aria-busy','false');}
  if(state==='error'){
    const grid=document.getElementById('draft-themes');
    if(grid)grid.innerHTML='<p role="alert">Your store could not be loaded. <button type="button" class="btn ghost small" onclick="location.reload()">Retry</button></p>';
  }
}
async function savedDraftMarkup(preview) {
  // Reuse the SAME renderer as Theme Project Editor, reading the saved R2
  // revision through the account- and site-scoped CMS API.
  const origin=window.AgentSamOnlineStoreHost?.baseUrl||window.location.origin;
  const editor = new URL(preview.edit_href, origin);
  if (editor.origin !== new URL(origin).origin || editor.pathname !== '/admin/theme-project-editor')
    throw Error('invalid_theme_project_editor');
  const projectId=editor.searchParams.get('project');
  const siteId=editor.searchParams.get('site_id');
  if(!/^[A-Za-z0-9_-]{1,160}$/.test(projectId||'') ||
     !/^[A-Za-z0-9_-]{1,160}$/.test(siteId||'')) throw Error('invalid_theme_project_identity');
  const url='/api/admin/cms/theme-projects/'+encodeURIComponent(projectId)+
    '?site_id='+encodeURIComponent(siteId);
  const res=await fetch(url,{credentials:'same-origin',cache:'no-store'});
  const data=await res.json().catch(()=>null);
  if(!res.ok||data?.ok!==true||!data.project?.pages?.length)
    throw Error(data?.error||'theme_project_preview_unavailable');
  const page=data.project.pages.find(page=>page.slug==='home')||data.project.pages[0];
  const {renderThemePage}=await import('/theme-editor/project.mjs');
  if(data.project.id!==projectId) throw Error('theme_project_identity_mismatch');
  return renderThemePage(page,data.project.tokens||{},{
    baseUrl:page.assetBase||undefined,
  });
}
async function showSavedDraftPreview(preview) {
  const markup=await savedDraftMarkup(preview);
  const frames=[
    document.getElementById('theme-preview-desktop'),
    document.getElementById('theme-preview-mobile'),
  ];
  for(const frame of frames){
    if(!frame)continue;
    frame.setAttribute('sandbox','allow-scripts');
    frame.removeAttribute('src');
    frame.parentElement?.querySelector('.online-store-preview-message')?.remove();
    frame.parentElement.dataset.previewStatus='loading';
    frame.onload=()=>{
      frame.parentElement.dataset.previewStatus='ready';
    };
    frame.srcdoc=markup;
    const fit=()=>{
      const width=frame.parentElement.clientWidth;
      if(!width)return;
      frame.style.width='1440px';
      frame.style.height='900px';
      frame.style.transform='scale('+(width/1440)+')';
    };
    fit();
    if(frame.id==='theme-preview-desktop' && typeof ResizeObserver==='function'){
      storefrontPreviewObserver?.disconnect();
      storefrontPreviewObserver=new ResizeObserver(fit);
      storefrontPreviewObserver.observe(frame.parentElement);
    }
  }
  document.querySelectorAll('.online-store-preview-caption').forEach((caption,index)=>{
    caption.textContent=index===0?'Desktop · Saved draft preview':'Mobile · Saved draft preview';
  });
}
function showExistingWebsitePreview(href){
  // A real site's published homepage is not the newly installed theme draft.
  // Use the account-owned public domain as the preview source, without
  // impersonating it with an unrelated Heuristic template.
  const url=new URL(href);
  if(url.protocol!=='https:')throw Error('website_preview_url_invalid');
  storefrontPreviewObserver?.disconnect();
  const frames=[
    ['desktop',document.getElementById('theme-preview-desktop'),1440],
    ['mobile',document.getElementById('theme-preview-mobile'),390],
  ];
  const fit=(iframe,width)=>{
    const shell=iframe.parentElement;
    const size=shell.clientWidth;
    if(!size)return;
    const scale=size/width;
    iframe.style.width=width+'px';
    iframe.style.height=Math.max(844,Math.ceil(shell.clientHeight/scale))+'px';
    iframe.style.transformOrigin='top left';
    iframe.style.transform='scale('+scale+')';
  };
  storefrontPreviewObserver=typeof ResizeObserver==='function'
    ? new ResizeObserver(()=>frames.forEach(([,frame,width])=>fit(frame,width)))
    : null;
  for(const [device,frame,width] of frames){
    if(!frame)continue;
    const shell=frame.parentElement;
    shell.querySelector('.online-store-preview-message')?.remove();
    shell.dataset.previewStatus='loading';
    frame.setAttribute('sandbox','allow-scripts allow-forms');
    frame.setAttribute('referrerpolicy','no-referrer');
    fit(frame,width);
    storefrontPreviewObserver?.observe(shell);
    frame.onload=()=>{shell.dataset.previewStatus='ready';};
    frame.onerror=()=>{
      shell.dataset.previewStatus='failed';
      const link=document.createElement('a');
      link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';
      link.textContent='Open your website';
      link.className='online-store-preview-message';
      shell.append(link);
    };
    frame.src=url.href;
    const caption=shell.querySelector('.online-store-preview-caption');
    if(caption)caption.textContent=device==='desktop'?'Desktop · Existing website':'Mobile · Existing website';
  }
}
function scopedStoreEditorHref(raw,siteId) {
  // The portable Store also runs in about:srcdoc. That document's origin can
  // serialize as "null" and is not a usable URL base. The owning authenticated
  // host provides its origin; never infer it from customer content.
  let origin;
  try {
    origin = new URL(window.AgentSamOnlineStoreHost?.baseUrl || window.location.href).origin;
    if (origin === 'null') return '/admin/store';
  } catch { return '/admin/store'; }
  let url;
  try { url = new URL(raw || '/admin/theme-editor',origin); }
  catch { return '/admin/store'; }
  if (url.origin!==origin ||
      !['/admin/theme-editor','/admin/theme-project-editor','/admin/page-edit'].includes(url.pathname))
    return '/admin/store';
  // An editor URL from a different site is an invalid read-model record.
  // Never silently rewrite its site_id and open the wrong project's editor.
  const linkedSite=url.searchParams.get('site_id');
  if(linkedSite && linkedSite!==siteId)return '/admin/store';
  if (/^[A-Za-z0-9_-]{1,160}$/.test(siteId||'')) url.searchParams.set('site_id',siteId);
  return url.pathname+url.search;
}
function showActiveTheme(theme,siteId) {
  const status = document.getElementById("active-theme-status");
  status.className = "online-store-badge online-store-badge--" + (theme.verified === true ? "active" : "pending");
  status.textContent = theme.verified === true ? "Active" : "Unverified";
  const edit = document.getElementById("edit-theme-btn");
  edit.href = scopedStoreEditorHref(theme.edit_href,siteId);
  edit.textContent = "Edit theme";
}

(async function () {
  try {
    // Site choice travels in the URL; never silently bind a merchant to the
    // first account-owned website when multiple sites exist.
    const route = new URLSearchParams(window.location.search);
    const siteId = route.get('site_id');
    const bootstrapNode=document.getElementById('agentsam-store-bootstrap');
    let initial=null;
    try{initial=bootstrapNode?JSON.parse(bootstrapNode.textContent):null;}catch{}
    bootstrapNode?.remove();
    const d = initial?.ok && (!siteId || initial.selected_site_id===siteId) ? initial :
      await adminFetch('/api/admin/store/online'+(siteId?'?site_id='+encodeURIComponent(siteId):''));
    const sites = Array.isArray(d.available_sites) ? d.available_sites : [];
    document.querySelector('.online-store').dataset.siteId=d.selected_site_id||'';
    if(d.selected_site_id && location.pathname==='/admin/store'){
      const canonical=new URL(location.href);
      canonical.searchParams.set('site_id',d.selected_site_id);
      history.replaceState(history.state,'',canonical.pathname+canonical.search);
    }
    // Remember an explicit, server-verified selection only for this tab.
    // The editor revalidates ownership against /api/admin/cms/sites.
    if (sites.some(site=>site.id===d.selected_site_id)) {
      try {sessionStorage.setItem('agentsam.cms.selected-site.v1',d.selected_site_id);} catch {}
    }
    const createTheme=document.getElementById('new-theme-btn');
    const canvasUrl = window.AgentSamOnlineStoreHost?.canvasUrl || d.canvas_url;
    if(createTheme && typeof canvasUrl === 'string'){
      // A host advertises its creation capability. No merchant website is
      // required, and standalone Ecommerce never guesses an absent SDK route.
      const base = new URL(window.AgentSamOnlineStoreHost?.baseUrl || location.href);
      const destination = new URL(canvasUrl, base);
      if(destination.origin === base.origin && destination.pathname.startsWith('/')){
        if(sites.some(site => site.id === d.selected_site_id))
          destination.searchParams.set('site_id',d.selected_site_id);
        createTheme.href=destination.href;
        createTheme.hidden=false;
        createTheme.setAttribute('aria-label','Create a Canvas');
      }
    }
    const externalStore = document.getElementById('browse-themes-shortcut');
    if (externalStore) {
      const destination = new URL('https://themes.inneranimalmedia.com/');
      if (typeof d.selected_site_id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(d.selected_site_id))
        destination.searchParams.set('site_id',d.selected_site_id);
      externalStore.href = destination.href;
    }
    if(sites.length && !window.AgentSamOnlineStoreHost){
      const current=sites.find(site=>site.id===d.selected_site_id)||sites[0];
      const root=document.createElement('details');
      root.id='store-site-switcher';
      root.className='cms-site-switcher';
      const trigger=document.createElement('summary');
      trigger.className='cms-site-switcher-trigger';
      trigger.setAttribute('aria-label','Switch current website');
      const triggerCopy=document.createElement('span');
      triggerCopy.className='cms-site-switcher-label';
      const primary=document.createElement('strong');
      primary.textContent=current.name||current.slug;
      const subtitle=document.createElement('small');
      subtitle.textContent=current.primary_domain||(current.is_default?'Primary website':'Current website');
      const chevron=document.createElement('span');
      chevron.className='cms-site-switcher-chevron';
      chevron.setAttribute('aria-hidden','true');
      chevron.textContent='⌄';
      triggerCopy.append(primary,subtitle);
      trigger.append(triggerCopy,chevron);
      root.append(trigger);
      const menu=document.createElement('div');
      menu.className='cms-site-switcher-menu';
      const heading=document.createElement('div');
      heading.className='cms-site-switcher-heading';
      heading.textContent='Switch website';
      const search=document.createElement('input');
      search.type='search';
      search.className='cms-site-switcher-search';
      search.placeholder='Search websites';
      search.setAttribute('aria-label','Search owned websites');
      const list=document.createElement('div');
      list.className='cms-site-switcher-results';
      const footer=document.createElement('div');
      footer.className='cms-site-switcher-footer';
      const ranked=[...sites].sort((a,b)=>
        Number(b.id===current.id)-Number(a.id===current.id) ||
        Number(b.is_default===1)-Number(a.is_default===1) ||
        Number(b.status==='active')-Number(a.status==='active') ||
        Number(b.page_count||0)-Number(a.page_count||0) ||
        String(a.name).localeCompare(String(b.name)));
      function chooseSite(selected){
        const url=new URL(window.location.href);
        url.pathname='/admin/store';
        ['project','page','slug','page_id','section','block','previewMode'].forEach(key=>url.searchParams.delete(key));
        url.searchParams.set('site_id',selected.id);
        try {
          const parent=window.parent;
          if(parent!==window && parent.location.origin===window.location.origin &&
             parent.location.pathname==='/apps/ecommerce-cms-agentsam'){
            const outer=new URL(parent.location.href);
            ['project','slug','page_id','section','block','previewMode'].forEach(key=>outer.searchParams.delete(key));
            outer.searchParams.set('page','/admin/store');
            outer.searchParams.set('site_id',selected.id);
            parent.location.assign(outer.href);
            return;
          }
        } catch { /* Standalone or cross-origin frame: navigate the current CMS document. */ }
        window.location.assign(url.href);
      }
      function renderMatches(){
        const q=search.value.trim().toLowerCase();
        const matched=ranked.filter(site=>
          !q || [site.name,site.slug,site.primary_domain].some(value=>
            String(value||'').toLowerCase().includes(q)));
        const visible=q?matched.slice(0,30):matched.slice(0,6);
        list.replaceChildren();
        for(const site of visible){
          const item=document.createElement('button');
          item.type='button';
          item.className='cms-site-switcher-item';
          if(site.id===current.id)item.setAttribute('aria-current','true');
          const names=document.createElement('span');
          names.className='cms-site-switcher-item-copy';
          const name=document.createElement('strong');
          name.textContent=site.name||site.slug;
          const detail=document.createElement('small');
          detail.textContent=site.primary_domain||site.slug;
          names.append(name,detail);
          const meta=document.createElement('span');
          meta.className='cms-site-switcher-item-meta';
          meta.textContent=site.id===current.id?'Current':site.is_default?'Primary':'';
          item.append(names,meta);
          item.onclick=()=>chooseSite(site);
          list.append(item);
        }
        if(!visible.length){
          const none=document.createElement('p');
          none.className='cms-site-switcher-empty';
          none.textContent='No matching websites';
          list.append(none);
        }
        footer.textContent=q
          ? matched.length+' matching websites'
          : (sites.length>visible.length?'Showing main sites · Search all '+sites.length:'All your websites');
      }
      search.addEventListener('input',renderMatches);
      root.addEventListener('toggle',()=>{if(root.open){renderMatches();search.focus();}});
      root.addEventListener('keydown',event=>{
        if(event.key==='Escape'){root.open=false;trigger.focus();}
      });
      document.addEventListener('pointerdown',event=>{
        if(root.open&&!root.contains(event.target))root.open=false;
      });
      menu.append(heading,search,list,footer);
      root.append(menu);
      document.getElementById('online-store-site-context')?.append(root);
      renderMatches();
    }

    document.getElementById("store-visibility-label").textContent =
      d.site_preview?.url ? "Website live" :
      d.store.visibility === "public" ? "Public" :
      d.store.visibility === "password" ? "Password protected" : "Theme not published";

    // Store metrics belong in Analytics, not theme management.
    document.querySelectorAll('.online-store-icon-btn').forEach(button=>{button.hidden=true;});
    const visibilityButton=document.getElementById('store-visibility-btn');
    if(visibilityButton){visibilityButton.disabled=true;visibilityButton.style.cursor='default';}

    setStoreViewButton(d.site_preview?.url ||
      (d.store?.visibility==="public" ? d.store?.url : null));
    // Published site identity wins over a disconnected Heuristic starter.
    // A theme draft may still be edited under Draft themes, not impersonate
    // this domain's live website.
    const presentation=window.cmsStorePresentation?.chooseStorePresentation(d);
    const theme=presentation?.kind==='theme'?presentation.record:null;
    const publishedSite=presentation?.kind==='site'?presentation.record:null;
    let currentId=null;
    if(publishedSite){
      document.getElementById('active-theme-name').textContent=d.selected_site_name||publishedSite.title||'Published website';
      document.getElementById('active-theme-saved').textContent='Published website · '+publishedSite.url;
      const editLink=document.getElementById('edit-theme-btn');
      const safeHref=scopedStoreEditorHref(publishedSite.edit_href,d.selected_site_id);
      editLink.href=safeHref;
      editLink.textContent=safeHref==='/admin/store'?'Manage pages':'Edit page';
      if(safeHref==='/admin/store'){
        editLink.href='/admin/pages?site_id='+encodeURIComponent(d.selected_site_id);
      }
      showExistingWebsitePreview(publishedSite.url);
      const card=document.querySelector('.online-store-active');
      card.hidden=false;card.classList.remove('is-loading');card.setAttribute('aria-busy','false');
    }else if(theme?.edit_href){
      const editLink=document.getElementById('edit-theme-btn');
      editLink.href=scopedStoreEditorHref(theme.edit_href,d.selected_site_id);
      editLink.textContent='Edit theme';
      currentId=theme.id;
      document.getElementById('active-theme-name').textContent=theme.name;
      document.getElementById('active-theme-saved').textContent='Last saved: '+fmtStoreDate(theme.last_saved||theme.updated_at||theme.created_at);
      if(theme.installed) await showSavedDraftPreview(theme);
      else if(theme.preview_href)setPreviewFrames(theme.preview_href);
      const card=document.querySelector('.online-store-active');
      card.hidden=false;card.classList.remove('is-loading');card.setAttribute('aria-busy','false');
    }else if(d.site_preview?.edit_href){
      const site=d.site_preview;
      document.getElementById('active-theme-name').textContent=d.selected_site_name||site.title;
      document.getElementById('active-theme-saved').textContent='';
      const editLink=document.getElementById('edit-theme-btn');
      editLink.href=scopedStoreEditorHref(site.edit_href,d.selected_site_id);
      editLink.textContent='Edit theme';
      if(site.url)showExistingWebsitePreview(site.url);
      const card=document.querySelector('.online-store-active');
      card.hidden=false;card.classList.remove('is-loading');card.setAttribute('aria-busy','false');
    }else showThemeUnavailable('empty');
    document.getElementById('active-theme-version').hidden=true;
    paintStoreDrafts((d.draft_themes||[]).filter(draft=>draft.id!==currentId));
    // Do not pretend that publishing the Shop CMS page publishes a theme.
    // Keep draft rows read-only until a real theme publish transaction exists.
    document.querySelectorAll(".draft-publish").forEach((btn) => {
      if (btn.disabled) {
        btn.title = "Theme publishing remains blocked until review and runtime readiness are both verified.";
        return;
      }
      btn.addEventListener("click", async () => {
        try {
          if (!confirm("Publish this theme? The current live theme will move to Drafts and can be restored later.")) return;
          btn.disabled = true;
          btn.textContent = "Publishing…";
          await adminFetch(`/api/admin/store/themes/${encodeURIComponent(btn.dataset.themeId)}/publish`, { method: "POST" });
          location.reload();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = "Publish";
          alert(err.message || "Could not publish theme.");
        }
      });
    });
  } catch (err) {
    console.error(err);
    showThemeUnavailable("error");
    document.getElementById("store-visibility-label").textContent = "Online Store";
  }
})();

document.getElementById("import-theme-btn")?.addEventListener("click", () => {
  alert("Theme import is coming soon. Use the theme editor to customize your live storefront.");
});
