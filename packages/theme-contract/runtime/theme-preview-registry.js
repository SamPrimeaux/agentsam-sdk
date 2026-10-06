/* Portable browser registry. No brand names, assets, or store-specific URLs. */
(function (scope) {
  const themes = [];
  const catalog = Object.create(null);
  const renderers = Object.create(null);
  const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

  function register(descriptor) {
    if (!descriptor || !ID.test(descriptor.id || '')) throw new Error('Invalid theme preview ID');
    if (typeof descriptor.name !== 'string' || !descriptor.name.trim()) throw new Error('Theme preview requires a name');
    if (descriptor.render != null && typeof descriptor.render !== 'function') throw new Error('Theme renderer must be a function');
    if (descriptor.catalog != null && !Array.isArray(descriptor.catalog)) throw new Error('Theme catalog must be an array');
    const index = themes.findIndex((item) => item.id === descriptor.id);
    const theme = Object.freeze({
      id: descriptor.id,
      name: descriptor.name,
      description: descriptor.description || '',
      source: descriptor.source || null,
      status: descriptor.status || 'preview',
    });
    if (index >= 0) themes.splice(index, 1, theme);
    else themes.push(theme);
    catalog[descriptor.id] = (descriptor.catalog || []).map((item) => Object.freeze({ ...item }));
    if (descriptor.render) renderers[descriptor.id] = descriptor.render;
    else delete renderers[descriptor.id];
    return theme;
  }

  scope.ThemeStudioPreview = {
    themes,
    catalog,
    register,
    getTheme(id) { return themes.find((item) => item.id === id) || null; },
    render(id, page, site) {
      const renderer = renderers[id];
      return renderer ? renderer(page, site) : null;
    },
  };
})(window);
