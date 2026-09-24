/* cpas-shell.js — public site interactions */
(function () {
  'use strict';

  /* ── Active nav from page route (works in CMS preview iframe) ── */
  function setActiveLinks() {
    const pathFromBody = document.body && document.body.dataset ? document.body.dataset.route : '';
    const path = String(pathFromBody || window.location.pathname).replace(/\/$/, '') || '/';
    document.querySelectorAll('.site-nav a, .nav-drawer-links a, .nav-drawer a').forEach(function (a) {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http')) return;
      const linkPath = href.replace(/\/$/, '') || '/';
      const isActive = linkPath === path;
      a.classList.toggle('active', isActive);
      a.classList.toggle('is-active', isActive);
    });
  }
  setActiveLinks();

  /* ── Header scroll behaviour ─────────────────────────── */
  const hdr = document.querySelector('.site-header');
  if (hdr) {
    let lastY = 0;
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      hdr.classList.toggle('scrolled', y > 24);
      hdr.classList.toggle('header-hidden', y > lastY + 80 && y > 300);
      if (y < lastY || y < 80) hdr.classList.remove('header-hidden');
      lastY = y;
    }, { passive: true });
  }

  /* ── Mobile nav ──────────────────────────────────────── */
  const toggle = document.querySelector('.mobile-menu-toggle');
  const drawer = document.querySelector('.nav-drawer');
  const overlay = document.getElementById('navOverlay');

  function closeNav() {
    drawer && drawer.classList.remove('is-open');
    overlay && overlay.classList.remove('is-open');
    toggle && toggle.classList.remove('is-open');
    toggle && toggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('menu-open', 'cpas-nav-open');
    document.documentElement.classList.remove('cpas-nav-open');
    document.body.style.overflow = '';
  }

  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = drawer ? drawer.classList.toggle('is-open') : false;
      overlay && overlay.classList.toggle('is-open', open);
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.classList.toggle('menu-open', open);
    document.body.classList.toggle('cpas-nav-open', open);
    document.documentElement.classList.toggle('cpas-nav-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    });
  }

  const closeBtn = document.querySelector('.mobile-nav-close');
  closeBtn && closeBtn.addEventListener('click', closeNav);
  overlay && overlay.addEventListener('click', closeNav);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeNav();
      if (window.CPASModals && typeof window.CPASModals.close === 'function') window.CPASModals.close();
    }
  });

  /* ── CMS dashboard: scroll-to-section postMessage listener ── */
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'cms:scroll-to-section') return;
    const key = e.data.key;
    if (!key) return;
    const el = document.querySelector('[data-cpas-section="' + key + '"]');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Brief highlight pulse so the section is visually obvious
      el.style.transition = 'outline 0.1s';
      el.style.outline = '2px solid rgba(139,92,246,0.5)';
      setTimeout(function() { el.style.outline = ''; }, 1200);
    }
  });

})();

// CPAS reusable newsletter form
(() => {
  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-newsletter-form]');
    if (!form) return;
    event.preventDefault();
    const email = form.querySelector('input[type="email"]')?.value?.trim();
    const status = form.querySelector('[data-newsletter-status]');
    if (!email) { if (status) status.textContent = 'Please enter your email.'; return; }
    if (status) status.textContent = 'Subscribing...';
    try {
      const res = await fetch('/api/newsletter/subscribe', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ email }) });
      if (!res.ok) throw new Error('Subscribe failed');
      if (status) status.textContent = 'You are subscribed. Check your inbox for a confirmation.';
      form.reset();
    } catch {
      if (status) status.textContent = 'Could not subscribe. Please try again.';
    }
  });
})();
