import {
  IMAGE_PREVIEW_PRESETS,
  getImagePreviewPreset,
  previewStyleForPreset,
  previewLabel,
} from "/admin/media-kit/index.js";

/**
 * Provider-neutral virtual-folder media library.
 * Storage/provider identity stays behind the media asset contract; folders, albums,
 * ordering, metadata, and selection are CMS concerns.
 */
(function () {
  const FOLDERS = [
    { id: "images", label: "Images" },
    { id: "videos", label: "Videos" },
    { id: "products", label: "Products" },
  ];

  const FOLDER_ICON =
    '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>';

  const DEFAULT_PLACEMENT = {
    orbitTheta: 42,
    orbitPhi: 62,
    orbitRadius: 112,
    fieldOfView: 30,
    positionX: 0,
    positionY: 0,
    positionZ: 0,
    scale: 1,
  };

  let placement = { ...DEFAULT_PLACEMENT };

  let assets = [];
  let counts = { images: 0, videos: 0, products: 0 };
  let mediaCapabilities = { browser_preview: true, can_materialize_derivatives: false, transform_provider: null };
  let activeFolder = null;
  let selected = null;
  let dragId = null;
  let syncedOnce = false;
  let searchQuery = "";
  let kindFilter = "all";
  let statusFilter = "all";
  let sortMode = "newest";
  let albums = [];
  let activeAlbumId = null;
  let previewPresetId = "original";
  let inspectorTab = "details";
  let page = 1;
  const pageSize = 48;
  let pagination = {
    page: 1,
    page_size: pageSize,
    total: 0,
    pages: 1,
    has_prev: false,
    has_next: false,
  };
  const selectedIds = new Set();
  let lastSelectedId = null;
  let searchTimer = null;

  const els = {};
  let lifecycleController = null;
  let mountGeneration = 0;

  function mountListener(target, type, handler, options = {}) {
    if (!target) return;
    const normalized = typeof options === "boolean" ? { capture: options } : { ...options };
    if (lifecycleController) normalized.signal = lifecycleController.signal;
    target.addEventListener(type, handler, normalized);
  }

  function destroyMediaLibrary() {
    lifecycleController?.abort();
    lifecycleController = null;
    clearTimeout(searchTimer);
    searchTimer = null;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function fmtBytes(n) {
    if (!n) return "—";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / (1024 * 1024)).toFixed(1) + " MB";
  }

  function fmtDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function isBrowsable(a) {
    const ct = (a.content_type || "").toLowerCase();
    const ext = (a.filename || a.r2_key || "").split(".").pop()?.toLowerCase() || "";
    const skip = new Set([
      "json",
      "jsonl",
      "txt",
      "xml",
      "html",
      "htm",
      "css",
      "js",
      "mjs",
      "ts",
      "tsx",
      "map",
      "sql",
      "md",
      "csv",
      "log",
      "yml",
      "yaml",
    ]);
    if (skip.has(ext)) return false;
    if (ct === "application/json" || ct.startsWith("text/")) return false;
    if (ct.startsWith("image/") || ct.startsWith("video/") || ct.startsWith("model/")) return true;
    return ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif", "mp4", "mov", "webm", "glb", "usdz"].includes(ext);
  }

  function assetKind(a) {
    const ct = String(a.content_type || "").toLowerCase();
    const ext = String(a.filename || a.r2_key || "").split(".").pop()?.toLowerCase() || "";
    if (ct.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "webp", "svg", "avif"].includes(ext)) return "image";
    if (ct.startsWith("video/") || ["mp4", "mov", "webm", "m4v"].includes(ext)) return "video";
    if (ct.startsWith("model/") || ["glb", "gltf", "usdz"].includes(ext)) return "model";
    return "other";
  }

  function visibleAssets() {
    const q = searchQuery.trim().toLowerCase();
    return assets
      .filter(isBrowsable)
      .filter((a) => kindFilter === "all" || assetKind(a) === kindFilter)
      .filter((a) => statusFilter === "all" || (a.status || "ready") === statusFilter)
      .filter((a) => {
        if (!q) return true;
        const hay = [
          a.filename,
          a.alt_text,
          a.folder,
          a.category,
          a.r2_key,
          ...(Array.isArray(a.meta?.tags) ? a.meta.tags : []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
  }

  function isModel3d(a) {
    const ct = (a.content_type || "").toLowerCase();
    const ext = (a.filename || "").split(".").pop()?.toLowerCase() || "";
    return ct.includes("model") || ext === "glb" || ext === "usdz" || ext === "gltf";
  }

  function thumbHtml(a) {
    const ct = (a.content_type || "").toLowerCase();
    const src = mediaUrl(a);
    if (isModel3d(a)) {
      // Grid thumbs: avoid black model-viewer canvases — badge until drawer preview.
      const ext = (a.filename || a.r2_key || "").split(".").pop() || "3d";
      return `<span class="media-file-icon" title="3D model">${String(ext).slice(0, 4)}</span>`;
    }
    if (ct.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(a.r2_key || a.filename || "")) {
      return `<img src="${src}" alt="" loading="lazy" decoding="async" onerror="this.classList.add('is-broken')">`;
    }
    if (ct.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(a.r2_key || a.filename || "")) {
      return `<video src="${src}" muted preload="metadata"></video>`;
    }
    const ext = (a.filename || "").split(".").pop() || "file";
    return `<span class="media-file-icon">${ext.slice(0, 4)}</span>`;
  }

  function previewHtml(a) {
    const ct = (a.content_type || "").toLowerCase();
    const src = mediaUrl(a);
    if (isModel3d(a)) {
      const ext = (a.filename || "").split(".").pop()?.toLowerCase() || "";
      const inner =
        ext === "usdz"
          ? `<model-viewer id="media-glb-viewer" src="${src}" ios-src="${src}" camera-controls touch-action="pan-y" interaction-prompt="none" shadow-intensity="0" exposure="1.05" alt="${a.alt_text || a.filename}"></model-viewer>`
          : `<model-viewer id="media-glb-viewer" src="${src}" camera-controls touch-action="pan-y" interaction-prompt="none" shadow-intensity="0" exposure="1.05" environment-image="neutral" alt="${a.alt_text || a.filename}"></model-viewer>`;
      return `<div class="media-glb-stage" id="media-glb-stage"><div class="media-glb-transform" id="media-glb-transform">${inner}</div><p class="media-glb-drag-hint">Drag to orbit · scroll to zoom · Shift+drag to pan frame</p></div>`;
    }
    if (ct.startsWith("image/") || /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(a.r2_key || a.filename || "")) {
      return `<img src="${src}" alt="">`;
    }
    if (ct.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(a.r2_key || a.filename || "")) {
      return `<video src="${src}" controls></video>`;
    }
    return `<div style="padding:40px;text-align:center;color:#888;">Preview not available</div>`;
  }

  function mediaUrl(a) {
    const raw = a.delivery_url || a.url || "";
    try {
      return new URL(raw, location.origin).href;
    } catch {
      return raw;
    }
  }

  function queryUrl() {
    const params = new URLSearchParams();
    params.set("sync", syncedOnce ? "0" : "1");
    params.set("page", String(page));
    params.set("page_size", String(pageSize));
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (kindFilter !== "all") params.set("kind", kindFilter);
    if (statusFilter !== "all") { params.set("status", statusFilter); }
    params.set("sort", sortMode);
    if (activeAlbumId) {
      params.set("album_id", String(activeAlbumId));
      params.set("view", "all");
    } else if (activeFolder) params.set("folder", activeFolder);
    else params.set("view", "all");
    return `/api/admin/media?${params}`;
  }

  async function load() {
    els.grid.innerHTML = '<div class="admin-empty">Loading…</div>';
    try {
      const data = await adminFetch(queryUrl());
      syncedOnce = true;
      assets = data.assets || [];
      counts = data.counts || counts;
      mediaCapabilities = data.capabilities || mediaCapabilities;
      albums = data.albums || albums;
      pagination = data.pagination || pagination;
      page = pagination.page || page;
      renderFolders();
      renderAlbums();
      renderCrumb();
      renderGrid();
      renderBatchBar();
      renderPagination();
    } catch (err) {
      els.grid.innerHTML = `<div class="admin-empty">${err.message}</div>`;
    }
  }

  function bindDelegatedLibraryInteractions() {
    mountListener(els.crumb, "click", (event) => {
      if (!event.target.closest('[data-crumb="home"]')) return;
      activeFolder = null;
      activeAlbumId = null;
      sortMode = "newest";
      if (els.sortFilter) els.sortFilter.value = sortMode;
      page = 1;
      void load();
    });

    mountListener(els.folders, "click", (event) => {
      const tile = event.target.closest("[data-folder]");
      if (!tile || !els.folders.contains(tile)) return;
      activeFolder = tile.dataset.folder;
      activeAlbumId = null;
      sortMode = "newest";
      if (els.sortFilter) els.sortFilter.value = sortMode;
      page = 1;
      void load();
    });
    mountListener(els.folders, "dragover", (event) => {
      const tile = event.target.closest("[data-folder]");
      if (!tile || !dragId) return;
      event.preventDefault();
      tile.classList.add("is-drop-target");
    });
    mountListener(els.folders, "dragleave", (event) => {
      event.target.closest("[data-folder]")?.classList.remove("is-drop-target");
    });
    mountListener(els.folders, "drop", (event) => {
      const tile = event.target.closest("[data-folder]");
      if (!tile) return;
      event.preventDefault();
      tile.classList.remove("is-drop-target");
      const id = event.dataTransfer?.getData("text/plain") || dragId;
      if (id) void moveToFolder(id, tile.dataset.folder);
    });

    mountListener(els.albums, "click", (event) => {
      const button = event.target.closest("[data-media-album]");
      if (!button || !els.albums.contains(button)) return;
      const id = Number(button.dataset.mediaAlbum || 0);
      activeAlbumId = id || null;
      activeFolder = null;
      sortMode = id ? "manual" : "newest";
      if (els.sortFilter) els.sortFilter.value = sortMode;
      page = 1;
      void load();
    });

    mountListener(els.grid, "click", (event) => {
      const add = event.target.closest("#media-grid-add");
      if (add) {
        els.fileInput?.click();
        return;
      }
      const item = event.target.closest(".media-item[data-id]");
      if (!item || !els.grid.contains(item) || item.classList.contains("is-dragging")) return;
      const id = item.dataset.id;
      if (event.target.closest("[data-media-select]") || event.metaKey || event.ctrlKey || event.shiftKey) {
        event.preventDefault();
        toggleSelection(id, event.shiftKey);
        return;
      }
      openDrawer(assets.find((asset) => String(asset.id) === id));
    });
    mountListener(els.grid, "keydown", (event) => {
      const item = event.target.closest(".media-item[data-id]");
      if (!item || !els.grid.contains(item)) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      const id = item.dataset.id;
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        toggleSelection(id, event.shiftKey);
        return;
      }
      openDrawer(assets.find((asset) => String(asset.id) === id));
    });
    mountListener(els.grid, "dragstart", (event) => {
      const item = event.target.closest(".media-item[data-id]");
      if (!item) return;
      dragId = item.dataset.id;
      item.classList.add("is-dragging");
      event.dataTransfer?.setData("text/plain", dragId);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
    });
    mountListener(els.grid, "dragend", (event) => {
      event.target.closest(".media-item[data-id]")?.classList.remove("is-dragging");
      dragId = null;
    });
    mountListener(els.grid, "dragover", (event) => {
      const item = event.target.closest(".media-item[data-id]");
      if (!item || !dragId || dragId === item.dataset.id) return;
      event.preventDefault();
    });
    mountListener(els.grid, "drop", (event) => {
      const item = event.target.closest(".media-item[data-id]");
      if (!item) return;
      event.preventDefault();
      const fromId = event.dataTransfer?.getData("text/plain") || dragId;
      if (fromId && fromId !== item.dataset.id) void reorderDrop(fromId, item.dataset.id);
    });

    mountListener(els.batchBar, "click", (event) => {
      const action = event.target.closest("[data-media-batch]")?.dataset.mediaBatch;
      if (!action) return;
      if (action === "page") selectCurrentPage();
      else if (action === "clear") clearSelection();
      else if (action === "gallery") openGalleryDialog();
      else if (action === "optimize") void runBatchAction("optimize");
      else if (action === "seo") {
        if (selectedIds.size === 1) {
          const id = Number([...selectedIds][0]);
          const asset = assets.find((item) => Number(item.id) === id);
          if (asset) {
            openDrawer(asset);
            setInspectorTab("seo");
          }
        } else if (els.note) {
          els.note.className = "admin-note";
          els.note.style.display = "block";
          els.note.textContent = "SEO review is approval-based. Open an asset to review its suggestions; no metadata was changed.";
        }
      }
      else if (action === "new-album") openAlbumDialog();
      else if (action === "remove-album" && activeAlbumId) void runBatchAction("album_remove", { album_id: activeAlbumId });
    });
    mountListener(els.batchBar, "change", (event) => {
      const albumSelect = event.target.closest("[data-media-batch-album]");
      if (albumSelect) {
        const albumId = Number(albumSelect.value || 0);
        if (albumId) void runBatchAction("album_add", { album_id: albumId });
        return;
      }
      const moveSelect = event.target.closest("[data-media-batch-move]");
      if (moveSelect?.value) void runBatchAction("move", { folder: moveSelect.value });
    });

    const pageClick = (event) => {
      const control = event.target.closest("[data-media-page]");
      if (!control || control.disabled) return;
      const direction = control.dataset.mediaPage;
      const nextPage = direction === "prev" ? Math.max(1, pagination.page - 1) : pagination.page + 1;
      if ((direction === "prev" && !pagination.has_prev) || (direction === "next" && !pagination.has_next)) return;
      page = nextPage;
      void load().then(() => els.paginationTop?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    mountListener(els.paginationTop, "click", pageClick);
    mountListener(els.pagination, "click", pageClick);
  }

  function renderCrumb() {
    const parts = [];
    const hasScopedView = Boolean(activeFolder || activeAlbumId);
    parts.push(`<button type="button" data-crumb="home"${hasScopedView ? "" : ' class="is-current"'}>All media</button>`);
    if (activeFolder) {
      const label = FOLDERS.find((f) => f.id === activeFolder)?.label || activeFolder;
      parts.push('<span aria-hidden="true">/</span>');
      parts.push(`<button type="button" class="is-current">${escapeHtml(label)}</button>`);
    } else if (activeAlbumId) {
      const album = albums.find((item) => Number(item.id) === Number(activeAlbumId));
      const label = album?.name || "Album";
      parts.push('<span aria-hidden="true">/</span>');
      parts.push(`<button type="button" class="is-current">${escapeHtml(label)}</button>`);
    }
    els.crumb.innerHTML = parts.join(" ");
  }

  function renderFolders() {
    els.folders.innerHTML = FOLDERS.map(
      (f) => `
      <button type="button" class="media-folder-tile${activeFolder === f.id ? " is-active" : ""}" data-folder="${f.id}" draggable="false">
        ${FOLDER_ICON}
        <div><strong>${f.label}</strong><span>Open folder</span></div>
        <span class="media-folder-badge">${counts[f.id] || 0}</span>
      </button>`
    ).join("");


  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
      return map[char] || char;
    });
  }

  function renderAlbums() {
    if (!els.albums) return;
    const buttons = [
      '<button type="button" class="media-album-chip' +
        (!activeAlbumId && !activeFolder ? ' is-active' : '') +
        '" data-media-album=""><span>All media</span><small>Library</small></button>',
      ...albums.map((album) =>
        '<button type="button" class="media-album-chip' +
        (Number(activeAlbumId) === Number(album.id) ? ' is-active' : '') +
        '" data-media-album="' + Number(album.id) + '">' +
        '<span>' + escapeHtml(album.name) + '</span>' +
        '<small>' + (album.meta?.kind === "gallery" ? 'Gallery · ' : '') + Number(album.asset_count || 0) + ' asset' +
        (Number(album.asset_count || 0) === 1 ? '' : 's') +
        '</small></button>'
      ),
    ];
    els.albums.innerHTML = buttons.join("");


  }

  function openAlbumDialog() {
    if (!els.albumDialog) return;
    if (els.albumName) els.albumName.value = "";
    if (els.albumDescription) els.albumDescription.value = "";
    if (typeof els.albumDialog.showModal === "function") els.albumDialog.showModal();
    else els.albumDialog.setAttribute("open", "");
    setTimeout(() => els.albumName?.focus(), 0);
  }

  function closeAlbumDialog() {
    if (!els.albumDialog) return;
    if (typeof els.albumDialog.close === "function") els.albumDialog.close();
    else els.albumDialog.removeAttribute("open");
  }

  function openGalleryDialog() {
    if (!els.galleryDialog) return;
    if (els.galleryName) els.galleryName.value = "";
    if (els.galleryDescription) els.galleryDescription.value = "";
    if (els.galleryFiles) els.galleryFiles.value = "";
    if (els.gallerySelectedCount) els.gallerySelectedCount.textContent = String(selectedIds.size);
    if (els.galleryFileCount) els.galleryFileCount.textContent = "No new files selected";
    if (typeof els.galleryDialog.showModal === "function") els.galleryDialog.showModal();
    else els.galleryDialog.setAttribute("open", "");
    setTimeout(() => els.galleryName?.focus(), 0);
  }

  function closeGalleryDialog() {
    if (!els.galleryDialog) return;
    if (typeof els.galleryDialog.close === "function") els.galleryDialog.close();
    else els.galleryDialog.removeAttribute("open");
  }

  async function addIdsToAlbum(ids, albumId) {
    const clean = [...new Set((ids || []).map(Number).filter(Number.isInteger))];
    if (!clean.length || !albumId) return null;
    return adminFetch("/api/admin/media/batch", {
      method: "POST",
      body: JSON.stringify({ ids: clean, action: "album_add", album_id: Number(albumId) }),
    });
  }

  async function createGalleryFromDialog() {
    const name = String(els.galleryName?.value || "").trim();
    const description = String(els.galleryDescription?.value || "").trim();
    if (!name) {
      els.galleryName?.focus();
      return;
    }
    const existingIds = [...selectedIds];
    const files = els.galleryFiles?.files ? [...els.galleryFiles.files] : [];
    if (els.galleryCreate) els.galleryCreate.disabled = true;
    try {
      const result = await adminFetch("/api/admin/media/albums", {
        method: "POST",
        body: JSON.stringify({
          name,
          description,
          kind: "gallery",
          status: "draft",
          presentation: { layout: "grid", fit: "cover" },
        }),
      });
      const albumId = Number(result.album?.id || 0);
      if (!albumId) throw new Error("Gallery was created without an id.");
      await addIdsToAlbum(existingIds, albumId);
      const uploadResult = files.length
        ? await uploadFiles(files, { albumId, reload: false, throwOnError: true })
        : { ok: true, assets: [], uploaded_ids: [] };
      selectedIds.clear();
      activeAlbumId = albumId;
      activeFolder = null;
      sortMode = "manual";
      if (els.sortFilter) els.sortFilter.value = sortMode;
      page = 1;
      closeGalleryDialog();
      emitSelection();
      await load();
      if (els.note) {
        els.note.className = "admin-note success";
        els.note.style.display = "block";
        const uploadedCount = uploadResult.assets?.length || uploadResult.uploaded_ids?.length || 0;
        const existingCount = existingIds.length;
        const parts = ["Gallery created"];
        if (existingCount) parts.push(existingCount + " existing asset" + (existingCount === 1 ? "" : "s") + " added");
        if (uploadedCount) parts.push(uploadedCount + " new file" + (uploadedCount === 1 ? "" : "s") + " uploaded");
        parts.push("ready to arrange");
        els.note.textContent = parts.join(" · ") + ".";
      }
    } catch (err) {
      if (els.note) {
        els.note.className = "admin-note error";
        els.note.style.display = "block";
        els.note.textContent = err.message || "Could not create gallery.";
      }
    } finally {
      if (els.galleryCreate) els.galleryCreate.disabled = false;
    }
  }

  async function createAlbumFromDialog() {
    const name = String(els.albumName?.value || "").trim();
    const description = String(els.albumDescription?.value || "").trim();
    if (!name) {
      els.albumName?.focus();
      return;
    }
    if (els.albumCreate) els.albumCreate.disabled = true;
    try {
      const result = await adminFetch("/api/admin/media/albums", {
        method: "POST",
        body: JSON.stringify({ name, description, kind: "album", status: "draft" }),
      });
      const albumId = Number(result.album?.id || 0);
      if (albumId && selectedIds.size) {
        await runBatchAction("album_add", { album_id: albumId }, { reload: false });
      }
      activeAlbumId = albumId || null;
      activeFolder = null;
      sortMode = albumId ? "manual" : "newest";
      if (els.sortFilter) els.sortFilter.value = sortMode;
      page = 1;
      closeAlbumDialog();
      await load();
    } catch (err) {
      if (els.note) {
        els.note.style.display = "block";
        els.note.textContent = err.message || "Could not create album.";
      }
    } finally {
      if (els.albumCreate) els.albumCreate.disabled = false;
    }
  }

  function statusLabel(a) {
    const s = a.status || "ready";
    if (s === "processing" || s === "uploading") return "Processing…";
    if (s === "failed") return "Failed";
    return "Ready";
  }

  function displayLine(a) {
    const d = a.display || {};
    const parts = [];
    if (d.format) parts.push(d.format);
    if (d.width && d.height) parts.push(`${d.width}×${d.height}`);
    if (d.bytes) parts.push(fmtBytes(d.bytes));
    else if (a.size_bytes) parts.push(fmtBytes(a.size_bytes));
    return parts.join(" · ");
  }

  function emitSelection() {
    const detail = {
      type: "media_selection",
      ids: [...selectedIds],
      count: selectedIds.size,
      folder: activeFolder,
      album_id: activeAlbumId,
    };
    window.dispatchEvent(new CustomEvent("agentsam:media-selection", { detail }));
  }

  function toggleSelection(id, range = false) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId)) return;

    if (range && lastSelectedId != null) {
      const ordered = assets.map((asset) => Number(asset.id));
      const from = ordered.indexOf(Number(lastSelectedId));
      const to = ordered.indexOf(numericId);
      if (from !== -1 && to !== -1) {
        const start = Math.min(from, to);
        const end = Math.max(from, to);
        for (const selectedId of ordered.slice(start, end + 1)) selectedIds.add(selectedId);
      } else {
        selectedIds.add(numericId);
      }
    } else if (selectedIds.has(numericId)) {
      selectedIds.delete(numericId);
    } else {
      selectedIds.add(numericId);
    }

    lastSelectedId = numericId;
    renderGrid();
    renderBatchBar();
    emitSelection();
  }

  function clearSelection() {
    selectedIds.clear();
    renderGrid();
    renderBatchBar();
    emitSelection();
  }

  function selectCurrentPage() {
    assets.forEach((asset) => selectedIds.add(Number(asset.id)));
    renderGrid();
    renderBatchBar();
    emitSelection();
  }

  async function runBatchAction(action, extra = {}, options = {}) {
    const ids = [...selectedIds];
    if (!ids.length) return null;
    els.batchBar?.classList.add("is-busy");
    try {
      const result = await adminFetch("/api/admin/media/batch", {
        method: "POST",
        body: JSON.stringify({ ids, action, ...extra }),
      });
      if (els.note) {
        els.note.style.display = "block";
        const count = result.updated ?? result.added ?? result.jobs?.length ?? ids.length;
        if (action === "optimize") {
          els.note.textContent =
            "Queued " + count + " asset" + (count === 1 ? "" : "s") + " for background optimization.";
        } else if (action === "accept_suggestions") {
          els.note.textContent =
            "Applied safe metadata suggestions to " + count + " asset" + (count === 1 ? "" : "s") + ".";
        } else if (action === "album_add") {
          els.note.textContent =
            "Added " + count + " asset" + (count === 1 ? "" : "s") + " to the album.";
        } else if (action === "album_remove") {
          els.note.textContent =
            "Removed " + count + " asset" + (count === 1 ? "" : "s") + " from the album.";
        } else {
          els.note.textContent =
            "Moved " + count + " asset" + (count === 1 ? "" : "s") + ".";
        }
      }
      if (options.reload !== false) await load();
      return result;
    } catch (err) {
      if (els.note) {
        els.note.style.display = "block";
        els.note.textContent = err.message || "Batch action failed.";
      }
      return null;
    } finally {
      els.batchBar?.classList.remove("is-busy");
    }
  }

  function renderBatchBar() {
    if (!els.batchBar) return;
    const count = selectedIds.size;
    if (!count) {
      els.batchBar.hidden = true;
      els.batchBar.innerHTML = "";
      return;
    }

    const albumOptions = albums.map((album) =>
      '<option value="' + Number(album.id) + '">' +
      escapeHtml(album.name) + ' (' + Number(album.asset_count || 0) + ')</option>'
    ).join("");

    const parts = [
      '<div class="media-batch-summary"><strong>' + count + '</strong> selected</div>',
      '<div class="media-batch-actions">',
      '<button type="button" class="btn small" data-media-batch="page">Select this page</button>',
      '<button type="button" class="btn small" data-media-batch="clear">Clear</button>',
      '<button type="button" class="btn primary small" data-media-batch="gallery">Create gallery</button>',
      mediaCapabilities.can_materialize_derivatives ? '<button type="button" class="btn small" data-media-batch="optimize">Optimize</button>' : '',
      '<button type="button" class="btn small" data-media-batch="seo">Review SEO</button>',
      '<label class="media-batch-move"><span class="sr-only">Add selected assets to album</span>',
      '<select class="media-lib-filter" data-media-batch-album>',
      '<option value="">Add to album...</option>',
      albumOptions,
      '</select></label>',
      '<button type="button" class="btn small" data-media-batch="new-album">+ Album</button>',
      activeAlbumId
        ? '<button type="button" class="btn small" data-media-batch="remove-album">Remove from this album</button>'
        : '',
      '<label class="media-batch-move"><span class="sr-only">Move selected assets</span>',
      '<select class="media-lib-filter" data-media-batch-move>',
      '<option value="">Move folder...</option>',
      '<option value="images">Images</option>',
      '<option value="videos">Videos</option>',
      '<option value="products">Products</option>',
      '</select></label>',
      '</div>',
    ];

    els.batchBar.hidden = false;
    els.batchBar.innerHTML = parts.join("");

  }

  function renderPagination() {
    const targets = [els.paginationTop, els.pagination].filter(Boolean);
    if (!targets.length) return;
    if (!pagination.total) {
      targets.forEach((target) => { target.innerHTML = ""; });
      return;
    }
    const start = (pagination.page - 1) * pagination.page_size + 1;
    const end = Math.min(pagination.total, pagination.page * pagination.page_size);
    const markup = `
      <div class="media-pagination-summary">${start}–${end} of ${pagination.total}</div>
      <div class="media-pagination-controls">
        <button type="button" class="btn small" data-media-page="prev" ${pagination.has_prev ? "" : "disabled"}>Previous</button>
        <span>Page ${pagination.page} of ${pagination.pages}</span>
        <button type="button" class="btn small" data-media-page="next" ${pagination.has_next ? "" : "disabled"}>Next</button>
      </div>`;

    targets.forEach((target) => {
      target.innerHTML = markup;
    });
  }

  window.getSelectedMediaAssetIds = () => [...selectedIds];

  function renderGrid() {
    const list = visibleAssets();
    if (!list.length) {
      els.grid.innerHTML = `
        <button type="button" class="media-item media-item-add" id="media-grid-add" aria-label="Add media">
          <div class="media-item-thumb media-item-add-thumb">+</div>
          <div class="media-item-meta">
            <div class="media-item-name">Add media</div>
            <div class="media-item-sub">Upload or drop files</div>
          </div>
        </button>`;
      return;
    }

    els.grid.innerHTML =
      list
        .map(
          (a) => `
      <article class="media-item${selectedIds.has(Number(a.id)) ? " is-selected" : ""}${sortMode === "manual" ? " is-sortable" : ""}" draggable="${sortMode === "manual" ? "true" : "false"}" data-id="${a.id}" data-status="${a.status || "ready"}" tabindex="0" role="button" aria-label="Open ${a.filename}">
        <div class="media-item-thumb">
          <button type="button" class="media-select-toggle${selectedIds.has(Number(a.id)) ? " is-selected" : ""}" data-media-select="${a.id}" aria-label="${selectedIds.has(Number(a.id)) ? "Deselect" : "Select"} ${a.filename}" aria-pressed="${selectedIds.has(Number(a.id)) ? "true" : "false"}">
            ${selectedIds.has(Number(a.id)) ? "✓" : ""}
          </button>
          ${thumbHtml(a)}${
          (a.status === "processing" || a.status === "uploading")
            ? '<span class="media-status-badge is-processing">Processing…</span>'
            : ""
        }</div>
        <div class="media-item-meta">
          <div class="media-item-name" title="${a.filename}">${a.filename}</div>
          <div class="media-item-sub">${statusLabel(a)}${
            a.status === "ready" && displayLine(a) ? " · " + displayLine(a) : ""
          }</div>
        </div>
      </article>`
        )
        .join("") +
      `
      <button type="button" class="media-item media-item-add" id="media-grid-add" aria-label="Add media">
        <div class="media-item-thumb media-item-add-thumb">+</div>
        <div class="media-item-meta">
          <div class="media-item-name">Add media</div>
          <div class="media-item-sub">Upload or drop files</div>
        </div>
      </button>`;

    maybePollProcessing();
  }

  let pollTimer = null;
  function maybePollProcessing() {
    const busy = assets.some((a) => a.status === "processing" || a.status === "uploading");
    if (!busy) {
      if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
      return;
    }
    if (pollTimer) return;
    pollTimer = setTimeout(async () => {
      pollTimer = null;
      try {
        await load();
      } catch {
        maybePollProcessing();
      }
    }, 2000);
  }

  async function reorderDrop(fromId, toId) {
    const list = [...visibleAssets()];
    const fromIdx = list.findIndex((a) => String(a.id) === String(fromId));
    const toIdx = list.findIndex((a) => String(a.id) === String(toId));
    if (fromIdx < 0 || toIdx < 0) return;

    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);

    const folder = activeFolder || moved.folder || "images";
    const items = activeAlbumId
      ? list.map((a, i) => ({ id: a.id, position: i + 1 }))
      : list.map((a, i) => ({
          id: a.id,
          folder,
          display_order: i + 1,
        }));

    try {
      await adminFetch("/api/admin/media/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, album_id: activeAlbumId || undefined }),
      });
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function moveToFolder(id, folder) {
    const order = (counts[folder] || 0) + 1;
    try {
      await adminFetch("/api/admin/media/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ id: Number(id), folder, display_order: order }] }),
      });
      if (activeFolder && activeFolder !== folder) {
        await load();
      } else {
        await load();
      }
    } catch (err) {
      alert(err.message);
    }
  }

  function mergePlacement(raw) {
    return { ...DEFAULT_PLACEMENT, ...(raw && typeof raw === "object" ? raw : {}) };
  }

  function placementFromInputs() {
    return {
      orbitTheta: Number(els.glbTheta.value),
      orbitPhi: Number(els.glbPhi.value),
      orbitRadius: Number(els.glbRadius.value),
      fieldOfView: Number(els.glbFov.value),
      positionX: Number(els.glbX.value),
      positionY: Number(els.glbY.value),
      positionZ: Number(els.glbZ.value),
      scale: Number(els.glbScale.value),
    };
  }

  function syncPlacementInputs(p) {
    placement = mergePlacement(p);
    els.glbTheta.value = placement.orbitTheta;
    els.glbPhi.value = placement.orbitPhi;
    els.glbRadius.value = placement.orbitRadius;
    els.glbFov.value = placement.fieldOfView;
    els.glbX.value = placement.positionX;
    els.glbY.value = placement.positionY;
    els.glbZ.value = placement.positionZ;
    els.glbScale.value = placement.scale;
    els.glbThetaRange.value = placement.orbitTheta;
    els.glbPhiRange.value = placement.orbitPhi;
    els.glbRadiusRange.value = placement.orbitRadius;
    els.glbYRange.value = placement.positionY;
    els.glbScaleRange.value = placement.scale;
  }

  function parseOrbitString(raw) {
    const str = typeof raw === "string" ? raw : raw?.toString?.() || "";
    if (!str) return null;

    const m = str
      .trim()
      .match(/^([\d.+-]+)\s*deg\s+([\d.+-]+)\s*deg\s+([\d.+-]+)\s*(%|m|cm|mm)?$/i);
    if (m) {
      const unit = (m[4] || "%").toLowerCase();
      let radius = parseFloat(m[3]);
      if (unit === "m") radius = Math.round(radius * 100);
      else if (unit === "cm") radius = Math.round(radius);
      else if (unit === "mm") radius = Math.round(radius / 10);
      else radius = Math.round(radius);
      return {
        orbitTheta: Math.round(parseFloat(m[1])),
        orbitPhi: Math.round(parseFloat(m[2])),
        orbitRadius: radius,
        orbitRaw: str.trim(),
      };
    }

    const parts = str.trim().split(/\s+/);
    if (parts.length < 3) return null;
    const theta = parseFloat(parts[0]);
    const phi = parseFloat(parts[1]);
    const radius = parseFloat(parts[2]);
    if (!Number.isFinite(theta) || !Number.isFinite(phi)) return null;
    return {
      orbitTheta: Math.round(theta),
      orbitPhi: Math.round(phi),
      orbitRadius: Number.isFinite(radius) ? Math.round(radius) : null,
      orbitRaw: str.trim(),
    };
  }

  function readViewerOrbit(mv) {
    if (typeof mv.getCameraOrbit === "function") {
      const orbit = mv.getCameraOrbit();
      const parsed = parseOrbitString(orbit.toString?.() || "");
      if (parsed) {
        if (parsed.orbitRadius != null && String(orbit.toString?.() || "").includes("m")) {
          if (mv._radiusRefM && mv._radiusRefPct) {
            parsed.orbitRadius = Math.max(
              50,
              Math.min(200, Math.round((orbit.radius / mv._radiusRefM) * mv._radiusRefPct))
            );
          }
        }
        return parsed;
      }
      return {
        orbitTheta: Math.round((orbit.theta * 180) / Math.PI),
        orbitPhi: Math.round((orbit.phi * 180) / Math.PI),
        orbitRadius:
          mv._radiusRefM && mv._radiusRefPct
            ? Math.max(
                50,
                Math.min(200, Math.round((orbit.radius / mv._radiusRefM) * mv._radiusRefPct))
              )
            : Math.round(orbit.radius * 100),
        orbitRaw: orbit.toString?.() || "",
      };
    }
    return parseOrbitString(mv.getAttribute("camera-orbit") || mv.cameraOrbit);
  }

  function captureRadiusReference(mv) {
    if (typeof mv.getCameraOrbit !== "function") return;
    const p = placementFromInputs();
    mv._radiusRefM = mv.getCameraOrbit().radius;
    mv._radiusRefPct = p.orbitRadius || DEFAULT_PLACEMENT.orbitRadius;
  }

  function updatePlacementExport(p) {
    placement = p;
    if (els.glbExport && selected) {
      els.glbExport.value = buildPlacementNotes(selected, p);
    }
  }

  function applyPlacementPreview() {
    const p = placementFromInputs();
    placement = p;

    const mv = document.getElementById("media-glb-viewer");
    const wrap = document.getElementById("media-glb-transform");
    if (mv) {
      mv._applyingFromPanel = true;
      mv.cameraOrbit = `${p.orbitTheta}deg ${p.orbitPhi}deg ${p.orbitRadius}%`;
      if ("fieldOfView" in mv) mv.fieldOfView = `${p.fieldOfView}deg`;
      requestAnimationFrame(() => {
        captureRadiusReference(mv);
        mv._applyingFromPanel = false;
      });
    }
    if (wrap) {
      wrap.style.transform = `translate3d(${p.positionX}px, ${p.positionY}px, ${p.positionZ}px) scale(${p.scale})`;
    }
    updatePlacementExport(p);
  }

  function syncFromViewerCamera(mv) {
    if (!mv || mv._applyingFromPanel) return;

    const orbit = readViewerOrbit(mv);
    if (!orbit) return;

    const p = placementFromInputs();
    p.orbitTheta = orbit.orbitTheta;
    p.orbitPhi = orbit.orbitPhi;
    if (orbit.orbitRadius != null) p.orbitRadius = orbit.orbitRadius;
    if (orbit.orbitRaw) p.liveOrbitRaw = orbit.orbitRaw;

    const fov = parseFloat(String(mv.fieldOfView || mv.getAttribute("field-of-view") || ""));
    if (Number.isFinite(fov)) p.fieldOfView = Math.round(fov);

    syncPlacementInputs(p);
    updatePlacementExport(p);
  }

  function bindGlbViewerInteraction(mv) {
    if (!mv || mv._glbPlacementBound) return;
    mv._glbPlacementBound = true;

    let cameraRaf = 0;
    let interacting = false;
    let interactRaf = 0;

    const scheduleSync = () => {
      cancelAnimationFrame(cameraRaf);
      cameraRaf = requestAnimationFrame(() => syncFromViewerCamera(mv));
    };

    mv.addEventListener("camera-change", scheduleSync);

    const startInteract = () => {
      interacting = true;
      const tick = () => {
        if (!interacting) return;
        syncFromViewerCamera(mv);
        interactRaf = requestAnimationFrame(tick);
      };
      cancelAnimationFrame(interactRaf);
      interactRaf = requestAnimationFrame(tick);
    };

    const stopInteract = () => {
      interacting = false;
      cancelAnimationFrame(interactRaf);
      scheduleSync();
    };

    mv.addEventListener("pointerdown", startInteract);
    window.addEventListener("pointerup", stopInteract);
    mv.addEventListener("wheel", scheduleSync, { passive: true });

    const stage = document.getElementById("media-glb-stage");
    const wrap = document.getElementById("media-glb-transform");
    if (!stage || !wrap) return;

    let panning = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;

    stage.addEventListener(
      "pointerdown",
      (e) => {
        if (!e.shiftKey || e.target.closest("model-viewer")) return;
        panning = true;
        startX = e.clientX;
        startY = e.clientY;
        const p = placementFromInputs();
        baseX = p.positionX;
        baseY = p.positionY;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add("is-panning");
      },
      true
    );

    stage.addEventListener(
      "pointermove",
      (e) => {
        if (!panning) return;
        const p = placementFromInputs();
        p.positionX = Math.round(baseX + (e.clientX - startX));
        p.positionY = Math.round(baseY + (e.clientY - startY));
        syncPlacementInputs(p);
        wrap.style.transform = `translate3d(${p.positionX}px, ${p.positionY}px, ${p.positionZ}px) scale(${p.scale})`;
        updatePlacementExport(p);
      },
      true
    );

    const endPan = (e) => {
      if (!panning) return;
      panning = false;
      stage.classList.remove("is-panning");
      try {
        stage.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };

    stage.addEventListener("pointerup", endPan, true);
    stage.addEventListener("pointercancel", endPan, true);

    // Shift+drag pans the frame (X/Y) instead of orbiting
    mv.addEventListener(
      "pointerdown",
      (e) => {
        if (!e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        mv.removeAttribute("camera-controls");
        mv._shiftPan = true;
        panning = true;
        startX = e.clientX;
        startY = e.clientY;
        const p = placementFromInputs();
        baseX = p.positionX;
        baseY = p.positionY;
        stage.setPointerCapture(e.pointerId);
        stage.classList.add("is-panning");
      },
      true
    );

    const endShiftPan = () => {
      if (!mv._shiftPan) return;
      mv._shiftPan = false;
      panning = false;
      stage.classList.remove("is-panning");
      mv.setAttribute("camera-controls", "");
    };

    mv.addEventListener(
      "pointermove",
      (e) => {
        if (!panning || !mv._shiftPan) return;
        e.preventDefault();
        const p = placementFromInputs();
        p.positionX = Math.round(baseX + (e.clientX - startX));
        p.positionY = Math.round(baseY + (e.clientY - startY));
        syncPlacementInputs(p);
        wrap.style.transform = `translate3d(${p.positionX}px, ${p.positionY}px, ${p.positionZ}px) scale(${p.scale})`;
        updatePlacementExport(p);
      },
      true
    );

    mv.addEventListener("pointerup", endShiftPan, true);
    mv.addEventListener("pointercancel", endShiftPan, true);
  }

  function buildPlacementNotes(asset, p) {
    const orbit = `${p.orbitTheta}deg ${p.orbitPhi}deg ${p.orbitRadius}%`;
    const transform = `translate3d(${p.positionX}px, ${p.positionY}px, ${p.positionZ}px) scale(${p.scale})`;
    return [
      `GLB placement — ${asset.filename}`,
      `URL: ${asset.url}`,
      "",
      "Camera orbit (theta / phi / radius):",
      `  theta: ${p.orbitTheta}°`,
      `  phi: ${p.orbitPhi}°`,
      `  radius: ${p.orbitRadius}%`,
      `  fieldOfView: ${p.fieldOfView}°`,
      "",
      "Position (px):",
      `  X: ${p.positionX}`,
      `  Y: ${p.positionY}`,
      `  Z: ${p.positionZ}`,
      "",
      `Scale: ${p.scale}`,
      "",
      "model-viewer:",
      `  camera-orbit="${orbit}"`,
      p.liveOrbitRaw ? `  camera-orbit-live="${p.liveOrbitRaw}"` : "",
      `  field-of-view="${p.fieldOfView}deg"`,
      "",
      "CSS wrapper:",
      `  transform: ${transform};`,
      "",
      "JSON:",
      JSON.stringify(p, null, 2),
    ].join("\n");
  }

  function bindPlacementControls() {
    const pairs = [
      [els.glbTheta, els.glbThetaRange],
      [els.glbPhi, els.glbPhiRange],
      [els.glbRadius, els.glbRadiusRange],
      [els.glbY, els.glbYRange],
      [els.glbScale, els.glbScaleRange],
    ];

    const onChange = () => applyPlacementPreview();

    [els.glbTheta, els.glbPhi, els.glbRadius, els.glbFov, els.glbX, els.glbY, els.glbZ, els.glbScale].forEach((el) => {
      if (el) mountListener(el, "input", onChange);
    });

    pairs.forEach(([num, range]) => {
      if (num) mountListener(num, "input", () => {
        if (range) range.value = num.value;
        onChange();
      });
      if (range) mountListener(range, "input", () => {
        if (num) num.value = range.value;
        onChange();
      });
    });

    if (els.glbReset) mountListener(els.glbReset, "click", () => {
      syncPlacementInputs(DEFAULT_PLACEMENT);
      applyPlacementPreview();
    });

    if (els.glbCopy) mountListener(els.glbCopy, "click", async () => {
      const text = els.glbExport?.value || "";
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        els.glbCopy.textContent = "Copied!";
        setTimeout(() => {
          els.glbCopy.textContent = "Copy placement notes";
        }, 1600);
      } catch {
        els.glbExport.select();
        document.execCommand("copy");
      }
    });
  }

  function setInspectorTab(tab) {
    inspectorTab = tab || "details";
    els.drawer?.querySelectorAll("[data-media-inspector-tab]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.mediaInspectorTab === inspectorTab);
    });
    els.drawer?.querySelectorAll("[data-media-inspector-panel]").forEach((panel) => {
      panel.classList.toggle("is-active", panel.dataset.mediaInspectorPanel === inspectorTab);
    });
  }

  function renderPreviewPresets(asset) {
    if (!els.previewPresets) return;
    if (assetKind(asset) !== "image") {
      els.previewPresets.innerHTML = "";
      if (els.previewNote) els.previewNote.hidden = true;
      return;
    }
    if (els.previewNote) els.previewNote.hidden = false;
    els.previewPresets.innerHTML = IMAGE_PREVIEW_PRESETS.map((preset) => {
      const active = preset.id === previewPresetId ? " is-active" : "";
      return '<button type="button" class="media-preview-preset' + active + '" data-media-preview-preset="' +
        escapeHtml(preset.id) + '"><span>' + escapeHtml(preset.label) + '</span><small>' +
        escapeHtml(preset.width && preset.height ? preset.width + '×' + preset.height : 'source') + '</small></button>';
    }).join("");
  }

  function applyPreviewPreset(id) {
    if (!selected || assetKind(selected) !== "image") return;
    previewPresetId = getImagePreviewPreset(id)?.id || "original";
    const preset = getImagePreviewPreset(previewPresetId);
    const style = previewStyleForPreset(preset, { focal: selected.meta?.focal_point });
    const image = els.drawerPreview?.querySelector("img");
    if (els.drawerPreviewShell) {
      els.drawerPreviewShell.style.aspectRatio = preset?.aspect_ratio || "auto";
      els.drawerPreviewShell.classList.toggle("is-original", preset?.id === "original");
    }
    if (image) {
      image.style.objectFit = style.objectFit;
      image.style.objectPosition = style.objectPosition;
    }
    if (els.previewNote) els.previewNote.textContent = preset?.id === "original"
      ? "Original source preview."
      : previewLabel(preset) + " browser preview — no derivative file is generated.";
    renderPreviewPresets(selected);
  }

  function navigateDrawer(delta) {
    if (!selected || !assets.length) return;
    const index = assets.findIndex((asset) => Number(asset.id) === Number(selected.id));
    if (index < 0) return;
    const next = assets[index + delta];
    if (next) openDrawer(next);
  }

  function renderSeoReview(asset) {
    const host = document.getElementById("media-drawer-seo-review");
    const button = document.getElementById("media-drawer-apply-seo");
    const summary = document.getElementById("media-drawer-seo-summary");
    if (!host) return;

    const suggestions = asset?.meta?.intelligence?.suggestions || asset?.suggestions || {};
    const protectedFields = asset?.meta?.intelligence?.protected_fields || {};
    const fields = [
      ["title", "Title", asset?.meta?.title || asset?.filename || ""],
      ["alt_text", "Alt text", asset?.alt_text || ""],
      ["tags", "Tags", Array.isArray(asset?.meta?.tags) ? asset.meta.tags.join(", ") : ""],
    ];
    const rows = [];
    for (const [key, label, current] of fields) {
      const suggested = suggestions?.[key];
      if (suggested == null || suggested === "" || (Array.isArray(suggested) && !suggested.length)) continue;
      const suggestedText = Array.isArray(suggested) ? suggested.join(", ") : String(suggested);
      const locked = !!protectedFields?.[key];
      rows.push(
        '<label class="media-seo-review-row">' +
          '<input type="checkbox" data-media-seo-field="' + escapeHtml(key) + '"' + (locked ? ' disabled' : ' checked') + '>' +
          '<span><strong>' + escapeHtml(label) + '</strong>' +
          '<small>Current: ' + escapeHtml(current || "—") + '</small>' +
          '<small>Suggested: ' + escapeHtml(suggestedText) + '</small>' +
          (locked ? '<small>Protected by existing human metadata</small>' : '') +
          '</span></label>'
      );
    }
    host.innerHTML = rows.length
      ? rows.join("")
      : '<p class="media-empty-state">No reviewable SEO suggestions are available for this asset.</p>';
    if (button) button.disabled = !rows.length;
    if (summary) summary.textContent = rows.length
      ? "Choose exactly which suggested fields to approve. Nothing changes until you apply the checked fields."
      : "No pending SEO suggestions. Existing metadata remains unchanged.";
  }

  async function applyApprovedSeo() {
    if (!selected) return null;
    const fields = [...document.querySelectorAll("[data-media-seo-field]:checked")]
      .map((input) => input.dataset.mediaSeoField)
      .filter(Boolean);
    if (!fields.length) {
      if (els.note) {
        els.note.className = "admin-note";
        els.note.style.display = "block";
        els.note.textContent = "Choose at least one suggested field to apply.";
      }
      return null;
    }
    try {
      await adminFetch("/api/admin/media/" + encodeURIComponent(selected.id), {
        method: "PATCH",
        body: JSON.stringify({ accept_suggestions: fields }),
      });
      if (els.note) {
        els.note.className = "admin-note success";
        els.note.style.display = "block";
        els.note.textContent = "Applied " + fields.length + " approved SEO field" + (fields.length === 1 ? "" : "s") + ".";
      }
      const selectedId = Number(selected.id);
      await load();
      const refreshed = assets.find((asset) => Number(asset.id) === selectedId);
      if (refreshed) {
        openDrawer(refreshed);
        setInspectorTab("seo");
      }
      return true;
    } catch (error) {
      if (els.note) {
        els.note.className = "admin-note error";
        els.note.style.display = "block";
        els.note.textContent = error.message || "Could not apply approved SEO fields.";
      }
      return null;
    }
  }

  async function runSelectedAssetAction(action) {
    if (!selected) return null;
    try {
      const result = await adminFetch("/api/admin/media/batch", {
        method: "POST",
        body: JSON.stringify({ ids: [Number(selected.id)], action }),
      });
      if (els.note) {
        els.note.className = "admin-note success";
        els.note.style.display = "block";
        els.note.textContent = action === "optimize"
          ? "Prepared this asset for background storefront optimization."
          : "Applied safe metadata suggestions to this asset.";
      }
      await load();
      const refreshed = assets.find((asset) => Number(asset.id) === Number(selected?.id));
      if (refreshed) openDrawer(refreshed);
      return result;
    } catch (error) {
      if (els.note) {
        els.note.className = "admin-note error";
        els.note.style.display = "block";
        els.note.textContent = error.message || "Asset action failed.";
      }
      return null;
    }
  }

  function openDrawer(asset) {
    if (!asset) return;
    selected = asset;
    previewPresetId = "original";
    els.drawerPreview.innerHTML = previewHtml(asset);
    if (els.drawerTitle) els.drawerTitle.textContent = asset.filename || "Asset";
    if (els.drawerStatus) els.drawerStatus.textContent = statusLabel(asset).replace("…", "");
    renderPreviewPresets(asset);
    setInspectorTab("details");
    els.fieldFilename.value = asset.filename || "";
    els.fieldAlt.value = asset.alt_text || "";
    els.fieldFolder.value = asset.folder || "images";
    els.metaSize.textContent = fmtBytes(asset.size_bytes);
    els.metaDate.textContent = fmtDate(asset.created_at);
    const source = asset.source || {};
    const sourceRef = source.key || source.asset_id || asset.r2_key || asset.delivery_url || asset.url || "—";
    els.metaKey.textContent = source.provider ? source.provider + ": " + sourceRef : sourceRef;

    // Operator lifecycle — never expose pipeline jargon.
    const status = asset.status || "ready";
    let extras = `<p class="media-meta-line"><strong>Status:</strong> ${statusLabel(asset)}</p>`;
    if (status === "ready" && displayLine(asset)) {
      extras += `<p class="media-meta-line">${displayLine(asset)}</p>`;
    }
    const intel = asset.meta?.intelligence || asset.intelligence;
    if (intel?.suggestions) {
      const s = intel.suggestions;
      extras += `<div class="media-suggestions" data-suggestions>
        <p><strong>Suggestions</strong> (review before apply)</p>
        <ul>
          <li>slug: ${s.slug || "—"}</li>
          <li>title: ${s.title || "—"}</li>
          <li>alt: ${s.alt_text || "—"}</li>
          <li>role: ${s.media_role || "—"}</li>
        </ul>
      </div>`;
    }
    if (els.metaKey && extras) {
      const host = els.metaKey.parentElement;
      let box = host?.querySelector("[data-media-intel]");
      if (!box && host) {
        box = document.createElement("div");
        box.dataset.mediaIntel = "1";
        host.appendChild(box);
      }
      if (box) box.innerHTML = extras;
    }

    if (typeof window.setAgentsamPageContext === "function") {
      window.setAgentsamPageContext({
        page: "/admin/content",
        selected_resource: {
          type: "media_asset",
          id: asset.id,
          source: asset.source || null,
          r2_key: asset.r2_key,
          filename: asset.filename,
          content_type: asset.content_type,
          folder: asset.folder,
          status: asset.status,
          media_role: asset.meta?.media_role || intel?.suggestions?.media_role,
          delivery_url: asset.delivery_url || asset.url,
        },
      });
    }

    const optimizeButton = document.getElementById("media-drawer-optimize");
    const optimizeNote = document.getElementById("media-drawer-optimize-note");
    if (optimizeButton) {
      optimizeButton.disabled = !mediaCapabilities.can_materialize_derivatives;
      optimizeButton.textContent = mediaCapabilities.can_materialize_derivatives
        ? "Prepare recommended versions"
        : "Preview only";
    }
    if (optimizeNote) {
      optimizeNote.textContent = mediaCapabilities.can_materialize_derivatives
        ? "Preview sizes first. Materialize only the delivery versions you actually need using " + (mediaCapabilities.transform_provider || "the configured transformer") + "."
        : "No transform provider is configured. Size previews are browser-only and do not create files or paid image variants.";
    }

    renderSeoReview(asset);

    const usage = document.getElementById("media-drawer-usage");
    if (usage) {
      const refs = Array.isArray(asset.usage) ? asset.usage : [];
      usage.innerHTML = refs.length
        ? refs.map((ref) =>
            '<div class="media-usage-row"><span>' + escapeHtml(ref.kind || "Reference") + '</span><strong>' +
            escapeHtml(ref.label || ref.id || "Used") + '</strong></div>'
          ).join("")
        : '<span class="media-empty-state">No known gallery or product references.</span>';
    }

    const versions = document.getElementById("media-drawer-versions");
    if (versions) {
      const prepared = Array.isArray(asset.prepared_versions) ? asset.prepared_versions : [];
      const preparedRows = prepared.map((version) =>
        '<div class="media-version-row"><span>' + escapeHtml(version.label || version.kind || "Prepared") + '</span><small>' +
        escapeHtml([
          version.width && version.height ? version.width + "×" + version.height : "",
          version.format || "",
          version.bytes ? fmtBytes(version.bytes) : "",
          version.provider || "",
        ].filter(Boolean).join(" · ") || "Prepared version") + '</small></div>'
      );
      const previewRows = IMAGE_PREVIEW_PRESETS
        .filter((preset) => preset.id !== "original")
        .map((preset) =>
          '<div class="media-version-row is-preview-only"><span>' + escapeHtml(preset.label) + '</span><small>Preview only · not generated</small></div>'
        );
      versions.innerHTML =
        '<div class="media-version-group"><strong>Original</strong><div class="media-version-row"><span>' +
        escapeHtml(asset.filename || "Source") + '</span><small>' + escapeHtml(displayLine(asset) || "Source") + '</small></div></div>' +
        (preparedRows.length ? '<div class="media-version-group"><strong>Prepared</strong>' + preparedRows.join("") + '</div>' : '') +
        '<div class="media-version-group"><strong>Preview only</strong>' + previewRows.join("") + '</div>';
    }
    applyPreviewPreset("original");

    const is3d = isModel3d(asset);
    els.glbPlacement.hidden = !is3d;
    if (is3d) {
      syncPlacementInputs(asset.placement);
      const mv = document.getElementById("media-glb-viewer");
      const apply = () => {
        applyPlacementPreview();
        bindGlbViewerInteraction(mv);
        if (mv) {
          requestAnimationFrame(() => captureRadiusReference(mv));
        }
      };
      if (mv) {
        if (mv.loaded) apply();
        else mv.addEventListener("load", apply, { once: true });
      }
    }

    document.body.classList.add("media-inspector-open");
    els.backdrop.classList.add("is-open");
    els.drawer.classList.add("is-open");
  }

  function closeDrawer() {
    selected = null;
    document.body.classList.remove("media-inspector-open");
    els.backdrop.classList.remove("is-open");
    els.drawer.classList.remove("is-open");
  }

  async function saveDrawer() {
    if (!selected) return;
    try {
      const payload = {
        filename: els.fieldFilename.value.trim(),
        alt_text: els.fieldAlt.value.trim(),
        folder: els.fieldFolder.value,
      };
      if (isModel3d(selected)) {
        payload.placement = placementFromInputs();
      }
      const data = await adminFetch(`/api/admin/media/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      selected = data.asset;
      await load();
      const refreshed = assets.find((asset) => Number(asset.id) === Number(data.asset?.id)) || data.asset;
      openDrawer(refreshed);
    } catch (err) {
      alert(err.message);
    }
  }

  function openSelectedOriginal(download = false) {
    if (!selected) return;
    const url = mediaUrl(selected);
    if (!url) return;
    if (!download) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = selected.filename || "download";
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function deleteSelected() {
    if (!selected) return;
    if (!confirm("Delete this asset permanently? This removes the asset record and asks the configured source provider to remove its source object when supported.")) return;
    try {
      await adminFetch(`/api/admin/media/${selected.id}`, { method: "DELETE" });
      closeDrawer();
      await load();
    } catch (err) {
      alert(err.message);
    }
  }

  async function uploadFiles(fileList, options = {}) {
    const { albumId = activeAlbumId, reload = true, throwOnError = false } = options;
    const form = new FormData();
    for (const f of fileList) form.append("files", f);
    form.append("prefix", "intake/");
    if (activeFolder) form.append("folder", activeFolder);

    els.dropLabel.textContent = "Uploading " + fileList.length + " file(s)…";
    els.note.style.display = "none";
    try {
      const res = await fetch("/api/admin/media", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const n = data.assets?.length || 0;
      const uploadedIds = (data.assets || []).map((asset) => Number(asset.id)).filter(Number.isInteger);
      if (albumId && uploadedIds.length) await addIdsToAlbum(uploadedIds, albumId);
      const processing = (data.assets || []).some((a) => a.status === "processing");
      els.note.textContent = processing
        ? `Uploaded ${n} file(s). Processing…`
        : `Uploaded ${n} file(s).`;
      els.note.className = "admin-note success";
      els.note.style.display = "block";
      if (reload) await load();
      maybePollProcessing();
      return { ok: true, ...data, uploaded_ids: uploadedIds };
    } catch (err) {
      els.note.textContent = err.message;
      els.note.className = "admin-note error";
      els.note.style.display = "block";
      if (throwOnError) throw err;
      return { ok: false, error: err };
    } finally {
      els.dropLabel.textContent = "Drag and drop files here, or click to choose";
    }
  }

  function bindUpload() {
    mountListener(els.dropZone, "click", () => els.fileInput.click());
    els.dropZone.style.cursor = "pointer";
    ["dragenter", "dragover"].forEach((evt) =>
      mountListener(els.dropZone, evt, (e) => {
        e.preventDefault();
        els.dropZone.classList.add("is-dragover");
      })
    );
    ["dragleave", "drop"].forEach((evt) =>
      mountListener(els.dropZone, evt, (e) => {
        e.preventDefault();
        els.dropZone.classList.remove("is-dragover");
      })
    );
    mountListener(els.dropZone, "drop", (e) => {
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });
    mountListener(els.fileInput, "change", () => {
      if (els.fileInput.files.length) uploadFiles(els.fileInput.files);
      els.fileInput.value = "";
    });
    mountListener(els.uploadBtn, "click", () => els.fileInput.click());
  }

  window.destroyMediaLibrary = destroyMediaLibrary;

  window.initMediaLibrary = function initMediaLibrary() {
    destroyMediaLibrary();
    lifecycleController = new AbortController();
    mountGeneration += 1;
    const generation = mountGeneration;

    els.crumb = document.getElementById("media-crumb");
    els.folders = document.getElementById("media-folders");
    els.albums = document.getElementById("media-albums");
    els.albumNew = document.getElementById("media-album-new");
    els.albumDialog = document.getElementById("media-album-dialog");
    els.albumForm = document.getElementById("media-album-form");
    els.albumName = document.getElementById("media-album-name");
    els.albumDescription = document.getElementById("media-album-description");
    els.albumCancel = document.getElementById("media-album-cancel");
    els.albumCreate = document.getElementById("media-album-create");
    els.galleryNew = document.getElementById("media-gallery-new");
    els.galleryDialog = document.getElementById("media-gallery-dialog");
    els.galleryForm = document.getElementById("media-gallery-form");
    els.galleryName = document.getElementById("media-gallery-name");
    els.galleryDescription = document.getElementById("media-gallery-description");
    els.galleryFiles = document.getElementById("media-gallery-files");
    els.gallerySelectedCount = document.getElementById("media-gallery-selected-count");
    els.galleryFileCount = document.getElementById("media-gallery-file-count");
    els.galleryCancel = document.getElementById("media-gallery-cancel");
    els.galleryCreate = document.getElementById("media-gallery-create");
    els.grid = document.getElementById("media-grid");
    els.search = document.getElementById("media-search");
    els.kindFilter = document.getElementById("media-kind-filter");
    els.statusFilter = document.getElementById("media-status-filter");
    els.sortFilter = document.getElementById("media-sort-filter");
    els.dropZone = document.getElementById("media-drop");
    els.dropLabel = document.getElementById("media-drop-label");
    els.fileInput = document.getElementById("media-file-input");
    els.uploadBtn = document.getElementById("media-upload-btn");
    els.note = document.getElementById("media-note");
    els.batchBar = document.getElementById("media-batch-bar");
    els.paginationTop = document.getElementById("media-pagination-top");
    els.pagination = document.getElementById("media-pagination");
    els.backdrop = document.getElementById("media-drawer-backdrop");
    els.drawer = document.getElementById("media-drawer");
    els.drawerPreview = document.getElementById("media-drawer-preview");
    els.drawerPreviewShell = document.getElementById("media-drawer-preview-shell");
    els.previewPresets = document.getElementById("media-preview-presets");
    els.previewNote = document.getElementById("media-preview-note");
    els.drawerTitle = document.getElementById("media-drawer-title");
    els.drawerStatus = document.getElementById("media-drawer-status");
    els.fieldFilename = document.getElementById("media-field-filename");
    els.fieldAlt = document.getElementById("media-field-alt");
    els.fieldFolder = document.getElementById("media-field-folder");
    els.metaSize = document.getElementById("media-meta-size");
    els.metaDate = document.getElementById("media-meta-date");
    els.metaKey = document.getElementById("media-meta-key");
    els.glbPlacement = document.getElementById("media-glb-placement");
    els.glbTheta = document.getElementById("glb-theta");
    els.glbPhi = document.getElementById("glb-phi");
    els.glbRadius = document.getElementById("glb-radius");
    els.glbFov = document.getElementById("glb-fov");
    els.glbX = document.getElementById("glb-x");
    els.glbY = document.getElementById("glb-y");
    els.glbZ = document.getElementById("glb-z");
    els.glbScale = document.getElementById("glb-scale");
    els.glbThetaRange = document.getElementById("glb-theta-range");
    els.glbPhiRange = document.getElementById("glb-phi-range");
    els.glbRadiusRange = document.getElementById("glb-radius-range");
    els.glbYRange = document.getElementById("glb-y-range");
    els.glbScaleRange = document.getElementById("glb-scale-range");
    els.glbExport = document.getElementById("media-glb-export");
    els.glbCopy = document.getElementById("media-glb-copy");
    els.glbReset = document.getElementById("media-glb-reset");

    const required = [
      ["grid", els.grid],
      ["folders", els.folders],
      ["albums", els.albums],
      ["drop zone", els.dropZone],
      ["file input", els.fileInput],
      ["upload button", els.uploadBtn],
      ["drawer", els.drawer],
      ["drawer backdrop", els.backdrop],
    ];
    const missing = required.filter(([, element]) => !element).map(([name]) => name);
    if (missing.length) {
      console.error("Media library mount aborted; missing required elements:", missing.join(", "));
      destroyMediaLibrary();
      return false;
    }

    // Core controls mount before optional 3D behavior.
    if (els.albumNew) mountListener(els.albumNew, "click", openAlbumDialog);
    if (els.albumCancel) mountListener(els.albumCancel, "click", closeAlbumDialog);
    if (els.albumCreate) mountListener(els.albumCreate, "click", () => void createAlbumFromDialog());
    if (els.albumForm) mountListener(els.albumForm, "submit", (event) => {
      event.preventDefault();
      void createAlbumFromDialog();
    });
    if (els.galleryNew) mountListener(els.galleryNew, "click", openGalleryDialog);
    if (els.galleryCancel) mountListener(els.galleryCancel, "click", closeGalleryDialog);
    if (els.galleryCreate) mountListener(els.galleryCreate, "click", () => void createGalleryFromDialog());
    if (els.galleryForm) mountListener(els.galleryForm, "submit", (event) => {
      event.preventDefault();
      void createGalleryFromDialog();
    });
    if (els.galleryFiles) mountListener(els.galleryFiles, "change", () => {
      const count = els.galleryFiles.files?.length || 0;
      if (els.galleryFileCount) els.galleryFileCount.textContent = count
        ? count + " new file" + (count === 1 ? "" : "s") + " selected"
        : "No new files selected";
    });

    if (els.search) mountListener(els.search, "input", (event) => {
      searchQuery = event.target.value || "";
      page = 1;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        if (generation === mountGeneration) void load();
      }, 250);
    });
    if (els.kindFilter) mountListener(els.kindFilter, "change", (event) => {
      kindFilter = event.target.value || "all";
      page = 1;
      void load();
    });
    if (els.statusFilter) mountListener(els.statusFilter, "change", (event) => {
      statusFilter = event.target.value || "all";
      page = 1;
      void load();
    });
    if (els.sortFilter) mountListener(els.sortFilter, "change", (event) => {
      sortMode = event.target.value || "newest";
      page = 1;
      void load();
    });

    const drawerClose = document.getElementById("media-drawer-close");
    const drawerOpen = document.getElementById("media-drawer-open");
    const drawerDownload = document.getElementById("media-drawer-download");
    const drawerSave = document.getElementById("media-drawer-save");
    const drawerDelete = document.getElementById("media-drawer-delete");
    const drawerPrev = document.getElementById("media-drawer-prev");
    const drawerNext = document.getElementById("media-drawer-next");
    const drawerOptimize = document.getElementById("media-drawer-optimize");
    const drawerApplySeo = document.getElementById("media-drawer-apply-seo");
    if (drawerClose) mountListener(drawerClose, "click", closeDrawer);
    if (drawerOpen) mountListener(drawerOpen, "click", () => openSelectedOriginal(false));
    if (drawerDownload) mountListener(drawerDownload, "click", () => openSelectedOriginal(true));
    if (drawerSave) mountListener(drawerSave, "click", saveDrawer);
    if (drawerDelete) mountListener(drawerDelete, "click", deleteSelected);
    if (drawerPrev) mountListener(drawerPrev, "click", () => navigateDrawer(-1));
    if (drawerNext) mountListener(drawerNext, "click", () => navigateDrawer(1));
    if (drawerOptimize) mountListener(drawerOptimize, "click", () => void runSelectedAssetAction("optimize"));
    if (drawerApplySeo) mountListener(drawerApplySeo, "click", () => void applyApprovedSeo());
    mountListener(els.drawer, "click", (event) => {
      const preview = event.target.closest("[data-media-preview-preset]");
      if (preview) { applyPreviewPreset(preview.dataset.mediaPreviewPreset); return; }
      const tab = event.target.closest("[data-media-inspector-tab]");
      if (tab) setInspectorTab(tab.dataset.mediaInspectorTab);
    });
    mountListener(els.backdrop, "click", closeDrawer);
    bindDelegatedLibraryInteractions();

    bindUpload();

    try {
      bindPlacementControls();
    } catch (error) {
      console.warn("Optional media placement controls unavailable:", error);
    }

    void load();
    return true;
  };
})();

export const initMediaLibrary = window.initMediaLibrary;
export const destroyMediaLibrary = window.destroyMediaLibrary;
