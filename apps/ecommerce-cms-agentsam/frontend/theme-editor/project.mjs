export const THEME_PROJECT_SCHEMA = 'agentsam.theme-project.v1';
const clone = (value) => structuredClone(value);
const safeKey = (key) => typeof key === 'string' && /^[a-zA-Z0-9_-]+$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key);

export function validateThemeProject(value) {
  if (!value || value.schema !== THEME_PROJECT_SCHEMA || !safeKey(value.id) || typeof value.name !== 'string' || !Array.isArray(value.pages) || !value.pages.length) throw new Error('theme_project_invalid');
  for (const page of value.pages) {
    if (!safeKey(page.slug) || typeof page.template !== 'string' || !Array.isArray(page.sections)) throw new Error('theme_project_page_invalid');
    for (const section of page.sections) {
      if (!safeKey(section.key) || typeof section.html !== 'string' || !section.content || !section.schema) throw new Error('theme_project_section_invalid');
      for (const field of section.schema.fields || []) if (!safeKey(field.key) || (field.binding?.field && !safeKey(field.binding.field))) throw new Error('theme_project_field_invalid');
      for (const block of section.schema.blocks || []) {
        if (!safeKey(block.key)) throw new Error('theme_project_block_invalid');
        for (const field of block.fields || []) if (!safeKey(field.key) || (field.binding?.field && !safeKey(field.binding.field))) throw new Error('theme_project_field_invalid');
      }
    }
  }
  return clone(value);
}

/** Deterministic HTML bindings preserve the actual theme markup, CSS and structure. */
export function extractThemePage(html, { slug = 'home', title = 'Home', baseUrl = '' } = {}) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  if (baseUrl) { const base = doc.createElement('base'); base.href = baseUrl; doc.head.prepend(base); }
  let nodes = [...doc.querySelectorAll('main > section, main > header, main > footer')];
  if (!nodes.length) nodes = [...doc.body.children].filter((el) => !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName));
  const sections = nodes.map((node, index) => {
    const key = `section_${index + 1}`;
    const content = { __editor: { templateKey: key, visibility: { enabled: true }, blocks: [] } };
    const bind = (node, content) => {
    const fields = [];
    const candidates = [...node.querySelectorAll('h1,h2,h3,h4,p,img,a,button,label')];
    if (node.matches('h1,h2,h3,h4,p,img,a,button,label')) candidates.unshift(node);
    candidates.filter((el) => el.tagName === 'IMG' || !el.children.length).forEach((el, i) => {
      const field = `field_${i + 1}`;
      el.setAttribute('data-theme-project-field', field);
      const attribute = el.tagName === 'IMG' ? 'src' : undefined;
      content[field] = attribute ? el.getAttribute(attribute) || '' : el.textContent || '';
      fields.push({ key: field, label: el.getAttribute('alt') || (el.textContent || el.tagName).trim().slice(0, 60), type: attribute ? 'media' : 'text', binding: { attribute } });
      if (el.tagName === 'A') { const link = field + '_href'; content[link] = el.getAttribute('href') || ''; fields.push({ key: link, label: 'Link destination', type: 'link', binding: { field, attribute: 'href' } }); }
    });
    return fields;
    };
    const blockSelector = 'article,li,[data-theme-block],.card';
    const blocks = [...node.querySelectorAll(blockSelector)].filter((el) => {
      const ancestor = el.parentElement?.closest(blockSelector); return !ancestor || !node.contains(ancestor);
    }).map((el, i) => {
      const blockId = `block_${i + 1}`, values = {};
      const fields = bind(el, values);
      const label = el.querySelector('h2,h3,h4')?.textContent?.trim().slice(0, 60) || `Block ${i + 1}`;
      content[blockId] = values;
      content.__editor.blocks.push({ id: blockId, templateKey: blockId });
      const html = el.outerHTML;
      el.replaceWith(doc.createComment('theme-block:' + blockId));
      return { key: blockId, label, fields, settings: [], html, defaults: values };
    });
    const fields = bind(node, content);
    node.setAttribute('data-theme-section', key);
    node.setAttribute('data-theme-project-field', '__section');
    const settings = [
      { key: 'layout_padding', label: 'Padding', type: 'text', group: 'Spacing', binding: { field: '__section', styleProperty: 'padding' } },
      { key: 'layout_background', label: 'Background', type: 'text', group: 'Surface', binding: { field: '__section', styleProperty: 'background' } },
    ];
    content.layout_padding = node.style.padding; content.layout_background = node.style.background;
    const name = node.querySelector('h1,h2,h3')?.textContent?.trim().slice(0, 60) || node.getAttribute('aria-label') || `Section ${index + 1}`;
    const section = { key, name, html: node.outerHTML, content, version: 0, status: 'draft', sort_order: index, schema: { key, label: name, fields, settings, blocks, capabilities: { reorder: true } } };
    node.replaceWith(doc.createComment('theme-section:' + key));
    return section;
  });
  return { slug, title, assetBase: baseUrl, status: 'draft', template: '<!DOCTYPE html>' + doc.documentElement.outerHTML, sections };
}

