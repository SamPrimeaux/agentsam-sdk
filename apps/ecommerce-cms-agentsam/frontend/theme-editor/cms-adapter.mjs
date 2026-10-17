/** Compatibility seam over the existing portable CmsEditorAdapter; UI authority stays in Theme Studio. */
export function createCmsThemeEditorAdapter(cms, siteId, { resolvePreview, uploadMedia } = {}) {
  let site;
  const load = async () => (site = await cms.loadSite(siteId));
  const page = async (slug) => { await load(); const p = site.pages.find((p) => p.slug === slug || p.id === slug); if (!p) throw new Error('cms_page_not_found'); return p; };
  const find = async (slug, key) => { const p = await page(slug); const s = p.sections.find((s) => s.id === key); if (!s) throw new Error('cms_section_not_found'); return { p, s }; };
  const fields = (data, prefix = '') => Object.entries(data || {}).flatMap(([key, value]) => {
    if (key.startsWith('__')) return [];
    const path = prefix ? prefix + '.' + key : key;
    if (value && typeof value === 'object') return fields(value, path);
    return [{ key: path, label: key.replaceAll('_', ' '), type: typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : /image|src|media/.test(key) ? 'media' : /url|href|link/.test(key) ? 'link' : 'text' }];
  });
  const content = (s) => ({ ...structuredClone(s.fields), ...Object.fromEntries(s.blocks.map((b) => [b.id, b.data])), __editor: { templateKey: s.type, visibility: { enabled: s.visible }, blocks: s.blocks.map((b) => ({ id: b.id, templateKey: b.type })) } });
  return {
    capabilities: { publish: true },
    listPages: async () => (await load()).pages.map(({ id, slug, title }) => ({ id, slug, title })),
    async getPage(slug) { const p = await page(slug); return { slug: p.slug, title: p.title, status: p.status, sections: p.sections.map((s, i) => ({ key: s.id, sort_order: i, content: content(s), status: p.status, version: 0 })) }; },
    async getRegistry() {
      await load();
      return { pages: Object.fromEntries(site.pages.map((p) => [p.slug, { sections: Object.fromEntries(p.sections.map((s) => [s.id, { key: s.type, label: s.name, fields: fields(s.fields), blocks: s.blocks.map((b) => ({ key: b.type, label: b.type, fields: fields(b.data) })), capabilities: { reorder: true } }])) }])) };
    },
    async saveDraft(slug, key, draft) {
      const { p, s } = await find(slug, key);
      const next = { ...draft }; delete next.__editor;
      for (const block of s.blocks) { if (next[block.id]) { await cms.updateBlock(block.id, { data: next[block.id] }); delete next[block.id]; } }
      await cms.updateSection(s.id, { fields: next });
      await cms.saveDraft(p.id, {});
      return {};
    },
    async addSection(slug, type, toIndex) { const p = await page(slug); const schema = site.schemas?.sections?.find((s) => s.key === type || s.type === type); const s = await cms.createSection(p.id, { name: schema?.label || type, type, fields: {} }); const ids = [...p.sections.map((s) => s.id)]; ids.splice(toIndex, 0, s.id); await cms.reorderSections(p.id, ids); return { section_key: s.id }; },
    async duplicateSection(slug, key) { const { p, s } = await find(slug, key); const copy = await cms.createSection(p.id, { ...s, id: undefined, blocks: [], name: s.name + ' copy' }); for (const b of s.blocks) await cms.createBlock(copy.id, { type: b.type, data: b.data }); return { section_key: copy.id }; },
    async removeSection(slug, key) { await find(slug, key); await cms.deleteSection(key); return {}; },
    async moveSection(slug, key, index) { const p = await page(slug); const ids = p.sections.map((s) => s.id).filter((id) => id !== key); ids.splice(index, 0, key); await cms.reorderSections(p.id, ids); return {}; },
    async setSectionVisibility(slug, key, enabled) { await find(slug, key); await cms.setSectionVisibility(key, enabled); return {}; },
    async addBlock(slug, key, type) { await find(slug, key); const b = await cms.createBlock(key, { type, data: {} }); return { block_id: b.id }; },
    async duplicateBlock(slug, key, id) { const { s } = await find(slug, key); const b = s.blocks.find((b) => b.id === id); if (!b) throw new Error('cms_block_not_found'); const copy = await cms.createBlock(key, { type: b.type, data: b.data }); return { block_id: copy.id }; },
    async moveBlock(slug, key, id, index) { const { s } = await find(slug, key); const ids = s.blocks.map((b) => b.id).filter((b) => b !== id); ids.splice(index, 0, id); await cms.reorderBlocks(key, ids); return {}; },
    async removeBlock(slug, key, id) { await find(slug, key); await cms.deleteBlock(id); return {}; },
    async publish(slug) { const p = await page(slug); const result = await cms.publish(p.id); return { published_at: result.publishedAt }; },
    async resolvePreview(slug, draft) { const p = await page(slug); if (resolvePreview) return resolvePreview(site, p, draft); const result = await cms.previewDraft(p.id); if (!result.previewUrl) throw new Error('cms_preview_adapter_not_configured'); return { url: result.previewUrl }; },
    listMedia: async () => (await cms.listAssets(siteId)).map((a) => ({ ...a, filename: a.name, content_type: a.mimeType })),
    uploadMedia,
  };
}
