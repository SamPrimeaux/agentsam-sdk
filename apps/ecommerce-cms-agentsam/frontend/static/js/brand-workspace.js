/**
 * Portable Brand workspace UI.
 * Identity comes from company; assets come from media_assets.
 */
(() => {
  let workspace = null;
  let pickerRole = null;
  let pickerQuery = "";
  let loaded = false;
  let loading = false;
  let dirty = false;

  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  async function api(path, init = {}) {
    // shell.js adminFetch is the shared admin transport: it parses JSON,
    // redirects on 401, and throws on non-2xx responses. Do not treat its
    // parsed return value like a native Response.
    const data = await adminFetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    if (!data || data.ok === false) {
      throw new Error(data?.error || "Brand request failed");
    }
    return data;
  }

  function showNote(message, kind = "success") {
    const note = $("brand-note");
    if (!note) return;
    note.textContent = message;
    note.className = "admin-note " + kind;
    note.style.display = "block";
    window.setTimeout(() => {
      note.style.display = "none";
    }, 3600);
  }

  function setColor(inputId, pickerId, value, fallback) {
    const input = $(inputId);
    const picker = $(pickerId);
    const next = value || "";
    if (input) input.value = next;
    if (picker) picker.value = /^#[0-9a-f]{6}$/i.test(next) ? next : fallback;
  }

  function setSaveStatus(message, isDirty = dirty) {
    const status = $("brand-save-status");
    if (status) {
      status.textContent = message || (isDirty ? "Unsaved changes" : "All changes saved");
      status.classList.toggle("is-dirty", !!isDirty);
    }
    for (const id of ["brand-save", "brand-save-bottom"]) {
      const button = $(id);
      if (button) button.disabled = !loaded || loading || (!isDirty && !!workspace);
    }
  }

  function markDirty() {
    if (!loaded || loading) return;
    dirty = true;
    setSaveStatus("Unsaved changes", true);
    const name = $("brand-name");
    if (name) $("brand-preview-name").textContent = name.value || "Brand";
    const tagline = $("brand-tagline");
    if (tagline) $("brand-preview-tagline").textContent = tagline.value || "Add a tagline to define the brand voice.";
    renderSwatches();
  }

  function renderSwatches() {
    const node = $("brand-preview-swatches");
    if (!node) return;
    const values = [
      $("brand-primary-color")?.value,
      $("brand-profile-secondaryColor")?.value,
      $("brand-profile-textColor")?.value,
      $("brand-auth-bg")?.value,
    ].filter((color) => /^#[0-9a-f]{6}$/i.test(color || ""));
    node.innerHTML = values.map((color) => '<span style="background:' + esc(color) + '" title="' + esc(color) + '"></span>').join("");
  }

  function showMissingImage(image, label = "Image unavailable") {
    if (!image || image.dataset.fallbackDone) return;
    image.dataset.fallbackDone = "1";
    const roleCard = image.closest(".brand-role-card");
    if (roleCard) {
      roleCard.classList.add("has-broken-asset");
      const state = roleCard.querySelector(".brand-role-state");
      if (state) {
        state.textContent = "File unavailable";
        state.classList.remove("is-assigned");
      }
    }
    const fallback = document.createElement("span");
    fallback.className = "brand-image-fallback";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", label);
    fallback.textContent = "Image unavailable — choose another asset";
    image.replaceWith(fallback);
  }

  function bindImageFallback(container) {
    if (!container || container.dataset.brandImageFallbackBound) return;
    container.dataset.brandImageFallbackBound = "1";
    container.addEventListener("error", (event) => {
      if (event.target instanceof HTMLImageElement) showMissingImage(event.target);
    }, true);
  }

  function renderCompany() {
    const company = workspace?.company || {};
    const source = company.meta?.brand_profile_source;
    const sourceNote = $("brand-source-note");
    if (sourceNote) {
      sourceNote.hidden = !source;
      sourceNote.textContent = source
        ? "Working draft from " + String(source.path || "brand documentation").split("/").pop() +
          " (" + (source.version || "source version unspecified") +
          "). Review and refine with the customer before publishing."
        : "";
    }
    $("brand-name").value = company.name || "";
    $("brand-tagline").value = company.tagline || "";
    $("brand-website").value = company.websiteUrl || "";
    $("brand-support-email").value = company.supportEmail || "";
    setColor("brand-primary-color", "brand-primary-color-picker", company.primaryColor, "#111111");
    setColor("brand-auth-bg", "brand-auth-bg-picker", company.authBgColor, "#ffffff");
    const profile = workspace?.profile || company.meta?.brand_profile || {};
    document.querySelectorAll("[data-brand-profile]").forEach((input) => {
      input.value = profile[input.dataset.brandProfile] || "";
    });
    for (const key of ["secondaryColor", "textColor"]) {
      const value = profile[key] || "";
      const picker = $("brand-" + (key === "secondaryColor" ? "secondary" : "text") + "-color-picker");
      if (picker) picker.value = /^#[0-9a-f]{6}$/i.test(value) ? value : "#111111";
    }
    renderSwatches();
    dirty = false;
    setSaveStatus("All changes saved", false);

    $("brand-preview-name").textContent = company.name || "Brand";
    $("brand-preview-tagline").textContent = company.tagline || "Add a tagline to define the brand voice.";

    const mark = $("brand-preview-mark");
    const logo = workspace?.roles?.find((role) => role.role === "logo")?.url || company.logoUrl;
    mark.innerHTML = logo
      ? '<img src="' + esc(logo) + '" alt="">'
      : '<span>' + esc((company.name || "B").slice(0, 1).toUpperCase()) + "</span>";
    mark.style.background = company.authBgColor || "#f5f5f5";
    bindImageFallback(mark);
  }

  function roleAsset(role) {
    if (!role?.url) return '<div class="brand-role-empty">No asset assigned</div>';
    return '<img loading="lazy" src="' + esc(role.url) + '" alt="' + esc(role.label || role.role) + '">';
  }

  function renderRoles() {
    const grid = $("brand-role-grid");
    const roles = workspace?.roles || [];
    if (!roles.length) {
      grid.innerHTML = '<div class="admin-empty">No brand roles available.</div>';
      return;
    }

    grid.innerHTML = roles
      .map(
        (role) =>
          '<article class="brand-role-card" data-brand-role="' + esc(role.role) + '">' +
          '<div class="brand-role-preview">' + roleAsset(role) + "</div>" +
          '<div class="brand-role-info">' +
          '<div class="brand-role-title"><strong>' + esc(role.label) + '</strong>' +
          '<span class="brand-role-state' + (role.url ? ' is-assigned' : '') + '">' + (role.url ? 'Assigned' : 'Needed') + '</span></div>' +
          "<span title=\"" + esc(role.r2_key || role.url || "") + "\">" + esc((role.r2_key || role.url || "No asset assigned").split("/").pop()) + "</span>" +
          "</div>" +
          '<div class="brand-role-actions">' +
          '<button type="button" class="btn ghost small" data-brand-choose="' + esc(role.role) + '">' + (role.url ? 'Replace' : 'Choose') + '</button>' +
          (role.url
            ? '<button type="button" class="btn ghost small" data-brand-clear="' + esc(role.role) + '">Clear</button>'
            : "") +
          "</div>" +
          "</article>"
      )
      .join("");

    const count = roles.filter((role) => !!role.url).length;
    const countLabel = $("brand-asset-count");
    if (countLabel) countLabel.textContent = count + " / " + roles.length + " roles assigned";
    bindImageFallback(grid);
    grid.querySelectorAll("[data-brand-choose]").forEach((button) => {
      button.addEventListener("click", () => openPicker(button.dataset.brandChoose));
    });
    grid.querySelectorAll("[data-brand-clear]").forEach((button) => {
      button.addEventListener("click", () => clearRole(button.dataset.brandClear));
    });
  }

  function renderPicker() {
    $("brand-picker-count").textContent = pickerTotal + " matching image" + (pickerTotal === 1 ? "" : "s");
    const grid = $("brand-picker-grid");
    grid.innerHTML = pickerLoading && !pickerPage
      ? '<div class="admin-empty" role="status">Searching the media library…</div>'
      : pickerAssets.length
        ? pickerAssets.map((asset) =>
            '<button type="button" class="brand-picker-item" data-brand-asset="' + Number(asset.id) + '">' +
            '<span class="brand-picker-thumb"><img loading="lazy" src="' + esc(asset.url) + '" alt=""></span>' +
            '<span class="brand-picker-name">' + esc(asset.filename) + "</span>" +
            "</button>"
          ).join("")
        : '<div class="admin-empty">No matching images. Open the media library to upload or organize your assets.</div>';

    $("brand-picker-page-status").textContent = pickerLoading
      ? "Loading…"
      : pickerAssets.length + " of " + pickerTotal + " images";
    const more = $("brand-picker-more");
    more.hidden = !pickerHasMore;
    more.disabled = pickerLoading;
    bindImageFallback(grid);
    grid.querySelectorAll("[data-brand-asset]").forEach((button) => {
      button.addEventListener("click", () => assignRole(pickerRole, Number(button.dataset.brandAsset)));
    });
  }

  async function loadPickerPage(page = 1) {
    if (!pickerRole) return;
    const generation = ++pickerGeneration;
    pickerLoading = true;
    if (page === 1) {
      pickerAssets = [];
      pickerPage = 0;
      pickerTotal = 0;
      pickerHasMore = false;
    }
    renderPicker();
    try {
      const data = await api("/api/admin/brand/assets?page=" + page + "&q=" + encodeURIComponent(pickerQuery));
      if (generation !== pickerGeneration || !pickerRole) return;
      pickerAssets = page === 1 ? data.assets || [] : [...pickerAssets, ...(data.assets || [])];
      pickerTotal = Number(data.total || 0);
      pickerHasMore = !!data.has_more;
      pickerPage = page;
    } catch (error) {
      if (generation !== pickerGeneration) return;
      showNote("Could not search media: " + (error.message || error), "error");
    } finally {
      if (generation === pickerGeneration) {
        pickerLoading = false;
        renderPicker();
      }
    }
  }

  function openPicker(role) {
    if (dirty) {
      showNote("Save your brand changes before assigning an asset.", "error");
      $("brand-save")?.focus();
      return;
    }
    pickerRole = role;
    pickerQuery = "";
    $("brand-picker-query").value = "";
    const roleInfo = workspace?.roles?.find((item) => item.role === role);
    $("brand-picker-title").textContent = "Choose " + (roleInfo?.label || "asset");
    const picker = $("brand-picker");
    picker.hidden = false;
    picker.inert = false;
    picker.setAttribute("aria-hidden", "false");
    $("brand-picker-backdrop").classList.add("is-open");
    requestAnimationFrame(() => picker.classList.add("is-open"));
    void loadPickerPage(1);
    $("brand-picker-query").focus();
  }

  function closePicker() {
    pickerGeneration++;
    window.clearTimeout(pickerDebounce);
    const picker = $("brand-picker");
    picker.classList.remove("is-open");
    picker.inert = true;
    picker.setAttribute("aria-hidden", "true");
    $("brand-picker-backdrop").classList.remove("is-open");
    window.setTimeout(() => {
      picker.hidden = true;
      pickerRole = null;
    }, 180);
  }

  async function assignRole(role, mediaAssetId) {
    try {
      workspace = await api("/api/admin/brand", {
        method: "PATCH",
        body: JSON.stringify({ assign: { role, media_asset_id: mediaAssetId } }),
      });
      closePicker();
      renderCompany();
      renderRoles();
      showNote("Brand asset updated.");
    } catch (error) {
      showNote(error.message, "error");
    }
  }

  async function clearRole(role) {
    if (dirty) {
      showNote("Save your brand changes before clearing an asset.", "error");
      $("brand-save")?.focus();
      return;
    }
    const label = workspace?.roles?.find((entry) => entry.role === role)?.label || "brand asset";
    if (!window.confirm("Clear " + label + "?")) return;
    try {
      workspace = await api("/api/admin/brand", {
        method: "PATCH",
        body: JSON.stringify({ clear_role: role }),
      });
      renderCompany();
      renderRoles();
      showNote("Brand asset cleared.");
    } catch (error) {
      showNote(error.message, "error");
    }
  }

  async function saveCompany() {
    if (!workspace || !loaded) return false;
    const save = $("brand-save");
    const saveBottom = $("brand-save-bottom");
    save.disabled = true;
    if (saveBottom) saveBottom.disabled = true;
    setSaveStatus("Saving…", true);
    const profile = {};
    document.querySelectorAll("[data-brand-profile]").forEach((input) => {
      profile[input.dataset.brandProfile] = input.value.trim();
    });
    try {
      workspace = await api("/api/admin/brand", {
        method: "PATCH",
        body: JSON.stringify({
          company: {
            name: $("brand-name").value.trim(),
            tagline: $("brand-tagline").value.trim() || null,
            websiteUrl: $("brand-website").value.trim() || null,
            supportEmail: $("brand-support-email").value.trim() || null,
            primaryColor: $("brand-primary-color").value.trim() || null,
            authBgColor: $("brand-auth-bg").value.trim() || null,
          },
          profile,
        }),
      });
      renderCompany();
      renderRoles();
      showNote("Brand identity, strategy, and channels saved.");
      return true;
    } catch (error) {
      dirty = true;
      setSaveStatus("Save failed — please retry", true);
      showNote(error.message || "Brand save failed", "error");
      return false;
    } finally {
      save.disabled = !dirty;
      if (saveBottom) saveBottom.disabled = !dirty;
    }
  }

  async function load() {
    if (loaded || loading) return;
    loading = true;
    const grid = $("brand-role-grid");
    const save = $("brand-save");
    if (save) save.disabled = true;
    if ($("brand-save-bottom")) $("brand-save-bottom").disabled = true;
    setSaveStatus("Loading brand…");
    if (grid) grid.innerHTML = '<div class="brand-load-state" role="status">Loading brand identity and assets…</div>';
    try {
      const brandRequest = api("/api/admin/brand?include_assets=0");
      const timeout = new Promise((_, reject) => {
        const timer = window.setTimeout(() => reject(new Error("Brand request timed out. Check your connection and try again.")), 15000);
        brandRequest.finally(() => window.clearTimeout(timer)).catch(() => {});
      });
      workspace = await Promise.race([brandRequest, timeout]);
      loaded = true;
      renderCompany();
      renderRoles();
      const note = $("brand-note");
      if (note) note.style.display = "none";
    } catch (error) {
      loaded = false;
      setSaveStatus("Unable to load — retry", false);
      const count = $("brand-asset-count");
      if (count) count.textContent = "Unavailable";
      showNote(error.message || "Brand request failed", "error");
      const tagline = $("brand-preview-tagline");
      if (tagline) tagline.textContent = "Brand data could not be loaded.";
      if (grid) {
        grid.innerHTML =
          '<div class="brand-load-state brand-load-error" role="alert">' +
          '<strong>Could not load brand assets</strong>' +
          '<p>Your brand data could not be loaded. Check your signed-in session or retry. Nothing was changed.</p>' +
          '<div class="brand-load-actions">' +
          '<button type="button" class="btn small" id="brand-load-retry">Try again</button>' +
          '<a class="btn small" href="/admin/login">Sign in</a>' +
          '</div>' +
          '</div>';
        $("brand-load-retry")?.addEventListener("click", load);
      }
    } finally {
      loading = false;
      if (save) save.disabled = !loaded || !dirty;
      if ($("brand-save-bottom")) $("brand-save-bottom").disabled = !loaded || !dirty;
    }
  }

  function showView(view) {
    document.querySelectorAll("[data-content-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.contentPanel !== view;
    });
    document.querySelectorAll("[data-content-view]").forEach((button) => {
      const active = button.dataset.contentView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (view === "brand") void load();
  }

  window.initBrandWorkspace = function initBrandWorkspace() {
    document.querySelectorAll("[data-content-view]").forEach((button) => {
      button.addEventListener("click", () => showView(button.dataset.contentView));
    });
    $("brand-save")?.addEventListener("click", saveCompany);
    $("brand-save-bottom")?.addEventListener("click", saveCompany);
    $("brand-open-library")?.addEventListener("click", () => {
      document.querySelector('[data-content-view="library"]')?.click();
    });
    document.querySelectorAll('#content-view-brand input:not([type="color"]), #content-view-brand textarea').forEach((input) => {
      input.addEventListener("input", markDirty);
    });

    $("brand-picker-close")?.addEventListener("click", closePicker);
    $("brand-picker-backdrop")?.addEventListener("click", closePicker);
    $("brand-picker-query")?.addEventListener("input", (event) => {
      pickerQuery = event.target.value || "";
      window.clearTimeout(pickerDebounce);
      pickerDebounce = window.setTimeout(() => void loadPickerPage(1), 250);
    });

    $("brand-picker-more")?.addEventListener("click", () => {
      if (!pickerLoading && pickerHasMore) void loadPickerPage(pickerPage + 1);
    });
    document.querySelectorAll("[data-brand-color-picker]").forEach((picker) => {
      picker.addEventListener("input", () => {
        const input = $('brand-profile-' + picker.dataset.brandColorPicker);
        if (input) input.value = picker.value;
        markDirty();
      });
    });
    $("brand-primary-color-picker")?.addEventListener("input", (event) => {
      $("brand-primary-color").value = event.target.value;
      $("brand-preview-mark").style.borderColor = event.target.value;
      markDirty();
    });
    $("brand-auth-bg-picker")?.addEventListener("input", (event) => {
      $("brand-auth-bg").value = event.target.value;
      $("brand-preview-mark").style.background = event.target.value;
      markDirty();
    });
  };
})();
