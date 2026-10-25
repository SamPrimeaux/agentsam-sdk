/** Product-owned mobile dock. agent/nav actions use the existing shell. */
const GLYPHS = {
  home: '<path d="M3 11 12 4l9 7M6 10v10h12V10"/>',
  products: '<path d="M4 12 11 5h9v9l-9 6-7-8Z"/><circle cx="16" cy="9" r="1"/>',
  sparkle: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/>',
  orders: '<path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
};
const validHref = href => typeof href === 'string'
  && href.startsWith('/admin/') && !href.startsWith('//') && !href.includes('..');
const isActive = (tab, pathname) => tab.href === pathname ||
  (Array.isArray(tab.match) && tab.match.some(pattern =>
    typeof pattern === 'string' && (pattern === pathname ||
      (pattern.endsWith('/*') && pathname.startsWith(pattern.slice(0, -1))))));
export function mountAdminDock({ config, host = {} } = {}) {
  if (typeof document === 'undefined' || !Array.isArray(config?.tabs)) return null;
  document.getElementById('admin-mobile-dock')?.remove();
  const nav = document.createElement('nav');
  nav.id = 'admin-mobile-dock';
  nav.className = 'admin-mobile-dock';
  nav.setAttribute('aria-label', 'Admin mobile navigation');
  const tabs = config.tabs.filter(tab => tab && typeof tab.label === 'string'
    && (validHref(tab.href) || ['agent', 'nav'].includes(tab.action))).slice(0, 5);
  for (const tab of tabs) {
    const control = document.createElement(validHref(tab.href) ? 'a' : 'button');
    control.className = 'admin-mobile-dock__item';
    control.setAttribute('aria-label', tab.label);
    if (validHref(tab.href)) {
      control.href = tab.href;
      if (isActive(tab, location.pathname)) control.setAttribute('aria-current', 'page');
    } else {
      control.type = 'button';
      control.addEventListener('click', () => {
        if (tab.action === 'agent') host.open?.();
        if (tab.action === 'nav') host.openNav?.();
      });
    }
    const glyph = document.createElement('span');
    glyph.className = 'admin-mobile-dock__icon';
    glyph.setAttribute('aria-hidden', 'true');
    glyph.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (GLYPHS[tab.icon] || GLYPHS.menu) + '</svg>';
    const label = document.createElement('span');
    label.className = 'admin-mobile-dock__label';
    label.textContent = tab.label;
    control.append(glyph, label);
    nav.appendChild(control);
  }
  if (!tabs.length) return null;
  document.body.appendChild(nav);
  return nav;
}
