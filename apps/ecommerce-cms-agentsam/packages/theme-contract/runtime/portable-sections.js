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
  const spec = (id, label, family, fields, block = null) => Object.freeze({
    id, label, type: family, family, source: id.split("/")[0],
    templateKey: "portable", preset: id,
    fields, blocks: block ? [block] : [],
  });
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
    spec("revise/sticky-curtain", "Sticky curtain hero", "hero", heroFields, buttonBlock),
    spec("revise/wardrobe-rail", "Wardrobe rail", "collections", [f("title", "Heading")], imageCard),
    spec("revise/editorial-statement", "Editorial statement", "story", [f("title", "Heading"), f("body", "Body", "textarea")]),
    spec("revise/faq", "FAQ accordion", "faq", [f("title", "Heading")], faqCard),
    spec("revise/testimonials", "Testimonial cards", "testimonials", [f("title", "Heading")], detailCard),
    spec("revise/trust-row", "Trust row", "trust", [f("title", "Heading")], detailCard),
    spec("revise/newsletter", "Newsletter", "newsletter", cards.concat(f("buttonLabel", "Button text"))),
    spec("cad-beyond/aspiration", "Aspiration", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/complexity", "Complexity", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/uncertainty", "Uncertainty", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/perseverance", "Perseverance", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/understanding", "Understanding", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/capability", "Capability", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/possibility", "Possibility", "cad-beyond-chapter", beyondChapterFields),
    spec("cad-beyond/architectural-evidence", "Architectural evidence", "cad-beyond-evidence", beyondEvidenceFields, evidenceItemBlock),
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
    features: renderDetails, newsletter: renderNewsletter,
    "cad-beyond-chapter": renderBeyondChapter,
    "cad-beyond-evidence": renderBeyondEvidence,
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

  function defaults(id) {
    if (!byId.has(id) && scope.ThemePlatformStock?.get(id)) return scope.ThemePlatformStock.defaults(id);
    if (!byId.has(id) && scope.ThemeReviseAtlas?.get(id)) return scope.ThemeReviseAtlas.defaults(id);
    const definition=byId.get(id);
    if(!definition)return null;
    const authored=cadBeyondDefaults[id];
    const content=JSON.parse(JSON.stringify(authored?.content||genericDefaults[definition.family]||{}));
    const allowed=new Set(definition.fields.map(field=>field.key.split(".")[0]));
    const authoredBlockIds=new Set((authored?.blocks||[]).map(block=>block.id));
    for(const key of Object.keys(content)){
      if(!allowed.has(key)&&!authoredBlockIds.has(key)&&!(definition.blocks.length&&/^card\d+$/.test(key)))delete content[key];
    }
    let defaultBlocks=authored?.blocks?JSON.parse(JSON.stringify(authored.blocks)):[];
    if(!authored){
      for(const field of Object.keys(content))if(/^card\d+$/.test(field))
        defaultBlocks.push({id:field,templateKey:definition.blocks[0]?.key,enabled:true});
      if(definition.blocks.length&&!defaultBlocks.length){
        const block=definition.blocks[0],blockId=block.key+"1";
        content[blockId]=JSON.parse(JSON.stringify(block.defaultContent||{}));
        defaultBlocks.push({id:blockId,templateKey:block.key,enabled:true});
      }
    }
    for(const [key,value] of Object.entries(authored?.blockContent||{}))
      content[key]=JSON.parse(JSON.stringify(value));
    content.__editor={templateKey:"portable",themePreset:id,visibility:{enabled:true},
      ...(defaultBlocks.length?{blocks:defaultBlocks}:{})};
    return content;
  }
  function render(entry) {
    const id = preset(entry);
    if (!byId.has(id) && scope.ThemePlatformStock?.get(id)) return scope.ThemePlatformStock.render(entry);
    if (!byId.has(id) && scope.ThemeReviseAtlas?.get(id)) {
      if (entry.content?.__editor?.visibility?.enabled === false) return "";
      return scope.ThemeReviseAtlas.render(entry);
    }
    const definition = byId.get(id);
    if (!definition) return null;
    const content = entry.content || {};
    if (content.__editor?.visibility?.enabled === false) return "";
    const markup = renders[definition.family](entry);
    const anchor=typeof content.anchor==="string"&&/^[a-z][a-z0-9-]{0,79}$/.test(content.anchor)?' id="'+esc(content.anchor)+'"':"";
    const chapter=definition.family==="cad-beyond-chapter"?' data-chapter="'+esc(content.chapterIndex||"")+'" data-scene-id="'+esc(content.sceneId||"")+'"':"";
    return '<section class="ps-section ps-'+esc(definition.family)+'"'+anchor+chapter+
      ' data-cms-section="'+esc(entry.key)+'" data-portable-preset="'+esc(id)+
      '" data-portable-family="'+esc(definition.family)+'">'+markup+'</section>';
  }
  function validate(id, content) {
    if (!byId.has(id) && scope.ThemePlatformStock?.get(id)) return scope.ThemePlatformStock.validate(id, content);
    if (!byId.has(id) && scope.ThemeReviseAtlas?.get(id)) return scope.ThemeReviseAtlas.validate(id, content);
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
      if (!definition.blocks.length || !Array.isArray(editor.blocks) || editor.blocks.length > 16)
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
  