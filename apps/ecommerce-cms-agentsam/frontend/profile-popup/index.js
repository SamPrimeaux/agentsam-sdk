/** Sidebar profile popup behavior for the existing Ecommerce shell. */
export function mountProfilePopups(root = document) {
  for (const container of root.querySelectorAll('[data-profile-popup-root]')) {
    const trigger = container.querySelector('[data-profile-menu-toggle]');
    const menu = container.querySelector('[data-profile-menu]');
    if (!trigger || !menu || trigger.dataset.profileMenuBound) continue;
    trigger.dataset.profileMenuBound = 'true';
    const setOpen = open => {
      trigger.setAttribute('aria-expanded', String(open));
      menu.setAttribute('aria-hidden', String(!open));
      menu.classList.toggle('open', open);
      if (open) {
        const rect = trigger.getBoundingClientRect();
        const width = Math.min(260, window.innerWidth - 24);
        const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
        const top = rect.bottom + 8 + 280 > window.innerHeight ? Math.max(12, rect.top - 288) : rect.bottom + 8;
        menu.style.setProperty('--profile-popup-left', left + 'px');
        menu.style.setProperty('--profile-popup-top', top + 'px');
        menu.style.setProperty('--profile-popup-width', width + 'px');
      }
    };
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      setOpen(trigger.getAttribute('aria-expanded') !== 'true');
    });
    root.addEventListener('click', event => {
      if (!container.contains(event.target)) setOpen(false);
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && trigger.getAttribute('aria-expanded') === 'true') {
        setOpen(false); trigger.focus();
      }
    });
  }
}
