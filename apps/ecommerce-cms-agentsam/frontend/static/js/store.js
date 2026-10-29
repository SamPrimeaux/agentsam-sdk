renderShell("/admin/store", `
  <div class="online-store">
    <header class="online-store-head">
      <div class="online-store-title">
        ${storeIcon()}
        <h1>Online Store</h1>
      </div>
      <div class="online-store-actions">
        <a href="#theme-product-marketplace" class="btn ghost small" id="browse-themes-shortcut">Browse templates</a>
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
            <span id="active-theme-name">Loading site…</span>
            <span class="online-store-badge online-store-badge--pending" id="active-theme-status">Checking…</span>
          </div>
          <div class="online-store-theme-sub" id="active-theme-saved">Last saved: —</div>
          <div class="online-store-version" id="active-theme-version" hidden>
            <span class="online-store-version-dot" aria-hidden="true"></span>
            <span id="active-version-text"></span>
          </div>
        </div>
        <div class="online-store-theme-actions">
          <button type="button" class="online-store-icon-btn" aria-label="Theme options">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/></svg>
          </button>
          <a href="/admin/theme-editor?slug=shop" class="btn primary" id="edit-theme-btn">Edit theme</a>
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

function escapeThemeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}
function renderDraftRow(theme) {
  const name=escapeThemeText(theme.name||"Untitled theme");
  const meta=escapeThemeText(theme.meta||theme.package||"Packaged theme");
  const version=escapeThemeText(theme.version||"");
  const preview=typeof theme.preview_url==="string" && /^\/(?!\/)[a-zA-Z0-9_./-]+$/.test(theme.preview_url)
    ? theme.preview_url : "";
  return `
    <div class="online-store-draft-row" data-draft-id="${escapeThemeText(theme.id)}">
      <div class="online-store-draft-thumb" aria-hidden="true"><span>Draft</span></div>
      <div class="online-store-draft-copy">
        <div class="online-store-draft-name">${name}</div>
        <div class="online-store-draft-meta">${meta}${version?' · v'+version:''}</div>
        <div class="online-store-version">Private draft · Not published</div>
      </div>
      <div class="online-store-draft-actions">
        ${preview?'<button type="button" class="btn ghost small" data-theme-draft-preview="'+escapeThemeText(preview)+'">Preview</button>':''}
        <button type="button" class="btn ghost small" disabled title="Connect this draft to a CMS site before editing">Connect site to edit</button>
      </div>
    </div>`;
}
function paintStoreDrafts(drafts) {
  const container=document.getElementById("draft-themes");
  if(!container)return;
  container.innerHTML=(drafts||[]).map(renderDraftRow).join("");
  container.querySelectorAll("[data-theme-draft-preview]").forEach(button=>{
    button.addEventListener("click",()=>{
      const url=button.dataset.themeDraftPreview;
      const dialog=document.createElement("dialog");
      dialog.className="theme-marketplace-dialog";
      const header=document.createElement("div");
      header.className="theme-marketplace-dialog-head";
      const title=document.createElement("strong");
      title.textContent="Draft preview · Not published";
      const close=document.createElement("button");
      close.className="btn ghost small";close.type="button";close.textContent="Close";
      close.addEventListener("click",()=>dialog.close());
      header.append(title,close);
      const iframe=document.createElement("iframe");
      iframe.className="theme-marketplace-dialog-frame";
      iframe.title="Unpublished theme draft preview";
      iframe.setAttribute("sandbox","allow-scripts");
      iframe.src=url;
      dialog.append(header,iframe);
      dialog.addEventListener("close",()=>dialog.remove(),{once:true});
      document.body.append(dialog);dialog.showModal();
    });
  });
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
    preview_url:card.querySelector("[data-theme-draft-preview]")?.dataset.themeDraftPreview
  }));
  paintStoreDrafts(drafts);
  container?.scrollIntoView({behavior:"smooth",block:"center"});
});

// Render the actual *published* storefront. The old ?preview=1 selected an
// authenticated CMS draft and did not represent the active live theme.
const embeddedHost = window.AgentSamOnlineStoreHost || null;
const STOREFRONT_PREVIEW_WIDTHS = { desktop: 1440, mobile: 390 };
let storefrontPreviewObserver = null;

function setPreviewFrames(href) {
  const base = embeddedHost?.baseUrl || location.origin;
  if (embeddedHost && !href) {
    for (const device of ["desktop", "mobile"]) {
      const shell = document.getElementById("theme-preview-" + device).parentElement;
      shell.dataset.previewStatus = "failed";
      const message = document.createElement("div");
      message.className = "online-store-preview-message";
      message.textContent = "No verified storefront URL — preview unavailable";
      shell.appendChild(message);
    }
    return;
  }
  let url;
  try { url = new URL(href || "/", base); }
  catch { url = new URL("/", base); }
  // Standalone FNF must preview its own origin; an authenticated Studio host
  // may provide a verified external site's public URL instead.
  if (!embeddedHost && url.origin !== location.origin) url = new URL("/", location.origin);
  url.searchParams.delete("preview");
  url.searchParams.delete("_");
  const route = embeddedHost ? url.href : url.pathname + url.search + url.hash;

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
        if (embeddedHost && url.origin !== new URL(base).origin) {
          // Cross-origin published content cannot be inspected by Studio.
          // Its public URL is real, but load does not prove pixel parity.
          shell.dataset.previewStatus = "ready";
          return;
        }
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
  if(name)name.textContent="Your starter storefront";
  if(saved)saved.textContent=state==="error"
    ? "Store data is unavailable. This is a safe, local starter preview — nothing is published."
    : "Start from a template or connect a site. This preview is not published.";
  if(edit){edit.href="#theme-product-marketplace";edit.textContent="Add your first theme";}
  document.getElementById("active-theme-version").hidden=true;
  if (typeof storefrontPreviewObserver !== "undefined" && storefrontPreviewObserver) storefrontPreviewObserver.disconnect();
  const frames=[
    ["theme-preview-desktop",1100],
    ["theme-preview-mobile",390],
  ];
  const sizeStarter=()=>{
    frames.forEach(([id,virtualWidth])=>{
      const shell=document.getElementById(id)?.parentElement;
      const page=shell?.querySelector(".online-store-starter");
      if(!page)return;
      const scale=(shell.clientWidth||virtualWidth)/virtualWidth;
      page.style.width=virtualWidth+"px";
      page.style.height="840px";
      page.style.transform="scale("+scale+")";
    });
  };
  for(const [id,virtualWidth] of frames){
    const frame=document.getElementById(id);
    if(!frame)continue;
    frame.removeAttribute("src");
    frame.onload=frame.onerror=null;
    const shell=frame.parentElement;
    shell.dataset.previewStatus="starter";
    shell.querySelector(".online-store-preview-message")?.remove();
    shell.querySelector(".online-store-starter")?.remove();
    const page=document.createElement("div");
    page.className="online-store-starter";
    page.setAttribute("aria-label","Unpublished starter store visual preview");
    page.innerHTML='<div class="starter-announcement">A new store starts here · Preview only</div>'+
      '<div class="starter-navbar"><strong>YOUR STORE</strong><span>Shop &nbsp; Collections &nbsp; About</span><span>⌕ &nbsp; ♡ &nbsp; ▢</span></div>'+
      '<section class="starter-hero"><div class="starter-hero-copy"><small>YOUR NEXT CHAPTER</small>'+
      '<h2>A storefront with room to grow.</h2><p>Connect a theme, add your products, and make this space your own.</p>'+
      '<span class="starter-faux-cta">Explore the collection&nbsp; →</span></div>'+
      '<div class="starter-art" aria-hidden="true"><span></span><span></span><span></span></div></section>'+
      '<div class="starter-collection-heading"><strong>Featured collections</strong><span>Curated for your brand</span></div>'+
      '<div class="starter-product-grid"><div><i></i><b>Collection One</b></div><div><i></i><b>Collection Two</b></div><div><i></i><b>Collection Three</b></div></div>'+
      '<div class="starter-bottom">Your store · Unpublished preview</div>';
    shell.append(page);
    if("ResizeObserver" in window){
      if(typeof storefrontPreviewObserver==="undefined")continue;
      if(!storefrontPreviewObserver)storefrontPreviewObserver=new ResizeObserver(sizeStarter);
      storefrontPreviewObserver.observe(shell);
    }
  }
  sizeStarter();
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
    const d = await adminFetch("/api/admin/store/online");

    document.getElementById("store-visibility-label").textContent =
      d.store.visibility === "public" ? "Public" :
      d.store.visibility === "password" ? "Password protected" :
      d.store.visibility === "unknown" ? "Unverified" : "Not published";

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
    } else {
      showThemeUnavailable("empty", "No published theme has been confirmed. Preview a package or create your first theme draft.");
    }

    if (theme?.version_available) {
      const ver = document.getElementById("active-theme-version");
      ver.hidden = false;
      document.getElementById("active-version-text").textContent =
        `Version ${theme.version_available} available`;
    }

    paintStoreDrafts(d.draft_themes || []);

    // Do not pretend that publishing the Shop CMS page publishes a theme.
    // Keep draft rows read-only until a real theme publish transaction exists.
    document.querySelectorAll(".draft-publish").forEach((btn) => {
      btn.disabled = true;
      btn.textContent = "Publish unavailable";
      btn.title = "Theme publishing requires a saved, versioned theme draft.";
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
