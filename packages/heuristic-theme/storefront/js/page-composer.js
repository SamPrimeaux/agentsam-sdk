import { projectCmsSections } from "./cms-structure.js";

const script = document.querySelector('script[type="module"][src$="/js/page-composer.js"]');
const presetId = script?.dataset.preset;
const pageId = script?.dataset.page;
const root = document.getElementById("heuristic-page");

function fail(message) {
  throw new Error(`[Heuristic] ${message}`);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHref(value) {
  const href = String(value ?? "").trim();
  if (!href) return fail("invalid link: empty");
  if (href.startsWith("#") || /^https:\/\//i.test(href)) {
    return escapeHtml(href);
  }

  // Normalize same-origin legacy/static CMS links such as "./shop.html" to
  // the canonical storefront route. Old published CMS data must not be able
  // to blank the entire composed page just because it predates clean routes.
  try {
    const url = new URL(href, location.origin + "/");
    if (url.origin !== location.origin) return fail(`invalid link: ${href}`);
    let pathname = url.pathname || "/";
    pathname = pathname === "/index.html" ? "/" : pathname.replace(/\.html$/i, "");
    return escapeHtml(`${pathname}${url.search}${url.hash}`);
  } catch {
    return fail(`invalid link: ${href}`);
  }
}

async function requiredJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) fail(`${url} returned ${response.status}`);
  return response.json();
}

function requiredString(object, key, context) {
  const value = object?.[key];
  if (typeof value !== "string" || !value.trim()) fail(`${context}.${key} is required`);
  return value.trim();
}

function requiredBlock(section, type) {
  const block = section.blocks.find((entry) => entry.type === type && entry.visibility?.enabled !== false);
  if (!block) fail(`${section.id} requires block ${type}`);
  return block;
}

function requiredAsset(assets, key) {
  const value = assets[key];
  if (!value) fail(`asset ${key} is not declared by the preset`);
  return value;
}

function applyTokens(tokens) {
  if (tokens.scope !== "fnf") fail("token scope must be fnf");
  const map = {
    canvas: "--h-color-canvas",
    surface: "--h-color-surface",
    surfaceRaised: "--h-color-surface-raised",
    ink: "--h-color-ink",
    muted: "--h-color-muted",
    line: "--h-color-line",
    accent: "--h-color-accent",
    accentSoft: "--h-color-accent-soft",
    positive: "--h-color-positive",
  };
  for (const [key, variable] of Object.entries(map)) {
    const value = tokens.color?.[key];
    if (!value) fail(`token color.${key} is required`);
    document.documentElement.style.setProperty(variable, value);
  }
}

function applyCmsContent(section, content) {
  if (!content) fail(`CMS section ${section.cmsKey} is required`);
  const block = (type) => requiredBlock(section, type);
  const templateKey = section.cmsTemplateKey || section.cmsKey;

  switch (templateKey) {
    case "hero": {
      block("copy.display").content = {
        eyebrow: "The Earned Hours Collection",
        title: `${requiredString(content, "titleLine1", "home.hero")} ${requiredString(content, "titleLine2", "home.hero")}`,
        body: requiredString(content, "subheadline", "home.hero"),
      };
      block("actions.group").content = {
        primary: {
          label: requiredString(content, "ctaLabel", "home.hero"),
          href: requiredString(content, "ctaHref", "home.hero"),
        },
        secondary: { label: "Explore collections", href: "/shop/collections" },
      };
      break;
    }
    case "manifesto": {
      block("copy.display").content.title = `${requiredString(content, "line1", "home.manifesto")} ${requiredString(content, "highlight1", "home.manifesto")} ${requiredString(content, "line2", "home.manifesto")} ${requiredString(content, "highlight2", "home.manifesto")}`;
      block("copy.rich").content.paragraphs = [
        requiredString(content, "body1", "home.manifesto"),
        requiredString(content, "body2", "home.manifesto"),
        requiredString(content, "body3", "home.manifesto"),
      ];
      break;
    }
    case "collections": {
      block("copy.section-heading").content = {
        eyebrow: requiredString(content, "badge", "home.collections"),
        title: requiredString(content, "title", "home.collections"),
      };
      ["card1", "card2", "card3"].forEach((key, index) => {
        const card = content[key];
        if (!card) fail(`home.collections.${key} is required`);
        const target = section.blocks.filter((entry) => entry.type === "collection.card")[index];
        target.content = {
          ...target.content,
          title: requiredString(card, "name", `home.collections.${key}`),
          body: requiredString(card, "description", `home.collections.${key}`),
          href: requiredString(card, "href", `home.collections.${key}`),
        };
      });
      break;
    }
    case "values": {
      block("copy.section-heading").content.title = requiredString(content, "title", "home.values");
      ["v1", "v2", "v3"].forEach((key, index) => {
        const value = content[key];
        if (!value) fail(`home.values.${key} is required`);
        const target = section.blocks.filter((entry) => entry.type === "feature.card")[index];
        target.content = {
          title: requiredString(value, "title", `home.values.${key}`),
          body: requiredString(value, "description", `home.values.${key}`),
        };
      });
      break;
    }
    case "community": {
      block("copy.display").content = {
        title: requiredString(content, "title", "home.community"),
        body: requiredString(content, "subtitle", "home.community"),
      };
      break;
    }
    case "newsletter": {
      block("copy.section-heading").content = {
        title: requiredString(content, "title", "home.newsletter"),
        body: requiredString(content, "text", "home.newsletter"),
      };
      block("form.email").content.buttonLabel = requiredString(content, "buttonLabel", "home.newsletter");
      break;
    }
    default:
      fail(`no CMS adapter exists for ${section.cmsKey}`);
  }
}

