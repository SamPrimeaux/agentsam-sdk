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
  let nodes = [...doc.querySelectorAll('main > section, main > header, main > footer, main > article')];
  // A source-rendered website may group its editable content inside a single
  // main container rather than using direct section children. Keep that
  // original markup intact and expose its text/media as editable fields.
  if (!nodes.length) nodes = [...doc.querySelectorAll('main > div, main > figure')];
  if (!nodes.length) nodes = [...doc.querySelectorAll('main')];
  // No <main> is not a reason to turn an entire website into a single
  // uneditable lump. Preserve the source hierarchy and extract real sections.
  if (!nodes.length) nodes = [...doc.querySelectorAll('body section, body article')]
    .filter((el) => !el.parentElement?.closest('section,article'));
  if (!nodes.length) nodes = [...doc.body.children].filter((el) => !['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName));
  // Headers/footers belong to the editable website, not the fixed editor
  // chrome. Capture the existing source elements, including those outside main.
  const globals = [...doc.querySelectorAll('body header,body footer')]
    .filter((el) => !el.closest('main,section,article') && !nodes.some(node => node.contains(el)));
  nodes = [...new Set([...nodes, ...globals])].sort((a, b) =>
    a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 1 : -1);
  const sections = nodes.map((node, index) => {
    const key = `section_${index + 1}`;
    const content = { __editor: { templateKey: key, visibility: { enabled: true }, blocks: [] } };
    const bind = (node, content) => {
    const fields = [];
    const editableSelector = 'h1,h2,h3,h4,h5,h6,p,span,strong,em,small,dt,dd,img,a,button,label,input,textarea';
    const candidates = [...node.querySelectorAll(editableSelector)];
    if (node.matches(editableSelector)) candidates.unshift(node);
    candidates.filter((el) => ['IMG','A','INPUT','TEXTAREA'].includes(el.tagName) || !el.children.length)
      // Repeated product grids can contain thousands of decorative spans.
      // Keep the inspector usable while retaining the original untouched DOM.
      .slice(0, 350).forEach((el, i) => {
      const field = `field_${i + 1}`;
      const image = el.tagName === 'IMG';
      const link = el.tagName === 'A';
      const hasChildren = !!el.children.length;
      const input = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      const attribute = image ? 'src' : input ? 'placeholder' : link && hasChildren ? 'href' : undefined;
      // Never replace a composite icon/link subtree with plain text.
      if (!attribute && hasChildren) return;
      el.setAttribute('data-theme-project-field', field);
      const label = (el.getAttribute('aria-label') || el.getAttribute('alt') || el.textContent || el.tagName).trim().slice(0, 60);
      content[field] = attribute ? el.getAttribute(attribute) || '' : el.textContent || '';
      fields.push({ key: field, label: attribute === 'href' ? 'Link destination: ' + label : label,
        type: image ? 'media' : attribute === 'href' ? 'link' : 'text', binding: attribute ? { attribute } : {} });
      if (link && !hasChildren) {
        const href = field + '_href';
        content[href] = el.getAttribute('href') || '';
        fields.push({ key: href, label: 'Link destination', type: 'link', binding: { field, attribute: 'href' } });
      }
      if (image) {
        const alt = field + '_alt';
        content[alt] = el.getAttribute('alt') || '';
        fields.push({ key: alt, label: 'Image alternative text', type: 'text', binding: { field, attribute: 'alt' } });
      }
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
    const globalKey = ['HEADER', 'FOOTER'].includes(node.tagName) && !node.closest('main,section,article')
      ? 'site-' + node.tagName.toLowerCase() : null;
    const section = { key, name: globalKey ? (node.tagName === 'HEADER' ? 'Site header' : 'Site footer') : name, ...(globalKey ? { globalKey } : {}),
      html: node.outerHTML, content, version: 0, status: 'draft', sort_order: index,
      schema: { key, label: globalKey ? (node.tagName === 'HEADER' ? 'Site header' : 'Site footer') : name, fields, settings, blocks, capabilities: { reorder: true } } };
    node.replaceWith(doc.createComment('theme-section:' + key));
    return section;
  });
  return { slug, title, assetBase: baseUrl, status: 'draft', template: '<!DOCTYPE html>' + doc.documentElement.outerHTML, sections };
}

/**
 * An iframe srcdoc runs on the AgentSam origin, not the Theme Store origin.
 * Root-relative paths ignore <base>, so package CSS/images must resolve to
 * their immutable release host. Restrict rewriting to this release's prefix.
 */
export function absolutizeThemePreviewPaths(html, baseUrl) {
  if (!baseUrl || typeof html !== 'string') return html;
  let origin, prefix;
  try {
    const url = new URL(baseUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return html;
    origin = url.origin;
    prefix = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
  } catch { return html; }
  if (!/^\/theme-packages\/[a-z0-9-]+\/\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?\/preview\/$/.test(prefix)) return html;
  return html.replace(/(\b(?:href|src|poster)\s*=\s*)(["'])(\/theme-packages\/[^"'\s<>]*)\2/g, (match, start, quote, value) =>
    value.startsWith(prefix) ? start + quote + origin + value + quote : match);
}

export function renderThemePage(page, tokens = {}, { baseUrl } = {}) {
  const fragments = page.sections.filter((s) => s.content.__editor?.visibility?.enabled !== false).map((section) => {
    const doc = new DOMParser().parseFromString(section.html, 'text/html');
    const apply = (doc, fields, content) => {
    for (const field of fields || []) {
      const el = doc.querySelector(`[data-theme-project-field="${field.binding?.field || field.key}"]`);
      if (!el) continue;
      el.setAttribute('data-cms',field.binding?.field||field.key);
      const value = content[field.key];
      if (value === undefined) continue;
      if (field.binding?.styleProperty) el.style.setProperty(field.binding.styleProperty, String(value));
      else if (field.binding?.attribute) el.setAttribute(field.binding.attribute, String(value));
      else el.textContent = String(value);
    }
    };
    apply(doc, [...(section.schema.fields || []), ...(section.schema.settings || [])], section.content);
    doc.body.firstElementChild?.setAttribute('data-theme-section', section.key);
    doc.body.firstElementChild?.setAttribute('data-cms-section', section.key);
    const blockFragments = (section.content.__editor?.blocks || []).map((block) => {
      const template = section.schema.blocks?.find((b) => b.key === block.templateKey);
      if (!template?.html) return '';
      const blockDoc = new DOMParser().parseFromString(template.html, 'text/html');
      apply(blockDoc, template.fields, section.content[block.id] || {});
      blockDoc.body.firstElementChild?.setAttribute('data-theme-block-id', block.id);
      blockDoc.body.firstElementChild?.setAttribute('data-cms-block', block.id);
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
  return absolutizeThemePreviewPaths(html, baseUrl);
}

/** Store is injected: IndexedDB, filesystem, SQLite or HTTP all share the same editing model. */
export function createThemeProjectAdapter(project, store, { publish, resolveAssetBase = (base) => base, listMedia, uploadMedia } = {}) {
  let state = validateThemeProject(project);
  state.sectionTemplates ||= Object.fromEntries(state.pages.flatMap((p) => p.sections).map((s) => [s.schema.key, clone(s)]));
  const get = (slug) => { const p = state.pages.find((p) => p.slug === slug); if (!p) throw new Error('theme_page_not_found'); return p; };
  const section = (slug, key) => { const s = get(slug).sections.find((s) => s.key === key); if (!s) throw new Error('theme_section_not_found'); return s; };
  const persist = async () => {
    const expectedVersion = Number(state.revision || 0);
    const candidate = clone(state);
    candidate.revision = expectedVersion + 1;
    candidate.updatedAt = new Date().toISOString();
    const saved = await store.save(candidate, { expectedVersion });
    state = validateThemeProject(saved || candidate);
    return clone(state);
  };
  return {
    capabilities: { publish: Boolean(publish) },
    getProject: async () => clone(state),
    getThemeIdentity: async () => ({ name: state.name, status: 'Draft' }),
    async updatePageSettings(slug, { name, title, tokens }) {
      if (typeof name !== 'string' || !name.trim() || typeof title !== 'string' || !title.trim()) throw new Error('theme_settings_invalid');
      state.name = name.trim(); get(slug).title = title.trim();
      state.tokens = Object.fromEntries(Object.entries(tokens || {}).filter(([key, value]) => /^--[a-zA-Z0-9-]+$/.test(key) && typeof value === 'string'));
      await persist(); return clone(state);
    },
    listPages: async () => state.pages.map(({ slug, title }) => ({ slug, title })),
    getPage: async (slug) => {
      const page = clone(get(slug));
      page.sections = page.sections.map((item, index) => ({
        ...item,
        type: item.type || item.schema?.key || item.key,
        preset: item.preset || item.schema?.key || item.key,
        sort_order: item.sort_order ?? index,
      }));
      return page;
    },
    getRegistry: async () => ({ pages: Object.fromEntries(state.pages.map((p) => [p.slug, { sections: { ...Object.fromEntries(Object.values(state.sectionTemplates).map((s) => [s.schema.key, s.schema])), ...Object.fromEntries(p.sections.map((s) => [s.key, s.schema])) } }])) }),
    resolvePreview: async (slug, draft) => { const p = draft || get(slug); return { html: renderThemePage(p, state.tokens, { baseUrl: p.assetBase ? await resolveAssetBase(p.assetBase) : undefined }) }; },
    async saveDraft(slug, key, content, expectedVersion) {
      const latest = await store.get(state.id);
      if (latest) { const templates = state.sectionTemplates; state = validateThemeProject(latest); state.sectionTemplates ||= templates; }
      const s = section(slug, key);
      if (s.version !== expectedVersion) { const error = new Error('Draft changed in another editor'); error.status = 409; throw error; }
      s.content = clone(content); s.version += 1; s.status = 'draft';
      // Shared site chrome: a header/footer edit applies to the installed
      // site's other pages, not to the immutable marketplace release.
      if (s.globalKey) for (const p of state.pages) {
        if (p.slug === slug) continue;
        for (const sibling of p.sections.filter(item => item.globalKey === s.globalKey)) {
          const fields = (s.schema.fields || []).map(field => field.key);
          const siblingFields = (sibling.schema.fields || []).map(field => field.key);
          if (fields.join('|') !== siblingFields.join('|')) continue;
          sibling.content = clone(content);
          sibling.version = Number(sibling.version || 0) + 1;
          sibling.status = 'draft';
        }
      }
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
    listMedia: async () => typeof listMedia === 'function' ? clone(await listMedia()) : clone(state.media || []),
    async uploadMedia(files) {
      if (typeof uploadMedia === 'function') return uploadMedia(files);
      const assets = await Promise.all(files.map((file) => new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onerror = reject;
        reader.onload = () => resolve({ id: crypto.randomUUID(), filename: file.name, content_type: file.type, url: reader.result }); reader.readAsDataURL(file);
      })));
      state.media = [...(state.media || []), ...assets]; await persist(); return assets;
    },
  };
}