export function renderThemePage(page, tokens = {}, { baseUrl } = {}) {
  const fragments = page.sections.filter((s) => s.content.__editor?.visibility?.enabled !== false).map((section) => {
    const doc = new DOMParser().parseFromString(section.html, 'text/html');
    const apply = (doc, fields, content) => {
    for (const field of fields || []) {
      const el = doc.querySelector(`[data-theme-project-field="${field.binding?.field || field.key}"]`);
      if (!el) continue;
      const value = content[field.key];
      if (value === undefined) continue;
      if (field.binding?.styleProperty) el.style.setProperty(field.binding.styleProperty, String(value));
      else if (field.binding?.attribute) el.setAttribute(field.binding.attribute, String(value));
      else el.textContent = String(value);
    }
    };
    apply(doc, [...(section.schema.fields || []), ...(section.schema.settings || [])], section.content);
    doc.body.firstElementChild?.setAttribute('data-theme-section', section.key);
    const blockFragments = (section.content.__editor?.blocks || []).map((block) => {
      const template = section.schema.blocks?.find((b) => b.key === block.templateKey);
      if (!template?.html) return '';
      const blockDoc = new DOMParser().parseFromString(template.html, 'text/html');
      apply(blockDoc, template.fields, section.content[block.id] || {});
      blockDoc.body.firstElementChild?.setAttribute('data-theme-block-id', block.id);
      return blockDoc.body.innerHTML;
    });
    let j = 0;
    const blockMarker = /<!--theme-block:[^>]+-->/g;
    const blockCount = [...doc.body.innerHTML.matchAll(blockMarker)].length;
    if (blockCount) doc.body.innerHTML = doc.body.innerHTML.replace(blockMarker, () => ++j === blockCount ? blockFragments.slice(j - 1).join('') : blockFragments[j - 1] || '');
    return doc.body.innerHTML;
  });
  let i = 0;
  const marker = /<!--theme-section:[^>]+-->/g;
  const count = [...page.template.matchAll(marker)].length;
  let html = page.template.replace(marker, () => ++i === count ? fragments.slice(i - 1).join('') : fragments[i - 1] || '');
  if (baseUrl) { const doc = new DOMParser().parseFromString(html, 'text/html'); const base = doc.querySelector('base') || doc.head.prepend(doc.createElement('base')); doc.querySelector('base').href = baseUrl; html = '<!DOCTYPE html>' + doc.documentElement.outerHTML; }
  // Preview tokens live only in the customer document, never the editor chrome.
  const vars = Object.entries(tokens).filter(([k]) => /^--[a-zA-Z0-9-]+$/.test(k)).map(([k, v]) => `${k}:${String(v).replace(/[<>;]/g, '')}`).join(';');
  html = html.replace('</head>', `<style>:root{${vars}}</style></head>`);
  html = html.replace('</body>', `<script>document.addEventListener('click',function(e){const s=e.target.closest('[data-theme-section]');if(!s)return;e.preventDefault();const b=e.target.closest('[data-theme-block-id]');parent.postMessage({type:'agentsam:theme-preview-select',section:s.dataset.themeSection,block:b?b.dataset.themeBlockId:null},'*')});<\/script></body>`);
  return html;
}

