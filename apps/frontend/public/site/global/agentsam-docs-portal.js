/** Shared documentation interactions. The CMS provides all links and fields. */
(() => {
  const root = document.querySelector('body.iam-doc-portal');
  if (!root) return;
  const menu = root.querySelector('[data-doc-menu]');
  const sidebar = root.querySelector('#iam-doc-sidebar');
  const nav = sidebar?.querySelector('nav');
  const filter = sidebar?.querySelector('[data-doc-filter]');
  const path = p => { try { return new URL(p, location.origin).pathname.replace(/\/?$/, '/'); } catch { return ''; } };
  const links = [...(nav?.querySelectorAll('a[href]') || [])];
  const current = path(location.pathname);
  for (const link of links) {
    if (path(link.getAttribute('href')) === current) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  const close = () => { root.dataset.docMenuOpen = 'false'; menu?.setAttribute('aria-expanded', 'false'); };
  menu?.addEventListener('click', () => {
    const opening = root.dataset.docMenuOpen !== 'true';
    root.dataset.docMenuOpen = String(opening);
    menu.setAttribute('aria-expanded', String(opening));
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  document.addEventListener('click', event => {
    if (root.dataset.docMenuOpen === 'true' && !event.target.closest('#iam-doc-sidebar,[data-doc-menu]')) close();
  });
  for (const link of links) link.addEventListener('click', close);
  filter?.addEventListener('input', () => {
    const needle = filter.value.trim().toLocaleLowerCase();
    for (const link of links)
      link.hidden = Boolean(needle) && !link.textContent.toLocaleLowerCase().includes(needle);
    let visible = false;
    for (const el of [...nav.children].reverse()) {
      if (el.matches('.iam-doc-link')) visible ||= !el.hidden;
      else if (el.matches('.iam-doc-group')) { el.hidden = !visible; visible = false; }
    }
  });
  const toc = root.querySelector('[data-doc-toc]');
  for (const [index, heading] of [...root.querySelectorAll('.iam-doc-content h2[data-doc-heading]')].entries()) {
    const parent = heading.closest('[data-cms-section],[data-theme-section]');
    const key = parent?.getAttribute('data-cms-section') || parent?.getAttribute('data-theme-section') || String(index);
    heading.id = 'doc-section-' + key.replace(/[^a-zA-Z0-9_-]/g,'');
    const anchor = document.createElement('a');
    anchor.href = '#' + heading.id;
    anchor.textContent = heading.textContent.trim();
    toc?.append(anchor);
  }
  for(const button of root.querySelectorAll('[data-doc-copy]')){
    button.addEventListener('click', async () => {
      const code = button.closest('.iam-doc-code-section')?.querySelector('code');
      if (!code || !navigator.clipboard?.writeText) return;
      try {
        await navigator.clipboard.writeText(code.textContent);
        const label = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = label; }, 1400);
      } catch { button.textContent = 'Copy unavailable'; }
    });
  }
})();
