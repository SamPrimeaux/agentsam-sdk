/** Reusable media picker — attach existing provider-backed assets to products. */

(function () {
  const PICKER_TABS = [
    { id: "all", label: "All media", query: "view=all" },
    { id: "products", label: "Products", query: "folder=products" },
    { id: "images", label: "Images", query: "folder=images" },
  ];

  let backdrop = null;
  let resolvePick = null;
  let assets = [];
  let selected = new Set();
  let activeTab = "all";
  let activeBucket = "";
  let availableBuckets = [];

  function ensurePickerDom() {
    if (document.getElementById("media-picker-backdrop")) return;

    backdrop = document.createElement("div");
    backdrop.id = "media-picker-backdrop";
    backdrop.className = "media-picker-backdrop";
    backdrop.innerHTML = `
      <div class="media-picker-modal" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
        <header class="media-picker-head">
          <div>
            <h2 id="media-picker-title">Browse Media</h2>
          </div>
          <button type="button" class="media-picker-close" id="media-picker-close" aria-label="Close">×</button>
        </header>
        <div class="media-picker-toolbar">
          <div class="media-picker-tabs" id="media-picker-tabs"></div>
          <select id="media-picker-bucket" aria-label="R2 bucket" style="display:none;max-width:180px;border:1px solid #c9c9c9;border-radius:8px;padding:8px;font-size:13px;background:white"><option value="">All connected buckets</option></select>
          <input type="search" id="media-picker-search" class="media-picker-search" placeholder="Search filename or path…">
          <button type="button" class="btn ghost small" id="media-picker-sync">Sync from R2</button>
        </div>
        <div class="media-picker-grid" id="media-picker-grid">
          <p class="media-picker-empty">Loading…</p>
        </div>
        <footer class="media-picker-foot">
          <span id="media-picker-count">0 selected</span>
          <div class="media-picker-foot-actions">
            <button type="button" class="btn ghost" id="media-picker-cancel">Cancel</button>
            <button type="button" class="btn primary" id="media-picker-confirm" disabled>Attach selected</button>
          </div>
        </footer>
      </div>`;
    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closePicker(null);
    });
    document.getElementById("media-picker-close").addEventListener("click", () => closePicker(null));
    document.getElementById("media-picker-cancel").addEventListener("click", () => closePicker(null));
    document.getElementById("media-picker-confirm").addEventListener("click", confirmPick);
    document.getElementById("media-picker-search").addEventListener("input", renderGrid);
    document.getElementById("media-picker-sync").addEventListener("click", () => loadAssets(true));
    document.getElementById("media-picker-bucket").addEventListener("change", (e) => { activeBucket = e.target.value; selected.clear(); renderGrid(); });
    document.getElementById("media-picker-tabs").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-tab]");
      if (!btn) return;
      activeTab = btn.dataset.tab;
      document.querySelectorAll("#media-picker-tabs [data-tab]").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.tab === activeTab);
      });
      loadAssets(false);
    });

    document.getElementById("media-picker-grid").addEventListener("click", (e) => {
      const tile = e.target.closest("[data-asset-id]");
      if (!tile) return;
      const id = Number(tile.dataset.assetId);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      renderGrid();
    });
  }

  function closePicker(result) {
    backdrop?.classList.remove("is-open");
    document.body.classList.remove("media-picker-open");
    const done = resolvePick;
    resolvePick = null;
    done?.(result);
  }

  function confirmPick() {
    const picked = assets.filter((a) => selected.has(a.id));
    closePicker(picked);
  }

  function updateCount() {
    const el = document.getElementById("media-picker-count");
    const btn = document.getElementById("media-picker-confirm");
    const n = selected.size;
    if (el) el.textContent = `${n} selected`;
    if (btn) btn.disabled = n === 0;
  }

  function isImageAsset(a) {
    const ct = (a.content_type || "").toLowerCase();
    if (ct.startsWith("image/")) return true;
    const ext = (a.filename || "").split(".").pop()?.toLowerCase() || "";
    return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
  }

  function filteredAssets() {
    const q = (document.getElementById("media-picker-search")?.value || "").trim().toLowerCase();
    return assets.filter((a) => {
      if (!isImageAsset(a)) return false;
      if (activeBucket && String(a.r2_bucket || a.bucket || "") !== activeBucket) return false;
      if (!q) return true;
      const hay = `${a.filename} ${a.r2_key || ""} ${a.url}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderGrid() {
    const grid = document.getElementById("media-picker-grid");
    if (!grid) return;
    const list = filteredAssets();
    updateCount();

    if (!list.length) {
      grid.innerHTML =
        '<p class="media-picker-empty">No media found.</p>';
      return;
    }

    grid.innerHTML = list
      .map(
        (a) => `
      <button type="button" class="media-picker-tile${selected.has(a.id) ? " is-selected" : ""}" data-asset-id="${a.id}" title="${a.r2_key || a.filename}">
        <img src="${a.url}" alt="" loading="lazy">
        <span class="media-picker-tile-name">${a.filename}</span>
      </button>`
      )
      .join("");
  }

  function renderTabs() {
    const tabs = document.getElementById("media-picker-tabs");
    if (!tabs) return;
    tabs.innerHTML = PICKER_TABS.map(
      (t) =>
        `<button type="button" class="media-picker-tab${t.id === activeTab ? " is-active" : ""}" data-tab="${t.id}">${t.label}</button>`
    ).join("");
  }

  async function loadAssets(sync) {
    const grid = document.getElementById("media-picker-grid");
    if (grid) grid.innerHTML = '<p class="media-picker-empty">Loading…</p>';

    const tab = PICKER_TABS.find((t) => t.id === activeTab) || PICKER_TABS[0];
    const syncParam = sync ? "&sync=1" : "";
    try {
      const data = await adminFetch(`/api/admin/media?${tab.query}${syncParam}`);
      assets = data.assets || [];
      // Only show buckets explicitly exposed by the authorized media provider
      // or already represented by accessible assets; never enumerate unrelated account buckets.
      const declared = Array.isArray(data.buckets) ? data.buckets.map((b) => typeof b === "string" ? b : b?.name).filter(Boolean) : [];
      availableBuckets = [...new Set([...declared, ...assets.map((a) => a.r2_bucket || a.bucket).filter(Boolean)])].sort();
      if (activeBucket && !availableBuckets.includes(activeBucket)) activeBucket = "";
      const bucketInput = document.getElementById("media-picker-bucket");
      bucketInput.replaceChildren(new Option("All connected buckets", ""));
      availableBuckets.forEach((name) => bucketInput.add(new Option(name, name)));
      bucketInput.style.display = availableBuckets.length ? "" : "none";
      bucketInput.value = activeBucket;
      renderGrid();
    } catch (err) {
      if (grid) grid.innerHTML = `<p class="media-picker-empty">${err.message}</p>`;
    }
  }

  /**
   * @param {{ title?: string, multi?: boolean, preselected?: number[] }} options
   * @returns {Promise<Array|null>} selected assets or null if cancelled
   */
  window.openMediaPicker = function openMediaPicker(options = {}) {
    ensurePickerDom();
    selected = new Set(options.preselected || []);
    activeTab = "all";
    activeBucket = "";
    if (options.multi === false) selected = new Set();

    const title = document.getElementById("media-picker-title");
    if (title) title.textContent = options.title || "Browse Media";

    renderTabs();
    backdrop.classList.add("is-open");
    document.body.classList.add("media-picker-open");
    loadAssets(true);

    return new Promise((resolve) => {
      resolvePick = (result) => {
        if (result && options.multi === false && result.length > 1) {
          resolve([result[0]]);
        } else {
          resolve(result);
        }
      };
    });
  };
})();