/** Store is injected: IndexedDB, filesystem, SQLite or HTTP all share the same editing model. */
export function createThemeProjectAdapter(project, store, { publish, resolveAssetBase = (base) => base } = {}) {
  let state = validateThemeProject(project);
  state.sectionTemplates ||= Object.fromEntries(state.pages.flatMap((p) => p.sections).map((s) => [s.schema.key, clone(s)]));
  const get = (slug) => { const p = state.pages.find((p) => p.slug === slug); if (!p) throw new Error('theme_page_not_found'); return p; };
  const section = (slug, key) => { const s = get(slug).sections.find((s) => s.key === key); if (!s) throw new Error('theme_section_not_found'); return s; };
  const persist = async () => { state.updatedAt = new Date().toISOString(); await store.save(clone(state)); };
  return {
    capabilities: { publish: Boolean(publish) },
    getProject: async () => clone(state),
    async updatePageSettings(slug, { name, title, tokens }) {
      if (typeof name !== 'string' || !name.trim() || typeof title !== 'string' || !title.trim()) throw new Error('theme_settings_invalid');
      state.name = name.trim(); get(slug).title = title.trim();
      state.tokens = Object.fromEntries(Object.entries(tokens || {}).filter(([key, value]) => /^--[a-zA-Z0-9-]+$/.test(key) && typeof value === 'string'));
      await persist(); return clone(state);
    },
    listPages: async () => state.pages.map(({ slug, title }) => ({ slug, title })),
    getPage: async (slug) => clone(get(slug)),
    getRegistry: async () => ({ pages: Object.fromEntries(state.pages.map((p) => [p.slug, { sections: { ...Object.fromEntries(Object.values(state.sectionTemplates).map((s) => [s.schema.key, s.schema])), ...Object.fromEntries(p.sections.map((s) => [s.key, s.schema])) } }])) }),
    resolvePreview: async (slug, draft) => { const p = draft || get(slug); return { html: renderThemePage(p, state.tokens, { baseUrl: p.assetBase ? await resolveAssetBase(p.assetBase) : undefined }) }; },
    async saveDraft(slug, key, content, expectedVersion) {
      const latest = await store.get(state.id);
      if (latest) { const templates = state.sectionTemplates; state = validateThemeProject(latest); state.sectionTemplates ||= templates; }
      const s = section(slug, key);
      if (s.version !== expectedVersion) { const error = new Error('Draft changed in another editor'); error.status = 409; throw error; }
      s.content = clone(content); s.version += 1; s.status = 'draft';
      await persist(); return { version: s.version, updated_at: state.updatedAt };
    },
    async addSection(slug, key, toIndex) {
      const source = state.sectionTemplates[key];
      if (!source) throw new Error('theme_section_template_not_found');
      const s = clone(source); s.key = 'section_' + crypto.randomUUID().replaceAll('-', ''); s.version = 0;
      get(slug).sections.splice(toIndex, 0, s); await persist(); return { section_key: s.key };
    },
    async duplicateSection(slug, key) { const s = clone(section(slug, key)); s.key = 'section_' + crypto.randomUUID().replaceAll('-', ''); s.version = 0; get(slug).sections.splice(get(slug).sections.findIndex((x) => x.key === key) + 1, 0, s); await persist(); return { section_key: s.key }; },
    async removeSection(slug, key) { const p = get(slug); p.sections = p.sections.filter((s) => s.key !== key); await persist(); return {}; },
    async moveSection(slug, key, index) { const p = get(slug); const i = p.sections.findIndex((s) => s.key === key); if (i < 0) throw new Error('theme_section_not_found'); const [s] = p.sections.splice(i, 1); p.sections.splice(index, 0, s); await persist(); return {}; },
    async setSectionVisibility(slug, key, enabled) { section(slug, key).content.__editor.visibility.enabled = enabled; await persist(); return {}; },
    async addBlock(slug, key, templateKey, toIndex) {
      const s = section(slug, key); const template = s.schema.blocks.find((b) => b.key === templateKey);
      if (!template) throw new Error('theme_block_template_not_found');
      const id = 'block_' + crypto.randomUUID().replaceAll('-', '');
      s.content[id] = clone(template.defaults || {});
      s.content.__editor.blocks.splice(toIndex, 0, { id, templateKey }); await persist(); return { block_id: id };
    },
    async duplicateBlock(slug, key, id) { const s = section(slug, key); const blocks = s.content.__editor.blocks; const i = blocks.findIndex((b) => b.id === id); if (i < 0) throw new Error('theme_block_not_found'); const next = 'block_' + crypto.randomUUID().replaceAll('-', ''); s.content[next] = clone(s.content[id]); blocks.splice(i + 1, 0, { ...blocks[i], id: next }); await persist(); return { block_id: next }; },
    async removeBlock(slug, key, id) { const s = section(slug, key); s.content.__editor.blocks = s.content.__editor.blocks.filter((b) => b.id !== id); delete s.content[id]; await persist(); return {}; },
    async moveBlock(slug, key, id, index) { const s = section(slug, key); const blocks = s.content.__editor.blocks; const i = blocks.findIndex((b) => b.id === id); if (i < 0) throw new Error('theme_block_not_found'); const [b] = blocks.splice(i, 1); blocks.splice(index, 0, b); await persist(); return {}; },
    async publish(slug) { if (!publish) throw new Error('theme_publish_adapter_not_configured'); return publish(clone(state), slug); },
    listMedia: async () => clone(state.media || []),
    async uploadMedia(files) {
      const assets = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onerror = reject;
        reader.onload = () => resolve({ id: crypto.randomUUID(), filename: file.name, content_type: file.type, url: reader.result }); reader.readAsDataURL(file);
      })));
      state.media = [...(state.media || []), ...assets]; await persist(); return assets;
    },
  };
}
