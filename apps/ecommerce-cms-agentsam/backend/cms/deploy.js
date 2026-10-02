/**
 * CMS deploy + cache warm helpers (post-deploy, internal hooks).
 */

import { PAGE_REGISTRY } from "./registry.js";
import { writePublishedSnapshot } from "./api.js";

async function readPageStatus(env, slug) {
  if (!env?.DB) return null;
  return env.DB.prepare(`SELECT status FROM pages WHERE slug = ?`).bind(slug).first();
}

export async function warmAllCmsPages(
  env,
  { writeSnapshot = writePublishedSnapshot, readStatus = readPageStatus } = {}
) {
  const slugs = Object.keys(PAGE_REGISTRY);
  const warmed = [];

  for (const slug of slugs) {
    try {
      const page = await readStatus(env, slug);
      if (!page) {
        warmed.push({ slug, ok: false, error: "Page not found" });
        continue;
      }
      if (page.status !== "published") {
        // Draft pages are intentionally absent from the public CMS cache.
        // Treat that as a healthy skip, not a failed deployment warm.
        warmed.push({
          slug,
          ok: true,
          skipped: true,
          reason: `status:${page.status || "unknown"}`,
        });
        continue;
      }

      const snapshot = await writeSnapshot(env, slug);
      if (!snapshot) {
        warmed.push({ slug, ok: false, error: "Published page has no snapshot" });
        continue;
      }
      warmed.push({ slug, ok: true, warmed: true });
    } catch (err) {
      warmed.push({ slug, ok: false, error: err?.message || String(err) });
    }
  }

  const errors = warmed.filter((row) => !row.ok);
  const warmedCount = warmed.filter((row) => row.warmed).length;
  const skippedCount = warmed.filter((row) => row.skipped).length;
  return {
    ok: errors.length === 0,
    warmed,
    count: warmedCount,
    warmed_count: warmedCount,
    skipped_count: skippedCount,
    error_count: errors.length,
  };
}

export async function handleCmsWarmInternal(request, env) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = request.headers.get("X-Cms-Warm-Secret") || "";
  if (!env.CMS_WARM_SECRET || secret !== env.CMS_WARM_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const result = await warmAllCmsPages(env);
  return Response.json({
    ...result,
    trigger_source: body.trigger_source || "internal",
  });
}
