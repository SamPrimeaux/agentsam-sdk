renderShell("/admin/store", `
  <div class="online-store">
    <header class="online-store-head">
      <div class="online-store-title">
        ${storeIcon()}
        <h1>Online Store</h1>
      </div>
      <div class="online-store-actions">
        <a href="#theme-product-marketplace" class="btn ghost small" id="browse-themes-shortcut">Browse website themes</a>
        <button type="button" class="online-store-pill" id="store-visibility-btn" aria-haspopup="true">
          <span class="online-store-pill-dot" aria-hidden="true"></span>
          <span id="store-visibility-label">Checking…</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button type="button" class="btn ghost small" id="view-storefront-btn" disabled title="Connect a site to preview the published storefront">View site</button>
        <button type="button" class="online-store-icon-btn" aria-label="More actions">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>
        </button>
      </div>
    </header>

    <section class="online-store-perf" aria-label="Store performance">
      <div class="online-store-perf-period">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M4 10h16M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <span>30 days</span>
      </div>
      <div class="online-store-perf-stat">
        <div class="label">LCP P75</div>
        <div class="value" id="perf-lcp">—</div>
      </div>
      <div class="online-store-perf-stat">
        <div class="label">INP P75</div>
        <div class="value" id="perf-inp">—</div>
      </div>
      <div class="online-store-perf-stat">
        <div class="label">Cumulative Layout Shift</div>
        <div class="value" id="perf-cls">—</div>
      </div>
      <div class="online-store-perf-stat online-store-perf-stat--wide">
        <div class="label">Sessions by Device Type</div>
        <div class="value online-store-devices" id="perf-sessions">
          <span class="device desktop">— Desktop</span>
          <span class="device mobile">— Mobile</span>
        </div>
      </div>
    </section>

    <section class="online-store-card online-store-active" aria-label="Current theme">
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
            <span id="active-theme-name">No active theme</span>
            <span class="online-store-badge online-store-badge--pending" id="active-theme-status">Checking…</span>
          </div>
          <div class="online-store-theme-sub" id="active-theme-saved">Choose a site and install a website package to begin editing.</div>
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
        <p>These themes are only visible to you. Publishing a theme from your library will switch it to your current theme.</p>
      </div>
      <button type="button" class="btn ghost small" id="import-theme-btn">Import <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    </header>

    <section class="online-store-card online-store-drafts" id="draft-themes" aria-label="Draft themes"></section>
    <section class="online-store-card theme-marketplace" id="theme-product-marketplace" aria-label="Browse reusable theme templates">
      <header class="theme-marketplace-heading">
        <div><span class="theme-marketplace-eyebrow">InnerAnimalMedia · Website Theme Store</span>
          <h2>Website themes &amp; blog templates</h2>
          <p>Discover actual website packages from themes.inneranimalmedia.com. Preview their original design, then obtain a verified release. A package download is not a CMS installation.</p>
        </div>
        <span class="theme-marketplace-count" id="theme-marketplace-count">Loading catalog…</span>
      </header>
      <div class="theme-marketplace-controls">
        <label>Find a template<input type="search" id="theme-marketplace-search" placeholder="Search by name or category…" aria-label="Search theme templates"></label>
        <label>Category<select id="theme-marketplace-filter" aria-label="Filter themes by category"><option value="all">All categories</option></select></label>
      </div>
      <div class="theme-marketplace-grid" id="theme-marketplace-grid" aria-live="polite">
        <p class="theme-marketplace-empty">Connecting to the website Theme Store…</p>
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

function numericMetric(metric) {
  const value = metric && typeof metric === "object" ? metric.value : metric;
  if (value == null || value === "" || typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function formatMs(metric) {
  const ms = numericMetric(metric);
  if (ms == null) return "—";
  return ms >= 1000 ? (ms / 1000).toFixed(1) + " s" : Math.round(ms) + " ms";
}

function formatShift(metric) {
  const number = numericMetric(metric);
  return number == null ? "—" : number.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function formatSessions(metric) {
  const number = numericMetric(metric);
  return number == null ? "—" : Math.round(number).toLocaleString();
}

function labelMetricAvailability(node, metric) {
  node.title = metric && typeof metric === "object" && metric.status === "unavailable"
    ? "Not measured yet — no storefront analytics data available" : "";
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
  const siteLabel=theme.site_name ? theme.site_name+' ('+(theme.site_slug||theme.site_id)+') · ' : '';
  const meta=escapeThemeText(siteLabel+(theme.meta||theme.package||"Packaged theme"));
  const version=escapeThemeText(theme.version||"");
  const preview=typeof theme.preview_url==="string" && /^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(theme.preview_url)
    ? theme.preview_url : "";
  const sourceSlug=/^[a-z][a-z0-9-]{0,63}$/.test(String(theme.slug||''))?theme.slug:null;
  const installHref=sourceSlug
    ? "https://themes.inneranimalmedia.com/themes/"+encodeURIComponent(sourceSlug)+"/"
    : "#theme-product-marketplace";
  return `
    <div class="online-store-draft-row" data-draft-id="${escapeThemeText(theme.id)}">
      <div class="online-store-draft-thumb" aria-hidden="true"><span>Draft</span></div>
      <div class="online-store-draft-copy">
        <div class="online-store-draft-name">${name}</div>
        <div class="online-store-draft-meta">${meta}${version?' · v'+version:''}</div>
        <div class="online-store-version">${theme.installed?'Installed CMS draft · Not published':'Legacy selection · Not installed on a website'}</div>
      </div>
      <div class="online-store-draft-actions">
         ${preview?'<a class="btn ghost small" href="'+escapeThemeText(preview)+'" target="_blank" rel="noopener noreferrer" data-theme-draft-preview="'+escapeThemeText(preview)+'">Explore preview</a>':''}
        ${theme.installed && theme.edit_href
          ? '<a class="btn ghost small" href="'+escapeThemeText(theme.edit_href)+'">Customize draft</a>'
          : '<a class="btn ghost small" href="'+escapeThemeText(installHref)+'">View original package</a>'}
      </div>
    </div>`;
}
function paintStoreDrafts(drafts) {
  const container=document.getElementById("draft-themes");
  if(!container)return;
  container.innerHTML=(drafts||[]).map(renderDraftRow).join("");

}
document.addEventListener("agentsam:theme-draft-added",event=>{
  const draft=event.detail;
  if(!draft?.id)return;
  const container=document.getElementById("draft-themes");
  const existing=Array.from(container?.querySelectorAll("[data-draft-id]")||[]).some(node=>node.dataset.draftId===draft.id);
  if(existing)return;
  container?.insertAdjacentHTML("afterbegin",renderDraftRow(draft));
  const cards=Array.from(container?.querySelectorAll("[data-draft-id]")||[]);
  // Rebind preview handlers without duplicating previously added rows.
  const drafts=cards.map(card=>({
    id:card.dataset.draftId,name:card.querySelector(".online-store-draft-name")?.textContent,
    meta:card.querySelector(".online-store-draft-meta")?.textContent,
    preview_url:card.querySelector("[data-theme-draft-preview]")?.dataset.themeDraftPreview,
    installed:Boolean(card.querySelector('a[href*="/admin/theme-project-editor?project="]')),
    edit_href:card.querySelector('a[href*="/admin/theme-project-editor?project="]')?.getAttribute('href')
  }));
  paintStoreDrafts(drafts);
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
  if(status){
    status.className="online-store-badge online-store-badge--pending";
    status.textContent="Unpublished";
  }
  if(name)name.textContent=state==="select" ? "Choose a website" : "No website theme installed";
  if(saved)saved.textContent=state==="error"
    ? "Store service is unavailable. No installed website can be verified."
    : state==="select"
      ? "Select an existing website above to open its own theme library."
      : "Browse an original website theme below. A downloaded package is not an installed site.";
  if(edit){edit.href=state==="select"?"#store-site-selector":"#theme-product-marketplace";
    edit.textContent=state==="select"?"Choose website":"Browse website themes";}
  document.getElementById("active-theme-version").hidden=true;
  if (typeof storefrontPreviewObserver !== "undefined" && storefrontPreviewObserver) storefrontPreviewObserver.disconnect();
  for (const id of ["theme-preview-desktop", "theme-preview-mobile"]) {
    const frame = document.getElementById(id);
    if (!frame) continue;
    frame.removeAttribute("src");
    frame.onload = frame.onerror = null;
    const shell = frame.parentElement;
    shell.dataset.previewStatus = "uninstalled";
    shell.querySelector(".online-store-starter")?.remove();
    shell.querySelector(".online-store-preview-message")?.remove();
    const message = document.createElement("div");
    message.className = "online-store-preview-message online-store-preview-message--empty";
    const title = document.createElement("strong");
    title.textContent = state==="select" ? "Choose a website" : "No site theme installed";
    const description = document.createElement("p");
    description.textContent = state==="select"
      ? "Theme projects and previews belong to individual websites. Select yours above."
      : "Your website preview will appear here after a real installation.";
    const browse = document.createElement("a");
    browse.className = "btn ghost small";
    browse.href = state==="select" ? "#store-site-selector" : "#theme-product-marketplace";
    browse.textContent = state==="select" ? "Choose website" : "Explore website themes";
    message.append(title,description,browse);
    shell.appendChild(message);
  }
}
async function showSavedDraftPreview(preview) {
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
  const markup=renderThemePage(page,data.project.tokens||{},{
    baseUrl:page.assetBase||undefined,
  });
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
  }
  document.querySelectorAll('.online-store-preview-caption').forEach((caption,index)=>{
    caption.textContent=index===0?'Desktop · Saved draft preview':'Mobile · Saved draft preview';
  });
}
function showActiveTheme(theme) {
  const status = document.getElementById("active-theme-status");
  status.className = "online-store-badge online-store-badge--" + (theme.verified === true ? "active" : "pending");
  status.textContent = theme.verified === true ? "Active" : "Unverified";
  const edit = document.getElementById("edit-theme-btn");
  edit.href = theme.edit_href || "/admin/theme-editor?slug=home";
  edit.textContent = "Edit theme";
}

(async function () {
  try {
    // Site choice travels in the URL; never silently bind a merchant to the
    // first account-owned website when multiple sites exist.
    const route = new URLSearchParams(window.location.search);
    const siteId = route.get('site_id');
    const d = await adminFetch('/api/admin/store/online'+(siteId?'?site_id='+encodeURIComponent(siteId):''));
    const sites = Array.isArray(d.available_sites) ? d.available_sites : [];
    if(sites.length){
      const label=document.createElement('label');
      label.id='store-site-selector';
      label.style.cssText='display:inline-flex;align-items:center;gap:8px;font-size:13px;';
      const title=document.createElement('span');
      title.textContent='Website';
      const select=document.createElement('select');
      select.setAttribute('aria-label','Current CMS website');
      select.style.cssText='max-width:220px;min-width:150px;padding:8px;border:1px solid currentColor;border-radius:8px;background:inherit;color:inherit;';
      if(d.site_selection_required)select.add(new Option('Select website…',''));
      for(const site of sites)select.add(new Option(site.name+' · '+site.slug,site.id));
      select.value=d.selected_site_id||'';
      select.addEventListener('change',()=>{
        if(!sites.some(site=>site.id===select.value))return;
        const url=new URL(window.location.href);
        url.searchParams.set('site_id',select.value);
        window.location.assign(url.href);
      });
      label.append(title,select);
      document.querySelector('.online-store-title')?.append(label);
    }

    document.getElementById("store-visibility-label").textContent =
      d.store.visibility === "public" ? "Public" :
      d.store.visibility === "password" ? "Password protected" : "Not published";

    const perf = d.performance || {};
    const lcp = document.getElementById("perf-lcp");
    const inp = document.getElementById("perf-inp");
    const cls = document.getElementById("perf-cls");
    lcp.textContent = formatMs(perf.lcp_ms);
    inp.textContent = formatMs(perf.inp_ms);
    cls.textContent = formatShift(perf.cls);
    labelMetricAvailability(lcp, perf.lcp_ms);
    labelMetricAvailability(inp, perf.inp_ms);
    labelMetricAvailability(cls, perf.cls);
    const desktop = formatSessions(perf.sessions_desktop);
    const mobile = formatSessions(perf.sessions_mobile);
    const sessions = document.getElementById("perf-sessions");
    sessions.replaceChildren();
    for (const [type, count] of [["desktop", desktop], ["mobile", mobile]]) {
      const span = document.createElement("span");
      span.className = "device " + type;
      span.textContent = count + " " + (type === "desktop" ? "Desktop" : "Mobile");
      sessions.appendChild(span);
    }
    sessions.title = "Storefront sessions are not measured yet when shown as —";

    setStoreViewButton(d.store?.visibility==="public" ? d.store?.url : null);
    const theme = d.active_theme;
    document.getElementById("active-theme-name").textContent = theme?.name || "No active theme";
    document.getElementById("active-theme-saved").textContent =
      "Last saved: " + fmtStoreDate(theme?.last_saved);
    const editLink = document.getElementById("edit-theme-btn");
    editLink.href = theme?.edit_href || "/admin/theme-editor?slug=home";
    if (theme?.preview_href && theme?.name) {
      showActiveTheme(theme);
      setPreviewFrames(theme.preview_href);
    } else if (d.preview_theme?.installed && d.preview_theme?.edit_href) {
      // An editable CMS draft is not itself a published storefront preview.
      const preview=d.preview_theme;
      showThemeUnavailable("empty", "This site's draft is ready in the editor but not published.");
      document.getElementById("active-theme-name").textContent=preview.name+" · Editable draft";
      document.getElementById("active-theme-status").textContent="Unpublished";
      document.getElementById("active-theme-status").className="online-store-badge online-store-badge--pending";
      document.getElementById("active-theme-saved").textContent="Installed CMS project · Customize before publishing.";
      editLink.href=preview.edit_href;
      editLink.textContent="Customize draft";
      try { await showSavedDraftPreview(preview); }
      catch(error) {
        console.error('saved_theme_preview_failed',error);
        document.getElementById('active-theme-saved').textContent=
          'Starter installed and editable. Preview unavailable; open the editor.';
      }
    } else {
      showThemeUnavailable(d.site_selection_required?'select':'empty',
        'Select your website or install the starter theme before customizing.');
    }

    if (theme?.version_available) {
      const ver = document.getElementById("active-theme-version");
      ver.hidden = false;
      document.getElementById("active-version-text").textContent =
        `Version ${theme.version_available} available`;
    }

    paintStoreDrafts(d.draft_themes || []);
    // An owner with a draft on another site must not see "nothing installed".
    // Do not treat that draft as published or switch sites implicitly.
    const siteDrafts=(d.draft_themes||[]).filter(draft=>draft.installed && draft.site_id);
    if(siteDrafts.length && !d.site_selection_required && !theme?.preview_href && !d.preview_theme?.installed) {
      document.getElementById("active-theme-name").textContent=
        siteDrafts.length===1 ? "Editable site draft available" : siteDrafts.length+" editable site drafts";
      document.getElementById("active-theme-saved").textContent=
        "See Draft themes below to customize the correct website. None is published yet.";
    }

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
    showThemeUnavailable("error", "The store service is unavailable. Retry, or browse preview-only templates below.");
    document.getElementById("store-visibility-label").textContent = "Unverified";
  }
})();

document.getElementById("import-theme-btn")?.addEventListener("click", () => {
  alert("Theme import is coming soon. Use the theme editor to customize your live storefront.");
});
