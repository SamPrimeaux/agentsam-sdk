/** Mount the existing Theme Studio in an isolated document. Runtime adapters are supplied by the consumer. */
export function mountThemeEditor(frame, host, { assetsBase = '/theme-editor/' } = {}) {
  const document = frame.contentDocument;
  const window = frame.contentWindow;
  if (!document || !window) throw new Error('theme_editor_frame_unavailable');
  window.AgentSamThemeEditorHost = host;
  const load = (name) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = assetsBase + name;
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
    return load('runtime.js');
  });
}
