// GENERATED from packages/theme-contract/editor/project.mjs. DO NOT EDIT.
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
    a.compareDocumentPosition(b) & 2 ? 1 : -1);
  const sections = nodes.map((node, index) => {
    const key = `section_${index + 1}`;
    const content = { __editor: { templateKey: key, visibility: { enabled: true }, blocks: [] } };
    const bind = (node, content) => {
    const fields = [];
    // Keys and inspector groups describe semantic CMS controls, not the
    // brand-specific donor copy. Every theme uses the same field families.
    const counts = {heading: 0, text: 0, media: 0, link: 0, action: 0, input: 0};
    const editableSelector = 'h1,h2,h3,h4,h5,h6,p,span,strong,em,small,dt,dd,img,a,button,label,input,textarea';
    const candidates = [...node.querySelectorAll(editableSelector)];
    if (node.matches(editableSelector)) candidates.unshift(node);
    candidates.filter((el) => ['IMG','A','INPUT','TEXTAREA'].includes(el.tagName) || !el.children.length)
      // Repeated product grids can contain thousands of decorative spans.
      // Keep the inspector usable while retaining the original untouched DOM.
      .slice(0, 350).forEach((el, i) => {
      const image = el.tagName === 'IMG';
      const link = el.tagName === 'A';
      const hasChildren = !!el.children.length;
      const input = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
      const action = el.tagName === 'BUTTON';
      const heading = /^H[1-6]$/.test(el.tagName) || !!el.closest('h1,h2,h3,h4,h5,h6');
      const family = image ? 'media' : input ? 'input' : action ? 'action'
        : link ? 'link' : heading ? 'heading' : 'text';
      const attribute = image ? 'src' : input ? 'placeholder' : link && hasChildren ? 'href' : undefined;
      if (!attribute && hasChildren) return; // Preserve nested visual markup.
      const field = family + '_' + (++counts[family]);
      const group = image ? 'Media' : input ? 'Forms' : link || action ? 'Actions' : 'Content';
      el.setAttribute('data-theme-project-field', field);
      const explicitLabel = el.getAttribute('data-cms-label') || el.getAttribute('aria-label') || el.getAttribute('alt');
      const label = (explicitLabel || (heading ? 'Heading' : family === 'text' ? 'Text' :
        family === 'link' ? 'Link' : family === 'input' ? 'Placeholder' : 'Action')).trim().slice(0, 60);
      content[field] = attribute ? el.getAttribute(attribute) || '' : el.textContent || '';
      fields.push({ key: field, label, group,
        type: image ? 'media' : attribute === 'href' ? 'link' : 'text',
        binding: attribute ? { attribute } : {} });
      if (link && !hasChildren) {
        const href = field + '_href';
        content[href] = el.getAttribute('href') || '';
        fields.push({ key: href, label: 'Link destination', group: 'Actions',
          type: 'link', binding: { field, attribute: 'href' } });
      }
      if (image) {
        const alt = field + '_alt';
        content[alt] = el.getAttribute('alt') || '';
        fields.push({ key: alt, label: 'Image alternative text',
          group: 'Accessibility', type: 'text', binding: { field, attribute: 'alt' } });
      }
    });
    return fields;
    };
    const blockSelector = 'article,li,[data-theme-block],[data-cms-group],.card';
    const blocks = [...node.querySelectorAll(blockSelector)].filter((el) => {
      // Navigation links belong to a shared header/footer, not an accidental
      // collection of repeatable merchandising cards.
      if (['HEADER','FOOTER'].includes(node.tagName) &&
          el.tagName === 'LI' && !el.hasAttribute('data-theme-block')) return false;
      const ancestor = el.parentElement?.closest(blockSelector);
      return !ancestor || !node.contains(ancestor);
    }).map((el, i) => {
      const blockId = `block_${i + 1}`, values = {};
      const fields = bind(el, values);
      const label = el.querySelector('h2,h3,h4')?.textContent?.trim().slice(0, 60) || `Block ${i + 1}`;
      content[blockId] = values;
      content.__editor.blocks.push({ id: blockId, templateKey: blockId });
      const html = el.outerHTML;
      el.replaceWith(doc.createComment('theme-block:' + blockId));
      const group = el.hasAttribute('data-cms-group');
      const blockLabel = el.getAttribute('data-cms-label') ||
        el.getAttribute('data-cms-group') || label;
      return { key: blockId, label: blockLabel, kind: group ? 'group' : 'block',
        fields, settings: [], html, defaults: values,
        capabilities: { duplicate: true, reorder: true, reusable: true } };
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
    const zone = globalKey === 'site-header' ? 'HEADER' :
      globalKey === 'site-footer' ? 'FOOTER' : 'BODY';
    const sectionLabel = globalKey ? (node.tagName === 'HEADER' ? 'Site header' : 'Site footer') : name;
    const sourceKind = (node.getAttribute('data-cms-type') || (globalKey ? globalKey : 'content-section'))
      .replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const section = { key, name: sectionLabel, ...(globalKey ? { globalKey } : {}),
      zone, sourceKind, html: node.outerHTML, content, version: 0,
      status: 'draft', sort_order: index,
      schema: { key, label: sectionLabel, zone, sourceKind, fields, settings, blocks,
        capabilities: { reorder: !globalKey, duplicate: !globalKey, reusable: true } } };
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
      else if (field.binding?.attribute) {
        // Blank media values must not load the preview document as an image.
        if (field.binding.attribute === 'src' && !String(value).trim())
          el.removeAttribute('src');
        else el.setAttribute(field.binding.attribute, String(value));
      }
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

/**
 * A section instance key belongs to its PAGE; a reusable section definition
 * belongs to the installed SITE. The old importer reused section_1 on every
 * page, so a flat sectionTemplates map silently overwrote all but one.
 *
 * Stable source identities allow cross-page repurposing without inventing a
 * new registry or copying domain objects from the customer's CMS.
 */
export function sourceSectionTemplateKey(pageSlug, sectionKey) {
  const normalize = value => String(value || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const source = normalize(pageSlug) + ':' + normalize(sectionKey);
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return 'source-' + normalize(pageSlug).slice(0, 32) + '-' +
    normalize(sectionKey).slice(0, 14) + '-' + (hash >>> 0).toString(36);
}

function installSourceTemplates(state, inherited = {}) {
  const catalog = Object.fromEntries(Object.entries(inherited || {}).filter(([key]) =>
    key.startsWith('source-') || key.startsWith('custom-')));
  for (const page of state.pages) {
    for (const section of page.sections) {
      // A duplicated/inserted instance points back to its source module;
      // it must not mint another apparent definition on every reuse.
      if (section.sourceTemplateKey) continue;
      const id = sourceSectionTemplateKey(page.slug, section.key);
      if (catalog[id]) continue;
      const source = clone(section);
      source.sourcePage = page.slug;
      source.schema = { ...source.schema, key: id,
        label: source.name || source.schema.label || id,
        templateKey: id, sourceKind: source.sourceKind || 'content-section' };
      catalog[id] = source;
    }
  }
  return catalog;
}

/** Store is injected: IndexedDB, filesystem, SQLite or HTTP all share the same editing model. */
export function createThemeProjectAdapter(project, store, { publish, resolveAssetBase = (base) => base, listMedia, uploadMedia } = {}) {
  let state = validateThemeProject(project);
  state.sectionTemplates = installSourceTemplates(state, state.sectionTemplates);
  const get = (slug) => { const p = state.pages.find((p) => p.slug === slug); if (!p) throw new Error('theme_page_not_found'); return p; };
  const section = (slug, key) => { const s = get(slug).sections.find((s) => s.key === key); if (!s) throw new Error('theme_section_not_found'); return s; };
  const persist = async () => {
    const expectedVersion = Number(state.revision || 0);
    const templates = state.sectionTemplates;
    const candidate = clone(state);
    // The registry is a *derived view of source sections*, not a second
    // persisted website or duplicated R2 payload.
    delete candidate.sectionTemplates;
    candidate.revision = expectedVersion + 1;
    candidate.updatedAt = new Date().toISOString();
    const saved = await store.save(candidate, { expectedVersion });
    state = validateThemeProject(saved || candidate);
    state.sectionTemplates = installSourceTemplates(state, templates);
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
        type: item.type || item.sourceKind || item.schema?.sourceKind || item.key,
        preset: item.preset || sourceSectionTemplateKey(slug, item.key),
        sort_order: item.sort_order ?? index,
      }));
      return page;
    },
    getRegistry: async () => ({ pages: Object.fromEntries(state.pages.map((p) =>
      [p.slug, { sections: {
        ...Object.fromEntries(Object.entries(state.sectionTemplates).map(([id,s]) =>
          [id, { ...s.schema, key: id, label: s.name, sourcePage: s.sourcePage,
            sourceKind: s.sourceKind, capabilities: { ...s.schema.capabilities, insert: true } }])),
        ...Object.fromEntries(p.sections.map((s) => [s.key, s.schema])),
      } }])) }),
    resolvePreview: async (slug, draft) => { const p = draft || get(slug); return { html: renderThemePage(p, state.tokens, { baseUrl: p.assetBase ? await resolveAssetBase(p.assetBase) : undefined }) }; },
    async saveDraft(slug, key, content, expectedVersion) {
      const latest = await store.get(state.id);
      if (latest) { const templates = state.sectionTemplates;
        state = validateThemeProject(latest);
        state.sectionTemplates = installSourceTemplates(state, templates); }
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
      const s = clone(source);
      s.key = 'section_' + crypto.randomUUID().replaceAll('-', '');
      s.content.__editor.templateKey = key;
      s.sourceTemplateKey = key;
      s.schema.key = key;
      s.sourceKind = source.sourceKind || 'content-section';
      s.version = 0;
      get(slug).sections.splice(toIndex, 0, s);
      await persist(); return { section_key: s.key };
    },
    async duplicateSection(slug, key) {
      const original = section(slug, key);
      const s = clone(original);
      s.sourceTemplateKey = original.sourceTemplateKey || sourceSectionTemplateKey(slug, key);
      s.content.__editor.templateKey = s.sourceTemplateKey;
      s.key = 'section_' + crypto.randomUUID().replaceAll('-', '');
      s.version = 0;
      get(slug).sections.splice(get(slug).sections.findIndex((x) => x.key === key) + 1, 0, s);
      await persist(); return { section_key: s.key };
    },
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
