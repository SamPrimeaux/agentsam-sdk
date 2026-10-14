/**
 * Draft theme-project persistence.
 *
 * Large editable theme payloads live in R2; the active storefront/page authority
 * remains the existing CMS tables. Opening or saving one of these drafts never
 * publishes it or mutates the live storefront.
 */

const PROJECT_PREFIX = "theme-projects/drafts/";
const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

function json(data, init = {}) {
  return Response.json(data, init);
}

function safeProjectId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9][a-z0-9_-]{1,79}$/.test(id) ? id : null;
}

function projectKey(id) {
  return `${PROJECT_PREFIX}${id}.json`;
}

function validateProject(project, expectedId) {
  if (!project || typeof project !== "object") return "theme_project_invalid";
  if (project.schema !== "agentsam.theme-project.v1") return "theme_project_schema_invalid";
  if (project.id !== expectedId) return "theme_project_id_mismatch";
  if (typeof project.name !== "string" || !project.name.trim()) return "theme_project_name_invalid";
  if (!Array.isArray(project.pages) || !project.pages.length) return "theme_project_pages_invalid";
  for (const page of project.pages) {
    if (!page || typeof page !== "object" || !/^[a-z0-9][a-z0-9_-]*$/.test(String(page.slug || ""))) {
      return "theme_project_page_invalid";
    }
    if (typeof page.template !== "string" || !Array.isArray(page.sections)) return "theme_project_page_invalid";
  }
  return null;
}

export async function getThemeProject(env, idValue) {
  const id = safeProjectId(idValue);
  if (!id) return json({ ok: false, error: "theme_project_id_invalid" }, { status: 400 });
  if (!env?.WEBSITE_ASSETS) {
    return json({ ok: false, error: "theme_project_storage_unavailable" }, { status: 503 });
  }

  const object = await env.WEBSITE_ASSETS.get(projectKey(id));
  if (!object) return json({ ok: false, error: "theme_project_not_found" }, { status: 404 });

  try {
    const project = JSON.parse(await object.text());
    const invalid = validateProject(project, id);
    if (invalid) return json({ ok: false, error: invalid }, { status: 500 });
    return json({ ok: true, project, source: "r2" });
  } catch (error) {
    return json({ ok: false, error: "theme_project_corrupt", detail: error?.message || String(error) }, { status: 500 });
  }
}

export async function putThemeProject(request, env, idValue) {
  const id = safeProjectId(idValue);
  if (!id) return json({ ok: false, error: "theme_project_id_invalid" }, { status: 400 });
  if (!env?.WEBSITE_ASSETS) {
    return json({ ok: false, error: "theme_project_storage_unavailable" }, { status: 503 });
  }

  const raw = await request.text();
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_PROJECT_BYTES) {
    return json({ ok: false, error: "theme_project_payload_invalid" }, { status: 413 });
  }

  let project;
  try {
    project = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "theme_project_json_invalid" }, { status: 400 });
  }

  const invalid = validateProject(project, id);
  if (invalid) return json({ ok: false, error: invalid }, { status: 400 });

  project.status = "draft";
  project.updatedAt = new Date().toISOString();
  const payload = JSON.stringify(project);
  await env.WEBSITE_ASSETS.put(projectKey(id), payload, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: {
      "agentsam-kind": "theme-project",
      "agentsam-status": "draft",
      "agentsam-schema": "agentsam.theme-project.v1",
    },
  });

  return json({ ok: true, project, source: "r2" });
}
