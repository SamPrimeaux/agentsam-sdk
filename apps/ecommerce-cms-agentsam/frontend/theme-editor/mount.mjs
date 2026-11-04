/** Mount the existing Theme Studio in an isolated document. Runtime adapters are supplied by the consumer. */
export function mountThemeEditor(frame, host, { assetsBase = '/theme-editor/' } = {}) {
  const document = frame.contentDocument;
  const window = frame.contentWindow;
  if (!document || !window) throw new Error('theme_editor_frame_unavailable');
  window.AgentSamThemeEditorHost = host;
  document.documentElement.style.setProperty('--te-host-header-height','0px');
  document.documentElement.style.setProperty('--te-host-min-height','0px');

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
