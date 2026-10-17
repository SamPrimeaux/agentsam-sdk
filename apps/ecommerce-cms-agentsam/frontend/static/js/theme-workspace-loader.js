import { createThemeEditorBridge } from "/admin/theme-editor-lib/bridge.mjs";
import { createStoreThemeWorkspaceAdapter } from "/admin/theme-editor-lib/store-theme-adapter.mjs";

const params = new URLSearchParams(location.search);
const theme = String(params.get("theme") || "revise").trim();
const requestedPage = String(params.get("slug") || "shop").trim();

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

try {
  const domainAdapter = createStoreThemeWorkspaceAdapter({ theme });
  const pages = await domainAdapter.listPages();
  const page = pages.some((item) => item.slug === requestedPage)
    ? requestedPage
    : (pages[0]?.slug || requestedPage);
  const bridge = createThemeEditorBridge(domainAdapter);

  window.AgentSamThemeEditorHost = {
    page,
    adapter: bridge,
    pageRoutes: Object.fromEntries(pages.map((item) => [item.slug, item.route || `/${item.slug}`])),
    onPageChange(nextSlug) {
      const next = new URL(location.href);
      next.searchParams.set("theme", theme);
      next.searchParams.set("slug", nextSlug);
      history.replaceState(null, "", next);
    },
  };

  await loadScript("/admin/js/pages-shared.js");
  await loadScript("/admin/js/theme-editor.js");
} catch (error) {
  document.body.innerHTML = `<main class="admin-empty">${String(error?.message || error)}</main>`;
  console.error("[theme-workspace]", error);
}
