import { DEFAULT_NAV_ITEMS } from './site-nav-defaults.js';

/** Neutral per-site defaults. Customer identity and selected theme data stay out. */
export const DEFAULT_SITE_STORE_SETTINGS = Object.freeze({
  passwordProtection: false,
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
});

export function mergeSiteSettings(input = {}) {
  const root = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const store = root.store && typeof root.store === "object" && !Array.isArray(root.store)
    ? root.store : {};
  return { ...root, store: { ...DEFAULT_SITE_STORE_SETTINGS, ...store } };
}
