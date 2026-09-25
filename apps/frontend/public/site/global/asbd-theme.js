/* AgentSam Blue Dark — shared theme sync (header contrast + opposing footer) */
(function (global) {
  function pageTheme() {
    return document.documentElement.getAttribute('data-asbd-theme') ||
      document.body.getAttribute('data-asbd-theme') ||
      'dark';
  }

  function opposing(theme) {
    return theme === 'light' ? 'dark' : 'light';
  }

  function applyHeaderForPage(theme) {
    var header = document.getElementById('asbd-header');
    if (!header) return;
    // On light pages, keep a solid dark navy header so chrome stays visible.
    header.classList.toggle('asbd-header--on-light-page', theme === 'light');
    if (theme === 'light') {
      header.classList.remove('asbd-header--light-bg');
    }
  }

  function applyFooterOpposing(theme) {
    var footer = document.getElementById('asbd-footer');
    if (!footer) return;
    // Violet docs skin: keep a matching dark purple footer (product ask).
    var skin = document.documentElement.getAttribute('data-asbd-skin');
    if (skin === 'violet') {
      footer.setAttribute('data-asbd-theme', 'dark');
      return;
    }
    footer.setAttribute('data-asbd-theme', opposing(theme));
  }

  function setTheme(theme) {
    var next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-asbd-theme', next);
    document.body.setAttribute('data-asbd-theme', next);
    applyHeaderForPage(next);
    applyFooterOpposing(next);
    global.dispatchEvent(new CustomEvent('asbd:theme', { detail: { theme: next } }));
    return next;
  }

  function syncFromDocument() {
    var theme = pageTheme();
    applyHeaderForPage(theme);
    applyFooterOpposing(theme);
    return theme;
  }

  function bindToggle(button) {
    if (!button) return;
    var refreshLabel = function () {
      var theme = pageTheme();
      button.textContent = theme === 'light' ? 'Dark theme' : 'Light theme';
      button.setAttribute('aria-pressed', String(theme === 'light'));
    };
    refreshLabel();
    button.addEventListener('click', function () {
      setTheme(opposing(pageTheme()));
      refreshLabel();
    });
    global.addEventListener('asbd:theme', refreshLabel);
  }

  global.AsbdTheme = { setTheme: setTheme, syncFromDocument: syncFromDocument, bindToggle: bindToggle, pageTheme: pageTheme };
})(window);
