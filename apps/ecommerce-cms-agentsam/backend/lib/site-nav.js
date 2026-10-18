/**
 * Neutral sitewide navigation defaults for the portable ecommerce package.
 * Customer brand (logo/colors) comes from company + store_settings overlays.
 */

export const DEFAULT_NAV_ITEMS = [
  { id: "home", label: "Home", href: "/", matchPrefixes: ["/", "/index.html"] },
  {
    id: "shop",
    label: "Shop",
    href: "/shop",
    matchPrefixes: ["/shop", "/products/", "/collections/"],
  },
  { id: "about", label: "About", href: "/about", matchPrefixes: ["/about"] },
  {
    id: "community",
    label: "Community",
    href: "/community",
    matchPrefixes: ["/community"],
  },
];

/** @deprecated No package logo — resolve from company / store_settings */
export const DEFAULT_LOGO_URL = "";

export const DEFAULT_NAV_CONFIG = {
  logoUrl: "",
  logoHeight: 58,
  brandAccent: "",
  brandAccentLight: "",
  items: DEFAULT_NAV_ITEMS,
};

export function normalizePath(pathname) {
  const p = (pathname || "/").replace(/\/+$/, "") || "/";
  return p.toLowerCase();
}

/** Longest matching prefix wins */
export function matchNavItem(pathname, items) {
  const path = normalizePath(pathname);
  let best = null;
  let bestLen = -1;

  for (const item of items) {
    const prefixes = item.matchPrefixes?.length ? item.matchPrefixes : [item.href];
    for (const raw of prefixes) {
      const prefix = normalizePath(raw.replace(/\.html$/, "") || "/");
      const hrefNorm = normalizePath(item.href.replace(/\.html$/, "") || "/");

      if (prefix === "/" && path === "/") {
        if (1 > bestLen) {
          best = item;
          bestLen = 1;
        }
        continue;
      }
      if (prefix === "/" && path !== "/") continue;

      const candidates = [prefix, hrefNorm];
      for (const cand of candidates) {
        if (cand === "/") continue;
        if (path === cand || path.startsWith(cand + "/") || path.startsWith(cand)) {
          const len = cand.length;
          if (len > bestLen) {
            best = item;
            bestLen = len;
          }
        }
      }
    }
  }

  return best;
}

export function sanitizeNavItems(items) {
  if (!Array.isArray(items)) return DEFAULT_NAV_ITEMS;
  const out = items
    .map((item, idx) => {
      const label = String(item?.label || "").trim().slice(0, 40);
      const href = String(item?.href || "").trim().slice(0, 512);
      if (!label || !href) return null;
      const matchPrefixes = Array.isArray(item.matchPrefixes)
        ? item.matchPrefixes.map((p) => String(p).slice(0, 128)).filter(Boolean)
        : [href];
      return {
        id: String(item?.id || `nav_${idx}`).slice(0, 64),
        label,
        href,
        matchPrefixes,
      };
    })
    .filter(Boolean);
  return out.length ? out : DEFAULT_NAV_ITEMS;
}

export function resolveNavConfig(settings = {}) {
  return {
    logoUrl: settings.navLogoUrl || DEFAULT_NAV_CONFIG.logoUrl,
    navigationAuthority: settings.navigationAuthority === "preferences" ? "preferences" : "cms",
    logoAuthority: settings.logoAuthority === "preferences" ? "preferences" : "cms",
    announcementAuthority: settings.announcementAuthority === "preferences" ? "preferences" : "cms",
    logoHeight: settings.navLogoHeight || DEFAULT_NAV_CONFIG.logoHeight,
    brandAccent: settings.navBrandAccent || DEFAULT_NAV_CONFIG.brandAccent,
    brandAccentLight: settings.navBrandAccentLight || DEFAULT_NAV_CONFIG.brandAccentLight,
    announcement: {
      enabled: settings.announcementEnabled === true,
      text: String(settings.announcementText || ""),
      href: String(settings.announcementHref || ""),
      style: settings.announcementStyle === "marquee" ? "marquee" : "static",
      backgroundColor: /^#[0-9a-f]{6}$/i.test(settings.announcementBgColor || "") ? settings.announcementBgColor : "#161616",
      textColor: /^#[0-9a-f]{6}$/i.test(settings.announcementTextColor || "") ? settings.announcementTextColor : "#ffffff",
    },
    items: Array.isArray(settings.navItems) && settings.navItems.length
      ? sanitizeNavItems(settings.navItems)
      : DEFAULT_NAV_ITEMS,
  };
}
