(() => {
  const params = new URLSearchParams(location.search);
  const showcaseTheme = ['violet','resolve','plain-jane'].includes(params.get('showcase')) ? params.get('showcase') : '';
  // Packaged showcase previews are accessible inside both localhost and the
  // hosted Studio. They are deliberately read-only and must not inherit the
  // authenticated CMS write adapter until a real site is connected.
  const host = showcaseTheme ? null : (window.AgentSamThemeEditorHost || null);
  const editorRequest = host ? host.adapter.request.bind(host.adapter) : window.adminFetch;
  const violetShowcase = showcaseTheme === 'violet';
  const resolveShowcase = showcaseTheme === 'resolve';
  const journalShowcase = showcaseTheme === 'plain-jane';
  const localShowcase = Boolean(showcaseTheme);
  const showcaseDisplayName = journalShowcase ? 'Plain Jane Journal' : resolveShowcase ? 'Resolve' : 'Violet';
  let slug = host?.page || params.get('slug') || (localShowcase ? 'home' : 'shop');
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
  let device = localStorage.getItem('fnf-theme-editor-device') || 'desktop';
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
                '<button type="button" class="te-mobile-more-entry" id="te-more-settings">Theme settings</button>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-inspect" aria-pressed="true">Canvas inspection</button>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-embeds">App embeds</button>' +
                '<div class="te-mobile-more-group" role="group" aria-label="Theme previews"><span>Theme previews</span>' +
                  ((window.ThemeStudioPreview && window.ThemeStudioPreview.themes) || []).map(function(theme) {
                    return '<button type="button" class="te-mobile-more-entry" data-theme-preview="' + cmsEscapeAttr(theme.id) + '" aria-pressed="' + String(theme.id === selectedTheme) + '">' + cmsEscapeHtml(theme.name) + '</button>';
                  }).join('') + '</div>' +
                '<button type="button" class="te-mobile-more-entry" id="te-more-publish">Publish live…</button>' +
                '<button type="button" id="te-view-draft">View draft in new tab</button><button type="button" id="te-shortcuts">Keyboard shortcuts</button><div id="te-shortcuts-help" class="te-shortcuts-help" hidden>⌘S · Save<br>⌘Z · Undo<br>⌘⇧Z · Redo<br>⌘⌃1 · Sections<br>⌘⌃2 · Theme settings<br>⌘⌃3 · App embeds</div></div>',
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
      button.addEventListener('click', function() { setMobilePane('preview'); });
    });
    document.querySelectorAll('[data-sheet-expand]').forEach(function(button) {
      button.addEventListener('click', function() { setMobileSheetSize(mobileSheetSize === 'expanded' ? 'half' : mobileSheetSize === 'compact' ? 'half' : 'expanded'); });
    });
    document.querySelectorAll('[data-sheet-grip]').forEach(function(grip) {
      let start = null;
      grip.tabIndex = 0;
      grip.addEventListener('pointerdown', function(event) {
        if (!isPhoneEditor()) return;
        start = { y: event.clientY, id: event.pointerId };
        grip.setPointerCapture?.(event.pointerId);
      });
      grip.addEventListener('pointerup', function(event) {
        if (!start || start.id !== event.pointerId) return;
        const difference = event.clientY - start.y;
        start = null;
        if (difference > 65 && mobileSheetSize === 'compact') setMobilePane('preview');
        else if (difference < -55) setMobileSheetSize(mobileSheetSize === 'compact' ? 'half' : 'expanded');
        else if (difference > 25) setMobileSheetSize(mobileSheetSize === 'expanded' ? 'half' : 'compact');
      });
      grip.addEventListener('pointercancel', function() { start = null; });
      grip.addEventListener('keydown', function(event) {
        if (event.key === 'ArrowUp') { event.preventDefault(); setMobileSheetSize(mobileSheetSize === 'compact' ? 'half' : 'expanded'); }
        if (event.key === 'ArrowDown') { event.preventDefault(); if (mobileSheetSize === 'expanded') setMobileSheetSize('half'); else if (mobileSheetSize === 'half') setMobileSheetSize('compact'); else setMobilePane('preview'); }
        if (event.key === 'Escape') { event.preventDefault(); setMobilePane('preview'); }
      });
    });
    byId('te-mobile-edit-selection')?.addEventListener('click', function() {
      if (activeSectionKey) { setMobileSheetSize('half'); setMobilePane('settings'); }
      else setMobilePane('sections');
    });
    setMobileSheetSize('half');
  }

  function humanize(value) {
    return String(value || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, function(m) { return m.toUpperCase(); });
  }

  function pageRoute(pageSlug) {
    if (host) return host.pageRoutes?.[pageSlug] || null;
    // Bridge Fly is a real authored R2 scene, not a publishable storefront
    // route. Its authenticated canvas can still be previewed in this editor.
    if (pageSlug === 'bridge-fly') return '/admin/bridge-fly-preview';
    const authoritative = pages.find(function(page) { return page.slug === pageSlug; });
    if (authoritative?.live_route) return authoritative.live_route;
    if (window.PAGE_ROUTES && window.PAGE_ROUTES[pageSlug]) return window.PAGE_ROUTES[pageSlug];
    const known = fallbackPages.find(function(page) { return page.slug === pageSlug; });
    // A CMS record is not necessarily a published storefront route. Never
    // silently show the homepage as the preview for an unknown customer page.
    return known ? known.route : null;
  }


  function ownerSections(ownerSlug) {
    const doc = ownerSlug === 'site' ? siteData : pageData;
    return (doc && doc.sections) || [];
  }

  function findSection(sectionKey, ownerSlug) {
    if (!sectionKey) return null;
    const requestedOwner = ownerSlug || activeSectionOwner || slug;
    const direct = ownerSections(requestedOwner).find(function(section) { return section.key === sectionKey; });
    if (direct) return direct;
    const site = ownerSections('site').find(function(section) { return section.key === sectionKey; });
    if (site) return site;
    return ownerSections(slug).find(function(section) { return section.key === sectionKey; }) || null;
  }

  function sectionOwner(section) {
    return section && section.__ownerSlug || slug;
  }

  function dirtyRef(section) {
    return sectionOwner(section) + ':' + section.key;
  }

  function parseDirtyRef(ref) {
    const idx = String(ref).indexOf(':');
    return idx < 0 ? { owner: slug, key: String(ref) } : { owner: ref.slice(0, idx), key: ref.slice(idx + 1) };
  }

  function themeCatalog() {
    // Section ownership is independent of the theme preview selector.
    // Every supported implementation is reusable on every CMS page.
    const portable = window.ThemePortableSections?.catalog() || [];
    const registry = window.SECTION_SCHEMAS?.[slug] || {};
    const native = Object.entries(registry)
      .filter(function([key]) {
        // A legacy descriptor alone does NOT prove a renderer exists.
        // Offer native templates only after finding their rendered source
        // section in the current storefront. This works for arbitrary
        // merchant pages rather than handpicked home/shop section names.
        try {
          const doc = byId('theme-preview')?.contentDocument;
          return Boolean(doc?.querySelector(
            '[data-cms-section="' + CSS.escape(key) + '"], [data-section-id="' + CSS.escape(key) + '"]'
          ));
        } catch { return false; }
      })
      .map(function([key, definition]) {
        return { id: 'heuristic/' + key, label: definition.label || humanize(key),
          type: key, templateKey: key, source: 'heuristic', preset: 'heuristic/' + key };
      });
    return [...native, ...portable];
  }

  async function setTheme(nextTheme) {
    if (!nextTheme || nextTheme === selectedTheme) return;
    if (!installedThemeSlugs.has(nextTheme)) {
      setNote('This theme is a reference preview, not an installed CMS artifact.', 'error');
      return;
    }
    if (!host) {
      try {
        const saved = await editorRequest('/api/admin/cms/theme-selection', {
          method: 'PUT',
          body: JSON.stringify({ slug: nextTheme, expected_version: persistedThemeVersion }),
        });
        if (!saved.ok) throw new Error(saved.code || saved.error || 'Theme selection could not be saved');
        persistedThemeVersion = saved.content_version;
      } catch (error) {
        setNote('Theme selection was not saved: ' + error.message, 'error');
        await loadThemeIdentity();
        return;
      }
    }
    selectedTheme = nextTheme;
    document.querySelectorAll('[data-theme-preview]').forEach(function(button) {
      const current = button.dataset.themePreview === selectedTheme;
      button.classList.toggle('is-active', current);
      button.setAttribute('aria-pressed', String(current));
    });
    applyThemeIdentity(themeIdentity);
    closeThemeMenu();
    syncPublishCapability();
    renderTree();
    refreshPreview();
  }

  function syncPublishCapability() {
    const button = byId('te-publish');
    if (!button) return;
    if (localShowcase) {
      button.disabled = true;
      button.title = showcaseDisplayName + ' preview-only showcase — publishing is disabled';
      return;
    }
    if (host && host.adapter.capabilities?.publish === false) {
      button.disabled = true;
      button.title = 'This draft theme workspace does not publish pages directly. Publish the reviewed theme from Online Store.';
      return;
    }
    const sceneOnly = slug === 'bridge-fly';
    const previewOnly = selectedTheme !== 'heuristic' || sceneOnly;
    button.disabled = previewOnly || liveUnimported;
    button.title = sceneOnly
      ? 'Scene source preview only. A storefront publication adapter is not approved.'
      : previewOnly
        ? 'Preview only: this visual theme has not passed the publish/rollback gate.'
        : liveUnimported ? 'Import the live storefront before publishing.' : 'Publish the current CMS page and changed global sections';
  }

  function currentSection() {
    return findSection(activeSectionKey, activeSectionOwner);
  }

  function schemaForSection(section) {
    if (!section) return null;
    // Generated instances bind their precise immutable definition version;
    // a later generated revision must not rewrite an older inspector schema.
    if (section.content?.__editor?.generated) {
      const key = section.content.__editor.definitionKey;
      const version = section.content.__editor.definitionVersion;
      const def = (window.cmsRegistry?.definitions || []).find(function(entry) {
        return entry.key === key && entry.version === version && entry.kind === 'section' &&
          entry.origin === 'generated' && entry.artifact;
      });
      if (!def) return null;
      return {
        label: def.label,
        icon: 'section',
        capabilities: { edit:true,media:true,settings:true,reorder:true,duplicate:true,remove:true,blocks:false },
        fields: Object.entries(def.fields || {}).map(function([name,field]) {
          return { key:name,label:field.label || humanize(name),type:field.type || 'text' };
        }),
        blocks:[],settings:[],
      };
    }
    if (section.content?.__editor?.templateKey === 'portable') {
      return window.ThemePortableSections?.schema(section.content.__editor.themePreset) || null;
    }
    const owner = section.__ownerSlug || slug;
    const schemas = window.SECTION_SCHEMAS && window.SECTION_SCHEMAS[owner];
    if (!schemas) return null;
    if (schemas[section.key]) return schemas[section.key];
    const templateKey = section.content && section.content.__editor && section.content.__editor.templateKey;
    return templateKey && schemas[templateKey] ? schemas[templateKey] : null;
  }

  function currentSectionSchema() {
    return schemaForSection(currentSection());
  }

  function currentBlockMeta() {
    const section = currentSection();
    const blocks = section && section.content && section.content.__editor && section.content.__editor.blocks;
    if (!activeBlockId || !Array.isArray(blocks)) return null;
    return blocks.find(function(block) { return block.id === activeBlockId; }) || null;
  }

  function currentBlockSchema() {
    const sectionSchema = currentSectionSchema();
    const meta = currentBlockMeta();
    if (!sectionSchema || !meta || !Array.isArray(sectionSchema.blocks)) return null;
    return sectionSchema.blocks.find(function(block) { return block.key === meta.templateKey; }) || null;
  }

  function currentSchema() {
    const block = currentBlockSchema();
    if (activeBlockId) {
      // Never fall back to the section inspector when a block is selected.
      if (!block) return [];
      const meta = currentBlockMeta();
      const values = currentSection()?.content?.[activeBlockId] || {};
      // All schema coverage, visibility and compatible overrides belong to the
      // typed authoring engine, not ad hoc field-name rules in this UI module.
      const fields = window.cmsAuthoring?.rendererFields('block', meta?.templateKey,
        block.fields || [], values) || block.fields || [];
      return fields.map(function(field) {
        return { ...field, key: activeBlockId + '.' + field.key, blockRelativeKey: field.key };
      });
    }
    const schema = currentSectionSchema();
    return (schema && schema.fields) || (window.SECTION_FIELDS && window.SECTION_FIELDS[slug] && window.SECTION_FIELDS[slug][activeSectionKey]) || [];
  }

  function contextualStyleFields() {
    const selected = currentSchema().find(function(field) { return field.key === selectedStyleFieldKey; });
    if (!selected || !['text','rich_text','textarea','link'].includes(selected.type) &&
        !/cta|button|label|headline|title|subheadline|eyebrow|meta/i.test(selected.key)) return [];
    const prefix = '__editor.fieldStyles.' + selected.key + '.';
    const number = (key,label,group,min,max,step=1,unit='px') =>
      ({key:prefix+key,label,type:'number',min,max,step,unit,group,designStyle:true});
    const choices = (key,label,group,options) =>
      ({key:prefix+key,label,type:'select',group,options:options.map(function(value){
        return {label:value === 'inherit'?'Theme default':value,value};
      }),default:'inherit',designStyle:true});
    const keyIsAction = /cta|button|action|href|link/i.test(selected.key);
    if (keyIsAction) return [
      {key:prefix+'backgroundColor',label:'Background',type:'color',group:'button colors',designStyle:true},
      {key:prefix+'color',label:'Text',type:'color',group:'button colors',designStyle:true},
      {key:prefix+'borderColor',label:'Border',type:'color',group:'button colors',designStyle:true},
      number('borderWidth','Border width','size',0,10),
      number('borderRadius','Corner radius','size',0,160),
      number('paddingTop','Vertical padding','size',0,160),
      number('paddingLeft','Horizontal padding','size',0,160),
    ];
    return [
      number('fontSize','Font size','typography',8,180),
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
      return /^(layout|spacing|appearance|media)$/.test(field.group || '');
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

  function schedulePrivateAutosave() {
    clearTimeout(autosaveTimer);
    if (!dirty || liveUnimported || autosaveFailed || localShowcase) return;
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
      save.disabled = localShowcase || liveUnimported || (!dirty && !hasEditedThisSession);
      save.classList.toggle('is-dirty', dirty);
      save.setAttribute('aria-label', dirty ? 'Save unsaved draft changes' : 'Save draft — latest changes already saved');
      save.title = dirty ? 'Save draft changes (⌘S)' : 'Draft is saved — Save again if needed (⌘S)';
    }
    if (localShowcase) setSaveState(showcaseDisplayName + ' · local preview only');
    else if (liveUnimported) setSaveState('Preview only');
    else if (dirty) setSaveState('Unsaved changes', 'dirty');
    else setSaveState('Saved', 'saved');
    if (dirty) schedulePrivateAutosave();
    else clearTimeout(autosaveTimer);
  }

  const storefrontMenu = [
    { id: 'home', title: 'Home page', icon: 'home', page: 'home' },
    { id: 'products', title: 'Products', icon: 'product', children: [
      { title: 'Default product', template: 'product' },
      { title: 'Products list', template: 'products-list' },
    ], resource: 'products' },
    { id: 'collections', title: 'Collections', icon: 'collection', children: [
      { title: 'Default collection', template: 'collection' },
      { title: 'Collections list', template: 'collections-list' },
    ], resource: 'collections' },
    { id: 'gift-card', title: 'Gift card', icon: 'gift', template: 'gift-card' },
    { id: 'cart', title: 'Cart', icon: 'cart', template: 'cart' },
    { id: 'checkout', title: 'Checkout & customer accounts', icon: 'checkout', template: 'checkout' },
    { id: 'pages', title: 'Pages', icon: 'page', resource: 'pages' },
    { id: 'blogs', title: 'Blogs', icon: 'blog', children: [
      { title: 'Default blog', template: 'blog' },
    ] },
    { id: 'posts', title: 'Blog posts', icon: 'post', children: [
      { title: 'Default article', template: 'article' },
    ] },
    { id: 'search', title: 'Search', icon: 'search', template: 'search' },
    { id: 'password', title: 'Password', icon: 'lock', template: 'password' },
    { id: '404', title: '404 page', icon: 'gift', template: '404' },
    { id: 'metaobject', title: 'Create metaobject template', icon: 'plus', template: 'metaobject', create: true },
  ];
  if (!localShowcase) {
    storefrontMenu.unshift({
      id:'starter-kits',title:'Browse packaged templates',icon:'collection',children:[
        {title:'Plain Jane · Blog home',preset:'plain-jane',page:'journal-home'},
        {title:'Plain Jane · Article',preset:'plain-jane',page:'journal-the-art-of-slow-travel'},
        {title:'Resolve · Product page',preset:'resolve',page:'resolve-product'},
        {title:'Resolve · Collection',preset:'resolve',page:'resolve-collection'},
        {title:'Violet · Campaign page',preset:'violet',page:'home'}
      ]
    });
    storefrontMenu.find(item=>item.id==='blogs').children.push(
      {title:'Plain Jane journal archive',preset:'plain-jane',page:'journal-home'});
    storefrontMenu.find(item=>item.id==='posts').children.push(
      {title:'Plain Jane article',preset:'plain-jane',page:'journal-the-art-of-slow-travel'});
    storefrontMenu.find(item=>item.id==='products').children.push(
      {title:'Resolve product page',preset:'resolve',page:'resolve-product'});
    storefrontMenu.find(item=>item.id==='collections').children.push(
      {title:'Resolve collection page',preset:'resolve',page:'resolve-collection'});
  }
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
    storefrontMenu.find(item=>item.id==='blogs').children=[{title:'Editorial archive',page:'resolve-blogs'}];
    storefrontMenu.find(item=>item.id==='posts').children=[{title:'Editorial article',page:'resolve-article'}];
    const cart = storefrontMenu.find(item => item.id === 'cart'); cart.page = 'resolve-cart';
    const password = storefrontMenu.find(item => item.id === 'password'); password.page = 'resolve-password';
    storefrontMenu.splice(storefrontMenu.findIndex(item => item.id === 'checkout') + 1, 0, {
      id: 'customer', title: 'Customer accounts', icon: 'checkout', children: [
        { title: 'Sign in', page: 'resolve-sign-in' },
        { title: 'Sign up', page: 'resolve-sign-up' },
        { title: 'Account overview', page: 'resolve-account' },
        { title: 'Order history', page: 'resolve-orders' },
        { title: 'Saved pieces', page: 'resolve-saved' },
        { title: 'Profile & preferences', page: 'resolve-profile' },
      ],
    });
  }
  if (journalShowcase) {
    storefrontMenu.splice(0,storefrontMenu.length,
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
    );
  }
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
      // Route to a real packaged preview within Theme Studio instead of
      // presenting an empty, disconnected, ad-hoc page inspector.
      const journal=['article','blog','page','contact'].includes(template);
      const params=new URLSearchParams({
        showcase:journal?'plain-jane':'resolve',
        slug:journal?(template==='article'?'journal-the-art-of-slow-travel':'journal-home')
          :(['product','products'].includes(template)?'resolve-product':'resolve-collection')
      });
      window.location.assign('/admin/theme-editor?'+params.toString());
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
      (formTemplate ? '<label>Button label<input type="text" maxlength="60" data-scaffold-setting="buttonLabel" value="' + cmsEscapeAttr(data.buttonLabel) + '"></label>' +
      '<div class="te-picker-heading">Form fields · local only</div><div data-scaffold-fields>' +
      data.fields.map((label,index) => '<div class="te-scaffold-field"><input aria-label="Field ' + (index+1) + '" data-scaffold-field="' + index + '" value="' + cmsEscapeAttr(label) + '">' +
      '<button type="button" data-scaffold-remove="' + index + '" aria-label="Remove field ' + (index+1) + '">×</button></div>').join('') +
      '</div><button type="button" class="te-scaffold-add" data-scaffold-add>+ Add form field</button>' : '') +
      '<div class="te-scaffold-readonly">UI preview only. No Stripe, forms, or D1 records are changed.</div></div>';
    panel.querySelectorAll('[data-scaffold-setting]').forEach(input => input.addEventListener('input', () => {
      if (!showcaseTemplate) return;
      showcaseTemplate[input.dataset.scaffoldSetting] = input.value;
      if (input.dataset.scaffoldSetting === 'title') {
        byId('te-page-title').textContent = input.value || 'Untitled template';
        byId('te-tree-title').textContent = input.value || 'Untitled template';
      }
      refreshPreview();
    }));
    panel.querySelectorAll('[data-scaffold-field]').forEach(input => input.addEventListener('input', () => {
      if (!showcaseTemplate) return;
      showcaseTemplate.fields[Number(input.dataset.scaffoldField)] = input.value;
      refreshPreview();
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
        children.push(...source.filter(p => !p.slug.startsWith('resolve-') && p.slug !== 'site').map(p => ({ title: p.title || humanize(p.slug), page: p.slug })));
        if(resolveShowcase)children.push({title:'Default content page',page:'resolve-page'});
      }
      if(resolveShowcase)children.push(...(window.AgentSamResolveStudio?.getDrafts?.()||[])
        .filter(p=>p.kind===parent.id).map(p=>({title:p.title+' · Draft',page:p.slug})));
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
        'data-picker-template="' + cmsEscapeAttr(child.template || 'metaobject') + '"', child.page ? '' : 'UI scaffold', false)).join('');
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
          (!hasChildren && !page) ? 'UI scaffold' : '', hasChildren);
      }).join('');
    }
    // One search across actual authorized CMS pages, not only menu headings.
    // Preserve category browsing and do not invent templates or draft pages.
    if (needle && !parent) {
      const realPages=source.filter(p=>p.slug && match([p.title,p.slug,p.route,p.live_route].join(' '))).slice(0,30);
      if(realPages.length)html=
        '<div class="te-picker-heading">Matching CMS pages ('+realPages.length+')</div>'+
        realPages.map(p=>row(p.title||humanize(p.slug),'page',
          'data-picker-page="'+cmsEscapeAttr(p.slug)+'"',p.live_route||p.route||'',false)).join('')+
        (html?'<div class="te-picker-divider" role="separator"></div>'+html:'');
    }
    root.innerHTML = html || (resolveShowcase?
      '<div class="te-creation-empty"><strong>Nothing matches that search.</strong>'+
      '<p>Try a different keyword, or open a resource category to create a new local draft template.</p>'+
      '<button type="button" class="te-creation-primary" data-picker-clear>Explore templates</button></div>' :
      '<div class="te-empty">No matching storefront templates.</div>');
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
      window.location.assign('/admin/theme-editor?'+new URLSearchParams({showcase:preset,slug:page}).toString());
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
      const url = button.dataset.pickerResource === 'products'
        ? '/admin/product-edit?id=' + encodeURIComponent(button.dataset.resourceId) : '/admin/collections';
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

  function openBlockCatalog(sectionKey, owner = slug) {
    const section = findSection(sectionKey, owner);
    const schema = section && schemaForSection(section);
    const templates = Array.isArray(schema?.blocks) ? schema.blocks : [];
    if (!templates.length) return;
    const existingBlocks = section.content?.__editor?.blocks || [];
    const modal = document.createElement('dialog');
    modal.className = 'te-section-menu te-block-picker';
    modal.setAttribute('aria-label', 'Add block');
    modal.innerHTML = '<div class="te-section-menu__head"><div><strong>Add a block</strong>' +
      '<small>' + cmsEscapeHtml(schema.label || humanize(sectionKey)) + ' · compatible blocks</small></div>' +
      '<button type="button" class="te-tree-mini" data-close-block-catalog aria-label="Close block catalog">×</button></div>' +
      '<input class="te-section-search" data-block-search placeholder="Search available blocks" aria-label="Search blocks" autocomplete="off">' +
      '<div class="te-section-catalog" data-block-options></div>';
    const options = modal.querySelector('[data-block-options]');
    const search = modal.querySelector('[data-block-search]');
    function paint(query) {
      const needle = String(query || '').toLowerCase().trim();
      const matching = templates.filter(function(template) {
        return !needle || (template.label + ' ' + template.key + ' ' + (template.description || '')).toLowerCase().includes(needle);
      });
      const totalMax = Number(schema.guardrails?.maxBlocks || 0);
      options.innerHTML = matching.length ? matching.map(function(template) {
        const used = existingBlocks.filter(function(block) { return block.templateKey === template.key; }).length;
        const disabled = (Number.isFinite(Number(template.max)) && used >= Number(template.max)) ||
          (totalMax > 0 && existingBlocks.length >= totalMax);
        const fields = (template.fields || []).slice(0, 4);
        const sketch = '<span class="te-catalog-structure te-block-visual" aria-hidden="true">' +
          '<span class="te-catalog-structure__kicker">' + cmsEscapeHtml(template.label || template.key) + '</span>' +
          '<span class="te-block-visual__fields">' + fields.map(function(field) {
            const kind = field.type === 'media' || field.type === 'image' ? 'media' : 'text';
            return '<span class="te-block-visual__field te-block-visual__field--' + kind + '">' +
              cmsEscapeHtml(field.label || field.key || kind) + '</span>';
          }).join('') + '</span></span>';
        return '<button type="button" class="te-section-catalog-item te-section-catalog-item--visual" data-choose-block="' +
          cmsEscapeAttr(template.key) + '"' + (disabled ? ' disabled' : '') + '>' +
          '<span class="te-catalog-visual-wrap">' + sketch + '</span>' +
          '<span class="te-catalog-card-copy"><strong>' + cmsEscapeHtml(template.label || humanize(template.key)) + '</strong>' +
          '<small>' + cmsEscapeHtml(disabled ? 'Maximum blocks reached' :
            (template.description || (template.fields || []).length + ' editable fields')) +
          '</small></span></button>';
      }).join('') : '<div class="te-empty">No compatible blocks match that search.</div>';
    }
    paint('');
    modal.addEventListener('close', function() { modal.remove(); });
    modal.querySelector('[data-close-block-catalog]').addEventListener('click', function() { modal.close(); });
    modal.addEventListener('click', function(event) {
      const button = event.target.closest('[data-choose-block]');
      if (!button || button.disabled) return;
      const templateKey = button.dataset.chooseBlock;
      modal.close();
      void insertBlock(sectionKey, templateKey, owner);
    });
    search.addEventListener('input', function() { paint(search.value); });
    document.body.append(modal);
    modal.showModal();
    requestAnimationFrame(function() { search.focus(); });
  }

  function renderTree() {
    if (resolveShowcase && window.AgentSamResolveStudio?.renderSections) {
      window.AgentSamResolveStudio.renderSections();
      return;
    }
    const pageSections = ownerSections(slug);
    const siteSections = ownerSections('site');
    const header = siteSections.find(function(section) { return section.key === 'header'; });
    const footer = siteSections.find(function(section) { return section.key === 'footer'; });
    const registrySections = (window.SECTION_SCHEMAS && window.SECTION_SCHEMAS[slug]) || {};

    byId('te-tree-title').textContent = (pageData && pageData.title) || humanize(slug);
    // The original editor hid ordinary text inside generic section rows because
    // only persisted __editor.blocks could appear in the hierarchy. Expand the
    // current page on first open without undoing subsequent merchant collapses.
    if (treeExpandedForPage !== slug) {
      treeExpandedForPage = slug;
      expandedSections.clear();
      expandedMenus.clear();
      if (header) expandedSections.add('site:header');
      pageSections.forEach(function(section) { expandedSections.add(sectionOwner(section) + ':' + section.key); });
    }

    function sectionNode(section, index, group) {
      if (!section) return '';
      const owner = sectionOwner(section);
      const schema = schemaForSection(section) || {};
      const fields = schema.fields || [];
      const editor = section.content && section.content.__editor || {};
      const visible = !editor.visibility || editor.visibility.enabled !== false;
      const capabilities = schema.capabilities || {};
      const isGlobal = owner === 'site';
      const label = section.key === 'header' && isGlobal ? 'Header'
        : section.key === 'footer' && isGlobal ? 'Footer'
        : (schema.label || humanize(editor.templateKey || section.key));
      const sectionSelected = section.key === activeSectionKey && owner === activeSectionOwner;
      const blockMeta = Array.isArray(editor.blocks) ? editor.blocks : [];
      // Field nodes are selections into the EXISTING section schema, never
      // synthetic persisted blocks. Selecting them uses the same inspector,
      // save, undo and revision pipeline as direct canvas selection.
      const fieldRows = fields.filter(function(field) {
        const kind = String(field.type || '').toLowerCase();
        if (section.key === 'header' && !section.content?.announcementEnabled && /^announcement(?:Text|Href)$/.test(field.key)) return false;
        return ['text','textarea','richtext','rich-text','media','image','video','link','url'].includes(kind);
      }).map(function(field) {
        const key = String(field.key);
        const value = cmsGetPath(section.content || {}, key);
        const isMedia = /^(media|image|video)$/.test(String(field.type).toLowerCase());
        const isHeading = /heading|headline|title/i.test(key) && !/subheadline|subtitle|subheading/i.test(key);
        const kind = isMedia ? 'media' : isHeading ? 'heading' : /url|href|link/i.test(key) ? 'link' : 'text';
        const label = /meta[0-9]+/i.test(key) ? 'Text' : isHeading ? 'Heading' : isMedia ? (field.label || 'Image') : /subheadline|subtitle/i.test(key) ? 'Text' : (field.label || humanize(key));
        const preview = (typeof value === 'string' && !isMedia && !/url|href|link/i.test(key)) ? value.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
        const selected = sectionSelected && !activeBlockId && activeFieldKey === key;
        return '<div class="te-field-row' + (selected ? ' is-active' : '') + '" data-tree-field="' + cmsEscapeAttr(key) + '">' +
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
    const pageRows = insertLine(0) + pageSections.map(function(section, index) {
      return sectionNode(section, index, 'template') + insertLine(index + 1);
    }).join('');
    const headerRow = sectionNode(header, -1, 'header');
    const footerRow = sectionNode(footer, -1, 'footer');

    byId('te-tree').innerHTML =
      '<div class="te-tree-group te-tree-group--global"><div class="te-tree-group__label">Header</div>' + headerRow + '</div>' +
      '<div class="te-tree-group"><div class="te-tree-group__label">Template</div>' + pageRows +
        '<button type="button" class="te-add-section" id="te-add-section" title="Add a section to this page"><span aria-hidden="true">⊕</span> Add section</button></div>' +
      (unmanagedLiveSections.length ? '<div class="te-tree-group te-live-only"><div class="te-tree-group__label">Live-only sections · not editable yet</div>' +
        unmanagedLiveSections.map(function(region, index) {
          return '<button type="button" class="te-live-only-row" data-scroll-live="' + index + '"><span>' + icon.section + '</span><span><strong>' + cmsEscapeHtml(humanize(region.label.replaceAll('.', ' '))) + '</strong><small>Existing storefront · adapter needed</small></span></button>';
        }).join('') + '</div>' : '') +
      '<dialog class="te-section-menu" id="te-section-menu" aria-label="Add a section" hidden>' +
        '<div class="te-section-menu__head"><div><strong>Add a section</strong><small>Choose a reusable storefront component</small></div><button type="button" class="te-tree-mini" id="te-section-cancel" aria-label="Close section catalog">×</button></div>' +
        '<input class="te-section-search" id="te-section-search" placeholder="Search sections" aria-label="Search available sections" autocomplete="off">' +
        '<div class="te-section-catalog" id="te-section-catalog"></div>' +
      '</dialog>' +
      '<div class="te-tree-group te-tree-group--global"><div class="te-tree-group__label">Footer</div>' + footerRow + '</div>';

    // Draw portable catalog previews using the SAME registered renderer and
    // CSS as the storefront. Never fabricate a card for a missing renderer.
    function catalogVisual(entry) {
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

    function renderCatalog(query) {
      const needle = String(query || '').trim().toLowerCase();
      let entries = themeCatalog();
      // No fallback to arbitrary JS registry keys: without a proven
      // renderer a text-only entry would become an uneditable fake preset.
      const filtered = entries.filter(function(entry) {
        return !needle || (entry.label + ' ' + entry.type + ' ' + entry.id).toLowerCase().includes(needle);
      });
      const visualCards = filtered.map(function(entry) {
        return '<button type="button" class="te-section-catalog-item te-section-catalog-item--visual" data-catalog-template="' +
          cmsEscapeAttr(entry.templateKey) + '" data-catalog-preset="' +
          cmsEscapeAttr(entry.preset || entry.id) + '">' +
          '<span class="te-catalog-visual-wrap">' + catalogVisual(entry) + '</span>' +
          '<span class="te-catalog-card-copy"><strong>' + cmsEscapeHtml(entry.label) +
          '</strong><small>' + cmsEscapeHtml(humanize(entry.source || 'heuristic')) +
          ' · ' + cmsEscapeHtml(entry.type || entry.templateKey) + '</small></span></button>';
      }).join('');
      byId('te-section-catalog').innerHTML =
        '<button type="button" class="te-catalog-generate" data-start-section-generation>' +
        '<img src="/admin/brand/agentsam-gorilla-tiny.svg" alt="" aria-hidden="true">' +
        '<span><strong>Generate with AgentSam</strong><small>Create a reusable editable CMS section</small></span><span aria-hidden="true">↗</span></button>' +
        (filtered.length ? visualCards : '<div class="te-empty">No sections match that search.</div>');

      byId('te-section-catalog').querySelector('[data-start-section-generation]')?.addEventListener('click', function() {
        if (menu.open) menu.close();
        else menu.hidden = true;
        window.dispatchEvent(new CustomEvent('theme-editor:generate-request', { detail: { kind: 'section' } }));
      });
      byId('te-section-catalog').querySelectorAll('[data-catalog-template]').forEach(function(button) {
        button.addEventListener('click', function() {
          const insertAt = sectionInsertIndex;
          if (menu.open) menu.close();
          insertSection(button.dataset.catalogTemplate, button.dataset.catalogPreset, insertAt);
        });
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
        openBlockCatalog(button.dataset.addBlockSection, button.dataset.blockOwner || slug);
      });
    });
    byId('te-tree').querySelectorAll('[data-duplicate-block]').forEach(function(button) {
      button.addEventListener('click', function(event) {
        event.stopPropagation();
        duplicateBlock(button.dataset.blockSection, button.dataset.duplicateBlock, button.dataset.blockOwner || slug);
      });
    });
    byId('te-tree').querySelectorAll('[data-remove-block]').forEach(function(button) {
      button.addEventListener('click', function(event) {
        event.stopPropagation();
        removeBlock(button.dataset.blockSection, button.dataset.removeBlock, button.dataset.blockOwner || slug);
      });
    });

    const add = byId('te-add-section');
    const menu = byId('te-section-menu');
    function openCatalog(anchor, index) {
      sectionInsertIndex = index;
      menu.hidden = false;
      renderCatalog('');
      const rect = anchor.getBoundingClientRect();
      const width = Math.min(375, window.innerWidth - 16);
      const left = Math.max(8, Math.min(window.innerWidth - width - 8,
        window.innerWidth - rect.right >= width + 8 ? rect.right + 8 : rect.left));
      menu.style.left = left + 'px';
      const height = Math.min(515, window.innerHeight - 24);
      menu.style.top = Math.max(8, Math.min(rect.top, window.innerHeight - height - 8)) + 'px';
      if (typeof menu.show === 'function' && !menu.open) menu.show();
      requestAnimationFrame(function() { byId('te-section-search')?.focus(); });
    }
    add?.addEventListener('click', function() { openCatalog(add, pageSections.length); });
    byId('te-tree').querySelectorAll('[data-insert-at]').forEach(function(button) {
      button.addEventListener('click', function() { openCatalog(button, Number(button.dataset.insertAt)); });
    });
    menu.addEventListener('close', function() {
      menu.hidden = true;
      sectionInsertIndex = null;
    });
    byId('te-section-cancel')?.addEventListener('click', function() {
      if (menu.open) menu.close();
      else { menu.hidden = true; sectionInsertIndex = null; }
    });
    byId('te-section-search')?.addEventListener('input', function(event) { renderCatalog(event.target.value); });
    // Preserve old atlas links without maintaining another source editor.
    // This opens the one canonical cross-theme section catalog in place.
    if (new URLSearchParams(location.search).get('catalog') === 'revise') {
      add?.click();
      const search = byId('te-section-search');
      if (search) {
        search.value = 'revise';
        renderCatalog('revise');
      }
      const cleaned = new URL(location.href);
      cleaned.searchParams.delete('catalog');
      history.replaceState(null, '', cleaned);
    }

    let draggedKey = null;
    byId('te-tree').querySelectorAll('.te-tree-row[draggable="true"]').forEach(function(row) {
      row.addEventListener('dragstart', function() { draggedKey = row.dataset.sectionKey; row.classList.add('is-dragging'); });
      row.addEventListener('dragend', function() {
        draggedKey = null;
        row.classList.remove('is-dragging');
        byId('te-tree').querySelectorAll('.is-drop-target').forEach(function(node) { node.classList.remove('is-drop-target'); });
      });
      row.addEventListener('dragover', function(event) {
        if (!draggedKey || draggedKey === row.dataset.sectionKey) return;
        event.preventDefault();
        row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave', function() { row.classList.remove('is-drop-target'); });
      row.addEventListener('drop', function(event) {
        event.preventDefault();
        row.classList.remove('is-drop-target');
        if (!draggedKey || draggedKey === row.dataset.sectionKey) return;
        moveSection(draggedKey, Number(row.dataset.index));
      });
    });

    let draggedBlock = null;
    byId('te-tree').querySelectorAll('.te-block-row[draggable="true"]').forEach(function(row) {
      row.addEventListener('dragstart', function(event) {
        event.stopPropagation();
        draggedBlock = { id: row.dataset.blockId, section: row.dataset.blockSection, owner: row.dataset.blockOwner || slug };
        row.classList.add('is-dragging');
      });
      row.addEventListener('dragend', function(event) {
        event.stopPropagation();
        draggedBlock = null;
        row.classList.remove('is-dragging');
        byId('te-tree').querySelectorAll('.te-block-row.is-drop-target').forEach(function(node) { node.classList.remove('is-drop-target'); });
      });
      row.addEventListener('dragover', function(event) {
        if (!draggedBlock || draggedBlock.owner !== (row.dataset.blockOwner || slug) || draggedBlock.section !== row.dataset.blockSection || draggedBlock.id === row.dataset.blockId) return;
        event.preventDefault();
        event.stopPropagation();
        row.classList.add('is-drop-target');
      });
      row.addEventListener('dragleave', function() { row.classList.remove('is-drop-target'); });
      row.addEventListener('drop', function(event) {
        if (!draggedBlock || draggedBlock.owner !== (row.dataset.blockOwner || slug) || draggedBlock.section !== row.dataset.blockSection || draggedBlock.id === row.dataset.blockId) return;
        event.preventDefault();
        event.stopPropagation();
        row.classList.remove('is-drop-target');
        moveBlock(draggedBlock.section, draggedBlock.id, Number(row.dataset.blockIndex), draggedBlock.owner);
      });
    });
  }

  // Source paths remain CMS data, never the default merchant-facing field.
  // Only open conventional web/file paths, never executable protocols or
  // protocol-relative links supplied by imported content.
  function viewableMediaHref(value) {
    const source = String(value || '').trim();
    return /^(https?:\/\/|\/(?!\/))/i.test(source) ? source : '';
  }

  // Internal destinations come from the merchant's actual CMS page and
  // storefront inventory. Never present fabricated collection/product links.
  let merchantLinkCatalog = null;
  let merchantLinkCatalogRequest = null;
  let merchantLinkCatalogVersion = 0;
  async function loadMerchantLinkCatalog() {
    if (merchantLinkCatalog) return merchantLinkCatalog;
    if (merchantLinkCatalogRequest) return merchantLinkCatalogRequest;
    const version = merchantLinkCatalogVersion;
    merchantLinkCatalogRequest = Promise.allSettled([
      adminFetch('/api/store/collections'),
      adminFetch('/api/store/products'),
    ]).then(function(results) {
      const links = [];
      const collections = results[0].status === 'fulfilled' ? results[0].value?.collections : [];
      const products = results[1].status === 'fulfilled' ? results[1].value?.products : [];
      for (const collection of Array.isArray(collections) ? collections : []) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(String(collection.slug || ''))) continue;
        links.push({label:String(collection.title || collection.slug),href:'/shop/collections/' + encodeURIComponent(collection.slug),group:'Collections'});
      }
      for (const product of Array.isArray(products) ? products : []) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(String(product.slug || ''))) continue;
        links.push({label:String(product.title || product.slug),href:'/products/' + encodeURIComponent(product.slug),group:'Products'});
      }
      if (version === merchantLinkCatalogVersion) merchantLinkCatalog = links;
      return links;
    }).finally(function() {
      if (version === merchantLinkCatalogVersion) merchantLinkCatalogRequest = null;
    });
    return merchantLinkCatalogRequest;
  }

  function merchantPageLinks(query = '') {
    const needle = String(query).trim().toLowerCase();
    const found = new Map();
    for (const page of (host ? pages : (pages.length ? pages : fallbackPages))) {
      const href = page.live_route || page.route || pageRoute(page.slug);
      if (!href || !/^\/(?!\/)/.test(href)) continue;
      const label = String(page.title || humanize(page.slug));
      found.set(href, { label, href, group:'Pages' });
    }
    for (const item of merchantLinkCatalog || []) found.set(item.href, item);
    return [...found.values()].filter(function(item) {
      return !needle || (item.label + ' ' + item.href + ' ' + item.group).toLowerCase().includes(needle);
    });
  }

  function describeLink(value) {
    const href = String(value || '').trim();
    const match = merchantPageLinks().find(function(page) { return page.href === href; });
    return match ? match.label : href ? href : 'Select a page';
  }

  function renderLinkField(field, value, id, help) {
    const href = String(value || '');
    return '<div class="te-field te-link-field" data-field-key="' + cmsEscapeAttr(field.key) + '">' +
      '<label for="' + id + '">' + cmsEscapeHtml(field.label) + '</label>' +
      '<button id="' + id + '" type="button" class="te-link-trigger" data-link-trigger="' + cmsEscapeAttr(field.key) + '" aria-haspopup="dialog" aria-expanded="false">' +
      '<span class="te-link-trigger__name">' + cmsEscapeHtml(describeLink(href)) + '</span><span aria-hidden="true">⌄</span></button>' +
      '<div class="te-link-picker" data-link-picker="' + cmsEscapeAttr(field.key) + '" role="dialog" aria-label="Choose a link destination" hidden>' +
        '<input type="search" data-link-search placeholder="Search pages" aria-label="Search available pages" autocomplete="off">' +
        '<div data-link-results class="te-link-results"></div>' +
        '<details class="te-link-external"><summary>External URL or anchor</summary>' +
        '<input type="text" data-link-external placeholder="https://example.com or #section" aria-label="External URL or anchor" value="' + cmsEscapeAttr(href) + '">' +
        '<button type="button" data-link-apply="' + cmsEscapeAttr(field.key) + '">Use link</button></details>' +
        '<button type="button" class="te-link-clear" data-link-clear="' + cmsEscapeAttr(field.key) + '">Remove link</button>' +
      '</div>' + help + '</div>';
  }

  function wireLinkPickers() {
    const panel = byId('te-inspector-body');
    let open = null;
    const close = function() {
      if (!open) return;
      open.hidden = true;
      panel.querySelector('[data-link-trigger="' + CSS.escape(open.dataset.linkPicker) + '"]')?.setAttribute('aria-expanded', 'false');
      open = null;
    };
    const choose = function(key, href) {
      const field = fieldByKey(key);
      if (!field || liveUnimported) return;
      if (href && !(/^(?:\/(?!\/)|#|https:\/\/|mailto:|tel:)/i.test(href))) {
        const message = panel.querySelector('[data-link-picker="' + CSS.escape(key) + '"] [data-link-external]');
        message?.setAttribute('aria-invalid', 'true');
        return;
      }
      setFieldValue(field, href);
      renderInspector();
    };
    const paint = function(picker, search = '') {
      const rows = merchantPageLinks(search);
      let lastGroup = '';
      picker.querySelector('[data-link-results]').innerHTML = rows.length
        ? rows.map(function(item) {
          const heading = item.group !== lastGroup
            ? '<div class="te-link-group-label">' + cmsEscapeHtml(item.group) + '</div>' : '';
          lastGroup = item.group;
          return heading + '<button type="button" data-link-choice="' + cmsEscapeAttr(item.href) + '"><strong>' + cmsEscapeHtml(item.label) +
            '</strong><small>' + cmsEscapeHtml(item.href) + '</small></button>';
        }).join('')
        : '<p class="te-link-empty">No matching destinations</p>';
    };
    panel.querySelectorAll('[data-link-trigger]').forEach(function(trigger) {
      trigger.addEventListener('click', function() {
        const picker = panel.querySelector('[data-link-picker="' + CSS.escape(trigger.dataset.linkTrigger) + '"]');
        if (!picker) return;
        if (open === picker) { close(); return; }
        close();
        picker.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        open = picker;
        paint(picker);
        if (!merchantLinkCatalog) {
          const results = picker.querySelector('[data-link-results]');
          if (results) results.insertAdjacentHTML('beforeend','<p class="te-link-empty" data-link-loading>Loading collections and products…</p>');
          void loadMerchantLinkCatalog().then(function() {
            if (!picker.isConnected) return;
            const current = cmsGetPath(currentSection()?.content || {}, trigger.dataset.linkTrigger);
            const caption = trigger.querySelector('.te-link-trigger__name');
            if (caption) caption.textContent = describeLink(current);
            if (!picker.hidden) paint(picker, picker.querySelector('[data-link-search]')?.value);
          });
        }
        picker.querySelector('[data-link-search]')?.focus();
      });
    });
    panel.querySelectorAll('[data-link-picker]').forEach(function(picker) {
      const key = picker.dataset.linkPicker;
      picker.querySelector('[data-link-search]')?.addEventListener('input', function(event) { paint(picker,event.target.value); });
      picker.addEventListener('click', function(event) {
        const choice = event.target.closest('[data-link-choice]');
        if (choice) choose(key,choice.dataset.linkChoice);
      });
      picker.querySelector('[data-link-apply]')?.addEventListener('click',function() {
        choose(key,picker.querySelector('[data-link-external]').value.trim());
      });
      picker.querySelector('[data-link-clear]')?.addEventListener('click',function() { choose(key,''); });
      picker.addEventListener('keydown',function(event) { if (event.key === 'Escape') { event.stopPropagation(); close(); picker.previousElementSibling?.focus(); } });
    });
  }

  function renderField(section, field) {
    const value = valueForField(section, field);
    const safeValue = cmsEscapeAttr(typeof value === 'object' ? JSON.stringify(value) : String(value));
    const id = 'te-field-' + section.key + '-' + field.key.replace(/[^a-zA-Z0-9_-]/g, '-');
    const help = field.help ? '<div class="te-field-help">' + cmsEscapeHtml(field.help) + '</div>' : '';

    if (field.type === 'media' || field.type === 'video' || field.type === 'model3d' || field.media) {
      const isModel = field.type === 'model3d' || /\.(glb|gltf|usdz)(\?|$)/i.test(String(value));
      const isImage = !isModel && field.type !== 'video' && /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(String(value));
      const isVideo = field.type === 'video' || /\.(mp4|mov|webm)(\?|$)/i.test(String(value));
      let preview = '<div class="te-media-empty">' + (value ? 'Media selected' : 'Drop media here or choose from library') + '</div>';
      if (value && isImage) preview = '<img src="' + safeValue + '" alt="">';
      if (value && isVideo && !isModel) preview = '<video src="' + safeValue + '" muted playsinline></video>';
      if (value && isModel) preview = '<div class="te-media-empty" role="status">3D model selected</div>';
      return '<div class="te-field" data-field-key="' + cmsEscapeAttr(field.key) + '"><label>' + cmsEscapeHtml(field.label) + '</label>' +
        '<div class="te-media-drop" data-media-drop="' + cmsEscapeAttr(field.key) + '"><div class="te-media-preview">' + preview +
        '</div><div class="te-media-actions"><button type="button" class="te-media-button" data-pick-media="' + cmsEscapeAttr(field.key) + '">Choose</button>' +
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
      const semanticKey = String(field.blockRelativeKey || field.key);
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
      const settingGroups = Object.keys(byGroup);
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
    const focusedTitle = focusedSchema && (/heading|headline|title/i.test(focusedSchema.key) && !/subheadline|subtitle|subheading/i.test(focusedSchema.key)
      ? 'Heading' : /meta[0-9]+|subheadline|subtitle/i.test(focusedSchema.key) ? 'Text' : focusedSchema.label);
    byId('te-mobile-edit-title').textContent = focusedTitle || (blockMeta ? 'Edit block' : sectionLabel);
    byId('te-mobile-selection-label').textContent = focusedTitle || (blockMeta ? 'Block' : sectionLabel);
    byId('te-inspector-title').textContent = blockMeta
      ? ((blockSchema && blockSchema.label) || humanize(blockMeta.templateKey || blockMeta.id))
      : (focusedTitle || sectionLabel);
    byId('te-inspector-subtitle').textContent = blockMeta
      ? sectionLabel + ' · ' + blockMeta.id
      : ((pageData && pageData.title) || humanize(slug)) + ' · ' + section.key;
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
        await adminFetch('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/sections', {
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
      await adminFetch('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/import-live', {
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

  function pushLocalPreview() {
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
      ? 'Review or adjust this proposal in the Side Assistant. Apply changes the local CMS draft only; Save draft remains explicit.'
      : 'Review this guidance in the Side Assistant. Nothing has been changed or published.';

    if (typeof window.presentAgentsamProposal !== 'function') {
      setNote('AgentSam Side Assistant is unavailable on this page.', 'error');
      return;
    }

    window.presentAgentsamProposal({
      source: 'miniAgentSam · proposal',
      title: field ? 'Proposed ' + humanize(field.blockRelativeKey || field.key) : 'Theme Studio proposal',
      text: proposal.text,
      note,
      context: {
        page: '/admin/theme-editor',
        slug,
        selected_resource: {
          type: field ? 'cms_field' : 'cms_section',
          id: proposal.selection.sectionKey,
          section: proposal.selection.sectionKey,
          field: proposal.selection.fieldKey || undefined,
          surface: 'theme-studio',
        },
      },
      onApply: isEditable ? function(value) {
        if (!pendingAgentProposal || !mayApplyAgentText(pendingAgentProposal.selection)) {
          setNote('This field changed or is no longer editable. Request a fresh proposal.', 'error');
          return false;
        }
        const target = fieldByKey(pendingAgentProposal.selection.fieldKey);
        const nextValue = String(value || '').trim();
        if (!target || !nextValue) {
          setNote('Proposed text is empty. Nothing was changed.', 'error');
          return false;
        }
        setFieldValue(target, nextValue);
        pendingAgentProposal = null;
        renderInspector();
        setNote('AgentSam proposal applied locally. Review the preview and choose Save draft when ready.', 'success');
        return true;
      } : undefined,
    });
  }

  function closeAgentProposal() {
    pendingAgentProposal = null;
  }

  function closeMiniAgentSam() {
    miniAgentSamSelectionTick += 1;
    miniAgentSam?.close();
    miniAgentSamVisible = false;

  }

  async function openMiniAgentSam() {
    if(localShowcase) {
      // The SDK preview has no authenticated AgentSam API. Do not open an
      // unusable composer or surface a failed-module banner over the inspector.
      setNote('AgentSam AI requires a connected workspace. Local section, app and theme controls remain editable.','info');
      return;
    }
    const selection = selectedAgentResource();
    if (!selection) { setNote('Select a section or editable field before asking AgentSam.'); return; }
    const tick = ++miniAgentSamSelectionTick;
    if (!miniAgentSamPromise) {
      miniAgentSamPromise = import('/admin/js/theme-editor-mini-agentsam.mjs')
        .then(function(module) { return module.createThemeEditorMiniAgentSam({
          onProposal: presentAgentProposal,
          onClose: function() { miniAgentSamVisible = false; },
          positionBounds: function() {
            // The composer must stay in the *actual storefront viewport* on
            // both desktop and phone, not float above the editor toolbar.
            const frame = byId('theme-preview');
            const canvas = document.querySelector('.theme-studio .te-preview-stage');
            const rect = frame?.getBoundingClientRect();
            const pane = canvas?.getBoundingClientRect();
            const tabs = byId('te-mobile-pane-switch');
            if (!rect || !pane || rect.width < 100 || rect.height < 80) return null;
            return {
              left: Math.max(rect.left, pane.left) + 7,
              top: Math.max(rect.top, pane.top) + 7,
              right: Math.min(rect.right, pane.right) - 7,
              bottom: Math.min(rect.bottom, pane.bottom,
                isPhoneEditor() ? (tabs?.getBoundingClientRect().top ?? rect.bottom) : rect.bottom) - 7,
            };
          },
        }); })
        .catch(function(error) { miniAgentSamPromise = null; throw error; });
    }
    try {
      miniAgentSam = await miniAgentSamPromise;
      if (tick !== miniAgentSamSelectionTick) return;
      // Anchor to the visible CMS inspector rather than the browser's generic annotation mode.
      miniAgentSam.select(selection, selectedMiniBounds);
      miniAgentSamVisible = true;
      // Preview layout/fonts can settle after its first selection paint.
      // Recompute using the current DOM rather than leaving the overlay
      // fixed over the Heading when the iframe shifts independently.
      requestAnimationFrame(function() {
        if (tick === miniAgentSamSelectionTick) miniAgentSam?.reposition?.();
      });
      setTimeout(function() {
        if (tick === miniAgentSamSelectionTick) miniAgentSam?.reposition?.();
      }, 180);

    } catch (error) {
      // The hosting page may have navigated away while dynamic import ran.
      // Selection failures must never block the underlying editor.
      if (document?.getElementById?.('te-note'))
        setNote('miniAgentSam could not load: ' + (error.message || String(error)), 'error');
    }
  }

  function generationSelectionContext() {
    const section = currentSection();
    const block = currentBlockMeta();
    return {
      page: slug,
      owner: activeSectionOwner,
      theme: selectedTheme,
      section_key: activeSectionKey,
      section_type: section?.content?.__editor?.templateKey || section?.key || null,
      block_id: activeBlockId,
      block_type: block?.templateKey || null,
      field_key: activeFieldKey,
      generated: Boolean(section?.content?.__editor?.generated),
      version: section?.version ?? 0,
    };
  }

  function generationPreviewWrapper() {
    let doc;
    try { doc = byId('theme-preview')?.contentDocument; } catch { return null; }
    if (!doc || !activeSectionKey) return null;
    const sectionNode = doc.querySelector(
      '[data-cms-section="' + CSS.escape(activeSectionKey) + '"], [data-section-id="' + CSS.escape(activeSectionKey) + '"]'
    );
    if (!sectionNode) return null;
    if (activeBlockId) {
      const blockNode = sectionNode.querySelector('[data-cms-block="' + CSS.escape(activeBlockId) + '"]');
      if (blockNode) return blockNode.querySelector('[data-agentsam-block]') || blockNode;
    }
    return sectionNode.querySelector('[data-agentsam-block]') || sectionNode;
  }

  function publishGenerationSelection() {
    document.dispatchEvent(new CustomEvent('theme-editor:selection', {
      detail: generationSelectionContext(),
    }));
  }

  function scrollPreviewToSelection(sectionKey, fieldKey, blockId) {
    // A tree item belongs to the *iframe's* scrolling page, not the admin
    // document. Scroll there immediately so the inspector and contextual
    // composer refer to something the merchant can actually see.
    const frame = byId('theme-preview');
    let doc;
    try { doc = frame?.contentDocument; } catch { return false; }
    if (!doc) return false;
    const wrapper = doc.querySelector(
      '[data-cms-section="' + CSS.escape(sectionKey) + '"], [data-section-id="' + CSS.escape(sectionKey) + '"]'
    );
    if (!wrapper) return false;
    const selectedBlock = blockId && wrapper.querySelector('[data-cms-block="' + CSS.escape(blockId) + '"]');
    const selectedField = fieldKey && (
      (selectedBlock || wrapper).querySelector('[data-cms="' + CSS.escape(fieldKey) + '"]') ||
      wrapper.querySelector('[data-cms="' + CSS.escape(fieldKey) + '"]')
    );
    const target = selectedField || selectedBlock || wrapper;
    try {
      const view = frame.contentWindow;
      const top = target.getBoundingClientRect().top;
      const current = view?.scrollY || doc.scrollingElement?.scrollTop || 0;
      if (view?.scrollTo && Number.isFinite(top)) {
        // Leave space above the selected control and, when possible, below it
        // for miniAgentSam. No host-page scrolling or CMS write is involved.
        view.scrollTo({ top: Math.max(0, current + top - 88), behavior: 'instant' });
      } else {
        target.scrollIntoView?.({ behavior: 'instant', block: 'start' });
      }
    } catch {
      try { target.scrollIntoView?.({ behavior: 'auto', block: 'start' }); } catch {}
    }
    return true;
  }

  function selectSection(sectionKey, fieldKey, scrollPreview, ownerSlug) {
    const section = findSection(sectionKey, ownerSlug);
    if (!section) return;
    activeSectionKey = sectionKey;
    activeSectionOwner = sectionOwner(section);
    activeBlockId = null;
    activeFieldKey = fieldKey || null;
    selectedStyleFieldKey = fieldKey || null;
    expandedSections.add(activeSectionOwner + ':' + sectionKey);

    setInspectorVisible(true);
    renderTree();
    renderInspector();
    // Keep the selected storefront element visible on mobile. The merchant
    // enters editing controls via the dedicated Settings pane.
    if (isPhoneEditor()) { setMobileSheetSize('half'); setMobilePane('settings'); }
    const prefix = activeSectionOwner === 'site' ? 'Global' : slug;
    byId('te-selected-path').textContent = fieldKey ? prefix + ' / ' + sectionKey + ' / ' + fieldKey : prefix + ' / ' + sectionKey;

    if (scrollPreview) scrollPreviewToSelection(sectionKey, fieldKey, null);
    highlightPreviewSelection();
    closeAgentProposal();
    publishGenerationSelection();
    // The inspector chooses the target. The mini composer appears at that
    // selection without another trigger or any automatic model request.
    if (inspectionEnabled && (!isPhoneEditor() || document.querySelector('.theme-studio')?.dataset.mobilePane === 'preview')) void openMiniAgentSam();
    else closeMiniAgentSam();
  }

  function selectBlock(sectionKey, blockId, fieldKey, scrollPreview, ownerSlug) {
    const section = findSection(sectionKey, ownerSlug);
    const blockMeta = section && section.content && section.content.__editor && section.content.__editor.blocks;
    const block = Array.isArray(blockMeta) ? blockMeta.find(function(item) { return item.id === blockId; }) : null;
    if (!section || !block) return;

    activeSectionKey = sectionKey;
    activeSectionOwner = sectionOwner(section);
    activeBlockId = blockId;
    activeFieldKey = fieldKey || null;
    // Selecting a block expands its parent, but users may explicitly close it.
    expandedSections.add(activeSectionOwner + ':' + sectionKey);

    if (activeFieldKey && activeFieldKey.indexOf(blockId + '.') !== 0) activeFieldKey = blockId + '.' + activeFieldKey;
    selectedStyleFieldKey=activeFieldKey;

    setInspectorVisible(true);
    renderTree();
    renderInspector();
    // Keep the selected storefront element visible on mobile. The merchant
    // enters editing controls via the dedicated Settings pane.
    if (isPhoneEditor()) { setMobileSheetSize('half'); setMobilePane('settings'); }
    const prefix = activeSectionOwner === 'site' ? 'Global' : slug;
    byId('te-selected-path').textContent = activeFieldKey
      ? prefix + ' / ' + sectionKey + ' / ' + blockId + ' / ' + activeFieldKey.replace(blockId + '.', '')
      : prefix + ' / ' + sectionKey + ' / ' + blockId;

    if (scrollPreview) scrollPreviewToSelection(sectionKey, activeFieldKey, blockId);
    highlightPreviewSelection();
    closeAgentProposal();
    publishGenerationSelection();
    // The inspector chooses the target. The mini composer appears at that
    // selection without another trigger or any automatic model request.
    if (inspectionEnabled && (!isPhoneEditor() || document.querySelector('.theme-studio')?.dataset.mobilePane === 'preview')) void openMiniAgentSam();
    else closeMiniAgentSam();
  }

  // Hover is transient. It never changes the selected node, draft, or inspector.
  function hoverEditorNode(sectionKey, blockId, owner) {
    const tree = byId('te-tree');
    tree.querySelectorAll('.is-hovered').forEach(function(node) { node.classList.remove('is-hovered'); });
    if (sectionKey) {
      const container = tree.querySelector('[data-tree-section="' + CSS.escape((owner || slug) + ':' + sectionKey) + '"]');
      const row = blockId
        ? container?.querySelector('.te-block-row[data-block-id="' + CSS.escape(blockId) + '"]')
        : container?.querySelector('.te-tree-row');
      row?.classList.add('is-hovered');
    }
    let doc;
    try { doc = byId('theme-preview').contentDocument; } catch {}
    if (!doc) return;
    doc.querySelectorAll('[data-theme-editor-hover]').forEach(function(node) { node.removeAttribute('data-theme-editor-hover'); });
    if (!sectionKey || !inspectionEnabled) return;
    const section = doc.querySelector('[data-cms-section="' + CSS.escape(sectionKey) + '"], [data-section-id="' + CSS.escape(sectionKey) + '"]');
    const target = blockId ? section?.querySelector('[data-cms-block="' + CSS.escape(blockId) + '"]') : section;
    target?.setAttribute('data-theme-editor-hover', 'true');
  }

  function bindPreviewSelection() {
    const frame = byId('theme-preview');
    let doc;
    try { doc = frame.contentDocument; } catch { return; }
    if (!doc || !doc.documentElement) return;

    let style = doc.getElementById('fnf-theme-editor-preview-style');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'fnf-theme-editor-preview-style';
      style.textContent =
        'html.fnf-theme-editor-outlines [data-cms-section]{outline:1px dashed rgba(95,67,213,.24);outline-offset:-1px}' +
        'html.fnf-theme-editor-outlines [data-cms]{cursor:pointer!important}' +
        'html.fnf-theme-editor-outlines [data-cms]:hover{outline:2px solid rgba(95,67,213,.52);outline-offset:2px}' +
        '[data-theme-editor-selected="true"]{outline:2px solid #7656ee!important;outline-offset:2px!important;box-shadow:0 0 0 3px rgba(118,86,238,.12)!important}' +
        '[data-theme-editor-hover="true"]:not([data-theme-editor-selected="true"]){outline:2px dashed #7656ee!important;outline-offset:2px!important}';
      if (doc.head) doc.head.appendChild(style);
    }
    doc.documentElement.classList.toggle('fnf-theme-editor-outlines', showOutlines && inspectionEnabled);

    if (doc.documentElement.dataset.fnfThemeEditorBound !== '1') {
      doc.documentElement.dataset.fnfThemeEditorBound = '1';
      doc.addEventListener('mouseover', function(event) {
        if (!inspectionEnabled) return;
        const el = event.target?.closest?.('[data-cms-block], [data-cms-section], [data-section-id]');
        const section = el?.closest?.('[data-cms-section], [data-section-id]');
        if (section) hoverEditorNode(section.getAttribute('data-cms-section') || section.getAttribute('data-section-id'), el.closest('[data-cms-block]')?.getAttribute('data-cms-block'), section.closest('[data-cms-section]')?.dataset.sectionOwner || slug);
      });
      doc.addEventListener('mouseout', function(event) {
        if (!event.relatedTarget?.closest?.('[data-cms-block], [data-cms-section], [data-section-id]')) hoverEditorNode(null);
      });
      doc.addEventListener('click', function(event) {
        if (!inspectionEnabled || window.__fnfGlobalInspectMode) return;
        const target = event.target && event.target.closest && event.target.closest('[data-cms], [data-cms-block], [data-cms-section], [data-section-id]');
        if (!target) return;

        const cmsNode = target.closest('[data-cms]');
        const blockNode = target.closest('[data-cms-block]');
        const sectionNode = target.closest('[data-cms-section], [data-section-id]');
        let sectionKey = sectionNode ? (sectionNode.getAttribute('data-cms-section') || sectionNode.getAttribute('data-section-id') || '') : '';
        const blockId = blockNode ? (blockNode.getAttribute('data-cms-block') || '') : '';
        let fieldKey = cmsNode ? (cmsNode.getAttribute('data-cms') || '') : '';

        if (!sectionKey && fieldKey.indexOf('.') > 0) {
          const first = fieldKey.split('.')[0];
          if (findSection(first, slug) || findSection(first, 'site')) sectionKey = first;
        }

        if (sectionKey && fieldKey.indexOf(sectionKey + '.') === 0) fieldKey = fieldKey.slice(sectionKey.length + 1);
        const owner = (sectionKey === 'header' || sectionKey === 'footer' || sectionKey === 'brand') ? 'site' : slug;
        if (!sectionKey || !findSection(sectionKey, owner)) return;

        event.preventDefault();
        event.stopImmediatePropagation();
        setMiniAnchor(target, frame, event);
        if (blockId) selectBlock(sectionKey, blockId, fieldKey || null, false, owner);
        else selectSection(sectionKey, fieldKey || null, false, owner);
      }, true);
    }

    highlightPreviewSelection();
  }

  function revealSelectedMobile() {
    if (!isPhoneEditor() || document.querySelector('.theme-studio')?.dataset.mobilePane !== 'settings' || !activeFieldKey) return;
    const frame = byId('theme-preview');
    const sheet = document.querySelector('.theme-editor-panel');
    try {
      const selected = frame?.contentDocument?.querySelector('[data-theme-editor-selected="true"]');
      if (!selected || !sheet || !frame?.contentWindow) return;
      const rect = selected.getBoundingClientRect();
      const outer = frame.getBoundingClientRect();
      const sheetTop = sheet.getBoundingClientRect().top;
      const scale = outer.width / Math.max(1, frame.contentWindow.innerWidth || outer.width);
      const top = outer.top + rect.top * scale;
      const bottom = outer.top + rect.bottom * scale;
      const overflow = bottom - sheetTop + 18;
      if (overflow > 0 && top > outer.top + 15 && typeof frame.contentWindow.scrollBy === 'function') {
        const delta = Math.min(overflow, top - outer.top - 15);
        frame.contentWindow.scrollBy({ top: delta / scale, behavior: 'smooth' });
      }
    } catch { /* Unavailable iframe metrics must never block the inspector. */ }
  }

  function highlightPreviewSelection() {
    if (!inspectionEnabled) return;
    let doc;
    try { doc = byId('theme-preview').contentDocument; } catch { return; }
    if (!doc) return;

    doc.querySelectorAll('[data-theme-editor-selected="true"]').forEach(function(node) {
      node.removeAttribute('data-theme-editor-selected');
    });

    let selected = null;
    if (activeFieldKey) {
      const section = doc.querySelector('[data-cms-section="' + CSS.escape(activeSectionKey || '') + '"], [data-section-id="' + CSS.escape(activeSectionKey || '') + '"]');
      const candidates = [activeFieldKey, activeSectionKey ? activeSectionKey + '.' + activeFieldKey : activeFieldKey];
      for (const key of candidates) {
        selected = (section && section.querySelector('[data-cms="' + CSS.escape(key) + '"]')) || doc.querySelector('[data-cms="' + CSS.escape(key) + '"]');
        if (selected) break;
      }
    }
    if (!selected && activeBlockId && activeSectionKey) {
      const section = doc.querySelector('[data-cms-section="' + CSS.escape(activeSectionKey) + '"], [data-section-id="' + CSS.escape(activeSectionKey) + '"]');
      selected = section && section.querySelector('[data-cms-block="' + CSS.escape(activeBlockId) + '"]');
    }
    if (!selected && activeSectionKey) {
      selected = doc.querySelector('[data-cms-section="' + CSS.escape(activeSectionKey) + '"], [data-section-id="' + CSS.escape(activeSectionKey) + '"]');
    }
    if (selected) {
      selected.setAttribute('data-theme-editor-selected', 'true');
      // Tree selection must resolve to the selected canvas element rather than
      // leaving the mini composer beside its corresponding tree row.
      if (!miniAnchor?.frame || miniAnchor.element !== selected)
        setMiniAnchor(selected, byId('theme-preview'));
    } else if (miniAnchor?.frame) {
      setMiniAnchor(null);
    }
    if (selected && isPhoneEditor()) window.requestAnimationFrame?.(revealSelectedMobile);
  }

  function setDevice(next) {
    device = next;
    localStorage.setItem('fnf-theme-editor-device', device);
    byId('te-preview-device').dataset.device = device;
    document.querySelectorAll('.te-device-btn').forEach(function(button) {
      const active = button.dataset.device === device;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  async function refreshPreview() {
    if (journalShowcase) {
      const frame=byId('theme-preview');
      const meta=typeof pageData?.metadata_json==='string'
        ? JSON.parse(pageData.metadata_json) : pageData?.metadata_json||{};
      const path=typeof meta?.path==='string' && /^[a-z0-9/-]*$/.test(meta.path)?meta.path:'';
      const route='/themes/plain-jane/demo/'+path;
      const src=route+(route.includes('?')?'&':'?')+'studio_preview=1';
      frame.removeAttribute('srcdoc');
      if(frame.getAttribute('src')!==src)frame.src=src;
      byId('te-open-tab').href=route;
      byId('te-preview-label').textContent='Plain Jane Journal · '+(pageData?.title||'Journal')+' · read-only CMS source';
      return;
    }
    if (resolveShowcase) {
      const frame = byId('theme-preview');
      const portalPath = window.AgentSamResolveStudio?.pagePath?.(slug);
      const url = portalPath
        ? '/themes/resolve/demo/portal/' + portalPath + '?studio_preview=1'
        : '/themes/resolve/demo/?studio_preview=1';
      if (showcaseTemplate) {
        frame.removeAttribute('src');
        frame.srcdoc = renderResolveScaffold(showcaseTemplate.template, showcaseTemplate.title);
      } else {
        frame.removeAttribute('srcdoc');
        if (frame.getAttribute('src') !== url) frame.src = url;
        window.AgentSamResolveStudio?.sync?.();
      }
      byId('te-open-tab').href = portalPath
        ? '/themes/resolve/demo/portal/' + portalPath
        : '/themes/resolve/demo/';
      byId('te-preview-label').textContent = 'Resolve · ' + (showcaseTemplate?.title || 'interactive') + ' · local preview only';
      return;
    }
    if (violetShowcase) {
      const frame = byId('theme-preview');
      if (showcaseTemplate) {
        frame.removeAttribute('src');
        frame.srcdoc = renderVioletScaffold(showcaseTemplate.template, showcaseTemplate.title);
      } else {
        frame.removeAttribute('srcdoc');
        frame.src = '/themes/violet/demo/';
      }
      byId('te-open-tab').href = '/themes/violet/demo/';
      byId('te-preview-label').textContent = 'Violet · ' + (showcaseTemplate?.title || 'Home page') + ' · local UI preview';
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
      const localDraft=resolveShowcase && window.AgentSamResolveStudio?.getDraft?.(slug);
      const results = await Promise.all([
        localDraft ? Promise.resolve({page:localDraft,seeded:false}) :
          editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug)),
        editorRequest('/api/admin/cms/pages').catch(function() { return { pages: [] }; }),
        host ? Promise.resolve({ page: { slug: 'site', title: 'Global', sections: [], status: 'draft' } })
             : adminFetch('/api/admin/cms/pages/site')
      ]);
      pageData = results[0].page;
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
      if(resolveShowcase)pages.push(...(window.AgentSamResolveStudio?.getDrafts?.()||[]));
      document.dispatchEvent(new CustomEvent('theme-editor:global-settings-ready'));

      (pageData.sections || []).forEach(function(section) { section.__ownerSlug = slug; });
      (siteData.sections || []).forEach(function(section) { section.__ownerSlug = 'site'; });

      if (!pages.some(function(page) { return page.slug === slug; })) pages.unshift({ slug: slug, title: pageData.title || humanize(slug) });

      const selectedStillExists = activeSectionKey && findSection(activeSectionKey, activeSectionOwner);
      if (!selectedStillExists) {
        activeSectionOwner = slug;
        activeSectionKey = pageData.sections && pageData.sections[0] ? pageData.sections[0].key : (siteData.sections?.find(function(section) { return section.key === 'header'; })?.key || null);
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

      byId('te-page-title').textContent = pageData.title || humanize(slug);
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
          link.href = '/admin/page-edit?slug=' + encodeURIComponent(slug);
        }
      }
      syncPublishCapability();
      renderPageOptions('');
      renderTree();
      renderInspector();
      dirtySections.clear();
      dirtyVersions.clear();
      autosaveFailed = false;
      setDirty(false);
      refreshPreview();
    } catch (error) {
      setNote(error.message || String(error), 'error');
      setSaveState('Load failed', 'error');
      byId('te-tree').innerHTML = '<div class="te-empty">' + cmsEscapeHtml(error.message || String(error)) + '</div>';
    }
  }

  // Serialize writes and snapshot each section before awaiting the network. A later
  // keystroke must remain dirty even if an earlier autosave finishes afterward.
  async function saveDraft({ automatic = false } = {}) {
    if (localShowcase) { setNote('Local showcase is UI-only. No CMS writes occur.', 'info'); return false; }
    if (saveInFlight) {
      const previousSaved = await saveInFlight;
      if (!previousSaved) return false;
      return dirty ? saveDraft({ automatic }) : true;
    }
    if (generationLock.locked()) {
      if (!automatic) setNote('Wait for generation to finish.');
      return false;
    }
    if (liveUnimported) {
      if (!automatic) setNote('This live page needs a private working revision before editing.', 'error');
      return false;
    }
    clearTimeout(autosaveTimer);
    const refs = Array.from(dirtySections);
    if (!dirty || !refs.length) {
      if (!automatic) setNote('All draft changes are saved.', 'success');
      setSaveState('Saved', 'saved');
      return true;
    }
    const snapshots = refs.map(function(ref) {
      const parsed = parseDirtyRef(ref);
      const section = findSection(parsed.key, parsed.owner);
      return section ? {
        ref, owner: parsed.owner, key: section.key,
        content: structuredClone(section.content),
        version: Number(section.version || 0),
        editVersion: dirtyVersions.get(ref)
      } : { ref, missing: true };
    });
    const button = byId('te-save');
    if (button) button.disabled = true;
    setSaveState('Saving…');
    if (!automatic) setNote('Saving…');
    const operation = (async function() {
      try {
        for (const item of snapshots) {
          if (item.missing) {
            dirtySections.delete(item.ref);
            dirtyVersions.delete(item.ref);
            continue;
          }
          const result = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(item.owner) + '/sections/' + encodeURIComponent(item.key), {
            method: 'PUT',
            body: JSON.stringify({
              content: item.content,
              expected_version: item.version
            })
          });
          const section = findSection(item.key, item.owner);
          if (section) {
            section.status = 'draft';
            section.source = 'r2';
            missingSourceSections = missingSourceSections.filter(function(key) { return key !== section.key; });
            section.version = result.version ?? section.version;
            section.updated_at = result.updated_at || section.updated_at;
          }
          if (item.owner === 'site') siteData.status = 'draft';
          else pageData.status = 'draft';
          // Do not clear a newer edit made while the request was in flight.
          if (dirtyVersions.get(item.ref) === item.editVersion) {
            dirtySections.delete(item.ref);
            dirtyVersions.delete(item.ref);
          }
        }
        autosaveFailed = false;
        setDirty(dirtySections.size > 0);
        if (!automatic) setNote('Draft saved privately.', 'success');
        if (!dirty) {
          renderTree();
          if (!automatic) renderInspector();
          schedulePreview();
        }
        return true;
      } catch (error) {
        autosaveFailed = true;
        const conflict = error?.status === 409;
        setNote(conflict ? 'This content changed in another tab. Your edits are still here; reload only after preserving them.' : (error.message || String(error)), 'error');
        setSaveState(conflict ? 'Save conflict' : 'Save failed — Retry', 'error');
        return false;
      } finally {
        if (button) button.disabled = liveUnimported || (!dirty && !hasEditedThisSession);
      }
    })();
    saveInFlight = operation;
    try {
      return await operation;
    } finally {
      saveInFlight = null;
      if (dirty && !autosaveFailed) schedulePrivateAutosave();
    }
  }

  async function publishPage() {
    if (localShowcase) { setNote('Local showcase cannot publish to a customer site.'); return false; }
    // The explicit Publish live menu action is the merchant confirmation.
    // Keep publish capability/preflight checks without a second browser-native dialog.
    if (publishInFlight) return false;
    byId('te-save-menu').hidden = true;
    byId('te-save-options').setAttribute('aria-expanded', 'false');
    if (generationLock.locked()) { setNote('Wait for generation to finish.'); return false; }
    if (liveUnimported) {
      setNote('Import the existing live page before publishing any CMS draft.', 'error');
      return;
    }
    if (selectedTheme !== 'heuristic') {
      setNote('This theme is visual-preview only. Publication is disabled until its renderer and rollback pass acceptance.', 'error');
      return;
    }
    const button = byId('te-publish');
    publishInFlight = true;
    button.disabled = true;
    button.textContent = 'Publishing…';
    try {
      if ((dirty || saveInFlight) && !(await saveDraft())) throw new Error('Could not save draft before publishing');
      if (dirty) throw new Error('New edits are still pending; publish again after they are saved.');
      let siteResult = null;
      if (!host && siteDraftTouched) {
        siteResult = await adminFetch('/api/admin/cms/pages/site/publish', { method: 'POST' });
        siteData.status = 'published';
        (siteData.sections || []).forEach(function(section) { section.status = 'published'; });
        siteDraftTouched = false;
      }
      const result = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/publish', { method: 'POST' });
      pageData.status = 'published';
      (pageData.sections || []).forEach(function(section) { section.status = 'published'; });
      setDirty(false);
      const publishedAt = result.published_at || siteResult?.published_at;
      setNote(publishedAt ? 'Published ' + fmtPageDate(publishedAt) + '.' : 'Published to live site.', 'success');
      renderTree();
      renderInspector();
      refreshPreview();
    } catch (error) {
      setNote(error.message || String(error), 'error');
      setSaveState('Publish failed', 'error');
    } finally {
      publishInFlight = false;
      syncPublishCapability();
      button.textContent = 'Publish live…';
    }
  }

  const pendingNativeSections = new Map();

  // Registry-backed sections are visible and editable before their first write.
  // Structural operations need a real private D1 row; create it on demand,
  // never by overwriting another section's existing draft or publishing.
  async function ensureNativeSection(sectionKey, owner = slug) {
    if (owner !== slug) return;
    const section = findSection(sectionKey, owner);
    if (!section || section.source !== 'registry') return;
    const id = owner + ':' + sectionKey;
    if (pendingNativeSections.has(id)) return pendingNativeSections.get(id);
    const task = (async function() {
      if ((dirty || saveInFlight) && !(await saveDraft())) throw new Error('Save the current changes before moving this section.');
      if (section.source !== 'registry') return;
      const index = ownerSections(owner).findIndex(function(item) { return item.key === sectionKey; });
      const result = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(owner) + '/sections', {
        method: 'POST',
        body: JSON.stringify({ templateKey: sectionKey, toIndex: Math.max(0, index) })
      });
      if (result.section_key !== sectionKey) throw new Error('Section identity changed during draft initialization. Reload to review.');
      section.source = 'r2';
      section.status = 'draft';
      section.version = result.version ?? 1;
      missingSourceSections = missingSourceSections.filter(function(key) { return key !== sectionKey; });
    })();
    pendingNativeSections.set(id, task);
    try { await task; } finally { pendingNativeSections.delete(id); }
  }

  async function insertSection(templateKey, themePreset, toIndex) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    setNote('Adding section…');
    try {
      const result = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/sections', {
        method: 'POST',
        body: JSON.stringify({
          templateKey: templateKey,
          themePreset: themePreset || '',
          toIndex: Number.isInteger(toIndex) ? toIndex : (pageData?.sections || []).length
        })
      });
      activeSectionOwner = slug;
      activeSectionKey = result.section_key;
      activeBlockId = null;
      activeFieldKey = null;
      setNote('Section added from ' + humanize(selectedTheme) + '.', 'success');
      await loadPage();
      selectSection(result.section_key, null, true, slug);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function duplicateSection(sectionKey) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    setNote('Duplicating section…');
    try {
      await ensureNativeSection(sectionKey);
      const result = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/sections/' + encodeURIComponent(sectionKey) + '/duplicate', {
        method: 'POST',
        body: JSON.stringify({})
      });
      activeSectionOwner = slug;
      activeSectionKey = result.section_key;
      activeBlockId = null;
      activeFieldKey = null;
      setNote('Section duplicated.', 'success');
      await loadPage();
      selectSection(result.section_key, null, true);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function moveSection(sectionKey, toIndex) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    try {
      await ensureNativeSection(sectionKey);
      await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/sections/' + encodeURIComponent(sectionKey) + '/move', {
        method: 'POST',
        body: JSON.stringify({ toIndex: toIndex })
      });
      setNote('Section moved.', 'success');
      activeSectionOwner = slug;
      await loadPage();
      selectSection(sectionKey, null, true, slug);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function setSectionVisibility(sectionKey, enabled, ownerSlug) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    const owner = ownerSlug || slug;
    try {
      await ensureNativeSection(sectionKey, owner);
      await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(owner) + '/sections/' + encodeURIComponent(sectionKey) + '/visibility', {
        method: 'PUT',
        body: JSON.stringify({ enabled: enabled })
      });
      if (owner === 'site') siteDraftTouched = true;
      setNote(enabled ? 'Section shown.' : 'Section hidden.', 'success');
      await loadPage();
      if (findSection(sectionKey, owner)) selectSection(sectionKey, null, false, owner);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function removeSection(sectionKey) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    const section = (pageData?.sections || []).find(function(item) { return item.key === sectionKey; });
    if (!section) return;
    const label = (schemaForSection(section)?.label || humanize(sectionKey));
    if (!confirm('Remove "' + label + '" from this page? You can add it again later.')) return;

    try {
      await ensureNativeSection(sectionKey);
      await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/sections/' + encodeURIComponent(sectionKey), {
        method: 'DELETE'
      });
      setNote('Section removed.', 'success');
      activeSectionKey = null;
      activeBlockId = null;
      activeFieldKey = null;
      await loadPage();
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function insertBlock(sectionKey, templateKey, ownerSlug) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    const owner = ownerSlug || slug;
    setNote('Adding block…');
    try {
      const section = findSection(sectionKey, owner);
      const blocks = section?.content?.__editor?.blocks || [];
      await ensureNativeSection(sectionKey, owner);
      const result = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(owner) + '/sections/' + encodeURIComponent(sectionKey) + '/blocks', {
        method: 'POST',
        body: JSON.stringify({ templateKey: templateKey, toIndex: blocks.length })
      });
      if (owner === 'site') siteDraftTouched = true;
      activeSectionOwner = owner;
      activeSectionKey = sectionKey;
      activeBlockId = result.block_id;
      activeFieldKey = null;
      setNote('Block added.', 'success');
      await loadPage();
      selectBlock(sectionKey, result.block_id, null, true, owner);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function duplicateBlock(sectionKey, blockId, ownerSlug) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    const owner = ownerSlug || slug;
    setNote('Duplicating block…');
    try {
      await ensureNativeSection(sectionKey, owner);
      const result = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(owner) + '/sections/' + encodeURIComponent(sectionKey) + '/blocks/' + encodeURIComponent(blockId) + '/duplicate', {
        method: 'POST',
        body: JSON.stringify({})
      });
      if (owner === 'site') siteDraftTouched = true;
      activeSectionOwner = owner;
      activeSectionKey = sectionKey;
      activeBlockId = result.block_id;
      activeFieldKey = null;
      setNote('Block duplicated.', 'success');
      await loadPage();
      selectBlock(sectionKey, result.block_id, null, true, owner);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function moveBlock(sectionKey, blockId, toIndex, ownerSlug) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    const owner = ownerSlug || slug;
    try {
      await ensureNativeSection(sectionKey, owner);
      await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(owner) + '/sections/' + encodeURIComponent(sectionKey) + '/blocks/' + encodeURIComponent(blockId) + '/move', {
        method: 'POST',
        body: JSON.stringify({ toIndex: toIndex })
      });
      if (owner === 'site') siteDraftTouched = true;
      setNote('Block moved.', 'success');
      await loadPage();
      selectBlock(sectionKey, blockId, null, true, owner);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function removeBlock(sectionKey, blockId, ownerSlug) {
    if (liveUnimported) { setNote('Start editing page to create a private draft before changing its sections.'); return false; }
    const owner = ownerSlug || slug;
    const section = findSection(sectionKey, owner);
    const meta = section?.content?.__editor?.blocks?.find(function(item) { return item.id === blockId; });
    const blockSchema = blockSchemaFor(section, meta);
    const label = (blockSchema && blockSchema.label) || humanize(blockId);
    if (!confirm('Remove "' + label + '" from this section?')) return;

    try {
      await ensureNativeSection(sectionKey, owner);
      await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(owner) + '/sections/' + encodeURIComponent(sectionKey) + '/blocks/' + encodeURIComponent(blockId), {
        method: 'DELETE'
      });
      if (owner === 'site') siteDraftTouched = true;
      setNote('Block removed.', 'success');
      if (activeBlockId === blockId) {
        activeBlockId = null;
        activeFieldKey = null;
      }
      activeSectionOwner = owner;
      activeSectionKey = sectionKey;
      await loadPage();
      selectSection(sectionKey, null, false, owner);
    } catch (error) {
      setNote(error.message || String(error), 'error');
    }
  }

  async function switchPage(nextSlug) {
    const hadScaffold = localShowcase && !!showcaseTemplate;
    if (localShowcase) showcaseTemplate = null;
    if (!nextSlug || (nextSlug === slug && !hadScaffold)) {
      closePageMenu();
      return;
    }
    if ((dirty || saveInFlight) && !(await saveDraft())) {
      setNote('Save failed. Stay on this page so your edits are not lost.', 'error');
      return;
    }
    slug = nextSlug;
    activeSectionOwner = slug;
    activeSectionKey = null;
    activeBlockId = null;
    activeFieldKey = null;
    if (!host) history.replaceState(null, '', '?slug=' + encodeURIComponent(slug));
    else host.onPageChange?.(slug);
    closePageMenu();
    await loadPage();
  }

  let editorDrawer = null;
  let inspectorVisible = true;
  // Preserve an intentionally closed inspector when returning from full preview.
  let inspectorBeforeFullPreview = true;
  function setInspectorVisible(value) {
    inspectorVisible = Boolean(value);
    const studio = document.querySelector('.theme-studio');
    if (studio) studio.dataset.inspector = inspectorVisible ? 'open' : 'closed';
    const inspect = byId('te-inspect-mode');
    if (inspect) inspect.setAttribute('aria-controls', 'te-inspector-body');
    if (!inspectorVisible && window.matchMedia('(max-width: 900px)').matches) setMobilePane('preview');
  }
  let themeIdentity = { name: '', status: '' };
  const drawerScroll = { sections: 0, 'theme-settings': 0, 'app-embeds': 0 };

  function statusLabel(value) {
    const raw = String(value || '').toLowerCase();
    if (raw === 'active' || raw === 'wired' || raw === 'published') return 'Active';
    if (raw === 'unpublished') return 'Unpublished';
    if (raw === 'draft') return 'Draft';
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : '';
  }

  function applyThemeIdentity(identity) {
    themeIdentity = {
      name: identity && identity.name ? String(identity.name) : 'Theme',
      status: identity && identity.status ? String(identity.status) : ''
    };
    const nameEl = byId('te-theme-name');
    const statusEl = byId('te-theme-status');
    if (nameEl) nameEl.textContent = themeIdentity.name;
    const currentPreview = window.ThemeStudioPreview?.getTheme?.(selectedTheme);
    const triggerLabel = byId('te-theme-trigger-label');
    if (triggerLabel) triggerLabel.textContent = currentPreview?.name || themeIdentity.name;
    if (statusEl) {
      const label = statusLabel(themeIdentity.status);
      statusEl.textContent = label;
      statusEl.hidden = !label;
      statusEl.dataset.status = themeIdentity.status.toLowerCase();
    }
  }

  async function loadThemeIdentity() {
    try {
      if (host && host.adapter && typeof host.adapter.getThemeIdentity === 'function') {
        applyThemeIdentity(await host.adapter.getThemeIdentity());
        return;
      }
      if (localShowcase) {
        selectedTheme = 'heuristic';
        applyThemeIdentity({ name: showcaseDisplayName, status: 'preview' });
        byId('te-theme-trigger-label').textContent = showcaseDisplayName;
        return;
      }
      const catalog = await editorRequest('/api/admin/cms/themes');
      if (!catalog.ok) throw new Error(catalog.error || 'Installed theme catalog unavailable');
      installedThemeSlugs = new Set((catalog.themes || []).map(function(theme) { return theme.slug; }));
      persistedThemeVersion = Number(catalog.content_version || 0);
      selectedTheme = catalog.preview_theme?.slug || catalog.active_theme?.slug || 'heuristic';
      document.querySelectorAll('[data-theme-preview]').forEach(function(button) {
        const installed = installedThemeSlugs.has(button.dataset.themePreview);
        button.disabled = !installed;
        button.title = installed ? 'Choose installed theme preview' : 'Theme artifact is not installed';
        button.classList.toggle('is-active', button.dataset.themePreview === selectedTheme);
        button.setAttribute('aria-pressed', String(button.dataset.themePreview === selectedTheme));
      });
      const theme = catalog.active_theme || null;
      applyThemeIdentity({ name: theme?.name, status: theme?.state });
      syncPublishCapability();
      refreshPreview();
    } catch (error) {
      setNote('Installed theme selection unavailable: ' + error.message, 'error');
      applyThemeIdentity({ name: '', status: '' });
    }
  }

  function setEditorDrawer(next, showMobileSheet = true) {
    const aside = byId('te-editor-drawer');
    if (aside && editorDrawer) drawerScroll[editorDrawer] = aside.scrollTop;
    const wasClosed = editorDrawer === null;
    editorDrawer = editorDrawer === next ? null : next;
    if (!editorDrawer) {
      // Closing the left editing rail is a full storefront preview action:
      // keep the selection, but remove the right inspector as well.
      inspectorBeforeFullPreview = inspectorVisible;
      setInspectorVisible(false);
    } else if (wasClosed) {
      // Opening a panel restores the previous inspector preference.
      setInspectorVisible(inspectorBeforeFullPreview);
    }
    if (editorDrawer !== 'sections') closeMiniAgentSam();
    const studio = document.querySelector('.theme-studio');
    if (studio) studio.setAttribute('data-editor-drawer', editorDrawer || 'closed');
    document.querySelectorAll('[data-drawer-mode]').forEach(function(button) {
      const on = button.dataset.drawerMode === editorDrawer;
      button.classList.toggle('is-active', on);
      button.setAttribute('aria-pressed', String(on));
    });
    document.querySelectorAll('[data-drawer-panel]').forEach(function(panel) {
      panel.hidden = panel.dataset.drawerPanel !== editorDrawer;
    });
    if (aside && editorDrawer) aside.scrollTop = drawerScroll[editorDrawer] || 0;
    const mobileHeading = byId('te-mobile-sections-title');
    if (mobileHeading) mobileHeading.textContent = editorDrawer === 'theme-settings' ? 'Theme settings'
      : editorDrawer === 'app-embeds' ? 'App embeds' : 'Sections';
    if (isPhoneEditor() && showMobileSheet) {
      if (editorDrawer) { setMobileSheetSize('half'); setMobilePane('sections'); }
      else setMobilePane('preview');
    }
  }

  let editorLeaving = false;

  let generationInspector = null;
  const generationLock = { locked: function() { return false; } };
  import('/admin/js/generation-surfaces.mjs').catch(function() {});
  import('/admin/js/generation-inspector.mjs').then(function(mod) { generationInspector = mod; }).catch(function() {});
  import('/admin/js/generation-lock.mjs').then(function(mod) {
    const lock = mod.createGenerationLock();
    generationLock.start = lock.start.bind(lock);
    generationLock.finish = lock.finish.bind(lock);
    generationLock.locked = lock.locked.bind(lock);
    generationLock.run = lock.run.bind(lock);
  }).catch(function() {});

  function confirmLeave() {
    if (generationLock.locked()) {
      return window.confirm('A generation is still running. Leave and abort it?');
    }
    if (!dirty) return true;
    return window.confirm('Leave the editor? Unsaved changes on this page will be lost.');
  }

  function exitEditor() {
    if (!confirmLeave()) return;
    editorLeaving = true;
    if (window.AgentSamShell && AgentSamShell.unbindShellShortcuts) AgentSamShell.unbindShellShortcuts();
    const dest = window.AgentSamShell && AgentSamShell.resolveExitTarget ? AgentSamShell.resolveExitTarget() : '/admin/store';
    location.assign(dest);
  }

  function closeThemeMenu() {
    const menu = byId('te-theme-menu');
    if (menu) menu.hidden = true;
    byId('te-theme-trigger')?.setAttribute('aria-expanded','false');
  }

  function openThemeMenu() {
    closePageMenu();
    const menu = byId('te-theme-menu');
    const trigger = byId('te-theme-trigger');
    if (!menu || !trigger) return;
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
  }

  function openPageMenu() {
    closeThemeMenu();
    byId('te-page-popover').hidden = false;
    byId('te-page-trigger').setAttribute('aria-expanded', 'true');
    pagePickerCategory = null;
    byId('te-page-search').value = '';
    renderPageOptions('');
    loadStorefrontResources().catch(() => {});
    requestAnimationFrame(function() { byId('te-page-search').focus(); });
  }

  function closePageMenu() {
    byId('te-page-popover').hidden = true;
    byId('te-page-trigger').setAttribute('aria-expanded', 'false');
  }

  async function loadMedia() {
    // Fetch the actual available library rather than silently exposing only
    // the first 48 items. Pagination is owned by the existing media API.
    const assets = [];
    let page = 1;
    let pages = 1;
    do {
      const data = await editorRequest('/api/admin/media?view=all&page_size=100&sort=newest&page=' + page);
      assets.push(...(data.assets || data.media || []));
      pages = Number(data.pagination?.pages || 1);
      page += 1;
    } while (page <= pages && page <= 10);
    mediaLibrary = assets;
    return mediaLibrary;
  }

  // Match Media Library's delivery URL precedence for R2-backed assets.
  function mediaAssetUrl(asset) {
    return asset?.delivery_url || asset?.url || '';
  }

  function renderMediaGrid(query, resetLimit) {
    if (resetLimit) mediaVisibleLimit = MEDIA_PICKER_BATCH_SIZE;
    const needle = String(query || '').trim().toLowerCase();
    const filter = byId('te-media-filter').value;
    const assets = mediaLibrary.filter(function(asset) {
      const matches = !needle || ((asset.filename || '') + ' ' + (asset.folder || '') + ' ' + (asset.content_type || '')).toLowerCase().includes(needle);
      const kind = String(asset.content_type || '').toLowerCase();
      const matchesFilter = filter === 'all' ||
        (filter === 'images' && kind.startsWith('image/') && asset.folder !== 'products') ||
        (filter === 'products' && asset.folder === 'products') ||
        (filter === 'videos' && kind.startsWith('video/')) ||
        (filter === 'models' && (kind.startsWith('model/') || /\.(glb|gltf|usdz)$/i.test(asset.filename || '')));
      return matches && matchesFilter;
    });
    const sort = byId('te-media-sort').value;
    assets.sort(function(a, b) {
      if (sort === 'name') return String(a.filename || '').localeCompare(String(b.filename || ''));
      const date = asset => Date.parse(asset.created_at || asset.uploaded_at || '') || (Number(asset.created_at_unix || 0) * 1000);
      return sort === 'oldest' ? date(a) - date(b) : date(b) - date(a);
    });
    const visible = assets.slice(0, mediaVisibleLimit);
    const count = byId('te-media-count');
    if (count) count.textContent = 'Showing ' + visible.length + ' of ' + assets.length + ' assets';

    byId('te-media-grid').innerHTML = visible.length ? visible.map(function(asset, index) {
      const url = mediaAssetUrl(asset);
      const thumbnail = asset.thumbnail_url || asset.preview_url || url;
      const isImage = String(asset.content_type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|svg)(\?|$)/i.test(asset.r2_key || asset.filename || url);
      const selected = selectedMediaAsset && mediaAssetUrl(selectedMediaAsset) === url;
      const name = asset.filename || asset.r2_key || 'Asset';
      return '<button type="button" class="te-media-card' + (selected ? ' is-selected' : '') +
        '" data-media-url="' + cmsEscapeAttr(url) + '" aria-pressed="' + Boolean(selected) + '" title="' + cmsEscapeAttr(name) + '"' +
        (url ? '' : ' disabled') + '><span class="te-media-card__thumb">' +
        (isImage && thumbnail ? '<img loading="' + (index < 8 ? 'eager' : 'lazy') + '" decoding="async" src="' + cmsEscapeAttr(thumbnail) + '" alt="">' :
          '<span>' + cmsEscapeHtml((asset.content_type || 'file').split('/').pop()) + '</span>') +
        '</span><span class="te-media-card__copy"><strong>' + cmsEscapeHtml(name) + '</strong><span>' +
        cmsEscapeHtml(asset.folder || 'media') + '</span></span></button>';
    }).join('') + (visible.length < assets.length ?
      '<button type="button" class="te-media-load-more" data-media-load-more>Show more (' + (assets.length - visible.length) + ' remaining)</button>' : '') :
      '<div class="te-empty" style="grid-column:1/-1">No matching media. Try another search or upload a file.</div>';

    byId('te-media-grid').querySelectorAll('.te-media-card__thumb img').forEach(function(img) {
      img.addEventListener('error', function() {
        img.replaceWith(Object.assign(document.createElement('span'), { textContent: 'Preview unavailable' }));
      }, { once: true });
    });
    byId('te-media-grid').querySelectorAll('[data-media-url]').forEach(function(card) {
      card.addEventListener('click', function() {
        selectedMediaAsset = mediaLibrary.find(function(asset) { return mediaAssetUrl(asset) === card.dataset.mediaUrl; }) || null;
        byId('te-media-selected-name').textContent = selectedMediaAsset?.filename || 'Select an asset to preview';
        byId('te-media-confirm').disabled = !mediaAssetUrl(selectedMediaAsset);
        // Keep the existing thumbnails and scroll position when selecting media.
        byId('te-media-grid').querySelectorAll('[data-media-url]').forEach(function(candidate) {
          const active = Boolean(selectedMediaAsset && candidate.dataset.mediaUrl === mediaAssetUrl(selectedMediaAsset));
          candidate.classList.toggle('is-selected', active);
          candidate.setAttribute('aria-pressed', String(active));
        });
      });
    });
    byId('te-media-grid').querySelector('[data-media-load-more]')?.addEventListener('click', function() {
      mediaVisibleLimit += MEDIA_PICKER_BATCH_SIZE;
      renderMediaGrid(byId('te-media-search').value);
    });
  }

  async function openMediaPicker(fieldKey) {
    // Do not float the contextual assistant above the asset-picker dialog.
    closeMiniAgentSam();
    mediaTarget = fieldKey;
    selectedMediaAsset = null;
    mediaVisibleLimit = MEDIA_PICKER_BATCH_SIZE;
    byId('te-media-modal').hidden = false;
    byId('te-media-confirm').disabled = true;
    byId('te-media-selected-name').textContent = 'Select an asset to preview';
    const field = fieldByKey(fieldKey);
    byId('te-media-filter').value = field?.type === 'video' ? 'videos' : field?.type === 'model3d' ? 'models' : 'all';
    byId('te-media-sort').value = 'newest';
    byId('te-media-alert').hidden = true;
    byId('te-media-grid').innerHTML = '<div class="te-empty" style="grid-column:1/-1">Loading your media library…</div>';
    byId('te-media-count').textContent = 'Loading…';
    byId('te-media-upload').accept = field?.type === 'video' ? 'video/*' : field?.type === 'model3d' ? 'model/*,.glb,.gltf,.usdz' : 'image/*,video/*,.glb,.gltf,.usdz';
    try {
      await loadMedia();
      renderMediaGrid('');
      byId('te-media-search').focus();
    } catch (error) {
      byId('te-media-count').textContent = 'Library unavailable';
      byId('te-media-grid').innerHTML = '<div class="te-empty" style="grid-column:1/-1">' + cmsEscapeHtml(error.message || String(error)) + '</div>';
    }
  }

  function closeMediaPicker() {
    byId('te-media-modal').hidden = true;
    mediaTarget = null;
    selectedMediaAsset = null;
    byId('te-media-search').value = '';
    byId('te-media-filter').value = 'all';
  }

  async function uploadFiles(files) {
    if (!files || !files.length) return [];
    setNote('Uploading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…');
    const form = new FormData();
    files.forEach(function(file) { form.append('files', file); });
    form.append('prefix', 'uploads/theme-editor/');

    const response = host
      ? await host.adapter.uploadMedia(files)
      : await fetch('/api/admin/media', { method: 'POST', credentials: 'include', body: form });
    if (response.status === 401) {
      location.href = '/admin/login';
      throw new Error('Unauthorized');
    }
    const data = await response.json().catch(function() { return null; });
    if (!response.ok) {
      throw new Error(data?.error || ('Media upload failed (HTTP ' + response.status + '). ' +
        (!data ? 'The server returned a non-JSON response; check the upload route, session, size limit and Worker logs.' :
          'Check the media service response.')));
    }
    if (!data || !Array.isArray(data.assets)) {
      throw new Error('Media upload response was invalid; the server did not return an assets list.');
    }
    const assets = data.assets;
    if (assets.length !== files.length || assets.some(function(asset) { return !asset?.url; })) {
      throw new Error('Media upload incomplete: a saved file or its public media URL is missing.');
    }
    mediaLibrary = assets.concat(mediaLibrary.filter(function(existing) {
      return !assets.some(function(asset) { return asset.id === existing.id; });
    }));
    setNote('Media uploaded.', 'success');
    if (!byId('te-media-modal').hidden) renderMediaGrid(byId('te-media-search').value);
    return assets;
  }

  document.querySelectorAll('[data-theme-preview]').forEach(function(button) {
    button.addEventListener('click', function() { setTheme(button.dataset.themePreview); });
  });
  byId('te-theme-trigger')?.addEventListener('click', openThemeMenu);

  document.querySelectorAll('.te-device-btn').forEach(function(button) {
    button.addEventListener('click', function() { setDevice(button.dataset.device); });
  });
  byId('te-tree').addEventListener('mouseover', function(event) {
    const block = event.target.closest('.te-block-row');
    const row = event.target.closest('.te-tree-row');
    if (block) hoverEditorNode(block.dataset.blockSection, block.dataset.blockId, block.dataset.blockOwner);
    else if (row) hoverEditorNode(row.dataset.sectionKey, null, row.dataset.sectionOwner);
  });
  byId('te-tree').addEventListener('mouseout', function(event) {
    const row = event.target.closest('.te-tree-row, .te-block-row');
    if (row && !row.contains(event.relatedTarget)) hoverEditorNode(null);
  });

  byId('te-exit').addEventListener('click', exitEditor);
  document.querySelectorAll('[data-drawer-mode]').forEach(function(button) {
    button.addEventListener('click', function() { setEditorDrawer(button.dataset.drawerMode); });
  });
  byId('te-embed-search')?.addEventListener('input', function(event) {
    const empty = byId('te-embed-empty');
    if (!empty) return;
    empty.textContent = event.target.value.trim()
      ? 'No storefront embeds match that search.'
      : 'No storefront embeds are installed for this theme.';
  });


  byId('te-page-trigger').addEventListener('click', function() {
    if (byId('te-page-popover').hidden) openPageMenu();
    else closePageMenu();
  });

  byId('te-page-search').addEventListener('input', function(event) { renderPageOptions(event.target.value); });
  wireMobileSheets();
  byId('te-mobile-pane-switch').querySelectorAll('[data-mobile-pane]').forEach(function(button) {
    button.addEventListener('click', function() {
      if (button.dataset.mobilePane === 'sections' && editorDrawer !== 'sections') setEditorDrawer('sections');
      setMobilePane(button.dataset.mobilePane);
    });
  });
  setMobilePane('preview');
  byId('te-refresh').addEventListener('click', refreshPreview);
  byId('te-import-live').addEventListener('click', function() {
    return liveUnimported ? importLiveSource() : stageMissingSourceSections();
  });
  document.addEventListener('pointerdown', function(event) {
    const picker = byId('te-section-menu');
    if (picker?.open && !picker.contains(event.target) &&
        !event.target.closest('#te-add-section, [data-insert-at], #te-library-browse')) picker.close();
  });
  document.addEventListener('keydown', function(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void saveDraft();
    }
  });
  // Mount the established Side Assistant on standalone Theme Editor pages.
  // Other hosts may have already loaded it; never register a competing chat surface.
  function ensureSideAssistant() {
    if (typeof window.initAgentsamDrawer === 'function') {
      window.initAgentsamDrawer();
      return;
    }
    // Share the existing in-flight shell script; loading this classic script twice
    // redeclares its icon constants and prevents AgentSam initialization.
    const existing = document.getElementById('agentsam-script');
    if (existing) {
      existing.addEventListener('load', function() { window.initAgentsamDrawer?.(); }, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.id = 'agentsam-script';
    script.src = '/admin/js/agentsam.js';
    script.addEventListener('load', function() { window.initAgentsamDrawer?.(); }, { once: true });
    script.addEventListener('error', function() { setNote('AgentSam Side Assistant failed to load.', 'error'); }, { once: true });
    document.head.appendChild(script);
  }
  ensureSideAssistant();
  byId('te-inspect-mode').addEventListener('click', function() {
    if (!inspectorVisible) {
      setInspectorVisible(true);
      inspectionEnabled = true;
    } else {
      inspectionEnabled = !inspectionEnabled;
    }
    const control = byId('te-inspect-mode');
    control.setAttribute('aria-pressed', String(inspectionEnabled));
    const help = inspectionEnabled ? 'Canvas inspection on — select sections in the preview' : 'Canvas inspection off — click to enable';
    control.title = help;
    control.setAttribute('aria-label', inspectionEnabled ? 'Canvas inspection on' : 'Canvas inspection off');
    control.dataset.tooltip = help;
    if (!inspectionEnabled) closeMiniAgentSam();
    let doc;
    try { doc = byId('theme-preview').contentDocument; } catch {}
    if (doc?.documentElement) {
      doc.documentElement.classList.toggle('fnf-theme-editor-outlines', inspectionEnabled);
      if (!inspectionEnabled) doc.querySelectorAll('[data-theme-editor-selected]').forEach(function(node) {
        node.removeAttribute('data-theme-editor-selected');
      });
      else highlightPreviewSelection();
    }
  });
  byId('te-undo').addEventListener('click', function() { replayFieldHistory(undoHistory, redoHistory, 'before'); });
  byId('te-redo').addEventListener('click', function() { replayFieldHistory(redoHistory, undoHistory, 'after'); });
  function toggleToolbarMenu(buttonId, menuId) {
    const button = byId(buttonId), menu = byId(menuId);
    const next = menu.hidden;
    for (const [bid, mid] of [['te-more','te-more-menu'], ['te-save-options','te-save-menu'], ['te-theme-trigger','te-theme-menu']]) {
      byId(mid).hidden = true;
      byId(bid).setAttribute('aria-expanded', 'false');
    }
    menu.hidden = !next;
    button.setAttribute('aria-expanded', String(next));
    if (next && window.matchMedia('(max-width: 900px)').matches) {
      // The compact mobile toolbar scrolls; portaled menus must not be clipped.
      document.body.appendChild(menu);
      menu.style.position = 'fixed';
      menu.style.zIndex = '9999';
      const rect = button.getBoundingClientRect();
      const menuWidth = menu.getBoundingClientRect().width || 190;
      menu.style.left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)) + 'px';
      menu.style.top = rect.bottom + 6 + 'px';
      menu.querySelector('button')?.focus();
    } else if (next) {
      button.parentElement.appendChild(menu);
      menu.style.position = '';
      menu.style.left = '';
      menu.style.top = '';
    }
  }
  byId('te-more').addEventListener('click', function() { toggleToolbarMenu('te-more','te-more-menu'); });
  // Mobile keeps the actual editing controls; secondary actions live behind More.
  function closeToolbarMore() {
    const menu = byId('te-more-menu');
    if (menu) menu.hidden = true;
    byId('te-more')?.setAttribute('aria-expanded', 'false');
  }
  byId('te-more-settings').addEventListener('click', function() {
    closeToolbarMore();
    setEditorDrawer('theme-settings');
  });
  byId('te-more-embeds').addEventListener('click', function() {
    closeToolbarMore();
    setEditorDrawer('app-embeds');
  });
  byId('te-more-inspect').addEventListener('click', function() {
    closeToolbarMore();
    byId('te-inspect-mode').click();
    this.setAttribute('aria-pressed', byId('te-inspect-mode').getAttribute('aria-pressed'));
  });
  byId('te-more-publish').addEventListener('click', function() {
    closeToolbarMore();
    byId('te-publish').click(); // preserve the existing publish preflight and approval gate
  });
  document.querySelectorAll('#te-more-menu [data-theme-preview]').forEach(function(button) {
    button.addEventListener('click', closeToolbarMore);
  });
  byId('te-save-options').addEventListener('click', function() { toggleToolbarMenu('te-save-options','te-save-menu'); });
  byId('te-shortcuts').addEventListener('click', function() {
    const help = byId('te-shortcuts-help');
    if (help) help.hidden = !help.hidden;
  });
  document.addEventListener('pointerdown', function(event) {
    for (const [container, button, menu] of [['.te-toolbar-more','te-more','te-more-menu'], ['.te-save-actions','te-save-options','te-save-menu'], ['.te-theme-switcher','te-theme-trigger','te-theme-menu']]) {
      if (!event.target.closest(container) && !event.target.closest('#' + menu)) {
        byId(menu).hidden = true;
        byId(button).setAttribute('aria-expanded','false');
      }
    }
  });
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      for (const [button, menu] of [['te-more','te-more-menu'], ['te-save-options','te-save-menu'], ['te-theme-trigger','te-theme-menu']]) {
        byId(menu).hidden = true;
        byId(button).setAttribute('aria-expanded','false');
      }
    }
    const target = event.target;
    if (target?.closest?.('input, textarea, [contenteditable="true"], [role="textbox"]')) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      replayFieldHistory(event.shiftKey ? redoHistory : undoHistory, event.shiftKey ? undoHistory : redoHistory, event.shiftKey ? 'after' : 'before');
    }
  });
  byId('te-view-draft').addEventListener('click', function() {
    const frame = byId('theme-preview');
    let doc;
    try { doc = frame.contentDocument; } catch {}
    if (!doc?.documentElement || !doc.body) {
      setNote('Private preview is not ready. Refresh the editor preview and try again.', 'error');
      return;
    }
    // Read-only copy of the exact rendered private preview; never use the published URL.
    const snapshot = doc.documentElement.cloneNode(true);
    snapshot.querySelector('#fnf-theme-editor-preview-style')?.remove();
    snapshot.classList.remove('fnf-theme-editor-outlines');
    snapshot.querySelectorAll('[data-theme-editor-selected]').forEach(function(node) { node.removeAttribute('data-theme-editor-selected'); });
    snapshot.querySelectorAll('script').forEach(function(node) { node.remove(); });
    const base = doc.createElement('base');
    base.href = new URL(frame.getAttribute('src') || '/', location.origin).href;
    snapshot.querySelector('head')?.prepend(base);
    const url = URL.createObjectURL(new Blob(['<!doctype html>\n'+snapshot.outerHTML], { type:'text/html' }));
    window.open(url, '_blank', 'noopener,noreferrer');
    setTimeout(function() { URL.revokeObjectURL(url); }, 60000);
    byId('te-more-menu').hidden = true;
    byId('te-more').setAttribute('aria-expanded','false');
  });
  byId('te-inspector-close').addEventListener('click', function() { setInspectorVisible(false); });
  byId('te-save').addEventListener('click', saveDraft);
  document.addEventListener('click', function(event) {
    const dockSave = event.target && event.target.closest && event.target.closest('[data-dock-save], #dock-save');
    if (dockSave) saveDraft();
  });
  byId('te-publish').addEventListener('click', publishPage);
  byId('theme-preview').addEventListener('load', function() {
    bindPreviewSelection();
    // Reposting draft data is only needed for the live Heuristic iframe.
    // Alternate previews use srcdoc. Reassigning srcdoc on every iframe
    // load triggers an infinite navigation loop and leaves a blank canvas.
    if (selectedTheme === 'heuristic') {
      if (liveUnimported) {
        if (!dirty) captureLiveSource();
        else pushLocalPreview();
      } else {
        discoverUnmanagedSections();
        pushLocalPreview();
      }
    }
  });
  byId('te-media-close').addEventListener('click', closeMediaPicker);
  byId('te-media-search').addEventListener('input', function(event) { renderMediaGrid(event.target.value, true); });
  byId('te-media-filter').addEventListener('change', function() { renderMediaGrid(byId('te-media-search').value, true); });
  byId('te-media-sort').addEventListener('change', function() { renderMediaGrid(byId('te-media-search').value, true); });
  byId('te-media-cancel').addEventListener('click', closeMediaPicker);
  byId('te-media-confirm').addEventListener('click', function() {
    if (!mediaTarget || !mediaAssetUrl(selectedMediaAsset)) return;
    setMediaValue(mediaTarget, mediaAssetUrl(selectedMediaAsset));
  });
  async function uploadIntoPicker(files) {
    if (!files.length) return;
    const dropzone = byId('te-media-dropzone');
    const status = byId('te-media-alert');
    dropzone.setAttribute('aria-busy', 'true');
    dropzone.querySelector('span').textContent = 'Uploading ' + files.length + ' file(s)…';
    status.hidden = true;
    try {
      const assets = await uploadFiles(files);
      if (mediaTarget && assets[0]) {
        selectedMediaAsset = assets[0];
        byId('te-media-selected-name').textContent = assets[0].filename || 'Uploaded media';
        byId('te-media-confirm').disabled = !mediaAssetUrl(assets[0]);
        renderMediaGrid(byId('te-media-search').value);
        status.textContent = 'Uploaded. Choose Use media to stage this asset in the private draft.';
        status.dataset.state = 'success';
        status.hidden = false;
      }
    } catch (error) {
      status.textContent = error.message || String(error);
      status.dataset.state = 'error';
      status.hidden = false;
      setNote(status.textContent, 'error');
    } finally {
      dropzone.removeAttribute('aria-busy');
      dropzone.querySelector('span').textContent = 'Drag images or videos here, or choose files';
    }
  }
  byId('te-media-upload').addEventListener('change', async function(event) {
    await uploadIntoPicker(Array.from(event.target.files || []));
    event.target.value = '';
  });
  const mediaDropzone = byId('te-media-dropzone');
  mediaDropzone.addEventListener('click', function() { byId('te-media-upload').click(); });
  mediaDropzone.addEventListener('keydown', function(event) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      byId('te-media-upload').click();
    }
  });
  mediaDropzone.addEventListener('dragover', function(event) {
    event.preventDefault();
    mediaDropzone.classList.add('is-over');
  });
  mediaDropzone.addEventListener('dragleave', function() { mediaDropzone.classList.remove('is-over'); });
  mediaDropzone.addEventListener('drop', function(event) {
    event.preventDefault();
    mediaDropzone.classList.remove('is-over');
    void uploadIntoPicker(Array.from(event.dataTransfer?.files || []));
  });
  byId('te-media-modal').addEventListener('click', function(event) { if (event.target === byId('te-media-modal')) closeMediaPicker(); });

  document.addEventListener('click', function(event) {
    if (!byId('te-page-popover').hidden && !event.target.closest('.te-page-menu')) closePageMenu();
      });

  document.addEventListener('keydown', function(event) {
    if (event.metaKey && event.ctrlKey && ['1','2','3'].includes(event.key)) {
      event.preventDefault();
      const mode = { '1': 'sections', '2': 'theme-settings', '3': 'app-embeds' }[event.key];
      setEditorDrawer(mode);
      return;
    }
    if (event.key === 'Escape') {
      closePageMenu();
      closeThemeMenu();
      closeMediaPicker();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      saveDraft();
    }
  });

  if (window.AgentSamShell && AgentSamShell.bindShellShortcuts) {
    AgentSamShell.bindShellShortcuts('theme-editor', function(shortcut) {
      if (shortcut && shortcut.drawer) setEditorDrawer(shortcut.drawer);
    });
  }
  window.addEventListener('pagehide', function() {
    if (window.AgentSamShell && AgentSamShell.unbindShellShortcuts) AgentSamShell.unbindShellShortcuts();
  });

  window.addEventListener('beforeunload', function(event) {
    if (!dirty || editorLeaving) return;
    event.preventDefault();
    event.returnValue = '';
  });

  if (!history.state || !history.state.agentsamEditor) history.pushState({ agentsamEditor: 1 }, '');
  window.addEventListener('popstate', function() {
    if (!dirty) return;
    if (confirmLeave()) {
      editorLeaving = true;
      if (window.AgentSamShell && AgentSamShell.unbindShellShortcuts) AgentSamShell.unbindShellShortcuts();
      return;
    }
    history.pushState({ agentsamEditor: 1 }, '');
  });

  const generationApi = {
    detectProvenance: function() { return 'unknown'; },
    scanSections: function() { return []; },
    persistScanReport: function() { return Promise.resolve({ ok: false, fatal: false }); },
  };
  import('/admin/js/generation-namespace.mjs').then(function(mod) {
    Object.assign(generationApi, mod);
    renderTree();
    const sections = ownerSections(slug).concat(ownerSections('site'));
    const report = generationApi.scanSections(sections);
    generationApi.persistScanReport(report, function(body) {
      return editorRequest('/api/admin/theme-editor/provenance-scan', { method: 'POST', body: JSON.stringify({ report: body }) });
    }).catch(function() { return { ok: false, fatal: false }; });
  }).catch(function() {});

  window.AgentSamEditorGeneration = {
    beginGenerating: beginGenerating,
    endGenerating: endGenerating,
    context: generationSelectionContext,
    wrapper: generationPreviewWrapper,
    currentGenerated: function() {
      const section = currentSection();
      if (!section?.content?.__editor?.generated) return null;
      return {
        definition: {
          kind: 'section', type:section.content.__editor.definitionKey,
          settings:section.content.__editor.generatedSettingsSchema || {},
          implementation_class:section.content.__editor.implementationClass || 'artifact_static',
        },
        implementation_class:section.content.__editor.implementationClass || 'artifact_static',
        settings: Object.fromEntries(Object.entries(section.content).filter(function([key]) { return key !== '__editor'; })),
        canonical: section.implementation || null,
      };
    },
    restoreGenerated: async function(revisionNumber,expectedVersion) {
      const key = activeSectionKey;
      const response = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) +
        '/sections/' + encodeURIComponent(key) + '/generated-restore',{
          method:'POST',body:JSON.stringify({revisionNumber,expectedVersion}),
        });
      if (!response.ok) throw new Error(response.error || 'Restore failed');
      await loadPage();
      selectSection(key,null,true,slug);
      setNote('Previous section revision restored privately. Publish separately when ready.','success');
      return response;
    },
    acceptGenerated: async function(record, provenance, options = {}) {
      if (host) throw new Error('Generated section installation requires the native FNF CMS host.');
      if (liveUnimported) throw new Error('Open the private page draft before installing a generated section.');
      if (dirty || saveInFlight) {
        if (!(await saveDraft())) throw new Error('Save existing edits before installing.');
      }
      const response = await editorRequest('/api/admin/cms/pages/' + encodeURIComponent(slug) + '/generated-accept', {
        method: 'POST',
        body: JSON.stringify({ record, provenance, sectionKey: options.sectionKey,
          expectedVersion: options.expectedVersion }),
      });
      if (!response.ok) throw new Error(response.error || 'Generated section installation failed');
      activeSectionOwner = slug;
      activeSectionKey = response.section_key;
      activeBlockId = null;
      activeFieldKey = null;
      await loadPage();
      selectSection(response.section_key,null,true,slug);
      setNote('AgentSam section installed privately. Review the storefront preview before publishing.', 'success');
      return response;
    },
  };
  setDevice(device);
  setEditorDrawer('sections', false);
  loadThemeIdentity();
  // Reusable Theme Settings panel edits the existing global brand section.
  // The same standard dirty/save/publish machinery handles the payload;
  // there is no browser-only mock, new theme table, or separate authority.
  window.CmsThemeSettings = {
    read: function() {
      const brand = ownerSections('site').find(function(section) { return section.key === 'brand'; });
      return brand ? structuredClone(brand.content?.__editor?.themeSettings || {}) : null;
    },
    update: function(settings) {
      const brand = ownerSections('site').find(function(section) { return section.key === 'brand'; });
      if (!brand || !settings || liveUnimported) return false;
      const previous = structuredClone(brand.content || {});
      if (!brand.content.__editor) brand.content.__editor = {};
      brand.content.__editor.themeSettings = structuredClone(settings);
      if (JSON.stringify(previous) === JSON.stringify(brand.content)) return true;
      markSectionDirty(brand);
      scheduleLocalPreview();
      return true;
    },
  };
  if (localShowcase || new URLSearchParams(location.search).get('ui_review') === '1') {
    const save = byId('te-save'); if (save) { save.disabled = true; save.title = 'Read-only UI review · no CMS writes'; }
    const publish = byId('te-publish'); if (publish) { publish.disabled = true; publish.title = 'No publishing from UI review'; }
  }
  window.AgentSamResolveStudio?.registerNavigator?.(nextSlug=>switchPage(nextSlug));
  window.AgentSamResolveStudio?.mount?.();
  loadPage();
})();