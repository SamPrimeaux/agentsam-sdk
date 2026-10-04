export class ThemeEditorCapabilityError extends Error {
  constructor(capability) { super(`Theme editor adapter does not support ${capability}`); this.code = 'theme_editor_capability_unsupported'; this.capability = capability; }
}

/** The FNF DOM surface consumes this bridge; persistence remains in the supplied adapter. */
export function createThemeEditorBridge(adapter) {
  const invoke = (method, ...args) => {
    if (typeof adapter[method] !== 'function') throw new ThemeEditorCapabilityError(method);
    return adapter[method](...args);
  };
  return {
    capabilities: adapter.capabilities || {},
    getRegistry: () => invoke('getRegistry'),
    resolvePreview: (slug, draft) => invoke('resolvePreview', slug, draft),
    uploadMedia: async (files) => new Response(JSON.stringify({ assets: await invoke('uploadMedia', files) }), { headers: { 'content-type': 'application/json' } }),
    async request(path, options = {}) {
      const method = options.method || 'GET';
      const body = options.body ? JSON.parse(options.body) : {};
      const parts = path.split('?')[0].split('/').filter(Boolean).map(decodeURIComponent);
      if (path.startsWith('/api/admin/media')) return { assets: await invoke('listMedia') };
      if (parts.slice(0, 4).join('/') !== 'api/admin/cms/pages') throw new ThemeEditorCapabilityError(path);
      const [, , , , slug, , section, action, block, blockAction] = parts;
      if (!slug) return { pages: await invoke('listPages') };
      if (parts.length === 5) return { page: await invoke('getPage', slug) };
      if (parts[5] === 'publish') return invoke('publish', slug);
      if (!section) return invoke('addSection', slug, body.templateKey, body.toIndex);
      if (parts.length === 7) {
        if (method === 'DELETE') return invoke('removeSection', slug, section);
        return invoke('saveDraft', slug, section, body.content, body.expected_version);
      }
      if (action === 'duplicate') return invoke('duplicateSection', slug, section);
      if (action === 'move') return invoke('moveSection', slug, section, body.toIndex);
      if (action === 'visibility') return invoke('setSectionVisibility', slug, section, body.enabled);
      if (action === 'blocks') {
        if (!block) return invoke('addBlock', slug, section, body.templateKey, body.toIndex);
        if (blockAction === 'duplicate') return invoke('duplicateBlock', slug, section, block);
        if (blockAction === 'move') return invoke('moveBlock', slug, section, block, body.toIndex);
        if (method === 'DELETE') return invoke('removeBlock', slug, section, block);
      }
      throw new ThemeEditorCapabilityError(path);
    },
  };
}