function actionMarkup(action, className = "h-button") {
  return `<a class="${className}" href="${safeHref(action.href)}">${escapeHtml(action.label)} <span aria-hidden="true">→</span></a>`;
}

function renderHero(section, assets) {
  const copy = requiredBlock(section, "copy.display").content;
  const actions = requiredBlock(section, "actions.group").content;
  const media = requiredBlock(section, "media.image").content;
  const image = requiredAsset(assets, media.asset);
  return `<section class="hc-section hc-hero" data-h-section="${escapeHtml(section.id)}" data-h-header-mode="${escapeHtml(section.appearance.headerMode)}">
    <img class="hc-hero__media" src="${escapeHtml(image)}" alt="${escapeHtml(media.alt)}">
    <div class="hc-hero__shade"></div>
    <div class="h-container hc-hero__content">
      <p class="h-eyebrow">${escapeHtml(copy.eyebrow)}</p>
      <h1 class="h-display">${escapeHtml(copy.title)}</h1>
      <p class="hc-lede">${escapeHtml(copy.body)}</p>
      <div class="hc-actions">${actionMarkup(actions.primary)}${actionMarkup(actions.secondary, "h-button h-button--ghost")}</div>
      <div class="hc-proof" aria-label="Store promises"><span>Secure checkout</span><span>Small-batch drops</span><span>Earned in Louisiana</span></div>
    </div>
  </section>`;
}

function renderStory(section, assets) {
  const title = requiredBlock(section, "copy.display").content.title;
  const paragraphs = requiredBlock(section, "copy.rich").content.paragraphs;
  const media = requiredBlock(section, "media.image").content;
  return `<section class="hc-section hc-story" data-h-section="${escapeHtml(section.id)}">
    <div class="h-container hc-story__grid">
      <div><p class="h-eyebrow">The point of view</p><h2 class="h-display hc-display--medium">${escapeHtml(title)}</h2></div>
      <div class="hc-story__body">${paragraphs.map((text, index) => `<p class="${index === paragraphs.length - 1 ? "is-emphasis" : ""}">${escapeHtml(text)}</p>`).join("")}</div>
      <img class="hc-story__media" src="${escapeHtml(requiredAsset(assets, media.asset))}" alt="${escapeHtml(media.alt)}" loading="lazy">
    </div>
  </section>`;
}

function renderCollections(section, assets) {
  const heading = requiredBlock(section, "copy.section-heading").content;
  const cards = section.blocks.filter((block) => block.type === "collection.card" && block.visibility?.enabled !== false);
  if (!cards.length) fail(`${section.id} requires collection cards`);
  return `<section class="hc-section hc-collections" data-h-section="${escapeHtml(section.id)}">
    <div class="h-container"><p class="h-eyebrow">${escapeHtml(heading.eyebrow)}</p><h2 class="h-display hc-display--medium">${escapeHtml(heading.title)}</h2>
      <div class="hc-collection-grid">${cards.map((card) => `<a class="hc-collection-card" href="${safeHref(card.content.href)}"><img src="${escapeHtml(requiredAsset(assets, card.content.asset))}" alt="" loading="lazy"><span><strong>${escapeHtml(card.content.title)}</strong><small>${escapeHtml(card.content.body)}</small></span></a>`).join("")}</div>
    </div>
  </section>`;
}

function renderFeatures(section) {
  const heading = requiredBlock(section, "copy.section-heading").content;
  const cards = section.blocks.filter((block) => block.type === "feature.card" && block.visibility?.enabled !== false);
  return `<section class="hc-section hc-values" data-h-section="${escapeHtml(section.id)}"><div class="h-container"><h2 class="h-display hc-display--medium">${escapeHtml(heading.title)}</h2><div class="hc-value-grid">${cards.map((card, index) => `<article><span>0${index + 1}</span><h3>${escapeHtml(card.content.title)}</h3><p>${escapeHtml(card.content.body)}</p></article>`).join("")}</div></div></section>`;
}

