import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { CMSPage } from "./cms";
import { fetchPageBySlug, resolveAsset } from "./cms";

/**
 * Helper to update or insert a <meta> element in document.head
 */
function updateMetaTag(nameOrProperty: string, content: string, isProperty = false): void {
  if (typeof document === "undefined") return;
  const selector = isProperty
    ? `meta[property="${nameOrProperty}"]`
    : `meta[name="${nameOrProperty}"]`;
  let meta = document.querySelector(selector) as HTMLMetaElement | null;
  if (!meta) {
    meta = document.createElement("meta");
    if (isProperty) {
      meta.setAttribute("property", nameOrProperty);
    } else {
      meta.setAttribute("name", nameOrProperty);
    }
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}

/**
 * Custom React hook `useSEO`
 * Fetches or accepts the current page object from the CMS data layer,
 * extracts `seo_json` and `og_image_asset_id`, and dynamically synchronizes:
 * - document.title
 * - <meta name="description">
 * - Open Graph tags (og:title, og:description, og:image, og:url, og:type)
 * - Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)
 */
export function useSEO(target?: string | CMSPage | null): { page: CMSPage | null; isLoading: boolean } {
  const location = useLocation();
  const [resolvedPage, setResolvedPage] = useState<CMSPage | null>(
    typeof target === "object" && target !== null ? target : null
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Synchronize target when passed directly as an object, or fetch by slug
  useEffect(() => {
    if (typeof target === "object" && target !== null) {
      setResolvedPage(target);
      return;
    }

    let slug = "";
    if (typeof target === "string" && target.trim()) {
      slug = target.trim();
    } else {
      const pathname = location.pathname;
      if (pathname === "/" || pathname === "") {
        slug = "home";
      } else {
        slug = pathname.replace(/^\/(post|case-study)\//, "").replace(/^\//, "");
      }
    }

    let isMounted = true;
    setIsLoading(true);

    void fetchPageBySlug(slug)
      .then((fetched) => {
        if (isMounted) {
          setResolvedPage(fetched);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.warn("[useSEO] Non-fatal error fetching page SEO:", err);
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [target, location.pathname]);

  // Synchronize document title and meta tags when resolvedPage updates
  useEffect(() => {
    if (!resolvedPage || typeof document === "undefined") return;

    const title =
      resolvedPage.seo_json?.title ||
      resolvedPage.title ||
      "Plain Jane Journal — Notes on a quieter life";

    const description =
      resolvedPage.seo_json?.description ||
      (resolvedPage.metadata?.excerpt as string) ||
      "Essays, photography, and reflections on finding meaning in the spaces between the noise.";

    const ogAssetId =
      resolvedPage.seo_json?.og_image_asset_id ||
      resolvedPage.og_image_asset_id ||
      (resolvedPage.metadata?.cover_asset_id as string) ||
      "asset-og-default";

    const ogAsset = resolveAsset(ogAssetId);
    const imageUrl = ogAsset.url.startsWith("http")
      ? ogAsset.url
      : typeof window !== "undefined"
      ? `${window.location.origin}${ogAsset.url}`
      : ogAsset.url;

    // Update document.title
    document.title = title;

    // Update standard meta tags
    updateMetaTag("description", description);

    // Update Open Graph tags
    updateMetaTag("og:title", title, true);
    updateMetaTag("og:description", description, true);
    updateMetaTag("og:image", imageUrl, true);
    if (typeof window !== "undefined") {
      updateMetaTag("og:url", window.location.href, true);
    }
    updateMetaTag("og:type", resolvedPage.page_type === "post" ? "article" : "website", true);

    // Update Twitter Card tags
    updateMetaTag("twitter:card", "summary_large_image");
    updateMetaTag("twitter:title", title);
    updateMetaTag("twitter:description", description);
    updateMetaTag("twitter:image", imageUrl);
  }, [resolvedPage]);

  return { page: resolvedPage, isLoading };
}
