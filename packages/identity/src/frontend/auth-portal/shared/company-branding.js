/**
 * Applies /api/company branding to auth portal pages at runtime.
 */
(function () {
  function applyCompany(company) {
    if (!company || !company.name) return;
    var root = document.documentElement;
    if (company.authBgColor) {
      root.style.setProperty('--auth-bg', company.authBgColor);
      document.body.style.backgroundColor = company.authBgColor;
    }
    if (company.primaryColor) {
      root.style.setProperty('--company-primary', company.primaryColor);
    }
    if (company.logoUrl) {
      document.querySelectorAll('.auth-logo, img[alt*="logo" i]').forEach(function (el) {
        el.src = company.logoUrl;
      });
    }
    if (company.faviconUrl) {
      var link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = company.faviconUrl;
    }
    var title = document.title || '';
    if (title.indexOf('|') !== -1) {
      document.title = title.replace(/\|[^|]+$/, '| ' + company.name);
    }
    document.querySelectorAll('[data-company-name]').forEach(function (el) {
      el.textContent = company.name;
    });
    var hero = document.querySelector('.auth-hero-title, h1, .login-card h2');
    if (hero && hero.textContent && hero.textContent.indexOf('Inner Animal') !== -1) {
      hero.textContent = hero.textContent.replace(/Inner Animal Media/g, company.name);
    }
  }

  fetch('/api/company', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.ok) applyCompany(d.company); })
    .catch(function () {});
})();