function renderCommunity(section) {
  const copy = requiredBlock(section, "copy.display").content;
  const action = requiredBlock(section, "actions.group").content.primary;
  return `<section class="hc-section hc-community" data-h-section="${escapeHtml(section.id)}"><div class="h-container hc-community__inner"><div><p class="h-eyebrow">Beyond the product</p><h2 class="h-display hc-display--medium">${escapeHtml(copy.title)}</h2><p class="hc-lede">${escapeHtml(copy.body)}</p></div>${actionMarkup(action)}</div></section>`;
}

function renderNewsletter(section) {
  const copy = requiredBlock(section, "copy.section-heading").content;
  const form = requiredBlock(section, "form.email").content;
  return `<section class="hc-section hc-newsletter" data-h-section="${escapeHtml(section.id)}"><div class="h-container hc-newsletter__inner"><div><p class="h-eyebrow">First access</p><h2>${escapeHtml(copy.title)}</h2><p>${escapeHtml(copy.body)}</p></div><form action="/api/newsletter" method="post"><label class="sr-only" for="hc-email">Email address</label><input id="hc-email" name="email" type="email" required placeholder="${escapeHtml(form.placeholder)}"><button type="submit">${escapeHtml(form.buttonLabel)}</button></form></div></section>`;
}

const renderers = new Map([
  ["hero.editorial", renderHero],
  ["story.immersive", renderStory],
  ["collections.lineup", renderCollections],
  ["content.feature-grid", renderFeatures],
  ["community.callout", renderCommunity],
  ["newsletter.signup", renderNewsletter],
]);

async function compose() {
  if (!root || !presetId || !pageId) fail("composer mount, preset, and page are required");
  const base = `/theme/presets/${encodeURIComponent(presetId)}`;
  const preset = await requiredJson(`${base}/preset.json`);
  if (preset.id !== presetId || preset.scope !== "fnf") fail("requested preset identity does not match");
  const pagePath = preset.pages?.[pageId];
  if (!pagePath) fail(`page ${pageId} is not declared by preset ${presetId}`);

  // The same native section code renders selected donor designs on Home and
  // every other storefront page. No alternate preview markup path.
  await import('/js/portable-sections.js');
  if (!document.querySelector('link[data-portable-sections]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/js/portable-sections.css';
    link.dataset.portableSections = 'true';
    document.head.appendChild(link);
  }
  const cmsPreview = new URLSearchParams(location.search).has('preview') ? '?preview=1' : '';
  const [tokens, assets, page, cmsResponse] = await Promise.all([
    requiredJson(`${base}/${preset.tokens.replace(/^\.\//, "")}`),
    requiredJson(`${base}/${preset.assets.replace(/^\.\//, "")}`),
    requiredJson(`${base}/${pagePath.replace(/^\.\//, "")}`),
    requiredJson(`/api/cms/pages/${encodeURIComponent(pageId)}${cmsPreview}`),
  ]);

  if (!cmsResponse?.ok || !cmsResponse.page) fail(`CMS page ${pageId} is required`);
  if (!Array.isArray(cmsResponse.page.sections)) fail("CMS page sections are required");
  applyTokens(tokens);

  const composedSections = projectCmsSections(page.sections, cmsResponse.page.sections, {
    onUnregistered: (cmsSection, templateKey) => {
      console.warn(
        `[Heuristic] ignoring legacy CMS section ${cmsSection.key}; preset template ${templateKey} is not registered`
      );
    },
  });
  const native = new Map(composedSections.map((section) => [section.cmsKey, section]));
  const seen = new Set();
  const renderNative = (section) => {
    if (section.visibility?.enabled === false) return "";
    applyCmsContent(section, section.cmsContent);
    const renderer = renderers.get(section.type);
    if (!renderer) fail(`renderer ${section.type} is not registered`);
    return renderer(section, assets);
  };
  const body = cmsResponse.page.sections.slice()
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
    .map((section) => {
      if (section.status === 'removed') return '';
      if (section.content?.__editor?.templateKey === 'portable') {
        // The registered portable implementation is rendered from live CMS content,
        // not cloned into a fake local preview.
        return globalThis.ThemePortableSections.render(section) || '';
      }
      const def = native.get(section.key);
      if (!def) return '';
      seen.add(section.key);
      return renderNative(def);
    });
  for (const section of composedSections) {
    if (!seen.has(section.cmsKey)) body.push(renderNative(section));
  }
  root.innerHTML = body.join("");
  document.dispatchEvent(new CustomEvent("heuristic:page-composed", { detail: { presetId, pageId } }));
}

compose().catch((error) => {
  console.error(error);
  if (root) root.innerHTML = `<section class="hc-compose-error" role="alert"><strong>Page composition failed.</strong><span>${escapeHtml(error.message)}</span></section>`;
});
