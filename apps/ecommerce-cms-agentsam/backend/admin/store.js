/**
 * Store preferences service — portable ecommerce package.
 *
 * Brand and domain → selected cms_sites row/settings. KV = cache only.
 * Themes → registry/pages data (never fabricated). Analytics → packaged contract.
 */

import { resolveNavConfig, sanitizeNavItems } from "../lib/site-nav.js";
import { resolveCmsSite } from "../cms/site-context.mjs";
import { DEFAULT_SITE_STORE_SETTINGS as PACKAGE_STORE_DEFAULTS } from "../cms/site-settings-contract.mjs";
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

const KV_PREFS_KEY = siteId => "store:preferences:" + siteId;

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


/** Resolve one owned CMS site without creating a site or falling back to a singleton. */
async function resolvePreferenceSite(env, context = {}) {
  const supplied = env?.CMS_SITE_CONTEXT || {};
  const accountId = context.accountId || context.account_id || supplied.account_id || null;
  const siteId = context.siteId || context.site_id || supplied.id || null;
  const hostname = context.hostname || null;
  if (!env?.DB) throw new Error("store_site_db_unavailable");
  const site = await resolveCmsSite(env.DB, { accountId, siteId, hostname });
  if (!site?.id || !site?.account_id || (accountId && site.account_id !== accountId)) {
    throw new Error("store_site_not_found");
  }
  const row = await env.DB.prepare(
    "SELECT id,account_id,name,slug,primary_domain,settings_json FROM cms_sites WHERE id=? AND account_id=? LIMIT 1"
  ).bind(site.id, site.account_id).first();
  if (!row) throw new Error("store_site_not_found");
  return row;
}

function normalizeSiteDomain(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : "https://" + raw);
    const hostname = url.hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}

