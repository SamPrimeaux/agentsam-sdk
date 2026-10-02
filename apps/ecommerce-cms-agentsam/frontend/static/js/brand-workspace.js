/**
 * Portable Brand workspace UI.
 * Identity comes from company; assets come from media_assets.
 */
(() => {
  let workspace = null;
  let pickerRole = null;
  let pickerQuery = "";
  let loaded = false;

  const $ = (id) => document.getElementById(id);
  const esc = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  async function api(path, init = {}) {
    const response = await adminFetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || "Brand request failed");
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

  function renderCompany() {
    const company = workspace?.company || {};
    $("brand-name").value = company.name || "";
    $("brand-tagline").value = company.tagline || "";
    $("brand-website").value = company.websiteUrl || "";
    $("brand-support-email").value = company.supportEmail || "";
    setColor("brand-primary-color", "brand-primary-color-picker", company.primaryColor, "#111111");
    setColor("brand-auth-bg", "brand-auth-bg-picker", company.authBgColor, "#ffffff");

    $("brand-preview-name").textContent = company.name || "Brand";
    $("brand-preview-tagline").textContent = company.tagline || "Add a tagline to define the brand voice.";

    const mark = $("brand-preview-mark");
    const logo = workspace?.roles?.find((role) => role.role === "logo")?.url || company.logoUrl;
    mark.innerHTML = logo
      ? '<img src="' + esc(logo) + '" alt="">'
      : '<span>' + esc((company.name || "B").slice(0, 1).toUpperCase()) + "</span>";
    mark.style.background = company.authBgColor || "#f5f5f5";
  }

  function roleAsset(role) {
    if (!role?.url) return '<div class="brand-role-empty">No asset assigned</div>';
    return '<img src="' + esc(role.url) + '" alt="' + esc(role.label || role.role) + '">';
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
          '<article class="brand-role-card">' +
          '<div class="brand-role-preview">' + roleAsset(role) + "</div>" +
          '<div class="brand-role-info">' +
          "<strong>" + esc(role.label) + "</strong>" +
          "<span>" + esc(role.r2_key || role.url || "Unassigned") + "</span>" +
          "</div>" +
          '<div class="brand-role-actions">' +
          '<button type="button" class="btn ghost small" data-brand-choose="' + esc(role.role) + '">Choose</button>' +
          (role.url
            ? '<button type="button" class="btn ghost small" data-brand-clear="' + esc(role.role) + '">Clear</button>'
            : "") +
          "</div>" +
          "</article>"
      )
      .join("");

    grid.querySelectorAll("[data-brand-choose]").forEach((button) => {
      button.addEventListener("click", () => openPicker(button.dataset.brandChoose));
    });
    grid.querySelectorAll("[data-brand-clear]").forEach((button) => {
      button.addEventListener("click", () => clearRole(button.dataset.brandClear));
    });
  }

  function matchingPickerAssets() {
    const q = pickerQuery.trim().toLowerCase();
    return (workspace?.assets || []).filter((asset) => {
      if (!q) return true;
      return [asset.filename, asset.alt_text, asset.folder, asset.r2_key]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }

  function renderPicker() {
    const assets = matchingPickerAssets();
    $("brand-picker-count").textContent = assets.length + " image" + (assets.length === 1 ? "" : "s");
    $("brand-picker-grid").innerHTML = assets.length
      ? assets
          .map(
            (asset) =>
              '<button type="button" class="brand-picker-item" data-brand-asset="' + asset.id + '">' +
              '<span class="brand-picker-thumb"><img src="' + esc(asset.url) + '" alt=""></span>' +
              '<span class="brand-picker-name">' + esc(asset.filename) + "</span>" +
              "</button>"
          )
          .join("")
      : '<div class="admin-empty">No image assets match.</div>';

    $("brand-picker-grid").querySelectorAll("[data-brand-asset]").forEach((button) => {
      button.addEventListener("click", () => assignRole(pickerRole, Number(button.dataset.brandAsset)));
    });
  }

  function openPicker(role) {
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
    renderPicker();
    $("brand-picker-query").focus();
  }

  function closePicker() {
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
    const button = $("brand-save");
    button.disabled = true;
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
        }),
      });
      renderCompany();
      renderRoles();
      showNote("Brand identity saved.");
    } catch (error) {
      showNote(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      workspace = await api("/api/admin/brand");
      renderCompany();
      renderRoles();
    } catch (error) {
      loaded = false;
      showNote(error.message, "error");
      $("brand-role-grid").innerHTML = '<div class="admin-empty">Brand workspace unavailable.</div>';
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
    $("brand-picker-close")?.addEventListener("click", closePicker);
    $("brand-picker-backdrop")?.addEventListener("click", closePicker);
    $("brand-picker-query")?.addEventListener("input", (event) => {
      pickerQuery = event.target.value || "";
      renderPicker();
    });

    $("brand-primary-color-picker")?.addEventListener("input", (event) => {
      $("brand-primary-color").value = event.target.value;
      $("brand-preview-mark").style.borderColor = event.target.value;
    });
    $("brand-auth-bg-picker")?.addEventListener("input", (event) => {
      $("brand-auth-bg").value = event.target.value;
      $("brand-preview-mark").style.background = event.target.value;
    });
  };
})();
