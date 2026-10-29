/**
 * CMS Configuration
 * Single configuration source for the Plain Jane Journal CMS add-in.
 * No env-var overrides, no hidden setup steps.
 */

export interface CMSConfig {
  siteSlug: string;
  themeSlug: string;
  apiBase: string;
}

export const cmsConfig: CMSConfig = {
  siteSlug: "plain-jane-journal",
  themeSlug: "plain-jane",
  apiBase: "/api/cms",
};
