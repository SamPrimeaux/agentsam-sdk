/* Fuel & Free Time global storefront footer.
 * Reads published site CMS content, falls back to the canonical footer defaults,
 * and mounts the same footer across every storefront page.
 */
(function () {
  const DEFAULTS = {
    brand: {
      logoUrl: "/media/archive/shopify-import/logos/fandft-clear-background.png",
      tagline: "Time is the real flex.",
      footerDescription:
        "For those who've earned their freedom through hard work, service, and dedication. This is more than apparel — it's a badge of the life you've built.",
    },
    footer: {
      exploreTitle: "Explore",
      exploreShopLabel: "Shop",
      exploreShopHref: "/shop",
      exploreCommunityLabel: "Community",
      exploreCommunityHref: "/community",
      exploreCollaborateLabel: "Collaborate",
      exploreCollaborateHref: "/collaborate",
      supportTitle: "Support",
      supportContactLabel: "Contact",
      supportContactHref: "/collaborate",
      supportPoliciesLabel: "Policies",
      supportPoliciesHref: "/policies",
      supportTermsLabel: "Terms",
      supportTermsHref: "/terms",
      supportDashboardLabel: "Dashboard",
      supportDashboardHref: "/admin/",
      connectTitle: "Stay Connected",
      instagramUrl: "",
      facebookUrl: "",
      youtubeUrl: "",
      newsletterTitle: "Get Updates",
      newsletterPlaceholder: "Your email",
      newsletterButtonLabel: "Join",
      copyright: "Fuel & Free Time. All rights reserved.",
      closingLine: "Built for those who've earned it.",
    },
  };

  const SOCIAL_ICONS = {
    instagram:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>',
    facebook:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>',
    youtube:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/></svg>',
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeHref(value, fallback) {
    const href = String(value || fallback || "").trim();
    if (!href) return "";
    if (
      href.startsWith("/") ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      /^https:\/\//i.test(href)
    ) {
      return href;
    }
    return fallback || "#";
  }

  function sectionMap(page) {
    return new Map(
      (page && Array.isArray(page.sections) ? page.sections : []).map((section) => [
        section.key,
        section.content || {},
      ])
    );
  }

  async function loadGlobalCms() {
    const preview = new URLSearchParams(location.search).has("preview");
    const suffix = preview ? "?preview=1" : "";
    try {
      const response = await fetch("/api/cms/pages/site" + suffix, {
        credentials: preview ? "include" : "same-origin",
        headers: { accept: "application/json" },
      });
      if (!response.ok) throw new Error("site CMS unavailable");
      const data = await response.json();
      const sections = sectionMap(data && data.page);
      const legacyBrand = { ...DEFAULTS.brand, ...(sections.get("brand") || {}) };
      const footer = { ...DEFAULTS.footer, ...(sections.get("footer") || {}) };
      return {
        brand: {
          ...legacyBrand,
          ...(footer.logoUrl ? { logoUrl: footer.logoUrl } : {}),
          ...(footer.tagline ? { tagline: footer.tagline } : {}),
          ...(footer.description ? { footerDescription: footer.description } : {}),
        },
        footer,
      };
    } catch (error) {
      console.warn("[FNF footer] using safe defaults:", error && error.message ? error.message : error);
      return structuredClone(DEFAULTS);
    }
  }

  function socialLink(provider, href) {
    const safe = safeHref(href, "");
    const label = provider[0].toUpperCase() + provider.slice(1);
    if (!safe) {
      return '<span class="fnf-social-link is-disabled" aria-label="' + label + ' link not configured">' +
        SOCIAL_ICONS[provider] + "</span>";
    }
    return '<a class="fnf-social-link" href="' + escapeHtml(safe) + '" aria-label="' + label + '"' +
      (/^https:\/\//i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : "") + ">" +
      SOCIAL_ICONS[provider] + "</a>";
  }

  function navItem(label, href, labelKey, hrefKey) {
    return '<li><a data-cms="' + hrefKey + '" data-cms-attr="href" href="' +
      escapeHtml(safeHref(href, "#")) + '"><span data-cms="' + labelKey + '">' +
      escapeHtml(label) + "</span></a></li>";
  }

  function renderFooter(mount, state) {
    const brand = state.brand;
    const footer = state.footer;
    mount.innerHTML =
      '<footer class="fnf-footer" data-global-footer-root>' +
        '<div class="fnf-footer-container">' +
          '<div class="fnf-footer-content">' +
            '<div class="fnf-footer-brand" data-cms-scope="site" data-cms-section="footer">' +
              '<a href="/" class="fnf-footer-logo">' +
                '<img data-cms="logoUrl" data-cms-attr="src" src="' + escapeHtml(safeHref(brand.logoUrl, DEFAULTS.brand.logoUrl)) + '" alt="Fuel & Free Time">' +
              "</a>" +
              '<p class="fnf-footer-tagline" data-cms="tagline">"' + escapeHtml(brand.tagline) + '"</p>' +
              '<p class="fnf-footer-description" data-cms="footerDescription">' + escapeHtml(brand.footerDescription) + "</p>" +
            "</div>" +
            '<div class="fnf-footer-nav" data-cms-scope="site" data-cms-section="footer">' +
              '<h3 data-cms="exploreTitle">' + escapeHtml(footer.exploreTitle) + "</h3>" +
              "<ul>" +
                navItem(footer.exploreShopLabel, footer.exploreShopHref, "exploreShopLabel", "exploreShopHref") +
                navItem(footer.exploreCommunityLabel, footer.exploreCommunityHref, "exploreCommunityLabel", "exploreCommunityHref") +
                navItem(footer.exploreCollaborateLabel, footer.exploreCollaborateHref, "exploreCollaborateLabel", "exploreCollaborateHref") +
              "</ul>" +
            "</div>" +
            '<div class="fnf-footer-nav" data-cms-scope="site" data-cms-section="footer">' +
              '<h3 data-cms="supportTitle">' + escapeHtml(footer.supportTitle) + "</h3>" +
              "<ul>" +
                navItem(footer.supportContactLabel, footer.supportContactHref, "supportContactLabel", "supportContactHref") +
                navItem(footer.supportPoliciesLabel, footer.supportPoliciesHref, "supportPoliciesLabel", "supportPoliciesHref") +
                navItem(footer.supportTermsLabel, footer.supportTermsHref, "supportTermsLabel", "supportTermsHref") +
                navItem(footer.supportDashboardLabel, footer.supportDashboardHref, "supportDashboardLabel", "supportDashboardHref") +
              "</ul>" +
            "</div>" +
            '<div class="fnf-footer-connect" data-cms-scope="site" data-cms-section="footer">' +
              "<div>" +
                '<h3 data-cms="connectTitle">' + escapeHtml(footer.connectTitle) + "</h3>" +
                '<div class="fnf-social-links">' +
                  socialLink("instagram", footer.instagramUrl) +
                  socialLink("facebook", footer.facebookUrl) +
                  socialLink("youtube", footer.youtubeUrl) +
                "</div>" +
              "</div>" +
              '<div class="fft-newsletter-mini">' +
                '<h3 data-cms="newsletterTitle">' + escapeHtml(footer.newsletterTitle) + "</h3>" +
                '<form class="fft-newsletter-form" data-global-newsletter novalidate>' +
                  '<input type="email" class="fft-newsletter-input" name="email" autocomplete="email" required placeholder="' +
                    escapeHtml(footer.newsletterPlaceholder) + '">' +
                  '<button type="submit" class="fft-newsletter-submit">' + escapeHtml(footer.newsletterButtonLabel) + "</button>" +
                "</form>" +
                '<p class="fft-newsletter-status" data-global-newsletter-status aria-live="polite"></p>' +
              "</div>" +
            "</div>" +
          "</div>" +
          '<div class="fnf-footer-bottom" data-cms-scope="site" data-cms-section="footer">' +
            '<p class="fnf-footer-copyright">© <span data-global-footer-year></span> <span data-cms="copyright">' +
              escapeHtml(footer.copyright) + "</span></p>" +
            '<div class="fnf-footer-legal">' +
              '<a href="/policies">Policies</a>' +
              '<a href="/terms">Terms</a>' +
              '<span class="fnf-footer-closing" data-cms="closingLine">' + escapeHtml(footer.closingLine) + "</span>" +
            "</div>" +
          "</div>" +
        "</div>" +
      "</footer>";

    const year = mount.querySelector("[data-global-footer-year]");
    if (year) year.textContent = String(new Date().getFullYear());
    bindNewsletter(mount);
    animateHeadings(mount);
    document.dispatchEvent(new CustomEvent("fnf:global-footer-mounted"));
  }

  function bindNewsletter(mount) {
    const form = mount.querySelector("[data-global-newsletter]");
    const status = mount.querySelector("[data-global-newsletter-status]");
    if (!form || !status) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const input = form.elements.email;
      const button = form.querySelector("button[type='submit']");
      const email = String(input && input.value || "").trim();
      if (!email || !input.checkValidity()) {
        status.textContent = "Enter a valid email.";
        status.className = "fft-newsletter-status is-error";
        input && input.focus();
        return;
      }

      button.disabled = true;
      status.textContent = "Joining…";
      status.className = "fft-newsletter-status";
      try {
        const response = await fetch("/api/newsletter", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, source_page: location.pathname }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not save signup");
        input.value = "";
        status.textContent = "You're in. Watch your inbox.";
        status.className = "fft-newsletter-status is-success";
      } catch (error) {
        status.textContent = error && error.message ? error.message : "Could not save signup.";
        status.className = "fft-newsletter-status is-error";
      } finally {
        button.disabled = false;
      }
    });
  }

  function animateHeadings(mount) {
    const headings = mount.querySelectorAll(".fnf-footer-nav h3, .fnf-footer-connect h3");
    if (!("IntersectionObserver" in window)) {
      headings.forEach((heading) => heading.classList.add("animate"));
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("animate");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.35 }
    );
    headings.forEach((heading) => observer.observe(heading));
  }

  async function mountFooter() {
    const mounts = Array.from(
      document.querySelectorAll("#fnf-footer-mount, [data-global-footer]")
    ).filter((node, index, all) => all.indexOf(node) === index);
    if (!mounts.length) return;
    const state = await loadGlobalCms();
    mounts.forEach((mount) => renderFooter(mount, state));
  }

  window.FNF_GLOBAL_FOOTER = {
    reload: mountFooter,
    defaults: DEFAULTS,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountFooter);
  } else {
    mountFooter();
  }
})();
