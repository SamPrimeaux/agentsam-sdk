/**
 * Describe where a storefront page actually comes from.
 *
 * A public HTML route and a published CMS snapshot are independent authorities.
 * Never label registry fixtures or an unpublished draft as the live website.
 *
 * This classifier is pure and portable: the host supplies its route catalog.
 */
export function resolvePageAuthority(slug, routes, { seeded = false, cmsPublished = false, cmsDraftLinked = false } = {}) {
  const match = (routes || []).find((route) => route.page === slug && route.handler === "cms-page");
  const liveRoute = match?.path || null;
  return {
    live_route: liveRoute,
    has_live_storefront: Boolean(liveRoute),
    cms_published: Boolean(cmsPublished),
    draft_exists: Boolean(seeded),
    content_authority: cmsPublished
      ? "cms-published"
      : cmsDraftLinked
        ? "cms-draft-linked"
      : seeded
        ? "cms-draft-only" // Keep real private edits immediately usable, even when live HTML is published separately.
        : liveRoute
          ? "storefront-html"
          : "registry-defaults",
  };
}

export function cmsStorefrontRoutes(manifest) {
  return (manifest || [])
    .filter((route) => route.surface === "storefront" && route.handler === "cms-page" && route.page)
    .map((route) => ({ page: route.page, path: route.path, handler: route.handler }));
}
