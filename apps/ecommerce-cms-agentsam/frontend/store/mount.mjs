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
  // Native admin passes this markup to shell.js. Studio already owns navigation:
  // only the product content is mounted here, not a second application shell.
  win.renderShell = (_route, markup) => { doc.body.innerHTML = markup; };
  win.adminFetch = async (path, options = {}) => {
    if (path !== '/api/admin/store/online' || (options.method && options.method !== 'GET')) {
      throw new Error('store_operation_not_supported_by_host');
    }
    try {
      return await host.loadStore();
    } catch (cause) {
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
  doc.body.style.background = '#f1f1f1';
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
  if (viewStore) {
    if (host.storefrontUrl) viewStore.href = host.storefrontUrl;
    else { viewStore.removeAttribute('href'); viewStore.setAttribute('aria-disabled', 'true'); viewStore.title = 'No public storefront registered'; }
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
