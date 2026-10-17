/**
 * Store preferences service — portable ecommerce package.
 *
 * Brand → company. Behavior → store_settings (D1 SSOT). KV = cache only.
 * Themes → registry/pages data (never fabricated). Analytics → packaged contract.
 */

import {
  DEFAULT_NAV_ITEMS,
  resolveNavConfig,
  sanitizeNavItems,
} from "../lib/site-nav.js";
import { getCompany, companyDomain } from "../lib/company.js";
import { hashPassword, verifyPassword } from "../lib/auth.js";
import { listStoreThemes } from "./themes.js";
// Theme appearance comes from the installed theme/tenant contract, never
// a baked-in merchant preset in the reusable ecommerce application.
function appearanceForInstalledPackage(theme) {
  const appearance = theme?.settings?.appearance ?? theme?.metadata?.appearance;
  return appearance && typeof appearance === "object" ? appearance : null;
}


function json(data, init = {}) {
  return Response.json(data, init);
}

/** Neutral behavioral defaults only — no customer identity. */
const PACKAGE_STORE_DEFAULTS = {
  passwordProtection: false,
  b2bOnly: false,
  geoRedirect: true,
  languageRedirect: false,
  hcaptchaContact: true,
  hcaptchaAccount: true,
  homeTitle: "",
  metaDescription: "",
  socialImageUrl: "",
  navLogoUrl: "",
  navLogoHeight: 58,
  navBrandAccent: "",
  navBrandAccentLight: "",
  navItems: DEFAULT_NAV_ITEMS,
  announcementEnabled: false,
  announcementText: "",
  announcementHref: "",
  announcementStyle: "static",
  announcementAuthority: "cms",
  navigationAuthority: "cms",
  logoAuthority: "cms",
  announcementBgColor: "#161616",
  announcementTextColor: "#ffffff",
  storePasswordHash: null,
  storePasswordSalt: null,
};

const KV_PREFS_KEY = "store:preferences";

function unavailableMetric(source = "analytics") {
  return { value: null, status: "unavailable", source };
}

function publicSettings(settings) {
  const {
    storePasswordHash: _h,
    storePasswordSalt: _s,
    storePassword: _p,
    sceneReview: _scene,
    ...rest
  } = settings || {};
  return {
    ...rest,
    hasStorePassword: Boolean(settings?.storePasswordHash),
  };
}

async function brandOverlay(env) {
  const company = await getCompany(env);
  if (!company) return { company: null, overlay: {} };
  return {
    company,
    overlay: {
      homeTitle: company.name || "",
      metaDescription: company.tagline || company.meta?.meta_description || "",
      navLogoUrl: company.logoUrl || "",
      navBrandAccent: company.primaryColor || "",
      socialImageUrl: company.meta?.social_image_url || "",
    },
  };
}

/**
 * Read preferences: valid KV cache → else D1 → populate cache.
 * Missing store_settings table → explicit error (no silent KV-as-DB).
 */
async function loadStorePreferences(env, { allowCache = true } = {}) {
  if (allowCache && env.CMS_CACHE) {
    try {
      const cached = await env.CMS_CACHE.get(KV_PREFS_KEY, "json");
      if (cached && typeof cached === "object" && cached.__ssot === "store_settings") {
        return { ok: true, settings: { ...PACKAGE_STORE_DEFAULTS, ...cached.settings }, source: "cache" };
      }
    } catch {
      /* ignore bad cache */
    }
  }

  if (!env?.DB) {
    return { ok: false, error: "store_settings_db_unavailable", settings: null };
  }

  let row;
  try {
    row = await env.DB.prepare(`SELECT settings_json FROM store_settings WHERE id = 1`).first();
  } catch (err) {
    return {
      ok: false,
      error: "store_settings_not_configured",
      detail: err?.message || String(err),
      settings: null,
    };
  }

  const parsed = row?.settings_json ? JSON.parse(row.settings_json) : {};
  // Strip legacy plaintext if still present in old rows.
  if (parsed.storePassword) {
    delete parsed.storePassword;
  }
  const settings = { ...PACKAGE_STORE_DEFAULTS, ...parsed };

  if (env.CMS_CACHE) {
    await env.CMS_CACHE.put(
      KV_PREFS_KEY,
      JSON.stringify({ __ssot: "store_settings", settings, cached_at: Date.now() }),
    ).catch(() => {});
  }

  return { ok: true, settings, source: "d1" };
}

