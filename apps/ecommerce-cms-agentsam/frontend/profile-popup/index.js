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
      menu.classList.toggle('is-open', open);
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
