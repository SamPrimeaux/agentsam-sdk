(async () => {
  // The source-backed Local Studio adapter resolves site authorization
  // asynchronously. Never fall back to unrelated legacy CMS APIs while that
  // handshake is pending or has failed.
  if (window.__agentsamCmsSourceHostReady) {
    await window.__agentsamCmsSourceHostReady;
    if (!window.AgentSamThemeEditorHost) return;
  }
  // A site/project/page must be verified by the account-owned CMS before
  // any legacy fallback page or showcase can initialize the editor.
  if (window.__agentsamThemeEditorEntryReady) {
    const entry=await window.__agentsamThemeEditorEntryReady;
    if (!entry?.ready) return;
  }
  let themeStyles = null;
  import("/admin/js/theme-style-contract.mjs").then(function(contract) {
    themeStyles = contract;
    applyThemeSettingsPreview();
  }).catch(function() {
    setNote("Theme settings validation is unavailable. Reload to retry; your draft has not been changed.", "error");
  });
  const params = new URLSearchParams(location.search);
  const showcaseTheme = ['violet','resolve','plain-jane'].includes(params.get('showcase')) ? params.get('showcase') : '';
  // Packaged showcases stay preview-only unless the host explicitly provides
  // a site-scoped CMS adapter. Resolve's local proof uses the same editor API
  // contract without connecting to a customer or production database.
  const host = window.AgentSamThemeEditorHost || null;
  let stockHandoffShown = false;
  const editorRequest = host ? host.adapter.request.bind(host.adapter) : (window.cmsAdminFetch || window.adminFetch);
  const violetShowcase = showcaseTheme === 'violet';
  const resolveShowcase = showcaseTheme === 'resolve';
  const journalShowcase = showcaseTheme === 'plain-jane';
  const localShowcase = Boolean(showcaseTheme);
  const showcaseDisplayName = journalShowcase ? 'Plain Jane Journal' : resolveShowcase ? 'Resolve' : 'Violet';
  let slug = host?.page || params.get('slug') || (localShowcase ? 'home' : 'shop');
  if (!host) window.cmsActivePageSlug = slug;
  let pageData = null;
  let siteData = null;
  let pages = [];
  let pagePickerCategory = null;
  let showcaseTemplate = null;
  let activeSectionKey = null;
  let activeSectionOwner = slug;
  let selectedTheme = 'heuristic';
  let persistedThemeVersion = 0;
  let installedThemeSlugs = new Set(['heuristic']);
  let previewBlobUrl = null;
  let siteDraftTouched = false;
  let liveUnimported = false;
  let missingSourceSections = [];
  let liveSourceCaptured = false;
  let liveCapturedSections = [];
  let liveExistingDraft = false;
  let importingLiveSource = false;
  let unmanagedLiveSections = [];
  let activeBlockId = null;
  let activeFieldKey = null;
  // The selected authored slot persists while its appearance controls are edited.
  let selectedStyleFieldKey = null;
  let miniAgentSam = null;
  let miniAgentSamPromise = null;
  let miniAgentSamSelectionTick = 0;
  let miniAgentSamVisible = false;
  let miniAnchor = null;

  function setMiniAnchor(element, frame, event) {
    if (!element) { miniAnchor = null; return; }
    const rect = element.getBoundingClientRect();
    const rx = event && rect.width ? Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) : null;
    const ry = event && rect.height ? Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) : null;
    miniAnchor = { element, frame: frame || null, rx, ry, fallbackX: event?.clientX ?? rect.left + rect.width / 2, fallbackY: event?.clientY ?? rect.top };
  }

  function selectedMiniBounds() {
    // Anchor the contextual composer to the entire selected DOM element, not
    // a 2px point within its text/button. The workbench can then avoid it.
    const anchor = miniAnchor;
    let element = anchor?.element?.isConnected ? anchor.element : null;
    let frame = anchor?.frame?.isConnected ? anchor.frame : null;
    // A live CMS preview may remount its iframe after autosave or a theme
    // refresh. Resolve the selected element again instead of anchoring the
    // composer to the unrelated inspector header when the old DOM is stale.
    if (!element && activeSectionKey) {
      const candidateFrame = frame || byId('theme-preview');
      try {
        const preview = candidateFrame?.contentDocument;
        const section = preview?.querySelector(
          '[data-cms-section="' + CSS.escape(activeSectionKey) + '"], [data-section-id="' + CSS.escape(activeSectionKey) + '"]'
        );
        element = (activeFieldKey && section?.querySelector('[data-cms="' + CSS.escape(activeFieldKey) + '"]')) ||
          (activeBlockId && section?.querySelector('[data-cms-block="' + CSS.escape(activeBlockId) + '"]')) ||
          section || null;
        if (element && candidateFrame) {
          frame = candidateFrame;
          setMiniAnchor(element, frame);
        }
      } catch { /* Cross-origin previews must not disrupt the editor. */ }
    }
    const resolved = element || byId('te-inspector-title');
    if (!resolved) return { left: 12, top: 72, width: 30, height: 25 };
    const rect = resolved.getBoundingClientRect();
    if (frame?.isConnected) {
      const outer = frame.getBoundingClientRect();
      const sx = outer.width / Math.max(frame.clientWidth, 1);
      const sy = outer.height / Math.max(frame.clientHeight, 1);
      return {
        left: outer.left + rect.left * sx,
        top: outer.top + rect.top * sy,
        width: Math.max(2, rect.width * sx),
        height: Math.max(2, rect.height * sy),
      };
    }
    return { left: rect.left, top: rect.top, width: Math.max(2, rect.width), height: Math.max(2, rect.height) };
  }
  let pendingAgentProposal = null;
  let patchTimer = null;
  let refreshTimer = null;
  let mediaLibrary = [];
  const MEDIA_PICKER_BATCH_SIZE = 40;
  let mediaVisibleLimit = MEDIA_PICKER_BATCH_SIZE;
  let mediaTarget = null;
  let selectedMediaAsset = null;
  const mediaUndo = new Map();
  const expandedSections = new Set();
  const expandedMenus = new Set();
  let treeExpandedForPage = null;
  let sectionInsertIndex = null;
  const resourceCache = Object.create(null);
  let dirty = false;
  const dirtySections = new Set();
  const dirtyVersions = new Map();
  let autosaveTimer = null;
  let saveInFlight = null;
  let publishInFlight = false;
  let hasEditedThisSession = false;
  let autosaveFailed = false;
  const preferredDevice = host?.initialDevice || params.get('previewMode') || (localStorage.getItem('agentsam:cms:preview-device') || localStorage.getItem('fnf-theme-editor-device'));
  let device = ['desktop','tablet','mobile'].includes(preferredDevice) ? preferredDevice : 'desktop';
  let inspectionEnabled = true;
  const undoHistory = [];
  const redoHistory = [];
  let lastHistoryTime = 0;
  function updateUndoRedo() {
    const undo = byId('te-undo');
    const redo = byId('te-redo');
    if (undo) undo.disabled = undoHistory.length === 0;
    if (redo) redo.disabled = redoHistory.length === 0;
  }
  function recordFieldHistory(section, fieldKey, before, after) {
    const owner = sectionOwner(section);
    const previous = undoHistory.at(-1);
    const now = Date.now();
    if (previous && previous.owner === owner && previous.key === section.key &&
        previous.field === fieldKey && now - lastHistoryTime < 650) {
      previous.after = after;
    } else {
      undoHistory.push({ owner, key: section.key, field: fieldKey, before, after });
      if (undoHistory.length > 100) undoHistory.shift();
    }
    redoHistory.length = 0;
    lastHistoryTime = now;
    updateUndoRedo();
  }
  function replayFieldHistory(source, destination, direction) {
    const entry = source.pop();
    if (!entry) return;
    const section = findSection(entry.key, entry.owner);
    if (!section) { source.push(entry); return; }
    section.content = structuredClone(entry[direction]);
    document.dispatchEvent(new CustomEvent("theme-editor:global-settings-ready"));
    destination.push(entry);
    lastHistoryTime = 0;
    markSectionDirty(section);
    renderInspector();
    renderTree();
    scheduleLocalPreview();
    highlightPreviewSelection();
    updateUndoRedo();
  }

  // Selection outlines and local preview updates are editor fundamentals,
  // not per-browser preferences that can silently disable authoring feedback.
  const showOutlines = true;
  const autoPreview = true;

  // Public URL inventory for the SDK site; not CMS publication evidence.
  // Tenant-owned CMS pages from /api/admin/cms/pages always take precedence.
  const fallbackPages = [
    { slug: 'home', title: 'Home', route: '/' },
    { slug: 'learn', title: 'Learn', route: '/learn' },
    { slug: 'themes', title: 'Themes', route: '/themes/' },
    { slug: 'sdk-help', title: 'SDK Help', route: '/packages/sdk/help/' },
    { slug: 'sam-docs', title: 'SAM Docs', route: '/docs/sam/' },
    { slug: 'structured-decisions', title: 'Structured Decisions', route: '/docs/sam/structured-decisions' },
    { slug: 'infrastructure-cookbooks', title: 'Infrastructure Cookbooks', route: '/docs/sam/infrastructure-cookbooks' },
    { slug: 'native-runtime', title: 'Native Go Runtime', route: '/docs/sam/native-runtime' }
  ];
  const icon = {
    page: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 3h9l3 3v15H6z" stroke="currentColor" stroke-width="1.7"/><path d="M15 3v4h4" stroke="currentColor" stroke-width="1.7"/></svg>',
    section: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M5 7h14M5 12h14M5 17h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    desktop: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="13" rx="2" stroke="currentColor" stroke-width="1.7"/><path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    tablet: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="5" y="2.5" width="14" height="19" rx="2.5" stroke="currentColor" stroke-width="1.7"/></svg>',
    mobile: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="7" y="2.5" width="10" height="19" rx="2.5" stroke="currentColor" stroke-width="1.7"/></svg>',
    refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 6v5h-5M4 18v-5h5" stroke="currentColor" stroke-width="1.7"/><path d="M6 9a7 7 0 0 1 12-2l2 2M4 15l2 2a7 7 0 0 0 12-2" stroke="currentColor" stroke-width="1.7"/></svg>',
    external: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M14 5h5v5M19 5l-8 8" stroke="currentColor" stroke-width="1.7"/><path d="M19 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" stroke="currentColor" stroke-width="1.7"/></svg>',
    exit: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M10 7 5 12l5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4" stroke="currentColor" stroke-width="1.7"/></svg>',
    sections: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/><path d="M14 4h7M14 9h7M14 15h7M14 20h7"/></svg>',
    settings: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/></svg>',
    embeds: '<svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1M19 3a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1m-12 5 3 3m-3 3 3-3H5a2 2 0 0 1-2-2v-2"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="3" width="7" height="7" rx="1"/></svg>'
    ,
    panel: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>',
    inspect: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.034 12.681a.498.498 0 0 1 .647-.647l9 3.5a.5.5 0 0 1-.033.943l-3.444 1.068a1 1 0 0 0-.66.66l-1.067 3.443a.5.5 0 0 1-.943.033z"/><path d="M5 3a2 2 0 0 0-2 2"/><path d="M19 3a2 2 0 0 1 2 2"/><path d="M5 21a2 2 0 0 1-2-2"/><path d="M9 3h1"/><path d="M9 21h2"/><path d="M14 3h1"/><path d="M3 9v1"/><path d="M21 9v2"/><path d="M3 14v1"/></svg>',
    undo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-2"/></svg>',
    redo: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h2"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>'
  };

  function shellMarkup() {
    return [
      '<div class="theme-studio">',
        '<header class="theme-studio-toolbar">',
          '<div class="theme-studio-toolbar__left">',
            '<button type="button" class="te-mode-btn" id="te-exit" aria-label="Exit editor" title="Exit">', icon.exit, '</button>',
            '<button type="button" class="te-mode-btn" data-drawer-mode="sections" aria-pressed="true" aria-label="Sections" title="Sections (⌘⌃1)">', icon.sections, '</button>',
            '<button type="button" class="te-mode-btn" data-drawer-mode="theme-settings" aria-pressed="false" aria-label="Theme settings" title="Theme settings (⌘⌃2)">', icon.settings, '</button>',
            '<button type="button" class="te-mode-btn" data-drawer-mode="app-embeds" aria-pressed="false" aria-label="App embeds" title="App embeds (⌘⌃3)">', icon.embeds, '</button>',
          '</div>',
          '<div class="theme-studio-toolbar__center">',
            '<div class="te-theme-identity" aria-live="polite"><strong id="te-theme-name">Theme</strong><span class="te-theme-status" id="te-theme-status" hidden></span></div>',
            '<div class="te-theme-switcher"><span class="te-theme-switcher__caption">Theme</span><button type="button" id="te-theme-trigger" aria-haspopup="true" aria-expanded="false" aria-controls="te-theme-menu" title="Switch the theme preview"><span id="te-theme-trigger-label">Theme</span><span aria-hidden="true">⌄</span></button>',
              '<div class="te-toolbar-dropdown te-theme-menu" id="te-theme-menu" hidden>' + ((window.ThemeStudioPreview && window.ThemeStudioPreview.themes) || []).map(function(theme) {
                return '<button type="button" data-theme-preview="' + cmsEscapeAttr(theme.id) + '" aria-pressed="' + String(theme.id === selectedTheme) + '" class="te-theme-option' + (theme.id === selectedTheme ? ' is-active' : '') + '"><strong>' + cmsEscapeHtml(theme.name) + '</strong><small>' + cmsEscapeHtml(theme.status === 'preview' ? 'Preview only' : 'Installed') + '</small></button>';
              }).join('') + '</div></div>',

            '<div class="te-page-menu">',
              '<button type="button" class="te-page-trigger" id="te-page-trigger" aria-expanded="false" title="Choose a storefront page"><span class="te-page-trigger__content">', icon.page, '<strong id="te-page-title">Loading…</strong></span><span aria-hidden="true">⌄</span></button>',
              '<div class="te-page-popover" id="te-page-popover" hidden><input class="te-page-search" id="te-page-search" placeholder="Search pages, products, collections" autocomplete="off" aria-label="Search pages"><div class="te-page-options" id="te-page-options"></div></div>',
            '</div>',
            '<span class="te-save-state" id="te-save-state" role="status" aria-live="polite" title="Loading" aria-label="Loading">Loading</span>',
          '</div>',
          '<div class="theme-studio-toolbar__right">',
            '<button type="button" class="te-icon-btn te-agentsam-mark" id="agentsam-toggle" aria-label="Open AgentSam Side Assistant" title="AgentSam Side Assistant" aria-expanded="false"><img src="/admin/brand/agentsam-gorilla-tiny.svg" width="20" height="20" alt="" aria-hidden="true"></button>',
            '<button type="button" class="te-icon-btn" id="te-inspect-mode" aria-label="Canvas inspection on" title="Canvas inspection on — select sections in the preview" aria-pressed="true">', icon.inspect, '</button>',
            '<span class="te-toolbar-separator" aria-hidden="true"></span>',
            '<div class="te-device-switch" aria-label="Preview device">',
              '<button type="button" class="te-device-btn" data-device="desktop" aria-label="Desktop preview" title="Desktop">', icon.desktop, '</button>',
              '<button type="button" class="te-device-btn" data-device="tablet" aria-label="Tablet preview" title="Tablet">', icon.tablet, '</button>',
              '<button type="button" class="te-device-btn" data-device="mobile" aria-label="Mobile preview" title="Mobile">', icon.mobile, '</button>',
            '</div>',
            '<button type="button" class="te-icon-btn" id="te-undo" aria-label="Undo" title="Undo (⌘Z)" disabled>', icon.undo, '</button>',
            '<button type="button" class="te-icon-btn" id="te-redo" aria-label="Redo" title="Redo (⌘⇧Z)" disabled>', icon.redo, '</button>',
            '<div class="te-toolbar-more">',
              '<button type="button" class="te-icon-btn" id="te-more" aria-label="More editor actions" aria-haspopup="true" aria-expanded="false" title="More actions">', icon.more, '</button>',
              '<div class="te-toolbar-dropdown" id="te-more-menu" hidden>' +
                (typeof host?.onEditCode === 'function' ? '<button type="button" id="te-edit-code">Edit code</button>' : '') +
                (typeof host?.onDuplicate === 'function' ? '<button type="button" id="te-duplicate-draft">Duplicate private draft</button>' : '') +
                (typeof host?.onDelete === 'function' ? '<button type="button" id="te-delete-draft">Delete private draft…</button>' : '') +
                '<button type="button" class="te-mobile-more-entry" id="te-more-settings">Theme settings</button>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-inspect" aria-pressed="true">Canvas inspection</button>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-embeds">App embeds</button>' +
                '<div class="te-mobile-more-group" role="group" aria-label="Theme previews"><span>Theme previews</span>' +
                  ((window.ThemeStudioPreview && window.ThemeStudioPreview.themes) || []).map(function(theme) {
                    return '<button type="button" class="te-mobile-more-entry" data-theme-preview="' + cmsEscapeAttr(theme.id) + '" aria-pressed="' + String(theme.id === selectedTheme) + '">' + cmsEscapeHtml(theme.name) + '</button>';
                  }).join('') + '</div>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-publish">Publish live…</button>' +
                '<button type="button" id="te-view-draft">View</button><button type="button" id="te-shortcuts">Keyboard shortcuts</button>' +
                (host?.metadata?.version ? '<div class="te-source-footer" aria-label="Theme version">' + cmsEscapeHtml(host.metadata.name || '') + ' · Version ' + cmsEscapeHtml(host.metadata.version) + (host.metadata.developer ? ' · ' + cmsEscapeHtml(host.metadata.developer) : '') + '</div>' : '') +
                '<div id="te-shortcuts-help" class="te-shortcuts-help" hidden>⌘S · Save<br>⌘Z · Undo<br>⌘⇧Z · Redo<br>⌘⌃1 · Sections<br>⌘⌃2 · Theme settings<br>⌘⌃3 · App embeds</div></div>',
            '</div>',
            '<div class="te-save-actions"><button type="button" class="te-toolbar-btn is-primary" id="te-save" title="Save private draft (⌘S)">Save</button><button type="button" class="te-save-caret" id="te-save-options" aria-label="Additional save options" title="Additional save options" aria-haspopup="true" aria-expanded="false">⌄</button>',
              '<div class="te-toolbar-dropdown te-save-menu" id="te-save-menu" hidden><button type="button" id="te-publish" title="Publish reviewed revision">Publish live…</button></div>',
            '</div>',
          '</div>',
        '</header>',
        '<div class="theme-studio-workspace">',
          '<nav class="te-mobile-pane-switch" id="te-mobile-pane-switch" aria-label="Mobile editor navigation">',
            '<button type="button" data-mobile-pane="sections">Sections</button>',
            '<button type="button" data-mobile-pane="preview" aria-current="true">Preview</button>',
            '<button type="button" data-mobile-pane="settings">Edit</button>',
          '</nav>',
          '<aside class="theme-studio-tree" id="te-editor-drawer">' +
            '<div class="te-mobile-sheet-head"><button type="button" class="te-mobile-sheet-grip" data-sheet-grip="sections" aria-label="Resize sections" title="Drag or press arrows to resize"><span></span></button><div class="te-mobile-sheet-head__row"><strong id="te-mobile-sections-title">Sections</strong><div><button type="button" data-sheet-expand="sections" aria-label="Expand sections sheet">⤢</button><button type="button" data-sheet-close="sections" aria-label="Close sections">×</button></div></div></div>' +
            '<section class="te-drawer-panel" data-drawer-panel="sections"><div class="te-panel-title te-panel-title--compact"><h2 id="te-tree-title">Page</h2></div><div id="te-tree"></div><section id="te-block-panel" data-surface="left" hidden></section></section>' +
            '<section class="te-drawer-panel" data-drawer-panel="theme-settings" hidden></section>' +
            '<section class="te-drawer-panel" data-drawer-panel="app-embeds" hidden><div class="te-panel-title"><span class="te-panel-kicker">Storefront</span><h2>App embeds</h2><p>Extensions that run on the storefront, not admin apps.</p></div><input class="te-page-search" id="te-embed-search" placeholder="Search app embeds" aria-label="Search app embeds"><div class="te-empty" id="te-embed-empty">No storefront embeds are installed for this theme.</div></section>' +
          '</aside>',
          '<main class="theme-studio-canvas">',
            '<div class="te-preview-bar"><span id="te-preview-label">Storefront preview</span><div class="te-preview-bar__actions"><button class="te-import-live" type="button" id="te-import-live" hidden>Import live page</button><button class="te-icon-btn" type="button" id="te-refresh" title="Refresh preview">', icon.refresh, '</button><a class="te-icon-btn" id="te-open-tab" href="#" target="_blank" rel="noopener" title="Open published storefront page in a new tab">', icon.external, '</a></div></div>',
            '<div class="te-preview-stage"><div class="te-preview-device" id="te-preview-device" data-device="desktop"><iframe id="theme-preview" title="Storefront preview" class="theme-editor-preview"></iframe></div></div>',
            '<div class="te-preview-status"><" id="te-page-search" placeholder="Search pages, products, collections" autocomplete="off" aria-label="Search pages"><div class="te-page-options" id="te-page-options"></div></div>',
            '</div>',
            '<span class="te-save-state" id="te-save-state" role="status" aria-live="polite" title="Loading" aria-label="Loading">Loading</span>',
          '</div>',
          '<div class="theme-studio-toolbar__right">',
            '<button type="button" class="te-icon-btn te-agentsam-mark" id="agentsam-toggle" aria-label="Open AgentSam Side Assistant" title="AgentSam Side Assistant" aria-expanded="false"><img src="/admin/brand/agentsam-gorilla-tiny.svg" width="20" height="20" alt="" aria-hidden="true"></button>',
            '<button type="button" class="te-icon-btn" id="te-inspect-mode" aria-label="Canvas inspection on" title="Canvas inspection on — select sections in the preview" aria-pressed="true">', icon.inspect, '</button>',
            '<span class="te-toolbar-separator" aria-hidden="true"></span>',
            '<div class="te-device-switch" aria-label="Preview device">',
              '<button type="button" class="te-device-btn" data-device="desktop" aria-label="Desktop preview" title="Desktop">', icon.desktop, '</button>',
              '<button type="button" class="te-device-btn" data-device="tablet" aria-label="Tablet preview" title="Tablet">', icon.tablet, '</button>',
              '<button type="button" class="te-device-btn" data-device="mobile" aria-label="Mobile preview" title="Mobile">', icon.mobile, '</button>',
            '</div>',
            '<button type="button" class="te-icon-btn" id="te-undo" aria-label="Undo" title="Undo (⌘Z)" disabled>', icon.undo, '</button>',
            '<button type="button" class="te-icon-btn" id="te-redo" aria-label="Redo" title="Redo (⌘⇧Z)" disabled>', icon.redo, '</button>',
            '<div class="te-toolbar-more">',
              '<button type="button" class="te-icon-btn" id="te-more" aria-label="More editor actions" aria-haspopup="true" aria-expanded="false" title="More actions">', icon.more, '</button>',
              '<div class="te-toolbar-dropdown" id="te-more-menu" hidden>' +
                (typeof host?.onEditCode === 'function' ? '<button type="button" id="te-edit-code">Edit code</button>' : '') +
                (typeof host?.onDuplicate === 'function' ? '<button type="button" id="te-duplicate-draft">Duplicate private draft</button>' : '') +
                (typeof host?.onDelete === 'function' ? '<button type="button" id="te-delete-draft">Delete private draft…</button>' : '') +
                '<button type="button" class="te-mobile-more-entry" id="te-more-settings">Theme settings</button>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-inspect" aria-pressed="true">Canvas inspection</button>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-embeds">App embeds</button>' +
                '<div class="te-mobile-more-group" role="group" aria-label="Theme previews"><span>Theme previews</span>' +
                  ((window.ThemeStudioPreview && window.ThemeStudioPreview.themes) || []).map(function(theme) {
                    return '<button type="button" class="te-mobile-more-entry" data-theme-preview="' + cmsEscapeAttr(theme.id) + '" aria-pressed="' + String(theme.id === selectedTheme) + '">' + cmsEscapeHtml(theme.name) + '</button>';
                  }).join('') + '</div>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-publish">Publish live…</button>' +
                '<button type="button" id="te-view-draft">View</button><button type="button" id="te-shortcuts">Keyboard shortcuts</button>' +
                (host?.metadata?.version ? '<div class="te-source-footer" aria-label="Theme version">' + cmsEscapeHtml(host.metadata.name || '') + ' · Version ' + cmsEscapeHtml(host.metadata.version) + (host.metadata.developer ? ' · ' + cmsEscapeHtml(host.metadata.developer) : '') + '</div>' : '') +
                '<div id="te-shortcuts-help" class="te-shortcuts-help" hidden>⌘S · Save<br>⌘Z · Undo<br>⌘⇧Z · Redo<br>⌘⌃1 · Sections<br>⌘⌃2 · Theme settings<br>⌘⌃3 · App embeds</div></div>',
            '</div>',
            '<div class="te-save-actions"><button type="button" class="te-toolbar-btn is-primary" id="te-save" title="Save private draft (⌘S)">Save</button><button type="button" class="te-save-caret" id="te-save-options" aria-label="Additional save options" title="Additional save options" aria-haspopup="true" aria-expanded="false">⌄</button>',
              '<div class="te-toolbar-dropdown te-save-menu" id="te-save-menu" hidden><button type="button" id="te-publish" title="Publish reviewed revision">Publish live…</button></div>',
            '</div>',
          '</div>',
        '</header>',
        '<div class="theme-studio-workspace">',
          '<nav class="te-mobile-pane-switch" id="te-mobile-pane-switch" aria-label="Mobile editor navigation">',
            '<button type="button" data-mobile-pane="sections">Sections</button>',
            '<button type="button" data-mobile-pane="preview" aria-current="true">Preview</button>',
            '<button type="button" data-mobile-pane="settings">Edit</button>',
          '</nav>',
          '<aside class="theme-studio-tree" id="te-editor-drawer">' +
            '<div class="te-mobile-sheet-head"><button type="button" class="te-mobile-sheet-grip" data-sheet-grip="sections" aria-label="Resize sections" title="Drag or press arrows to resize"><span></span></button><div class="te-mobile-sheet-head__row"><strong id="te-mobile-sections-title">Sections</strong><div><button type="button" data-sheet-expand="sections" aria-label="Expand sections sheet">⤢</button><button type="button" data-sheet-close="sections" aria-label="Close sections">×</button></div></div></div>' +
            '<section class="te-drawer-panel" data-drawer-panel="sections"><div class="te-panel-title te-panel-title--compact"><h2 id="te-tree-title">Page</h2></div><div id="te-tree"></div><section id="te-block-panel" data-surface="left" hidden></section></section>' +
            '<section class="te-drawer-panel" data-drawer-panel="theme-settings" hidden></section>' +
            '<section class="te-drawer-panel" data-drawer-panel="app-embeds" hidden><div class="te-panel-title"><span class="te-panel-kicker">Storefront</span><h2>App embeds</h2><p>Extensions that run on the storefront, not admin apps.</p></div><input class="te-page-search" id="te-embed-search" placeholder="Search app embeds" aria-label="Search app embeds"><div class="te-empty" id="te-embed-empty">No storefront embeds are installed for this theme.</div></section>' +
          '</aside>',
          '<main class="theme-studio-canvas">',
            '<div class="te-preview-bar"><span id="te-preview-label">Storefront preview</span><div class="te-preview-bar__actions"><button class="te-import-live" type="button" id="te-import-live" hidden>Import live page</button><button class="te-icon-btn" type="button" id="te-refresh" title="Refresh preview">', icon.refresh, '</button><a class="te-icon-btn" id="te-open-tab" href="#" target="_blank" rel="noopener" title="Open published storefront page in a new tab">', icon.external, '</a></div></div>',
            '<div class="te-preview-stage"><div class="te-preview-device" id="te-preview-device" data-device="desktop"><iframe id="theme-preview" title="Storefront preview" class="theme-editor-preview"></iframe></div></div>',
            '<div class="te-preview-status"><span class="te-preview-mode">Draft</span><span class="te-selected-path" id="te-selected-path">Select a section in the preview or tree</span></div>',
          '</main>',
          '<div class="te-mobile-selection-bar"><button type="button" id="te-mobile-edit-selection"><span id="te-mobile-selection-label">Select an element</span><span>Edit <span aria-hidden="true">⌃</span></span></button></div>',
          '<aside class="theme-editor-panel">',
            '<div class="te-mobile-sheet-head"><button type="button" class="te-mobile-sheet-grip" data-sheet-grip="settings" aria-label="Resize inspector" title="Drag or press arrows to resize"><span></span></button><div class="te-mobile-sheet-head__row"><strong id="te-mobile-edit-title">Edit selection</strong><div><button type="button" data-sheet-expand="settings" aria-label="Expand editor">⤢</button><button type="button" data-sheet-close="settings" aria-label="Close editor">×</button></div></div></div>',
            '<div class="te-inspector-head"><div class="te-inspector-title"><strong id="te-inspector-title">Section</strong><span id="te-inspector-subtitle">Select a section</span></div><div class="te-inspector-tools"><span class="te-badge" id="te-section-status">draft</span><button type="button" class="te-icon-btn te-inspector-close" id="te-inspector-close" aria-label="Close settings panel" title="Close settings panel">×</button></div></div>',
            '<div class="te-inspector-body" id="te-inspector-body"></div><div data-composer-slot="editor" hidden aria-hidden="true"></div>',
            '<div class="te-inspector-save"><p class="te-note" id="te-note" role="status" aria-live="polite"></p></div>',
          '</aside>',
        '</div>',
      '</div>',
      '<div class="te-media-modal" id="te-media-modal" hidden><div class="te-media-dialog" role="dialog" aria-modal="true" aria-labelledby="te-media-title">',
        '<div class="te-media-dialog__head"><div><strong id="te-media-title">Select media</strong><p>Choose an existing asset or upload a new one. Nothing is published here.</p></div><button type="button" class="te-icon-btn" id="te-media-close" aria-label="Close media picker" title="Close media picker">×</button></div>',
        '<div class="te-media-dialog__tools"><input id="te-media-search" type="search" placeholder="Search media" aria-label="Search media by filename or folder"><select id="te-media-filter" aria-label="Filter media"><option value="all">All media</option><option value="images">Images</option><option value="products">Product media</option><option value="videos">Videos</option><option value="models">3D models</option></select><select id="te-media-sort" aria-label="Sort media"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="name">Name A–Z</option></select><label class="te-upload-target" title="Choose image or video files">+ Upload<input id="te-media-upload" type="file" accept="image/*,video/*" multiple></label></div><div class="te-media-dropzone" id="te-media-dropzone" tabindex="0" role="button" aria-label="Upload files or drop images and videos here"><strong>+ Add files</strong><span>Drag images or videos here, or choose files</span></div><div class="te-media-alert" id="te-media-alert" role="status" aria-live="polite" hidden></div>',
        '<div class="te-media-grid" id="te-media-grid" role="group" aria-label="Available media"></div>',
        '<div class="te-media-dialog__footer"><span id="te-media-count" class="te-media-dialog__count" role="status"></span><span id="te-media-selected-name" class="te-media-dialog__selected">Select an asset to preview</span><button type="button" class="te-media-button" id="te-media-cancel">Cancel</button><button type="button" class="te-toolbar-btn is-primary" id="te-media-confirm" disabled>Use media</button></div>',
      '</div></div>'
    ].join('');
  }

  if (host) {
    document.body.innerHTML = shellMarkup();
    document.body.dataset.themeEditorEmbedded = '';
    document.body.dataset.shellMode = 'theme-editor';
  } else {
    renderShell('/admin/theme-editor', shellMarkup(), { fullBleed: true, shellMode: 'theme-editor' });
  }

  const byId = function(id) { return document.getElementById(id); };
  function mountEditorTooltips() {
    const root = document.querySelector('.theme-studio');
    if (!root || byId('te-hover-help')) return;
    const tip = document.createElement('div');
    tip.id = 'te-hover-help';
    tip.className = 'te-hover-help';
    tip.setAttribute('role', 'tooltip');
    tip.hidden = true;
    document.body.appendChild(tip);
    let anchor = null;
    function hide() {
      if (anchor) anchor.removeAttribute('aria-describedby');
      anchor = null;
      tip.hidden = true;
    }
    function target(node) {
      const trigger = node?.closest?.('button, a, [role="button"]');
      return trigger && root.contains(trigger) ? trigger : null;
    }
    function reveal(node) {
      if (!node) return hide();
      const label = node.dataset.tooltip || node.getAttribute('title') || node.getAttribute('aria-label');
      if (!label || node.disabled) return hide();
      if (anchor && anchor !== node) anchor.removeAttribute('aria-describedby');
      anchor = node;
      node.dataset.tooltip = label;
      node.removeAttribute('title');
      node.setAttribute('aria-describedby', tip.id);
      tip.textContent = label;
      tip.hidden = false;
      const rect = node.getBoundingClientRect();
      const width = tip.getBoundingClientRect().width;
      const height = tip.getBoundingClientRect().height;
      tip.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - width / 2, innerWidth - width - 8)) + 'px';
      const below = rect.bottom + height + 12 < innerHeight;
      tip.style.top = (below ? rect.bottom + 7 : Math.max(7, rect.top - height - 7)) + 'px';
    }
    root.addEventListener('pointerover', function(event) { reveal(target(event.target)); });
    root.addEventListener('pointerout', function(event) {
      if (!anchor || anchor.contains(event.relatedTarget)) return;
      hide();
    });
    root.addEventListener('focusin', function(event) { reveal(target(event.target)); });
    root.addEventListener('focusout', function(event) {
      if (anchor?.contains(event.relatedTarget)) return;
      hide();
    });
    root.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
  }
  mountEditorTooltips();

  if (host) {
    const themeMenu = document.querySelector('.te-theme-menu');
    if (themeMenu) themeMenu.hidden = true;
    const switcher = document.querySelector('.te-theme-switcher');
    if (switcher) switcher.hidden = true;
  }

  let mobileSheetSize = 'half'; // Balanced default: storefront and inspector remain visible together.
  function isPhoneEditor() { return window.matchMedia('(max-width: 900px)').matches; }

  // CSS 100dvh is the sole mobile editor-height authority.
  // A secondary visualViewport.height minus layout top calculation shortens
  // the editor on Safari and strands the tabs above a blank app-owned band.
  // Keyboard focus/scroll handling must not resize the entire editor.
  function setMobileSheetSize(size) {
    if (!['compact','half','expanded'].includes(size)) return;
    mobileSheetSize = size;
    const studio = document.querySelector('.theme-studio');
    if (studio) studio.dataset.mobileSheet = size;
    if (isPhoneEditor() && studio?.dataset.mobilePane === 'settings') window.requestAnimationFrame?.(revealSelectedMobile);
    document.querySelectorAll('[data-sheet-expand]').forEach(function(button) {
      button.setAttribute('aria-label', size === 'expanded' ? 'Reduce sheet to balanced height' : 'Expand sheet');
      button.setAttribute('aria-pressed', String(size === 'expanded'));
    });
  }
  function setMobilePane(pane) {
    if (!['sections', 'preview', 'settings'].includes(pane)) return;
    const studio = document.querySelector('.theme-studio');
    if (!studio) return;
    studio.dataset.mobilePane = pane;
    if (isPhoneEditor()) {
      if (pane !== 'preview') closeMiniAgentSam();
      else if (inspectionEnabled && activeSectionKey) void openMiniAgentSam();
    }
    if (pane === 'settings') setInspectorVisible(true);
    byId('te-mobile-pane-switch')?.querySelectorAll('[data-mobile-pane]').forEach(function(button) {
      const selected = button.dataset.mobilePane === pane;
      button.classList.toggle('is-active', selected);
      if (selected) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  }
  function wireMobileSheets() {
    document.querySelectorAll('[data-sheet-close]').forEach(function(button) {
      button.addEventListener('click', function() { setMobilePane('preview')','Font size','typography',8,180),
      choices('fontWeight','Font weight','typography',['inherit','400','500','600','700','800','900']),
      choices('fontStyle','Italic','typography',['inherit','normal','italic']),
      choices('textDecoration','Underline','typography',['inherit','none','underline']),
      number('lineHeight','Line height','typography',0.8,3,0.05,'×'),
      number('letterSpacing','Letter spacing','typography',-5,24,0.25),
      choices('textAlign','Alignment','typography',['inherit','left','center','right']),
      choices('textTransform','Text case','typography',['inherit','none','uppercase','lowercase','capitalize']),
      {key:prefix+'color',label:'Text color',type:'color',group:'appearance',designStyle:true},
      {key:prefix+'backgroundColor',label:'Background',type:'color',group:'appearance',designStyle:true},
      number('paddingTop','Top padding','spacing',0,160),
      number('paddingBottom','Bottom padding','spacing',0,160),
    ];
  }

  function currentSettings() {
    const block = currentBlockSchema();
    if (activeBlockId) {
      // A selected block owns its controls. Do not append the host section's
      // generic layout inventory to a Button or Heading.
      const settings = block && Array.isArray(block.settings) ? block.settings.map(function(field) {
        return {...field,key:activeBlockId+'.__settings.'+field.key,blockRelativeKey:field.key};
      }) : [];
      return settings.concat(contextualStyleFields());
    }
    if (activeFieldKey) {
      const schema = currentSectionSchema();
      const sectionPadding = ((schema && schema.settings) || []).filter(function(field) {
        return field.key === "__editor.spacing.paddingTop" || field.key === "__editor.spacing.paddingBottom";
      }).map(function(field) { return {...field,designStyle:true}; });
      // A heading retains the parent section's two main spacing controls,
      // but not its irrelevant media, motion and margin inventory.
      return contextualStyleFields().concat(/cta|button|href|link/i.test(activeFieldKey) ? [] : sectionPadding);
    }
    const schema = currentSectionSchema();
    const defined = ((schema && schema.settings) || []).filter(function(field) {
      // A merchant adjusts the common layout and spacing in the standard
      // inspector. Rare motion/visibility are available under the section menu.
      return /^(layout|spacing|surface|appearance|media)$/i.test(field.group || '');
    }).filter(function(field) {
      // Initial surface should not expose 12 identical margin controls.
      return !/margin(Top|Bottom|Left|Right)|padding(Left|Right)|borderRadius/.test(field.key);
    }).map(function(field) { return {...field,designStyle:true}; });
    return defined;
  }

  function allEditableFields() {
    return currentSchema().concat(currentSettings());
  }

  function fieldKind(field) {
    if (field.type === 'media' || field.type === 'video' || field.type === 'model3d' || field.media) return 'media';
    if (field.type === 'link' || field.type === 'product' || field.type === 'collection' || field.type === 'variant') return 'links';
    return 'content';
  }

  function fieldByKey(key) {
    return allEditableFields().find(function(field) { return field.key === key; }) || null;
  }

  function valueForField(section, field) {
    const value = cmsGetPath(section.content, field.key);
    if (value !== undefined && value !== null && value !== '') return value;
    return field.default !== undefined ? field.default : '';
  }

  function setFieldValue(field, value) {
    const section = currentSection();
    if (!section) return;
    let next = value;
    if (field.type === 'number' || field.type === 'range') {
      const parsed = Number(value);
      next = Number.isFinite(parsed) ? parsed : (field.default ?? 0);
    } else if (field.type === 'boolean') {
      next = Boolean(value);
    }
    const before = structuredClone(section.content);
    if (field.designStyle && (value === '' || value === null || value === 'inherit' || value === undefined)) {
      // Delete the override, never overwrite the packaged theme or authored HTML.
      const parts=field.key.split('.');
      const parent=cmsGetPath(section.content,parts.slice(0,-1).join('.'));
      if(parent && typeof parent==='object')delete parent[parts.at(-1)];
    } else {
      if (field.designStyle && field.type === 'number') {
        const parsed=Number(value);
        if (!Number.isFinite(parsed) || parsed < field.min || parsed > field.max) return;
        next=parsed;
      }
      cmsSetPath(section.content, field.key, next);
    }
    if (JSON.stringify(before) === JSON.stringify(section.content)) return;
    recordFieldHistory(section, field.key, before, structuredClone(section.content));
    markSectionDirty(section);
    scheduleLocalPreview();
    byId('te-selected-path').textContent = (sectionOwner(section) === 'site' ? 'Global' : slug) + ' / ' + section.key + ' / ' + field.key;
  }

  function setNote(message, kind) {
    const el = byId('te-note');
    el.textContent = message || '';
    el.className = 'te-note' + (kind ? ' is-' + kind : '');
  }

  function setSaveState(label, state) {
    const el = byId('te-save-state');
    el.textContent = label;
    el.title = label;
    el.setAttribute('aria-label', label);
    el.className = 'te-save-state' + (state ? ' is-' + state : '');
  }

  function savedStamp(base) {
    try {
      return base + ' · ' + new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    } catch { return base; }
  }

  function schedulePrivateAutosave() {
    clearTimeout(autosaveTimer);
    if (!dirty || liveUnimported || autosaveFailed || (localShowcase && !host?.capabilities?.cmsWrite)) return;
    autosaveTimer = setTimeout(function() {
      void saveDraft({ automatic: true });
    }, 900);
  }

  function markSectionDirty(section) {
    const ref = dirtyRef(section);
    dirtySections.add(ref);
    dirtyVersions.set(ref, (dirtyVersions.get(ref) || 0) + 1);
    if (sectionOwner(section) === 'site') siteDraftTouched = true;
    autosaveFailed = false;
    hasEditedThisSession = true;
    setDirty(true);
  }

  function setDirty(value) {
    dirty = Boolean(value);
    const save = byId('te-save');
    if (save) {
      save.disabled = (localShowcase && !host?.capabilities?.cmsWrite) || liveUnimported || (!dirty && !hasEditedThisSession && !host?.capabilities?.cmsWrite);
      save.classList.toggle('is-dirty', dirty);
      save.setAttribute('aria-label', dirty ? 'Save unsaved draft changes' : 'Save draft — latest changes already saved');
      save.title = dirty ? 'Save draft changes (⌘S)' : 'Draft is saved — Save again if needed (⌘S)';
    }
    if (localShowcase && !host?.capabilities?.cmsWrite) setSaveState(showcaseDisplayName + ' · local preview only');
    else if (localShowcase && host?.capabilities?.cmsWrite) setSaveState(dirty ? 'Unsaved CMS changes' : 'Saved to CMS draft', dirty ? 'dirty' : 'saved');
    else if (liveUnimported) setSaveState('Preview only');
    else if (dirty) setSaveState('Unsaved changes', 'dirty');
    else setSaveState('Saved', 'saved');
    if (!dirty && hasEditedThisSession) {
      const el = byId('te-save-state');
      if (el) el.title = savedStamp('Draft saved');
    }
    if (dirty) schedulePrivateAutosave();
    else clearTimeout(autosaveTimer);
  }

  // Derived from the supported template registry, not the current theme's
  // installed pages or products. Every capability stays offered.
  const { templateNavigation } = await import('/theme-editor/system-template-registry.mjs');
  const storefrontMenu = templateNavigation();
  if (resolveShowcase) {
    const products = storefrontMenu.find(item => item.id === 'products');
    products.children = [
      {title:'All products',page:'resolve-products'},
      {title:'Default product',page:'resolve-product'}
    ];
    const collections = storefrontMenu.find(item => item.id === 'collections');
    collections.children = [
      { title: 'Collections list', page: 'resolve-collections' },
      { title: 'Default collection', page: 'resolve-collection' },
      { title: 'Leather studies', page: 'resolve-leather' },
      { title: 'Knitwear edit', page: 'resolve-knitwear' },
    ];
    for(const [id,page] of [
      ['gift-card','resolve-gift-card'],['search','resolve-search'],
      ['checkout','resolve-checkout'],['404','resolve-404'],['metaobject','resolve-metaobject']]){
      storefrontMenu.find(item => item.id===id).page=page;
    }
    storefrontMenu.find(item=>item.id==='blogs').children=[
      {title:'Editorial archive',page:'resolve-blogs'},
      {title:'Plain Jane · Blog starter',preset:'plain-jane',page:'journal-home'}
    ];
    storefrontMenu.find(item=>item.id==='posts').children=[
      {title:'Editorial article',page:'resolve-article'},
      {title:'Plain Jane · Article starter',preset:'plain-jane',page:'journal-the-art-of-slow-travel'}
    ];
    const cart = storefrontMenu.find(item => item.id === 'cart'); cart.page = 'resolve-cart';
    const password = storefrontMenu.find(item => item.id === 'password'); password.page = 'resolve-password';
    storefrontMenu.find(item=>item.id==='customer').children.push(
      { title: 'Sign in', page: 'resolve-sign-in' },
      { title: 'Sign up', page: 'resolve-sign-up' },
      { title: 'Account overview', page: 'resolve-account' },
      { title: 'Order history', page: 'resolve-orders' },
      { title: 'Saved pieces', page: 'resolve-saved' },
      { title: 'Profile & preferences', page: 'resolve-profile' },
    );
  }
  if (journalShowcase) {
    const journalMenu = [
      {id:'home',title:'Journal home',icon:'home',page:'journal-home'},
      {id:'blogs',title:'Blog index',icon:'blog',children:[{title:'Notes on a quieter life',page:'journal-home'}]},
      {id:'posts',title:'Articles',icon:'post',children:[
        {title:'The art of slow travel',page:'journal-the-art-of-slow-travel'},
        {title:'Analog photography in a digital age',page:'journal-analog-photography-digital-age'}
      ]},
      {id:'gallery',title:'Photography',icon:'collection',page:'journal-photography'},
      {id:'pages',title:'Pages',icon:'page',children:[
        {title:'About',page:'journal-about'},
        {title:'Contact',page:'journal-contact'},
        {title:'Privacy',page:'journal-privacy'},
        {title:'Terms',page:'journal-terms'},
        {title:'404',page:'journal-404'}
      ]}
    ];
    storefrontMenu.find(item=>item.id==='blogs').children.push(...journalMenu.filter(item=>item.id==='blogs').flatMap(item=>item.children||[]));
    storefrontMenu.find(item=>item.id==='posts').children.push(...journalMenu.filter(item=>item.id==='posts').flatMap(item=>item.children||[]));
    storefrontMenu.find(item=>item.id==='pages').children.push(...journalMenu.filter(item=>item.id==='pages').flatMap(item=>item.children||[]));
    storefrontMenu.find(item=>item.id==='home').page='journal-home';
  }
  // Installed package pages are listed from the authorized CMS page inventory below.

  const pickerIconPaths = {
    home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-6h6v6"/>',
    product:'<path d="M3 4h10l8 8-9 9-9-9z"/><circle cx="8" cy="9" r="1"/>',
    collection:'<path d="M3 8 12 3l9 5-9 5zM3 12l9 5 9-5M3 16l9 5 9-5"/>',
    gift:'<rect x="3" y="8" width="18" height="13" rx="2"/><path d="M3 12h18M12 8v13M12 8S5 7 7 4s5 0 5 4zm0 0s7-1 5-4-5 0-5 4Z"/>',
    cart:'<circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/><path d="M2 3h2l3.5 13h11L22 7H5"/>',
    checkout:'<path d="M3 5h18v14H3zM3 10h18m-6 5 2 2 3-3"/>',
    page:'<path d="M6 3h9l3 3v15H6zM15 3v4h3"/>',
    blog:'<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
    post:'<path d="M5 3h14v18H5zM9 7h6M9 11h6M9 15h3"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    plus:'<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'
  };
  function pickerIcon(kind) {
    return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (pickerIconPaths[kind] || pickerIconPaths.page) + '</svg>';
  }
  const catalogResources = { products: [], collections: [], loaded: false };

  async function loadStorefrontResources() {
    if (host || localShowcase || catalogResources.loaded) return;
    catalogResources.loaded = true;
    const requests = await Promise.allSettled([
      editorRequest('/api/admin/products'),
      editorRequest('/api/admin/collections'),
    ]);
    if (requests[0].status === 'fulfilled') catalogResources.products = requests[0].value.products || [];
    if (requests[1].status === 'fulfilled') catalogResources.collections = requests[1].value.collections || [];
    if (!byId('te-page-popover')?.hidden) renderPageOptions(byId('te-page-search').value);
  }

  function showScaffoldTemplate(template, title) {
    if (!localShowcase) {
      // Navigate only to pages delivered by this installed package or site.
      // A generic template choice must never jump into an unrelated showcase.
      const aliases = { 'products-list': 'product', 'collections-list': 'collection', 'gift-card': 'gift_card', '404': 'not_found' };
      const kind = aliases[template] || template;
      const installed = pages.find(page => page.slug === template ||
        page.page_type === kind || page.template_key === kind ||
        page.slug?.endsWith('-' + template));
      if (installed) void switchPage(installed.slug);
      else {
        const params=new URLSearchParams(location.search);
        const target=new URL('/canvas',location.origin);
        target.searchParams.set('host','online-store');
        target.searchParams.set('template',kind);
        if(params.get('site_id'))target.searchParams.set('site_id',params.get('site_id'));
        window.top.location.assign(target.href);
      }
      return;
    }
    showcaseTemplate = { template, title, subtitle: 'Customize this ' + (resolveShowcase ? 'Resolve' : 'Violet') + ' template in your CMS.', buttonLabel: 'Continue', fields: ['Email address','Full name'] };
    byId('te-page-title').textContent = title;
    byId('te-tree-title').textContent = title;
    byId('te-tree').innerHTML = '<div class="te-tree-scaffold"><div class="te-picker-heading">Header</div>' +
      '<div class="te-tree-scaffold-row">▤ &nbsp; Violet header</div><div class="te-picker-heading">Template</div>' +
      '<div class="te-tree-scaffold-row">▤ &nbsp; ' + cmsEscapeHtml(title) + '</div>' +
      '<div class="te-tree-scaffold-row">⊕ &nbsp; Add section · UI scaffold</div>' +
      '<div class="te-picker-heading">Footer</div><div class="te-tree-scaffold-row">▤ &nbsp; Violet footer</div></div>';
    closePageMenu();
    renderScaffoldInspector();
    refreshPreview();
    setNote((resolveShowcase ? 'Resolve' : 'Violet') + ' · ' + title + ' — local template scaffold. No data is connected or published.');
  }

  function renderScaffoldInspector() {
    if (!showcaseTemplate || !localShowcase) return;
    const data = showcaseTemplate;
    const formTemplate = ['checkout','metaobject','contact'].includes(data.template);
    byId('te-inspector-title').textContent = data.title;
    byId('te-inspector-subtitle').textContent = (resolveShowcase ? 'Resolve' : 'Violet') + ' · local template settings';
    byId('te-section-status').textContent = 'preview';
    const panel = byId('te-inspector-body');
    panel.innerHTML = '<div class="te-scaffold-controls"><div class="te-picker-heading">Template content</div>' +
      '<label>Heading<input type="text" maxlength="110" data-scaffold-setting="title" value="' + cmsEscapeAttr(data.title) + '"></label>' +
      '<label>Description<textarea rows="3" data-scaffold-setting="subtitle">' + cmsEscapeHtml(data.subtitle) + '</textarea></label>' +
backgroundColor',label:'Background',type:'color',group:'appearance',designStyle:true},
      number('paddingTop','Top padding','spacing',0,160),
      number('paddingBottom','Bottom padding','spacing',0,160),
    ];
  }

  function currentSettings() {
    const block = currentBlockSchema();
    if (activeBlockId) {
      // A selected block owns its controls. Do not append the host    refreshPreview();
    }));
    panel.querySelectorAll('[data-scaffold-remove]').forEach(button => button.addEventListener('click', () => {
      if (!showcaseTemplate) return;
      showcaseTemplate.fields.splice(Number(button.dataset.scaffoldRemove),1);
      renderScaffoldInspector();
      refreshPreview();
    }));
    panel.querySelector('[data-scaffold-add]')?.addEventListener('click', () => {
      if (!showcaseTemplate || showcaseTemplate.fields.length >= 12) return;
      showcaseTemplate.fields.push('New field');
      renderScaffoldInspector();
      refreshPreview();
    });
  }

  function renderResolveScaffold(template, title) {
    const data = showcaseTemplate || { title, subtitle: '', buttonLabel: 'Continue', fields: [] };
    const safeTitle = cmsEscapeHtml(data.title || title);
    const safeSubtitle = cmsEscapeHtml(data.subtitle || '');
    const needsForm = ['checkout','metaobject','contact','search'].includes(template);
    const form = needsForm
      ? '<div class="r-fields">' + (data.fields || []).map(label =>
        '<label>' + cmsEscapeHtml(label) + '<input disabled placeholder="' + cmsEscapeAttr(label) + '"></label>').join('') +
        '<button disabled>' + cmsEscapeHtml(data.buttonLabel || 'Continue') + ' · Preview</button></div>'
      : '<div class="r-placeholders"><div></div><div></div><div></div></div>';
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>body{margin:0;background:#fbfaf9;color:#0c0c0c;font:14px Geist,Arial,sans-serif}.r-head{background:#0b0b0b;padding:25px 5%;color:#fff;display:flex;justify-content:space-between;letter-spacing:.16em;font-size:11px}.r-head b{letter-spacing:.28em}.r-body{padding:100px max(6%,25px);min-height:55vh}.r-kicker{font-size:10px;letter-spacing:.2em;color:#8b181b;text-transform:uppercase;font-weight:750}.r-body h1{font-size:clamp(38px,5vw,72px);max-width:750px;line-height:1.05;text-transform:uppercase;letter-spacing:-.04em}.r-body p{color:#747474;max-width:500px;line-height:1.65}.r-fields{display:grid;gap:10px;max-width:510px;margin-top:40px}.r-fields label{font-size:11px;display:grid;gap:7px}.r-fields input{height:40px;padding:10px;border:1px solid #dedede}.r-fields button{background:#111;color:white;border:0;padding:15px}.r-placeholders{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin-top:40px}.r-placeholders div{background:#efebed;height:180px}.r-foot{background:#111;color:#888;padding:25px 6%;font-size:11px}.r-tag{display:inline-block;margin-top:30px;padding:10px;border:1px solid #d3bec5;color:#8b181b;font-size:10px}@media(max-width:600px){.r-body{padding:60px 22px}.r-placeholders{grid-template-columns:1fr}}</style></head><body>' +
      '<header class="r-head"><span>SHOP &nbsp; WARDROBE &nbsp; EDITORIAL</span><b>◆ RESOLVE ◆</b></header><main class="r-body">' +
      '<div class="r-kicker">Resolve template · ' + cmsEscapeHtml(template) + '</div><h1>' + safeTitle + '</h1><p>' + safeSubtitle + '</p>' + form +
      '<div class="r-tag">UI scaffold · Not connected to customer data</div></main><footer class="r-foot">RESOLVE ATELIER &nbsp; · &nbsp; AgentSam local preview</footer></body></html>';
  }

  function renderVioletScaffold(template, title) {
    const safeTitle = cmsEscapeHtml(showcaseTemplate?.title || title);
    const safeSubtitle = cmsEscapeHtml(showcaseTemplate?.subtitle || '');
    const safeButton = cmsEscapeHtml(showcaseTemplate?.buttonLabel || 'Continue');
    const safeKind = cmsEscapeHtml(template);
    const cards = template === 'products-list' || template === 'collection' || template === 'collections-list'
      ? '<div class="v-cards"><div>Campaign essentials</div><div>Community merch</div><div>Supporter gifts</div></div>' : '';
    const form = template === 'checkout' || template === 'contact' || template === 'metaobject'
      ? '<div class="v-form">' + (showcaseTemplate?.fields || []).map((label,index) =>
        '<label>' + cmsEscapeHtml(label) + '<input type="text" placeholder="' + cmsEscapeAttr(label) + '" disabled></label>').join('') +
        '<button type="button" disabled>' + safeButton + ' · preview only</button></div>' : '';
    const empty = template === 'cart' ? '<div class="v-empty">Your cart is empty<div class="v-sub">Continue exploring the Violet storefront.</div></div>' : '';
    const search = template === 'search' ? '<div class="v-form"><input placeholder="Search Violet" disabled></div>' : '';
    const password = template === 'password' ? '<div class="v-form"><input type="password" placeholder="Store password" disabled></div>' : '';
    const body = '<div class="v-sub">' + safeSubtitle + '</div>' +
      (form || empty || search || password || cards || '<div class="v-sub">Connect this template to live content after approving the interface.</div>');
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<link rel="stylesheet" href="/themes/violet/demo/global/cpas-public-surface.css">' +
      '<style>body{background:#101127;color:#f6f4ff;font-family:Inter,system-ui,sans-serif;margin:0}.v-header{display:flex;align-items:center;justify-content:space-between;padding:19px 5%;border-bottom:1px solid #ffffff23;background:#15162d}.v-brand{display:flex;align-items:center;gap:11px;font-weight:800}.v-brand img{width:33px;height:33px;object-fit:contain}.v-nav{display:flex;gap:24px;font-size:12px;color:#c1bad2}.v-main{min-height:60vh;padding:64px max(6%,24px);background:radial-gradient(circle at 80% 0%,#713f862f,transparent 48%)}.v-kicker{font-size:11px;text-transform:uppercase;letter-spacing:.17em;color:#c695ed;font-weight:800}.v-main h1{font-family:Georgia,serif;font-size:clamp(35px,5vw,68px);margin:18px 0 10px;letter-spacing:-.04em}.v-sub{color:#bdb7c9;font-size:14px;max-width:520px;line-height:1.6}.v-preview{display:inline-flex;font-size:11px;color:#d8bee8;background:#a758c520;border:1px solid #be8ace54;border-radius:100px;padding:7px 12px;margin-top:20px}.v-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:35px}.v-cards>div{min-height:160px;background:linear-gradient(130deg,#36203d,#25273b);border:1px solid #635070;border-radius:12px;display:flex;align-items:flex-end;padding:20px;font-weight:700}.v-form{max-width:540px;margin-top:30px;display:grid;gap:12px}.v-form label{display:grid;gap:6px;font-size:12px;color:#ddd}.v-form input,.v-form textarea{box-sizing:border-box;padding:13px 15px;width:100%;background:#ffffffef;border:0;border-radius:8px;color:#242424}.v-form button{padding:14px;border:0;border-radius:8px;background:#9345bb;color:#fff;font-weight:750}.v-empty{text-align:center;font-size:22px;font-weight:700;padding:55px 0}.v-footer{padding:27px 5%;border-top:1px solid #ffffff23;color:#a9a4b8;font-size:12px}.v-foot-row{display:flex;justify-content:space-between}@media(max-width:650px){.v-nav{display:none}.v-cards{grid-template-columns:1fr}.v-main{padding:45px 20px}}</style></head>' +
      '<body data-studio-template="' + safeKind + '"><header class="v-header"><div class="v-brand"><img alt="" src="/themes/violet/demo/assets/generated/theme-mark.svg">Violet</div><div class="v-nav"><span>Home</span><span>Campaigns</span><span>Stories</span><span>Get involved</span></div></header>' +
      '<main class="v-main"><div class="v-kicker">Violet theme · ' + safeKind + '</div><h1>' + safeTitle + '</h1>' + body +
      '<div class="v-preview">UI scaffold · Not connected to customer data</div></main><footer class="v-footer"><div class="v-foot-row"><span>Violet Initiative</span><span>AgentSam Commerce · local preview</span></div></footer></body></html>';
  }

  function renderPageOptions(query) {
    const needle = String(query || '').trim().toLowerCase();
    const root = byId('te-page-options');
    const source = host ? pages : (pages.length ? pages : fallbackPages);
    const pageFor = key => source.find(p => p.slug === key);
    const canCreateResolve = resolveShowcase && ['products','collections','pages','blogs','posts','metaobject'].includes(pagePickerCategory);
    const match = (text) => !needle || String(text || '').toLowerCase().includes(needle);
    const row = (title, iconText, attrs, detail, arrow) =>
      '<button type="button" class="te-page-option' + (detail === 'UI scaffold' ? ' is-scaffold' : '') + '" ' + attrs + '><span class="te-picker-icon" aria-hidden="true">' + pickerIcon(iconText) + '</span>' +
      '<span class="te-picker-copy"><strong>' + cmsEscapeHtml(title) + '</strong>' +
      (detail ? '<small>' + cmsEscapeHtml(detail) + '</small>' : '') + '</span>' +
      (arrow ? '<span class="te-picker-chevron" aria-hidden="true">›</span>' : '') + '</button>';
    let html = '';
    const parent = storefrontMenu.find(group => group.id === pagePickerCategory);
    if (parent && !needle) {
      html = '<button type="button" class="te-page-option te-picker-back" data-picker-back="true"><span class="te-picker-icon" aria-hidden="true">‹</span><span class="te-picker-copy"><strong>Back to online store</strong></span></button>';
      html += '<div class="te-picker-heading">' + cmsEscapeHtml(parent.title) + '</div>';
      const children = [...(parent.children || [])];
      if (parent.resource === 'pages') {
        const pageOptions = resolveShowcase
          ? source.filter(p => p.slug === 'resolve-page')
          : journalShowcase
            ? source.filter(p => p.slug.startsWith('journal-') && p.slug !== 'journal-home')
            : violetShowcase
              ? source.filter(p => p.slug.startsWith('violet-'))
              : source.filter(p => p.slug !== 'site' && !/^(resolve-|journal-|violet-)/.test(p.slug));
        children.push(...pageOptions.map(p => ({ title: p.title || humanize(p.slug), page: p.slug })));
        if(resolveShowcase && !children.some(child => child.page === 'resolve-page')) {
          children.push({title:'Default content page',page:'resolve-page'});
        }
      }
      if(resolveShowcase)children.push(...(window.AgentSamResolveStudio?.getDrafts?.()||[])
        .filter(p=>p.kind===parent.id).map(p=>({title:p.title+' · Draft',page:p.slug})));
      if (host && ['products', 'collections', 'blogs', 'posts'].includes(parent.id)) {
        const kind = { products: 'product', collections: 'collection', blogs: 'blog', posts: 'article' }[parent.id];
        children.push(...source.filter(page => page.slug && (
          page.page_type === kind || page.template_key === kind ||
          page.slug === kind || page.slug.endsWith('-' + kind)
        ) && !children.some(child => child.page === page.slug))
          .map(page => ({ title: page.title || humanize(page.slug), page: page.slug })));
      }
      if (parent.resource === 'products' || parent.resource === 'collections') {
        children.push(...(catalogResources[parent.resource] || []).slice(0, 25).map(p => ({
          title: p.title || p.name || p.slug || 'Untitled',
          resource: parent.resource, id: p.id,
        })));
      }
      if(!resolveShowcase)children.push({ title: parent.resource === 'pages' ? 'Start from page template' : 'Start from ' + parent.title.toLowerCase().replace(/s$/, '') + ' template',
        template: ({posts:'article',blogs:'blog',products:'product',collections:'collection',pages:'page'})[parent.id] || 'metaobject' });
      html += children.map(child => row(child.title, 'page',
        child.preset ? 'data-picker-preset="' + cmsEscapeAttr(child.preset) + '" data-preset-page="' + cmsEscapeAttr(child.page) + '"' :
        child.page ? 'data-picker-page="' + cmsEscapeAttr(child.page) + '"' :
        child.resource && child.id ? 'data-picker-resource="' + cmsEscapeAttr(child.resource) + '" data-resource-id="' + cmsEscapeAttr(child.id) + '"' :
        'data-picker-template="' + cmsEscapeAttr(child.template || 'metaobject') + '"', child.page ? 'Theme' : child.origin==='stock' ? 'Stock · editable starter' : 'Create template', false)).join('');
      if(canCreateResolve){
        const instructions={
          products:['Build your first product template','Start with the existing Resolve product layout and style its sections. Product inventory comes later.'],
          collections:['Design a new collection','Create a reusable collection landing page. Associate inventory when the store is connected.'],
          pages:['Create a content page','A reusable page layout for About, FAQ, policies and information.'],
          blogs:['Create a blog layout','Organize stories in an editorial archive. No publishing yet.'],
          posts:['Create an article template','Prepare a long-form story layout with media and rich content.'],
          metaobject:['Create a structured template','Define a reusable template before connecting its data fields.']
        };
        const [title,subtitle]=instructions[parent.id];
        html+='<div class="te-creation-empty" role="region" aria-label="Create '+cmsEscapeAttr(parent.title)+'">'+
          '<div class="te-creation-symbol">＋</div><strong>'+cmsEscapeHtml(title)+'</strong>'+
          '<p>'+cmsEscapeHtml(subtitle)+'</p>'+
          '<button type="button" class="te-creation-primary" data-picker-create="'+cmsEscapeAttr(parent.id)+'">Create local draft +</button>'+
          '<small>Preview only · No D1 records or live storefront changes</small></div>';
      }
    } else {
      html = storefrontMenu.filter(group => match(group.title) || (needle && group.children?.some(ch => match(ch.title)))).map(group => {
        const hasChildren = !!(group.children || group.resource || (resolveShowcase && group.id==='metaobject'));
        const page = group.page ? pageFor(group.page) : null;
        const divider = !needle && ['cart', 'pages', 'search'].includes(group.id)
          ? '<div class="te-picker-divider" role="separator"></div>' : '';
        return divider + row(group.title, group.icon,
          hasChildren ? 'data-picker-category="' + cmsEscapeAttr(group.id) + '"' :
            page ? 'data-picker-page="' + cmsEscapeAttr(page.slug) + '"' :
            'data-picker-template="' + cmsEscapeAttr(group.template || group.id) + '"',
          (!hasChildren && !page) ? 'Stock · editable starter' : '', hasChildren);
      }).join('');
    }
    // Actual installed pages appear first. Stock templates remain available
    // below them, rather than replacing the merchant's editable site.
    if (host && !needle && !pagePickerCategory && source.length) {
      const sitePages = source.slice(0, 40);
      html = '<div class="te-picker-heading">Site pages ('+source.length+')</div>'+
        sitePages.map(p=>row(p.title||humanize(p.slug),'page',
          'data-picker-page="'+cmsEscapeAttr(p.slug)+'"',
          p.route||p.live_route||'CMS draft',false)).join('')+
        (source.length>sitePages.length
          ? '<div class="te-picker-heading">Search to find more site pages</div>' : '')+
        '<div class="te-picker-divider" role="separator"></div>'+html;
    }
    // One search across actual authorized CMS pages, not only menu headings.
    // Preserve category browsing and do not invent templates or draft pages.
    if (needle && !parent) {
      const realPages=source.filter(p=>p.slug && p.slug!=='site' &&
        (resolveShowcase ? !/^(journal-|violet-)/.test(p.slug) :
         journalShowcase ? p.slug.startsWith('journal-') :
         violetShowcase ? (p.slug==='home' || p.slug.startsWith('violet-')) :
         !/^(resolve-|journal-|violet-)/.test(p.slug)) &&
        match([p.title,p.slug,p.route,p.live_route].join(' '))).slice(0,30);
      if(realPages.length)html=
        '<div class="te-picker-heading">Matching CMS pages ('+realPages.length+')</div>'+
        realPages.map(p=>row(p.title||humanize(p.slug),'page',
          'data-picker-page="'+cmsEscapeAttr(p.slug)+'"',p.live_route||p.route||'',false)).join('')+
        (html?'<div class="te-picker-divider" role="separatout.value || 'Untitled template';
        byId('te-tree-title').textContent = input.value || 'Untitled template';
      }
      refreshPreview();
    }));
    panel.querySelectorAll('[data-scaffold-field]').forEach(input => input.addEventListener('input', () => {
      if (!showcaseTemplate) return;
      showcaseTemplate.fields[Number(input.dataset.scaffoldField)] = input.value;
  urce.find(p => p.slug === key);
    const canCreateResolve = resolveShowcase && ['products','collections','pages','blogs','posts','metaobject'].includes(pagePickerCategory);
    const match = (text) => !needle || String(text || '').toLowerCase().includes(needle);
    const row = (title, iconText, attrs, detail, arrow) =>
      '<button type="button" class="te-page-option' + (detail === 'UI scaffold' ? ' is-scaffold' : '') + '" ' + attrs + '><span class="te-picker-icon" aria-hidden="true">' + pickerIcon(iconText) + '</span>' +
      '<span class="te-picker-copy"><strong>' + cmsEscapeHtml(title) + '</strong>' +
      (detail ? '<small>' + cmsEscapeHtml(detail) + '</small>' : '') + '</span>' +
      (arrow ? '<span class="te-picker-chevron" aria-hidden="true">›</span>' : '') + '</button>';
    let html = '';
    const parent = storefrontMenu.find(group => group.id === pagePickerCategory);
    if (parent && !needle) {
      html = '<button type="button" class="te-page-option te-picker-back" data-picker-back="true"><span class="te-picker-icon" aria-hidden="true">‹</span><span class="te-picker-copy"><strong>Back to online store</strong></span></button>';
      html += '<div class="te-picker-heading">' + cmsEscapeHtml(parent.title) + '</div>';
      const children = [...(parent.children || [])];
      if (parent.resource === 'pages') {
        const pageOptions = resolveShowcase
          ? source.filter(p => p.slug === 'resolve-page')
          : journalShowcase
            ? source.filter(p => p.slug.startsWith('journal-') && p.slug !== 'journal-home')
            : violetShowcase
              ? source.filter(p => p.slug.startsWith('violet-'))
              : source.filter(p => p.slug !== 'site' && !/^(resolve-|journal-|violet-)/.test(p.slug));
        children.push(...pageOptions.map(p => ({ title: p.title || humanize(p.slug), page: p.slug })));
        if(resolveShowcase && !children.some(child => child.page === 'resolve-page')) {
          children.push({title:'Default content page',page:'resolve-page'});
        }
      }
      if(resolveShowcase)children.push(...(window.AgentSamResolveStudio?.getDrafts?.()||[])
        .filter(p=>p.kind===parent.id).map(p=>({title:p.title+' · Draft',page:p.slug})));
      if (host && ['products', 'collections', 'blogs', 'posts'].includes(parent.id)) {
        const kind = { products: 'product', collections: 'collection', blogs: 'blog', posts: 'article' }[parent.id];
        children.push(...source.filter(page => page.slug && (
          page.page_type === kind || page.template_key === kind ||
          page.slug === kind || page.slug.endsWith('-' + kind)
        ) && !children.some(child => child.page === page.slug))
          .map(page => ({ title: page.title || humanize(page.slug), page: page.slug })));
      }
      if (parent.resource === 'products' || parent.resource === 'collections') {
        children.push(...(catalogResources[parent.resource] || []).slice(0, 25).map(p => ({
          title: p.title || p.name || p.slug || 'Untitled',
          resource: parent.resource, id: p.id,
        })));
      }
      if(!resolveShowcase)children.push({ title: parent.resource === 'pages' ? 'Start from page template' : 'Start from ' + parent.title.toLowerCase().replace(/s$/, '') + ' template',
        template: ({posts:'article',blogs:'blog',products:'product',collections:'collection',pages:'page'})[parent.id] || 'metaobject' });
      html += children.map(child => row(child.title, 'page',
        child.preset ? 'data-picker-preset="' + cmsEscapeAttr(child.preset) + '" data-preset-page="' + cmsEscapeAttr(child.page) + '"' :
        child.page ? 'data-picker-page="' + cmsEscapeAttr(child.page) + '"' :
        child.resource && child.id ? 'data-picker-resource="' + cmsEscapeAttr(child.resource) + '" data-resource-id="' + cmsEscapeAttr(child.id) + '"' :
        'data-picker-template="' + cmsEscapeAttr(child.template || 'metaobject') + '"', child.page ? 'Theme' : child.origin==='stock' ? 'Stock · editable starter' : 'Create template', false)).join('');
      if(canCreateResolve){
        const instructions={
          products:['Build your first product template','Start with the existing Resolve product layout and style its sections. Product inventory comes later.'],
          collections:['Design a new collection','Create a reusable collection landing page. Associate inventory when the store is connected.'],
          pages:['Create a content page','A reusable page layout for About, FAQ, policies and information.'],
          blogs:['Create a blog layout','Organize stories in an editorial archive. No publishing yet.'],
          posts:['Create an article template','Prepare a long-form story layout with media and rich content.'],
          metaobject:['Create a structured template','Define a reusable template before connecting its data fields.']
        };
        const [title,subtitle]=instructions[parent.id];
        html+='<div class="te-creation-empty" role="region" aria-label="Create '+cmsEscapeAttr(parent.title)+'">'+
          '<div class="te-creation-symbol">＋</div><strong>'+cmsEscapeHtml(title)+'</strong>'+
          '<p>'+cmsEscapeHtml(subtitle)+'</p>'+
          '<button type="button" class="te-creation-primary" data-picker-create="'+cmsEscapeAttr(parent.id)+'">Create local draft +</button>'+
          '<small>Preview only · No D1 records or live storefront changes</small></div>';
      }
    } else {
      html = storefrontMenu.filter(group => match(group.title) || (needle && group.children?.some(ch => match(ch.title)))).map(group => {
        const hasChildren = !!(group.children || group.resource || (resolveShowcase && group.id==='metaobject'));
        const page = group.page ? pageFor(group.page) : null;
        const divider = !needle && ['cart', 'pages', 'search'].includes(group.id)
          ? '<div class="te-picker-divider" role="separator"></div>' : '';
        return divider + row(group.title, group.icon,
          hasChildren ? 'data-picker-category="' + cmsEscapeAttr(group.id) + '"' :
            page ? 'data-picker-page="' + cmsEscapeAttr(page.slug) + '"' :
            'data-picker-template="' + cmsEscapeAttr(group.template || group.id) + '"',
          (!hasChildren && !page) ? 'Stock · editable starter' : '', hasChildren);
      }).join('');
    }
    // Actual installed pages appear first. Stock templates remain available
    // below them, rather than replacing the merchant's editable site.
    if (host && !needle && !pagePickerCategory && source.length) {
      const sitePages = source.slice(0, 40);
      html = '<div class="te-picker-heading">Site pages ('+source.length+')</div>'+
        sitePages.map(p=>row(p.title||humanize(p.slug),'page',
          'data-picker-page="'+cmsEscapeAttr(p.slug)+'"',
          p.route||p.live_route||'CMS draft',false)).join('')+
        (source.length>sitePages.length
          ? '<div class="te-picker-heading">Search to find more site pages</div>' : '')+
        '<div class="te-picker-divider" role="separator"></div>'+html;
    }
    // One search across actual authorized CMS pages, not only menu headings.
    // Preserve category browsing and do not invent templates or draft pages.
    if (needle && !parent) {
      const realPages=source.filter(p=>p.slug && p.slug!=='site' &&
        (resolveShowcase ? !/^(journal-|violet-)/.test(p.slug) :
         journalShowcase ? p.slug.startsWith('journal-') :
         violetShowcase ? (p.slug==='home' || p.slug.startsWith('violet-')) :
         !/^(resolve-|journal-|violet-)/.test(p.slug)) &&
        match([p.title,p.slug,p.route,p.live_route].join(' '))).slice(0,30);
      if(realPages.length)html=
        '<div class="te-picker-heading">Matching CMS pages ('+realPages.length+')</div>'+
        realPages.map(p=>row(p.title||humanize(p.slug),'page',
          'data-picker-page="'+cmsEscapeAttr(p.slug)+'"',p.live_route||p.route||'',false)).join('')+
        (html?'<div class="te-picker-divider" role="separatource.find(p => p.slug === key);
    const canCreateResolve = resolveShowcase && ['products','collections','pages','blogs','posts','metaobject'].includes(pagePickerCategory);
    const match = (text) => !needle || String(text || '').toLowerCase().includes(needle);
    const row = (title, iconText, attrs, detail, arrow) =>
      '<button type="button" class="te-page-option' + (detail === 'UI scaffold' ? ' is-scaffold' : '') + '" ' + attrs + '><span class="te-picker-icon" aria-hidden="true">' + pickerIcon(iconText) + '</span>' +
      '<span class="te-picker-copy"><strong>' + cmsEscapeHtml(title) + '</strong>' +
      (detail ? '<small>' + cmsEscapeHtml(detail) + '</small>' : '') + '</span>' +
      (arrow ? '<span class="te-picker-chevron" aria-hidden="true">›</span>' : '') + '</button>';
    let html = '';
    const parent = storefrontMenu.find(group => group.id === pagePickerCategory);
    if (parent && !needle) {
      html = '<button type="button" class="te-page-option te-picker-back" data-picker-back="true"><span class="te-picker-icon" aria-hidden="true">‹</span><span class="te-picker-copy"><strong>Back to online store</strong></span></button>';
      html += '<div class="te-picker-heading">' + cmsEscapeHtml(parent.title) + '</div>';
      const children = [...(parent.children || [])];
      if (parent.resource === 'pages') {
        const pageOptions = resolveShowcase
          ? source.filter(p => p.slug === 'resolve-page')
          : journalShowcase
            ? source.filter(p => p.slug.startsWith('journal-') && p.slug !== 'journal-home')
            : violetShowcase
              ? source.filter(p => p.slug.startsWith('violet-'))
              : source.filter(p => p.slug !== 'site' && !/^(resolve-|journal-|violet-)/.test(p.slug));
        children.push(...pageOptions.map(p => ({ title: p.title || humanize(p.slug), page: p.slug })));
        if(resolveShowcase && !children.some(child => child.page === 'resolve-page')) {
          children.push({title:'Default content page',page:'resolve-page'});
        }
      }
      if(resolveShowcase)children.push(...(window.AgentSamResolveStudio?.getDrafts?.()||[])
        .filter(p=>p.kind===parent.id).map(p=>({title:p.title+' · Draft',page:p.slug})));
      if (host && ['products', 'collections', 'blogs', 'posts'].includes(parent.id)) {
        const kind = { products: 'product', collections: 'collection', blogs: 'blog', posts: 'article' }[parent.id];
        children.push(...source.filter(page => page.slug && (
          page.page_type === kind || page.template_key === kind ||
          page.slug === kind || page.slug.endsWith('-' + kind)
        ) && !children.some(child => child.page === page.slug))
          .map(page => ({ title: page.title || humanize(page.slug), page: page.slug })));
      }
      if (parent.resource === 'products' || parent.resource === 'collections') {
        children.push(...(catalogResources[parent.resource] || []).slice(0, 25).map(p => ({
          title: p.title || p.name || p.slug || 'Untitled',
          resource: parent.resource, id: p.id,
        })));
      }
      if(!resolveShowcase)children.push({ title: parent.resource === 'pages' ? 'Start from page template' : 'Start from ' + parent.title.toLowerCase().replace(/s$/, '') + ' template',
        template: ({posts:'article',blogs:'blog',products:'product',collections:'collection',pages:'page'})[parent.id] || 'metaobject' });
      html += children.map(child => row(child.title, 'page',
        child.preset ? 'data-picker-preset="' + cmsEscapeAttr(child.preset) + '" data-preset-page="' + cmsEscapeAttr(child.page) + '"' :
        child.page ? 'data-picker-page="' + cmsEscapeAttr(child.page) + '"' :
        child.resource && child.id ? 'data-picker-resource="' + cmsEscapeAttr(child.resource) + '" data-resource-id="' + cmsEscapeAttr(child.id) + '"' :
        'data-picker-template="' + cmsEscapeAttr(child.template || 'metaobject') + '"', child.page ? 'Theme' : child.origin==='stock' ? 'Stock · editable starter' : 'Create template', false)).join('');
      if(canCreateResolve){
        const instructions={
          products:['Build your first product template','Start with the existing Resolve product layout and style its sections. Product inventory comes later.'],
          collections:['Design a new collection','Create a reusable collection landing page. Associate inventory when the store is connected.'],
          pages:['Create a content page','A reusable page layout for About, FAQ, policies and information.'],
          blogs:['Create a blog layout','Organize stories in an editorial archive. No publishing yet.'],
          posts:['Create an article template','Prepare a long-form story layout with media and rich content.'],
          metaobject:['Create a structured template','Define a reusable template before connecting its data fields.']
        };
        const [title,subtitle]=instructions[parent.id];
        html+='<div class="te-creation-empty" role="region" aria-label="Create '+cmsEscapeAttr(parent.title)+'">'+
          '<div class="te-creation-symbol">＋</div><strong>'+cmsEscapeHtml(title)+'</strong>'+
          '<p>'+cmsEscapeHtml(subtitle)+'</p>'+
          '<button type="button" class="te-creation-primary" data-picker-create="'+cmsEscapeAttr(parent.id)+'">Create local draft +</button>'+
          '<small>Preview only · No D1 records or live storefront changes</small></div>';
      }
    } else {
      html = storefrontMenu.filter(group => match(group.title) || (needle && group.children?.some(ch => match(ch.title)))).map(group => {
        const hasChildren = !!(group.children || group.resource || (resolveShowcase && group.id==='metaobject'));
        const page = group.page ? pageFor(group.page) : null;
        const divider = !needle && ['cart', 'pages', 'search'].includes(group.id)
          ? '<div class="te-picker-divider" role="separator"></div>' : '';
        return divider + row(group.title, group.icon,
          hasChildren ? 'data-picker-category="' + cmsEscapeAttr(group.id) + '"' :
            page ? 'data-picker-page="' + cmsEscapeAttr(page.slug) + '"' :
            'data-picker-template="' + cmsEscapeAttr(group.template || group.id) + '"',
          (!hasChildren && !page) ? 'Stock · editable starter' : '', hasChildren);
      }).join('');
    }
    // Actual installed pages appear first. Stock templates remain available
    // below them, rather than replacing the merchant's editable site.
    if (host && !needle && !pagePickerCategory && source.length) {
      const sitePages = source.slice(0, 40);
      html = '<div class="te-picker-heading">Site pages ('+source.length+')</div>'+
        sitePages.map(p=>row(p.title||humanize(p.slug),'page',
          'data-picker-page="'+cmsEscapeAttr(p.slug)+'"',
          p.route||p.live_route||'CMS draft',false)).join('')+
        (source.length>sitePages.length
          ? '<div class="te-picker-heading">Search to find more site pages</div>' : '')+
        '<div class="te-picker-divider" role="separator"></div>'+html;
    }
    // One search across actual authorized CMS pages, not only menu headings.
    // Preserve category browsing and do not invent templates or draft pages.
    if (needle && !parent) {
      const realPages=source.filter(p=>p.slug && p.slug!=='site' &&
        (resolveShowcase ? !/^(journal-|violet-)/.test(p.slug) :
         journalShowcase ? p.slug.startsWith('journal-') :
         violetShowcase ? (p.slug==='home' || p.slug.startsWith('violet-')) :
         !/^(resolve-|journal-|violet-)/.test(p.slug)) &&
        match([p.title,p.slug,p.route,p.live_route].join(' '))).slice(0,30);
      if(realPages.length)html=
        '<div class="te-picker-heading">Matching CMS pages ('+realPages.length+')</div>'+
        realPages.map(p=>row(p.title||humanize(p.slug),'page',
          'data-picker-page="'+cmsEscapeAttr(p.slug)+'"',p.live_route||p.route||'',false)).join('')+
        (html?'<div class="te-picker-divider" role="separatolement;
    modal.innerHTML =
      '<div class="te-section-menu__head"><div><strong>Add a block</strong>' +
        '<small>' + cmsEscapeHtml(schema.label || humanize(sectionKey)) + ' · compatible blocks</small></div>' +
        '<button type="button" class="te-tree-mini" data-close-block-catalog aria-label="Close block catalog">×</button></div>' +
      '<div class="te-catalog-toolbar">' +
        '<input class="te-section-search" type="search" data-block-search placeholder="Search blocks" aria-label="Search blocks" aria-describedby="te-block-catalog-help" autocomplete="off">' +
        '<span class="te-catalog-help" id="te-block-catalog-help">Arrow keys to browse · Enter to select · Escape to close</span>' +
        '<div class="te-catalog-tabs" role="tablist" aria-label="Block source">' +
          '<button type="button" class="is-active" data-block-tab="blocks" role="tab" aria-selected="true">Blocks</button>' +
          '<button type="button" data-block-tab="apps" role="tab" aria-selected="false">Apps</button>' +
        '</div>' +
      '</div>' +
      '<div class="te-catalog-layout">' +
        '<div class="te-catalog-list" data-block-list role="listbox" aria-label="Compatible blocks" tabindex="-1"></div>' +
        '<section class="te-catalog-preview" data-block-preview aria-live="polite"></section>' +
      '</div>';
    const list = modal.querySelector('[data-block-list]');
    const preview = modal.querySelector('[data-block-preview]');
    const search = modal.querySelector('[data-block-search]');
    let activeTab = 'blocks';
    let activeKey = templates[0]?.key || '';

    function catalogInfo(template) {
      const row = (window.cmsRegistry?.catalog || []).find(function(item) {
        return item.itemType === 'block' && item.definitionKey && item.definitionKey === template.definitionKey;
      });
      return {
        ...template,
        label: row?.label || template.label || humanize(template.key),
        category: row?.category || template.category || 'Basic',
        description: row?.description || template.description || ((template.fields || []).length + ' editable settings'),
        catalog: row || null,
      };
    }

    function blockVisual(template) {
      const api = window.ThemePortableSections;
      const preset = section.content?.__editor?.themePreset;
      if (!api || section.content?.__editor?.templateKey !== 'portable' || !preset ||
          typeof api.render !== 'function') {
        return '<div class="te-catalog-preview-unavailable"><strong>Preview not available</strong>' +
          '<p>This section renderer has not exposed a faithful block preview yet. The block can still be added using its registered settings.</p></div>';
      }
      const content = structuredClone(section.content || {});
      const previewId = 'catalog-preview-block';
      content[previewId] = structuredClone(template.defaultContent || {});
      content.__editor = {
        ...(content.__editor || {}),
        templateKey: 'portable',
        themePreset: preset,
        blocks: [{ id: previewId, templateKey: template.key, enabled: true }],
      };
      const markup = api.render({ key: 'catalog-preview', content });
      if (!markup) {
        return '<div class="te-catalog-preview-unavailable"><strong>Preview not available</strong>' +
          '<p>This component has no registered preview renderer.</p></div>';
      }
      const html = '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<link rel="stylesheet" href="/js/portable-sections.css">' +
        '<style>html,body{margin:0;min-height:100%;background:#fff}body{pointer-events:none}</style>' +
        '</head><body>' + markup + '</body></html>';
      return '<iframe class="te-catalog-visual" title="Preview of ' +
        cmsEscapeAttr(template.label || template.key) + '" sandbox="" loading="lazy" tabindex="-1" ' +
        'srcdoc="' + cmsEscapeAttr(html) + '"></iframe>';
    }

    function renderPreview(template) {
      if (!template) {
        preview.innerHTML = '<div class="te-catalog-preview-unavailable"><strong>No compatible blocks</strong>' +
          '<p>This section does not currently expose any installable child blocks.</p></div>';
        return;
      }
      const item = catalogInfo(template);
      const used = existingBlocks.filter(function(block) { return block.templateKey === template.key; }).length;
      const totalMax = Number(schema.guardrails?.maxBlocks || 0);
      const perTypeMax = Number(template.max);
      const disabled = (Number.isFinite(perTypeMax) && perTypeMax >= 0 && used >= perTypeMax) ||
        (totalMax > 0 && existingBlocks.length >= totalMax);
      preview.innerHTML =
        '<div class="te-catalog-preview-stage">' + blockVisual(template) + '</div>' +
        '<div class="te-catalog-preview-meta"><div><strong>' + cmsEscapeHtml(item.label) + '</strong>' +
          '<small>' + cmsEscapeHtml(item.description) + '</small></div>' +
          '<button type="button" class="te-catalog-add" data-add-selected-block' + (disabled ? ' disabled' : '') + '>' +
            (disabled ? 'Maximum reached' : 'Add block') + '</button></div>';
      preview.querySelector('[data-add-selected-block]')?.addEventListener('click', function() {
        if (disabled) return;
        const key = template.key;
        modal.close();
        void insertBlock(sectionKey, key, owner);
      });
    }

    function paint() {
      const needle = String(search.value || '').trim().toLowerCase();
      if (activeTab === 'apps') {
        const apps = (window.ThemeEmbedReview?.getCatalogEntries?.() || []).filter(function(app) {
          return !needle || [app.name, app.category, app.tagline].join(' ').toLowerCase().includes(needle);
        });
        list.innerHTML = apps.length
          ? '<div class="te-catalog-list-group"><div class="te-catalog-list-group__label">Storefront apps</div>' +
            apps.map(function(app) {
              return '<button type="button" role="option" aria-selected="' + (activeKey === app.key) + '" class="te-catalog-list-item' +
                (activeKey === app.key ? ' is-selected' : '') + '" data-choose-app="' + cmsEscapeAttr(app.key) + '">' +
                '<span class="te-catalog-list-item__icon">⊞</span><span><strong>' + cmsEscapeHtml(app.name) +
                '</strong><small>' + cmsEscapeHtml(app.category || 'App extension') + '</small></span></button>';
            }).join('') + '</div>'
          : '<div class="te-empty">No compatible app extensions are available.</div>';
        preview.innerHTML = '<div class="te-catalog-preview-unavailable"><strong>App extensions</strong>' +
          '<p>App extensions are currently installed as page-owned storefront sections, not nested child blocks. ' +
          'Use the app embed manager to configure and install one.</p>' +
          '<button type="button" class="te-catalog-add" data-open-app-embeds>Open App Embeds</button></div>';
        preview.querySelector('[data-open-app-embeds]')?.addEventListener('click', function() {
          modal.close();
          document.querySelector('[data-drawer-mode="app-embeds"]')?.click();
        });
        list.querySelectorAll('[data-choose-app]').forEach(function(button) {
          button.addEventListener('click', function() {
            activeKey = button.dataset.chooseApp;
            const app = apps.find(function(item) { return item.key === activeKey; });
            if (app) preview.querySelector('strong').textContent = app.name;
          });
        });
        return;
      }

      const matching = templates.map(catalogInfo).filter(function(item) {
        return !needle || [item.label, item.key, item.category, item.description, item.definitionKey].join(' ').toLowerCase().includes(needle);
      });
      if (!matching.some(item => item.key === activeKey)) activeKey = matching[0]?.key || '';
      const groups = new Ma'<div class="te-empty">No matching storefront templates.</div>');
    root.querySelector('[data-picker-clear]')?.addEventListener('click',()=>{
      pagePickerCategory=null;byId('te-page-search').value='';renderPageOptions('');
    });
    root.querySelectorAll('[data-picker-category]').forEach(button =>
      button.addEventListener('click', () => { pagePickerCategory = button.dataset.pickerCategory; byId('te-page-search').value = ''; renderPageOptions(''); }));
    root.querySelector('[data-picker-back]')?.addEventListener('click', () => { pagePickerCategory = null; renderPageOptions(''); });
    root.querySelectorAll('[data-picker-preset]').forEach(button => button.addEventListener('click', () => {
      const preset=button.dataset.pickerPreset;
      const page=button.dataset.presetPage;
      if(!['resolve','plain-jane','violet'].includes(preset)||!page)return;
      window.cmsAdminNavigate('/admin/theme-editor?'+new URLSearchParams({showcase:preset,slug:page}).toString());
    }));
    root.querySelectorAll('[data-picker-page]').forEach(button => button.addEventListener('click', () => {
      switchPage(button.dataset.pickerPage);
    }));
    root.querySelectorAll('[data-picker-create]').forEach(button=>button.addEventListener('click',()=>openResolveCreation(button.dataset.pickerCreate)));
    root.querySelectorAll('[data-picker-template]').forEach(button => button.addEventListener('click', () => {
      if(resolveShowcase){
        const type=button.dataset.pickerTemplate;
        openResolveCreation(type==='metaobject'?'metaobject':type==='product'?'products':type==='collection'?'collections':
          type==='blog'?'blogs':type==='article'?'posts':'pages');
      }else showScaffoldTemplate(button.dataset.pickerTemplate, button.querySelector('strong').textContent);
    }));
    root.querySelectorAll('[data-picker-resource]').forEach(button => button.addEventListener('click', () => {
      const params=new URLSearchParams(window.location.search);
      const scope=params.get('site_id')?'&site_id='+encodeURIComponent(params.get('site_id')):'';
      const url = button.dataset.pickerResource === 'products'
        ? '/admin/product-edit?id=' + encodeURIComponent(button.dataset.resourceId)+scope
        : '/admin/products?view=collections&collection_id='+encodeURIComponent(button.dataset.resourceId)+scope;
      if (localShowcase) showScaffoldTemplate(button.dataset.pickerResource, button.querySelector('strong').textContent);
      else window.location.href = url;
    }));
  }

  function openResolveCreation(kind){
    const root=byId('te-page-options');
    if(!root)return;
    const labels={products:'Product template',collections:'Collection template',pages:'Content page',blogs:'Blog',posts:'Article',metaobject:'Metaobject'};
    if(!labels[kind])return;
    root.innerHTML='<div class="te-creation-workflow">'+
      '<button class="te-creation-back" type="button" data-creation-back>‹ Back to '+cmsEscapeHtml(labels[kind])+'s</button>'+
      '<div class="te-creation-symbol">＋</div><h3>New '+cmsEscapeHtml(labels[kind])+'</h3>'+
      '<p>Start with Resolve’s authentic sections. Edit content and layout in the same CMS studio.</p>'+
      '<form data-resolve-create-form><label>Template name<input name="title" maxlength="90" required autofocus placeholder="e.g. Autumn archive"></label>'+
      '<div class="te-creation-hint">Creates a reusable local draft. Product records, URLs, and production publishing are not connected.</div>'+
      '<button class="te-creation-primary" type="submit">Create & edit draft →</button></form></div>';
    root.querySelector('[data-creation-back]')?.addEventListener('click',()=>{pagePickerCategory=kind;renderPageOptions('');});
    root.querySelector('[data-resolve-create-form]')?.addEventListener('submit',event=>{
      event.preventDefault();
      const title=new FormData(event.currentTarget).get('title')?.toString().trim();
      try{
        const draft=window.AgentSamResolveStudio?.createDraft(kind,title);
        if(!draft)throw Error('Resolve draft creation is unavailable.');
        switchPage(draft.slug);
      }catch(error){setNote(error.message||String(error),'error');}
    });
    root.querySelector('[name="title"]')?.focus();
  }

  function blockSchemaFor(section, meta) {
    const schema = schemaForSection(section);
    if (!schema || !meta || !Array.isArray(schema.blocks)) return null;
    return schema.blocks.find(function(block) { return block.key === meta.templateKey; }) || null;
  }

  function discoverUnmanagedSections() {
    if (selectedTheme !== 'heuristic') return;
    let doc;
    try { doc = byId('theme-preview').contentDocument; } catch { return; }
    if (!doc || doc.documentElement?.getAttribute('data-cms-page') !== slug) return;
    const managed = new Set((pageData?.sections || []).map(function(section) { return section.key; }));
    unmanagedLiveSections = Array.from(doc.querySelectorAll('main > section'))
      .filter(function(node) { return !managed.has(node.dataset.cmsSection); })
      .map(function(node, index) {
        return {
          id: node.id || node.dataset.hSectionId || '',
          sectionId: node.dataset.hSectionId || '',
          label: node.dataset.hSection || node.getAttribute('aria-label') || node.classList[0] || 'Section ' + (index + 1)
        };
      });
    renderTree();
  }

  /** One keyboard model for the docked section catalog and modal block catalog.
   * Keep placement/editing in the existing CMS methods; this only manages focus.
   */
  function wireCatalogKeyboard(dialog, list, search, optionSelector, tabSelector, onClose) {
    dialog.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      const tab = event.target.closest?.(tabSelector);
      if (tab && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
        const tabs = Array.from(dialog.querySelectorAll(tabSelector));
        const index = tabs.indexOf(tab);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        event.preventDefault();
        tabs[next]?.focus();
        tabs[next]?.click();
        return;
      }
      if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)
          || (event.target !== search && !list.contains(event.target))) return;
      const choices = Array.from(list.querySelectorAll(optionSelector))
        .filter(button => !button.disabled);
      if (!choices.length) return;
      const index = choices.indexOf(document.activeElement);
      const nextIndex = event.key === 'Home' ? 0
        : event.key === 'End' ? choices.length - 1
        : index < 0 ? (event.key === 'ArrowUp' ? choices.length - 1 : Math.max(0, choices.findIndex(button => button.getAttribute('aria-selected') === 'true')))
        : (index + (event.key === 'ArrowUp' ? -1 : 1) + choices.length) % choices.length;
      const choice = choices[nextIndex];
      event.preventDefault();
      choice.click(); // selection updates the real preview; never inserts here
      const selected = Array.from(list.querySelectorAll(optionSelector)).find(button => button.getAttribute('aria-selected') === 'true');
      (selected || list.querySelector(optionSelector))?.focus();
    });
  }

  function openBlockCatalog(sectionKey, owner = slug) {
    const section = findSection(sectionKey, owner);
    const schema = section && schemaForSection(section);
    const templates = Array.isArray(schema?.blocks) ? schema.blocks : [];
    if (!templates.length) return;
    const existingBlocks = section.content?.__editor?.blocks || [];
    const modal = document.createElement('dialog');
    modal.className = 'te-section-menu te-block-picker';
    modal.setAttribute('aria-label', 'Add block');
    const returnFocus = document.activeElement;
    modal.innerHTML =
      '<div class="te-section-menu__head"><div><strong>Add a block</strong>' +
        '<small>' + cmsEscapeHtml(schema.label || humanize(sectionKey)) + ' · compatible blocks</small></div>' +
        '<button type="button" class="te-tree-mini" data-close-block-catalog aria-label="Close block catalog">×</button></div>' +
      '<div class="te-catalog-toolbar">' +
        '<input class="te-section-search" type="search" data-block-search placeholder="Search blocks" aria-label="Search blocks" aria-describedby="te-block-catalog-help" autocomplete="off">' +
        '<span class="te-catalog-help" id="te-block-catalog-help">Arrow keys to browse · Enter to select · Escape to close</span>' +
        '<div class="te-catalog-tabs" role="tablist" aria-label="Block source">' +
          '<button type="button" class="is-active" data-block-tab="blocks" role="tab" aria-selected="true">Blocks</button>' +
          '<button type="button" data-block-tab="apps" role="tab" aria-selected="false">Apps</button>' +
        '</div>' +
      '</div>' +
      '<div class="te-catalog-layout">' +
        '<div class="te-catalog-list" data-block-list role="listbox" aria-label="Compatible blocks" tabindex="-1"></div>' +
        '<section class="te-catalog-preview" data-block-preview aria-live="polite"></section>' +
      '</div>';
    const list = modal.querySelector('[data-block-list]');
    const preview = modal.querySelector('[data-block-preview]');
    const search = modal.querySelector('[data-block-search]');
    let activeTab = 'blocks';
    let activeKey = templates[0]?.key || '';

    function catalogInfo(template) {
      const row = (window.cmsRegistry?.catalog || []).find(function(item) {
        return item.itemType === 'block' && item.definitionKey && item.definitionKey === template.definitionKey;
      });
      return {
        ...template,
        label: row?.label || template.label || humanize(template.key),
        category: row?.category || template.category || 'Basic',
        description: row?.description || template.description || ((template.fields || []).length + ' editable settings'),
        catalog: row || null,
      };
    }

    function blockVisual(template) {
      const api = window.ThemePortableSections;
      const preset = section.content?.__editor?.themePreset;
      if (!api || section.content?.__editor?.templateKey !== 'portable' || !preset ||
          typeof api.render !== 'function') {
        return '<div class="te-catalog-preview-unavailable"><strong>Preview not available</strong>' +
          '<p>This section renderer has not exposed a faithful block preview yet. The block can still be added using its registered settings.</p></div>';
      }
      const content = structuredClone(section.content || {});
      const previewId = 'catalog-preview-block';
      content[previewId] = structuredClone(template.defaultContent || {});
      content.__editor = {
        ...(content.__editor || {}),
        templateKey: 'portable',
        themePreset: preset,
        blocks: [{ id: previewId, templateKey: template.key, enabled: true }],
      };
      const markup = api.render({ key: 'catalog-preview', content });
      if (!markup) {
        return '<div class="te-catalog-preview-unavailable"><strong>Preview not available</strong>' +
          '<p>This component has no registered preview renderer.</p></div>';
      }
      const html = '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<link rel="stylesheet" href="/js/portable-sections.css">' +
        '<style>html,body{margin:0;min-height:100%;background:#fff}body{pointer-events:none}</style>' +
        '</head><body>' + markup + '</body></html>';
      return '<iframe class="te-catalog-visual" title="Preview of ' +
        cmsEscapeAttr(template.label || template.key) + '" sandbox="" loading="lazy" tabindex="-1" ' +
        'srcdoc="' + cmsEscapeAttr(html) + '"></iframe>';
    }

    function renderPreview(template) {
      if (!template) {
        preview.innerHTML = '<div class="te-catalog-preview-unavailable"><strong>No compatible blocks</strong>' +
          '<p>This section does not currently expose any installable child blocks.</p></div>';
        return;
      }
      const item = catalogInfo(template);
      const used = existingBlocks.filter(function(block) { return block.templateKey === template.key; }).length;
      const totalMax = Number(schema.guardrails?.maxBlocks || 0);
      const perTypeMax = Number(template.max);
      const disabled = (Number.isFinite(perTypeMax) && perTypeMax >= 0 && used >= perTypeMax) ||
        (totalMax > 0 && existingBlocks.length >= totalMax);
      preview.innerHTML =
        '<div class="te-catalog-preview-stage">' + blockVisual(template) + '</div>' +
        '<div class="te-catalog-preview-meta"><div><strong>' + cmsEscapeHtml(item.label) + '</strong>' +
          '<small>' + cmsEscapeHtml(item.description) + '</small></div>' +
          '<button type="button" class="te-catalog-add" data-add-selected-block' + (disabled ? ' disabled' : '') + '>' +
            (disabled ? 'Maximum reached' : 'Add block') + '</button></div>';
      preview.querySelector('[data-add-selected-block]')?.addEventListener('click', function() {
        if (disabled) return;
        const key = template.key;
        modal.close();
        void insertBlock(sectionKey, key, owner);
      });
    }

    function paint() {
      const needle = String(search.value || '').trim().toLowerCase();
      if (activeTab === 'apps') {
        const apps = (window.ThemeEmbedReview?.getCatalogEntries?.() || []).filter(function(app) {
          return !needle || [app.name, app.category, app.tagline].join(' ').toLowerCase().includes(needle);
        });
        list.innerHTML = apps.length
          ? '<div class="te-catalog-list-group"><div class="te-catalog-list-group__label">Storefront apps</div>' +
            apps.map(function(app) {
              return '<button type="button" role="option" aria-selected="' + (activeKey === app.key) + '" class="te-catalog-list-item' +
                (activeKey === app.key ? ' is-selected' : '') + '" data-choose-app="' + cmsEscapeAttr(app.key) + '">' +
                '<span class="te-catalog-list-item__icon">⊞</span><span><strong>' + cmsEscapeHtml(app.name) +
                '</strong><small>' + cmsEscapeHtml(app.category || 'App extension') + '</small></span></button>';
            }).join('') + '</div>'
          : '<div class="te-empty">No compatible app extensions are available.</div>';
        preview.innerHTML = '<div class="te-catalog-preview-unavailable"><strong>App extensions</strong>' +
          '<p>App extensions are currently installed as page-owned storefront sections, not nested child blocks. ' +
          'Use the app embed manager to configure and install one.</p>' +
          '<button type="button" class="te-catalog-add" data-open-app-embeds>Open App Embeds</button></div>';
        preview.querySelector('[data-open-app-embeds]')?.addEventListener('click', function() {
          modal.close();
          document.querySelector('[data-drawer-mode="app-embeds"]')?.click();
        });
        list.querySelectorAll('[data-choose-app]').forEach(function(button) {
          button.addEventListener('click', function() {
            activeKey = button.dataset.chooseApp;
            const app = apps.find(function(item) { return item.key === activeKey; });
            if (app) preview.querySelector('strong').textContent = app.name;
          });
        });
        return;
      }

      const matching = templates.map(catalogInfo).filter(function(item) {
        return !needle || [item.label, item.key, item.category, item.description, item.definitionKey].join(' ').toLowerCase().includes(needle);
      });
      if (!matching.some(item => item.key === activeKey)) activeKey = matching[0]?.key || '';
      const groups = new Map();
      for (const item of matching) {
        const category = item.category || 'Basic';
        if (!groups.has(category)) groups.set(category, []);
        groups.get(category).push(item);
      }
      list.innerHTML = matching.length ? Array.from(groups.entries()).map(function([category, items]) {
        return '<div class="te-catalog-list-group"><div class="te-catalog-listree-group"><div class="te-tree-group__label">Template</div>' + pageRows +
        '<button type="button" class="te-add-section" id="te-add-section" title="Add a section to this page"><span aria-hidden="true">⊕</span> Add section</button></div>' +
      (unmanagedLiveSections.length ? '<div class="te-tree-group te-live-only"><div class="te-tree-group__label">Live-only sections · not editable yet</div>' +
        unmanagedLiveSections.map(function(region, index) {
          return '<button type="button" class="te-live-only-row" data-scroll-live="' + index + '"><span>' + icon.section + '</span><span><strong>' + cmsEscapeHtml(humanize(region.label.replaceAll('.', ' '))) + '</strong><small>Existing storefront · adapter needed</small></span></button>';
        }).join('') + '</div>' : '') +
      '<dialog class="te-section-menu" id="te-section-menu" aria-label="Add a section" aria-describedby="te-section-catalog-help" hidden>' +
        '<div class="te-section-menu__head"><div><strong>Add a section</strong><small>Choose a reusable storefront component</small></div><button type="button" class="te-tree-mini" id="te-section-cancel" aria-label="Close section catalog">×</button></div>' +
        '<div class="te-catalog-toolbar">' +
          '<input class="te-section-search" type="search" id="te-section-search" placeholder="Search sections" aria-label="Search available sections" autocomplete="off">' +
          '<span class="te-catalog-help" id="te-section-catalog-help">Arrow keys to browse · Enter to select · Escape to close</span>' +
          '<div class="te-catalog-tabs" role="tablist" aria-label="Section source">' +
            '<button type="button" class="is-active" data-section-tab="sections" role="tab" aria-selected="true">Sections</button>' +
            '<button type="button" data-section-tab="apps" role="tab" aria-selected="false">Apps</button>' +
          '</div>' +
        '</div>' +
        '<div class="te-catalog-layout">' +
          '<div class="te-catalog-list" id="te-section-list" role="listbox" aria-label="Available sections" tabindex="-1"></div>' +
          '<section class="te-catalog-preview" id="te-section-preview" aria-live="polite"></section>' +
        '</div>' +
      '</dialog>' +
      '<div class="te-tree-group te-tree-group--global"><div class="te-tree-group__label">Footer</div>' + footerRow + '</div>';

    // Draw portable catalog previews using the SAME registered renderer and
    // CSS as the storefront. Never fabricate a card for a missing renderer.
    function catalogVisual(entry) {
      // Installed theme sources carry a faithful isolated preview generated
      // by the same renderer as the page, with the originating theme styles.
      if (entry.previewHtml) return '<iframe class="te-catalog-visual" title="Preview of ' +
        cmsEscapeAttr(entry.label || entry.id) + '" sandbox="" loading="lazy" tabindex="-1" srcdoc="' +
        cmsEscapeAttr(entry.previewHtml) + '"></iframe>';
      const api = window.ThemePortableSections;
      const preset = entry.preset || entry.id;
      if (api && typeof api.defaults === 'function' && typeof api.render === 'function') {
        const content = api.defaults(preset);
        if (content) {
          const markup = api.render({ key: 'catalog-preview', content });
          if (markup) {
            const html = '<!doctype html><html><head><meta charset="utf-8">' +
              '<meta name="viewport" content="width=device-width,initial-scale=1">' +
              '<link rel="stylesheet" href="/js/portable-sections.css">' +
              '<style>html,body{margin:0;background:#fff}body{pointer-events:none}</style>' +
              '</head><body>' + markup + '</body></html>';
            return '<iframe class="te-catalog-visual" title="Preview of ' +
              cmsEscapeAttr(entry.label) + '" sandbox="" loading="lazy" tabindex="-1" ' +
              'srcdoc="' + cmsEscapeAttr(html) + '"></iframe>';
          }
        }
      }
      // A template without a registered portable renderer is not advertised
      // as a faithful screenshot. Keep a clear structural preview instead.
      return '<span class="te-catalog-structure" aria-label="Structure preview for ' +
        cmsEscapeAttr(entry.label) + '"><span class="te-catalog-structure__kicker">' +
        cmsEscapeHtml(humanize(entry.type || 'Section')) +
        '</span><span class="te-catalog-structure__heading">' +
        cmsEscapeHtml(entry.label) +
        '</span><span class="te-catalog-structure__rule"></span>' +
        '<span class="te-catalog-structure__tiles"><i></i><i></i><i></i></span></span>';
    }

    function closeSectionCatalog() {
      const catalog = byId('te-section-menu');
      if (catalog?.open && typeof catalog.close === 'function') catalog.close();
      else if (catalog) {
        catalog.removeAttribute('open');
        catalog.hidden = true;
        // Non-modal dialog fallback also restores the originating tree button.
        if (sectionReturnFocus?.isConnected) sectionReturnFocus.focus();
        sectionReturnFocus = null;
      }
      sectionInsertIndex = null;
    }

    let activeSectionTab = 'sections';
    let activeSectionId = '';
    let activeAppKey = '';

    function sectionCategory(entry) {
      const labels = {
        hero: 'Hero', collections: 'Products', story: 'Storytelling',
        faq: 'Content', testimonials: 'Storytelling', trust: 'Content',
        newsletter: 'Forms', features: 'Products',
      };
      return entry.category || labels[entry.type] || humanize(entry.type || 'Section');
    }

    function renderCatalog(query) {
      const needle = String(query || '').trim().toLowerCase();
      const list = byId('te-section-list');
      const preview = byId('te-section-preview');
      if (activeSectionTab === 'apps') {
        const apps = (window.ThemeEmbedReview?.getCatalogEntries?.() || []).filter(function(app) {
          return !needle || [app.name, app.category, app.tagline].join(' ').toLowerCase().includes(needle);
        });
        if (!apps.some(app => app.key === activeAppKey)) activeAppKey = apps[0]?.key || '';
        list.innerHTML = apps.length ? '<div class="te-catalog-list-group"><div class="te-catalog-list-group__label">Storefront apps</div>' +
          apps.map(function(app) {
            return '<button type="button" role="option" aria-selected="' + (activeAppKey === app.key) + '" class="te-catalog-list-item' +
              (activeAppKey === app.key ? ' is-selected' : '') + '" data-choose-section-app="' + cmsEscapeAttr(app.key) + '">' +
              '<span class="te-catalog-list-item__icon">⊞</span><span><strong>' + cmsEscapeHtml(app.name) +
              '</strong><small>' + cmsEscapeHtml(app.category || 'App extension') + '</small></span></button>';
          }).join('') + '</div>' : '<div class="te-empty">The packaged app catalog is still loading or contains no storefront extensions.</div>';
        const app = apps.find(item => item.key === activeAppKey);
        preview.innerHTML = app
          ? '<div class="te-catalog-preview-stage"><div class="te-app-catalog-preview"><span class="te-app-catalog-preview__icon">⊞</span>' +
            '<strong>' + cmsEscapeHtml(app.name) + '</strong><small>' + cmsEscapeHtml(app.category || 'Storefront app') + '</small>' +
            '<p>' + cmsEscapeHtml(app.tagline || 'Configure this storefront extension and install it on the current page.') + '</p></div></div>' +
            '<div class="te-catalog-preview-meta"><div><strong>' + cmsEscapeHtml(app.name) + '</strong>' +
            '<small>Configuration and installation use the existing App Embeds workflow.</small></div>' +
            '<button type="button" class="te-catalog-add" data-configure-section-app>Configure</button></div>'
          : '<div class="te-catalog-preview-unavailable"><strong>App extensions</strong>' +
            '<p>App extensions use the existing storefront app installation workflow.</p>' +
            '<button t="te-field-row' + (selected ? ' is-active' : '') + '" data-tree-field="' + cmsEscapeAttr(key) + '">' +
          '<button type="button" class="te-field-row__main" data-select-field="' + cmsEscapeAttr(key) + '" data-field-section="' + cmsEscapeAttr(section.key) + '" data-field-owner="' + cmsEscapeAttr(owner) + '" aria-label="Edit ' + cmsEscapeAttr(label + (preview ? ': ' + preview : '')) + '">' +
            '<span class="te-field-row__icon te-field-row__icon--' + kind + '" aria-hidden="true"></span>' +
            '<span class="te-field-row__label">' + cmsEscapeHtml(label) + (preview ? '<span class="te-field-row__preview"> — ' + cmsEscapeHtml(preview) + '</span>' : '') + '</span>' +
          '</button></div>';
      }).join('');

      const blockRows = blockMeta.map(function(meta, blockIndex) {
        const blockSchema = blockSchemaFor(section, meta) || {};
        const blockValue = cmsGetPath(section.content || {}, meta.id + '.label');
        const definition = window.cmsAuthoring?.get('block', meta.templateKey);
        const blockLabel = definition
          ? window.cmsAuthoring.describe('block', meta.templateKey, section.content?.[meta.id] || {})
          : ((typeof blockValue === 'string' && blockValue.trim()) || blockSchema.label || humanize(meta.templateKey || meta.id));
        return '<div class="te-block-row' + (sectionSelected && meta.id === activeBlockId ? ' is-active' : '') + '" data-block-id="' + cmsEscapeAttr(meta.id) + '" data-block-index="' + blockIndex + '" data-block-section="' + cmsEscapeAttr(section.key) + '" data-block-owner="' + cmsEscapeAttr(owner) + '" draggable="true">' +
          '<button type="button" class="te-block-row__main" data-select-block="' + cmsEscapeAttr(meta.id) + '" data-block-section="' + cmsEscapeAttr(section.key) + '" data-block-owner="' + cmsEscapeAttr(owner) + '">' +
            '<span class="te-field-row__icon te-field-row__icon--link" aria-hidden="true"></span><span class="te-block-row__copy"><strong>' + cmsEscapeHtml(blockLabel) + '</strong></span>' +
          '</button>' +
          '<details class="te-tree-actions"><summary aria-label="Actions for ' + cmsEscapeAttr(blockLabel) + '">•••</summary><div class="te-tree-actions__menu">' +
            '<button type="button" data-duplicate-block="' + cmsEscapeAttr(meta.id) + '" data-block-section="' + cmsEscapeAttr(section.key) + '" data-block-owner="' + cmsEscapeAttr(owner) + '">Duplicate block</button>' +
            '<button type="button" data-remove-block="' + cmsEscapeAttr(meta.id) + '" data-block-section="' + cmsEscapeAttr(section.key) + '" data-block-owner="' + cmsEscapeAttr(owner) + '">Remove block</button>' +
          '</div></details></div>';
      }).join('');

      const blockTemplates = Array.isArray(schema.blocks) ? schema.blocks : [];
      const sectionRef = owner + ':' + section.key;
      const canExpand = !!fieldRows || blockMeta.length > 0 || blockTemplates.length > 0;
      const expanded = expandedSections.has(sectionRef);
      const addBlock = blockTemplates.length
        ? '<button type="button" class="te-add-block" data-add-block-section="' + cmsEscapeAttr(section.key) + '" data-block-owner="' + cmsEscapeAttr(owner) + '"><span aria-hidden="true">⊕</span> Add block</button>'
        : '';
      const isMenu = section.key === 'header' && blockMeta.some(function(meta) { return meta.templateKey === 'nav-link'; });
      const menuExpanded = expandedMenus.has(sectionRef);
      const blockContent = isMenu
        ? '<div class="te-menu-group"><button type="button" class="te-menu-row" data-toggle-menu="' + cmsEscapeAttr(sectionRef) + '" aria-expanded="' + menuExpanded + '"><span class="te-field-row__icon te-field-row__icon--link" aria-hidden="true"></span><span>Menu</span><span class="te-menu-chevron" aria-hidden="true">⌄</span></button><div class="te-menu-children' + (menuExpanded ? '' : ' is-collapsed') + '">' + blockRows + addBlock + '</div></div>'
        : blockRows + addBlock;

      const canReorder = !isGlobal && capabilities.reorder !== false;
      return '<div class="te-tree-section" data-tree-section="' + cmsEscapeAttr(owner + ':' + section.key) + '" data-group="' + cmsEscapeAttr(group) + '">' +
        '<div class="te-tree-row' + (sectionSelected && !activeBlockId ? ' is-active' : '') + '" data-section-key="' + cmsEscapeAttr(section.key) + '" data-section-owner="' + cmsEscapeAttr(owner) + '" draggable="' + canReorder + '" data-index="' + index + '">' +
          (canExpand ? '<button type="button" class="te-tree-expand" data-expand-section="' + cmsEscapeAttr(sectionRef) + '" aria-expanded="' + expanded + '" aria-label="' + (expanded ? 'Collapse ' : 'Expand ') + cmsEscapeAttr(label) + '" title="' + (expanded ? 'Collapse blocks' : 'Expand blocks') + '"><span aria-hidden="true">›</span></button>' : '<span class="te-tree-expand-placeholder"></span>') +
          '<button type="button" class="te-tree-row__main" data-select-section="' + cmsEscapeAttr(section.key) + '" data-section-owner="' + cmsEscapeAttr(owner) + '">' +
            '<span class="te-tree-row__icon">' + icon.section + '</span><span class="te-tree-row__copy"><span class="te-tree-row__name">' + cmsEscapeHtml(label) +
            '</span></span>' +
          '</button>' +
          (!isGlobal ? '<details class="te-tree-actions"><summary aria-label="Actions for ' + cmsEscapeAttr(label) + '">•••</summary><div class="te-tree-actions__menu">' +
            '<button type="button" data-toggle-section="' + cmsEscapeAttr(section.key) + '" data-section-owner="' + cmsEscapeAttr(owner) + '">' + (visible ? 'Hide section' : 'Show section') + '</button>' +
            (capabilities.duplicate !== false ? '<button type="button" data-duplicate-section="' + cmsEscapeAttr(section.key) + '">Duplicate section</button>' : '') +
            (capabilities.remove !== false ? '<button type="button" data-remove-section="' + cmsEscapeAttr(section.key) + '">Remove section</button>' : '') +
          '</div></details>' : '') + '</div>' +
          '<div class="te-block-list' + (expanded ? '' : ' is-collapsed') + '">' + fieldRows + blockContent + '</div>' +
        '</div>';
    }

    const insertLine = function(index) {
      return '<div class="te-insert-line"><button type="button" data-insert-at="' + index +
        '" aria-label="Add section at position ' + (index + 1) + '" title="Insert section here">+</button></div>';
    };
    const firstTemplateIndex = templateSections.length ? pageSections.indexOf(templateSections[0]) : pageSections.length;
    const pageRows = insertLine(firstTemplateIndex) + templateSections.map(function(section) {
      const index = pageSections.indexOf(section);
      return sectionNode(section, index, 'template') + insertLine(index + 1);
    }).join('');
    const headerRow = headerSections.map(section => sectionNode(section, pageSections.indexOf(section), 'header')).join('');
    const footerRow = footerSections.map(section => sectionNode(section, pageSections.indexOf(section), 'footer')).join('');

    byId('te-tree').innerHTML =
      '<div class="te-tree-group te-tree-group--global"><div class="te-tree-group__label">Header</div>' + headerRow + '</div>' +
      '<div class="te-tree-group"><div class="te-tree-group__label">Template</div>' + pageRows +
        '<button type="button" class="te-add-section" id="te-add-section" title="Add a section to this page"><span aria-hidden="true">⊕</span> Add section</button></div>' +
      (unmanagedLiveSections.length ? '<div class="te-tree-group te-live-only"><div class="te-tree-group__label">Live-only sections · not editable yet</div>' +
        unmanagedLiveSections.map(function(region, index) {
          return '<button type="button" class="te-live-only-row" data-scroll-live="' + index + '"><span>' + icon.section + '</span><span><strong>' + cmsEscapeHtml(humanize(region.label.replaceAll('.', ' '))) + '</strong><small>Existing storefront · adapter needed</small></span></button>';
        }).join('') + '</div>' : '') +
      '<dialog class="te-section-menu" id="te-section-menu" aria-label="Add a section" aria-describedby="te-section-catalog-help" hidden>' +
        '<div class="te-section-menu__head"><div><strong>Add a section</strong><small>Choose a reusable storefront component</small></div><button type="button" class="te-tree-mini" id="te-section-cancel" aria-lbutton type="button" class="te-media-button" data-undo-media="' + cmsEscapeAttr(field.key) + '" title="Undo the previous media change">Undo media</button>' : '') +
        '<a class="te-media-view-original" data-view-original="' + cmsEscapeAttr(field.key) + '"' +
        (viewableMediaHref(value) ? ' href="' + cmsEscapeAttr(viewableMediaHref(value)) + '"' : ' hidden') +
        ' target="_blank" rel="noopener noreferrer" aria-label="View original media in a new tab">View original ↗</a>' +
        '</div><div class="te-media-feedback" data-media-feedback role="status" aria-live="polite"></div></div>' +
        '<details class="te-media-advanced"><summary>Source details</summary><label for="' + id + '">Media source URL</label>' +
        '<input class="te-media-url" id="' + id + '" data-field-input="' + cmsEscapeAttr(field.key) + '" value="' + safeValue + '" placeholder="Enter a media URL or path"></details>' + help + '</div>';
    }

    if (field.type === 'boolean') {
      return '<div class="te-setting-row te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><div><strong>' + cmsEscapeHtml(field.label) + '</strong>' +
        (field.help ? '<span>' + cmsEscapeHtml(field.help) + '</span>' : '') +
        '</div><button type="button" class="te-switch" role="switch" data-boolean-field="' + cmsEscapeAttr(field.key) + '" aria-checked="' + (Boolean(value) ? 'true' : 'false') + '"></button></div>';
    }

    if (field.type === 'select') {
      const options = Array.isArray(field.options) ? field.options : [];
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<select id="' + id + '" data-field-input="' + cmsEscapeAttr(field.key) + '">' +
        options.map(function(option) {
          return '<option value="' + cmsEscapeAttr(option.value) + '"' + (String(option.value) === String(value) ? ' selected' : '') + '>' + cmsEscapeHtml(option.label) + '</option>';
        }).join('') + '</select>' + help + '</div>';
    }

    if (field.type === 'range') {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const step = field.step ?? 1;
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '<span>' + cmsEscapeHtml(field.unit || '') + '</span></label>' +
        '<div class="te-range-control"><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + safeValue + '" data-range-field="' + cmsEscapeAttr(field.key) + '">' +
        '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + safeValue + '" data-number-pair="' + cmsEscapeAttr(field.key) + '"><span>' + cmsEscapeHtml(field.unit || '') + '</span></div>' + help + '</div>';
    }

    if (field.type === 'color') {
      const colorValue = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : '#ffffff';
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<div class="te-color-control"><input id="' + id + '" type="color" value="' + cmsEscapeAttr(colorValue) + '" data-color-field="' + cmsEscapeAttr(field.key) + '"><input type="text" value="' + safeValue + '" data-color-text="' + cmsEscapeAttr(field.key) + '"></div>' + help + '</div>';
    }

    if (field.type === 'rich_text') {
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label>' + cmsEscapeHtml(field.label) + '</label>' +
        '<div class="te-rich-toolbar" data-rich-toolbar="' + cmsEscapeAttr(field.key) + '">' +
          '<button type="button" data-rich-command="bold"><strong>B</strong></button>' +
          '<button type="button" data-rich-command="italic"><em>I</em></button>' +
          '<button type="button" data-rich-command="createLink">Link</button>' +
          '<button type="button" data-rich-command="insertUnorderedList">• List</button>' +
          '<button type="button" data-rich-command="insertOrderedList">1. List</button>' +
        '</div><div class="te-rich-input" contenteditable="true" data-rich-field="' + cmsEscapeAttr(field.key) + '">' + String(value || '') + '</div>' + help + '</div>';
    }

    if (field.type === 'product' || field.type === 'collection' || field.type === 'variant') {
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<select id="' + id + '" data-resource-field="' + cmsEscapeAttr(field.key) + '" data-resource-type="' + cmsEscapeAttr(field.type) + '"><option value="' + safeValue + '">' + cmsEscapeHtml(value ? String(value) : 'Loading…') + '</option></select>' + help + '</div>';
    }

    if (field.type === 'link' || field.type === 'url')
      return renderLinkField(field, value, id, help);

    const inputType = field.type === 'number' ? 'number' : 'text';
    const selectedText = activeFieldKey === field.key && ['text','textarea'].includes(field.type) && !/cta|button|link|href/i.test(field.key);
    const stylePrefix = '__editor.fieldStyles.' + field.key + '.';
    const controls = selectedText ? [
      ['fontWeight','800','B','Bold'],
      ['fontStyle','italic','I','Italic'],
      ['textDecoration','underline','U','Underline'],
      ['textTransform','uppercase','Aa','Uppercase'],
      ['textAlign','center','≡','Center alignment'],
    ] : [];
    const formatToolbar = selectedText
      ? '<div class="te-inline-text-toolbar" role="toolbar" aria-label="Text formatting">' + controls.map(function(item) {
        const current = cmsGetPath(section.content,stylePrefix+item[0]);
        return '<button type="button" data-inline-style-key="' + cmsEscapeAttr(stylePrefix+item[0]) + '" data-inline-style-value="' + item[1] + '" aria-label="' + item[3] + '" aria-pressed="' + (String(current) === item[1]) + '">' + item[2] + '</button>';
      }).join('') + '</div>' : '';
    const multiline = field.type === 'json' || field.type === 'textarea' || (selectedText && /headline|heading|title/i.test(field.key)) || (field.type === 'text' && String(value).includes('\n'));
    const input = multiline
      ? '<textarea id="' + id + '" rows="' + (field.type === 'json' ? 10 : field.type === 'textarea' ? 4 : 2) + '" data-field-input="' + cmsEscapeAttr(field.key) + '"' + (field.type === 'json' ? ' data-json-editor="true" spellcheck="false" class="te-json-editor"' : '') + ' placeholder="' + cmsEscapeAttr(field.placeholder || '') + '">' + cmsEscapeHtml(field.type === 'json' ? JSON.stringify(value, null, 2) : String(value)) + '</textarea>'
      : '<input id="' + id + '" type="' + inputType + '" data-field-input="' + cmsEscapeAttr(field.key) + '" value="' + safeValue + '" placeholder="' + cmsEscapeAttr(field.placeholder || '') + '"' +
        (field.min !== undefined ? ' min="' + field.min + '"' : '') + (field.max !== undefined ? ' max="' + field.max + '"' : '') + (field.step !== undefined ? ' step="' + field.step + '"' : '') + '>';

    return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(selectedText ? 'Text' : field.label) + '</label>' + formatToolbar + input + help + '</div>';
  }

  // One contextual inspector for the selected section or block. Field types
  // determine visual grouping, not competing editor tabs or stored schemas.
  function renderInspectorGroups(section) {
    if (activeBlockId && !currentBlockSchema()) {
      return '<div class="te-empty" role="status">This block’s editing definition is unavailable. The existing storefront card has not been modified.</div>';
    }
    const groups = { content: [], media: [], links: [] };
    currentSchema().forEach(function(field) {
      const kind = fieldKind(field);
      const semanticKey = String(field.blockRelativeKey || field.ktem.templateData?.themePreset === (entry.preset || entry.id) ||
            item.templateData?.preset === (entry.preset || entry.id) ||
            item.slug === (entry.preset || entry.id)
          );
        });
        return { ...entry, catalog: row || null, category: sectionCategory(entry) };
      });
      const filtered = entries.filter(function(entry) {
        return !needle || [entry.label, entry.type, entry.id, entry.category, entry.catalog?.sku].join(' ').toLowerCase().includes(needle);
      });
      if (!filtered.some(entry => entry.id === activeSectionId)) activeSectionId = filtered[0]?.id || '';
      const groups = new Map();
      for (const entry of filtered) {
        if (!groups.has(entry.category)) groups.set(entry.category, []);
        groups.get(entry.category).push(entry);
      }
      const generate = '<button type="button" class="te-catalog-generate" data-start-section-generation>' +
        '<img src="/admin/brand/agentsam-gorilla-tiny.svg" alt="" aria-hidden="true">' +
        '<span><strong>Generate with AgentSam</strong><small>Create a reusable editable CMS section</small></span><span aria-hidden="true">↗</span></button>';
      list.innerHTML = generate + (filtered.length ? Array.from(groups.entries()).map(function([category, items]) {
        return '<div class="te-catalog-list-group"><div class="te-catalog-list-group__label">' +
          cmsEscapeHtml(category) + '</div>' + items.map(function(entry) {
            return '<button type="button" role="option" aria-selected="' + (activeSectionId === entry.id) +
              '" class="te-catalog-list-item' + (activeSectionId === entry.id ? ' is-selected' : '') +
              '" data-choose-section="' + cmsEscapeAttr(entry.id) + '">' +
              '<span class="te-catalog-list-item__icon">' + icon.section + '</span><span><strong>' +
              cmsEscapeHtml(entry.label) + '</strong><small>' +
              cmsEscapeHtml(entry.source || entry.type || 'Section') + '</small></span></button>';
          }).join('') + '</div>';
      }).join('') : '<div class="te-empty">No sections match that search.</div>');

      const selected = filtered.find(entry => entry.id === activeSectionId);
      preview.innerHTML = selected
        ? '<div class="te-catalog-preview-stage">' + catalogVisual(selected) + '</div>' +
          '<div class="te-catalog-preview-meta"><div><strong>' + cmsEscapeHtml(selected.label) + '</strong>' +
          '<small>' + cmsEscapeHtml(selected.catalog?.description || (selected.catalog?.sku ? selected.catalog.sku + ' · ' : '') + humanize(selected.type || selected.templateKey)) +
          '</small></div><button type="button" class="te-catalog-add" data-add-selected-section>Add section</button></div>'
        : '<div class="te-catalog-preview-unavailable"><strong>No matching sections</strong><p>Try another search or generate a reusable section with AgentSam.</p></div>';

      list.querySelector('[data-start-section-generation]')?.addEventListener('click', function() {
        if (menu.open) closeSectionCatalog();
        window.dispatchEvent(new CustomEvent('theme-editor:generate-request', { detail: { kind: 'section' } }));
      });
      list.querySelectorAll('[data-choose-section]').forEach(function(button) {
        button.addEventListener('click', function() {
          activeSectionId = button.dataset.chooseSection;
          renderCatalog(searchInput.value);
        });
      });
      preview.querySelector('[data-add-selected-section]')?.addEventListener('click', function() {
        if (!selected) return;
        const insertAt = sectionInsertIndex;
        if (menu.open) closeSectionCatalog();
        insertSection(selected.templateKey, selected.preset || selected.id, insertAt);
      });
    }

    byId('te-tree').querySelectorAll('[data-expand-section]').forEach(function(button) {
      button.addEventListener('click', function(event) {
        event.stopPropagation();
        const ref = button.dataset.expandSection;
        const expanded = !expandedSections.has(ref);
        if (expanded) expandedSections.add(ref);
        else expandedSections.delete(ref);
        const section = button.closest('.te-tree-section');
        section?.querySelector('.te-block-list')?.classList.toggle('is-collapsed', !expanded);
        button.setAttribute('aria-expanded', String(expanded));
        button.setAttribute('aria-label', (expanded ? 'Collapse ' : 'Expand ') + (section?.querySelector('.te-tree-row__name')?.textContent || 'section'));
        button.title = expanded ? 'Collapse blocks' : 'Expand blocks';
      });
    });
    byId('te-tree').querySelectorAll('[data-toggle-menu]').forEach(function(button) {
      button.addEventListener('click', function() {
        const ref = button.dataset.toggleMenu;
        const isOpen = !expandedMenus.has(ref);
        if (isOpen) expandedMenus.add(ref);
        else expandedMenus.delete(ref);
        button.setAttribute('aria-expanded', String(isOpen));
        button.nextElementSibling?.classList.toggle('is-collapsed', !isOpen);
      });
    });
    byId('te-tree').querySelectorAll('[data-scroll-live]').forEach(function(button) {
      button.addEventListener('click', function() {
        const region = unmanagedLiveSections[Number(button.dataset.scrollLive)];
        if (!region) return;
        const doc = byId('theme-preview').contentDocument;
        const target = Array.from(doc?.querySelectorAll('main > section') || []).find(function(node) {
          return (node.id && node.id === region.id) || (node.dataset.hSectionId && node.dataset.hSectionId === region.sectionId);
        });
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setNote('This real storefront section is visible but not yet CMS-editable. Its renderer must be registered before authoring.', 'error');
      });
    });
    byId('te-tree').querySelectorAll('[data-select-section]').forEach(function(button) {
      button.addEventListener('click', function(event) {
        setMiniAnchor(button, null, event);
        selectSection(button.dataset.selectSection, null, true, button.dataset.sectionOwner);
      });
    });
    byId('te-tree').querySelectorAll('[data-select-field]').forEach(function(button) {
      button.addEventListener('click', function() {
        selectSection(button.dataset.fieldSection, button.dataset.selectField, true, button.dataset.fieldOwner);
      });
    });
    byId('te-tree').querySelectorAll('[data-select-block]').forEach(function(button) {
      button.addEventListener('click', function(event) {
        setMiniAnchor(button, null, event);
        selectBlock(button.dataset.blockSection, button.dataset.selectBlock, null, true, button.dataset.blockOwner);
      });
    });
    byId('te-tree').querySelectorAll('[data-toggle-section]').forEach(function(button) {
      button.addEventListener('click', function(event) {
        event.stopPropagation();
        const owner = button.dataset.sectionOwner || slug;
        const target = findSection(button.dataset.toggleSection, owner);
        const currentVisible = !target?.content?.__editor?.visibility || target.content.__editor.visibility.enabled !== false;
        setSectionVisibility(button.dataset.toggleSection, !currentVisible, owner);
      });
    });
    byId('te-tree').querySelectorAll('[data-duplicate-section]').forEach(function(button) {
      button.addEventListener('click', function(event) { event.stopPropagation(); duplicateSection(button.dataset.duplicateSection); });
    });
    byId('te-tree').querySelectorAll('[data-remove-section]').forEach(function(button) {
      button.addEventListener('click', function(event) { event.stopPropagation(); removeSection(button.dataset.removeSection); });
    });

    byId('te-tree').querySelectorAll('[data-add-block-section]').forEach(function(button) {
      button.addEventListener('click', function() {
        openBlockCatalog(button.dataset.addBlockSection, button.dataset.blo
        '<label class="te-media-button" style="display:inline-flex;align-items:center">Upload<input type="file" hidden data-upload-media="' + cmsEscapeAttr(field.key) + '" accept="' + (field.type === 'video' ? 'video/*' : field.type === 'model3d' ? 'model/*,.glb,.gltf,.usdz' : 'image/*,video/*,.glb,.gltf,.usdz') + '"></label>' +
        (mediaUndo.has(mediaUndoKey(field.key)) ? '<button type="button" class="te-media-button" data-undo-media="' + cmsEscapeAttr(field.key) + '" title="Undo the previous media change">Undo media</button>' : '') +
        '<a class="te-media-view-original" data-view-original="' + cmsEscapeAttr(field.key) + '"' +
        (viewableMediaHref(value) ? ' href="' + cmsEscapeAttr(viewableMediaHref(value)) + '"' : ' hidden') +
        ' target="_blank" rel="noopener noreferrer" aria-label="View original media in a new tab">View original ↗</a>' +
        '</div><div class="te-media-feedback" data-media-feedback role="status" aria-live="polite"></div></div>' +
        '<details class="te-media-advanced"><summary>Source details</summary><label for="' + id + '">Media source URL</label>' +
        '<input class="te-media-url" id="' + id + '" data-field-input="' + cmsEscapeAttr(field.key) + '" value="' + safeValue + '" placeholder="Enter a media URL or path"></details>' + help + '</div>';
    }

    if (field.type === 'boolean') {
      return '<div class="te-setting-row te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><div><strong>' + cmsEscapeHtml(field.label) + '</strong>' +
        (field.help ? '<span>' + cmsEscapeHtml(field.help) + '</span>' : '') +
        '</div><button type="button" class="te-switch" role="switch" data-boolean-field="' + cmsEscapeAttr(field.key) + '" aria-checked="' + (Boolean(value) ? 'true' : 'false') + '"></button></div>';
    }

    if (field.type === 'select') {
      const options = Array.isArray(field.options) ? field.options : [];
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<select id="' + id + '" data-field-input="' + cmsEscapeAttr(field.key) + '">' +
        options.map(function(option) {
          return '<option value="' + cmsEscapeAttr(option.value) + '"' + (String(option.value) === String(value) ? ' selected' : '') + '>' + cmsEscapeHtml(option.label) + '</option>';
        }).join('') + '</select>' + help + '</div>';
    }

    if (field.type === 'range') {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const step = field.step ?? 1;
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '<span>' + cmsEscapeHtml(field.unit || '') + '</span></label>' +
        '<div class="te-range-control"><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + safeValue + '" data-range-field="' + cmsEscapeAttr(field.key) + '">' +
        '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + safeValue + '" data-number-pair="' + cmsEscapeAttr(field.key) + '"><span>' + cmsEscapeHtml(field.unit || '') + '</span></div>' + help + '</div>';
    }

    if (field.type === 'color') {
      const colorValue = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : '#ffffff';
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<div class="te-color-control"><input id="' + id + '" type="color" value="' + cmsEscapeAttr(colorValue) + '" data-color-field="' + cmsEscapeAttr(field.key) + '"><input type="text" value="' + safeValue + '" data-color-text="' + cmsEscapeAttr(field.key) + '"></div>' + help + '</div>';
    }

    if (field.type === 'rich_text') {
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label>' + cmsEscapeHtml(field.label) + '</label>' +
        '<div class="te-rich-toolbar" data-rich-toolbar="' + cmsEscapeAttr(field.key) + '">' +
          '<button type="button" data-rich-command="bold"><strong>B</strong></button>' +
          '<button type="button" data-rich-command="italic"><em>I</em></button>' +
          '<button type="button" data-rich-command="createLink">Link</button>' +
          '<button type="button" data-rich-command="insertUnorderedList">• List</button>' +
          '<button type="button" data-rich-command="insertOrderedList">1. List</button>' +
        '</div><div class="te-rich-input" contenteditable="true" data-rich-field="' + cmsEscapeAttr(field.key) + '">' + String(value || '') + '</div>' + help + '</div>';
    }

    if (field.type === 'product' || field.type === 'collection' || field.type === 'variant') {
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<select id="' + id + '" data-resource-field="' + cmsEscapeAttr(field.key) + '" data-resource-type="' + cmsEscapeAttr(field.type) + '"><option value="' + safeValue + '">' + cmsEscapeHtml(value ? String(value) : 'Loading…') + '</option></select>' + help + '</div>';
    }

    if (field.type === 'link' || field.type === 'url')
      return renderLinkField(field, value, id, help);

    const inputType = field.type === 'number' ? 'number' : 'text';
    const selectedText = activeFieldKey === field.key && ['text','textarea'].includes(field.type) && !/cta|button|link|href/i.test(field.key);
    const stylePrefix = '__editor.fieldStyles.' + field.key + '.';
    const controls = selectedText ? [
      ['fontWeight','800','B','Bold'],
      ['fontStyle','italic','I','Italic'],
      ['textDecoration','underline','U','Underline'],
      ['textTransform','uppercase','Aa','Uppercase'],
      ['textAlign','center','≡','Center alignment'],
    ] : [];
    const formatToolbar = selectedText
      ? '<div class="te-inline-text-toolbar" role="toolbar" aria-label="Text formatting">' + controls.map(function(item) {
        const current = cmsGetPath(section.content,stylePrefix+item[0]);
        return '<button type="button" data-inline-style-key="' + cmsEscapeAttr(stylePrefix+item[0]) + '" data-inline-style-value="' + item[1] + '" aria-label="' + item[3] + '" aria-pressed="' + (String(current) === item[1]) + '">' + item[2] + '</button>';
      }).join('') + '</div>' : '';
    const multiline = field.type === 'json' || field.type === 'textarea' || (selectedText && /headline|heading|title/i.test(field.key)) || (field.type === 'text' && String(value).includes('\n'));
    const input = multiline
      ? '<textarea id="' + id + '" rows="' + (field.type === 'json' ? 10 : field.type === 'textarea' ? 4 : 2) + '" data-field-input="' + cmsEscapeAttr(field.key) + '"' + (field.type === 'json' ? ' data-json-editor="true" spellcheck="false" class="te-json-editor"' : '') + ' placeholder="' + cmsEscapeAttr(field.placeholder || '') + '">' + cmsEscapeHtml(field.type === 'json' ? JSON.stringify(value, null, 2) : String(value)) + '</textarea>'
      : '<input id="' + id + '" type="' + inputType + '" data-field-input="' + cmsEscapeAttr(field.key) + '" value="' + safeValue + '" placeholder="' + cmsEscapeAttr(field.placeholder || '') + '"' +
        (field.min !== undefined ? ' min="' + field.min + '"' : '') + (field.max !== undefined ? ' max="' + field.max + '"' : '') + (field.step !== undefined ? ' step="' + field.step + '"' : '') + '>';

    return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(selectedText ? 'Text' : field.label) + '</label>' + formatToolbar + input + help + '</div>';
  }

  // One contextual inspector for the selected section or block. Field types
  // determine visual grouping, not competing editor tabs or stored schemas.
  function renderInspectorGroups(section) {
    if (activeBlockId && !currentBlockSchema()) {
      return '<div class="te-empty" role="status">This block’s editing definition is unavailable. The existing storefront card has not been modified.</div>';
    }
    const groups = { content: [], media: [], links: [] };
    currentSchema().forEach(function(field) {
      const kind = fieldKind(field);
      const semanticKey = String(field.blockRelativeKey || field.kbutton type="button" class="te-media-button" data-undo-media="' + cmsEscapeAttr(field.key) + '" title="Undo the previous media change">Undo media</button>' : '') +
        '<a class="te-media-view-original" data-view-original="' + cmsEscapeAttr(field.key) + '"' +
        (viewableMediaHref(value) ? ' href="' + cmsEscapeAttr(viewableMediaHref(value)) + '"' : ' hidden') +
        ' target="_blank" rel="noopener noreferrer" aria-label="View original media in a new tab">View original ↗</a>' +
        '</div><div class="te-media-feedback" data-media-feedback role="status" aria-live="polite"></div></div>' +
        '<details class="te-media-advanced"><summary>Source details</summary><label for="' + id + '">Media source URL</label>' +
        '<input class="te-media-url" id="' + id + '" data-field-input="' + cmsEscapeAttr(field.key) + '" value="' + safeValue + '" placeholder="Enter a media URL or path"></details>' + help + '</div>';
    }

    if (field.type === 'boolean') {
      return '<div class="te-setting-row te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><div><strong>' + cmsEscapeHtml(field.label) + '</strong>' +
        (field.help ? '<span>' + cmsEscapeHtml(field.help) + '</span>' : '') +
        '</div><button type="button" class="te-switch" role="switch" data-boolean-field="' + cmsEscapeAttr(field.key) + '" aria-checked="' + (Boolean(value) ? 'true' : 'false') + '"></button></div>';
    }

    if (field.type === 'select') {
      const options = Array.isArray(field.options) ? field.options : [];
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<select id="' + id + '" data-field-input="' + cmsEscapeAttr(field.key) + '">' +
        options.map(function(option) {
          return '<option value="' + cmsEscapeAttr(option.value) + '"' + (String(option.value) === String(value) ? ' selected' : '') + '>' + cmsEscapeHtml(option.label) + '</option>';
        }).join('') + '</select>' + help + '</div>';
    }

    if (field.type === 'range') {
      const min = field.min ?? 0;
      const max = field.max ?? 100;
      const step = field.step ?? 1;
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '<span>' + cmsEscapeHtml(field.unit || '') + '</span></label>' +
        '<div class="te-range-control"><input id="' + id + '" type="range" min="' + min + '" max="' + max + '" step="' + step + '" value="' + safeValue + '" data-range-field="' + cmsEscapeAttr(field.key) + '">' +
        '<input type="number" min="' + min + '" max="' + max + '" step="' + step + '" value="' + safeValue + '" data-number-pair="' + cmsEscapeAttr(field.key) + '"><span>' + cmsEscapeHtml(field.unit || '') + '</span></div>' + help + '</div>';
    }

    if (field.type === 'color') {
      const colorValue = /^#[0-9a-f]{6}$/i.test(String(value)) ? String(value) : '#ffffff';
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<div class="te-color-control"><input id="' + id + '" type="color" value="' + cmsEscapeAttr(colorValue) + '" data-color-field="' + cmsEscapeAttr(field.key) + '"><input type="text" value="' + safeValue + '" data-color-text="' + cmsEscapeAttr(field.key) + '"></div>' + help + '</div>';
    }

    if (field.type === 'rich_text') {
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label>' + cmsEscapeHtml(field.label) + '</label>' +
        '<div class="te-rich-toolbar" data-rich-toolbar="' + cmsEscapeAttr(field.key) + '">' +
          '<button type="button" data-rich-command="bold"><strong>B</strong></button>' +
          '<button type="button" data-rich-command="italic"><em>I</em></button>' +
          '<button type="button" data-rich-command="createLink">Link</button>' +
          '<button type="button" data-rich-command="insertUnorderedList">• List</button>' +
          '<button type="button" data-rich-command="insertOrderedList">1. List</button>' +
        '</div><div class="te-rich-input" contenteditable="true" data-rich-field="' + cmsEscapeAttr(field.key) + '">' + String(value || '') + '</div>' + help + '</div>';
    }

    if (field.type === 'product' || field.type === 'collection' || field.type === 'variant') {
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
        '<select id="' + id + '" data-resource-field="' + cmsEscapeAttr(field.key) + '" data-resource-type="' + cmsEscapeAttr(field.type) + '"><option value="' + safeValue + '">' + cmsEscapeHtml(value ? String(value) : 'Loading…') + '</option></select>' + help + '</div>';
    }

    if (field.type === 'link' || field.type === 'url')
      return renderLinkField(field, value, id, help);

    const inputType = field.type === 'number' ? 'number' : 'text';
    const selectedText = activeFieldKey === field.key && ['text','textarea'].includes(field.type) && !/cta|button|link|href/i.test(field.key);
    const stylePrefix = '__editor.fieldStyles.' + field.key + '.';
    const controls = selectedText ? [
      ['fontWeight','800','B','Bold'],
      ['fontStyle','italic','I','Italic'],
      ['textDecoration','underline','U','Underline'],
      ['textTransform','uppercase','Aa','Uppercase'],
      ['textAlign','center','≡','Center alignment'],
    ] : [];
    const formatToolbar = selectedText
      ? '<div class="te-inline-text-toolbar" role="toolbar" aria-label="Text formatting">' + controls.map(function(item) {
        const current = cmsGetPath(section.content,stylePrefix+item[0]);
        return '<button type="button" data-inline-style-key="' + cmsEscapeAttr(stylePrefix+item[0]) + '" data-inline-style-value="' + item[1] + '" aria-label="' + item[3] + '" aria-pressed="' + (String(current) === item[1]) + '">' + item[2] + '</button>';
      }).join('') + '</div>' : '';
    const multiline = field.type === 'json' || field.type === 'textarea' || (selectedText && /headline|heading|title/i.test(field.key)) || (field.type === 'text' && String(value).includes('\n'));
    const input = multiline
      ? '<textarea id="' + id + '" rows="' + (field.type === 'json' ? 10 : field.type === 'textarea' ? 4 : 2) + '" data-field-input="' + cmsEscapeAttr(field.key) + '"' + (field.type === 'json' ? ' data-json-editor="true" spellcheck="false" class="te-json-editor"' : '') + ' placeholder="' + cmsEscapeAttr(field.placeholder || '') + '">' + cmsEscapeHtml(field.type === 'json' ? JSON.stringify(value, null, 2) : String(value)) + '</textarea>'
      : '<input id="' + id + '" type="' + inputType + '" data-field-input="' + cmsEscapeAttr(field.key) + '" value="' + safeValue + '" placeholder="' + cmsEscapeAttr(field.placeholder || '') + '"' +
        (field.min !== undefined ? ' min="' + field.min + '"' : '') + (field.max !== undefined ? ' max="' + field.max + '"' : '') + (field.step !== undefined ? ' step="' + field.step + '"' : '') + '>';

    return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label for="' + id + '">' + cmsEscapeHtml(selectedText ? 'Text' : field.label) + '</label>' + formatToolbar + input + help + '</div>';
  }

  // One contextual inspector for the selected section or block. Field types
  // determine visual grouping, not competing editor tabs or stored schemas.
  function renderInspectorGroups(section) {
    if (activeBlockId && !currentBlockSchema()) {
      return '<div class="te-empty" role="status">This block’s editing definition is unavailable. The existing storefront card has not been modified.</div>';
    }
    const groups = { content: [], media: [], links: [] };
    currentSchema().forEach(function(field) {
      const kind = fieldKind(field);
      const semanticKey = String(field.blockRelativeKey || field.kockSchema();
    const sectionLabel = (sectionSchema && sectionSchema.label) || humanize(section.key);
    const focusedSchema = activeFieldKey && !blockMeta ? currentSchema().find(function(field) { return field.key === activeFieldKey; }) : null;
    const focusedTitle = focusedSchema && (/heading|headline|title/i.test(focusedSchema.key) && !/subheadline|subtitle|subheading/i.test(focusedSchema.key)
      ? 'Heading' : /meta[0-9]+|subheadline|subtitle/i.test(focusedSchema.key) ? 'Text' : focusedSchema.label);
    byId('te-mobile-edit-title').textContent = focusedTitle || (blockMeta ? 'Edit block' : sectionLabel);
    byId('te-mobile-selection-label').textContent = focusedTitle || (blockMeta ? 'Block' : sectionLabel);
    byId('te-inspector-title').textContenif (!field) return;
        activeFieldKey = field.key;
        setFieldValue(field, editor.innerHTML);
      });
    });

    document.querySelectorAll('[data-rich-toolbar]').forEach(function(toolbar) {
      toolbar.querySelectorAll('[data-rich-command]').forEach(function(button) {
        button.addEventListener('click', function() {
          const command = button.dataset.richCommand;
          const editor = toolbar.nextElementSibling;
          if (!editor) return;
          editor.focus();
          let value = null;
          if (command === 'createLink') value = prompt('Link URL') || null;
          if (command !== 'createLink' || value) document.execCommand(command, false, value);
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    });

    document.querySelectorAll('[data-resource-field]').forEach(function(select) {
      hydrateResourceSelect(select);
      select.addEventListener('change', function() {
        const field = fieldByKey(select.dataset.resourceField);
        if (!field) return;
        activeFieldKey = field.key;
        setFieldValue(field, select.value);
      });
    });

    document.querySelectorAll('[data-pick-media]').forEach(function(button) {
      button.addEventListener('click', function() { openMediaPicker(button.dataset.pickMedia); });
    });

    document.querySelectorAll('[data-undo-media]').forEach(function(button) {
      button.addEventListener('click', function() { undoMediaValue(button.dataset.undoMedia); });
    });
    document.querySelectorAll('[data-upload-media]').forEach(function(input) {
      input.addEventListener('change', async function() {
        if (!input.files || !input.files.length) return;
        await uploadMediaIntoField(input.dataset.uploadMedia, Array.from(input.files));
        input.value = '';
      });
    });

    document.querySelectorAll('[data-media-drop]').forEach(function(zone) {
      const fieldKey = zone.dataset.mediaDrop;
      ['dragenter', 'dragover'].forEach(function(type) {
        zone.addEventListener(type, function(event) {
          event.preventDefault();
          zone.classList.add('is-over');
        });
      });
      ['dragleave', 'drop'].forEach(function(type) {
        zone.addEventListener(type, function(event) {
          event.preventDefault();
          zone.classList.remove('is-over');
        });
      });
      zone.addEventListener('drop', async function(event) {
        const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
        if (!files.length) return;
        await uploadMediaIntoField(fieldKey, files.slice(0, 1));
      });
    });
  }

  async function hydrateResourceSelect(select) {
    const type = select.dataset.resourceType;
    const field = fieldByKey(select.dataset.resourceField);
    const section = currentSection();
    const current = field && section ? valueForField(section, field) : '';

    try {
      let options = [];
      if (type === 'product') {
        if (!resourceCache.products) {
          const data = await adminFetch('/api/admin/products');
          resourceCache.products = (data.products || []).map(function(product) {
            return { value: product.slug || String(product.id), label: product.title || product.slug };
          });
        }
        options = resourceCache.products;
      } else if (type === 'collection') {
        if (!resourceCache.collections) {
          const data = await adminFetch('/api/store/collections');
          resourceCache.collections = (data.collections || []).map(function(collection) {
            return { value: collection.slug || String(collection.id), label: collection.title || collection.slug };
          });
        }
        options = resourceCache.collections;
      } else if (type === 'variant' && field && field.productKey) {
        const productSlug = cmsGetPath(section.content, field.productKey);
        if (productSlug) {
          const cacheKey = 'variants:' + productSlug;
          if (!resourceCache[cacheKey]) {
            const data = await adminFetch('/api/store/products/' + encodeURIComponent(productSlug));
            resourceCache[cacheKey] = (data.variants || []).map(function(variant) {
              const label = [variant.title, variant.size, variant.color, variant.sku].filter(Boolean).join(' · ');
              return { value: variant.sku || String(variant.id), label: label || String(variant.id) };
            });
          }
          options = resourceCache[cacheKey];
        }
      }

      const emptyLabel = type === 'variant' && field && !field.productKey ? 'Enter variant in schema' : 'None';
      select.innerHTML = '<option value="">' + emptyLabel + '</option>' + options.map(function(option) {
        return '<option value="' + cmsEscapeAttr(option.value) + '"' + (String(option.value) === String(current) ? ' selected' : '') + '>' + cmsEscapeHtml(option.label) + '</option>';
      }).join('');
    } catch (error) {
      select.innerHTML = '<option value="' + cmsEscapeAttr(String(current || '')) + '">' + cmsEscapeHtml(current ? String(current) : 'Unable to load options') + '</option>';
    }
  }

  function syncMediaPreview(fieldKey, value) {
    const zone = document.querySelector('[data-media-drop="' + CSS.escape(fieldKey) + '"]');
    if (!zone) return;
    const preview = zone.querySelector('.te-media-preview');
    const field = fieldByKey(fieldKey);
    const isModel = field?.type === 'model3d' || /\.(glb|gltf|usdz)(\?|$)/i.test(String(value));
    const isVideo = !isModel && (field?.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(String(value)));
    const isImage = !isModel && !isVideo && /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(String(value));
    if (value && isVideo) preview.innerHTML = '<video src="' + cmsEscapeAttr(value) + '" muted playsinline></video>';
    else if (value && isImage) preview.innerHTML = '<img src="' + cmsEscapeAttr(value) + '" alt="">';
    else if (value && isModel) preview.innerHTML = '<div class="te-media-empty" role="status">3D model selected</div>';
    else preview.innerHTML = '<div class="te-media-empty">' + (value ? 'Media selected' : 'Drop media here or choose from library') + '</div>';
    const openLink = zone.querySelector('[data-view-original]');
    if (openLink) {
      const href = viewableMediaHref(value);
      openLink.hidden = !href;
      if (href) openLink.href = href;
      else openLink.removeAttribute('href');
    }
  }

  function mediaUndoKey(fieldKey) {
    const section = currentSection();
    return section ? sectionOwner(section) + ':' + section.key + ':' + fieldKey : '';
  }

  function setMediaValue(fieldKey, url) {
    const section = currentSection();
    if (!section || !url) return;
    const prior = cmsGetPath(section.content, fieldKey) || '';
    if (prior === url) return;
    const key = mediaUndoKey(fieldKey);
    if (key && !mediaUndo.has(key)) mediaUndo.set(key, prior);
    cmsSetPath(section.content, fieldKey, url);
    // Replacing a photo from a selected card should keep the entire card
    // inspector visible (including its destination and text controls).
    if (!activeBlockId) activeFieldKey = fieldKey;
    markSectionDirty(section);
    renderInspector();
    scheduleLocalPreview();
    closeMediaPicker();
    setNote('Media selected. Review the preview; Save draft to persist the change.', 'success');
  }

  function undoMediaValue(fieldKey) {
    const section = currentSection();
    const key = mediaUndoKey(fieldKey);
    if (!section || !mediaUndo.has(key)) return;
    const previous = mediaUndo.get(key);
    mediaUndo.delete(key);
    cmsSetPath(section.content, fieldKey, previous);
    if (!activeBlockId) activeFieldKey = fieldKey;
    markSectionDirty(section);
    renderInspector();
    scheduleLocalPreview();
    setNote('Previous media restored in this draft. Save draft to persist.', 'success');
  }

  async function uploadMediaIntoField(fieldKey, files) {
    if (!ey);
      // Label and destination are one merchant action, even when the old
      // section schema exposes the label as a plain text field.
      const isActionLabel = kind === 'content' && /cta|button|linkLabel|action/i.test(semanticKey);
      groups[isActionLabel ? 'links' : kind].push(field);
    });
    const titles = { content: 'Content', media: 'Media', links: 'Buttons and links' };
    let visibleKinds = Object.keys(groups).filter(function(kind) {
      return groups[kind].length > 0;
    });
    // Shopify-like progressive disclosure: the selected Hero offers its
    // section media and layout first. Heading, copy and CTAs are selected
    // directly from the left tree/canvas and own their contextual inspector.
    if (section.key === 'hero' && !activeFieldKey && !activeBlockId) {
      visibleKinds = groups.media.length ? ['media'] : [];
    }
    const focusedField = activeFieldKey ? fieldByKey(activeFieldKey) : null;
    if (focusedField && currentSchema().some(function(field) { return field.key === focusedField.key; })) {
      const focusedKind = fieldKind(focusedField);
      const focusedSemanticKey = String(focusedField.blockRelativeKey || focusedField.key);
      const focusedGroup = focusedKind === 'content' && /cta|button|linkLabel|action/i.test(focusedSemanticKey)
        ? 'links'
        : focusedKind;
      if (groups[focusedGroup]?.length) {
        visibleKinds = [focusedGroup];
        // An element selection is not a license to dump the whole section's
        // unrelated fields into its inspector. Keep paired CTA label/link
        // settings together, but isolate headings, text and images.
        const pair = focusedGroup === 'links' && focusedField.key.includes('.')
          ? focusedField.key.slice(0,focusedField.key.lastIndexOf('.')+1)
          : null;
        groups[focusedGroup] = groups[focusedGroup].filter(function(field) {
          return field.key === focusedField.key || !!(pair && field.key.startsWith(pair));
        });
      }
    }
    let html = visibleKinds.map(function(kind) {
      return '<section class="te-inspector-group" aria-label="' + titles[kind] + '">' +
        '<div class="te-inspector-group__head"><h3>' + titles[kind] + '</h3></div>' +
        groups[kind].map(function(field) { return renderField(section, field); }).join('') +
        '</section>';
    }).join('');

    const settings = currentSettings();
    if (settings.length) {
      const byGroup = {};
      settings.forEach(function(field) {
        const group = field.group || 'layout';
        if (!byGroup[group]) byGroup[group] = [];
        byGroup[group].push(field);
      });
      // Native contextual groups, not a nested generic CSS inventory card.
      // Advanced motion/responsive/visibility controls remain accessible
      // without consuming the initial editing viewport.
      const settingOrder = ['layout', 'spacing', 'surface', 'appearance', 'media', 'typography'];
      const settingGroups = Object.keys(byGroup).sort(function(a, b) {
        const ai = settingOrder.indexOf(String(a).toLowerCase());
        const bi = settingOrder.indexOf(String(b).toLowerCase());
        if (ai === -1 && bi === -1) return String(a).localeCompare(String(b));
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
      });
      if (focusedField && fieldKind(focusedField) === 'content' && byGroup.typography) {
        settingGroups.splice(settingGroups.indexOf('typography'),1);
        settingGroups.unshift('typography');
      }
      html += settingGroups.map(function(group) {
        const title = group === 'typography' ? 'Typography' : humanize(group);
        const advanced = /^(motion|responsive|visibility|advanced)$/i.test(group);
        const fields = byGroup[group].map(function(field) {
          const hasOverride = cmsGetPath(section.content, field.key) !== undefined;
          return renderField(section, field) + (field.designStyle && hasOverride
            ? '<button type="button" class="te-reset-style" data-reset-style="' + cmsEscapeAttr(field.key) + '" title="Restore original theme value">Reset</button>'
            : '');
        }).join('');
        if (advanced) return '<details class="te-inspector-group te-inspector-group--advanced"><summary>' + cmsEscapeHtml(title) + '</summary>' + fields + '</details>';
        return '<section class="te-inspector-group" aria-label="' + cmsEscapeAttr(title) + '"><div class="te-inspector-group__head"><h3>' + cmsEscapeHtml(title) + '</h3></div>' + fields + '</section>';
      }).join('');
    }

    // Advanced, section-only CSS belongs to the section. Never add this
    // disclosure to a selected button, heading, image or block inspector.
    if (!focusedField && !activeBlockId) {
      const css = section.content?.__editor?.customCss || '';
      html += '<details class="te-inspector-group te-inspector-group--advanced te-section-css">' +
        '<summary>Custom CSS</summary>' +
        '<label for="te-section-css-input">This section only</label>' +
        '<textarea id="te-section-css-input" data-section-css rows="7" maxlength="8000" spellcheck="false" ' +
        'placeholder=".heading { color: #ffffff; }">' + cmsEscapeHtml(css) + '</textarea>' +
        '<p class="te-section-css-feedback" data-section-css-feedback role="status"></p></details>';
    }
    return html;
  }

  function validateSectionCss(source) {
    if (typeof source !== 'string' || source.length > 8000) return 'CSS must be under 8 KB.';
    if (/@import\b|@font-face\b|url\s*\(|expression\s*\(|behavior\s*:|-moz-binding|<\/style|[\x00-\x08\x0b\x0e-\x1f]/i.test(source))
      return 'Remote resources and CSS imports are not supported.';
    let depth = 0;
    for (const char of source) {
      if (char === '{') depth++;
      if (char === '}') depth--;
      if (depth < 0 || depth > 12) return 'Check the CSS braces.';
    }
    return depth ? 'Close the CSS braces to apply.' : '';
  }

  function wireSectionCss() {
    const input = byId('te-section-css-input');
    if (!input) return;
    input.addEventListener('input', function() {
      const feedback = byId('te-inspector-body').querySelector('[data-section-css-feedback]');
      const error = validateSectionCss(input.value);
      input.setAttribute('aria-invalid', String(Boolean(error)));
      if (feedback) feedback.textContent = error;
      if (error || liveUnimported) return;
      const section = currentSection();
      if (!section) return;
      const before = structuredClone(section.content);
      if (!section.content.__editor) section.content.__editor = {};
      if (input.value) section.content.__editor.customCss = input.value;
      else delete section.content.__editor.customCss;
      if (JSON.stringify(before) === JSON.stringify(section.content)) return;
      recordFieldHistory(section, '__editor.customCss', before, structuredClone(section.content));
      markSectionDirty(section);
      scheduleLocalPreview();
    });
  }

  function renderInspector() {
    if (localShowcase && showcaseTemplate) { renderScaffoldInspector(); return; }
    if (resolveShowcase && window.AgentSamResolveStudio?.renderInspector) {
      window.AgentSamResolveStudio.renderInspector();
      return;
    }
    const section = currentSection();
    if (!section) {
      byId('te-inspector-body').innerHTML = '<div class="te-empty">Select a section or block in the page structure to begin editing.</div>';
      return;
    }
    const sectionSchema = currentSectionSchema();
    const blockMeta = currentBlockMeta();
    const blockSchema = currentBlockSchema();
    const sectionLabel = (sectionSchema && sectionSchema.label) || humanize(section.key);
    const focusedSchema = activeFieldKey && !blockMeta ? currentSchema().find(function(field) { return field.key === activeFieldKey; }) : null;
    const focusedTitle = focusedSchema && (/heading|headline|title/i.test(focusedSchema.key) && !/subheadline|subtitle|subheading/i.test(t = blockMeta
      ? ((blockSchema && blockSchema.label) || humanize(blockMeta.templateKey || blockMeta.id))
      : (focusedTitle || sectionLabel);
    byId('te-inspector-subtitle').textContent = blockMeta
      ? sectionLabel + ' · ' + humanize(blockMeta.templateKey || blockMeta.id)
      : ((pageData && pageData.title) || humanize(slug)) + ' · ' + sectionLabel;
    byId('te-section-status').textContent = section.status || 'draft';
    byId('te-section-status').className = 'te-badge' + (section.status === 'published' ? ' is-published' : '');

    const panel = byId('te-inspector-body');
    panel.classList.toggle('te-source-document', Boolean(host && window.__agentsamCmsSourceHost));
    panel.innerHTML = (liveUnimported
      ? '<div class="te-source-review"><strong>Live page preview</strong><p>This storefront layout has not been opened as an editable CMS draft. Nothing has been modified. Select <b>Start editing page</b> above the preview to create a private draft first.</p></div>'
      : '') + (blockMeta
      ? '<button type="button" class="te-inspector-parent" id="te-inspector-parent">← ' + cmsEscapeHtml(sectionLabel) + '</button>'
      : '') + renderInspectorGroups(section);
    byId('te-inspector-parent')?.addEventListener('click', function() {
      selectSection(section.key, null, false, sectionOwner(section));
    });
    wireFields();
    wireLinkPickers();
    wireSectionCss();
    // These minimal toolbar actions are real field-style overrides: they use
    // the same preview, undo, draft save and reset pipeline as typography.
    panel.querySelectorAll('[data-inline-style-key]').forEach(function(button) {
      button.addEventListener('click', function() {
        const key = button.dataset.inlineStyleKey;
        const styleField = fieldByKey(key);
        if (!styleField || liveUnimported) return;
        const current = cmsGetPath(currentSection()?.content || {}, key);
        setFieldValue(styleField, String(current) === button.dataset.inlineStyleValue ? 'inherit' : button.dataset.inlineStyleValue);
        renderInspector();
      });
    });
    panel.querySelectorAll('[data-reset-style]').forEach(function(button) {
      button.addEventListener('click',function() {
        const field=fieldByKey(button.dataset.resetStyle);
        if(!field)return;
        setFieldValue(field,undefined);
        renderInspector();
      });
    });
    paintGeneratedSettings(panel, section);
    if (liveUnimported) {
      panel.querySelectorAll('input, textarea, select, button:not(#te-inspector-parent)').forEach(function(control) { control.disabled = true; });
    }

    if (activeFieldKey) {
      requestAnimationFrame(function() {
        const node = panel.querySelector('[data-field-key="' + CSS.escape(activeFieldKey) + '"]');
        if (!node) return;
        const disclosure = node.closest('details');
        if (disclosure) disclosure.open = true;
        node.classList.add('is-selected');
        node.scrollIntoView({ block: 'nearest' });
      });
    }
  }


  function paintGeneratedSettings(panel, section) {
    const generatedSettings = section.content && section.content.__editor && section.content.__editor.generatedSettings;
    if (!generationInspector || !generatedSettings) return;
    const host = document.createElement('div');
    host.id = 'te-generated-settings';
    const schema=section.content.__editor.generatedSettingsSchema || {};
    generationInspector.renderGeneratedSettings(host, generatedSettings, schema);
    panel.appendChild(host);
    const wrapper = generationPreviewWrapper() || { style: { setProperty() {} }, dataset: {} };
    generationInspector.bindGeneratedSettings(host, wrapper, {onChange:function(key,value) {
      if(liveUnimported)return;
      section.content[key]=value;
      section.content.__editor.generatedSettings[key]=value;
      activeFieldKey=key;
      markSectionDirty(section);
      scheduleLocalPreview();
    }},schema);
  }

  function beginGenerating() {
    const tree = byId('te-tree');
    if (generationInspector && tree) generationInspector.insertGeneratingNode(tree);
  }

  function endGenerating() {
    const tree = byId('te-tree');
    if (generationInspector && tree) generationInspector.removeGeneratingNode(tree);
  }
  function wireFields() {
    document.querySelectorAll('[data-field-input]').forEach(function(input) {
      input.addEventListener('focus', function() {
        activeFieldKey = input.dataset.fieldInput;
        // The visual selection, not the inspector input, anchors miniAgentSam.
        byId('te-selected-path').textContent = (activeSectionOwner === 'site' ? 'Global' : slug) + ' / ' + activeSectionKey + ' / ' + activeFieldKey;
        highlightPreviewSelection();
        closeAgentProposal();
      });
      input.addEventListener('input', function() {
        const field = fieldByKey(input.dataset.fieldInput);
        if (!field) return;
        activeFieldKey = field.key;
        if (field.type === 'json') {
          try {
            setFieldValue(field, JSON.parse(input.value));
            input.removeAttribute('aria-invalid');
          } catch {
            input.setAttribute('aria-invalid', 'true');
            setNote('Enter valid structured data before saving this field.', 'error');
          }
          return;
        }
        setFieldValue(field, input.value);
        syncMediaPreview(field.key, input.value);
      });
      input.addEventListener('change', function() {
        const field = fieldByKey(input.dataset.fieldInput);
        if (!field) return;
        activeFieldKey = field.key;
        if (field.type === 'json') {
          try {
            setFieldValue(field, JSON.parse(input.value));
            input.removeAttribute('aria-invalid');
          } catch {
            input.setAttribute('aria-invalid', 'true');
            setNote('Invalid structured data. Your prior value was preserved.', 'error');
          }
          return;
        }
        setFieldValue(field, input.value);
      });
    });

    document.querySelectorAll('[data-boolean-field]').forEach(function(button) {
      button.addEventListener('click', function() {
        const field = fieldByKey(button.dataset.booleanField);
        if (!field) return;
        const next = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(next));
        activeFieldKey = field.key;
        setFieldValue(field, next);
      });
    });

    document.querySelectorAll('[data-range-field]').forEach(function(range) {
      const key = range.dataset.rangeField;
      const number = document.querySelector('[data-number-pair="' + CSS.escape(key) + '"]');
      function apply(value) {
        const field = fieldByKey(key);
        if (!field) return;
        range.value = value;
        if (number) number.value = value;
        activeFieldKey = key;
        setFieldValue(field, value);
      }
      range.addEventListener('input', function() { apply(range.value); });
      if (number) number.addEventListener('input', function() { apply(number.value); });
    });

    document.querySelectorAll('[data-color-field]').forEach(function(picker) {
      const key = picker.dataset.colorField;
      const text = document.querySelector('[data-color-text="' + CSS.escape(key) + '"]');
      function apply(value) {
        const field = fieldByKey(key);
        if (!field) return;
        if (/^#[0-9a-f]{6}$/i.test(value)) picker.value = value;
        if (text && text.value !== value) text.value = value;
        activeFieldKey = key;
        setFieldValue(field, value);
      }
      picker.addEventListener('input', function() { apply(picker.value); });
      if (text) text.addEventListener('change', function() { apply(text.value.trim()); });
    });

    document.querySelectorAll('[data-rich-field]').forEach(function(editor) {
      editor.addEventListener('input', function() {
        const field = fieldByKey(editor.dataset.richField);
        t = blockMeta
      ? ((blockSchema && blockSchema.label) || humanize(blockMeta.templateKey || blockMeta.id))
      : (focusedTitle || sectionLabel);
    byId('te-inspector-subtitle').textContent = blockMeta
      ? sectionLabel + ' · ' + humanize(blockMeta.templateKey || blockMeta.id)
      : ((pageData && pageData.title) || humanize(slug)) + ' · ' + sectionLabel;
    byId('te-section-status').textContent = section.status || 'draft';
    byId('te-section-status').className = 'te-badge' + (section.status === 'published' ? ' is-published' : '');

    const panel = byId('te-inspector-body');
    panel.classList.toggle('te-source-document', Boolean(host && window.__agentsamCmsSourceHost));
    panel.innerHTML = (liveUnimported
      ? '<div class="te-source-review"><strong>Live page preview</strong><p>This storefront layout has not been opened as an editable CMS draft. Nothing has been modified. Select <b>Start editing page</b> above the preview to create a private draft first.</p></div>'
      : '') + (blockMeta
      ? '<button type="button" class="te-inspector-parent" id="te-inspector-parent">← ' + cmsEscapeHtml(sectionLabel) + '</button>'
      : '') + renderInspectorGroups(section);
    byId('te-inspector-parent')?.addEventListener('click', function() {
      selectSection(section.key, null, false, sectionOwner(section));
    });
    wireFields();
    wireLinkPickers();
    wireSectionCss();
    // These minimal toolbar actions are real field-style overrides: they use
    // the same preview, undo, draft save and reset pipeline as typography.
    panel.querySelectorAll('[data-inline-style-key]').forEach(function(button) {
      button.addEventListener('click', function() {
        const key = button.dataset.inlineStyleKey;
        const styleField = fieldByKey(key);
        if (!styleField || liveUnimported) return;
        const current = cmsGetPath(currentSection()?.content || {}, key);
        setFieldValue(styleField, String(current) === button.dataset.inlineStyleValue ? 'inherit' : button.dataset.inlineStyleValue);
        renderInspector();
      });
    });
    panel.querySelectorAll('[data-reset-style]').forEach(function(button) {
      button.addEventListener('click',function() {
        const field=fieldByKey(button.dataset.resetStyle);
        if(!field)return;
        setFieldValue(field,undefined);
        renderInspector();
      });
    });
    paintGeneratedSettings(panel, section);
    if (liveUnimported) {
      panel.querySelectorAll('input, textarea, select, button:not(#te-inspector-parent)').forEach(function(control) { control.disabled = true; });
    }

    if (activeFieldKey) {
      requestAnimationFrame(function() {
        const node = panel.querySelector('[data-field-key="' + CSS.escape(activeFieldKey) + '"]');
        if (!node) return;
        const disclosure = node.closest('details');
        if (disclosure) disclosure.open = true;
        node.classList.add('is-selected');
        node.scrollIntoView({ block: 'nearest' });
      });
    }
  }


  function paintGeneratedSettings(panel, section) {
    const generatedSettings = section.content && section.content.__editor && section.content.__editor.generatedSettings;
    if (!generationInspector || !generatedSettings) return;
    const host = document.createElement('div');
    host.id = 'te-generated-settings';
    const schema=section.content.__editor.generatedSettingsSchema || {};
    generationInspector.renderGeneratedSettings(host, generatedSettings, schema);
    panel.appendChild(host);
    const wrapper = generationPreviewWrapper() || { style: { setProperty() {} }, dataset: {} };
    generationInspector.bindGeneratedSettings(host, wrapper, {onChange:function(key,value) {
      if(liveUnimported)return;
      section.content[key]=value;
      section.content.__editor.generatedSettings[key]=value;
      activeFieldKey=key;
      markSectionDirty(section);
      scheduleLocalPreview();
    }},schema);
  }

  function beginGenerating() {
    const tree = byId('te-tree');
    if (generationInspector && tree) generationInspector.insertGeneratingNode(tree);
  }

  function endGenerating() {
    const tree = byId('te-tree');
    if (generationInspector && tree) generationInspector.removeGeneratingNode(tree);
  }
  function wireFields() {
    document.querySelectorAll('[data-field-input]').forEach(function(input) {
      input.addEventListener('focus', function() {
        activeFieldKey = input.dataset.fieldInput;
        // The visual selection, not the inspector input, anchors miniAgentSam.
        byId('te-selected-path').textContent = (activeSectionOwner === 'site' ? 'Global' : slug) + ' / ' + activeSectionKey + ' / ' + activeFieldKey;
        highlightPreviewSelection();
        closeAgentProposal();
      });
      input.addEventListener('input', function() {
        const field = fieldByKey(input.dataset.fieldInput);
        if (!field) return;
        activeFieldKey = field.key;
        if (field.type === 'json') {
          try {
            setFieldValue(field, JSON.parse(input.value));
            input.removeAttribute('aria-invalid');
          } catch {
            input.setAttribute('aria-invalid', 'true');
            setNote('Enter valid structured data before saving this field.', 'error');
          }
          return;
        }
        setFieldValue(field, input.value);
        syncMediaPreview(field.key, input.value);
      });
      input.addEventListener('change', function() {
        const field = fieldByKey(input.dataset.fieldInput);
        if (!field) return;
        activeFieldKey = field.key;
        if (field.type === 'json') {
          try {
            setFieldValue(field, JSON.parse(input.value));
            input.removeAttribute('aria-invalid');
          } catch {
            input.setAttribute('aria-invalid', 'true');
            setNote('Invalid structured data. Your prior value was preserved.', 'error');
          }
          return;
        }
        setFieldValue(field, input.value);
      });
    });

    document.querySelectorAll('[data-boolean-field]').forEach(function(button) {
      button.addEventListener('click', function() {
        const field = fieldByKey(button.dataset.booleanField);
        if (!field) return;
        const next = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(next));
        activeFieldKey = field.key;
        setFieldValue(field, next);
      });
    });

    document.querySelectorAll('[data-range-field]').forEach(function(range) {
      const key = range.dataset.rangeField;
      const number = document.querySelector('[data-number-pair="' + CSS.escape(key) + '"]');
      function apply(value) {
        const field = fieldByKey(key);
        if (!field) return;
        range.value = value;
        if (number) number.value = value;
        activeFieldKey = key;
        setFieldValue(field, value);
      }
      range.addEventListener('input', function() { apply(range.value); });
      if (number) number.addEventListener('input', function() { apply(number.value); });
    });

    document.querySelectorAll('[data-color-field]').forEach(function(picker) {
      const key = picker.dataset.colorField;
      const text = document.querySelector('[data-color-text="' + CSS.escape(key) + '"]');
      function apply(value) {
        const field = fieldByKey(key);
        if (!field) return;
        if (/^#[0-9a-f]{6}$/i.test(value)) picker.value = value;
        if (text && text.value !== value) text.value = value;
        activeFieldKey = key;
        setFieldValue(field, value);
      }
      picker.addEventListener('input', function() { apply(picker.value); });
      if (text) text.addEventListener('change', function() { apply(text.value.trim()); });
    });

    document.querySelectorAll('[data-rich-field]').forEach(function(editor) {
      editor.addEventListener('input', function() {
        const field = fieldByKey(editor.dataset.richField);
        if (!field) return;
        activeFieldKey = field.key;
        setFieldValue(field, editor.innerHTML);
      });
    });

    document.querySelectorAll('[data-rich-toolbar]').forEach(function(toolbar) {
      toolbar.querySelectorAll('[data-rich-command]').forEach(function(button) {
        button.addEventListener('click', function() {
          const command = button.dataset.richCommand;
          const editor = toolbar.nextElementSibling;
          if (!editor) return;
          editor.focus();
          let value = null;
          if (command === 'createLink') value = prompt('Link URL') || null;
          if (command !== 'createLink' || value) document.execCommand(command, false, value);
          editor.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    });

    document.querySelectorAll('[data-resource-field]').forEach(function(select) {
      hydrateResourceSelect(select);
      select.addEventListener('change', function() {
        const field = fieldByKey(select.dataset.resourceField);
        if (!field) return;
        activeFieldKey = field.key;
        setFieldValue(field, select.value);
      });
    });

    document.querySelectorAll('[data-pick-media]').forEach(function(button) {
      button.addEventListener('click', function() { openMediaPicker(button.dataset.pickMedia); });
    });

    document.querySelectorAll('[data-undo-media]').forEach(function(button) {
      button.addEventListener('click', function() { undoMediaValue(button.dataset.undoMedia); });
    });
    document.querySelectorAll('[data-upload-media]').forEach(function(input) {
      input.addEventListener('change', async function() {
        if (!input.files || !input.files.length) return;
        await uploadMediaIntoField(input.dataset.uploadMedia, Array.from(input.files));
        input.value = '';
      });
    });

    document.querySelectorAll('[data-media-drop]').forEach(function(zone) {
      const fieldKey = zone.dataset.mediaDrop;
      ['dragenter', 'dragover'].forEach(function(type) {
        zone.addEventListener(type, function(event) {
          event.preventDefault();
          zone.classList.add('is-over');
        });
      });
      ['dragleave', 'drop'].forEach(function(type) {
        zone.addEventListener(type, function(event) {
          event.preventDefault();
          zone.classList.remove('is-over');
        });
      });
      zone.addEventListener('drop', async function(event) {
        const files = Array.from((event.dataTransfer && event.dataTransfer.files) || []);
        if (!files.length) return;
        await uploadMediaIntoField(fieldKey, files.slice(0, 1));
      });
    });
  }

  async function hydrateResourceSelect(select) {
    const type = select.dataset.resourceType;
    const field = fieldByKey(select.dataset.resourceField);
    const section = currentSection();
    const current = field && section ? valueForField(section, field) : '';

    try {
      let options = [];
      if (type === 'product') {
        if (!resourceCache.products) {
          const data = await adminFetch('/api/admin/products');
          resourceCache.products = (data.products || []).map(function(product) {
            return { value: product.slug || String(product.id), label: product.title || product.slug };
          });
        }
        options = resourceCache.products;
      } else if (type === 'collection') {
        if (!resourceCache.collections) {
          const data = await adminFetch('/api/store/collections');
          resourceCache.collections = (data.collections || []).map(function(collection) {
            return { value: collection.slug || String(collection.id), label: collection.title || collection.slug };
          });
        }
        options = resourceCache.collections;
      } else if (type === 'variant' && field && field.productKey) {
        const productSlug = cmsGetPath(section.content, field.productKey);
        if (productSlug) {
          const cacheKey = 'variants:' + productSlug;
          if (!resourceCache[cacheKey]) {
            const data = await adminFetch('/api/store/products/' + encodeURIComponent(productSlug));
            resourceCache[cacheKey] = (data.variants || []).map(function(variant) {
              const label = [variant.title, variant.size, variant.color, variant.sku].filter(Boolean).join(' · ');
              return { value: variant.sku || String(variant.id), label: label || String(variant.id) };
            });
          }
          options = resourceCache[cacheKey];
        }
      }

      const emptyLabel = type === 'variant' && field && !field.productKey ? 'Enter variant in schema' : 'None';
      select.innerHTML = '<option value="">' + emptyLabel + '</option>' + options.map(function(option) {
        return '<option value="' + cmsEscapeAttr(option.value) + '"' + (String(option.value) === String(current) ? ' selected' : '') + '>' + cmsEscapeHtml(option.label) + '</option>';
      }).join('');
    } catch (error) {
      select.innerHTML = '<option value="' + cmsEscapeAttr(String(current || '')) + '">' + cmsEscapeHtml(current ? String(current) : 'Unable to load options') + '</option>';
    }
  }

  function syncMediaPreview(fieldKey, value) {
    const zone = document.querySelector('[data-media-drop="' + CSS.escape(fieldKey) + '"]');
    if (!zone) return;
    const preview = zone.querySelector('.te-media-preview');
    const field = fieldByKey(fieldKey);
    const isModel = field?.type === 'model3d' || /\.(glb|gltf|usdz)(\?|$)/i.test(String(value));
    const isVideo = !isModel && (field?.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(String(value)));
    const isImage = !isModel && !isVideo && /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(String(value));
    if (value && isVideo) preview.innerHTML = '<video src="' + cmsEscapeAttr(value) + '" muted playsinline></video>';
    else if (value && isImage) preview.innerHTML = '<img src="' + cmsEscapeAttr(value) + '" alt="">';
    else if (value && isModel) preview.innerHTML = '<div class="te-media-empty" role="status">3D model selected</div>';
    else preview.innerHTML = '<div class="te-media-empty">' + (value ? 'Media selected' : 'Drop media here or choose from library') + '</div>';
    const openLink = zone.querySelector('[data-view-original]');
    if (openLink) {
      const href = viewableMediaHref(value);
      openLink.hidden = !href;
      if (href) openLink.href = href;
      else openLink.removeAttribute('href');
    }
  }

  function mediaUndoKey(fieldKey) {
    const section = currentSection();
    return section ? sectionOwner(section) + ':' + section.key + ':' + fieldKey : '';
  }

  function setMediaValue(fieldKey, url) {
    const section = currentSection();
    if (!section || !url) return;
    const prior = cmsGetPath(section.content, fieldKey) || '';
    if (prior === url) return;
    const key = mediaUndoKey(fieldKey);
    if (key && !mediaUndo.has(key)) mediaUndo.set(key, prior);
    cmsSetPath(section.content, fieldKey, url);
    // Replacing a photo from a selected card should keep the entire card
    // inspector visible (including its destination and text controls).
    if (!activeBlockId) activeFieldKey = fieldKey;
    markSectionDirty(section);
    renderInspector();
    scheduleLocalPreview();
    closeMediaPicker();
    setNote('Media selected. Review the preview; Save draft to persist the change.', 'success');
  }

  function undoMediaValue(fieldKey) {
    const section = currentSection();
    const key = mediaUndoKey(fieldKey);
    if (!section || !mediaUndo.has(key)) return;
    const previous = mediaUndo.get(key);
    mediaUndo.delete(key);
    cmsSetPath(section.content, fieldKey, previous);
    if (!activeBlockId) activeFieldKey = fieldKey;
    markSectionDirty(section);
    renderInspector();
    scheduleLocalPreview();
    setNote('Previous media restored in this draft. Save draft to persist.', 'success');
  }

  async function uploadMediaIntoField(fieldKey, files) {
    if (!files.length) return;
    const zone = document.querySelector('[data-media-drop="' + CSS.escape(fieldKey) + '"]');
    const preview = zone?.querySelector('.te-media-preview');
    const feedback = zone?.querySelector('[data-media-feedback]');
    const previousMarkup = preview?.innerHTML || '';
    let temporaryUrl = null;
    if (preview && files[0].type.startsWith('image/')) {
      temporaryUrl = URL.createObjectURL(files[0]);
      const img = document.createElement('img');
      img.src = temporaryUrl;
      img.alt = 'Selected file preview — not uploaded';
      preview.replaceChildren(img);
    }
    if (feedback) { feedback.classList.remove('is-error'); feedback.textContent = 'Preview only — uploading. No draft change has been saved.'; }
    try {
      const assets = await uploadFiles(files);
      const asset = assets[0];
      if (!asset?.url) throw new Error('The upload returned no usable media URL.');
      setMediaValue(fieldKey, asset.url);
    } catch (error) {
      if (preview?.isConnected) preview.innerHTML = previousMarkup;
      if (feedback?.isConnected) { feedback.classList.add('is-error'); feedback.textContent = error.message || String(error); }
      setNote(error.message || String(error), 'error');
      setSaveState('Upload failed', 'error');
    } finally {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    }
  }

  // The live HTML is the source of truth for a route not yet imported into CMS.
  // Never replace it with registry fixtures before extracting real fields.
  function captureLiveSource() {
    if (!liveUnimported || !pageData) return false;
    let doc;
    try { doc = byId('theme-preview').contentDocument; } catch { return false; }
    if (!doc || doc.documentElement?.getAttribute('data-cms-page') !== slug) {
      setNote('The live preview identity does not match this page; import cancelled.', 'error');
      return false;
    }
    const sections = [];
    let count = 0;
    for (const section of pageData.sections || []) {
      const region = Array.from(doc.querySelectorAll('[data-cms-section]')).find(function(node) {
        return node.dataset.cmsSection === section.key && !node.closest('[data-cms-scope="site"]');
      });
      const schema = window.SECTION_SCHEMAS?.[slug]?.[section.key];
      if (!region || !schema) continue;
      const controls = Array.from(region.querySelectorAll('[data-cms]'));
      const content = structuredClone(section.content || {});
      const editableFields = [...(schema.fields || [])];
      // Repeatable card/block content belongs to the same section document.
      // Extract the live cards instead of preserving stale registry fixtures.
      for (const block of content.__editor?.blocks || []) {
        const template = (schema.blocks || []).find(function(item) { return item.key === block.templateKey; });
        if (!template) continue;
        for (const field of template.fields || []) {
          editableFields.push({ ...field, key: block.id + '.' + field.key });
        }
      }
      let matched = 0;
      for (const field of editableFields) {
        let el = controls.find(function(node) {
          const value = node.dataset.cms || '';
          return value === field.key || value === section.key + '.' + field.key;
        });
        if (!el && field.key.endsWith('.href')) {
          const alias = field.key.slice(0, -5) + '.label';
          el = controls.find(function(node) { return node.dataset.cms === alias; });
        }
        if (!el) continue;
        let value = '';
        if (field.key.endsWith('.href') || field.type === 'link') {
          value = el.getAttribute('href') || el.closest('a')?.getAttribute('href') || '';
        } else if (field.type === 'media' || field.type === 'video' || field.type === 'model3d' || field.media) {
          value = el.getAttribute('src') || el.querySelector('img,video,source')?.getAttribute('src') || '';
        } else {
          const clone = el.cloneNode(true);
          clone.querySelectorAll('[aria-hidden="true"],svg').forEach(function(node) { node.remove(); });
          clone.querySelectorAll('br').forEach(function(node) { node.replaceWith('\n'); });
          value = String(clone.textContent || '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
        }
        if (!value) continue;
        cmsSetPath(content, field.key, value);
        matched += 1;
      }
      if (matched) {
        content.__editor = { ...(content.__editor || {}), source: 'live-storefront' };
        sections.push({ ...section, content, status: 'live', __ownerSlug: slug });
        count += matched;
      }
    }
    if (!sections.length) {
      setNote('This live route has no CMS-marked editable sections; nothing was imported.', 'error');
      return false;
    }
    liveCapturedSections = sections.map(function(section) { return structuredClone(section); });
    pageData.sections = sections; // in-memory read-only inspection; no server mutation or draft save
    if (!sections.some(function(section) { return section.key === activeSectionKey; })) {
      activeSectionKey = sections[0].key;
      activeSectionOwner = slug;
    }
    liveSourceCaptured = true;
    discoverUnmanagedSections();
    byId('te-save').textContent = 'Save';
    byId('te-preview-label').textContent = 'Live storefront — ' + sections.length + ' editable regions';
    renderTree();
    renderInspector();
    // No existing page row: creating a new private draft cannot overwrite merchant
    // work. Do it automatically after verified same-origin source extraction.
    if (!liveExistingDraft && !host) {
      byId('te-import-live').hidden = true;
      setNote('Opening a private working draft from ' + count + ' existing storefront fields…');
      void importLiveSource({ automatic: true });
    } else {
      byId('te-import-live').hidden = false;
      byId('te-import-live').textContent = 'Review source reconciliation';
      setNote('Existing CMS work was found and preserved. Review any source reconciliation before replacing private content.');
    }
    return true;
  }

  // A published legacy page can have more real HTML regions than D1 rows.
  // Stage ONLY absent, registered sections through the existing server API.
  // No re-seeding, no overwriting legacy rows, and no automatic publish.
  function reviewContentChange(title, description, approveText) {
    return new Promise(function(resolve) {
      const dialog = document.createElement('dialog');
      dialog.className = 'te-review-dialog';
      dialog.innerHTML = '<div class="te-review-content"><span class="te-review-kicker">CMS draft operation</span><h2></h2><p></p><div class="te-review-actions"><button type="button" data-cancel>Keep current page</button><button type="button" data-approve></button></div></div>';
      dialog.querySelector('h2').textContent = title;
      dialog.querySelector('p').textContent = description;
      dialog.querySelector('[data-approve]').textContent = approveText;
      let complete = false;
      function finish(accepted) {
        if (complete) return;
        complete = true;
        dialog.close();
        dialog.remove();
        resolve(accepted);
      }
      dialog.querySelector('[data-cancel]').addEventListener('click', function() { finish(false); });
      dialog.querySelector('[data-approve]').addEventListener('click', function() { finish(true); });
      dialog.addEventListener('cancel', function(event) { event.preventDefault(); finish(false); });
      document.body.append(dialog);
      dialog.showModal();
      dialog.querySelector('[data-cancel]').focus();
    });
  }

  async function stageMissingSourceSections() {
    if (!missingSourceSections.length || liveUnimported) return false;
    if (dirty) {
      setNote('Save or discard your current edits before staging source sections.', 'error');
      return false;
    }
    const names = missingSourceSections.slice();
    if (!(await reviewContentChange('Add existing page sections', names.length + ' source-backed sections will be staged in a private CMS draft. Existing content and the published storefront will not be replaced.', 'Add to draft'))) return false;
    const button = byId('te-import-live');
    button.disabled = true;
    setSaveState('Staging');
    try {
      const schema = window.SECTION_SCHEMAS?.[slug] || {};
      const ordering = Object.entries(schema)
        .sort(function(a,b) { return Number(a[1]?.sortOrder ?? 0) - Number(b[1]?.sortOrder ?? 0); })
        .map(function(item) { return item[0]; });
      for (const key of names) {
        if (!Object.prototype.hasOwnProperty.call(schema, key)) throw new Error('Unregistered section: ' + key);
        await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/sections', {
          method: 'POST',
          body: JSON.stringify({ templateKey: key, toIndex: ordering.indexOf(key) })
        });
      }
      missingSourceSections = [];
      setDirty(false);
      await loadPage();
      setNote(names.length + ' real source sections staged in CMS drafts. Review the preview and publish only when ready.', 'success');
      return true;
    } catch (error) {
      setNote('Staging stopped. Refresh to inspect any completed drafts: ' + (error.message || error), 'error');
      return false;
    } finally {
      button.disabled = false;
      setSaveState('Draft');
    }
  }

  async function importLiveSource({ automatic = false } = {}) {
    if (importingLiveSource) return false;
    if (!liveUnimported || !liveSourceCaptured) {
      setNote('Wait for the real storefront preview before importing.', 'error');
      return false;
    }
    if (liveExistingDraft) {
      if (automatic) return false; // Existing work must never be replaced automatically.
      if (!(await reviewContentChange('Review source reconciliation', 'The existing CMS draft contains sections that will be archived in R2 and replaced by ' + liveCapturedSections.length + ' sections from the live storefront. The published website will not change. This operation is separate from Save and Publish.', 'Replace private draft'))) return false;
    }
    importingLiveSource = true;
    const button = byId('te-import-live');
    button.disabled = true;
    setSaveState('Importing');
    try {
      await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/import-live', {
        method: 'POST',
        body: JSON.stringify({ mode: liveExistingDraft ? 'reconcile' : 'create', sections: liveCapturedSections.map(function(section) {
          return { key: section.key, content: section.content, expected_version: Number(section.version ?? 0) };
        }) })
      });
      liveUnimported = false;
      liveExistingDraft = false;
      liveSourceCaptured = false;
      liveCapturedSections = [];
      dirtySections.clear();
      setDirty(false);
      await loadPage();
      setNote(automatic ? 'Private working draft ready. The storefront has not been published.' : 'Existing storefront content imported into an unpublished CMS draft.', 'success');
      return true;
    } catch (error) {
      setNote(error.message || String(error), 'error');
      setSaveState('Import failed', 'error');
      if (automatic) {
        button.hidden = false;
        button.textContent = 'Retry opening private draft';
      }
      return false;
    } finally {
      importingLiveSource = false;
      button.disabled = false;
    }
  }

  function applyThemeSettingsPreview() {
    let doc;
    try { doc = byId('theme-preview')?.contentDocument; } catch { return; }
    if (!doc?.head) return;
    const brand = ownerSections('site').find(section => section.key === 'brand');
    if (!themeStyles) return;
    const current = host?.adapter?.getThemeSettings?.() || brand?.content?.__editor?.themeSettings;
    const css = themeStyles.renderThemeSettings(current);
    const href = themeStyles.themeFontCssHref(current);
    let fontLink = doc.getElementById('cms-merchant-fonts');
    if (href) {
      if (!fontLink) {
        fontLink = doc.createElement('link');
        fontLink.id = 'cms-merchant-fonts';
        fontLink.rel = 'stylesheet';
        doc.head.appendChild(fontLink);
      }
      if (fontLink.href !== href) fontLink.href = href;
    } else fontLink?.remove();
    let style = doc.getElementById('cms-merchant-theme-style');
    if (!css) { style?.remove(); return; }
    if (!style) {
      style = doc.createElement('style');
      style.id = 'cms-merchant-theme-style';
      doc.head.appendChild(style);
    }
    style.textContent = css;
  }

  function pushLocalPreview() {
    applyThemeSettingsPreview();
    if (host) { void refreshPreview(); return; }
    const iframe = byId('theme-preview');
    if (!iframe?.contentWindow || !pageData) return;

    if (selectedTheme !== 'heuristic') {
      const runtime = window.ThemeStudioPreview;
      if (!runtime || !runtime.render) return;
      let html;
      try {
        html = runtime.render(selectedTheme, pageData, siteData);
        if (!html || !html.includes('<main>')) throw new Error('Theme renderer returned no page');
      } catch (error) {
        setNote('This theme preview could not render: ' + (error.message || String(error)), 'error');
        iframe.srcdoc = '<!doctype html><html><body style="font:16px system-ui;padding:40px;color:#333"><h2>Preview unavailable</h2><p>The selected theme did not provide a valid page renderer.</p></body></html>';
        return;
      }
      iframe.srcdoc = html;
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
      byId('te-open-tab').href = previewBlobUrl;
      byId('te-preview-label').textContent = 'Preview — ' + ((pageData && pageData.title) || humanize(slug));
      return;
    }

    iframe.contentWindow.postMessage({
      type: 'fnf-cms-preview',
      slug: slug,
      sections: (pageData.sections || []).map(function(section) {
        return { key: section.key, sort_order: section.sort_order, status: section.status, content: section.content || {} };
      }),
      siteSections: (siteData?.sections || []).map(function(section) {
        return { key: section.key, sort_order: section.sort_order, status: section.status, content: section.content || {} };
      })
    }, location.origin);
  }

  function scheduleLocalPreview() {
    clearTimeout(patchTimer);
    patchTimer = setTimeout(pushLocalPreview, 80);
  }

  function selectedAgentResource() {
    const section = currentSection();
    if (!section) return null;
    const field = activeFieldKey ? fieldByKey(activeFieldKey) : null;
    const value = field ? valueForField(section, field) : null;
    const owner = sectionOwner(section);
    return {
      type: 'section', id: section.key, sectionKey: section.key,
      siteId: host?.siteId || window.cmsActiveSiteId || params.get('site_id'),
      ownerSlug: owner, page: pageRoute(slug) || '/' + slug,
      surface: 'theme-studio', label: (currentSectionSchema()?.label || humanize(section.key)),
      fieldKey: field?.key || null,
      currentValue: typeof value === 'string' ? value : null,
      sectionVersion: Number(section.version || 0),
      linked: !liveUnimported,
    };
  }

  function mayApplyAgentText(selection) {
    if (!selection?.fieldKey || liveUnimported || selection.ownerSlug !== activeSectionOwner || selection.sectionKey !== activeSectionKey) return false;
    const field = fieldByKey(selection.fieldKey);
    if (!field || ['json', 'number', 'range', 'boolean', 'media', 'video', 'link', 'product', 'collection', 'variant'].includes(field.type)) return false;
    if (/(href|url|src|image|video|color|font|size|style|css|sku)$/i.test(field.key)) return false;
    const section = currentSection();
    return Boolean(section && Number(section.version || 0) === selection.sectionVersion &&
      String(valueForField(section, field) ?? '') === String(selection.currentValue ?? ''));
  }

  function presentAgentProposal(proposal) {
    pendingAgentProposal = proposal;
    const isEditable = mayApplyAgentText(proposal.selection);
    const field = proposal.selection?.fieldKey ? fieldByKey(proposal.selection.fieldKey) : null;
    const note = isEditable
      ? 'Review or adjust this proposal in the Side Assistant. Apply changes the local CMS draft only;textContent = 'Violet · ' + (showcaseTemplate?.title || 'Home page') + ' · local UI preview';
      return;
    }
    if (host) {
      try {
        const preview = await host.adapter.resolvePreview(slug, pageData);
        if (preview?.html) {
          byId('theme-preview').removeAttribute('src');
          byId('theme-preview').srcdoc = preview.html;
          byId('te-preview-label').textContent = 'Draft preview — ' + ((pageData && pageData.title) || humanize(slug));
          byId('te-open-tab').removeAttribute('href');
        }
      } catch (error) {
        byId('theme-preview').srcdoc = '<!doctype html><html><body style="font:16px system-ui;padding:32px"><h2>Preview unavailable</h2><p>' + cmsEscapeHtml(error.message || String(error)) + '</p></body></html>';
        setNote(error.message || String(error), 'error');
      }
      return;
    }
    if (selectedTheme !== 'heuristic') {
      pushLocalPreview();
      return;
    }
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }
    const route = pageRoute(slug);
    if (!route) {
      byId('theme-preview').srcdoc = '<!doctype html><html><body style="font:16px system-ui;padding:32px"><h2>No storefront route connected</h2><p>This CMS page exists, but needs a public rendering/publishing adapter before it can be previewed.</p></body></html>';
      byId('te-open-tab').removeAttribute('href');
      byId('te-preview-label').textContent = 'CMS document — no public route';
      return;
    }
    if (/^https:\/\//.test(route) && new URL(route).origin !== window.location.origin) {
      const preview = new URL(route);
      preview.searchParams.set('_', String(Date.now()));
      byId('theme-preview').removeAttribute('srcdoc');
      byId('theme-preview').src = preview.href;
      byId('te-open-tab').href = route;
      byId('te-preview-label').textContent = 'Published storefront — ' + preview.hostname;
      return;
    }
    const separator = route.indexOf('?') >= 0 ? '&' : '?';
    byId('theme-preview').removeAttribute('srcdoc');
    byId('theme-preview').src = route + separator + (liveUnimported ? '_=' : 'preview=1&_=' ) + Date.now();
    byId('te-open-tab').href = liveUnimported ? route : route + separator + 'preview=1';
    byId('te-preview-label').textContent = slug === 'bridge-fly'
      ? 'Aviation scene · authenticated preview only'
      : liveUnimported ? 'Live storefront — source inspection' : 'Draft preview — ' + ((pageData && pageData.title) || humanize(slug));
  }

  function schedulePreview() {
    if (!autoPreview) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshPreview, 220);
  }

  async function loadPage() {
    // Invalidate asynchronous catalog reads across page/workspace changes.
    // Tenant-specific product/collection links must never be cached globally.
    merchantLinkCatalogVersion += 1;
    merchantLinkCatalog = null;
    merchantLinkCatalogRequest = null;
    undoHistory.length = 0;
    redoHistory.length = 0;
    lastHistoryTime = 0;
    updateUndoRedo();
    closeMiniAgentSam();
    miniAnchor = null;
    closeAgentProposal();
    setNote('');
    setSaveState('Loading');
    try {
      await loadCmsRegistry();
      const localDraft=resolveShowcase && !host?.capabilities?.cmsWrite && window.AgentSamResolveStudio?.getDraft?.(slug);
      const results = await Promise.all([
        localDraft ? Promise.resolve({page:localDraft,seeded:false}) :
          editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug)),
        editorRequest('/api/admin/cms/pages').catch(function() { return { pages: [] }; }),
        editorRequest('/api/admin/cms/pages/site').catch(function() {
          return { page: { slug: 'site', title: 'Global', sections: [], status: 'draft' } };
        })
      ]);
      pageData = results[0].page;
      activeCmsSite = results[1]?.site || null;
      if (!host && pageData) {
        const resolvedSiteId = results[1]?.site?.id || pageData.site_id || window.cmsActiveSiteId;
        if (resolvedSiteId) window.cmsActiveSiteId = resolvedSiteId;
        window.cmsActivePageSlug = pageData.slug || slug;
        window.cmsActivePageId = pageData.slug === 'site' ? null : (pageData.id || null);
        const identityUrl = new URL(location.href);
        if (resolvedSiteId) identityUrl.searchParams.set('site_id', resolvedSiteId);
        if (window.cmsActivePageId) identityUrl.searchParams.set('page_id', window.cmsActivePageId);
        else identityUrl.searchParams.delete('page_id');
        if (pageData.slug) identityUrl.searchParams.set('slug', pageData.slug);
        history.replaceState(null, '', identityUrl);
        slug = pageData.slug || slug;
      }
      if (resolveShowcase) window.AgentSamResolveStudio?.setPage?.(pageData);
      liveUnimported = pageData.content_authority === 'storefront-html';
      missingSourceSections = Array.isArray(pageData.missing_source_sections)
        ? pageData.missing_source_sections.filter(function(key) {
          return Object.prototype.hasOwnProperty.call(window.SECTION_SCHEMAS?.[slug] || {}, key);
        })
        : [];
      liveExistingDraft = Boolean(results[0].seeded) && liveUnimported;
      liveSourceCaptured = false;
      liveCapturedSections = [];
      unmanagedLiveSections = [];
      if (liveUnimported) selectedTheme = 'heuristic';
      byId('te-import-live').hidden = Boolean(host) || (!missingSourceSections.length && !liveUnimported);
      if (!liveUnimported && missingSourceSections.length) {
        byId('te-import-live').textContent = 'Stage ' + missingSourceSections.length + ' missing sections';
      }
      byId('te-save').textContent = 'Save';
      siteData = results[2].page;
      pages = (results[1].pages || []).filter(function(page) { return page.slug !== 'site'; });
      if(resolveShowcase && !host?.capabilities?.cmsWrite)pages.push(...(window.AgentSamResolveStudio?.getDrafts?.()||[]));
      document.dispatchEvent(new CustomEvent('theme-editor:global-settings-ready'));

      (pageData.sections || []).forEach(function(section) { section.__ownerSlug = slug; });
      (siteData.sections || []).forEach(function(section) { section.__ownerSlug = 'site'; });

      if (!pages.some(function(page) { return page.slug === slug; })) pages.unshift({ slug: slug, title: pageData.title || humanize(slug) });

      const selectedStillExists = activeSectionKey && findSection(activeSectionKey, activeSectionOwner);
      if (!selectedStillExists) {
        const firstGlobal = siteData.sections?.find(function(section) {
          return section.zone === 'HEADER' || section.globalKey === 'site-header' || section.key === 'header';
        });
        activeSectionOwner = firstGlobal ? 'site' : slug;
        activeSectionKey = firstGlobal?.key || pageData.sections?.[0]?.key || null;
        activeBlockId = null;
        activeFieldKey = null;
      }

      if (activeBlockId) {
        const selectedSection = currentSection();
        const selectedBlocks = selectedSection?.content?.__editor?.blocks;
        if (!Array.isArray(selectedBlocks) || !selectedBlocks.some(function(block) { return block.id === activeBlockId; })) {
          activeBlockId = null;
          activeFieldKey = null;
        }
      }

      byId('te-page-title').textContent = currentPageLabel();
      for (const id of ['te-page-settings', 'te-manage-page']) {
        const link = byId(id);
        if (!link) continue;
        if (host) {
          link.href = '#';
          link.hidden = !host.onPageSettings;
          link.onclick = host.onPageSettings ? async function(event) {
            event.preventDefault();
            if (!dirty || await saveDraft()) host.onPageSettings(slug);
          } : null;
        } else {
          const pageQuery = new URLSearchParams({ slug });
          if (window.cmsActiveSiteId) pageQuery.set('site_id', window.cmsActiveSiteId);
          if (window.cmsActivePageId) pageQuery.set('page_id', ion();
              void switchPage(matched.slug);
              return;
            }
          }
        }
        if (!inspectionEnabled || window.__fnfGlobalInspectMode) return;
        if (event.target?.closest?.('[data-doc-menu],[data-doc-copy],[data-doc-filter]')) return;
        const target = event.target && event.target.closest && event.target.closest('[data-cms], [data-