import { createThemeEditorBridge } from "/admin/theme-editor-lib/bridge.mjs";
import { createThemeProjectAdapter, validateThemeProject } from "/admin/theme-editor-lib/project.mjs";

const params = new URLSearchParams(location.search);
const projectId = String(params.get("id") || "").trim();
const SAFE_ID = /^[a-z0-9][a-z0-9_-]{1,79}$/;

if (!SAFE_ID.test(projectId)) {
  document.body.innerHTML = '<main class="admin-empty">Invalid draft theme id.</main>';
  throw new Error("theme_project_id_invalid");
}

async function readJsonResponse(response) {
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function loadProject() {
  try {
    const response = await fetch(`/api/admin/theme-projects/${encodeURIComponent(projectId)}`, {
      credentials: "include",
      headers: { accept: "application/json" },
    });
    return (await readJsonResponse(response)).project;
  } catch (error) {
    if (error?.status !== 404) throw error;
    const seed = await fetch(`/admin/theme-projects/${encodeURIComponent(projectId)}.json`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!seed.ok) throw new Error("theme_project_seed_not_found");
    return seed.json();
  }
}

let current = validateThemeProject(await loadProject());
const store = {
  async get(id) {
    if (id !== projectId) return null;
    return structuredClone(current);
  },
  async save(project) {
    const next = validateThemeProject(project);
    const response = await fetch(`/api/admin/theme-projects/${encodeURIComponent(projectId)}`, {
      method: "PUT",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    const data = await readJsonResponse(response);
    current = validateThemeProject(data.project);
  },
};

const projectAdapter = createThemeProjectAdapter(current, store, { publish: null });
const bridge = createThemeEditorBridge(projectAdapter);
const initialPage = current.pages[0]?.slug || "shop";

window.AgentSamThemeEditorHost = {
  page: params.get("slug") || initialPage,
  adapter: bridge,
  pageRoutes: Object.fromEntries((current.pages || []).map((page) => [page.slug, `#${page.slug}`])),
  onPageChange(nextSlug) {
    const next = new URL(location.href);
    next.searchParams.set("id", projectId);
    next.searchParams.set("slug", nextSlug);
    history.replaceState(null, "", next);
  },
};

const script = document.createElement("script");
script.src = "/admin/js/theme-editor.js";
script.onerror = () => {
  document.body.innerHTML = '<main class="admin-empty">Could not load the draft theme editor.</main>';
};
document.body.appendChild(script);
