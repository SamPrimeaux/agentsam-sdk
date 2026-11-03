/* Website product discovery for the hosted AgentSam Online Store.
 * The Theme Store owns the catalog. cms_themes only owns UI appearance. */
(() => {
  const API = window.__AGENTSAM_WEBSITE_THEMES_ENDPOINT;
  if (!API) return;
  const root = document.getElementById('theme-marketplace-grid');
  const search = document.getElementById('theme-marketplace-search');
  const filter = document.getElementById('theme-marketplace-filter');
  const count = document.getElementById('theme-marketplace-count');
  if (!root || !search || !filter || !count) return;
  const ORIGIN = 'https://themes.inneranimalmedia.com';
  let products = [];
  const node = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = String(text);
    return el;
  };
  const trusted = (url, prefix) => {
    try {
      const value = new URL(url);
      return value.origin === ORIGIN && value.pathname.startsWith(prefix) ? value.href : null;
    } catch { return null; }
  };
  const link = (label, href, primary = false) => {
    const a = node('a', primary ? 'btn small' : 'btn ghost small', label);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  };
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const current = filter.value;
    const visible = products.filter(p =>
      (current === 'all' || p.category === current) &&
      (!query || [p.name, p.description, p.category, ...(p.pages || [])].join(' ').toLowerCase().includes(query)));
    count.textContent = visible.length + ' website packages';
    root.replaceChildren();
    if (!visible.length) {
      root.append(node('p', 'theme-marketplace-empty', 'No matching website themes. Change your filters to browse the releases.'));
      return;
    }
    for (const theme of visible) {
      const item = node('article', 'theme-marketplace-item');
      const visual = node('div', 'theme-marketplace-visual');
      const cover = trusted(theme.thumbnail_url, '/previews/');
      if (cover) {
        const image = node('img', 'theme-marketplace-thumb');
        image.src = cover;
        image.loading = 'lazy';
        image.alt = theme.name + ' website theme cover';
        visual.append(image);
      } else {
        visual.append(node('div', 'theme-marketplace-unavailable', theme.name));
      }
      visual.append(node('span', 'theme-marketplace-state',
        theme.release_status === 'published' ? 'Verified release' : 'Preview'));
      const body = node('div', 'theme-marketplace-body');
      body.append(node('span', 'theme-marketplace-category', theme.category),
        node('h3', '', theme.name), node('p', '', theme.description),
        node('div', 'theme-marketplace-meta', theme.sku + ' · v' + theme.version +
          ' · ' + theme.pages.length + ' page layouts'));
      const actions = node('div', 'theme-marketplace-actions');
      const preview = trusted(theme.preview_url, '/theme-packages/');
      const detail = trusted(theme.detail_url, '/themes/');
      const download = trusted(theme.download_url, '/api/themes/');
      if (preview) actions.append(link('Preview original', preview));
      if (detail) actions.append(link('Explore theme', detail));
      if (theme.release_status === 'published' && download)
        actions.append(link('Get verified package', download, true));
      body.append(actions, node('p', 'theme-marketplace-disclaimer',
        theme.release_status === 'published'
          ? 'Compiled website release. Obtaining it does not install or publish a CMS site.'
          : 'Preview only; a verified website package is not yet published.'));
      item.append(visual, body);
      root.append(item);
    }
  };
  const load = async () => {
    count.textContent = 'Connecting to Theme Store…';
    root.replaceChildren(node('p', 'theme-marketplace-empty', 'Loading original website packages…'));
    try {
      const res = await fetch(API, { credentials: 'same-origin', cache: 'no-store' });
      const data = await res.json();
      if (!res.ok || data.ok !== true || !Array.isArray(data.products))
        throw new Error(data.error || 'Website Theme Store unavailable');
      products = data.products.filter(p => p && p.slug && p.name);
      filter.replaceChildren(new Option('All categories', 'all'));
      [...new Set(products.map(p => p.category))].sort().forEach(c => filter.add(new Option(c, c)));
      render();
    } catch (error) {
      count.textContent = 'Catalog unavailable';
      const message = node('div', 'theme-marketplace-empty');
      message.append(node('strong', '', 'Theme Store unavailable'), node('p', '', error.message));
      const retry = node('button', 'btn ghost small', 'Retry');
      retry.type = 'button';
      retry.addEventListener('click', load);
      message.append(retry);
      root.replaceChildren(message);
    }
  };
  search.addEventListener('input', render);
  filter.addEventListener('change', render);
  void load();
})();
