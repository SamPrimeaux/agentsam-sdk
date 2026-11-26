/**
 * Shared, real section implementations for merchant-selected visual presets.
 *
 * This is used by the CMS editor, the alternate-theme preview, AND the
 * published storefront. Preset identity lives on section.__editor.themePreset,
 * never in a parallel theme/page database. An advertised preset must have a
 * real renderer here; labels alone cannot register a section.
 *
 * Kept browser/Worker compatible: no DOM, secret, network, or build dependency.
 */
(function (scope) {
  const f = (key, label, type = "text") => ({ key, label, type });
  const heroFields = [
    f("eyebrow", "Eyebrow"), f("headline", "Headline"),
    f("subheadline", "Description", "textarea"),
    f("imageUrl", "Background / side image", "media"),
    f("ctaPrimary.label", "Button text"), f("ctaPrimary.href", "Button link", "link"),
    f("ctaPrimary.openInNewTab", "Open in new tab", "boolean"),
  ];
  const cards = [
    f("title", "Heading"),
    f("text", "Description", "textarea"),
  ];
  const imageCard = {
    key: "collection-card", label: "Collection", repeatable: true, min: 0, max: 12,
    fields: [f("name", "Name"), f("imageUrl", "Image", "media"), f("href", "Link", "link")],
    defaultContent: { name: "New collection", imageUrl: "", href: "/shop" },
  };
  const detailCard = {
    key: "detail-card", label: "Item", repeatable: true, min: 0, max: 12,
    fields: [f("name", "Heading"), f("description", "Description", "textarea")],
    defaultContent: { name: "New item", description: "Edit this description." },
  };
  const faqCard = {
    key: "faq-item", label: "Question", repeatable: true, min: 0, max: 16,
    fields: [f("question", "Question"), f("answer", "Answer", "textarea")],
    defaultContent: { question: "Your question", answer: "Your answer." },
  };
  const buttonBlock = {
    key: "button", label: "Button", category: "Basic", definitionKey: "button",
    repeatable: true, min: 0, max: 4,
    fields: [
      f("label", "Label"),
      f("href", "Link", "link"),
      { key: "variant", label: "Style", type: "select", options: [
        { label: "Solid", value: "solid" },
        { label: "Outline", value: "outline" },
        { label: "Text", value: "text" },
      ] },
    ],
    defaultContent: { label: "Explore", href: "/shop", variant: "solid" },
  };
  const spec = (id, label, family, fields, block = null, options = {}) => Object.freeze({
    id, label, type: family, family, source: id.split("/")[0],
    templateKey: "portable", preset: id,
    fields, blocks: block ? [block] : [], ...options,
  });
  const ptPrincipleBlock = {
    key: "primetech-principle", label: "Principle", repeatable: true, min: 1, max: 6,
    fields: [f("icon", "Icon glyph"), f("label", "Principle")],
    defaultContent: { icon: "◇", label: "Purpose-driven design" },
  };
  const ptPinBlock = {
    key: "primetech-pin", label: "Capability pin", repeatable: true, min: 1, max: 6,
    fields: [f("label", "Label"), f("href", "Destination", "link")],
    defaultContent: { label: "Explore", href: "#" },
  };
  const ptCompanionBlock = {
    key: "primetech-companion", label: "Companion", repeatable: true, min: 0, max: 6,
    fields: [f("name", "Name"), f("role", "Description"), f("imageUrl", "Portrait", "media")],
    defaultContent: { name: "Companion", role: "Creative companion", imageUrl: "" },
  };
  const ptThemeRouteBlock = {
    key: "primetech-theme-route", label: "Theme route", repeatable: true, min: 0, max: 40,
    fields: [f("group", "Route group"), f("label", "Page title"), f("href", "Route link", "link")],
    defaultContent: { group: "core", label: "Page", href: "/themes/iapj/" },
  };

  const PRINCIPLE_BLOCKS = [{ id: "principle1", templateKey: "primetech-principle" }, { id: "principle2", templateKey: "primetech-principle" }, { id: "principle3", templateKey: "primetech-principle" }, { id: "principle4", templateKey: "primetech-principle" }, { id: "principle5", templateKey: "primetech-principle" }, { id: "principle6", templateKey: "primetech-principle" }];
  const PIN_BLOCKS = [{ id: "pin1", templateKey: "primetech-pin" }, { id: "pin2", templateKey: "primetech-pin" }, { id: "pin3", templateKey: "primetech-pin" }, { id: "pin4", templateKey: "primetech-pin" }, { id: "pin5", templateKey: "primetech-pin" }, { id: "pin6", templateKey: "primetech-pin" }];
  const COMPANION_BLOCKS = [{ id: "companion1", templateKey: "primetech-companion" }, { id: "companion2", templateKey: "primetech-companion" }];
  const THEME_ROUTE_BLOCKS = [{ id: "route1", templateKey: "primetech-theme-route" }, { id: "route2", templateKey: "primetech-theme-route" }, { id: "route3", templateKey: "primetech-theme-route" }, { id: "route4", templateKey: "primetech-theme-route" }, { id: "route5", templateKey: "primetech-theme-route" }, { id: "route6", templateKey: "primetech-theme-route" }, { id: "route7", templateKey: "primetech-theme-route" }, { id: "route8", templateKey: "primetech-theme-route" }, { id: "route9", templateKey: "primetech-theme-route" }, { id: "route10", templateKey: "primetech-theme-route" }, { id: "route11", templateKey: "primetech-theme-route" }, { id: "route12", templateKey: "primetech-theme-route" }, { id: "route13", templateKey: "primetech-theme-route" }, { id: "route14", templateKey: "primetech-theme-route" }, { id: "route15", templateKey: "primetech-theme-route" }, { id: "route16", templateKey: "primetech-theme-route" }, { id: "route17", templateKey: "primetech-theme-route" }, { id: "route18", templateKey: "primetech-theme-route" }, { id: "route19", templateKey: "primetech-theme-route" }, { id: "route20", templateKey: "primetech-theme-route" }, { id: "route21", templateKey: "primetech-theme-route" }, { id: "route22", templateKey: "primetech-theme-route" }, { id: "route23", templateKey: "primetech-theme-route" }, { id: "route24", templateKey: "primetech-theme-route" }, { id: "route25", templateKey: "primetech-theme-route" }, { id: "route26", templateKey: "primetech-theme-route" }, { id: "route27", templateKey: "primetech-theme-route" }, { id: "route28", templateKey: "primetech-theme-route" }, { id: "route29", templateKey: "primetech-theme-route" }, { id: "route30", templateKey: "primetech-theme-route" }, { id: "route31", templateKey: "primetech-theme-route" }];

  const beyondChapterFields = Object.freeze([
    f("anchor", "Anchor ID"), f("chapterIndex", "Chapter index"),
    f("chapterNumber", "Chapter number"), f("kicker", "Kicker"),
    f("eyebrow", "Eyebrow"), f("headline", "Headline"),
    f("emphasis", "Emphasized phrase"), f("lede", "Description", "textarea"),
    f("sceneId", "Scene identifier"), f("sceneDescription", "Scene description", "textarea"),
    f("sceneLighting", "Scene lighting"), f("sceneImage", "Scene fallback image", "media"),
    f("ctaLabel", "Action label"), f("ctaHref", "Action destination", "link"),
    f("supportLabel", "Supporting note label"), f("supportTitle", "Supporting note heading"),
    f("supportBody", "Supporting note", "textarea"),
  ]);
  const evidenceItemBlock = Object.freeze({
    key: "evidence-item", label: "Evidence item", repeatable: true, min: 0, max: 12,
    fields: [
      { key: "kind", label: "Content type", type: "select", options: [
        { label: "Project fact", value: "spec" }, { label: "Process step", value: "process" },
      ] },
      f("slug", "Anchor suffix"), f("number", "Number"), f("version", "Version"),
      f("title", "Heading"), f("body", "Description", "textarea"),
      f("lede", "Lead", "textarea"), f("what", "What it is", "textarea"),
      f("why", "Why it matters", "textarea"), f("produces", "What it produces", "textarea"),
      f("imageUrl", "Image", "media"), f("imageAlt", "Image alt text"), f("caption", "Caption"),
    ],
    defaultContent: {
      kind: "process", slug: "step-one", number: "01", version: "STEP ONE",
      title: "Describe the first step", lede: "Explain what happens at this stage.",
      what: "Describe the work.", why: "Explain why it matters.",
      produces: "Describe the result.", imageUrl: "", imageAlt: "", caption: "",
    },
  });
  const beyondEvidenceFields = Object.freeze([
    f("anchor", "Anchor ID"), f("eyebrow", "Eyebrow"), f("categoryLabel", "Category label"),
    f("headlineBefore", "Heading lead"), f("headlineEmphasis", "Emphasized phrase"),
    f("headlineAfter", "Heading continuation"), f("intro", "Introduction", "textarea"),
    f("heroImage", "Hero image", "media"), f("heroImageAlt", "Hero image alt text"),
    f("heroImageCaption", "Hero image caption"), f("asideLabel", "Context label"),
    f("asideBody", "Context text", "textarea"), f("structureImage", "Structure image", "media"),
    f("structureImageAlt", "Structure image alt text"), f("structureCaption", "Structure caption"),
    f("experienceImage", "Experience image", "media"), f("experienceImageAlt", "Experience image alt text"),
    f("experienceCaption", "Experience caption"), f("planTitle", "Drawing review heading"),
    f("planBody", "Drawing review description", "textarea"), f("planImage", "Drawing review image", "media"),
    f("planImageAlt", "Drawing review image alt text"), f("planCaption", "Drawing review caption"),
    f("planCtaLabel", "Drawing review action"), f("planCtaHref", "Drawing review destination", "link"),
    f("processOverline", "Process overline"), f("processTitle", "Process heading"),
    f("processIntro", "Process introduction", "textarea"),
    f("statusNote", "Project status note", "textarea"),
  ]);



  // ONLY register implementations with actual markup + scoped styles below.
  // Other donor concepts remain candidates and MUST NOT appear in Add Section.
  const definitions = Object.freeze([
    spec("cad-beyond/aspiration", "Aspiration", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/complexity", "Complexity", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/uncertainty", "Uncertainty", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/perseverance", "Perseverance", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/understanding", "Understanding", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/capability", "Capability", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/possibility", "Possibility", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/architectural-evidence", "Architectural evidence", "cad-beyond-evidence", beyondEvidenceFields, evidenceItemBlock),
    spec("primetech/hero", "PrimeTech — Mission hero", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("subheadline", "Description", "textarea"),
      f("captionLeft", "Left caption"), f("captionRight", "Right caption"), f("scrollLabel", "Scroll prompt"),
    ], null, { sceneIndex: 0, anchorId: "pt-home" }),
    spec("primetech/design", "PrimeTech — Creative mindset", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("statement", "Statement"), f("body", "Description", "textarea"),
    ], null, { sceneIndex: 1, anchorId: "pt-design" }),
    spec("primetech/engineering", "PrimeTech — Creative engineering", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("body", "Description", "textarea"),
      f("captionTitle", "Caption title"), f("captionBody", "Caption description", "textarea"),
      f("circuitLabel", "Scene label"), f("circuitHint", "Interaction hint"),
      f("circuitFootLeft", "Scene footer left"), f("circuitFootRight", "Scene footer right"),
    ], null, { sceneIndex: 2, anchorId: "pt-engineering" }),
    spec("primetech/principles", "PrimeTech — Principles", "primetech", [
      f("eyebrow", "Eyebrow"), f("sectionKicker", "Section kicker"), f("headline", "Headline", "textarea"),
    ], ptPrincipleBlock, { sceneIndex: 3, anchorId: "pt-principles", defaultBlocks: [{ id: "principle1", templateKey: "primetech-principle" }, { id: "principle2", templateKey: "primetech-principle" }, { id: "principle3", templateKey: "primetech-principle" }, { id: "principle4", templateKey: "primetech-principle" }, { id: "principle5", templateKey: "primetech-principle" }, { id: "principle6", templateKey: "primetech-principle" }] }),
    spec("primetech/world", "PrimeTech — Capabilities", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("body", "Description", "textarea"),
    ], ptPinBlock, { sceneIndex: 4, anchorId: "pt-capabilities", defaultBlocks: [{ id: "pin1", templateKey: "primetech-pin" }, { id: "pin2", templateKey: "primetech-pin" }, { id: "pin3", templateKey: "primetech-pin" }, { id: "pin4", templateKey: "primetech-pin" }, { id: "pin5", templateKey: "primetech-pin" }, { id: "pin6", templateKey: "primetech-pin" }] }),
    spec("primetech/cad", "PrimeTech — CAD Creator", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("body", "Description", "textarea"),
      f("ctaLabel", "Link label"), f("ctaHref", "Link destination", "link"), f("captionTitle", "Caption title"), f("captionBody", "Caption description", "textarea"),
      f("evidenceImage", "Architecture source image", "media"), f("evidenceImageAlt", "Image description"),
      f("evidenceLabel", "Image caption"), f("evidenceSecondaryImage", "Second source image", "media"),
    ], null, { sceneIndex: 5, anchorId: "pt-cad" }),
    spec("primetech/agentsam", "PrimeTech — AgentSam", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("body", "Description", "textarea"),
      f("ctaLabel", "Link label"), f("ctaHref", "Link destination", "link"), f("captionTitle", "Caption title"), f("captionBody", "Caption description", "textarea"),
    ], null, { sceneIndex: 6, anchorId: "pt-agentsam" }),
    spec("primetech/creative", "PrimeTech — Creative department", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("body", "Description", "textarea"),
      f("captionTitle", "Caption title"), f("captionBody", "Caption description", "textarea"),
    ], ptCompanionBlock, { sceneIndex: 7, anchorId: "pt-creative", defaultBlocks: [{ id: "companion1", templateKey: "primetech-companion" }, { id: "companion2", templateKey: "primetech-companion" }] }),
    spec("primetech/themes", "PrimeTech — Theme package", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline"), f("body", "Description", "textarea"),
      f("metric1Value", "Metric 1 value"), f("metric1Label", "Metric 1 label"),
      f("metric2Value", "Metric 2 value"), f("metric2Label", "Metric 2 label"),
      f("metric3Value", "Metric 3 value"), f("metric3Label", "Metric 3 label"),
      f("ctaPrimaryLabel", "Primary link label"), f("ctaPrimaryHref", "Primary link", "link"),
      f("ctaSecondaryLabel", "Secondary link label"), f("ctaSecondaryHref", "Secondary link", "link"),
      f("routeGroupCore", "Core pages heading"), f("routeGroupCategories", "Categories heading"),
      f("routeGroupArticles", "Articles heading"), f("routeFootnote", "Route note", "textarea"),
    ], ptThemeRouteBlock, { sceneIndex: 8, anchorId: "pt-themes", maxBlocks: 40, defaultBlocks: [{ id: "route1", templateKey: "primetech-theme-route" }, { id: "route2", templateKey: "primetech-theme-route" }, { id: "route3", templateKey: "primetech-theme-route" }, { id: "route4", templateKey: "primetech-theme-route" }, { id: "route5", templateKey: "primetech-theme-route" }, { id: "route6", templateKey: "primetech-theme-route" }, { id: "route7", templateKey: "primetech-theme-route" }, { id: "route8", templateKey: "primetech-theme-route" }, { id: "route9", templateKey: "primetech-theme-route" }, { id: "route10", templateKey: "primetech-theme-route" }, { id: "route11", templateKey: "primetech-theme-route" }, { id: "route12", templateKey: "primetech-theme-route" }, { id: "route13", templateKey: "primetech-theme-route" }, { id: "route14", templateKey: "primetech-theme-route" }, { id: "route15", templateKey: "primetech-theme-route" }, { id: "route16", templateKey: "primetech-theme-route" }, { id: "route17", templateKey: "primetech-theme-route" }, { id: "route18", templateKey: "primetech-theme-route" }, { id: "route19", templateKey: "primetech-theme-route" }, { id: "route20", templateKey: "primetech-theme-route" }, { id: "route21", templateKey: "primetech-theme-route" }, { id: "route22", templateKey: "primetech-theme-route" }, { id: "route23", templateKey: "primetech-theme-route" }, { id: "route24", templateKey: "primetech-theme-route" }, { id: "route25", templateKey: "primetech-theme-route" }, { id: "route26", templateKey: "primetech-theme-route" }, { id: "route27", templateKey: "primetech-theme-route" }, { id: "route28", templateKey: "primetech-theme-route" }, { id: "route29", templateKey: "primetech-theme-route" }, { id: "route30", templateKey: "primetech-theme-route" }, { id: "route31", templateKey: "primetech-theme-route" }] }),
    spec("primetech/company", "PrimeTech — Company", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("body", "Description", "textarea"),
      f("ctaLabel", "Link label"), f("ctaHref", "Link destination", "link"),
    ], null, { sceneIndex: 9, anchorId: "pt-company" }),
    spec("primetech/contact", "PrimeTech — Contact", "primetech", [
      f("eyebrow", "Eyebrow"), f("headline", "Headline", "textarea"), f("body", "Description", "textarea"),
      f("ctaLabel", "Inquiry link label"), f("ctaHref", "Inquiry destination", "link"),
      f("secondaryLabel", "Supporting link label"), f("secondaryHref", "Supporting link", "link"),
    ], null, { sceneIndex: 10, anchorId: "pt-contact" }),
  ]);
  const byId = new Map(definitions.map((item) => [item.id, item]));
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const esc = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const isSafeUrl = (value, { allowEmpty = true } = {}) => {
    if (value == null || value === "") return allowEmpty;
    if (typeof value !== "string") return false;
    const v = value.trim();
    return v.length < 2048 && (v.startsWith("/") && !v.startsWith("//")
      || v.startsWith("#") || /^https:\/\//i.test(v) || /^http:\/\//i.test(v));
  };
  const href = (value, fallback = "#") => isSafeUrl(value) ? esc(value || fallback) : esc(fallback);
  const image = (value) => isSafeUrl(value) ? esc(value || "") : "";
  const metadata = (entry) => entry?.content?.__editor || {};
  const preset = (entry) => metadata(entry).themePreset || "";
  const title = (content) => content.title || content.headline || "";
  function sectionBlocks(entry) {
    const content = entry.content || {};
    const info = metadata(entry).blocks;
    if (Array.isArray(info)) return info.filter((block) => block.enabled !== false)
      .map((block) => ({ id: block.id, ...content[block.id] })).filter((item) => typeof item.id === "string");
    return Object.keys(content).filter((key) => /^card\d+$/.test(key) && content[key] && typeof content[key] === "object")
      .map((id) => ({ id, ...content[id] }));
  }
  function heading(content, tag = "h2") {
    return '<' + tag + ' data-cms="title">' + esc(title(content)) + '</' + tag + '>';
  }
  function renderHero(entry) {
    const content = entry.content || {};
    const cta = content.ctaPrimary || {};
    const target = cta.openInNewTab === true ? ' target="_blank" rel="noopener noreferrer"' : "";
    const photo = image(content.imageUrl);
    const buttons = sectionBlocks(entry);
    const actions = buttons.length
      ? buttons.map((item) => {
        const variant = ["solid", "outline", "text"].includes(item.variant) ? item.variant : "solid";
        return '<a class="ps-cta ps-cta--' + variant + '" data-cms-block="' + esc(item.id)
          + '" data-cms="' + esc(item.id) + '.href" data-cms-attr="href" href="' + href(item.href, "/shop") + '">'
          + '<span data-cms="' + esc(item.id) + '.label">' + esc(item.label || "Explore") + '</span>'
          + '<span aria-hidden="true">→</span></a>';
      }).join("")
      : '<a class="ps-cta" data-cms="ctaPrimary.href" data-cms-attr="href" href="' + href(cta.href, "/shop")
        + '"' + target + '><span data-cms="ctaPrimary.label">' + esc(cta.label || "Explore") + '</span><span aria-hidden="true">→</span></a>';
    return '<div class="ps-hero-media">' + (photo ? '<img data-cms="imageUrl" src="' + photo + '" alt="" loading="lazy">' : "") + '</div>'
      + '<div class="ps-inner ps-hero-copy"><p class="ps-kicker" data-cms="eyebrow">' + esc(content.eyebrow || "") + '</p>'
      + '<h2 class="ps-display" data-cms="headline">' + esc(content.headline || "") + '</h2>'
      + '<p class="ps-description" data-cms="subheadline">' + esc(content.subheadline || "") + '</p>'
      + '<div class="ps-hero-actions">' + actions + '</div></div>';
  }
  function renderCollections(entry) {
    const content = entry.content || {};
    return '<div class="ps-inner"><header class="ps-heading">' + heading(content) + '</header>'
      + '<div class="ps-cards">' + sectionBlocks(entry).map((item) =>
        '<a class="ps-card" data-cms-block="' + esc(item.id) + '" href="' + href(item.href, "/shop") + '">'
        + (image(item.imageUrl) ? '<img src="' + image(item.imageUrl) + '" loading="lazy" alt="">' : '<div class="ps-card-placeholder" aria-hidden="true"></div>')
        + '<strong data-cms="' + esc(item.id) + '.name">' + esc(item.name || "Collection") + '</strong></a>'
      ).join("") + '</div></div>';
  }
  function renderStory(entry) {
    const c = entry.content || {};
    const photo = image(c.imageUrl);
    return '<div class="ps-inner ps-story-layout"><div class="ps-story-copy">' + heading(c)
      + '<p data-cms="body">' + esc(c.body || "") + '</p></div>'
      + (photo ? '<img class="ps-story-image" data-cms="imageUrl" src="' + photo + '" loading="lazy" alt="">' : "") + '</div>';
  }
  function renderFaq(entry) {
    return '<div class="ps-inner">' + heading(entry.content || {})
      + '<div class="ps-questions">' + sectionBlocks(entry).map((item) =>
        '<details data-cms-block="' + esc(item.id) + '"><summary data-cms="' + esc(item.id) + '.question">'
        + esc(item.question || "Question") + '</summary><p data-cms="' + esc(item.id) + '.answer">'
        + esc(item.answer || "") + '</p></details>'
      ).join("") + '</div></div>';
  }
  function renderDetails(entry) {
    return '<div class="ps-inner">' + heading(entry.content || {}) + '<div class="ps-detail-grid">'
      + sectionBlocks(entry).map((item) => '<article data-cms-block="' + esc(item.id) + '">'
        + '<h3 data-cms="' + esc(item.id) + '.name">' + esc(item.name || "") + '</h3>'
        + '<p data-cms="' + esc(item.id) + '.description">' + esc(item.description || "") + '</p></article>').join("")
      + '</div></div>';
  }
  function renderNewsletter(entry) {
    const c = entry.content || {};
    const formId = "portable-email-" + String(entry.key).replace(/[^a-z0-9_-]/gi, "-");
    return '<div class="ps-inner ps-signup"><div>' + heading(c)
      + '<p data-cms="text">' + esc(c.text || "") + '</p></div>'
      + '<form method="post" action="/api/newsletter"><label for="' + esc(formId) + '">Email address</label>'
      + '<div class="ps-form-row"><input type="email" id="' + esc(formId)
      + '" name="email" autocomplete="email" required placeholder="Email address">'
      + '<button type="submit" data-cms="buttonLabel">' + esc(c.buttonLabel || "Join") + '</button></div></form></div>';
  }
  const ptLine = (value) => esc(value);
  const ptField = (key, value, tag = "span", className = "") => '<' + tag
    + (className ? ' class="' + esc(className) + '"' : "")
    + ' data-cms="' + esc(key) + '">' + ptLine(value || "") + '</' + tag + '>';
  const ptLink = (labelKey, hrefKey, label, url, className = "pt-link", targetBlank = false) =>
    '<a class="' + className + '" data-cms="' + esc(hrefKey) + '" data-cms-attr="href" href="'
    + href(url, "#") + '"' + (targetBlank ? ' target="_blank" rel="noopener noreferrer"' : '')
    + '><span data-cms="' + esc(labelKey) + '">' + esc(label || "")
    + '</span><span aria-hidden="true">↗</span></a>';
  function renderPrimeTech(entry) {
    const c = entry.content || {};
    const id = preset(entry);
    const blocks = sectionBlocks(entry);
    const eyebrow = ptField("eyebrow", c.eyebrow, "span", "pt-eyebrow");
    const heading = ptField("headline", c.headline, "h2", "pt-display");
    const body = (key = "body") => ptField(key, c[key], "p", "pt-body");
    const caption = (titleKey, bodyKey) => '<div class="pt-caption"><div>'
      + ptField(titleKey, c[titleKey], "p", "pt-caption-title") + '</div><div>'
      + ptField(bodyKey, c[bodyKey], "p", "pt-caption-body") + '</div></div>';
    if (id === "primetech/hero") return '<div class="pt-inner pt-hero-inner"><div class="pt-copy pt-hero-copy">'
      + eyebrow + heading + ptField("subheadline", c.subheadline, "p", "pt-body pt-lede") + '</div>'
      + '<div class="pt-caption pt-hero-caption"><span data-cms="captionLeft">' + esc(c.captionLeft || "")
      + '</span><span data-cms="captionRight">' + esc(c.captionRight || "") + '</span></div>'
      + '<button type="button" class="pt-scroll-next" data-primetech-scroll-next><span data-cms="scrollLabel">'
      + esc(c.scrollLabel || "Explore our story") + '</span><span aria-hidden="true">⌄</span></button></div>';
    if (id === "primetech/design") return '<div class="pt-inner pt-panel-inner pt-panel-inner--right"><div class="pt-copy pt-copy--right">'
      + eyebrow + heading + '</div>' + '<div class="pt-caption pt-caption--two"><div>'
      + ptField("statement", c.statement, "p", "pt-caption-title") + '</div><div>'
      + ptField("body", c.body, "p", "pt-caption-body") + '</div></div></div>';
    if (id === "primetech/engineering") return '<div class="pt-inner pt-panel-inner pt-panel-inner--engineering"><div class="pt-copy pt-copy--right">'
      + eyebrow + heading + body() + '</div><div class="pt-circuit-showcase" aria-label="Original native circuit scene">'
      + '<div class="pt-circuit-bar"><span data-cms="circuitLabel">' + esc(c.circuitLabel || "")
      + '</span><span data-cms="circuitHint">' + esc(c.circuitHint || "") + '</span></div>'
      + '<div class="pt-circuit-stage" data-primetech-circuit data-status="idle" data-state="idle" tabindex="0" role="button" aria-label="Original circuit scene. Hover or tap to energize the circuit traces.">'
      + '<div class="pt-circuit-canvas" data-primetech-circuit-canvas aria-hidden="true"></div>'
      + '<div class="pt-circuit-grain" aria-hidden="true"></div><p class="pt-circuit-error" data-primetech-circuit-error role="status" hidden>Loading the native circuit scene…</p></div>'
      + '<div class="pt-circuit-foot"><span data-cms="circuitFootLeft">' + esc(c.circuitFootLeft || "")
      + '</span><span data-cms="circuitFootRight">' + esc(c.circuitFootRight || "") + '</span></div></div>'
      + caption("captionTitle", "captionBody") + '</div><script src="/assets/js/primetech-circuit.js" defer data-primetech-circuit-runtime></script>';
    if (id === "primetech/principles") return '<div class="pt-inner pt-principles-layout"><div class="pt-principles-heading">'
      + eyebrow + ptField("sectionKicker", c.sectionKicker, "p", "pt-section-kicker") + heading + '</div>'
      + '<div class="pt-principle-list">' + blocks.map((item) => '<div class="pt-principle" data-cms-block="' + esc(item.id) + '">'
        + '<span class="pt-principle-icon" data-cms="' + esc(item.id) + '.icon">' + esc(item.icon || "◇") + '</span>'
        + '<span data-cms="' + esc(item.id) + '.label">' + esc(item.label || "") + '</span></div>').join("")
      + '</div></div>';
    if (id === "primetech/world") return '<div class="pt-inner pt-world-inner"><div class="pt-copy pt-world-copy">'
      + eyebrow + heading + body() + '</div><div class="pt-world-pins" aria-label="Explore PrimeTech creative capabilities">'
      + blocks.map((item) => '<a class="pt-world-pin" data-cms-block="' + esc(item.id) + '" data-cms="' + esc(item.id)
        + '.href" data-cms-attr="href" href="' + href(item.href, "#") + '"><span data-cms="' + esc(item.id)
        + '.label">' + esc(item.label || "") + '</span></a>').join("") + '</div></div>';
    if (id === "primetech/cad") return '<div class="pt-inner pt-panel-inner pt-panel-inner--right"><div class="pt-copy pt-copy--right">'
      + eyebrow + heading + body() + ptLink("ctaLabel", "ctaHref", c.ctaLabel, c.ctaHref)
      + '</div><div class="pt-cad-evidence" aria-label="DreamHouse source architectural images">'
      + (image(c.evidenceImage) ? '<figure><img data-cms="evidenceImage" data-cms-attr="src" src="' + image(c.evidenceImage)
        + '" alt="' + esc(c.evidenceImageAlt || "") + '" loading="lazy" decoding="async"><figcaption data-cms="evidenceLabel">' + esc(c.evidenceLabel || "") + '</figcaption></figure>' : "")
      + (image(c.evidenceSecondaryImage) ? '<figure class="pt-cad-evidence-secondary"><img data-cms="evidenceSecondaryImage" data-cms-attr="src" src="' + image(c.evidenceSecondaryImage)
        + '" alt="Additional source architectural CAD review" loading="lazy" decoding="async"></figure>' : "")
      + '</div>' + caption("captionTitle", "captionBody") + '</div>';
    if (id === "primetech/agentsam") return '<div class="pt-inner pt-panel-inner pt-panel-inner--right"><div class="pt-copy pt-copy--right">'
      + eyebrow + heading + body() + ptLink("ctaLabel", "ctaHref", c.ctaLabel, c.ctaHref)
      + '</div>' + caption("captionTitle", "captionBody") + '</div>';
    if (id === "primetech/creative") return '<div class="pt-inner pt-panel-inner pt-panel-inner--creative"><div class="pt-copy">'
      + eyebrow + heading + body() + '<div class="pt-companion-showcase" aria-label="Original InnerAnimal companions">'
      + blocks.map((item) => '<figure class="pt-companion" data-cms-block="' + esc(item.id) + '">'
        + (image(item.imageUrl) ? '<img data-cms="' + esc(item.id) + '.imageUrl" data-cms-attr="src" src="' + image(item.imageUrl)
          + '" alt="' + esc(item.name || "") + '" loading="lazy" decoding="async">' : '<div class="pt-companion-placeholder" aria-hidden="true"></div>')
        + '<figcaption><strong data-cms="' + esc(item.id) + '.name">' + esc(item.name || "") + '</strong>'
        + '<span data-cms="' + esc(item.id) + '.role">' + esc(item.role || "") + '</span></figcaption></figure>').join("")
      + '</div></div>' + caption("captionTitle", "captionBody") + '</div>';
    if (id === "primetech/themes") {
      const groups = [
        { key: "core", headingKey: "routeGroupCore", label: c.routeGroupCore || "01 / Core pages" },
        { key: "categories", headingKey: "routeGroupCategories", label: c.routeGroupCategories || "02 / Categories" },
        { key: "articles", headingKey: "routeGroupArticles", label: c.routeGroupArticles || "03 / Articles & field guides" },
      ];
      return '<div class="pt-inner pt-theme-inner"><header class="pt-theme-head"><div class="pt-theme-copy">'
        + eyebrow + heading + body() + '</div><div class="pt-theme-actions"><div class="pt-theme-stats">'
        + '<span><strong data-cms="metric1Value">' + esc(c.metric1Value || "") + '</strong> <span data-cms="metric1Label">' + esc(c.metric1Label || "") + '</span></span>'
        + '<span><strong data-cms="metric2Value">' + esc(c.metric2Value || "") + '</strong> <span data-cms="metric2Label">' + esc(c.metric2Label || "") + '</span></span>'
        + '<span><strong data-cms="metric3Value">' + esc(c.metric3Value || "") + '</strong> <span data-cms="metric3Label">' + esc(c.metric3Label || "") + '</span></span>'
        + '</div><div class="pt-theme-links">' + ptLink("ctaPrimaryLabel", "ctaPrimaryHref", c.ctaPrimaryLabel, c.ctaPrimaryHref, "pt-link pt-link--primary", true)
        + ptLink("ctaSecondaryLabel", "ctaSecondaryHref", c.ctaSecondaryLabel, c.ctaSecondaryHref, "pt-link", true) + '</div></div></header>'
        + '<div class="pt-theme-routes">' + groups.map((group) => {
          const items = blocks.filter((item) => item.group === group.key);
          return '<section class="pt-theme-route-group"><header><h3 data-cms="' + group.headingKey + '">' + esc(group.label)
            + '</h3><span>' + items.length + ' routes</span></header><ul>' + items.map((item) =>
              '<li data-cms-block="' + esc(item.id) + '"><a data-cms="' + esc(item.id) + '.href" data-cms-attr="href" href="'
              + href(item.href, "#") + '"><span data-cms="' + esc(item.id) + '.label">' + esc(item.label || "") + '</span><span aria-hidden="true">↗</span></a></li>'
            ).join("") + '</ul></section>';
        }).join("") + '</div><p class="pt-theme-footnote" data-cms="routeFootnote">' + esc(c.routeFootnote || "") + '</p></div>';
    }
    if (id === "primetech/company") return '<div class="pt-inner pt-panel-inner"><div class="pt-copy">'
      + eyebrow + heading + body() + ptLink("ctaLabel", "ctaHref", c.ctaLabel, c.ctaHref) + '</div></div>';
    if (id === "primetech/contact") return '<div class="pt-inner pt-contact-inner"><header class="pt-contact-head">'
      + eyebrow + heading + '</header><div class="pt-contact-bottom"><p data-cms="body">' + esc(c.body || "") + '</p>'
      + '<div class="pt-contact-links">' + ptLink("ctaLabel", "ctaHref", c.ctaLabel, c.ctaHref, "pt-link pt-link--primary", true)
      + ptLink("secondaryLabel", "secondaryHref", c.secondaryLabel, c.secondaryHref) + '</div></div></div>';
    return "";
  }
  function emphasizedText(value, phrase) {
    const source = String(value || ""), mark = String(phrase || "");
    const index = mark ? source.indexOf(mark) : -1;
    if (index < 0) return esc(source);
    return esc(source.slice(0,index)) + "<em>" + esc(mark) + "</em>" + esc(source.slice(index+mark.length));
  }
  function renderBeyondChapter(entry) {
    const c=entry.content||{}, titleId="btb-title-"+String(entry.key||"section").replace(/[^a-z0-9_-]/gi,"-");
    const Heading=c.chapterNumber==="01"?"h1":"h2", photo=image(c.sceneImage);
    const cta=c.ctaLabel&&isSafeUrl(c.ctaHref)
      ? '<a class="ps-btb-cta" data-cms="ctaHref" data-cms-attr="href" href="'+href(c.ctaHref,"#next")+'"><span data-cms="ctaLabel">'+esc(c.ctaLabel)+'</span><span aria-hidden="true">↗</span></a>'
      : "";
    const support=c.supportTitle
      ? '<aside class="ps-btb-support"><span data-cms="supportLabel">'+esc(c.supportLabel||"")+'</span><strong data-cms="supportTitle">'+esc(c.supportTitle)+'</strong><small data-cms="supportBody">'+esc(c.supportBody||"")+'</small></aside>'
      : "";
    return '<div class="ps-btb-chapter__world" aria-hidden="true" data-scene-description="'+esc(c.sceneDescription||"")+'" data-scene-lighting="'+esc(c.sceneLighting||"")+'">'+
      (photo?'<img data-cms="sceneImage" data-cms-attr="src" src="'+photo+'" alt="" loading="lazy" decoding="async">':"")+
      '</div><div class="ps-btb-chapter__inner"><div class="ps-btb-chapter__copy">'+
      '<p class="ps-btb-kicker" data-cms="kicker">'+esc(c.kicker||"")+'</p>'+
      '<p class="ps-btb-eyebrow"><span data-cms="chapterNumber">'+esc(c.chapterNumber||"")+'</span><span data-cms="eyebrow">'+esc(c.eyebrow||"")+'</span></p>'+
      '<'+Heading+' class="ps-btb-title" id="'+esc(titleId)+'" data-cms="headline">'+emphasizedText(c.headline,c.emphasis)+'</'+Heading+'>'+
      '<p class="ps-btb-lede" data-cms="lede">'+esc(c.lede||"")+'</p>'+
      (cta?'<div class="ps-btb-actions">'+cta+'</div>':"")+'</div>'+support+'</div>';
  }
  function renderBeyondEvidence(entry) {
    const c=entry.content||{}, items=sectionBlocks(entry);
    const specs=items.filter(item=>item.kind==="spec"), process=items.filter(item=>item.kind!=="spec");
    const hero=image(c.heroImage), structure=image(c.structureImage), experience=image(c.experienceImage), plan=image(c.planImage);
    const specMarkup=specs.map((item,index)=>
      '<article class="ps-btb-spec" data-cms-block="'+esc(item.id)+'"><span data-cms="'+esc(item.id)+'.number">'+esc(item.number||String(index+1).padStart(2,"0"))+'</span>'+
      '<strong data-cms="'+esc(item.id)+'.title">'+esc(item.title||"")+'</strong><p data-cms="'+esc(item.id)+'.body">'+esc(item.body||"")+'</p></article>').join("");
    const rungMarkup=process.map((item,index)=>{
      const photo=image(item.imageUrl), rungId=/^[a-z0-9-]{1,80}$/.test(item.slug||"")?item.slug:item.id;
      return '<article class="ps-btb-rung" id="rung-'+esc(rungId)+'" data-cms-block="'+esc(item.id)+'"><div class="ps-btb-rung__copy">'+
        '<span class="ps-btb-rung__version" data-cms="'+esc(item.id)+'.version">'+esc(item.version||String(index+1).padStart(2,"0"))+'</span>'+
        '<h3 data-cms="'+esc(item.id)+'.title">'+esc(item.title||"")+'</h3><p class="ps-btb-rung__lede" data-cms="'+esc(item.id)+'.lede">'+esc(item.lede||"")+'</p>'+
        '<dl><div><dt>What it is</dt><dd data-cms="'+esc(item.id)+'.what">'+esc(item.what||"")+'</dd></div>'+
        '<div><dt>Why it matters</dt><dd data-cms="'+esc(item.id)+'.why">'+esc(item.why||"")+'</dd></div>'+
        '<div><dt>What it produces</dt><dd data-cms="'+esc(item.id)+'.produces">'+esc(item.produces||"")+'</dd></div></dl></div>'+
        (photo?'<figure><img data-cms="'+esc(item.id)+'.imageUrl" data-cms-attr="src" src="'+photo+'" alt="'+esc(item.imageAlt||"")+'" loading="lazy"><figcaption data-cms="'+esc(item.id)+'.caption">'+esc(item.caption||"")+'</figcaption></figure>':"")+
        '</article>';
    }).join("");
    const planCta=c.planCtaLabel&&isSafeUrl(c.planCtaHref)
      ? '<a href="'+href(c.planCtaHref,"/studio")+'" data-cms="planCtaHref" data-cms-attr="href"><span data-cms="planCtaLabel">'+esc(c.planCtaLabel)+'</span><span aria-hidden="true">↗</span></a>'
      : "";
    return '<div class="ps-btb-evidence"><div class="ps-btb-evidence__container">'+
      '<div class="ps-btb-evidence__eyebrow"><span data-cms="eyebrow">'+esc(c.eyebrow||"")+'</span><span data-cms="categoryLabel">'+esc(c.categoryLabel||"")+'</span></div>'+
      '<div class="ps-btb-evidence__hero"><div><p class="ps-btb-overline">THE CONCEPT, BROUGHT INTO FOCUS</p><h2 data-cms="headlineBefore">'+emphasizedText(c.headlineBefore,c.headlineEmphasis)+'<br><span data-cms="headlineAfter">'+esc(c.headlineAfter||"")+'</span></h2></div>'+
      '<p data-cms="intro">'+esc(c.intro||"")+'</p></div>'+
      (hero?'<figure class="ps-btb-evidence__wide"><img data-cms="heroImage" data-cms-attr="src" src="'+hero+'" alt="'+esc(c.heroImageAlt||"")+'" loading="lazy"><figcaption data-cms="heroImageCaption">'+esc(c.heroImageCaption||"")+'</figcaption></figure>':"")+
      '<div class="ps-btb-evidence__aside"><span data-cms="asideLabel">'+esc(c.asideLabel||"")+'</span><p data-cms="asideBody">'+esc(c.asideBody||"")+'</p></div>'+
      '<div class="ps-btb-evidence__split">'+
      (structure?'<figure><img data-cms="structureImage" data-cms-attr="src" src="'+structure+'" alt="'+esc(c.structureImageAlt||"")+'" loading="lazy"><figcaption data-cms="structureCaption">'+esc(c.structureCaption||"")+'</figcaption></figure>':"")+
      (experience?'<figure><img data-cms="experienceImage" data-cms-attr="src" src="'+experience+'" alt="'+esc(c.experienceImageAlt||"")+'" loading="lazy"><figcaption data-cms="experienceCaption">'+esc(c.experienceCaption||"")+'</figcaption></figure>':"")+
      '</div>'+(specMarkup?'<div class="ps-btb-evidence__specs">'+specMarkup+'</div>':"")+
      (rungMarkup?'<div class="ps-btb-evidence__process"><header><p class="ps-btb-overline" data-cms="processOverline">'+esc(c.processOverline||"")+'</p><h3 data-cms="processTitle">'+esc(c.processTitle||"")+'</h3><p data-cms="processIntro">'+esc(c.processIntro||"")+'</p></header>'+rungMarkup+'</div>':"")+
      '<div class="ps-btb-evidence__plans"><div><p class="ps-btb-overline">DETAILED VIEW / ARCHITECTURAL REVIEW</p><h3 data-cms="planTitle">'+esc(c.planTitle||"")+'</h3><p data-cms="planBody">'+esc(c.planBody||"")+'</p>'+planCta+'</div>'+
      (plan?'<figure><img data-cms="planImage" data-cms-attr="src" src="'+plan+'" alt="'+esc(c.planImageAlt||"")+'" loading="lazy"><figcaption data-cms="planCaption">'+esc(c.planCaption||"")+'</figcaption></figure>':"")+
      '</div><p class="ps-btb-evidence__status" data-cms="statusNote">'+esc(c.statusNote||"")+'</p></div></div>';
  }


  const renders = {
    hero: renderHero, collections: renderCollections, story: renderStory,
    faq: renderFaq, testimonials: renderDetails, trust: renderDetails,
    features: renderDetails, newsletter: renderNewsletter, primetech: renderPrimeTech,
    "cad-beyond-chapter": renderBeyondChapter, "cad-beyond-evidence": renderBeyondEvidence,
  };
  const genericDefaults = {
    hero: { eyebrow: "New collection", headline: "Your headline", subheadline: "Describe your story.", imageUrl: "", ctaPrimary: { label: "Explore", href: "/shop", openInNewTab: false } },
    collections: { title: "Shop collections", card1: { name: "Collection one", imageUrl: "", href: "/shop" }, card2: { name: "Collection two", imageUrl: "", href: "/shop" } },
    story: { title: "Tell your story", body: "Introduce your point of view.", imageUrl: "" },
    faq: { title: "Frequently asked questions", card1: { question: "Question one", answer: "Add your answer." } },
    testimonials: { title: "What people are saying", card1: { name: "Customer", description: "Add a real customer testimonial." } },
    trust: { title: "Why shop with us", card1: { name: "Your promise", description: "Explain a benefit." } },
    features: { title: "Designed for the details", card1: { name: "Feature one", description: "Explain a feature." } },
    newsletter: { title: "Stay in the loop", text: "Get updates on new releases.", buttonLabel: "Join" },
  }; 
  // Generic defaults only. CAD-site copy, media and project evidence are
  // installed as site-owned cms_page_sections data, never baked into this
  // customer-neutral Ecommerce CMS runtime.
  const cadBeyondDefaults = {
    "cad-beyond/aspiration": { content: {
      anchor:"chapter-one",chapterIndex:"0",chapterNumber:"01",kicker:"THE BEGINNING",eyebrow:"A new idea",
      headline:"Every meaningful project begins somewhere.",emphasis:"begins somewhere.",
      lede:"Introduce the idea before the plan exists.",sceneId:"chapter-one",
      sceneDescription:"Describe the opening scene.",sceneLighting:"Daylight",sceneImage:"",
      ctaLabel:"Follow the journey",ctaHref:"#chapter-two",supportLabel:"",supportTitle:"",supportBody:""
    },blocks:[] },
    "cad-beyond/complexity": { content: {
      anchor:"chapter-two",chapterIndex:"1",chapterNumber:"02",kicker:"THE LANDSCAPE OF DECISIONS",eyebrow:"The obstacle",
      headline:"Between imagining it and building it lies complexity.",emphasis:"complexity.",
      lede:"Describe the systems, decisions and details that make the next step feel difficult.",
      sceneId:"chapter-two",sceneDescription:"Describe the connected systems.",sceneLighting:"Diffused daylight",
      sceneImage:"",ctaLabel:"",ctaHref:"",supportLabel:"",supportTitle:"",supportBody:""
    },blocks:[] },
    "cad-beyond/uncertainty": { content: {
      anchor:"chapter-three",chapterIndex:"2",chapterNumber:"03",kicker:"FINDING A WAY",eyebrow:"The unknown",
      headline:"Not knowing the way forward does not mean there is not one.",emphasis:"way forward",
      lede:"Describe the uncertainty and the next useful step.",sceneId:"chapter-three",
      sceneDescription:"Describe the route through the unknown.",sceneLighting:"Soft daylight",
      sceneImage:"",ctaLabel:"",ctaHref:"",supportLabel:"",supportTitle:"",supportBody:""
    },blocks:[] },
    "cad-beyond/perseverance": { content: {
      anchor:"chapter-four",chapterIndex:"3",chapterNumber:"04",kicker:"KEEP MOVING",eyebrow:"The turning point",
      headline:"Progress comes from rising and trying again.",emphasis:"trying again.",
      lede:"Describe the work that turns setbacks into progress.",sceneId:"chapter-four",
      sceneDescription:"Describe the turning point.",sceneLighting:"Golden hour",
      sceneImage:"",ctaLabel:"",ctaHref:"",supportLabel:"",supportTitle:"",supportBody:""
    },blocks:[] },
    "cad-beyond/understanding": { content: {
      anchor:"chapter-five",chapterIndex:"4",chapterNumber:"05",kicker:"THE IDEA BECOMES VISIBLE",eyebrow:"The bridge",
      headline:"An idea begins to take shape.",emphasis:"take shape.",
      lede:"Describe how a sketch, model or prototype makes the idea understandable.",
      sceneId:"chapter-five",sceneDescription:"Describe the first tangible result.",sceneLighting:"Soft daylight",
      sceneImage:"",ctaLabel:"Explore the project",ctaHref:"#architectural-evidence",
      supportLabel:"PROJECT LINEAGE",supportTitle:"Name the source project",supportBody:"Describe the relationship to its source files."
    },blocks:[] },
    "cad-beyond/capability": { content: {
      anchor:"chapter-six",chapterIndex:"5",chapterNumber:"06",kicker:"REAL WORKING TOOLS",eyebrow:"The capability",
      headline:"Professional power, made approachable.",emphasis:"made approachable.",
      lede:"Explain how the tools help people work through complexity without making expertise the price of entry.",
      sceneId:"chapter-six",sceneDescription:"Describe the working tools and evidence.",sceneLighting:"Studio lighting",
      sceneImage:"",ctaLabel:"Explore the project",ctaHref:"#architectural-evidence",
      supportLabel:"TECHNICAL LAYER",supportTitle:"Name the capability",supportBody:"Describe the underlying geometry, data or system."
    },blocks:[] },
    "cad-beyond/possibility": { content: {
      anchor:"chapter-seven",chapterIndex:"6",chapterNumber:"07",kicker:"THE INVITATION",eyebrow:"The horizon",
      headline:"Your vision deserves a way forward.",emphasis:"a way forward.",
      lede:"Invite the reader to take the next step.",sceneId:"chapter-seven",
      sceneDescription:"Describe the future possibilities.",sceneLighting:"Open daylight",
      sceneImage:"",ctaLabel:"See what becomes possible",ctaHref:"#architectural-evidence",
      supportLabel:"",supportTitle:"",supportBody:""
    },blocks:[] },
    "cad-beyond/architectural-evidence": { content: {
      anchor:"architectural-evidence",eyebrow:"THE REAL WORK",categoryLabel:"ARCHITECTURE & SPATIAL DESIGN",
      headlineBefore:"Bring the project",headlineEmphasis:"into focus.",headlineAfter:"Show the vision and the decisions beneath it.",
      intro:"Introduce a real project and explain what the evidence demonstrates.",
      heroImage:"",heroImageAlt:"",heroImageCaption:"",asideLabel:"FROM VISION TO EXECUTION",
      asideBody:"Explain why the work matters and what the source material proves.",
      structureImage:"",structureImageAlt:"",structureCaption:"",
      experienceImage:"",experienceImageAlt:"",experienceCaption:"",
      planTitle:"See the whole. Inspect the parts.",planBody:"Connect the overview to the source drawings and project files.",
      planImage:"",planImageAlt:"",planCaption:"",planCtaLabel:"Explore the project",planCtaHref:"/studio",
      processOverline:"THE PROCESS / RUNG BY RUNG",processTitle:"Every drawing is a rung. Climb one at a time.",
      processIntro:"Nobody starts fluent. Each stage produces a real drawing and teaches a real lesson.",
      statusNote:"Describe the current review status and any professional limitations."
    },blocks:[{id:"evidence-item1",templateKey:"evidence-item",enabled:true}],blockContent:{
      "evidence-item1":{kind:"process",slug:"first-step",number:"01",version:"STEP ONE",
        title:"Describe the first step",body:"Summarize a verified project fact.",
        lede:"Explain what happened at this stage.",what:"Describe the work.",
        why:"Explain why it matters.",produces:"Describe the output.",imageUrl:"",imageAlt:"",caption:""}
    }}
  };
  const primetechDefaults = {
  "primetech/hero": {
    "eyebrow": "PRIMETECH / CREATIVE ENGINEERING",
    "headline": "Our mission is to\nredefine\nimpossible.",
    "subheadline": "We build the technology, tools and experiences that help ambitious ideas take shape.",
    "captionLeft": "INTELLIGENCE × ENGINEERING × CREATIVE",
    "captionRight": "From concept to a world of possibility.",
    "scrollLabel": "Explore our story"
  },
  "primetech/design": {
    "eyebrow": "01 / THE CREATIVE MINDSET",
    "headline": "Designed\nto see things\ndifferently.",
    "statement": "Imagination is a technical skill.",
    "body": "We turn early ideas into useful systems, digital products and visual experiences. The work starts with curiosity and ends with something people can use."
  },
  "primetech/engineering": {
    "eyebrow": "02 / CREATIVE ENGINEERING",
    "headline": "Built\nto work\ntogether.",
    "body": "Real-time scenes, native rendering and engineered interactions turn a static idea into something people can explore.",
    "captionTitle": "One connected ecosystem.",
    "captionBody": "Web platforms, automation, CAD and real-time 3D belong in one connected workflow. We build the systems that let those disciplines work together.",
    "circuitLabel": "I.AM SCENE / SOURCE 4341",
    "circuitHint": "Hover or tap to energize ↗",
    "circuitFootLeft": "Four original source meshes",
    "circuitFootRight": "Native runtime · Self-hosted assets"
  },
  "primetech/principles": {
    "eyebrow": "03 / HOW WE THINK",
    "sectionKicker": "What makes great work last",
    "headline": "Technology\nwith a reason\nto exist.",
    "principle1": {
      "icon": "◇",
      "label": "Purpose-driven design"
    },
    "principle2": {
      "icon": "▱",
      "label": "Real engineering"
    },
    "principle3": {
      "icon": "⌘",
      "label": "Connected workflows"
    },
    "principle4": {
      "icon": "◎",
      "label": "Human-centered tools"
    },
    "principle5": {
      "icon": "↗",
      "label": "Room to evolve"
    },
    "principle6": {
      "icon": "⊞",
      "label": "End-to-end ownership"
    }
  },
  "primetech/world": {
    "eyebrow": "04 / THE PRIMETECH WORLD",
    "headline": "One world.\nMore ways\nto create.",
    "body": "Explore the products and creative disciplines taking shape at PrimeTech, from intelligent workspaces to dimensional design and immersive worlds.",
    "pin1": {
      "label": "+ CAD Creator",
      "href": "#pt-cad"
    },
    "pin2": {
      "label": "+ SamSculpt",
      "href": "#pt-creative"
    },
    "pin3": {
      "label": "+ SamScene",
      "href": "#pt-creative"
    },
    "pin4": {
      "label": "+ SamSpeak",
      "href": "#pt-creative"
    },
    "pin5": {
      "label": "+ AgentSam",
      "href": "#pt-agentsam"
    },
    "pin6": {
      "label": "+ Plain Jane Journal",
      "href": "#pt-themes"
    }
  },
  "primetech/cad": {
    "eyebrow": "05 / CAD CREATOR",
    "headline": "Ideas into\ndimensions.",
    "body": "CAD Creator connects spatial ideas to real geometry. From architectural models and products to source drawings and dimensional review, the design remains accountable to its original model.",
    "ctaLabel": "Explore CAD Creator",
    "ctaHref": "https://cad.inneranimalmedia.com/",
    "captionTitle": "Precision can be creative.",
    "captionBody": "From architectural volumes to dimensional product concepts, every line is a starting point.",
    "evidenceImage": "/assets/primetech/cad/v12-isometric.jpg",
    "evidenceImageAlt": "DreamHouse V1.2 actual architectural isometric model review",
    "evidenceLabel": "DREAMHOUSE V1.2 / SOURCE MODEL REVIEW",
    "evidenceSecondaryImage": "/assets/primetech/cad/v12-wireframe.jpg"
  },
  "primetech/agentsam": {
    "eyebrow": "06 / THE INTELLIGENCE BEHIND IT",
    "headline": "Meet the\ncreative\nco-worker.",
    "body": "AgentSam connects context, tools and creative workflows so teams can move from research to decisions to finished work without losing the thread.",
    "ctaLabel": "Discover AgentSam",
    "ctaHref": "https://agentsam.inneranimalmedia.com/admin/agentsam",
    "captionTitle": "One assistant. Many disciplines.",
    "captionBody": "Build, design, code and create inside a connected workspace."
  },
  "primetech/creative": {
    "eyebrow": "07 / PRIMETECH CREATIVE DEPARTMENT",
    "headline": "The next\ncreative\nfrontier.",
    "body": "SamScene explores immersive environments. SamSpeak explores voice and expression. SamSculpt explores form and objects. These creative R&D directions share one studio and one design language.",
    "captionTitle": "Made to imagine further.",
    "captionBody": "Creative prototypes, interactive scenes and editorial experiences, grounded in real product work.",
    "companion1": {
      "name": "Geaux",
      "role": "Silverback gorilla",
      "imageUrl": "/assets/primetech/companions/geaux.png"
    },
    "companion2": {
      "name": "Meaux",
      "role": "Creative raccoon",
      "imageUrl": "/assets/primetech/companions/meaux.png"
    }
  },
  "primetech/themes": {
    "eyebrow": "08 / A COMPLETE EDITORIAL THEME PACKAGE",
    "headline": "Plain Jane Journal",
    "body": "A complete publishing and portfolio experience: original storefront, real page templates, category indexes, long-form articles, photography and native CMS editing.",
    "metric1Value": "31",
    "metric1Label": "authored pages",
    "metric2Value": "15",
    "metric2Label": "component definitions",
    "metric3Value": "0.3.0",
    "metric3Label": "package version",
    "ctaPrimaryLabel": "Explore the complete theme",
    "ctaPrimaryHref": "/themes/iapj/",
    "ctaSecondaryLabel": "Theme Store",
    "ctaSecondaryHref": "https://themes.inneranimalmedia.com/",
    "routeGroupCore": "01 / Core pages",
    "routeGroupCategories": "02 / Categories",
    "routeGroupArticles": "03 / Articles & field guides",
    "routeFootnote": "Route index is generated from the IAPJ package's own CMS source manifest. Every page opens as a real route in the locally served theme.",
    "route1": {
      "group": "core",
      "label": "IAPJ editorial home",
      "href": "/themes/iapj/"
    },
    "route2": {
      "group": "core",
      "label": "Blog",
      "href": "/themes/iapj/blog/"
    },
    "route3": {
      "group": "core",
      "label": "About",
      "href": "/themes/iapj/about/"
    },
    "route4": {
      "group": "core",
      "label": "Work & Photography",
      "href": "/themes/iapj/work/"
    },
    "route5": {
      "group": "core",
      "label": "Photography",
      "href": "/themes/iapj/photography/"
    },
    "route6": {
      "group": "core",
      "label": "Search",
      "href": "/themes/iapj/search/"
    },
    "route7": {
      "group": "categories",
      "label": "AI",
      "href": "/themes/iapj/blog/category/ai/"
    },
    "route8": {
      "group": "categories",
      "label": "Edge & Runtime",
      "href": "/themes/iapj/blog/category/runtime/"
    },
    "route9": {
      "group": "categories",
      "label": "UI/UX Guides",
      "href": "/themes/iapj/blog/category/ui-ux/"
    },
    "route10": {
      "group": "categories",
      "label": "Design Systems",
      "href": "/themes/iapj/blog/category/design-systems/"
    },
    "route11": {
      "group": "categories",
      "label": "CMS & Themes",
      "href": "/themes/iapj/blog/category/platform/"
    },
    "route12": {
      "group": "articles",
      "label": "Stop Making LLMs Improvise Everything: How AgentSam Uses Typed Decision Primitives",
      "href": "/themes/iapj/blog/structured-decisions/"
    },
    "route13": {
      "group": "articles",
      "label": "Beyond Brute-Force Prompting: 9 Engineering Drills to Prove Your Agent Understands Large Codebases",
      "href": "/themes/iapj/blog/infrastructure-cookbooks/"
    },
    "route14": {
      "group": "articles",
      "label": "Go Where Machine Work Benefits From Go: Inside AgentSam’s Hybrid Edge-to-Local Runtime",
      "href": "/themes/iapj/blog/native-runtime/"
    },
    "route15": {
      "group": "articles",
      "label": "The 7 Essential UX Design Principles: A Master Guide for Developers & Designers",
      "href": "/themes/iapj/blog/essential-ux-design-principles/"
    },
    "route16": {
      "group": "articles",
      "label": "ASBD Dual-Mode Color Spec & AgentSam Learn Hero Architecture",
      "href": "/themes/iapj/blog/asbd-design-system/"
    },
    "route17": {
      "group": "articles",
      "label": "Multi-Domain CMS Sections: Separating Platform Chrome from Merchant Themes",
      "href": "/themes/iapj/blog/cms-footer-and-asset-architecture/"
    },
    "route18": {
      "group": "articles",
      "label": "Customer Journey Mapping Without the Wall of Sticky Notes",
      "href": "/themes/iapj/blog/ux-guide/customer-journey-map/"
    },
    "route19": {
      "group": "articles",
      "label": "Where UX Is Heading: Agents, Generative Interfaces and the Durable Parts",
      "href": "/themes/iapj/blog/ux-guide/future-of-ux-design/"
    },
    "route20": {
      "group": "articles",
      "label": "What an Interaction Designer Actually Does",
      "href": "/themes/iapj/blog/ux-guide/interaction-designer/"
    },
    "route21": {
      "group": "articles",
      "label": "What a Product Designer Actually Does",
      "href": "/themes/iapj/blog/ux-guide/product-designer/"
    },
    "route22": {
      "group": "articles",
      "label": "Product Roadmaps for Small Teams: Now, Next, Later",
      "href": "/themes/iapj/blog/ux-guide/product-roadmap/"
    },
    "route23": {
      "group": "articles",
      "label": "Becoming a UI/UX Designer: A Realistic 12-Month Roadmap",
      "href": "/themes/iapj/blog/ux-guide/roadmap-to-becoming-uiux-designer/"
    },
    "route24": {
      "group": "articles",
      "label": "Reading User Behavior Data Without Fooling Yourself",
      "href": "/themes/iapj/blog/ux-guide/user-behavior-data/"
    },
    "route25": {
      "group": "articles",
      "label": "User Personas That Actually Change Decisions",
      "href": "/themes/iapj/blog/ux-guide/user-personas/"
    },
    "route26": {
      "group": "articles",
      "label": "User Testing: Methods, Sample Sizes and Session Craft",
      "href": "/themes/iapj/blog/ux-guide/user-testing/"
    },
    "route27": {
      "group": "articles",
      "label": "The UX Reading List: What to Read and Why",
      "href": "/themes/iapj/blog/ux-guide/ux-books/"
    },
    "route28": {
      "group": "articles",
      "label": "The Disciplines Inside UX, and How They Fit Together",
      "href": "/themes/iapj/blog/ux-guide/ux-disciplines/"
    },
    "route29": {
      "group": "articles",
      "label": "The Working UI/UX Design Guide for 2026",
      "href": "/themes/iapj/blog/ux-guide/"
    },
    "route30": {
      "group": "articles",
      "label": "UX Myths Worth Retiring",
      "href": "/themes/iapj/blog/ux-guide/ux-myths/"
    },
    "route31": {
      "group": "articles",
      "label": "Task Analysis: Breaking Work Into Steps You Can Design For",
      "href": "/themes/iapj/blog/ux-guide/ux-task-analysis/"
    }
  },
  "primetech/company": {
    "eyebrow": "09 / THE COMPANY",
    "headline": "Imagination.\nMeet execution.",
    "body": "PrimeTech is InnerAnimalMedia’s engineering and creative practice spanning complete software systems, spatial design, brand and merchandise, and immersive production.",
    "ctaLabel": "Work with us",
    "ctaHref": "#pt-contact"
  },
  "primetech/contact": {
    "eyebrow": "10 / START SOMETHING",
    "headline": "What should\nwe build next?",
    "body": "Tell us your challenge: custom software, branding, merchandise, dimensional design, or an immersive creative experience.",
    "ctaLabel": "Start a project",
    "ctaHref": "https://inneranimalmedia.com/contact",
    "secondaryLabel": "Explore our work",
    "secondaryHref": "https://inneranimalmedia.com/work"

  }
};

  function defaults(id) {
    if (!byId.has(id) && scope.ThemePlatformStock?.get(id)) return scope.ThemePlatformStock.defaults(id);
    const definition = byId.get(id);
    if (!definition) return null;
    const content = JSON.parse(JSON.stringify(cadBeyondDefaults[id]?.content || primetechDefaults[id] || genericDefaults[definition.family] || {}));
    // Defaults must obey the exact registered section schema. Repeatable blocks
    // are declared per preset so their identities remain portable and stable.
    const names = new Set(definition.fields.map((field) => field.key.split(".")[0]));
    const declaredBlockIds = new Set((definition.defaultBlocks || cadBeyondDefaults[id]?.blocks || []).map((block) => block.id));
    for (const key of Object.keys(content)) {
      if (!names.has(key) && !declaredBlockIds.has(key) && !(definition.blocks.length && /^card\d+$/.test(key))) {
        delete content[key];
      }
    }
    for (const [blockId, values] of Object.entries(cadBeyondDefaults[id]?.blockContent || {})) content[blockId] = JSON.parse(JSON.stringify(values));
    const defaultBlocks = (definition.defaultBlocks || cadBeyondDefaults[id]?.blocks || []).map((block) => ({
      id: block.id, templateKey: block.templateKey || definition.blocks[0]?.key, enabled: true,
    }));
    for (const block of defaultBlocks) {
      if (!content[block.id]) content[block.id] = JSON.parse(JSON.stringify(definition.blocks[0]?.defaultContent || {}));
    }
    if (!defaultBlocks.length) for (const field of Object.keys(content)) if (/^card\d+$/.test(field)) {
      defaultBlocks.push({ id: field, templateKey: definition.blocks[0]?.key, enabled: true });
    }
    if (definition.blocks.length && !defaultBlocks.length) {
      const block = definition.blocks[0];
      const blockId = block.key + "1";
      content[blockId] = JSON.parse(JSON.stringify(block.defaultContent || {}));
      defaultBlocks.push({ id: blockId, templateKey: block.key, enabled: true });
    }
    content.__editor={templateKey:"portable",themePreset:id,visibility:{enabled:true},
      ...(defaultBlocks.length?{blocks:defaultBlocks}:{})};
    return content;
  }
  function render(entry) {
    const id = preset(entry);
    if (!byId.has(id) && scope.ThemePlatformStock?.get(id)) return scope.ThemePlatformStock.render(entry);
    const definition = byId.get(id);
    if (!definition) return null;
    const content = entry.content || {};
    if (content.__editor?.visibility?.enabled === false) return "";
    const markup = renders[definition.family](entry);
    const sceneIndex = definition.sceneIndex;
    const sectionId = Number.isInteger(sceneIndex) ? ' id="' + esc(definition.anchorId || ('pt-scene-' + sceneIndex)) + '" data-primetech-scene-index="' + sceneIndex + '"' : "";
    const sceneRuntime = definition.family === "primetech"
      ? '<script src="/assets/js/primetech-scene.js" defer data-primetech-scene-runtime></script>' : "";
    const authoredAnchor = typeof content.anchor === "string" && /^[a-z][a-z0-9-]{0,79}$/.test(content.anchor) ? ' id="'+esc(content.anchor)+'"' : "";
    const chapterAttrs = definition.family === "cad-beyond-chapter" ? ' data-chapter="'+esc(content.chapterIndex || "")+'" data-scene-id="'+esc(content.sceneId || "")+'"' : "";
    return '<section class="ps-section ps-' + esc(definition.family)
      + '"' + (sectionId || authoredAnchor) + chapterAttrs + ' data-cms-section="' + esc(entry.key) + '" data-portable-preset="' + esc(id)
      + '" data-portable-family="' + esc(definition.family) + '">' + markup + sceneRuntime + '</section>';
  }
  function validate(id, content) {
    if (!byId.has(id) && scope.ThemePlatformStock?.get(id)) return scope.ThemePlatformStock.validate(id, content);
    const definition = byId.get(id);
    if (!definition) return { ok: false, error: "Unsupported section preset" };
    if (!content || Array.isArray(content) || typeof content !== "object")
      return { ok: false, error: "Section content must be an object" };
    const allowed = new Set(definition.fields.map((field) => field.key.split(".")[0]));
    allowed.add("__editor");
    const declaredBlocks = Array.isArray(content.__editor?.blocks) ? content.__editor.blocks : [];
    for (const block of declaredBlocks) {
      if (block && typeof block.id === "string") allowed.add(block.id);
    }
    for (const key of Object.keys(content)) {
      if (!allowed.has(key) || ["__proto__", "prototype", "constructor"].includes(key))
        return { ok: false, error: "Unsupported section field: " + key };
    }
    for (const field of definition.fields) {
      const parts = field.key.split(".");
      const value = parts.reduce((v, key) => v == null ? undefined : v[key], content);
      if (value == null || value === "") continue;
      if (field.type === "boolean") {
        if (typeof value !== "boolean") return { ok: false, error: "Invalid " + field.key };
        continue;
      }
      if (typeof value !== "string" || value.length > 12000)
        return { ok: false, error: "Invalid " + field.key };
      if (["link", "media"].includes(field.type) && !isSafeUrl(value))
        return { ok: false, error: "Unsafe " + field.key };
    }
    const editor = content.__editor;
    if (!editor || editor.themePreset !== id || editor.templateKey !== "portable")
      return { ok: false, error: "Invalid portable section identity" };
    if (editor.blocks != null) {
      if (!definition.blocks.length || !Array.isArray(editor.blocks) || editor.blocks.length > (definition.maxBlocks || definition.blocks[0]?.max || 16))
        return { ok: false, error: "Invalid section blocks" };
      const seen = new Set();
      for (const block of editor.blocks) {
        if (!block || !/^[a-zA-Z0-9_-]{1,60}$/.test(block.id || "") ||
            seen.has(block.id) || block.templateKey !== definition.blocks[0].key)
          return { ok: false, error: "Invalid section block identity" };
        seen.add(block.id);
        const values = content[block.id];
        if (values != null && (typeof values !== "object" || Array.isArray(values)))
          return { ok: false, error: "Invalid block data" };
        if (values) for (const [key, value] of Object.entries(values)) {
          const fld = definition.blocks[0].fields.find((field) => field.key === key);
          if (!fld || typeof value !== "string" || value.length > 12000 ||
              (["link", "media"].includes(fld.type) && !isSafeUrl(value)))
            return { ok: false, error: "Invalid block field: " + key };
        }
      }
    }
    return { ok: true };
  }

  scope.ThemePortableSections = Object.freeze({
    definitions,
    get: (id) => byId.get(id) || scope.ThemePlatformStock?.get(id) || scope.ThemeReviseAtlas?.get(id) || null,
    catalog: () => [
      ...definitions.map(({ id, label, family, source, templateKey, preset }) =>
        ({ id, label, type: family, source, templateKey, preset })),
      ...(scope.ThemePlatformStock?.catalog() || []),
      ...(scope.ThemeReviseAtlas?.catalog() || []),
    ],
    defaults, render, validate,
    schema(id) {
      if (!byId.has(id) && scope.ThemePlatformStock?.get(id)) return scope.ThemePlatformStock.schema(id);
      if (!byId.has(id) && scope.ThemeReviseAtlas?.get(id)) return scope.ThemeReviseAtlas.schema(id);
      const definition = byId.get(id);
      if (!definition) return null;
      return {
        label: definition.label,
        fields: definition.fields,
        blocks: definition.blocks,
        settings: [],
        capabilities: { edit: true, reorder: true, duplicate: true, remove: true, blocks: !!definition.blocks.length },
        guardrails: { maxBlocks: definition.maxBlocks || definition.blocks[0]?.max || 0 },
      };
    },
  });
})(globalThis);
