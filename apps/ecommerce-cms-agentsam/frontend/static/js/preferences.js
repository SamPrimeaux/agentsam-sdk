(() => {
  const $ = (id) => document.getElementById(id);
  const selectedSiteStorageKey = "agentsam.cms.selected-site.v1";
  const state = {
    sites: [],
    siteId: null,
    site: null,
    settings: {},
    seo: {},
    overview: null,
    hasStorePassword: false,
    clearStorePassword: false,
    passwordChangeOpen: false,
    dirty: false,
    saving: false,
    availableAssets: [],
    pickerKind: "social",
  };

  const clone = (value) => JSON.parse(JSON.stringify(value ?? {}));
  const siteQuery = () => state.siteId ? `?site_id=${encodeURIComponent(state.siteId)}` : "";
  const withSite = (path) => `${path}${path.includes("?") ? "&" : "?"}site_id=${encodeURIComponent(state.siteId || "")}`;
  const setText = (id, value) => { const node = $(id); if (node) node.textContent = value ?? ""; };
  const normalizeDomain = (value) => String(value || "").trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  const safeImageUrl = (value) => !value || (String(value).startsWith("/") && !String(value).startsWith("//")) || /^https:\/\//i.test(String(value));

  function notify(message, kind = "info") {
    const status = $("save-state");
    if (status) {
      status.textContent = message;
      status.dataset.kind = kind;
    }
  }

  function publishDockState() {
    if (typeof window.publishDockEdit !== "function") return;
    if (!state.dirty) {
      window.publishDockEdit({ active: false });
      return;
    }
    window.publishDockEdit({
      active: true,
      hint: `${state.site?.name || "Website"} preferences`,
      dirty: true,
      canSave: !state.saving,
      saveLabel: state.saving ? "Saving…" : "Save changes",
      onSave: savePreferences,
      discardHref: window.location.pathname + window.location.search,
    });
  }

  function markDirty(message = "Unsaved changes") {
    state.dirty = true;
    notify(message, "pending");
    publishDockState();
  }

  function setSiteLinks() {
    const suffix = `site_id=${encodeURIComponent(state.siteId || "")}`;
    for (const id of ["manage-pages-link", "edit-page-seo-link"]) {
      const link = $(id);
      if (link) link.href = `/admin/pages?${suffix}`;
    }
    const structure = $("manage-structure-link");
    if (structure) structure.href = `/admin/structure?${suffix}`;
  }

  function renderSiteContext() {
    const site = state.site || {};
    const overview = state.overview || {};
    const store = overview.store || {};
    const domain = normalizeDomain(site.primary_domain || store.domain);
    setText("site-name", site.name || store.site_name || "Website");
    setText("site-domain", domain || "No primary domain connected");

    const visibility = store.visibility || "unpublished";
    const status = visibility === "password" ? "Password protected" : visibility === "public" ? "Published" : "Not published";
    setText("site-status", status);
    const statusNode = $("site-status");
    if (statusNode) statusNode.dataset.state = visibility;

    const view = $("view-store-link");
    if (view && domain && visibility !== "unpublished") {
      view.href = `https://${domain}`;
      view.hidden = false;
    } else if (view) {
      view.hidden = true;
    }

    const published = (overview.pages || []).filter((page) => page.status === "published").length;
    setText("publishing-summary", visibility === "password"
      ? `${published} published page${published === 1 ? " is" : "s are"} currently behind password protection.`
      : published
        ? `${published} published page${published === 1 ? " is" : "s are"} available to visitors when your store is public.`
        : "No pages are published yet. Publish a page before visitors can see your website.");

    const domainForPreview = domain || "yourwebsite.com";
    setText("search-preview-domain", domainForPreview);
    setText("social-preview-domain", domainForPreview);
    setSiteLinks();
  }

  function updatePreview() {
    const title = $("home-title")?.value.trim() || state.site?.name || "Your homepage title";
    const description = $("meta-description")?.value.trim() || "Your meta description will appear here when available.";
    setText("search-preview-title", title);
    setText("social-preview-title", title);
    setText("search-preview-description", description);
    setText("social-preview-description", description);
    setText("home-title-count", `${($("home-title")?.value || "").length} / 70`);
    setText("meta-description-count", `${($("meta-description")?.value || "").length} / 320`);
    const socialUrl = $("social-image-url-advanced")?.value.trim() || "";
    const preview = $("social-preview-image");
    const thumb = $("social-image-thumb");
    const name = $("social-image-name");
    for (const target of [preview, thumb]) {
      if (!target) continue;
      target.replaceChildren();
      if (socialUrl && safeImageUrl(socialUrl)) {
        const image = document.createElement("img");
        image.src = socialUrl;
        image.alt = "Social sharing image preview";
        image.loading = "lazy";
        target.append(image);
      } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "Choose a sharing image";
        target.append(placeholder);
      }
    }
    if (name) name.textContent = socialUrl ? socialUrl.split("/").pop() || "Selected image" : "No image selected";
    const logoUrl = $("nav-logo-url-advanced")?.value.trim() || "";
    const logo = $("nav-logo-thumb");
    if (logo) {
      logo.replaceChildren();
      if (logoUrl && safeImageUrl(logoUrl)) {
        const image = document.createElement("img");
        image.src = logoUrl;
        image.alt = "Storefront logo preview";
        image.loading = "lazy";
        logo.append(image);
      } else {
        const placeholder = document.createElement("span");
        placeholder.textContent = "Theme logo";
        logo.append(placeholder);
      }
    }
    setText("nav-logo-name", logoUrl ? logoUrl.split("/").pop() || "Selected logo" : "Use the installed theme logo");
  }

  function renderPasswordState() {
    const enabled = $("password-protection")?.checked === true;
    const hasPassword = state.hasStorePassword && !state.clearStorePassword;
    const panel = $("password-panel");
    const fields = $("password-fields");
    if (panel) panel.hidden = !enabled && !hasPassword;
    if (fields) fields.hidden = hasPassword && !state.passwordChangeOpen;
    setText("password-state-text", hasPassword
      ? enabled ? "A store password is saved and protection is active." : "A store password is saved, but protection is currently off."
      : enabled ? "Set a password to turn on storefront protection." : "No store password has been set.");
    const dot = document.querySelector(".sp-password-state .sp-status-dot");
    if (dot) dot.dataset.state = enabled && hasPassword ? "on" : "off";
    const change = $("change-password-button");
    if (change) change.hidden = !hasPassword || state.passwordChangeOpen;
    const remove = $("remove-password-button");
    if (remove) remove.hidden = !hasPassword;
    const label = $("password-label");
    if (label) label.textContent = hasPassword ? "New store access password" : "Store access password";
  }

  function renderAnnouncement() {
    const enabled = $("announcement-enabled")?.checked === true;
    const editor = $("announcement-editor");
    if (editor) editor.classList.toggle("is-disabled", !enabled);
    const text = $("announcement-text")?.value.trim() || "Your announcement will appear here.";
    const preview = $("announcement-preview");
    if (preview) {
      preview.style.backgroundColor = $("announcement-bg-color")?.value || "#1a1a1a";
      preview.style.color = $("announcement-text-color")?.value || "#ffffff";
      preview.classList.toggle("is-marquee", $("announcement-style")?.value === "marquee");
    }
    setText("announcement-preview-text", text);
    setText("announcement-count", `${($("announcement-text")?.value || "").length} / 160`);
  }

  function setColorPair(colorId, textId, value) {
    const color = $(colorId);
    const text = $(textId);
    const safe = /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : "#000000";
    if (color) color.value = safe;
    if (text) text.value = safe;
  }

  function bindColorPair(colorId, textId) {
    const color = $(colorId);
    const text = $(textId);
    color?.addEventListener("input", () => {
      if (text) text.value = color.value;
      renderAnnouncement();
      markDirty();
    });
    text?.addEventListener("change", () => {
      if (!/^#[0-9a-f]{6}$/i.test(text.value.trim())) {
        notify("Use a six-digit hex color value.", "error");
        text.value = color?.value || "#000000";
        return;
      }
      if (color) color.value = text.value.trim();
      renderAnnouncement();
      markDirty();
    });
  }

  function setChosenAsset(kind, url) {
    const inputId = kind === "nav" ? "nav-logo-url-advanced" : "social-image-url-advanced";
    const input = $(inputId);
    if (input) input.value = url || "";
    updatePreview();
    markDirty();
  }

  function applySettings(data) {
    state.settings = data.settings || {};
    state.seo = data.seo || {};
    state.site = data.site || {};
    state.hasStorePassword = state.settings.hasStorePassword === true;
    state.originalHasStorePassword = state.hasStorePassword;
    state.clearStorePassword = false;
    state.passwordChangeOpen = false;

    const s = state.settings;
    const seo = state.seo;
    $("password-protection").checked = s.passwordProtection === true;
    $("password-protection").disabled = false;
    $("home-title").value = seo.home_title ?? s.homeTitle ?? "";
    $("meta-description").value = seo.default_description ?? s.metaDescription ?? "";
    $("social-image-url-advanced").value = seo.default_og_image ?? s.socialImageUrl ?? "";
    $("seo-site-name").value = seo.site_name || "";
    $("seo-title-template").value = seo.title_template || "";
    $("seo-twitter-handle").value = seo.twitter_handle || "";
    $("seo-locale").value = seo.locale || "";
    $("search-indexing").checked = !String(seo.robots || "").toLowerCase().includes("noindex");
    $("nav-logo-url-advanced").value = s.navLogoUrl || "";
    $("nav-logo-height").value = Number(s.navLogoHeight || 58);
    setText("nav-logo-height-value", `${Number(s.navLogoHeight || 58)} px`);
    setColorPair("nav-brand-accent", "nav-brand-accent-text", s.navBrandAccent || "#314c37");
    setColorPair("nav-brand-accent-light", "nav-brand-accent-light-text", s.navBrandAccentLight || "#9ab99b");
    $("announcement-enabled").checked = s.announcementEnabled === true;
    $("announcement-text").value = s.announcementText || "";
    $("announcement-href").value = s.announcementHref || "";
    $("announcement-style").value = s.announcementStyle === "marquee" ? "marquee" : "static";
    setColorPair("announcement-bg-color", "announcement-bg-color-text", s.announcementBgColor || "#1a1a1a");
    setColorPair("announcement-text-color", "announcement-text-color-text", s.announcementTextColor || "#ffffff");

    updatePreview();
    renderPasswordState();
    renderAnnouncement();
    renderSiteContext();
    state.dirty = false;
    notify("All changes saved", "saved");
    publishDockState();
  }

  function collectSettings() {
    const seo = {
      home_title: $("home-title").value.trim(),
      default_description: $("meta-description").value.trim(),
      default_og_image: $("social-image-url-advanced").value.trim(),
      site_name: $("seo-site-name").value.trim(),
      title_template: $("seo-title-template").value.trim(),
      twitter_handle: $("seo-twitter-handle").value.trim(),
      locale: $("seo-locale").value.trim(),
      robots: $("search-indexing").checked ? "index,follow,max-image-preview:large" : "noindex,nofollow",
    };
    const settings = {
      passwordProtection: $("password-protection").checked,
      homeTitle: seo.home_title,
      metaDescription: seo.default_description,
      socialImageUrl: seo.default_og_image,
      navLogoUrl: $("nav-logo-url-advanced").value.trim(),
      navLogoHeight: Number($("nav-logo-height").value || 58),
      navBrandAccent: $("nav-brand-accent").value,
      navBrandAccentLight: $("nav-brand-accent-light").value,
      announcementEnabled: $("announcement-enabled").checked,
      announcementText: $("announcement-text").value.trim(),
      announcementHref: $("announcement-href").value.trim(),
      announcementStyle: $("announcement-style").value,
      announcementBgColor: $("announcement-bg-color").value,
      announcementTextColor: $("announcement-text-color").value,
      seo,
    };
    const password = $("store-password").value;
    const confirm = $("store-password-confirm").value;
    if (password) {
      if (password.length < 8 || password.length > 128) throw new Error("Store passwords must be between 8 and 128 characters.");
      if (password !== confirm) throw new Error("The store password and confirmation do not match.");
      settings.storePassword = password;
    }
    if (state.clearStorePassword) settings.clearStorePassword = true;
    if (settings.passwordProtection && !state.hasStorePassword && !password) {
      throw new Error("Set a store password before enabling password protection.");
    }
    if (!safeImageUrl(settings.socialImageUrl) || !safeImageUrl(settings.navLogoUrl)) {
      throw new Error("Images must use a local media path or an HTTPS URL.");
    }
    return settings;
  }

  async function savePreferences() {
    if (!state.dirty || state.saving) return;
    let settings;
    try { settings = collectSettings(); }
    catch (error) { notify(error.message, "error"); throw error; }
    state.saving = true;
    notify("Saving website preferences…", "pending");
    publishDockState();
    try {
      const result = await adminFetch(`/api/admin/store/preferences${siteQuery()}`, {
        method: "POST",
        body: JSON.stringify({ settings }),
      });
      state.settings = result.settings || state.settings;
      state.seo = result.seo || state.seo;
      state.hasStorePassword = state.settings.hasStorePassword === true;
      state.originalHasStorePassword = state.hasStorePassword;
      state.clearStorePassword = false;
      state.passwordChangeOpen = false;
      $("store-password").value = "";
      $("store-password-confirm").value = "";
      state.dirty = false;
      notify("Changes saved", "saved");
      renderPasswordState();
      await loadOverview();
      await refreshCrawlerDashboard();
      publishDockState();
    } catch (error) {
      notify(error.message || "Could not save website preferences.", "error");
      throw error;
    } finally {
      state.saving = false;
      publishDockState();
    }
  }

  async function loadOverview() {
    const overview = await adminFetch(`/api/admin/store/online${siteQuery()}`);
    state.overview = overview;
    renderSiteContext();
  }

  async function loadPreferences() {
    const [data] = await Promise.all([
      adminFetch(`/api/admin/store/preferences${siteQuery()}`),
      loadOverview(),
    ]);
    applySettings(data);
    await refreshCrawlerDashboard();
  }

  function updateSiteUrl(siteId) {
    const url = new URL(window.location.href);
    if (siteId) url.searchParams.set("site_id", siteId);
    else url.searchParams.delete("site_id");
    history.replaceState(null, "", url);
    try { sessionStorage.setItem(selectedSiteStorageKey, siteId); } catch {}
    state.siteId = siteId;
    window.cmsActiveSiteId = siteId;
    setSiteLinks();
  }

  async function loadSites() {
    const data = await adminFetch("/api/admin/cms/sites");
    state.sites = Array.isArray(data.sites) ? data.sites : [];
    const requested = new URLSearchParams(window.location.search).get("site_id");
    let remembered = null;
    try { remembered = sessionStorage.getItem(selectedSiteStorageKey); } catch {}
    const eligible = (id) => Boolean(id && state.sites.some((site) => site.id === id));
    if (requested && !eligible(requested)) throw new Error("The requested website is not available to this account.");
    state.siteId = requested || (eligible(remembered) ? remembered : null) || data.default_site_id || state.sites[0]?.id || null;
    if (!state.siteId) throw new Error("No website is available for this account. Create a website before editing its preferences.");
    state.site = state.sites.find((site) => site.id === state.siteId) || null;
    const select = $("site-select");
    select.replaceChildren();
    for (const site of state.sites) {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = `${site.name || site.slug || "Website"}${site.primary_domain ? ` · ${normalizeDomain(site.primary_domain)}` : ""}`;
      select.append(option);
    }
    select.value = state.siteId;
    select.disabled = state.sites.length < 2;
    updateSiteUrl(state.siteId);
  }

  async function switchSite(nextSiteId) {
    if (!nextSiteId || nextSiteId === state.siteId) return;
    if (state.dirty && !window.confirm("You have unsaved changes. Switch websites and discard them?")) {
      $("site-select").value = state.siteId;
      return;
    }
    updateSiteUrl(nextSiteId);
    state.site = state.sites.find((site) => site.id === nextSiteId) || null;
    state.overview = null;
    state.settings = {};
    state.seo = {};
    state.dirty = false;
    publishDockState();
    notify("Loading website preferences…", "pending");
    try { await loadPreferences(); }
    catch (error) { notify(error.message || "Could not load this website.", "error"); }
  }

  function setDiscoveryCheck(key, ok, message) {
    const row = document.querySelector(`[data-check="${key}"]`);
    const text = $(`crawler-${key}-state`);
    if (row) row.dataset.state = ok === null ? "unknown" : ok ? "good" : "bad";
    if (text) text.textContent = message;
  }

  async function verifyDiscoveryFiles(site, expectedCount) {
    const currentOrigin = window.location.origin;
    if (!site.origin || new URL(site.origin).origin !== currentOrigin) {
      setDiscoveryCheck("robots", null, "Open the live file to verify");
      setDiscoveryCheck("sitemap", null, "Open the live file to verify");
      setText("crawler-sitemap-count", "—");
      return { count: null, sameOrigin: false };
    }
    let sitemapCount = null;
    try {
      const response = await fetch(site.robots_url || "/robots.txt", { cache: "no-store", credentials: "same-origin" });
      const body = response.ok ? await response.text() : "";
      const ok = response.ok && /user-agent/i.test(body);
      setDiscoveryCheck("robots", ok, !response.ok ? `HTTP ${response.status}` : ok ? "Live and readable" : "No crawl rules found");
    } catch {
      setDiscoveryCheck("robots", false, "Could not read the live file");
    }
    try {
      const response = await fetch(site.sitemap_url || "/sitemap.xml", { cache: "no-store", credentials: "same-origin" });
      const body = response.ok ? await response.text() : "";
      if (!response.ok) {
        setDiscoveryCheck("sitemap", false, `HTTP ${response.status}`);
      } else {
        sitemapCount = (body.match(/<loc>/g) || []).length;
        setDiscoveryCheck("sitemap", sitemapCount === expectedCount, sitemapCount === expectedCount ? `${sitemapCount} URLs · in sync` : `${sitemapCount} URLs · expected ${expectedCount}`);
      }
    } catch {
      setDiscoveryCheck("sitemap", false, "Could not read the live file");
    }
    setText("crawler-sitemap-count", sitemapCount == null ? "—" : String(sitemapCount));
    return { count: sitemapCount, sameOrigin: true };
  }

  async function refreshCrawlerDashboard() {
    const button = $("crawler-refresh-btn");
    if (button) { button.disabled = true; button.textContent = "Checking…"; }
    const pill = $("crawler-status-pill");
    try {
      const data = await adminFetch(`/api/admin/store/crawler${siteQuery()}`);
      const site = data.site || {};
      const counts = data.public_discovery || {};
      setText("crawler-site-domain", site.domain || "Connect a primary domain to publish search discovery files.");
      const robotsLink = $("crawler-robots-link");
      const sitemapLink = $("crawler-sitemap-link");
      if (robotsLink) robotsLink.href = site.robots_url || "/robots.txt";
      if (sitemapLink) sitemapLink.href = site.sitemap_url || "/sitemap.xml";
      const pages = Number(counts.indexable_routes || 0);
      const products = Number(counts.active_products || 0);
      const expected = Number(counts.sitemap_url_count || 0);
      setText("crawler-routes-count", String(pages));
      setText("crawler-products-count", String(products));
      setText("crawler-sitemap-count", counts.password_protected || counts.noindex ? "0" : "—");

      if (counts.password_protected || counts.noindex) {
        pill.textContent = counts.password_protected ? "Password protected" : "Noindex enabled";
        pill.dataset.state = "neutral";
        setDiscoveryCheck("robots", null, counts.password_protected ? "Storewide access is restricted" : "Indexing is disabled in preferences");
        setDiscoveryCheck("sitemap", null, "No public URLs are listed");
        setText("crawler-sitemap-count", "0");
        setText("crawler-notice", counts.password_protected
          ? "Your protected storefront is excluded from the public sitemap and disallowed in robots.txt."
          : "This website is set to noindex. The sitemap is intentionally empty while that setting is active.");
        return;
      }

      if (!site.origin) {
        pill.textContent = "Domain required";
        pill.dataset.state = "warning";
        setDiscoveryCheck("robots", null, "A primary domain is required");
        setDiscoveryCheck("sitemap", null, "A primary domain is required");
        setText("crawler-notice", "Connect a primary domain before search engines can discover your website.");
        return;
      }

      const live = await verifyDiscoveryFiles(site, expected);
      if (!live.sameOrigin) {
        pill.textContent = "Open to verify";
        pill.dataset.state = "neutral";
        setText("crawler-notice", `The selected website publishes an expected ${expected}-URL sitemap. Open the files above to verify them from their own domain.`);
      } else {
        const ready = live.count !== null && live.count === expected &&
          document.querySelector('[data-check="robots"]')?.dataset.state === "good";
        pill.textContent = ready ? "Search-ready" : "Needs attention";
        pill.dataset.state = ready ? "good" : "warning";
        setText("crawler-notice", counts.sitemap_truncated
          ? "The sitemap has reached its 48,000-product limit. A sitemap index is required before more product URLs can be listed."
          : ready ? "The live discovery files are reachable and the sitemap matches the selected website's published content."
            : "The live discovery files do not currently match the selected website's expected sitemap. Re-check after publishing changes.");
      }
    } catch (error) {
      pill.textContent = "Unavailable";
      pill.dataset.state = "warning";
      setDiscoveryCheck("robots", null, "Status unavailable");
      setDiscoveryCheck("sitemap", null, "Status unavailable");
      setText("crawler-routes-count", "—");
      setText("crawler-products-count", "—");
      setText("crawler-sitemap-count", "—");
      setText("crawler-notice", error.message || "Search discovery status could not be loaded.");
    } finally {
      if (button) { button.disabled = false; button.textContent = "Re-check files"; }
    }
  }

  function renderAssets(query = "") {
    const list = $("prefs-assets-grid");
    if (!list) return;
    const needle = query.trim().toLowerCase();
    const assets = state.availableAssets.filter((asset) => String(asset.content_type || "").startsWith("image/") &&
      `${asset.filename || ""} ${asset.folder || ""}`.toLowerCase().includes(needle));
    list.replaceChildren();
    if (!assets.length) {
      const empty = document.createElement("p");
      empty.className = "sp-assets-empty";
      empty.textContent = state.availableAssets.length ? "No matching images." : "No images in the media library yet. Upload one to begin.";
      list.append(empty);
      return;
    }
    for (const asset of assets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sp-asset-tile";
      const image = document.createElement("img");
      image.src = asset.url;
      image.alt = "";
      image.loading = "lazy";
      const name = document.createElement("span");
      name.textContent = asset.filename || "Uploaded image";
      button.append(image, name);
      button.addEventListener("click", () => {
        setChosenAsset(state.pickerKind, asset.url);
        $("prefs-assets-dialog").close();
      });
      list.append(button);
    }
  }

  async function openAssetPicker(kind) {
    state.pickerKind = kind;
    setText("prefs-assets-title", kind === "nav" ? "Choose a storefront logo" : "Choose a social sharing image");
    $("prefs-assets-dialog").showModal();
    setText("prefs-assets-status", "Loading your media library…");
    try {
      const data = await adminFetch("/api/admin/media?limit=120");
      state.availableAssets = data.assets || data.items || [];
      renderAssets($("prefs-assets-search").value);
      setText("prefs-assets-status", `${state.availableAssets.length} media items available.`);
    } catch (error) {
      setText("prefs-assets-status", error.message || "Unable to load media.");
    }
  }

  function bindSectionNavigation() {
    document.querySelectorAll("[data-section-link]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = $(`section-${button.dataset.sectionLink}`);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
    if ("IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        document.querySelectorAll("[data-section-link]").forEach((button) => {
          button.classList.toggle("is-active", button.dataset.sectionLink === visible.target.dataset.section);
        });
      }, { rootMargin: "-18% 0px -68% 0px", threshold: [0, 0.2, 0.5] });
      document.querySelectorAll("[data-section]").forEach((section) => observer.observe(section));
    }
  }

  function bindEvents() {
    $("site-select")?.addEventListener("change", (event) => switchSite(event.target.value));
    $("password-protection")?.addEventListener("change", () => {
      if ($("password-protection").checked && state.clearStorePassword) {
        state.clearStorePassword = false;
        state.hasStorePassword = state.originalHasStorePassword === true;
      }
      if ($("password-protection").checked && !state.hasStorePassword) state.passwordChangeOpen = true;
      renderPasswordState();
      markDirty();
    });
    $("change-password-button")?.addEventListener("click", () => {
      state.passwordChangeOpen = true;
      $("store-password").value = "";
      $("store-password-confirm").value = "";
      renderPasswordState();
      $("store-password")?.focus();
    });
    $("remove-password-button")?.addEventListener("click", () => {
      if (!window.confirm("Remove the saved store password? This also turns off password protection.")) return;
      state.clearStorePassword = true;
      state.hasStorePassword = false;
      $("password-protection").checked = false;
      $("store-password").value = "";
      $("store-password-confirm").value = "";
      state.passwordChangeOpen = false;
      renderPasswordState();
      markDirty();
    });
    $("store-password")?.addEventListener("input", markDirty);
    $("store-password-confirm")?.addEventListener("input", markDirty);

    for (const id of ["home-title", "meta-description", "seo-site-name", "seo-title-template", "seo-twitter-handle", "seo-locale"]) {
      $(id)?.addEventListener("input", () => { updatePreview(); markDirty(); });
    }
    $("search-indexing")?.addEventListener("change", markDirty);
    for (const id of ["social-image-url-advanced", "nav-logo-url-advanced"]) {
      $(id)?.addEventListener("change", () => {
        if (!safeImageUrl($(id).value.trim())) {
          notify("Image URLs must use a local media path or HTTPS.", "error");
          return;
        }
        updatePreview();
        markDirty();
      });
    }
    document.querySelectorAll("[data-pick-asset]").forEach((button) => button.addEventListener("click", () => openAssetPicker(button.dataset.pickAsset)));
    document.querySelectorAll("[data-clear-asset]").forEach((button) => button.addEventListener("click", () => setChosenAsset(button.dataset.clearAsset, "")));
    $("prefs-assets-close")?.addEventListener("click", () => $("prefs-assets-dialog").close());
    $("prefs-assets-search")?.addEventListener("input", (event) => renderAssets(event.target.value));
    $("prefs-assets-upload")?.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      if (files.some((file) => !file.type.startsWith("image/"))) {
        setText("prefs-assets-status", "Choose image files only.");
        return;
      }
      const form = new FormData();
      for (const file of files) form.append("files", file);
      form.append("prefix", "uploads/store-preferences/");
      setText("prefs-assets-status", "Uploading image…");
      try {
        const response = await fetch("/api/admin/media", { method: "POST", credentials: "include", body: form });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `Upload failed (${response.status})`);
        state.availableAssets = [...(data.assets || []), ...state.availableAssets];
        renderAssets($("prefs-assets-search").value);
        setText("prefs-assets-status", "Uploaded. Select the image to use it.");
      } catch (error) {
        setText("prefs-assets-status", error.message || "Upload failed.");
      } finally { event.target.value = ""; }
    });

    $("nav-logo-height")?.addEventListener("input", () => {
      setText("nav-logo-height-value", `${Number($("nav-logo-height").value)} px`);
      markDirty();
    });
    bindColorPair("nav-brand-accent", "nav-brand-accent-text");
    bindColorPair("nav-brand-accent-light", "nav-brand-accent-light-text");

    $("announcement-enabled")?.addEventListener("change", () => { renderAnnouncement(); markDirty(); });
    for (const id of ["announcement-text", "announcement-href", "announcement-style"]) {
      $(id)?.addEventListener("input", () => { renderAnnouncement(); markDirty(); });
      $(id)?.addEventListener("change", () => { renderAnnouncement(); markDirty(); });
    }
    bindColorPair("announcement-bg-color", "announcement-bg-color-text");
    bindColorPair("announcement-text-color", "announcement-text-color-text");
    $("crawler-refresh-btn")?.addEventListener("click", refreshCrawlerDashboard);

    window.addEventListener("beforeunload", (event) => {
      if (!state.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });
    bindSectionNavigation();
  }

  async function init() {
    try {
      await loadSites();
      bindEvents();
      await loadPreferences();
    } catch (error) {
      notify(error.message || "Could not load website preferences.", "error");
      $("site-select").disabled = true;
    }
  }

  init();
})();
