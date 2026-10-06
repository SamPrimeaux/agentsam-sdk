/**
 * Mount the existing ecommerce Online Store screen in an isolated document.
 * This is the same HTML/runtime used by the packaged standalone admin,
 * supplied with an authenticated site adapter instead of FNF-specific globals.
 *
 * Host contract: { baseUrl, storefrontUrl, loadStore(), onEdit(slug) }.
 * No platform secrets or cross-tenant data enter the embedded window.
 */
export async function mountOnlineStore(frame, host, { assetsBase = '/commerce-store/' } = {}) {
  const doc = frame?.contentDocument;
  const win = frame?.contentWindow;
  if (!doc || !win) throw new Error('store_frame_unavailable');
  if (!host || typeof host.loadStore !== 'function' || typeof host.onEdit !== 'function') {
    throw new Error('store_host_contract_required');
  }

  win.AgentSamOnlineStoreHost = host;
  doc.documentElement.dataset.cmsEmbeddedStore = 'true';
  const applyInstalledAppearance = (appearance) => {
    const tokens = appearance?.tokens?.color;
    if (!tokens || typeof tokens !== 'object') return;
    const palette = {
      canvas: tokens.canvas,
      surface: tokens.surface,
      raised: tokens.surfaceRaised,
      ink: tokens.ink,
      muted: tokens.muted,
      accent: tokens.accent,
    };
    const themeId = appearance?.theme_id;
    if (!themeId || !Object.values(palette).every((v) => typeof v === 'string' && /^#[a-f0-9]{3,8}$/i.test(v))) return;
    for (const [name, value] of Object.entries(palette)) {
      doc.documentElement.style.setProperty('--cms-store-' + name, value);
    }
    doc.documentElement.dataset.cmsThemeLoaded = 'true';
    doc.documentElement.dataset.cmsThemeId = String(themeId).slice(0, 100);
  };

  // Native admin passes this markup to shell.js. Studio already owns navigation:
  // only the product content is mounted here, not a second application shell.
  win.renderShell = (_route, markup) => { doc.body.innerHTML = markup; };
  win.adminFetch = async (path, options = {}) => {
    if (path !== '/api/admin/store/online' || (options.method && options.method !== 'GET')) {
      throw new Error('store_operation_not_supported_by_host');
    }
    try {
      const overview = await host.loadStore();
      applyInstalledAppearance(overview?.active_theme?.appearance);
      const verified = overview?.store?.url && host.storefrontUrl &&
        new URL(overview.store.url).origin === new URL(host.storefrontUrl).origin;
      const viewStore = doc.querySelector('.online-store-actions a[href="/"], .online-store-actions a[data-store-link]');
      if (viewStore) {
        viewStore.dataset.storeLink = 'true';
        if (verified) {
          viewStore.href = overview.store.url;
          viewStore.removeAttribute('aria-disabled');
          viewStore.removeAttribute('title');
        } else {
          viewStore.removeAttribute('href');
          viewStore.setAttribute('aria-disabled', 'true');
          viewStore.title = 'No verified storefront publication is linked';
        }
      }
      host.onReady?.(overview);
      return overview;
    } catch (cause) {
      host.onReady?.(null);
      doc.getElementById('store-visibility-label')?.replaceChildren('Unavailable');
      const alert = doc.createElement('p');
      alert.setAttribute('role', 'alert');
      alert.style.cssText = 'padding:12px 16px;margin:0 0 16px;background:#fff1f1;color:#8b1717;border-radius:8px';
      alert.textContent = 'Store data is unavailable: ' + (cause instanceof Error ? cause.message : String(cause));
      doc.querySelector('.online-store-head')?.after(alert);
      throw cause;
    }
  };

  // Preserve the FNF product classes and CSS in a self-contained viewport.
  doc.body.style.margin = '0';
  doc.body.style.background = 'var(--cms-store-canvas, var(--color-background, #13151b))';
  for (const name of ['admin.css', 'console.css', 'online-store.css']) {
    const css = doc.createElement('link');
    css.rel = 'stylesheet';
    css.href = assetsBase + name;
    doc.head.appendChild(css);
  }

  const intercept = (event) => {
    const anchor = event.target?.closest?.('a');
    if (!anchor) return;
    if (anchor.id === 'edit-theme-btn' || anchor.closest('.online-store-draft-actions')) {
      event.preventDefault();
      const url = new URL(anchor.getAttribute('href') || '/admin/theme-editor?slug=home', host.baseUrl);
      host.onEdit(url.searchParams.get('slug') || 'home');
    }
  };
  doc.addEventListener('click', intercept);
  const script = doc.createElement('script');
  script.src = assetsBase + 'runtime.js';
  await new Promise((resolve, reject) => {
    script.onload = resolve;
    script.onerror = () => reject(new Error('store_runtime_asset_unavailable'));
    doc.head.appendChild(script);
  });
  if (!doc.querySelector('.online-store')) {
    throw new Error('store_product_markup_missing');
  }

  const viewStore = doc.querySelector('.online-store-actions a[href="/"]');
  if (viewStore && !viewStore.dataset.storeLink) {
    viewStore.dataset.storeLink = 'true';
    // Storefront navigation is enabled only after the owning Worker confirms
    // the installed domain. The project registry alone is insufficient.
    viewStore.removeAttribute('href');
    viewStore.setAttribute('aria-disabled', 'true');
    viewStore.title = 'Verifying public storefront…';
  }
  // These controls currently lack transactions in the portable CMS contract.
  // Do not present dead buttons as working merchant features.
  for (const id of ['store-visibility-btn', 'import-theme-btn']) {
    const button = doc.getElementById(id);
    if (button) { button.disabled = true; button.title = 'This action is not yet connected for this site'; }
  }
  for (const button of doc.querySelectorAll('.online-store-icon-btn')) {
    button.disabled = true;
    button.title = 'No action connected';
  }
  return () => doc.removeEventListener('click', intercept);
}
