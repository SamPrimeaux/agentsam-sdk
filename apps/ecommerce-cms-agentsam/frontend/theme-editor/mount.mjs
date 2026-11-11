/**
 * The installed CMS editor is isolated in srcdoc. CSS variables do not cross
 * that boundary, so copy the host's *account-shell* semantic tokens into the
 * editor chrome. Storefront/theme preview tokens remain separately scoped.
 */
export const EDITOR_CHROME_TOKEN_MAP = Object.freeze({
  '--color-background': '--te-canvas',
  '--color-card': '--te-panel',
  '--color-border': '--te-border',
  '--color-foreground': '--te-text',
  '--color-muted': '--te-soft',
  '--color-muted-foreground': '--te-muted',
  '--color-accent': '--te-accent',
  '--font-sans': '--te-font',
});

const HOST_THEME_ALIASES = Object.freeze({
  '--color-background': ['--nav-canvas', '--c-canvas'],
  '--color-card': ['--nav-surface', '--c-surface'],
  '--color-border': ['--nav-border', '--c-border'],
  '--color-foreground': ['--nav-text', '--c-ink'],
  '--color-muted': ['--nav-hover'],
  '--color-muted-foreground': ['--nav-muted', '--c-muted'],
  '--color-accent': ['--nav-accent', '--c-accent'],
});

export function syncEditorChromeTokens(hostDocument, editorDocument, explicit = {}) {
  const root = editorDocument?.documentElement;
  if (!root) return;
  // An installed app can itself be embedded. Resolve the nearest available
  // same-origin account-shell theme, without reading storefront preview CSS.
  const documents = [];
  let current = hostDocument;
  for (let depth = 0; current && depth < 4; depth++) {
    documents.push(current);
    try {
      const view = current.defaultView;
      const parent = view?.parent;
      if (!parent || parent === view || !parent.document || parent.document === current) break;
      current = parent.document;
    } catch { break; }
  }
  const computed = documents.flatMap(doc => {
    const nodes = [doc.documentElement, doc.body, doc.querySelector?.('.as-nav-scope')].filter(Boolean);
    return nodes.map(node => {
      try { return doc.defaultView?.getComputedStyle?.(node); }
      catch { return null; }
    });
  });
  for (const [semantic, destination] of Object.entries(EDITOR_CHROME_TOKEN_MAP)) {
    const names = [semantic, ...(HOST_THEME_ALIASES[semantic] || [])];
    const value = explicit[semantic] || computed.map(style => names.map(name => style?.getPropertyValue(name)?.trim()).find(Boolean)).find(Boolean);
    if (typeof value === 'string' && value.trim()) root.style.setProperty(destination, value.trim());
    else root.style.removeProperty(destination);
  }
}

/** Mount the existing Theme Studio in an isolated document. Runtime adapters are supplied by the consumer. */
export function mountThemeEditor(frame, host, { assetsBase = '/theme-editor/' } = {}) {
  const document = frame.contentDocument;
  const window = frame.contentWindow;
  if (!document || !window) throw new Error('theme_editor_frame_unavailable');
  window.AgentSamThemeEditorHost = host;
  document.documentElement.style.setProperty('--te-host-header-height','0px');
  document.documentElement.style.setProperty('--te-host-min-height','0px');

  // The app host owns the account chrome. Do not read the merchant's site
  // design tokens from a nested storefront preview or bake in brand accents.
  const syncChrome = () => {
    syncEditorChromeTokens(frame.ownerDocument, document, host?.chromeTokens);
    const accent = document.documentElement.style.getPropertyValue('--te-accent').trim();
    // Live account theme changes update editor outlines, never storefront CSS.
    try {
      const preview = document.getElementById('theme-preview')?.contentDocument;
      if (preview?.documentElement && accent)
        preview.documentElement.style.setProperty('--cms-editor-selection-color', accent);
    } catch { /* A cross-origin public preview is not editor-controlled. */ }
  };
  syncChrome();
  const parentDocument = frame.ownerDocument;
  const Observer = parentDocument.defaultView?.MutationObserver;
  const observer = Observer ? new Observer(syncChrome) : null;
  const listeners = [];
  let ancestor = parentDocument;
  for (let depth = 0; ancestor && depth < 4; depth++) {
    observer?.observe(ancestor.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    if (ancestor.body) observer?.observe(ancestor.body, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    ancestor.addEventListener('agentsam:theme-change', syncChrome);
    listeners.push(ancestor);
    try {
      const view = ancestor.defaultView;
      const parent = view?.parent;
      if (!parent || parent === view || !parent.document || parent.document === ancestor) break;
      ancestor = parent.document;
    } catch { break; }
  }
  parentDocument.defaultView?.addEventListener('pagehide', () => {
    observer?.disconnect();
    listeners.forEach(doc => doc.removeEventListener('agentsam:theme-change', syncChrome));
  }, { once: true });

  // A srcdoc document does not inherit the product page's styles. Reuse the
  // Console and Side Assistant owners rather than rendering unstyled chrome.
  for(const name of ['admin','console','agentsam','theme-settings-panel','theme-embed-review']) {
    const href='/admin/css/'+name+'.css';
    if(!document.querySelector('link[href="'+href+'"]')) {
      const link=document.createElement('link');link.rel='stylesheet';link.href=href;
      document.head.append(link);
    }
  }

  const load = (name) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = name.startsWith('/') ? name : assetsBase + name;
    script.onload = resolve;
    script.onerror = () => reject(new Error('theme_editor_asset_failed:' + name));
    document.head.append(script);
  });
  return load('shared.js').then(async () => {
    if (typeof host?.adapter?.getRegistry === 'function') {
      const registry = await host.adapter.getRegistry();
      if (registry?.pages && window.SECTION_SCHEMAS) {
        const schemas = { ...window.SECTION_SCHEMAS };
        for (const [slug, page] of Object.entries(registry.pages)) {
          schemas[slug] = { ...(schemas[slug] || {}), ...(page?.sections || {}) };
        }
        window.SECTION_SCHEMAS = schemas;
      }
    }
    await load('runtime.js');
    if(document.querySelector('.theme-studio'))frame.ownerDocument.getElementById('theme-project-loading')?.remove();
    // The platform owns complete panels; every installed theme mounts them.
    await load('/admin/js/theme-settings-panel.js');
    await load('/admin/js/theme-embed-review.js');
  });
}
