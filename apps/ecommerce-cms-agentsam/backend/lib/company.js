/**
 * Portable company brand SSOT — D1 `company` is the only runtime authority
 * for issuer/auth/company branding. Matches agentsam-sdk identity contract.
 */

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function rowToCompany(row) {
  if (!row) return null;
  const meta = parseMeta(row.meta_json);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    legalName: row.legal_name || null,
    logoUrl: row.logo_url || null,
    faviconUrl: row.favicon_url || null,
    primaryColor: row.primary_color || null,
    authBgColor: row.auth_bg_color || null,
    supportEmail: row.support_email || null,
    websiteUrl: row.website_url || null,
    tagline: row.tagline || null,
    meta,
  };
}

/**
 * @param {any} env
 * @param {{ slug?: string }} [opts]
 */
export async function getCompany(env, opts = {}) {
  if (!env?.DB) return null;
  const slug = String(opts.slug || "").trim();
  try {
    if (slug) {
      const bySlug = await env.DB.prepare(`SELECT * FROM company WHERE slug = ? LIMIT 1`)
        .bind(slug)
        .first();
      if (bySlug) return rowToCompany(bySlug);
    }
    const preferred = await env.DB.prepare(
      `SELECT * FROM company
       ORDER BY CASE WHEN slug = 'default' THEN 1 ELSE 0 END, updated_at DESC
       LIMIT 1`,
    ).first();
    return rowToCompany(preferred);
  } catch (err) {
    console.error("[company] load failed", err?.message || err);
    return null;
  }
}

/** Hostname from company.website_url (no protocol). */
export function companyDomain(company) {
  const raw = String(company?.websiteUrl || "").trim();
  if (!raw) return null;
  try {
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname;
    return host || null;
  } catch {
    return raw.replace(/^https?:\/\//, "").split("/")[0] || null;
  }
}

export async function getCompanyDomain(env) {
  const company = await getCompany(env);
  return companyDomain(company);
}

/**
 * PATCH fields (camel or snake). Only updates provided keys.
 * @param {any} env
 * @param {Record<string, unknown>} patch
 */
export async function updateCompany(env, patch = {}) {
  const current = await getCompany(env);
  if (!current?.id) {
    return { ok: false, error: "company_not_configured" };
  }

  // PATCH must preserve explicit null: clearing media and optional fields is intentional.
  const pick = (camel, snake, existing) =>
    Object.hasOwn(patch, camel) ? patch[camel] :
      Object.hasOwn(patch, snake) ? patch[snake] : existing;

  const next = {
    name: pick("name", "name", current.name),
    legal_name: pick("legalName", "legal_name", current.legalName),
    logo_url: pick("logoUrl", "logo_url", current.logoUrl),
    favicon_url: pick("faviconUrl", "favicon_url", current.faviconUrl),
    primary_color: pick("primaryColor", "primary_color", current.primaryColor),
    auth_bg_color: pick("authBgColor", "auth_bg_color", current.authBgColor),
    support_email: pick("supportEmail", "support_email", current.supportEmail),
    website_url: pick("websiteUrl", "website_url", current.websiteUrl),
    tagline: pick("tagline", "tagline", current.tagline),
    meta_json: JSON.stringify(
      patch.meta && typeof patch.meta === "object"
        ? { ...current.meta, ...patch.meta }
        : current.meta || {},
    ),
  };

  await env.DB.prepare(
    `UPDATE company SET
       name = ?, legal_name = ?, logo_url = ?, favicon_url = ?,
       primary_color = ?, auth_bg_color = ?, support_email = ?,
       website_url = ?, tagline = ?, meta_json = ?, updated_at = unixepoch()
     WHERE id = ?`,
  )
    .bind(
      next.name,
      next.legal_name,
      next.logo_url,
      next.favicon_url,
      next.primary_color,
      next.auth_bg_color,
      next.support_email,
      next.website_url,
      next.tagline,
      next.meta_json,
      current.id,
    )
    .run();

  return { ok: true, company: await getCompany(env) };
}

export async function handleCompanyApi(request, env) {
  if (request.method === "GET") {
    const company = await getCompany(env);
    if (!company) {
      return Response.json({ ok: false, error: "company_not_configured" }, { status: 404 });
    }
    return Response.json({ ok: true, company });
  }

  if (request.method === "PATCH") {
    let body = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }
    const result = await updateCompany(env, body);
    if (!result.ok) {
      return Response.json(result, { status: 404 });
    }
    return Response.json(result);
  }

  return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
}
