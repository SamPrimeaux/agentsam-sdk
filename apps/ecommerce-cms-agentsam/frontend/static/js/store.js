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
          <span id="store-visibility-label">Checking…</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <a href="/" class="btn ghost small" target="_blank" rel="noopener">View store</a>
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
          <iframe id="theme-preview-desktop" title="Published desktop storefront preview" loading="eager"></iframe><span class="online-store-preview-caption">Desktop · Live storefront</span>
        </div>
        <div class="online-store-preview online-store-preview--mobile">
          <iframe id="theme-preview-mobile" title="Published mobile storefront preview" loading="eager"></iframe><span class="online-store-preview-caption">Mobile</span>
        </div>
      </div>
      <div class="online-store-theme-meta">
        <div>
          <div class="online-store-theme-name">
            <span id="active-theme-name">Loading site…</span>
            <span class="online-store-badge online-store-badge--active">Active</span>
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

function renderDraftRow(theme) {
  return `
    <div class="online-store-draft-row">
      <div class="online-store-draft-thumb" aria-hidden="true"><span>Theme</span></div>
      <div class="online-store-draft-copy">
        <div class="online-store-draft-name">${theme.name}</div>
        <div class="online-store-draft-meta">${theme.meta}</div>
        <div class="online-store-version"><span class="online-store-version-dot" aria-hidden="true"></span>Version ${theme.version} available</div>
      </div>
      <div class="online-store-draft-actions">
        <button type="button" class="online-store-icon-btn" aria-label="Theme options"><svg width="17" height="17" viewBox="0 0 24 24" fill="none"><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></svg></button>
        <button type="button" class="btn ghost small draft-publish" data-theme-id="${theme.id}">Publish</button>
        <a href="${theme.edit_href}" class="btn ghost small">Edit theme</a>
      </div>
    </div>`;
}

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

    const theme = d.active_theme;
    document.getElementById("active-theme-name").textContent = theme?.name || "No active theme";
    document.getElementById("active-theme-saved").textContent =
      "Last saved: " + fmtStoreDate(theme?.last_saved);
    const editLink = document.getElementById("edit-theme-btn");
    editLink.href = theme?.edit_href || "/admin/theme-editor?slug=home";
    if (!theme) document.querySelector(".online-store-badge--active").textContent = "Not configured";
    else if (embeddedHost && !theme.verified) document.querySelector(".online-store-badge--active").textContent = "Theme unverified";
    setPreviewFrames(embeddedHost ? theme?.preview_href : (theme?.preview_href || "/"));

    if (theme?.version_available) {
      const ver = document.getElementById("active-theme-version");
      ver.hidden = false;
      document.getElementById("active-version-text").textContent =
        `Version ${theme.version_available} available`;
    }

    document.getElementById("draft-themes").innerHTML = (d.draft_themes || [])
      .map(renderDraftRow)
      .join("");

    // Do not pretend that publishing the Shop CMS page publishes a theme.
    // Keep draft rows read-only until a real theme publish transaction exists.
    document.querySelectorAll(".draft-publish").forEach((btn) => {
      btn.disabled = true;
      btn.textContent = "Publish unavailable";
      btn.title = "Theme publishing requires a saved, versioned theme draft.";
    });
  } catch (err) {
    console.error(err);
  }
})();

document.getElementById("import-theme-btn")?.addEventListener("click", () => {
  alert("Theme import is coming soon. Use the theme editor to customize your live storefront.");
});
