/**
 * Applies store SEO prefs from D1 to document head.
 */
(function () {
  async function boot() {
    try {
      const res = await fetch("/api/store/meta");
      if (!res.ok) return;
      const data = await res.json();
      const m = data.meta;
      if (!m) return;

      if (m.homeTitle) {
        document.title = m.homeTitle;
      }
      if (m.metaDescription) {
        let tag = document.querySelector('meta[name="description"]');
        if (!tag) {
          tag = document.createElement("meta");
          tag.name = "description";
          document.head.appendChild(tag);
        }
        tag.content = m.metaDescription;
      }
      if (m.socialImageUrl) {
        for (const prop of ["og:image", "twitter:image"]) {
          let tag = document.querySelector(`meta[property="${prop}"]`) || document.querySelector(`meta[name="${prop}"]`);
          if (!tag) {
            tag = document.createElement("meta");
            if (prop.startsWith("og:")) tag.setAttribute("property", prop);
            else tag.name = prop;
            document.head.appendChild(tag);
          }
          tag.content = m.socialImageUrl;
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
