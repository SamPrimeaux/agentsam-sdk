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
// Installed theme owns its appearance: never substitute a store-specific color
// guess or force the FNF orange/light admin preset on unrelated CMS sites.
import heuristicManifest from '../../../../packages/heuristic-theme/theme.json' with { type: 'json' };
import heuristicTokens from '../../../../packages/heuristic-theme/presets/fuel-free-time/tokens.json' with { type: 'json' };

function appearanceForInstalledPackage(theme) {
  if (theme?.package_name === '@inneranimalmedia/heuristic-theme' &&
      heuristicManifest.entry === 'presets/fuel-free-time/preset.json') {
    return { theme_id: heuristicManifest.id, preset_id: 'fuel-free-time', tokens: heuristicTokens };
  }
  return null; // A new theme must supply its own registered visual contract.
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

  if (incoming.navLogoUrl != null) next.navLogoUrl = String(incoming.navLogoUrl).slice(0, 2048);
  if (incoming.navLogoHeight != null) {
    next.navLogoHeight = Math.min(120, Math.max(40, Number(incoming.navLogoHeight) || 58));
  }
  if (incoming.navBrandAccent != null) next.navBrandAccent = String(incoming.navBrandAccent).slice(0, 32);
  if (incoming.navBrandAccentLight != null) {
    next.navBrandAccentLight = String(incoming.navBrandAccentLight).slice(0, 32);
  }
  if (incoming.navItems != null) next.navItems = sanitizeNavItems(incoming.navItems);
  if (incoming.announcementEnabled != null) next.announcementEnabled = incoming.announcementEnabled === true;
  if (incoming.announcementText != null) {
    next.announcementText = String(incoming.announcementText).trim().slice(0, 160);
  }
  if (incoming.announcementHref != null) {
    next.announcementHref = String(incoming.announcementHref).trim().slice(0, 512);
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

async function resolveThemes(env) {
  // No fabricated themes. Prefer agentsam_products theme rows if present; else empty.
  try {
    const { results } = await env.DB.prepare(
      `SELECT slug AS id, name, version, status, updated_at, package_name
       FROM agentsam_products
       WHERE kind = 'theme'
       ORDER BY updated_at DESC
       LIMIT 20`,
    ).all();
    const themes = (results || []).map((t) => ({
      id: t.id,
      name: t.name,
      status: t.status || "draft",
      version: t.version || null,
      last_saved: t.updated_at || null,
      edit_href: `/admin/theme-editor?slug=shop`,
      preview_href: "/",
      package_name: t.package_name || null,
      appearance: appearanceForInstalledPackage(t),
    }));
    const active = themes.find((t) => t.status === "active" || t.status === "wired") || null;
    const drafts = themes.filter((t) => t !== active);
    return { active_theme: active, draft_themes: drafts };
  } catch {
    return { active_theme: null, draft_themes: [] };
  }
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
  if (incoming.announcementEnabled === true) {
    const announcementText = String(incoming.announcementText ?? "").trim();
    const announcementHref = String(incoming.announcementHref ?? "").trim();
    const validHref =
      announcementHref.startsWith("/") ||
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

export async function onlineStoreOverview(env) {
  const [pagesResult, sectionsMax, publishedPages, themes, performance, company] = await Promise.all([
    env.DB.prepare(`SELECT slug, title, status, updated_at FROM pages ORDER BY updated_at DESC`).all(),
    env.DB.prepare(`SELECT MAX(updated_at) AS last_saved FROM page_sections`).first(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM pages WHERE status = 'published'`).first(),
    resolveThemes(env),
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
    pages: pagesResult.results || [],
  });
}
