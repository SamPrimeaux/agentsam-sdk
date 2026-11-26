/* Independent merchant Page Editor. Theme Studio owns sections and blocks, not page copy. */
(function () {
  "use strict";
  const params = new URLSearchParams(location.search);
  let slug = params.get("slug") || "home";
  const initialNewPage = params.get("new") === "1";
  const initialSite = params.get("site_id");
  if (initialSite) window.cmsActiveSiteId = initialSite;
  window.cmsActivePageSlug = slug;
  const backHref = "/admin/pages" + (initialSite ? "?site_id=" + encodeURIComponent(initialSite) : "");
  const glyphs = {
    "arrow-left":'<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    "chevron-left":'<path d="m15 18-6-6 6-6"/>',
    "chevron-right":'<path d="m9 18 6-6-6-6"/>',
    "chevron-down":'<path d="m6 9 6 6 6-6"/>',
    "copy":'<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    "eye":'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    "ellipsis":'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    "pencil":'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    "bold":'<path d="M6 12h8a4 4 0 0 1 0 8H6V4h7a4 4 0 0 1 0 8"/>',
    "italic":'<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
    "underline":'<path d="M6 4v7a6 6 0 0 0 12 0V4M4 21h16"/>',
    "list":'<path d="M9 6h13M9 12h13M9 18h13M4 6h.01M4 12h.01M4 18h.01"/>',
    "list-ordered":'<path d="M10 6h12M10 12h12M10 18h12M3 6h1v4M3 10h3M3 17c0-1.5 3-1.5 3 0s-3 2-3 3h3"/>',
    "align-left":'<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>',
    "link":'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    "image":'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    "table":'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    "code":'<path d="m8 17-5-5 5-5M16 7l5 5-5 5M14 4l-4 16"/>',
    "quote":'<path d="M3 21c3 0 7-4 7-8V5H2v8h5M14 21c3 0 7-4 7-8V5h-8v8h5"/>',
    "remove-formatting":'<path d="M4 7V4h16v3M9 20h6M12 4v16M3 3l18 18"/>',
    "external-link":'<path d="M14 3h7v7M10 14 21 3"/><path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6"/>',
    "calendar":'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
    "check":'<path d="m20 6-11 11-5-5"/>',
    "x":'<path d="M18 6 6 18M6 6l12 12"/>',
    "trash":'<path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
    "search":'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    "file":'<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    "save":'<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 3v6h9V3M7 21v-8h10v8"/>'
  };
  function icon(name) {
    return '<svg class="pe-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (glyphs[name] || glyphs.file) + '</svg>';
  }
  const action = (id, label, glyph, cls) => '<button type="button" id="' + id + '" class="pe-action ' + (cls || "") + '">' + icon(glyph) + '<span>' + label + '</span></button>';
  const tool = (command, label, glyph) => '<button type="button" data-cmd="' + command + '" aria-label="' + label + '" title="' + label + '">' + icon(glyph) + '</button>';
  const html = `
  <main class="pe-screen">
    <div class="pe-top">
      <nav class="pe-crumb" aria-label="Breadcrumb">
        <a class="pe-back" href="${backHref}" aria-label="Back to Pages">${icon("arrow-left")}</a>
        <a href="${backHref}">${icon("file")} Pages</a>
      </nav>
      <div class="pe-header-actions">
        ${action("pe-publish","Publish","check","pe-outline pe-publish-action")}
        ${action("pe-duplicate","Duplicate","copy","pe-outline")}
        <a id="pe-view" class="pe-action pe-outline" target="_blank" rel="noopener" aria-disabled="true">${icon("eye")}<span>View</span></a>
        <div class="pe-menu-wrap">
          ${action("pe-more","More actions","ellipsis","pe-outline")}
          <div class="pe-more-menu" id="pe-more-menu" hidden>
            <button type="button" id="pe-preview-action">${icon("eye")} Preview draft</button>
            <button type="button" id="pe-publish-action">${icon("check")} Publish</button>
            <div class="pe-menu-separator"></div>
            <button type="button" id="pe-delete-action" disabled title="Delete is not connected to a verified CMS lifecycle">${icon("trash")} Delete page</button>
          </div>
        </div>
        <div class="pe-prev-next">
          <button type="button" id="pe-prev" aria-label="Previous page">${icon("chevron-left")}</button>
          <button type="button" id="pe-next" aria-label="Next page">${icon("chevron-right")}</button>
        </div>
      </div>
    </div>
    <div class="pe-columns">
      <div class="pe-primary">
        <h1 id="pe-heading">Edit page</h1>
        <section class="pe-card pe-content-card" aria-label="Page content">
          <div class="pe-field">
            <label for="pe-title">Title</label>
            <input id="pe-title" type="text" maxlength="200" autocomplete="off" placeholder="e.g., About us, sizing chart, FAQ">
          </div>
          <div class="pe-field">
            <label for="pe-body">Content</label>
            <div class="pe-section-source-note" id="pe-section-source-note" hidden>
              <div id="pe-section-note-copy"><strong id="pe-section-count">0 saved sections</strong><span id="pe-section-note-detail"> make up this page's layout and content in Theme Studio. This field is optional page copy; it does not replace those sections.</span></div>
              <a id="pe-open-theme-studio" href="#">Edit sections in Theme Studio</a>
              <p id="pe-section-source-warning" hidden>Some saved section sources could not be loaded. They are preserved and will not be replaced with blank content.</p>
            </div>
            <div class="pe-rich-wrap">
              <div class="pe-toolbar" role="toolbar" aria-label="Format page content">
                <select id="pe-format" aria-label="Text style"><option value="p">Paragraph</option><option value="h2">Heading 2</option><option value="h3">Heading 3</option><option value="blockquote">Quote</option></select>
                <div class="pe-toolgroup">${tool("bold","Bold","bold")}${tool("italic","Italic","italic")}${tool("underline","Underline","underline")}</div>
                <div class="pe-toolgroup">${tool("insertUnorderedList","Bulleted list","list")}${tool("insertOrderedList","Numbered list","list-ordered")}</div>
                <div class="pe-toolgroup">${tool("justifyLeft","Align left","align-left")}${tool("link","Insert link","link")}${tool("image","Insert image","image")}${tool("table","Insert table","table")}</div>
                <div class="pe-toolgroup">${tool("removeFormat","Clear formatting","remove-formatting")}${tool("source","Edit HTML source","code")}</div>
              </div>
              <div id="pe-body" class="pe-rich-body" contenteditable="true" role="textbox" aria-label="Page content" aria-multiline="true" data-placeholder="Write your page content…"></div>
              <textarea id="pe-source" class="pe-rich-source" aria-label="HTML source editor" spellcheck="false" hidden></textarea>
            </div>
          </div>
        </section>
        <section class="pe-seo-section" aria-label="Search engine listing">
          <div class="pe-section-head"><h2>Search engine listing</h2><button type="button" class="pe-icon-btn" id="pe-seo-toggle" aria-label="Edit search engine listing" aria-expanded="false">${icon("pencil")}</button></div>
          <div class="pe-card pe-seo-card">
            <div class="pe-seo-preview" id="pe-seo-preview">
              <div class="pe-seo-site" id="pe-seo-site"></div>
              <div class="pe-seo-url" id="pe-seo-url">Site address not verified</div>
              <div class="pe-seo-title" id="pe-seo-title">Page title</div>
              <div class="pe-seo-description" id="pe-seo-description">Add a title and description to see how your page might appear in search.</div>
            </div>
            <div id="pe-seo-fields" class="pe-seo-fields" hidden>
              <div class="pe-field"><label for="pe-seo-title-input">Page title</label><input id="pe-seo-title-input" maxlength="200" type="text"><small id="pe-seo-count">0 of 70 characters used</small></div>
              <div class="pe-field"><label for="pe-seo-description-input">Meta description</label><textarea id="pe-seo-description-input" rows="3" maxlength="1000"></textarea><small id="pe-meta-count">0 of 160 characters used</small></div>
              <div class="pe-field"><label for="pe-handle">URL handle</label><div class="pe-handle-row"><span id="pe-route-prefix">/pages/</span><input id="pe-handle" type="text" maxlength="80" spellcheck="false"></div><small id="pe-handle-help">The new URL stays in your draft until you publish. Your current live URL remains unchanged.</small></div>
            </div>
          </div>
        </section>
      </div>
      <aside class="pe-aside" aria-label="Page settings">
        <section class="pe-side-section">
          <h2>Visibility</h2>
          <label class="pe-radio"><input type="radio" name="pe-visibility" value="visible"><span>Visible</span></label>
          <p class="pe-visibility-meta" id="pe-visibility-meta">Visible after publishing this draft</p>
          <label class="pe-radio"><input type="radio" name="pe-visibility" value="hidden"><span>Hidden</span></label>
        </section>
        <section class="pe-side-section">
          <div class="pe-side-heading"><h2>Template</h2><span title="Templates control visual composition in Theme Studio">${icon("eye")}</span></div>
          <select id="pe-template" aria-label="Page template"></select>
          <p class="pe-side-help">Select the template assigned to this page. Layout composition remains in Theme Studio.</p>
        </section>
      </aside>
    </div>
    <div class="pe-publication-notice" id="pe-publication-notice" hidden role="status"><span id="pe-publication-message"></span><a id="pe-publication-link" target="_blank" rel="noopener noreferrer">View published page</a><a id="pe-publication-new">Create another page</a></div>
    <p class="pe-note" role="status" id="pe-note" aria-live="polite"></p>
  </main>
  <div class="pe-savebar" id="pe-savebar" role="status" aria-label="Unsaved page changes" hidden>
    <span id="pe-save-status">Unsaved changes</span>
    <button type="button" id="pe-discard" class="pe-discard-btn">Discard</button>
    <button type="button" id="pe-save" class="pe-save-btn">Save</button>
  </div>
  <dialog class="pe-dialog" id="pe-preview-dialog">
    <div class="pe-dialog-header"><h2>Page draft preview</h2><button type="button" class="pe-icon-btn" data-close-dialog="pe-preview-dialog" aria-label="Close preview">${icon("x")}</button></div>
    <p>Private preview of the content draft. This does not publish the page.</p>
    <iframe id="pe-preview-frame" title="Draft page content preview" sandbox="" referrerpolicy="no-referrer"></iframe>
  </dialog>
  <dialog class="pe-dialog pe-media-dialog" id="pe-media-dialog">
    <div class="pe-dialog-header"><h2>Select an image from Library</h2><button type="button" class="pe-icon-btn" data-close-dialog="pe-media-dialog" aria-label="Close media picker">${icon("x")}</button></div>
    <input type="search" id="pe-media-search" placeholder="Search Library…" aria-label="Search Library">
    <div id="pe-media-list" class="pe-media-list"></div>
  </dialog>
  `;
  renderShell("/admin/pages", html);
  const $ = (id) => document.getElementById(id);
  const editor = $("pe-body");
  let page = null;
  let site = null;
  let siblings = [];
  let dirty = false;
  let lastSaved = null;
  let sourceMode = false;
  let assets = [];
  let saving = false;
  // The merchant's actual page route is authoritative. Preserve its path family.
  let routePrefix = "/pages/";
  function routePrefixFor(path) {
    const route = String(path || "");
    if (route === "/") return "/";
    const index = route.lastIndexOf("/");
    return index <= 0 ? "/" : route.slice(0,index+1);
  }
  function currentRoute(handle) { return routePrefix + handle; }
  function hostedPageUrl() {
    if (!site?.id || !page?.route_path || typeof window.cmsPublicPageUrl !== "function") return null;
    return window.cmsPublicPageUrl(site,page.route_path);
  }
  function updatePublicLink() {
    const view = $("pe-view");
    const publicUrl = page ? window.cmsPublicPageUrl(site,page.route_path) : null;
    if (page && page.status === "published" && publicUrl) { view.href = publicUrl; view.removeAttribute("aria-disabled"); }
    else { view.removeAttribute("href"); view.setAttribute("aria-disabled","true"); }
  }
  function parseJson(value) {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(value || "{}"); } catch { return {}; }
  }
  function safeUrl(url, image) {
    try {
      const raw = String(url || "").trim();
      if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
      const u = new URL(raw);
      if (u.protocol === "https:" || (u.protocol === "mailto:" && !image)) return u.href;
    } catch {}
    return null;
  }
  function safeHtml(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const allowed = new Set(["P","DIV","BR","STRONG","B","EM","I","U","S","H2","H3","H4","BLOCKQUOTE","UL","OL","LI","A","IMG","TABLE","THEAD","TBODY","TR","TD","TH"]);
    const blocked = new Set(["SCRIPT","STYLE","IFRAME","OBJECT","EMBED","FORM","INPUT","BUTTON","SVG","MATH","META","LINK"]);
    const visit = (parent) => {
      [...parent.children].forEach((el) => {
        if (blocked.has(el.tagName)) { el.remove(); return; }
        visit(el);
        if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
        const href = el.getAttribute("href");
        const src = el.getAttribute("src");
        const alt = el.getAttribute("alt");
        [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
        if (el.tagName === "A") {
          const url = safeUrl(href,false);
          if (url) el.setAttribute("href",url);
          el.setAttribute("rel","noopener noreferrer");
        }
        if (el.tagName === "IMG") {
          const url = safeUrl(src,true);
          if (!url) { el.remove(); return; }
          el.setAttribute("src",url);
          el.setAttribute("alt",alt || "");
          el.setAttribute("loading","lazy");
        }
      });
    };
    visit(doc.body);
    return doc.body.innerHTML;
  }
  function escaped(s) { return String(s ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch])); }
  function getBody() { return sourceMode ? $("pe-source").value : safeHtml(editor.innerHTML); }
  function note(message, isError = false) {
    const el = $("pe-note"); el.textContent = message || "";
    el.classList.toggle("pe-error", isError);
  }
  function markDirty() {
    dirty = true;
    $("pe-savebar").hidden = false;
    $("pe-save").disabled = false;
    $("pe-save-status").textContent = "Unsaved changes";
    syncPreview();
  }
  function markSaved() {
    dirty = false;
    lastSaved = getDraft();
    $("pe-savebar").hidden = true;
    $("pe-save").disabled = true;
  }
  function discardChanges() {
    if (!lastSaved || saving) return;
    const d = lastSaved;
    $("pe-title").value = d.title;
    editor.innerHTML = safeHtml(d.body_html);
    $("pe-source").value = d.body_html;
    if (sourceMode) enterSourceMode(false);
    document.querySelector('[name="pe-visibility"][value="' + d.visibility + '"]').checked = true;
    if (d.template_sku && ![...$("pe-template").options].some(x => x.value === d.template_sku)) {
      $("pe-template").add(new Option(d.template_sku,d.template_sku));
    }
    $("pe-template").value = d.template_sku;
    $("pe-seo-title-input").value = d.seo_title;
    $("pe-seo-description-input").value = d.seo_description;
    $("pe-handle").value = d.url_handle;
    syncPreview();
    markSaved();
    note("Changes discarded.");
  }
  function getDraft() {
    return {
      title: $("pe-title").value.trim(),
      body_html: getBody(),
      visibility: document.querySelector('[name="pe-visibility"]:checked')?.value || "hidden",
      template_sku: $("pe-template").value,
      seo_title: $("pe-seo-title-input").value.trim(),
      seo_description: $("pe-seo-description-input").value.trim(),
      url_handle: $("pe-handle").value.trim().toLowerCase()
    };
  }
  function syncPreview() {
    const d = getDraft();
    $("pe-heading").textContent = d.title || "Edit page";
    $("pe-seo-title").textContent = d.seo_title || d.title || "Page title";
    $("pe-seo-description").textContent = d.seo_description || editor.textContent.trim().slice(0,160) || "Add a description to improve your search preview.";
    $("pe-seo-count").textContent = d.seo_title.length + " of 70 characters used";
    $("pe-meta-count").textContent = d.seo_description.length + " of 160 characters used";
    const urlPath = page?.route_path === "/" ? "/" : currentRoute(d.url_handle || "page");
    const publicUrl = window.cmsPublicPageUrl(site || {}, urlPath);
    $("pe-seo-url").textContent = publicUrl || "Site address not verified · " + urlPath;
  }
  function enterSourceMode(next) {
    sourceMode = next;
    if (next) $("pe-source").value = editor.innerHTML;
    else editor.innerHTML = safeHtml($("pe-source").value);
    $("pe-source").hidden = !next;
    editor.hidden = next;
    document.querySelector('[data-cmd="source"]').classList.toggle("is-active",next);
    markDirty();
  }
  function command(name) {
    if (name === "source") return enterSourceMode(!sourceMode);
    if (sourceMode) return note("Return to visual editing to use formatting actions.",true);
    editor.focus();
    if (name === "link") {
      const entered = prompt("Link URL (https:// or /path)");
      const href = safeUrl(entered,false);
      if (href) document.execCommand("createLink",false,href);
      else if (entered) return note("Use a valid link URL.",true);
    } else if (name === "image") {
      openMediaPicker();
      return;
    } else if (name === "table") {
      document.execCommand("insertHTML",false,'<table><tbody><tr><td>Cell 1</td><td>Cell 2</td></tr><tr><td>Cell 3</td><td>Cell 4</td></tr></tbody></table><p></p>');
    } else document.execCommand(name,false,null);
    markDirty();
  }
  async function load() {
    if (!window.cmsActiveSiteId) { note("Choose a store from your profile menu first.",true); return; }
    if (initialNewPage) {
      try {
        const list = await cmsAdminFetch("/api/admin/cms/pages");
        site = list.site || {};
        $("pe-heading").textContent = "Add page";
        $("pe-template").innerHTML = '<option value="">Default page</option>';
        $("pe-handle").value = "";
        routePrefix = "/pages/";
        $("pe-route-prefix").textContent = routePrefix;
        $("pe-title").value = "";
        $("pe-seo-title-input").value = "";
        $("pe-seo-description-input").value = "";
        document.querySelector('[name="pe-visibility"][value="hidden"]').checked = true;
        $("pe-visibility-meta").textContent = "Hidden until you publish this page";
        $("pe-seo-site").textContent = site.name || site.slug || "Your store";
        $("pe-prev").disabled = true;
        $("pe-next").disabled = true;
        $("pe-duplicate").disabled = true;
        $("pe-view").setAttribute("aria-disabled","true");
        syncPreview();
        markSaved();
        return;
      } catch(error) { note(error?.message || "Unable to load store information",true);return; }
    }
    try {
      const [pageRes, draftRes, listRes] = await Promise.all([
        cmsAdminFetch("/api/admin/cms/pages/" + encodeURIComponent(slug)),
        cmsAdminFetch("/api/admin/cms/pages/" + encodeURIComponent(slug) + "/content-draft"),
        cmsAdminFetch("/api/admin/cms/pages").catch(() => ({pages:[]}))
      ]);
      page = pageRes.page;
      site = page?.site || pageRes.site || listRes.site || {};
      if (!page?.id) throw Error("Page record unavailable");
      const savedSections = Array.isArray(page.sections) ? page.sections : [];
      const visibleSections = savedSections.filter(section => section.status !== "hidden");
      const sectionNote = $("pe-section-source-note");
      const sectionCount = $("pe-section-count");
      const sectionDetail = $("pe-section-note-detail");
      const sectionLink = $("pe-open-theme-studio");
      if (savedSections.length) {
        sectionNote.hidden = false;
        sectionCount.textContent = visibleSections.length + " saved section" + (visibleSections.length === 1 ? "" : "s");
        sectionDetail.textContent = " make up this page's layout and content in Theme Studio. This field is optional page copy; it does not replace those sections.";
        sectionLink.href = "/admin/sites/" + encodeURIComponent(site.id || window.cmsActiveSiteId) +
          "/pages/" + encodeURIComponent(page.id) + "/editor?previewMode=desktop";
        sectionLink.textContent = "Edit sections in Theme Studio";
        const missing = Array.isArray(page.missing_source_sections) ? page.missing_source_sections : [];
        $("pe-section-source-warning").hidden = missing.length === 0;
      } else {
        try {
          const themeCatalog = await cmsAdminFetch("/api/admin/cms/themes");
          const selectedTheme = themeCatalog?.preview_theme || themeCatalog?.active_theme;
          if (selectedTheme?.project_id) {
            const projectResult = await cmsAdminFetch("/api/admin/cms/theme-projects/" + encodeURIComponent(selectedTheme.project_id));
            const themePage = projectResult?.project?.pages?.find(item => item.slug === page.slug) ||
              projectResult?.project?.pages?.find(item => item.slug === page.page_type);
            if (themePage?.slug) {
              sectionNote.hidden = false;
              sectionCount.textContent = "No page-specific sections";
              sectionDetail.textContent = ". This page inherits its layout from the " +
                String(selectedTheme.name || "selected theme") + " template. This field is optional page copy.";
              sectionLink.href = "/admin/sites/" + encodeURIComponent(site.id || window.cmsActiveSiteId) +
                "/themes/" + encodeURIComponent(selectedTheme.project_id) + "/editor/" + encodeURIComponent(themePage.slug);
              sectionLink.textContent = "Edit inherited theme template";
              $("pe-section-source-warning").hidden = true;
            } else sectionNote.hidden = true;
          } else sectionNote.hidden = true;
        } catch { sectionNote.hidden = true; }
      }
      window.cmsActivePageId = page.id;
      siblings = (listRes.pages || []).filter(p => p.slug !== "site");
      const locationUrl = new URL(location.href);
      locationUrl.searchParams.set("page_id", page.id);
      history.replaceState(null,"",locationUrl);
      const seo = parseJson(page.seo_json);
      const draft = draftRes?.draft || {};
      $("pe-title").value = draft.title ?? page.title ?? "";
      editor.innerHTML = safeHtml(draft.body_html ?? parseJson(page.metadata_json).body_html ?? "");
      const visibility = draft.visibility ?? (page.status === "published" ? "visible" : "hidden");
      document.querySelector('[name="pe-visibility"][value="' + visibility + '"]').checked = true;
      $("pe-visibility-meta").textContent = page.status === "published"
        ? "Currently visible on your online store" : "Visibility takes effect when this page is published";
      const currentTemplate = String(draft.template_sku || page.template_sku || page.template_key || "");
      $("pe-template").innerHTML = '<option value="">Default page</option>' +
        (currentTemplate ? '<option value="' + escaped(currentTemplate) + '">' + escaped(currentTemplate) + '</option>' : '');
      $("pe-template").value = currentTemplate;
      $("pe-seo-title-input").value = draft.seo_title ?? seo.title ?? "";
      $("pe-seo-description-input").value = draft.seo_description ?? seo.description ?? "";
      routePrefix = routePrefixFor(page.route_path);
      $("pe-route-prefix").textContent = routePrefix;
      $("pe-handle").value = draft.url_handle ?? page.slug ?? slug;
      const homepage = page.route_path === "/" || page.slug === "site" || page.is_system_page;
      $("pe-handle").readOnly = homepage;
      $("pe-handle-help").textContent = homepage
        ? "This page has a protected route. Its URL cannot be changed here."
        : "The new URL stays in your draft until you publish. Your current live URL remains unchanged.";
      $("pe-seo-site").textContent = site.name || site.slug || "Your store";
      updatePublicLink();
      const pos = siblings.findIndex(item => item.id === page.id);
      $("pe-prev").disabled = pos < 1;
      $("pe-next").disabled = pos < 0 || pos === siblings.length-1;
      syncPreview();
      markSaved();
      $("pe-publish").disabled = page.status === "archived";
      note(draftRes?.draft ? "Your saved page draft is ready to edit." : "");
    } catch (error) {
      note(error?.message || "Unable to load this page.",true);
    }
  }
  async function save() {
    if (saving) return false;
    const d = getDraft();
    if (!d.title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(d.url_handle) || d.url_handle.length > 80) {
      note("Enter a title and a valid lowercase URL handle.",true); return false;
    }
    saving = true;
    const button = $("pe-save");
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      let createdNow = false;
      if (!page) {
        const created = await cmsAdminFetch("/api/admin/cms/pages",{
          method:"POST",
          body:JSON.stringify({title:d.title,slug:d.url_handle,route_path:currentRoute(d.url_handle),page_type:"standard"})
        });
        if (!created?.page?.id || !created.page.slug) throw Error("The CMS did not return a newly created page.");
        page = created.page;
        slug = page.slug;
        window.cmsActivePageId = page.id;
        window.cmsActivePageSlug = slug;
        createdNow = true;
        $("pe-duplicate").disabled = false;
        $("pe-heading").textContent = page.title;
      }
      const oldSlug = page.slug;
      if (d.url_handle !== page.slug &&
          (page.route_path === "/" || page.is_system_page || page.slug === "site")) {
        throw Error("This page has a protected URL and cannot be renamed.");
      }
      // Keep the live route stable while edits are private. Publication commits
      // the new slug, route, redirect alias and verified HTML together.
      // A newly created or unpublished page can persist its title, template and SEO
      // directly in the canonical CMS draft. Published pages keep these fields private.
      if (page.status === "draft") {
        const updated = await cmsAdminFetch("/api/admin/cms/pages/" + encodeURIComponent(slug),{
          method:"PUT",body:JSON.stringify({title:d.title,template_sku:d.template_sku || null,
            seo_title:d.seo_title,meta_description:d.seo_description})
        });
        if (!updated?.page?.id) throw Error("The page settings could not be verified.");
        page = updated.page;
      }
      // Always route subsequent saves by the stable CMS page id (including newly-created pages).
      window.cmsActivePageId = page.id;
      window.cmsActivePageSlug = page.slug;
      await cmsAdminFetch("/api/admin/cms/pages/" + encodeURIComponent(slug) + "/content-draft",{
        method:"PUT", body:JSON.stringify(d)
      });
      const url = new URL(location.href);
      url.searchParams.delete("new");
      url.searchParams.set("slug",page.slug);
      url.searchParams.set("page_id",page.id);
      history.replaceState(null,"",url);
      updatePublicLink();
      syncPreview();
      markSaved();
      note(createdNow ? "Page created and saved to your store's draft library." :
        oldSlug !== d.url_handle ? "Draft saved. The new URL and old-URL redirect will go live together when you publish." :
        "Page draft saved. Select Publish to make this page public.");
      return true;
    } catch(error) {
      note(error?.message || "Could not save page.",true);
      button.disabled = false;
      return false;
    } finally {
      saving = false;
      button.textContent = "Save";
    }
  }
  async function preview() {
    if (!page?.id) { note("Save the new page to preview its website rendering.",true);return; }
    try {
      const rendered = await cmsAdminFetch("/api/admin/cms/pages/" + encodeURIComponent(slug) + "/preview",{
        method:"POST",body:JSON.stringify(getDraft())
      });
      if (!rendered?.html) throw Error("The website renderer returned no preview.");
      $("pe-preview-frame").srcdoc = rendered.html;
      $("pe-preview-dialog").showModal();
    } catch(error) { note(error?.message || "Unable to preview this page.",true); }
  }
  async function publish() {
    if ($("pe-publish").disabled) return;
    $("pe-more-menu").hidden = true;
    const button = $("pe-publish");
    button.disabled = true;
    $("pe-publish-action").disabled = true;
    try {
      if (dirty || !page?.id) {
        if (!(await save())) throw Error("Save the page draft successfully before publishing.");
      }
      if (!page?.id) throw Error("The CMS page was not created.");
      const published = await cmsAdminFetch("/api/admin/cms/pages/" + encodeURIComponent(slug) + "/publish",{
        method:"POST",body:JSON.stringify({confirm:"publish"})
      });
      if (!published?.ok || published.status !== "published" || published.page_id !== page.id)
        throw Error(published?.error || "The CMS did not confirm publication.");
      page.status = "published";
      page.slug = published.slug || page.slug;
      page.route_path = published.route_path || page.route_path;
      page.title = getDraft().title;
      page.content_object_key = published.key;
      slug = page.slug;
      window.cmsActivePageSlug = slug;
      const publishedUrl = new URL(location.href);
      publishedUrl.searchParams.set("slug",slug);
      publishedUrl.searchParams.set("page_id",page.id);
      history.replaceState(null,"",publishedUrl);
      updatePublicLink();
      const url = hostedPageUrl();
      $("pe-publication-notice").hidden = false;
      $("pe-publication-message").textContent = url
        ? "Page published successfully. Your CMS page is live."
        : "Page published successfully. Connect a verified primary domain to open its public URL.";
      $("pe-publication-link").hidden = !url;
      if (url) $("pe-publication-link").href = url;
      $("pe-publication-new").href = "/admin/page-edit?" + new URLSearchParams({site_id:site.id,new:"1"});
      note("Published " + published.route_path + " to the site-owned website runtime.");
    } catch(error) { note(error?.message || "Publishing failed.",true); }
    finally {button.disabled = false;$("pe-publish-action").disabled = false;}
  }
  function navigateSibling(delta) {
    const at = siblings.findIndex(p => p.id === page?.id);
    const next = siblings[at+delta];
    if (!next) return;
    if (dirty && !confirm("Leave this page without saving your changes?")) return;
    const nextParams = new URLSearchParams({ slug:next.slug,site_id:window.cmsActiveSiteId,page_id:next.id });
    window.cmsAdminNavigate("/admin/page-edit?" + nextParams);
  }
  async function duplicate() {
    if (!page) return;
    const d = getDraft();
    const name = prompt("Name for the duplicated page", (d.title || "Page") + " copy");
    if (!name?.trim()) return;
    const copySlug = String(name).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,70);
    if (!copySlug) return note("Invalid duplicate title",true);
    try {
      const result = await cmsAdminFetch("/api/admin/cms/pages",{
        method:"POST",body:JSON.stringify({title:name.trim(),slug:copySlug,route_path:"/pages/"+copySlug,page_type:page.page_type||"standard"})
      });
      const created = result.page;
      if (!created?.id) throw Error("Duplicate page could not be opened.");
      const route = "/api/admin/cms/pages/" + encodeURIComponent(created.slug) + "/content-draft?site_id=" + encodeURIComponent(window.cmsActiveSiteId) + "&page_id=" + encodeURIComponent(created.id);
      await cmsAdminFetch(route,{method:"PUT",body:JSON.stringify({...d,title:name.trim(),url_handle:copySlug})});
      window.cmsAdminNavigate("/admin/page-edit?"+new URLSearchParams({site_id:window.cmsActiveSiteId,page_id:created.id,slug:created.slug}));
    } catch(error) { note(error?.message || "Could not duplicate page",true); }
  }
  async function openMediaPicker() {
    $("pe-media-dialog").showModal();
    $("pe-media-list").textContent = "Loading Library…";
    try {
      const res = await adminFetch("/api/admin/media?view=all");
      assets = (res.assets || res.media || []).filter(a =>
        /^image\//.test(a.content_type || "") || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(a.url || "")
      );
      drawMedia();
    } catch(error) { $("pe-media-list").textContent = error?.message || "Library unavailable"; }
  }
  function drawMedia() {
    const term = $("pe-media-search").value.trim().toLowerCase();
    const choices = assets.filter(a => ((a.filename||"")+" "+(a.folder||"")).toLowerCase().includes(term));
    $("pe-media-list").replaceChildren();
    if (!choices.length) { $("pe-media-list").textContent = "No images match this search.";return; }
    choices.forEach(asset => {
      const src = safeUrl(asset.url,true);
      if (!src) return;
      const button = document.createElement("button");button.type="button";
      const image = document.createElement("img");image.src = src;image.alt = "";
      const label = document.createElement("span");label.textContent=asset.filename||"Library image";
      button.append(image,label);
      button.addEventListener("click",() => {
        $("pe-media-dialog").close();
        editor.focus();
        document.execCommand("insertImage",false,src);
        markDirty();
      });
      $("pe-media-list").append(button);
    });
  }
  document.querySelectorAll("[data-cmd]").forEach(el => el.addEventListener("click",() => command(el.dataset.cmd)));
  $("pe-format").addEventListener("change",e => {editor.focus();document.execCommand("formatBlock",false,e.target.value);markDirty();});
  document.querySelectorAll("#pe-title,#pe-seo-title-input,#pe-seo-description-input,#pe-handle,#pe-template,#pe-source")
    .forEach(el => {el.addEventListener("input",markDirty);el.addEventListener("change",markDirty);});
  $("pe-title").addEventListener("input",()=>{
    if (!page && !$("pe-handle").dataset.userEdited) {
      $("pe-handle").value = $("pe-title").value.toLowerCase()
        .replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
      syncPreview();
    }
  });
  $("pe-handle").addEventListener("input",()=>{$("pe-handle").dataset.userEdited="true";});
  document.querySelectorAll('[name="pe-visibility"]').forEach(el => el.addEventListener("change",markDirty));
  editor.addEventListener("input",markDirty);
  $("pe-seo-toggle").addEventListener("click",() => {
    $("pe-seo-fields").hidden = !$("pe-seo-fields").hidden;
    $("pe-seo-toggle").setAttribute("aria-expanded",String(!$("pe-seo-fields").hidden));
  });
  $("pe-save").addEventListener("click",save);
  $("pe-discard").addEventListener("click",discardChanges);
  // The Page Editor owns its floating Save control; do not open a second host dock.
  window.publishDockEdit?.({active:false,dirty:false,canSave:false});
  $("pe-preview-action").addEventListener("click",preview);
  $("pe-duplicate").addEventListener("click",duplicate);
  $("pe-more").addEventListener("click",event => {event.stopPropagation();$("pe-more-menu").hidden = !$("pe-more-menu").hidden;});
  document.addEventListener("click",event=> {if(!event.target.closest(".pe-menu-wrap")) $("pe-more-menu").hidden=true;});
  $("pe-publish").addEventListener("click",publish);
  $("pe-publish-action").addEventListener("click",publish);
  $("pe-prev").addEventListener("click",()=>navigateSibling(-1));
  $("pe-next").addEventListener("click",()=>navigateSibling(1));
  $("pe-media-search").addEventListener("input",drawMedia);
  document.querySelectorAll("[data-close-dialog]").forEach(button => button.addEventListener("click",()=>$(button.dataset.closeDialog).close()));
  document.addEventListener("keydown",event=>{
    if ((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="s") {event.preventDefault();void save();}
  });
  window.addEventListener("beforeunload",event => { if(dirty){event.preventDefault();event.returnValue="";}});
  void load();
})();