function parseSiteSettings(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

/** Per-site CMS settings are authoritative; KV is only a site-keyed cache. */
async function loadStorePreferences(env, { allowCache = true, ...context } = {}) {
  let site;
  try { site = await resolvePreferenceSite(env, context); }
  catch (err) {
    return { ok: false, error: err?.message || "store_site_not_found", settings: null };
  }
  const cacheKey = KV_PREFS_KEY(site.id);
  if (allowCache && env.CMS_CACHE) {
    try {
      const cached = await env.CMS_CACHE.get(cacheKey, "json");
      if (cached && typeof cached === "object" && cached.__ssot === "cms_sites.settings_json.store" &&
          cached.siteId === site.id && cached.settings && typeof cached.settings === "object") {
        return { ok: true, settings: { ...PACKAGE_STORE_DEFAULTS, ...cached.settings }, source: "cache", site };
      }
    } catch { /* ignore stale or malformed cache */ }
  }

  const root = parseSiteSettings(site.settings_json);
  const stored = root.store && typeof root.store === "object" && !Array.isArray(root.store) ? root.store : {};
  const parsed = { ...stored };
  delete parsed.storePassword;
  const settings = { ...PACKAGE_STORE_DEFAULTS, ...parsed };

  if (env.CMS_CACHE) {
    await env.CMS_CACHE.put(cacheKey, JSON.stringify({
      __ssot: "cms_sites.settings_json.store", siteId: site.id, settings, cached_at: Date.now(),
    })).catch(() => {});
  }
  return { ok: true, settings, source: "d1", site };
}

async function saveStorePreferences(env, incoming, context = {}) {
  const loaded = await loadStorePreferences(env, { allowCache: false, ...context });
  if (!loaded.ok) {
    return loaded;
  }
  const current = loaded.settings;
  const next = {
    ...current,
    passwordProtection: incoming.passwordProtection == null ? current.passwordProtection : incoming.passwordProtection === true,
    b2bOnly: incoming.b2bOnly == null ? current.b2bOnly : incoming.b2bOnly === true,
    geoRedirect: incoming.geoRedirect == null ? current.geoRedirect : incoming.geoRedirect === true,
    languageRedirect: incoming.languageRedirect == null ? current.languageRedirect : incoming.languageRedirect === true,
    hcaptchaContact: incoming.hcaptchaContact == null ? current.hcaptchaContact : incoming.hcaptchaContact === true,
    hcaptchaAccount: incoming.hcaptchaAccount == null ? current.hcaptchaAccount : incoming.hcaptchaAccount === true,
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

  try {
    const result = await env.DB.prepare(
      "UPDATE cms_sites SET settings_json=json_set(COALESCE(settings_json,'{}'),'$.store',json(?)),updated_at=datetime('now') WHERE id=? AND account_id=?"
    ).bind(JSON.stringify(next), loaded.site.id, loaded.site.account_id).run();
    if (!(result.meta?.changes > 0)) throw new Error("store_site_write_not_applied");
  } catch (err) {
    return { ok: false, error: "store_preferences_write_failed", detail: err?.message || String(err) };
  }

  if (env.CMS_CACHE) {
    await env.CMS_CACHE.put(KV_PREFS_KEY(loaded.site.id), JSON.stringify({
      __ssot: "cms_sites.settings_json.store", siteId: loaded.site.id, settings: next, cached_at: Date.now(),
    })).catch(() => {});
  }

  return { ok: true, settings: next };
}

export async function verifyStorefrontPassword(env, password, context = {}) {
  const loaded = await loadStorePreferences(env, context);
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
export async function saveSceneReviewSettings(env, sceneReview, context = {}) {
  const site = await resolvePreferenceSite(env, context);
  const result = await env.DB.prepare(
    "UPDATE cms_sites SET settings_json=json_set(COALESCE(settings_json,'{}'),'$.store.sceneReview',json(?)),updated_at=datetime('now') WHERE id=? AND account_id=?"
  ).bind(JSON.stringify(sceneReview), site.id, site.account_id).run();
  if (!(result.meta?.changes > 0)) throw new Error("Store settings could not be saved");
  if (env.CMS_CACHE) await env.CMS_CACHE.delete(KV_PREFS_KEY(site.id));
  return true;
}


export async function getStoreNav(env, context = {}) {
  const loaded = await loadStorePreferences(env, context);
  if (!loaded.ok) return json({ ok: false, error: loaded.error }, { status: 503 });
  const merged = {
    ...loaded.settings,
    homeTitle: loaded.settings.homeTitle || loaded.site?.name || "",
  };
  return json({
    ok: true,
    nav: resolveNavConfig(merged),
    site: {
      id: loaded.site.id,
      name: loaded.site.name || null,
      slug: loaded.site.slug || null,
      primary_domain: normalizeSiteDomain(loaded.site.primary_domain),
    },
  });
}

export async function getStorePreferences(env, context = {}) {
  const loaded = await loadStorePreferences(env, context);
  if (!loaded.ok) return json({ ok: false, error: loaded.error, detail: loaded.detail }, { status: 503 });
  const site = loaded.site;
  const domain = normalizeSiteDomain(site?.primary_domain);
  const siteName = String(site?.name || "").trim() || "Your store";
  return json({
    ok: true,
    domain,
    site: {
      id: site.id,
      name: site.name || null,
      slug: site.slug || null,
      primary_domain: domain,
    },
    company: {
      name: siteName,
      logoUrl: loaded.settings.navLogoUrl || null,
      primaryColor: loaded.settings.navBrandAccent || null,
      tagline: loaded.settings.metaDescription || "",
    },
    nav: resolveNavConfig({
      ...loaded.settings,
      homeTitle: loaded.settings.homeTitle || siteName,
    }),
    settings: publicSettings(loaded.settings),
    source: loaded.source,
  });
}

export async function postStorePreferences(request, env, context = {}) {
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

  const saved = await saveStorePreferences(env, incoming, context);
  if (!saved.ok) {
    return json({ ok: false, error: saved.error, detail: saved.detail }, { status: 503 });
  }
  return json({
    ok: true,
    settings: publicSettings(saved.settings),
    nav: resolveNavConfig(saved.settings),
  });
}

export async function onlineStoreOverview(env, accountId = null, siteId = null) {
  // Resolve and authorize the selected site before reading any storefront data.
  // The previous implementation queried account-wide legacy tables and used
  // the company profile domain, which could surface another site's identity.
  const prefs = await loadStorePreferences(env, { accountId, siteId });
  if (!prefs.ok) {
    return json({ ok: false, error: prefs.error || "store_site_not_found" }, { status: 503 });
  }

  const site = prefs.site;
  const resolvedAccountId = site.account_id;
  const [pagesResult, sectionsMax, publishedPages, themes, performance] = await Promise.all([
    env.DB.prepare("SELECT slug, title, status, updated_at FROM cms_pages WHERE site_id = ? ORDER BY updated_at DESC").bind(site.id).all(),
    env.DB.prepare("SELECT MAX(s.updated_at) AS last_saved FROM cms_page_sections s INNER JOIN cms_pages p ON p.id = s.page_id WHERE p.site_id = ?").bind(site.id).first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM cms_pages WHERE site_id = ? AND status = 'published'").bind(site.id).first(),
    resolveThemes(env, resolvedAccountId),
    resolveStorePerformance(env),
  ]);

  const domain = normalizeSiteDomain(site.primary_domain);
  const publishedCount = Number(publishedPages?.n || 0);

  return json({
    ok: true,
    store: {
      site_id: site.id,
      site_name: site.name || null,
      visibility: prefs.settings.passwordProtection
        ? "password"
        : publishedCount > 0 ? "public" : "unpublished",
      url: domain ? "https://" + domain : null,
      domain,
      company_name: site.name || null,
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
