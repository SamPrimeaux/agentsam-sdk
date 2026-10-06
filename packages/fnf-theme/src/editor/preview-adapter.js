(function () {
  const THEMES = [
    {
      id: "heuristic",
      name: "Heuristic",
      description: "Current editorial storefront",
      source: "@inneranimalmedia/heuristic-theme",
    },
    {
      id: "revise",
      name: "Revise",
      description: "Cinematic editorial commerce",
      source: "@inneranimalmedia/revise-theme",
    },
    {
      id: "fnf",
      name: "FNF",
      description: "Industrial Fuel & Free Time system",
      source: "@inneranimalmedia/fnf-theme",
    },
  ];

  const CATALOG = {
    heuristic: [
      { id: "heuristic/hero", label: "Hero", type: "media-hero", templateKey: "hero", preset: "heuristic/hero" },
      { id: "heuristic/collections", label: "Collection list", type: "collection-list", templateKey: "collections", preset: "heuristic/collections" },
      { id: "heuristic/stories", label: "Stories", type: "editorial", templateKey: "stories", preset: "heuristic/stories" },
      { id: "heuristic/newsletter", label: "Newsletter", type: "cta-band", templateKey: "newsletter", preset: "heuristic/newsletter" },
    ],
    revise: [
      { id: "revise/sticky-curtain", label: "Sticky curtain hero", type: "media-hero", templateKey: "hero", preset: "revise/sticky-curtain" },
      { id: "revise/wardrobe-rail", label: "Wardrobe rail", type: "media-gallery", templateKey: "collections", preset: "revise/wardrobe-rail" },
      { id: "revise/dark-promo-grid", label: "Dark promo grid", type: "editorial-grid", templateKey: "collections", preset: "revise/dark-promo-grid" },
      { id: "revise/editorial-statement", label: "Editorial statement", type: "statement", templateKey: "stories", preset: "revise/editorial-statement" },
      { id: "revise/story-rings", label: "Story rings", type: "stories", templateKey: "stories", preset: "revise/story-rings" },
      { id: "revise/tabbed-products", label: "Tabbed products", type: "collection-track", templateKey: "collections", preset: "revise/tabbed-products" },
      { id: "revise/scroll-text-reveal", label: "Scroll text reveal", type: "fullscreen-media-product", templateKey: "stories", preset: "revise/scroll-text-reveal" },
      { id: "revise/parallax-diptych", label: "Parallax diptych", type: "split-media", templateKey: "stories", preset: "revise/parallax-diptych" },
      { id: "revise/hotspot-lookbook", label: "Hotspot lookbook", type: "shop-the-look", templateKey: "collections", preset: "revise/hotspot-lookbook" },
      { id: "revise/pinned-pdp", label: "Pinned product detail", type: "featured-product", templateKey: "collections", preset: "revise/pinned-pdp" },
      { id: "revise/commerce-marquee", label: "Commerce marquee", type: "marquee", templateKey: "stories", preset: "revise/commerce-marquee" },
      { id: "revise/logo-track", label: "Logo track", type: "logo-track", templateKey: "stories", preset: "revise/logo-track" },
      { id: "revise/testimonials", label: "Testimonials", type: "testimonials", templateKey: "stories", preset: "revise/testimonials" },
      { id: "revise/newsletter", label: "Newsletter", type: "cta-band", templateKey: "newsletter", preset: "revise/newsletter" },
      { id: "revise/faq", label: "FAQ", type: "faq", templateKey: "stories", preset: "revise/faq" },
      { id: "revise/trust-row", label: "Trust row", type: "trust-row", templateKey: "stories", preset: "revise/trust-row" },
      { id: "revise/merch-lab", label: "Merch lab", type: "commerce-offers", templateKey: "collections", preset: "revise/merch-lab" },
      { id: "revise/sticky-summary", label: "Sticky summary", type: "bundle-builder", templateKey: "collections", preset: "revise/sticky-summary" },
      { id: "revise/pinned-media-grid", label: "Pinned media grid", type: "collection-split-media", templateKey: "collections", preset: "revise/pinned-media-grid" },
      { id: "revise/brand-film", label: "Brand film", type: "brand-film", templateKey: "stories", preset: "revise/brand-film" },
      { id: "revise/campaign-teaser", label: "Campaign teaser", type: "campaign-teaser", templateKey: "stories", preset: "revise/campaign-teaser" },
      { id: "revise/before-after", label: "Before / after", type: "before-after", templateKey: "stories", preset: "revise/before-after" },
      { id: "revise/sticky-card-deck", label: "Sticky card deck", type: "editorial-posts", templateKey: "stories", preset: "revise/sticky-card-deck" },
      { id: "revise/full-bleed-grid", label: "Full bleed grid", type: "social-gallery", templateKey: "collections", preset: "revise/full-bleed-grid" },
    ],
    fnf: [
      { id: "fnf/scene-hero", label: "Scene hero", type: "scene-hero", templateKey: "hero", preset: "fnf/scene-hero" },
      { id: "fnf/collection-list", label: "Collection list", type: "collection-list", templateKey: "collections", preset: "fnf/collection-list" },
      { id: "fnf/manifesto-split", label: "Manifesto split", type: "media-copy-sequence", templateKey: "stories", preset: "fnf/manifesto-split" },
      { id: "fnf/feature-card-grid", label: "Feature card grid", type: "feature-card-grid", templateKey: "collections", preset: "fnf/feature-card-grid" },
      { id: "fnf/countdown-banner", label: "Countdown banner", type: "countdown-banner", templateKey: "stories", preset: "fnf/countdown-banner" },
      { id: "fnf/newsletter", label: "Newsletter CTA", type: "cta-band", templateKey: "newsletter", preset: "fnf/newsletter" },
    ],
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function section(page, key) {
    return page && Array.isArray(page.sections)
      ? page.sections.find(function (item) { return item.key === key; })
      : null;
  }

  function blocks(entry) {
    const data = entry && entry.content || {};
    const meta = data.__editor && data.__editor.blocks;
    if (Array.isArray(meta) && meta.length) {
      return meta.filter(function (item) { return item.enabled !== false; }).map(function (item) {
        return Object.assign({ id: item.id }, data[item.id] || {});
      });
    }
    return Object.keys(data).filter(function (key) {
      return /^card\d+$/.test(key) && data[key] && typeof data[key] === "object";
    }).map(function (key) {
      return Object.assign({ id: key }, data[key]);
    });
  }

  function visible(entry) {
    return !(entry && entry.content && entry.content.__editor && entry.content.__editor.visibility && entry.content.__editor.visibility.enabled === false);
  }

  function shellHeader(site) {
    const entry = section(site, "header");
    const data = entry && entry.content || {};
    const items = blocks(entry);
    const nav = (items.length ? items : [
      { id: "home", label: "Home", href: "/" },
      { id: "shop", label: "Shop", href: "/shop" },
      { id: "about", label: "About", href: "/about" },
      { id: "community", label: "Community", href: "/community" },
    ]).filter(function (item) {
      return item.visible !== false && item.label && item.href;
    }).map(function (item) {
      return '<a data-cms-block="' + esc(item.id) + '" href="' + esc(item.href) + '">' + esc(item.label) + '</a>';
    }).join("");

    const announce = data.announcementEnabled && data.announcementText
      ? '<a class="tp-announcement" data-cms="announcementText" href="' + esc(data.announcementHref || "#") + '">' + esc(data.announcementText) + '</a>'
      : "";

    return [
      '<div class="tp-global" data-cms-section="header">',
      announce,
      '<header class="tp-header">',
      '<a class="tp-logo" href="/" data-cms="logoUrl"><img src="' + esc(data.logoUrl || "/media/archive/shopify-import/logos/fandft-clear-background.png") + '" alt="Fuel & Free Time"></a>',
      '<nav>' + nav + '</nav>',
      '<span class="tp-bag">Bag 0</span>',
      '</header></div>',
    ].join("");
  }

  function shellFooter(site) {
    const footerEntry = section(site, "footer");
    const footer = footerEntry && footerEntry.content || {};
    const brandEntry = section(site, "brand");
    const brand = brandEntry && brandEntry.content || {};
    const logo = footer.logoUrl || brand.logoUrl || "/media/archive/shopify-import/logos/fandft-clear-background.png";
    const tagline = footer.tagline || brand.tagline || "Time is the real flex.";
    const description = footer.description || brand.footerDescription || "For those who've earned their freedom through hard work, service, and dedication.";
    return [
      '<footer class="tp-footer" data-cms-section="footer">',
      '<div><img data-cms="logoUrl" src="' + esc(logo) + '" alt="Fuel & Free Time"><strong data-cms="tagline">' + esc(tagline) + '</strong><p data-cms="description">' + esc(description) + '</p></div>',
      '<div><strong>Explore</strong><a href="/shop">Shop</a><a href="/community">Community</a><a href="/collaborate">Collaborate</a><a href="/policies">Policies</a><a href="/terms">Terms</a></div>',
      '<div><strong data-cms="newsletterTitle">' + esc(footer.newsletterTitle || "Get Updates") + '</strong><div class="tp-email">Email address <b>→</b></div></div>',
      '</footer>',
    ].join("");
  }

  function commonCss() {
    return [
      '.tp-global{position:relative;z-index:40;font-family:Inter,system-ui,sans-serif}',
      '.tp-announcement{display:block;background:#0a0a0a;color:#fff;text-align:center;padding:7px 16px;text-decoration:none;font-size:11px;letter-spacing:.12em;text-transform:uppercase}',
      '.tp-header{position:sticky;top:0;z-index:50;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:18px;padding:12px max(18px,3vw)}',
      '.tp-header nav{display:flex;gap:18px}.tp-header a{color:inherit;text-decoration:none;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}',
      '.tp-logo img{display:block;height:44px;width:auto}.tp-bag{justify-self:end;font-size:12px;font-weight:700;text-transform:uppercase}',
      '.tp-footer{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:32px;padding:56px max(24px,5vw);background:#080808;color:#f6f3ed;font-family:Inter,system-ui,sans-serif}',
      '.tp-footer img{max-width:110px;display:block;margin-bottom:18px}.tp-footer strong{display:block;margin-bottom:12px}.tp-footer a{display:block;color:#aaa;text-decoration:none;margin:7px 0}.tp-footer p{color:#999;max-width:44ch;line-height:1.5}',
      '.tp-email{border-bottom:1px solid #777;padding:10px 0;color:#aaa;display:flex;justify-content:space-between}',
      '@media(max-width:760px){.tp-header{grid-template-columns:1fr auto}.tp-header nav{display:none}.tp-footer{grid-template-columns:1fr}}',
    ].join("");
  }

  function mediaPool(page) {
    const media = [];
    (page && page.sections || []).forEach(function (entry) {
      const data = entry.content || {};
      Object.keys(data).forEach(function (key) {
        if (typeof data[key] === "string" && /image|media|poster/i.test(key) && data[key]) media.push(data[key]);
      });
      blocks(entry).forEach(function (item) {
        if (item.imageUrl) media.push(item.imageUrl);
      });
    });
    if (!media.length) media.push("/assets/presets/fuel-free-time/earned-hours-hero.webp");
    return media;
  }

  function reviseHero(entry) {
    const data = entry.content || {};
    return [
      '<section class="iam-layout-full" data-section="media-hero" data-theme="revise" data-variant="revise/sticky-curtain" data-cms-section="' + esc(entry.key) + '">',
      '<div class="iam-media-hero">',
      '<figure class="iam-media-hero__media"><img data-cms="imageUrl" src="' + esc(data.imageUrl || "/assets/presets/fuel-free-time/earned-hours-hero.webp") + '" alt=""></figure>',
      '<div class="iam-media-hero__scrim"></div>',
      '<div class="iam-media-hero__copy">',
      '<p class="iam-media-hero__eyebrow" data-cms="eyebrow">' + esc(data.eyebrow || "The Earned Hours Collection") + '</p>',
      '<h1 class="iam-media-hero__heading" data-cms="headline">' + esc(data.headline || data.titleLine1 || "Time is the real horsepower.") + '</h1>',
      '<p class="iam-media-hero__body" data-cms="subheadline">' + esc(data.subheadline || data.body || "") + '</p>',
      '<div class="iam-media-hero__actions"><a class="iam-action iam-action--primary" href="' + esc(data.ctaPrimary && data.ctaPrimary.href || data.ctaHref || "/shop") + '">' + esc(data.ctaPrimary && data.ctaPrimary.label || data.ctaLabel || "Shop") + '</a></div>',
      '</div></div></section>',
    ].join("");
  }

  function reviseCollections(entry) {
    const data = entry.content || {};
    const items = blocks(entry);
    const cards = items.map(function (item, index) {
      return [
        '<a class="tp-revise-card" data-cms-block="' + esc(item.id || "card" + index) + '" href="' + esc(item.href || "/shop") + '">',
        '<img src="' + esc(item.imageUrl || "/assets/presets/fuel-free-time/earned-hours-hero.webp") + '" alt="">',
        '<strong>' + esc(item.name || item.title || "Collection") + '</strong>',
        '</a>',
      ].join("");
    }).join("");
    return '<section class="tp-revise-section" data-theme="revise" data-variant="revise/wardrobe-rail" data-cms-section="' + esc(entry.key) + '"><p class="tp-kicker">The wardrobe</p><h2>' + esc(data.title || "Collections") + '</h2><div class="tp-revise-grid">' + cards + '</div></section>';
  }

  function reviseEditorial(entry) {
    const data = entry.content || {};
    const preset = data.__editor && data.__editor.themePreset || "";
    const isNewsletter = entry.key === "newsletter" || /newsletter/.test(preset);
    if (isNewsletter) {
      return '<section class="tp-revise-newsletter" data-theme="revise" data-cms-section="' + esc(entry.key) + '"><p class="tp-kicker">Fuel & Free Time</p><h2>' + esc(data.title || "Stay fueled up") + '</h2><p>' + esc(data.body || "Get first access to drops, event invites, and the stories that matter.") + '</p><div class="tp-email">Email address <b>' + esc(data.buttonLabel || "Join") + ' →</b></div></section>';
    }
    return '<section class="tp-revise-section tp-revise-statement" data-theme="revise" data-cms-section="' + esc(entry.key) + '"><p class="tp-kicker">Fuel & Free Time</p><h2>' + esc(data.title || data.headline || "Some chase horsepower. We chase hours.") + '</h2><p>' + esc(data.body || data.subheadline || "") + '</p></section>';
  }

  function renderRevise(page, site) {
    const body = (page && page.sections || []).filter(visible).map(function (entry) {
      const templateKey = entry.content && entry.content.__editor && entry.content.__editor.templateKey || entry.key;
      if (templateKey === "hero") return reviseHero(entry);
      if (templateKey === "collections") return reviseCollections(entry);
      return reviseEditorial(entry);
    }).join("");
    const css = [
      'html,body{margin:0;background:#090909;color:#f7f4ef}',
      '.tp-header{margin:10px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(240,238,232,.9);backdrop-filter:blur(18px);color:#151515}',
      '.tp-revise-section{padding:clamp(56px,8vw,110px) max(24px,5vw);background:#f1efe9;color:#151515;font-family:Inter,system-ui,sans-serif}',
      '.tp-revise-section:nth-of-type(even){background:#111;color:#f4f1eb}',
      '.tp-kicker{text-transform:uppercase;letter-spacing:.13em;font-size:11px;font-weight:700}',
      '.tp-revise-section h2,.tp-revise-newsletter h2{font-size:clamp(2.6rem,6vw,6rem);line-height:.92;letter-spacing:-.04em;margin:.18em 0 .45em;max-width:12ch}',
      '.tp-revise-statement p:last-child{max-width:50ch;line-height:1.6}',
      '.tp-revise-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.tp-revise-card{color:inherit;text-decoration:none}.tp-revise-card img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}.tp-revise-card strong{display:block;padding:12px 0}',
      '.tp-revise-newsletter{padding:70px max(24px,6vw);background:#d9d3c8;color:#111;font-family:Inter,system-ui,sans-serif}',
      '@media(max-width:760px){.tp-revise-grid{grid-template-columns:1fr}}',
      commonCss(),
    ].join("");
    return '<!doctype html><html lang="en" data-theme="revise"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/theme-previews/revise/layout.css"><link rel="stylesheet" href="/admin/theme-previews/revise/theme.css"><style>' + css + '</style></head><body>' + shellHeader(site) + '<main>' + body + '</main>' + shellFooter(site) + '</body></html>';
  }

  function fnfSection(entry) {
    const data = entry.content || {};
    const templateKey = data.__editor && data.__editor.templateKey || entry.key;
    if (templateKey === "hero") {
      return [
        '<section class="fnf-preview-hero" data-section="scene-hero" data-cms-section="' + esc(entry.key) + '">',
        '<div class="scene-hero__inner"><div class="scene-hero__copy">',
        '<p class="scene-hero__eyebrow" data-cms="eyebrow">' + esc(data.eyebrow || "Fuel & Free Time") + '</p>',
        '<h1 class="scene-hero__title" data-cms="headline">' + esc(data.headline || data.titleLine1 || "Time is the real horsepower") + '</h1>',
        '<p data-cms="subheadline">' + esc(data.subheadline || data.body || "") + '</p>',
        '<a class="fnf-preview-cta" href="' + esc(data.ctaPrimary && data.ctaPrimary.href || data.ctaHref || "/shop") + '">' + esc(data.ctaPrimary && data.ctaPrimary.label || data.ctaLabel || "Explore") + '</a>',
        '</div><div class="fnf-preview-hero-media"><img src="' + esc(data.imageUrl || "/assets/presets/fuel-free-time/earned-hours-hero.webp") + '" alt=""></div></div></section>',
      ].join("");
    }
    if (templateKey === "collections") {
      const cards = blocks(entry).map(function (item) {
        return '<a class="fnf-preview-card" data-cms-block="' + esc(item.id) + '" href="' + esc(item.href || "/shop") + '"><img src="' + esc(item.imageUrl || "/assets/presets/fuel-free-time/earned-hours-hero.webp") + '" alt=""><strong>' + esc(item.name || item.title || "Collection") + '</strong></a>';
      }).join("");
      return '<section class="fnf-preview-section" data-cms-section="' + esc(entry.key) + '"><p class="fnf-preview-kicker">Limited drops</p><h2>' + esc(data.title || "Fuel your style") + '</h2><div class="fnf-preview-grid">' + cards + '</div></section>';
    }
    if (templateKey === "newsletter") {
      return '<section class="fnf-preview-newsletter" data-cms-section="' + esc(entry.key) + '"><p class="fnf-preview-kicker">Stay connected</p><h2>' + esc(data.title || "Stay fueled up") + '</h2><p>' + esc(data.body || "") + '</p><div class="tp-email">Enter your email <b>' + esc(data.buttonLabel || "Join") + ' →</b></div></section>';
    }
    return '<section class="fnf-preview-split" data-cms-section="' + esc(entry.key) + '"><div><p class="fnf-preview-kicker">The earned hours</p><h2>' + esc(data.title || data.headline || "Some chase horsepower. We chase hours.") + '</h2><p>' + esc(data.body || data.subheadline || "") + '</p></div><img src="' + esc(data.imageUrl || "/assets/presets/fuel-free-time/masters.webp") + '" alt=""></section>';
  }

  function renderFnf(page, site) {
    const body = (page && page.sections || []).filter(visible).map(fnfSection).join("");
    const css = [
      'html,body{margin:0;background:var(--fnf-color-canvas,#090909);color:var(--fnf-color-text,#f5f1e8);font-family:var(--fnf-font-body,Inter,system-ui,sans-serif)}',
      '.tp-header{background:#0b0b0c;border-bottom:1px solid rgba(255,255,255,.1)}',
      '.fnf-preview-hero{min-height:78svh;position:relative;overflow:hidden}.fnf-preview-hero-media{position:absolute;inset:0 0 0 48%;overflow:hidden;opacity:.62}.fnf-preview-hero-media:after{content:"";position:absolute;inset:0;background:linear-gradient(90deg,#090909 0%,transparent 55%)}.fnf-preview-hero-media img{width:100%;height:100%;object-fit:cover}.fnf-preview-hero .scene-hero__copy p{max-width:52ch;line-height:1.6}.fnf-preview-cta{display:inline-flex;margin-top:20px;padding:13px 18px;background:var(--fnf-color-brand-primary,#e05a20);color:#0a0a0a;text-decoration:none;font-weight:800;text-transform:uppercase}',
      '.fnf-preview-section,.fnf-preview-split,.fnf-preview-newsletter{padding:clamp(56px,8vw,110px) max(24px,6vw)}.fnf-preview-section h2,.fnf-preview-split h2,.fnf-preview-newsletter h2{font:400 clamp(2.8rem,6vw,6rem)/.9 var(--fnf-font-display,Impact,sans-serif);text-transform:uppercase;margin:.15em 0 .35em}.fnf-preview-kicker{font:700 12px/1 var(--fnf-font-mono,monospace);letter-spacing:.16em;text-transform:uppercase;color:var(--fnf-color-brand-primary,#e05a20)}',
      '.fnf-preview-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.fnf-preview-card{color:inherit;text-decoration:none}.fnf-preview-card img{width:100%;aspect-ratio:4/5;object-fit:cover}.fnf-preview-card strong{display:block;padding:12px 2px;font-size:14px;text-transform:uppercase}',
      '.fnf-preview-split{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center;background:var(--fnf-color-surface-2,#151515)}.fnf-preview-split img{width:100%;aspect-ratio:1/1;object-fit:cover}.fnf-preview-split p{line-height:1.7;color:var(--fnf-color-text-muted,#aaa)}',
      '.fnf-preview-newsletter{background:var(--fnf-color-brand-primary,#e05a20);color:#080808}',
      '@media(max-width:760px){.fnf-preview-hero-media{inset:35% 0 0 0}.fnf-preview-grid,.fnf-preview-split{grid-template-columns:1fr}}',
      commonCss(),
    ].join("");
    return '<!doctype html><html lang="en" data-theme="fnf"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin/theme-previews/fnf/tokens.css"><link rel="stylesheet" href="/admin/theme-previews/fnf/layout.css"><link rel="stylesheet" href="/admin/theme-previews/fnf/scene-hero.css"><style>' + css + '</style></head><body>' + shellHeader(site) + '<main>' + body + '</main>' + shellFooter(site) + '</body></html>';
  }

  function render(themeId, page, site) {
    if (themeId === "revise") return renderRevise(page, site);
    if (themeId === "fnf") return renderFnf(page, site);
    return "";
  }

  if (!window.ThemeStudioPreview) {
    throw new Error('Portable Theme Studio preview registry must load before the FNF theme adapter');
  }
  THEMES.forEach(function (theme) {
    window.ThemeStudioPreview.register({
      ...theme,
      catalog: CATALOG[theme.id],
      render: theme.id === 'heuristic' ? null : function (page, site) {
        return render(theme.id, page, site);
      },
    });
  });
})();