async function saveStorePreferences(env, incoming) {
  const loaded = await loadStorePreferences(env, { allowCache: false });
  if (!loaded.ok) {
    return loaded;
  }
  const current = loaded.settings;
  const next = {
    ...current,
    passwordProtection: !!incoming.passwordProtection,
    b2bOnly: !!incoming.b2bOnly,
    geoRedirect: !!incoming.geoRedirect,
    languageRedirect: !!incoming.languageRedirect,
    hcaptchaContact: !!incoming.hcaptchaContact,
    hcaptchaAccount: !!incoming.hcaptchaAccount,
    homeTitle: String(incoming.homeTitle ?? current.homeTitle).slice(0, 70),
    metaDescription: String(incoming.metaDescription ?? current.metaDescription).slice(0, 320),
    socialImageUrl: String(incoming.socialImageUrl ?? current.socialImageUrl).slice(0, 2048),
  };

  if (incoming.navLogoUrl != null) {
    next.navLogoUrl = String(incoming.navLogoUrl).slice(0, 2048);
    next.logoAuthority = "preferences";
  }
  if (incoming.navLogoHeight != null) {
    next.navLogoHeight = Math.min(120, Math.max(40, Number(incoming.navLogoHeight) || 58));
  }
  if (incoming.navBrandAccent != null) next.navBrandAccent = String(incoming.navBrandAccent).slice(0, 32);
  if (incoming.navBrandAccentLight != null) {
    next.navBrandAccentLight = String(incoming.navBrandAccentLight).slice(0, 32);
  }
  if (incoming.navItems != null) {
    next.navItems = sanitizeNavItems(incoming.navItems);
    next.navigationAuthority = "preferences";
  }
  if (incoming.announcementEnabled != null) {
    next.announcementEnabled = incoming.announcementEnabled === true;
    next.announcementAuthority = "preferences";
  }
  if (incoming.announcementText != null) {
    next.announcementText = String(incoming.announcementText).trim().slice(0, 160);
  }
  if (incoming.announcementHref != null) {
    next.announcementHref = String(incoming.announcementHref).trim().slice(0, 512);
  }
  if (incoming.announcementStyle != null) {
    next.announcementStyle = incoming.announcementStyle === "marquee" ? "marquee" : "static";
  }
  for (const key of ["announcementBgColor", "announcementTextColor"]) {
    if (incoming[key] != null) {
      const color = String(incoming[key]);
      if (!/^#[0-9a-f]{6}$/i.test(color)) return { ok: false, error: "invalid_announcement_color" };
      next[key] = color;
    }
  }

  if (incoming.storePassword != null && incoming.storePassword !== "" && incoming.storePassword !== "••••••••") {
    const { hash, salt } = await hashPassword(String(incoming.storePassword).slice(0, 128));
    next.storePasswordHash = hash;
    next.storePasswordSalt = salt;
  }
  if (incoming.clearStorePassword === true) {
    next.storePasswordHash = null;
    next.storePasswordSalt = null;
    next.passwordProtection = false;
  }
  delete next.storePassword;

  const payload = JSON.stringify(next);
  try {
    await env.DB.prepare(
      `INSERT INTO store_settings (id, settings_json, updated_at)
       VALUES (1, ?, datetime('now'))
       ON CONFLICT(id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = excluded.updated_at`,
    )
      .bind(payload)
      .run();
  } catch (err) {
    return {
      ok: false,
      error: "store_settings_write_failed",
      detail: err?.message || String(err),
    };
  }

  if (env.CMS_CACHE) {
    await env.CMS_CACHE.put(
      KV_PREFS_KEY,
      JSON.stringify({ __ssot: "store_settings", settings: next, cached_at: Date.now() }),
    ).catch(() => {});
  }

  return { ok: true, settings: next };
}

export async function verifyStorefrontPassword(env, password) {
  const loaded = await loadStorePreferences(env);
  if (!loaded.ok) return false;
  const { storePasswordHash, storePasswordSalt, passwordProtection } = loaded.settings;
  if (!passwordProtection || !storePasswordHash || !storePasswordSalt) return true;
  return verifyPassword(password, storePasswordHash, storePasswordSalt);
}

async function resolveThemes(env, accountId = null) {
  // The installed theme inventory resolves from cms_artifacts and cms_globals.
  // Never fall back to agentsam_products or a second theme-state family.
  return listStoreThemes(env, accountId);
}

async function resolveStorePerformance(env) {
  // Compose packaged analytics when available; never invent Core Web Vitals.
  try {
    const { summarizeAgentSamAnalytics } = await import("../agentsam/analytics.js");
    const summary = await summarizeAgentSamAnalytics(env, { days: 30 });
    return {
      period_days: 30,
      lcp_ms: unavailableMetric("web_vitals"),
      inp_ms: unavailableMetric("web_vitals"),
      cls: unavailableMetric("web_vitals"),
      sessions_desktop: unavailableMetric("storefront_sessions"),
      sessions_mobile: unavailableMetric("storefront_sessions"),
      agentsam: summary?.ok
        ? { status: "ok", source: "agentsam_analytics", summary }
        : unavailableMetric("agentsam_analytics"),
      source: "packaged_analytics",
    };
  } catch {
    return {
      period_days: 30,
      lcp_ms: unavailableMetric("web_vitals"),
      inp_ms: unavailableMetric("web_vitals"),
      cls: unavailableMetric("web_vitals"),
      sessions_desktop: unavailableMetric("storefront_sessions"),
      sessions_mobile: unavailableMetric("storefront_sessions"),
      source: "unavailable",
    };
  }
}

export { loadStorePreferences, resolveNavConfig, PACKAGE_STORE_DEFAULTS };

/** Update only the scene review key without rewriting merchant preferences. */
export async function saveSceneReviewSettings(env, sceneReview) {
  if (!env.DB) throw new Error("Store database unavailable");
  const result = await env.DB.prepare(
    "UPDATE store_settings SET settings_json = json_set(COALESCE(settings_json, '{}'), '$.sceneReview', json(?)), updated_at = datetime('now') WHERE id = 1"
  ).bind(JSON.stringify(sceneReview)).run();
  if (!(result.meta?.changes > 0)) throw new Error("Store settings not initialized");
  if (env.CMS_CACHE) await env.CMS_CACHE.delete(KV_PREFS_KEY);
  return true;
}


export async function getStoreNav(env) {
  const loaded = await loadStorePreferences(env);
  if (!loaded.ok) return json({ ok: false, error: loaded.error }, { status: 503 });
  const { overlay } = await brandOverlay(env);
  const merged = { ...loaded.settings, ...Object.fromEntries(Object.entries(overlay).filter(([, v]) => v)) };
  // Persisted settings win over brand overlay for explicit nav fields when set.
  if (loaded.settings.navLogoUrl) merged.navLogoUrl = loaded.settings.navLogoUrl;
  if (loaded.settings.homeTitle) merged.homeTitle = loaded.settings.homeTitle;
  if (loaded.settings.navBrandAccent) merged.navBrandAccent = loaded.settings.navBrandAccent;
  return json({ ok: true, nav: resolveNavConfig(merged) });
}

export async function getStorePreferences(env) {
  const loaded = await loadStorePreferences(env);
  if (!loaded.ok) return json({ ok: false, error: loaded.error, detail: loaded.detail }, { status: 503 });
  const { company } = await brandOverlay(env);
  const domain = companyDomain(company);
  return json({
    ok: true,
    domain: domain || null,
    company: company
      ? { id: company.id, name: company.name, logoUrl: company.logoUrl, primaryColor: company.primaryColor }
      : null,
    nav: resolveNavConfig(loaded.settings),
    settings: publicSettings(loaded.settings),
    source: loaded.source,
  });
}

export async function postStorePreferences(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const incoming = body?.settings || body;
  // The picker normally supplies these URLs. The server must enforce safe
  // destinations independently of the admin browser.
  const validAssetUrl = (value) => {
    const s = String(value ?? "").trim();
    return !s || (/^\/(?!\/)[^\s\\]+$/.test(s) && !/[\u0000-\u001f]/.test(s)) || /^https:\/\/[^\s]+$/i.test(s);
  };
  if (!validAssetUrl(incoming.socialImageUrl) || !validAssetUrl(incoming.navLogoUrl)) {
    return json({ error: "Images must use a local path or HTTPS URL." }, { status: 400 });
  }
  for (const key of ["announcementBgColor", "announcementTextColor"]) {
    if (incoming[key] != null && !/^#[0-9a-f]{6}$/i.test(String(incoming[key]))) {
      return json({ error: "Announcement colors must use a six-digit hex value." }, { status: 400 });
    }
  }
  if (incoming.announcementEnabled === true) {
    const announcementText = String(incoming.announcementText ?? "").trim();
    const announcementHref = String(incoming.announcementHref ?? "").trim();
    const validHref =
      (announcementHref.startsWith("/") && !announcementHref.startsWith("//")) ||
      announcementHref.startsWith("#") ||
      announcementHref.startsWith("https://");
    if (!announcementText) {
      return json({ error: "Announcement text is required when the banner is enabled." }, { status: 400 });
    }
    if (!validHref) {
      return json({ error: "Announcement link must start with /, #, or https://." }, { status: 400 });
    }
  }

  const saved = await saveStorePreferences(env, incoming);
  if (!saved.ok) {
    return json({ ok: false, error: saved.error, detail: saved.detail }, { status: 503 });
  }
  return json({
    ok: true,
    settings: publicSettings(saved.settings),
    nav: resolveNavConfig(saved.settings),
  });
}

export async function onlineStoreOverview(env, accountId = null) {
  const [pagesResult, sectionsMax, publishedPages, themes, performance, company] = await Promise.all([
    env.DB.prepare(`SELECT slug, title, status, updated_at FROM pages ORDER BY updated_at DESC`).all(),
    env.DB.prepare(`SELECT MAX(updated_at) AS last_saved FROM page_sections`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM pages WHERE status = 'published'`).first(),
    resolveThemes(env, accountId),
    resolveStorePerformance(env),
    getCompany(env),
  ]);

  const domain = companyDomain(company);
  const prefs = await loadStorePreferences(env);
  const passwordOn = prefs.ok && prefs.settings.passwordProtection;

  return json({
    ok: true,
    store: {
      visibility: passwordOn ? "password" : publishedPages.n > 0 ? "public" : "unpublished",
      url: domain ? `https://${domain}` : null,
      domain: domain || null,
      company_name: company?.name || null,
    },
    performance,
    active_theme: themes.active_theme
      ? { ...themes.active_theme, last_saved: themes.active_theme.last_saved || sectionsMax?.last_saved || null }
      : null,
    draft_themes: themes.draft_themes,
    preview_theme: themes.preview_theme,
    themes: themes.themes,
    theme_content_version: themes.content_version,
    pages: pagesResult.results || [],
  });
}
