import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { getRegistryPage, registryForAdmin } from "../backend/cms/registry.js";
import { attachCmsDefinitions, normalizeCmsDefinition } from "../backend/cms/definition-registry.mjs";
import { templateNavigation } from "../frontend/theme-editor/system-template-registry.mjs";

const require = createRequire(new URL("../package.json", import.meta.url));
const { JSDOM } = require("jsdom");
const root = new URL("../frontend/static/js/", import.meta.url);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

async function editorFixture({ mobile = false, pageSlug = "shop", mediaAssets = [], themePreviews = [], visualViewportHeight = null, registryOverride = null, linkDestinations = null, hostTheme = null, packageSections = null, portableSections = [], stockHandoff = null } = {}) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "https://editor.test/admin/theme-editor?slug=" + pageSlug +
      (stockHandoff ? "&stock="+encodeURIComponent(stockHandoff) : ""),
    runScripts: "outside-only",
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.structuredClone = globalThis.structuredClone;
  if (visualViewportHeight != null) {
    const viewport = new w.EventTarget();
    viewport.height = visualViewportHeight;
    viewport.offsetTop = 0;
    viewport.scale = 1;
    Object.defineProperty(w, "visualViewport", { configurable: true, value: viewport });
  }
  if (themePreviews.length) w.ThemeStudioPreview = { themes: themePreviews };
  if (portableSections.length) w.ThemePortableSections = { catalog: () => portableSections };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  const writes = [];
  const publishes = [];
  const page = getRegistryPage(pageSlug);
  const site = getRegistryPage("site");
  page.content_authority = "cms-draft-linked";
  page.sections = (packageSections || page.sections).map(section => ({ ...section, version: 1, status: "draft" }));
  site.sections = (packageSections ? [] : site.sections).map(section => ({ ...section, version: 1, status: "draft" }));
  w.CSS = { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, ch => "\\" + ch) };
  w.matchMedia = () => ({ matches: mobile, addEventListener() {}, removeEventListener() {} });
  w.renderShell = (_route, markup) => w.document.body.insertAdjacentHTML("afterbegin", markup);
  w.fetch = async () => ({ ok: true, json: async () => ({ active_theme: { name: "Heuristic", status: "active" } }) });
  w.adminFetch = async (url, options = {}) => {
    if (url.endsWith("/registry")) return registryOverride || registryForAdmin();
    if (linkDestinations && url === "/api/store/collections") return {ok:true,collections:linkDestinations.collections || []};
    if (linkDestinations && url === "/api/store/products") return {ok:true,products:linkDestinations.products || []};
    if (url.endsWith("/pages/site")) return { page: site };
    if (url.endsWith("/pages/" + pageSlug)) return { page, seeded: false };
    if (url.endsWith("/pages")) return { pages: [{ slug: pageSlug, title: page.title, live_route: "/" + pageSlug }] };
    if (url.startsWith("/api/admin/media?")) return { assets: mediaAssets, pagination: { pages: 1 } };
    if (url.endsWith("/pages/shop/publish") && options.method === "POST") {
      publishes.push({url,method:options.method});
      return w.__publishResponder ? w.__publishResponder() : { published_at: "2026-10-10T05:00:00Z" };
    }
    if (stockHandoff && url.endsWith("/pages/" + pageSlug + "/sections") && options.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      const content = w.ThemePortableSections?.defaults?.(body.themePreset);
      if (!content || body.templateKey !== "portable") throw new Error("stock_section_not_registered");
      const key = "stock-created";
      writes.push({url,operation:"insert",...body});
      page.sections.push({key,content,version:1,status:"draft",sort_order:page.sections.length,source:"cms"});
      return {ok:true,section_key:key,template_key:"portable",version:1};
    }
    if (url.includes("/sections/") && options.method === "PUT") {
      writes.push({ url, ...JSON.parse(options.body) });
      return { version: 2, updated_at: "2026-10-10T02:00:00Z" };
    }
    throw new Error("Unexpected editor API: " + url);
  };
  if (hostTheme) {
    w.AgentSamThemeEditorHost = {
      page: pageSlug,
      adapter: {
        capabilities: { publish: false },
        getThemeIdentity: async () => ({ name: hostTheme, status: 'draft' }),
        getRegistry: async () => registryOverride || registryForAdmin(),
        request: async (url, opts) => w.adminFetch(url, opts),
        resolvePreview: async () => ({ html: '<!doctype html><html><head></head><body><main>Owned draft</main></body></html>' }),
      },
    };
  }
  // This JSDOM fixture executes scripts with eval rather than a browser
  // module loader. Inject the real registry export, not a test-only menu.
  w.__templateNavigation = templateNavigation;
  if (stockHandoff) {
    w.eval(readFileSync(new URL("../../../packages/theme-contract/runtime/platform-stock-sections.js",root),"utf8"));
    w.eval(readFileSync(new URL("../../../packages/theme-contract/runtime/portable-sections.js",root),"utf8"));
  }
  for (const file of ["pages-shared.js", "agentsam.js", "theme-editor.js"]) {
    let script = readFileSync(new URL(file, root), "utf8");
    if (file === "theme-editor.js") script = script.replace(
      "const { templateNavigation } = await import('/theme-editor/system-template-registry.mjs');",
      "const templateNavigation = window.__templateNavigation;"
    );
    w.eval(script);
  }
  await tick();
  await tick();
  await tick();
  return { dom, w, doc: w.document, writes, publishes };
}

test("real editor mounts compact toolbar, one drawer and installed page tree", async () => {
  const { dom, doc } = await editorFixture();
  try {
    assert.equal(doc.querySelector("#te-tree-title").textContent, "Shop");
    assert.ok(doc.querySelector('[data-select-section="hero"]'));
    assert.equal(doc.querySelectorAll("#te-save").length, 1);
    assert.equal(doc.querySelector("#te-save").textContent, "Save");
    assert.equal(doc.querySelector("#te-publish").textContent, "Publish live…");
    assert.equal(doc.querySelector(".te-agentsam-mark img")?.getAttribute("src"), "/admin/brand/agentsam-gorilla-tiny.svg");
    assert.ok(doc.getElementById("agentsam-drawer"));
    doc.getElementById("agentsam-toggle").click();
    assert.equal(doc.body.classList.contains("agentsam-open"), true);
    doc.getElementById("agentsam-toggle").click();
    assert.equal(doc.body.classList.contains("agentsam-open"), false);
    assert.equal(doc.getElementById("te-mini-agent-toggle"), null, "no redundant floating trigger: selecting automatically reveals the composer");
    assert.equal(doc.getElementById("te-agent-open"), null, "the inspector status header does not duplicate miniAgentSam");
    assert.equal(doc.querySelector('[data-composer-slot="editor"]').hidden, true, "no redundant inspector composer");
    assert.equal(doc.getElementById("te-inspector-toggle"), null);
    assert.equal(doc.querySelectorAll('.theme-studio-toolbar__right .te-icon-btn[title*="Canvas inspection"]').length, 1);
    assert.ok(doc.getElementById("te-inspect-mode").innerHTML.includes("M12.034 12.681"));
    assert.ok(readFileSync(new URL("../frontend/static/brand/agentsam-gorilla-tiny.svg", import.meta.url), "utf8").includes("<svg"));
    assert.ok(readFileSync(new URL("../frontend/static/brand/agentsam-sidekick-symbol.svg", import.meta.url), "utf8").includes("<svg"), "original legacy asset remains preserved");
    assert.equal(doc.getElementById("te-tree-path"), null);
    assert.equal(doc.getElementById("te-library-browse"), null);
    doc.getElementById("te-add-section").click();
    const generate = doc.querySelector("#te-section-menu [data-start-section-generation]");
    assert.ok(generate, "the Add Section catalog exposes the actual AgentSam generation entry");
    assert.match(generate.textContent, /Generate with AgentSam/i);
    let generationRequest = null;
    dom.window.addEventListener("theme-editor:generate-request", event => {
      generationRequest = event.detail?.kind;
    }, { once: true });
    generate.click();
    assert.equal(generationRequest, "section",
      "Generate must open the real section-generation workflow, not insert a fake recipe");
    assert.equal(doc.querySelector("#te-more-menu").hidden, true);
    const settings = doc.querySelector('[data-drawer-mode="theme-settings"]');
    settings.click();
    assert.equal(doc.querySelector('[data-drawer-panel="theme-settings"]').hidden, false);
    assert.equal(doc.querySelector('[data-drawer-panel="sections"]').hidden, true);
    doc.querySelector('[data-drawer-mode="app-embeds"]').click();
    assert.equal(doc.querySelector('[data-drawer-panel="app-embeds"]').hidden, false);
    doc.querySelector('[data-drawer-mode="sections"]').click();
    assert.equal(doc.querySelector('[data-drawer-panel="sections"]').hidden, false);
    assert.equal(doc.querySelector('[data-drawer-panel="theme-settings"]').hidden, true);
    doc.getElementById("te-more").click();
    assert.equal(doc.getElementById("te-more-menu").hidden, false);
    doc.getElementById("te-shortcuts").click();
    assert.equal(doc.getElementById("te-shortcuts-help").hidden, false);
    doc.getElementById("te-save-options").click();
    assert.equal(doc.getElementById("te-more-menu").hidden, true);
    assert.equal(doc.getElementById("te-save-menu").hidden, false);
  } finally {
    dom.window.close();
  }
});


test("Canvas handoff selects real platform stock without inserting until explicit confirmation", async () => {
  const {dom,doc,w,writes}=await editorFixture({stockHandoff:"platform/choose-a-plan"});
  try {
    // Canvas handoff intentionally runs on requestAnimationFrame after the
    // original page and authorized section catalog have been loaded.
    await new Promise(resolve=>setTimeout(resolve,35));
    const modal=doc.getElementById("te-section-menu");
    assert.equal(modal.hidden,false,"authorized editor opens Add Section library");
    const selected=doc.querySelector('[data-choose-section="platform/choose-a-plan"]');
    assert.ok(selected,"actual worker-shared stock renderer appears in CMS picker");
    assert.equal(selected.getAttribute("aria-selected"),"true");
    assert.ok(doc.querySelector("#te-section-preview iframe.te-catalog-visual"));
    assert.equal(writes.length,0,"handoff never inserts or publishes automatically");
    doc.querySelector('[data-add-selected-section]').click();
    await tick();await tick();
    assert.equal(writes.length,1,"merchant's explicit Add section persists via the real API");
    assert.equal(writes[0].templateKey,"portable");
    assert.equal(writes[0].themePreset,"platform/choose-a-plan");
    assert.equal(doc.querySelector('[data-select-section="stock-created"]') != null,true);
  }finally{dom.window.close();}
});

test("unknown or invalid stock intent does not open the section catalog or write",async()=>{
  const {dom,doc,writes}=await editorFixture({stockHandoff:"platform/unknown-inventory"});
  try{await tick();assert.equal(doc.getElementById("te-section-menu").hidden,true);
      assert.equal(writes.length,0);}
  finally{dom.window.close();}
});

test("Add Section is keyboard browseable, accessible, and returns focus on dismiss", async () => {
  const { dom, doc } = await editorFixture({portableSections:[
    {id:'stock-hero',label:'Stock Hero',type:'hero',category:'Hero'},
    {id:'stock-collection',label:'Stock Collection',type:'collection',category:'Products'}
  ]});
  try {
    const opener = doc.getElementById("te-add-section");
    opener.focus();
    opener.click();
    const modal = doc.getElementById("te-section-menu");
    assert.equal(modal.hidden, false);
    assert.equal(modal.getAttribute("aria-label"), "Add a section");
    assert.equal(modal.querySelectorAll('[role="tab"]').length, 2);
    assert.equal(modal.querySelector('#te-section-list').getAttribute("role"), "listbox");
    const search = doc.getElementById("te-section-search");
    assert.equal(search.type, "search");
    search.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    assert.ok(doc.activeElement.matches('[data-choose-section]'), "ArrowDown focuses a real catalog section");
    assert.equal(doc.activeElement.getAttribute("aria-selected"), "true");
    doc.activeElement.dispatchEvent(new dom.window.KeyboardEvent("keydown", {key: "Escape", bubbles: true}));
    assert.equal(modal.hidden, true, "Escape dismisses the non-modal section catalog");
    assert.equal(doc.activeElement, opener, "focus returns to Add Section");
  } finally { dom.window.close(); }
});

test("storefront selection stays isolated from site design and follows the account editor accent", async () => {
  const { dom, doc } = await editorFixture();
  try {
    doc.documentElement.style.setProperty("--te-accent", "#247d71");
    const frame = doc.getElementById("theme-preview");
    // JSDOM does not load the remote preview URL. Substitute only its DOM;
    // the real editor's registered iframe load handler remains under test.
    const previewDocument = doc.implementation.createHTMLDocument("Merchant preview");
    Object.defineProperty(frame, "contentDocument", {
      configurable: true, get: () => previewDocument,
    });
    frame.dispatchEvent(new dom.window.Event("load"));
    const preview = frame.contentDocument;
    assert.equal(preview.documentElement.style.getPropertyValue("--cms-editor-selection-color"), "#247d71");
    const stylesheet = preview.getElementById("agentsam-theme-editor-preview-style");
    assert.ok(stylesheet, "the actual canvas receives its transient editor overlay stylesheet");
    assert.match(stylesheet.textContent, /var\(--cms-editor-selection-color\)/);
    assert.doesNotMatch(stylesheet.textContent, /#7656ee|rgba\(118,86,238/);
    assert.equal(preview.getElementById("fnf-theme-editor-preview-style"), null);
    doc.documentElement.style.setProperty("--te-accent", "#cf543d");
    frame.dispatchEvent(new dom.window.Event("load"));
    assert.equal(preview.documentElement.style.getPropertyValue("--cms-editor-selection-color"), "#cf543d");
  } finally {
    dom.window.close();
  }
});

test("home editor identifies the current page in the toolbar and section tree", async () => {
  const { dom, doc } = await editorFixture({ pageSlug: "home" });
  try {
    assert.equal(doc.getElementById("te-page-title").textContent, "Home page");
    assert.equal(doc.getElementById("te-tree-title").textContent, "Home page");
  } finally {
    dom.window.close();
  }
});

test("installed package zones place header and footer outside the page template", async () => {
  const section = (key, zone, globalKey) => ({
    key, zone, globalKey, name: key, content: { __editor: { blocks: [] } },
  });
  const { dom, doc } = await editorFixture({ packageSections: [
    section("announcement", "HEADER"), section("site_header", "HEADER", "site-header"),
    section("hero", "BODY"), section("site_footer", "FOOTER", "site-footer"),
  ] });
  try {
    const groups = [...doc.querySelectorAll("#te-tree > .te-tree-group")];
    assert.deepEqual(groups.map(group => group.querySelector(".te-tree-group__label")?.textContent),
      ["Header", "Template", "Footer"]);
    assert.deepEqual(groups.map(group => [...group.querySelectorAll("[data-select-section]")]
      .map(row => row.dataset.selectSection)),
      [["announcement", "site_header"], ["hero"], ["site_footer"]]);
  } finally {
    dom.window.close();
  }
});

test("Products and Collections open their template lists without closing the page picker", async () => {
  const { dom, doc } = await editorFixture();
  try {
    doc.getElementById("te-page-trigger").click();
    assert.equal(doc.querySelector('[data-picker-category="starter-kits"]'), null,
      "uninstalled showcase fixtures do not appear in merchant navigation");
    doc.querySelector('[data-picker-category="products"]').click();
    assert.equal(doc.getElementById("te-page-popover").hidden, false);
    assert.ok(doc.querySelector('[data-picker-template="product"]'));
    doc.querySelector('[data-picker-back]').click();
    doc.querySelector('[data-picker-category="collections"]').click();
    assert.equal(doc.getElementById("te-page-popover").hidden, false);
    assert.ok(doc.querySelector('[data-picker-template="collection"]'));
  } finally {
    dom.window.close();
  }
});

test("Theme Studio media picker previews R2 delivery_url assets and stages the chosen image without publishing", async () => {
  const delivered = "https://assets.example.test/media/hero-original.png";
  const { dom, doc, publishes } = await editorFixture({
    mediaAssets: [{ id: 42, filename: "hero-original.png", r2_key: "images/hero-original.png", content_type: "image/png", delivery_url: delivered, folder: "campaigns" }]
  });
  try {
    doc.querySelector('[data-select-section="hero"]').click();
    const choose = doc.querySelector('[data-pick-media]');
    assert.ok(choose, "Hero offers the real media picker");
    choose.click();
    await tick();
    await tick();
    const img = doc.querySelector('#te-media-grid .te-media-card__thumb img');
    assert.ok(img, "An image preview is rendered");
    assert.equal(img.getAttribute("src"), delivered, "Preview uses the same delivery URL as Media Library");
    const card = doc.querySelector('#te-media-grid .te-media-card');
    assert.equal(card.getAttribute("data-media-url"), delivered);
    card.click();
    assert.equal(doc.getElementById("te-media-confirm").disabled, false);
    doc.getElementById("te-media-confirm").click();
    assert.equal(doc.getElementById("te-media-modal").hidden, true, "Selection returns to the existing inspector");
    assert.equal(publishes.length, 0, "Choosing media must not publish a theme");
  } finally {
    dom.window.close();
  }
});

test("mobile media picker keeps full library searchable without collapsing or remounting hundreds of thumbnails", async () => {
  const mediaAssets = Array.from({ length: 257 }, (_, index) => ({
    filename: "Image " + String(index).padStart(3, "0") + ".png",
    delivery_url: "https://media.example/asset-" + index + ".png",
    content_type: "image/png",
    folder: "brand"
  }));
  const { dom, w, doc } = await editorFixture({ mobile: true, mediaAssets });
  try {
    doc.querySelector('[data-select-section="hero"]').click();
    doc.querySelector('[data-pick-media]').click();
    await tick();
    await tick();

    const grid = doc.getElementById("te-media-grid");
    assert.equal(grid.querySelectorAll(".te-media-card").length, 40, "only the first batch mounts");
    assert.match(doc.getElementById("te-media-count").textContent, /40 of 257 assets/);
    assert.equal(grid.querySelectorAll("img[loading='eager']").length, 8, "above-the-fold previews do not wait for Safari lazy loading");
    const originalImage = grid.querySelector(".te-media-card__thumb img");
    grid.querySelector(".te-media-card").click();
    assert.strictEqual(grid.querySelector(".te-media-card__thumb img"), originalImage, "selection does not reload thumbnails");
    assert.equal(doc.getElementById("te-media-confirm").disabled, false);

    grid.querySelector("[data-media-load-more]").click();
    assert.equal(grid.querySelectorAll(".te-media-card").length, 80, "more cards load on demand");

    const search = doc.getElementById("te-media-search");
    search.value = "Image 256";
    search.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert.equal(grid.querySelectorAll(".te-media-card").length, 1, "all 257 assets remain searchable");
    assert.match(doc.getElementById("te-media-count").textContent, /1 of 1 assets/);
    assert.match(grid.querySelector(".te-media-card").title, /Image 256/);
    grid.querySelector(".te-media-card").click();
    doc.getElementById("te-media-confirm").click();
    assert.equal(doc.getElementById("te-media-modal").hidden, true);
  } finally {
    dom.window.close();
  }
});

test("mobile image cards retain non-collapsing image dimensions and native picker scrolling", () => {
  const css = readFileSync(new URL("../frontend/static/css/theme-editor.css", import.meta.url), "utf8");
  assert.match(css, /grid-auto-rows:\s*max-content/, "large galleries cannot compress grid rows into stripes");
  assert.match(css, /\.te-media-card__thumb\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3;[^}]*min-height:\s*96px/s);
  assert.match(css, /\.te-media-card__thumb img\s*\{[^}]*object-fit:\s*contain/s, "source images are never stretched or cropped");
  assert.match(css, /\.te-media-grid\s*\{[^}]*overflow-y:\s*auto;[^}]*-webkit-overflow-scrolling:\s*touch/s);
});

test("undo/redo alter real CMS draft fields; Save writes draft but never publishes", async () => {
  const { dom, w, doc, writes } = await editorFixture();
  try {
    const headline = doc.querySelector('[data-select-field="headline"][data-field-section="hero"]');
    assert.ok(headline,"the Heading is a selectable child of Hero");
    headline.click();
    const field = doc.getElementById("te-field-hero-headline");
    assert.ok(field);
    const original = field.value;
    const next = "Updated customer headline";
    field.value = next;
    field.dispatchEvent(new w.Event("input", { bubbles: true }));
    assert.equal(doc.getElementById("te-undo").disabled, false);
    assert.match(doc.getElementById("te-save-state").textContent, /Unsaved/);
    doc.getElementById("te-undo").click();
    assert.equal(doc.getElementById("te-field-hero-headline").value, original);
    assert.equal(doc.getElementById("te-redo").disabled, false);
    doc.getElementById("te-redo").click();
    assert.equal(doc.getElementById("te-field-hero-headline").value, next);
    doc.getElementById("te-save").click();
    await tick();
    await tick();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].content.headline, next);
    assert.ok(writes[0].url.includes("/sections/hero"));
    assert.equal(doc.getElementById("te-save-state").textContent, "Saved");
    assert.equal(doc.getElementById("te-publish").textContent, "Publish live…");
    doc.querySelector('[data-device="mobile"]').click();
    assert.equal(doc.getElementById("te-preview-device").dataset.device, "mobile");
    assert.equal(doc.querySelector('[data-device="mobile"]').getAttribute("aria-pressed"), "true");
    doc.getElementById("te-inspect-mode").click();
    assert.equal(doc.getElementById("te-inspect-mode").getAttribute("aria-pressed"), "false");
    doc.getElementById("te-inspector-close").click();
    assert.equal(doc.querySelector(".theme-studio").dataset.inspector, "closed");
    doc.getElementById("te-inspect-mode").click();
    assert.equal(doc.querySelector(".theme-studio").dataset.inspector, "open");
    assert.equal(doc.getElementById("te-inspect-mode").getAttribute("aria-pressed"), "true");
    const hintTarget = doc.querySelector('[data-drawer-mode="sections"]');
    hintTarget.focus();
    assert.equal(doc.querySelector("#te-hover-help").hidden, false);
    assert.match(doc.querySelector("#te-hover-help").textContent, /Sections/);
    hintTarget.blur();
    assert.equal(doc.querySelector("#te-hover-help").hidden, true);
  } finally {
    dom.window.close();
  }
});

test("a real edit keeps Save actionable after automatic draft persistence",async()=>{
 const {dom,w,doc,writes}=await editorFixture();
 try{
  const save=doc.getElementById("te-save");
  assert.equal(save.disabled,true,"clean editor starts with nothing to save");
  const heading=doc.querySelector('[data-select-field="headline"][data-field-section="hero"]');
  assert.ok(heading);
  heading.click();
  const field=doc.getElementById("te-field-hero-headline");
  assert.ok(field);
  field.value="Save CTA remains ready";
  field.dispatchEvent(new w.Event("input",{bubbles:true}));
  assert.equal(save.disabled,false,"first keystroke enables Save immediately");
  assert.equal(save.classList.contains("is-dirty"),true);
  await new Promise(resolve=>setTimeout(resolve,1100));
  await tick();await tick();
  assert.equal(writes.length,1,"private autosave writes once");
  assert.equal(save.disabled,false,"Save remains clickable after private autosave");
  assert.equal(save.classList.contains("is-dirty"),false);
  save.click();
  await tick();
  assert.equal(writes.length,1,"Save with no pending changes does not write a duplicate revision");
  assert.match(doc.getElementById("te-note").textContent,/saved/i);
 } finally {dom.window.close();}
});

test("explicit Publish live does not invoke browser confirm or issue concurrent publishes",async()=>{
 const {dom,w,doc,publishes}=await editorFixture();
 try{
  let confirmCalls=0;
  w.confirm=()=>{confirmCalls++;return false;};
  let complete;
  w.__publishResponder=()=>new Promise(resolve=>{
    complete=()=>resolve({published_at:"2026-10-10T05:00:00Z"});
  });
  const option=doc.getElementById("te-save-options");
  option.click();
  assert.equal(doc.getElementById("te-save-menu").hidden,false);
  doc.getElementById("te-publish").click();
  assert.equal(confirmCalls,0,"explicit menu selection is the publish intent");
  assert.equal(doc.getElementById("te-save-menu").hidden,true);
  assert.equal(option.getAttribute("aria-expanded"),"false");
  await tick();
  assert.equal(publishes.length,1);
  assert.equal(doc.getElementById("te-publish").disabled,true);
  doc.getElementById("te-publish").click();
  await tick();
  assert.equal(publishes.length,1,"one publish request while the first is in flight");
  complete();
  await tick();await tick();
  assert.equal(doc.getElementById("te-publish").disabled,false);
  assert.match(doc.getElementById("te-note").textContent,/Published/i);
 } finally {dom.window.close();}
});

test("old Shop Hero selection exposes editable original text styling and Reset without replacing content",async()=>{
 const {dom,w,doc,writes}=await editorFixture();
 try{
  const frame=doc.getElementById("theme-preview");
  const previewDoc=doc.implementation.createHTMLDocument("Merchant source preview");
  Object.defineProperty(frame,"contentDocument",{configurable:true,value:previewDoc});
  previewDoc.body.innerHTML='<section class="shop-hero old-design" data-cms-section="hero"><h1 class="h-display" data-cms="headline">Authored hero</h1><a class="h-button" data-cms="ctaPrimary.href" href="#catalog"><span data-cms="ctaPrimary.label">Shop</span></a></section>';
  frame.dispatchEvent(new w.Event("load"));
  const heroTitle=previewDoc.querySelector('[data-cms="headline"]');
  heroTitle.dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
  const inspector=doc.getElementById("te-inspector-body");
  assert.ok([...inspector.querySelectorAll('.te-inspector-group__head h3')].some(n=>n.textContent === 'Typography'), "Typography appears as a first-class contextual group, not a nested generic accordion");
  const size=inspector.querySelector('[data-field-input="__editor.fieldStyles.headline.fontSize"]');
  const color=inspector.querySelector('[data-color-text="__editor.fieldStyles.headline.color"]');
  assert.ok(size,"selected authored headline must expose font size");
  assert.ok(color,"selected authored headline must expose text color");
  assert.ok(inspector.querySelector('[data-field-key="__editor.spacing.paddingTop"]'),"original section padding must remain editable");
  size.value="68";
  size.dispatchEvent(new w.Event("input",{bubbles:true}));
  doc.getElementById("te-save").click();
  await tick();await tick();
  assert.equal(writes.length,1);
  assert.equal(writes[0].content.__editor.fieldStyles.headline.fontSize,68);
  assert.equal(writes[0].content.headline,getRegistryPage("shop").sections.find(section=>section.key==="hero").content.headline,"editing appearance must preserve original content");

  const reset=inspector.querySelector('[data-reset-style="__editor.fieldStyles.headline.fontSize"]');
  assert.ok(reset,"every override supports returning to authored defaults");
  reset.click();
  doc.getElementById("te-save").click();
  await tick();await tick();
  assert.equal(writes.length,2);
  assert.equal(writes[1].content.__editor.fieldStyles.headline.fontSize,undefined);
  assert.equal(frame.contentDocument.querySelector(".shop-hero").className,"shop-hero old-design");
 }finally{dom.window.close();}
});


test("mobile selection opens a half-height editor while leaving the preview mounted", async () => {
  const {dom,doc}=await editorFixture({mobile:true});
  try {
    const studio=doc.querySelector('.theme-studio');
    assert.equal(studio.dataset.mobilePane,'preview','a phone opens with storefront visible');
    const hero=doc.querySelector('[data-select-section="hero"]');
    assert.ok(hero);
    hero.click();
    assert.equal(studio.dataset.mobilePane,'settings','selection must open the live-editing bottom sheet');
    assert.equal(studio.dataset.mobileSheet,'half','default editing view keeps substantial preview area');
    assert.equal(doc.querySelector('.theme-studio-canvas').isConnected,true,'storefront remains mounted behind the sheet');
    const grip=doc.querySelector('[data-sheet-grip="settings"]');
    grip.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    assert.equal(studio.dataset.mobileSheet,'expanded','accessible keyboard drag handle can expand the sheet');
    grip.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
    assert.equal(studio.dataset.mobileSheet,'half','sheet can return to half height');
    doc.querySelector('[data-sheet-close="settings"]').click();
    assert.equal(studio.dataset.mobilePane,'preview','closing restores full preview and compact edit handle');
    doc.querySelector('#te-mobile-edit-selection').click();
    assert.equal(studio.dataset.mobilePane,'settings','compact edit handle reopens selected element');
    doc.querySelector('#te-mobile-pane-switch [data-mobile-pane="sections"]').click();
    assert.equal(studio.dataset.mobilePane,'sections','page hierarchy is an overlay sheet, not a separate page');
    doc.querySelector('[data-sheet-close="sections"]').click();
    assert.equal(studio.dataset.mobilePane,'preview');
    doc.querySelector('[data-drawer-mode="theme-settings"]').click();
    assert.equal(studio.dataset.mobilePane,'sections','global Theme Settings must remain reachable in the mobile sheet');
    assert.equal(doc.querySelector('[data-drawer-panel="theme-settings"]').hidden,false,'original Theme Settings panel is preserved');
    doc.querySelector('#te-mobile-pane-switch [data-mobile-pane="sections"]').click();
    assert.equal(doc.querySelector('[data-drawer-panel="sections"]').hidden,false,'Sections tab returns to the real page hierarchy');
  } finally {
    dom.window.close();
  }
});

test("mobile style contract bounds the toolbar, view panes and generation preview", () => {
  const css=readFileSync(new URL('../frontend/static/css/theme-editor.css',import.meta.url),'utf8');
  assert.match(css,/MOBILE RELEASE GATE:/);
  assert.match(css,/grid-template-areas:"left actions" "center center"/);
  assert.match(css,/grid-template-rows:minmax\(0,1fr\) 61px/);
  assert.match(css,/data-mobile-pane="preview"\] \.theme-studio-canvas/);
  assert.match(css,/#te-block-panel\[data-panel-state\][\s\S]*bottom:calc\(69px/);
});


test("About page hierarchy matches the approved nested merchant editing pattern", async () => {
  const {dom,doc}=await editorFixture({pageSlug:'about'});
  try {
    const tree=doc.getElementById('te-tree');
    const groupTitles=[...tree.querySelectorAll('.te-tree-group__label')].map(e=>e.textContent);
    assert.deepEqual(groupTitles.filter(t=>['Header','Template','Footer'].includes(t)),['Header','Template','Footer']);
    const header=tree.querySelector('[data-tree-section="site:header"]');
    assert.ok(header.querySelector('[data-select-field="logoUrl"]'), 'Logo appears as a real editable field child');
    assert.ok(header.querySelector('[data-toggle-menu="site:header"]'), 'Header has real collapsible Menu hierarchy');
    assert.equal(header.querySelector('[data-toggle-menu="site:header"]').getAttribute('aria-expanded'),'false','Header navigation starts collapsed for a clean tree');
    assert.ok(header.querySelector('[data-select-block="nav1"]'), 'Real navigation block remains selectable');
    const menu=header.querySelector('[data-toggle-menu="site:header"]');
    menu.click();
    assert.equal(menu.getAttribute('aria-expanded'),'true','Menu opens on demand');
    menu.click();
    assert.equal(menu.getAttribute('aria-expanded'),'false','Menu collapses without hiding the Header');
    const hero=tree.querySelector('[data-tree-section="about:hero"]');
    assert.ok(hero, 'Hero is registered under Template');
    assert.ok(hero.querySelector('[data-select-field="meta1"]'), 'Eyebrow/metadata is a selectable Text child');
    const heading=hero.querySelector('[data-select-field="headline"]');
    assert.ok(heading, 'Heading is visible even when Hero has zero persisted __editor.blocks');
    assert.match(heading.textContent,/Heading.*Built in the Garage/i);
    assert.match(hero.querySelector('[data-select-field="subheadline"]').textContent,/Text.*Born around garage nights/i,'Subheadline is Text, not a second Heading');
    assert.ok(!hero.querySelector('[data-add-block-section="hero"]'), 'No fake Add block affordance without a registered CRUD template');
    assert.equal(hero.querySelector('.te-tree-row__meta'),null, 'No database-facing draft/field-count subtitles');
    assert.ok(tree.querySelector('.te-tree-group:nth-of-type(2) #te-add-section'), 'Add section belongs to Template');
    heading.click();
    assert.equal(doc.getElementById('te-inspector-title').textContent,'Heading');
    assert.ok(doc.querySelector('[data-tree-field="headline"].is-active'), 'Selected field remains highlighted within its section');
    assert.ok(doc.getElementById('te-inspector-body').querySelector('[data-field-input="headline"]'), 'Clicked child drives the existing editable inspector');
    assert.equal(doc.querySelector('#te-inspector-body [data-field-input="meta1"]'),null,'Meta1 must not clutter the selected Heading inspector');
    assert.equal(doc.querySelector('#te-inspector-body [data-field-input="meta2"]'),null,'Meta2 must not clutter the selected Heading inspector');
    assert.ok(doc.querySelector('[data-inline-style-key="__editor.fieldStyles.headline.fontWeight"]'),'Real Bold control appears beside editable Heading text');
    const uppercase=doc.querySelector('[data-inline-style-key="__editor.fieldStyles.headline.textTransform"]');
    assert.equal(uppercase.getAttribute('aria-pressed'),'false');
    uppercase.click();
    assert.equal(doc.querySelector('[data-inline-style-key="__editor.fieldStyles.headline.textTransform"]').getAttribute('aria-pressed'),'true','Text toolbar is interactive, not decorative');
    assert.equal(tree.querySelector('[data-tree-section="about:hero"] .te-tree-expand').getAttribute('aria-expanded'),'true');
    assert.ok(doc.querySelector('[data-remove-section="hero"]'), 'Existing removal operation remains available via contextual actions');
  }finally{dom.window.close();}
});

test("left rail visual density and touch controls are release requirements", () => {
  const css=readFileSync(new URL('../frontend/static/css/theme-editor.css',import.meta.url),'utf8');
  assert.match(css,/Merchant page hierarchy/);
  assert.match(css,/grid-template-columns: 278px minmax\(0, 1fr\) 328px/);
  assert.match(css,/\.te-field-row\.is-active/);
  assert.match(css,/\.te-tree-actions__menu/);
  assert.match(css,/\.te-inline-text-toolbar/);
  assert.match(css,/@media\(max-width:900px\)[\s\S]*\.te-field-row__main/);
});


test("mobile toolbar gives Page priority without hiding real undo/redo, inspect, theme and publish actions", async () => {
  const { dom, doc } = await editorFixture({ mobile: true, themePreviews: [
    { id: "heuristic", name: "Heuristic", status: "installed" },
    { id: "revise", name: "Revise", status: "preview" },
  ] });
  try {
    assert.equal(doc.querySelector("#te-page-title")?.textContent, "Shop");
    assert.ok(doc.getElementById("te-undo"), "real undo action preserved");
    assert.ok(doc.getElementById("te-redo"), "real redo action preserved");
    assert.ok(doc.getElementById("agentsam-toggle"), "real Gorilla button preserved");
    assert.ok(doc.getElementById("te-more-inspect"), "mobile canvas inspection is reachable");
    assert.ok(doc.getElementById("te-more-settings"), "existing Theme Settings are reachable");
    assert.ok(doc.getElementById("te-more-publish"), "publishing remains reachable at 320px");
    assert.ok(doc.querySelector("#te-more-menu [data-theme-preview]"), "theme previews remain accessible as secondary actions");
    assert.ok(doc.getElementById("te-inspect-mode"), "original canvas inspection control remains");
    const before = doc.getElementById("te-inspect-mode").getAttribute("aria-pressed");
    doc.getElementById("te-more-inspect").click();
    assert.notEqual(doc.getElementById("te-inspect-mode").getAttribute("aria-pressed"), before);
    doc.getElementById("te-more-settings").click();
    assert.equal(doc.querySelector('[data-drawer-panel="theme-settings"]').hidden, false);
  } finally { dom.window.close(); }
});

test("mobile stylesheet prevents horizontal toolbar scrolling while retaining page-first structure", () => {
  const css = readFileSync(new URL("../frontend/static/css/theme-editor.css", import.meta.url), "utf8");
  assert.match(css, /Preview-first mobile toolbar: page identity outranks theme selection/);
  assert.match(css, /grid-template-columns:28px minmax\(0,1fr\) auto/);
  assert.match(css, /grid-template-rows:52px/);
  assert.match(css, /\.theme-studio-toolbar__right[\s\S]*?max-width:none;overflow:visible/);
  assert.match(css, /#te-more-menu[\s\S]*?te-mobile-more-entry/);
});


test("media fields show a compact asset card with View original and a collapsed, editable source", async () => {
  const { dom, doc } = await editorFixture();
  try {
    doc.querySelector('[data-select-section="hero"]').click();
    const media = doc.querySelector('[data-media-drop]');
    assert.ok(media, "existing media inspector remains mounted");
    const details = doc.querySelector(".te-media-advanced");
    const source = details?.querySelector("[data-field-input]");
    assert.ok(source, "canonical URL remains editable and uses existing save listeners");
    assert.equal(details.open, false, "raw URL is concealed by default");
    assert.ok(doc.querySelector("[data-view-original]"), "merchant can open the original asset");
    assert.match(source.value, /^\//, "original path is retained, not transformed or rewritten");
  } finally {dom.window.close();}
});

test("mobile editing sheet offers compact, balanced and expanded heights without hiding preview", () => {
  const css = readFileSync(new URL("../frontend/static/css/theme-editor.css", import.meta.url), "utf8");
  assert.match(css, /data-mobile-sheet="compact"/);
  assert.match(css, /height:min\(39%,370px\)!important/);
  assert.match(css, /height:min\(70%,650px\)!important/);
  assert.match(css, /te-preview-bar #te-preview-label \{display:none;\}/);
  assert.match(css, /\.te-media-preview[\s\S]*?object-fit: contain/);
});


test("Theme Studio remains a browser page with AgentSam product identity", () => {
  const html=readFileSync(new URL("../frontend/static/theme-editor.html",import.meta.url),"utf8");
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/\/admin\/brand\/agentsam-gorilla-tiny\.svg/);
  assert.doesNotMatch(html,/apple-mobile-web-app-capable|apple-mobile-web-app-title/);
});

test("Safari browser UI and keyboard events cannot shorten the editor below 100dvh", async () => {
  const {dom,w,doc,writes}=await editorFixture({mobile:true, visualViewportHeight:690});
  try {
    const studio=doc.querySelector(".theme-studio");
    assert.equal(studio.style.getPropertyValue("--te-visual-viewport-height"),"");
    const tabs=doc.getElementById("te-mobile-pane-switch");
    assert.equal(tabs.querySelectorAll("[data-mobile-pane]").length,3);
    w.visualViewport.height=435;
    w.visualViewport.dispatchEvent(new w.Event("resize"));
    assert.equal(studio.style.getPropertyValue("--te-visual-viewport-height"),"");
    assert.equal(writes.length,0);
    assert.equal(tabs.querySelectorAll("[data-mobile-pane]").length,3);
  }finally{dom.window.close();}
});

test("mobile browser safe-area consumes actual tab height without extra blank row", () => {
  const css=readFileSync(new URL("../frontend/static/css/theme-editor.css",import.meta.url),"utf8");
  assert.match(css,/Safari browser-first: don't double-clamp 100dvh/);
  assert.match(css,/grid-template-rows: minmax\(0, 1fr\) var\(--te-mobile-tabs-height\)/);
  assert.match(css,/height: 100dvh;/);
  assert.doesNotMatch(css,/height: min\(100dvh, var\(--te-visual-viewport-height/);
  assert.match(css,/bottom: var\(--te-mobile-tabs-height\)/);
  assert.doesNotMatch(css,/\.admin-mobile-dock/);
});

test("mobile sheet CSS preserves live canvas and does not touch the separate admin dock", () => {
  const css=readFileSync(new URL('../frontend/static/css/theme-editor.css',import.meta.url),'utf8');
  assert.match(css,/Mobile live editor — screenshot-approved preview with draggable inspector/);
  assert.match(css,/data-mobile-pane="sections"\] \.theme-studio-canvas/);
  assert.match(css,/data-mobile-pane="settings"\] \.theme-studio-canvas/);
  assert.match(css,/height:min\(39%,370px\)/);
  assert.match(css,/data-mobile-sheet="expanded"/);
  assert.match(css,/\.te-mobile-sheet-grip/);
  assert.match(css,/\.te-mobile-selection-bar/);
  assert.match(css,/data-mobile-sheet="compact"/);
  assert.match(css,/\.te-inspector-head \{ display:none!important/);
  assert.doesNotMatch(css,/\.admin-mobile-dock/);
});

test("mobile scroll handoff remains browser-first and miniAgentSam honors canvas bounds", () => {
  const css=readFileSync(new URL("../frontend/static/css/theme-editor.css",import.meta.url),"utf8");
  const workbench=readFileSync(new URL("../packages/agentsam-workbench/src/mini-agentsam.js",import.meta.url),"utf8");
  const adapter=readFileSync(new URL("../frontend/static/js/theme-editor-mini-agentsam.mjs",import.meta.url),"utf8");
  const editor=readFileSync(new URL("../frontend/static/js/theme-editor.js",import.meta.url),"utf8");
  assert.match(css,/Mobile Safari scroll handoff/);
  assert.match(css,/overscroll-behavior-y: auto/);
  assert.match(workbench,/host\.positionBounds/,"Shared composer supports optional, nonbreaking positioning region");
  assert.match(adapter,/positionBounds,/,"Theme Studio uses the same shared miniAgentSam with canvas bounds");
  assert.match(editor,/positionBounds: function\(\)/);
  assert.match(editor,/querySelector\('\.theme-studio \.te-preview-stage'\)/);
  assert.match(css,/grid-template-rows: minmax\(0, 1fr\) var\(--te-mobile-tabs-height\)/,
    "Three-tab mobile navigation is retained");
});


test("button selection offers a searchable CMS page destination, not raw URL entry or section-wide settings", async () => {
 const {dom,w,doc,writes}=await editorFixture();
 try {
   const frame=doc.getElementById("theme-preview");
   const previewDoc=doc.implementation.createHTMLDocument("Storefront");
   Object.defineProperty(frame,"contentDocument",{configurable:true,value:previewDoc});
   previewDoc.body.innerHTML='<section data-cms-section="hero"><a data-cms="ctaPrimary.href" data-cms-attr="href" href="#catalog"><span data-cms="ctaPrimary.label">Shop now</span></a></section>';
   frame.dispatchEvent(new w.Event("load"));
   previewDoc.querySelector('[data-cms="ctaPrimary.href"]').dispatchEvent(new w.MouseEvent("click",{bubbles:true}));
   const inspector=doc.getElementById("te-inspector-body");
   assert.ok(inspector.querySelector('[data-link-trigger="ctaPrimary.href"]'),"CTA should have a real internal link picker");
   assert.equal(inspector.querySelector('[data-field-input="ctaPrimary.href"]'),null,"raw URL is not the default field");
   const labels=[...inspector.querySelectorAll(".te-inspector-group__head h3")].map(n=>n.textContent);
   assert.ok(labels.includes("Buttons and links"));
   assert.ok(!labels.includes("Media"));
   assert.equal(inspector.querySelector('[data-field-key="__editor.spacing.marginLeft"]'),null);
   inspector.querySelector('[data-link-trigger="ctaPrimary.href"]').click();
   const choices=[...inspector.querySelectorAll('[data-link-choice]')];
   assert.ok(choices.some(node=>node.dataset.linkChoice==="/shop"),"real CMS page inventory is surfaced");
   const selected=choices.find(node=>node.dataset.linkChoice==="/shop");
   selected.click();
   doc.getElementById("te-save").click();
   await tick();await tick();
   assert.equal(writes.length,1);
   assert.equal(writes[0].content.ctaPrimary.href,"/shop");
 } finally {dom.window.close();}
});


test("section-only CSS edits persist as canonical CMS content while selected Button stays focused",async()=>{
 const {dom,w,doc,writes}=await editorFixture();
 try {
  doc.querySelector('[data-select-section="hero"]').click();
  const input=doc.querySelector('#te-section-css-input');
  assert.ok(input,"section inspector must offer an optional Custom CSS disclosure");
  input.value='.h-display { color: #123456; }';
  input.dispatchEvent(new w.Event('input',{bubbles:true}));
  doc.getElementById('te-save').click();
  await tick();await tick();
  assert.equal(writes.length,1);
  assert.equal(writes[0].content.__editor.customCss,'.h-display { color: #123456; }');
  const prior=input.value;
  input.value='@import url(https://tracker.example)';
  input.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert.equal(input.getAttribute('aria-invalid'),'true');
  assert.equal(writes[0].content.__editor.customCss,prior);
  const frame=doc.getElementById('theme-preview');
  const previewDoc=doc.implementation.createHTMLDocument('CMS Hero');
  Object.defineProperty(frame,'contentDocument',{configurable:true,value:previewDoc});
  previewDoc.body.innerHTML='<section data-cms-section="hero"><a data-cms="ctaPrimary.href"><span data-cms="ctaPrimary.label">Shop</span></a></section>';
  frame.dispatchEvent(new w.Event('load'));
  previewDoc.querySelector('[data-cms="ctaPrimary.href"]').dispatchEvent(new w.MouseEvent('click',{bubbles:true}));
  assert.equal(doc.querySelector('#te-section-css-input'),null,"per-section CSS must not spill into Button inspector");
 } finally {dom.window.close();}
});


test("Hero selection is media/layout-first; Heading and CTA edit through individual child selections",async()=>{
 const {dom,doc}=await editorFixture();
 try {
   const hero=doc.querySelector('[data-select-section="hero"]');hero.click();
   const inspector=doc.getElementById('te-inspector-body');
   assert.ok(inspector.querySelector('[data-pick-media="imageUrl"]'));
   assert.ok(inspector.querySelector('[data-field-input="__editor.layout.heroHeight"]'));
   assert.ok(inspector.querySelector('[data-field-input="__editor.layout.heroOverlay"]') || inspector.querySelector('[data-range-field="__editor.layout.heroOverlay"]'));
   assert.equal(inspector.querySelector('[data-field-input="headline"]'),null,"headline is not repeated in Hero settings");
   assert.equal(inspector.querySelector('[data-link-trigger="ctaPrimary.href"]'),null,"button editing belongs to its own selection");
   const heading=doc.querySelector('[data-select-field="headline"][data-field-section="hero"]');
   heading.click();
   assert.ok(inspector.querySelector('[data-field-input="headline"]'),"heading editing is available through the tree");
   assert.equal(inspector.querySelector('[data-pick-media="imageUrl"]'),null,"heading does not get unrelated image options");
 } finally {dom.window.close();}
});


test("Editorial Tile selection reads existing published nested block values and exposes media and destination",async()=>{
 const {dom,doc}=await editorFixture();
 try {
  const tile=doc.querySelector('[data-select-block="tile1"][data-block-section="editorial-grid"]');
  assert.ok(tile,'editorial tile must be selectable in the page hierarchy');
  tile.click();
  const inspector=doc.getElementById('te-inspector-body');
  assert.ok(inspector.querySelector('[data-field-input="tile1.eyebrow"]'));
  assert.equal(inspector.querySelector('[data-field-input="tile1.eyebrow"]').value,"High Octane");
  assert.equal(inspector.querySelector('[data-field-input="tile1.headline"]').value,"Run it past redline");
  assert.ok(inspector.querySelector('[data-pick-media="tile1.imageUrl"]'),"tile has real media picker");
  assert.match(inspector.querySelector('[data-media-preview]')?.innerHTML||inspector.querySelector('.te-media-preview').innerHTML,/earned-hours-hero.webp/);
  assert.ok(inspector.querySelector('[data-link-trigger="tile1.href"]'),"tile has CMS destination picker");
  assert.match(inspector.querySelector('[data-link-trigger="tile1.href"]').textContent,/collections|high-octane/i);
 }finally{dom.window.close()}
});


test("real D1 editorial-grid drift must not degrade the clicked tile inspector to empty eyebrow/heading/anchor controls",async()=>{
 const stale=normalizeCmsDefinition({id:"cmsd_stale",definition_key:"editorial-grid",kind:"section",
  origin:"package",status:"active",version:"1",label:"Collections Editorial Grid",
  settings_schema_json:'{"eyebrow":{"type":"text"},"heading":{"type":"text"},"anchor":{"type":"text"}}',
  allowed_blocks_json:'["group"]'});
 const reg=attachCmsDefinitions(registryForAdmin(),[stale]);
 const {dom,w,doc,writes}=await editorFixture({registryOverride:reg});
 try{
  const chosen=doc.querySelector('[data-select-block="tile1"][data-block-section="editorial-grid"]');
  chosen.click();
  const panel=doc.getElementById('te-inspector-body');
  assert.equal(panel.querySelector('[data-field-input="eyebrow"]'),null,"stale section field must not hijack tile selection");
  assert.equal(panel.querySelector('[data-field-input="heading"]'),null);
  assert.equal(panel.querySelector('[data-field-input="anchor"]'),null);
  assert.equal(panel.querySelector('[data-field-input="tile1.eyebrow"]')?.value,"High Octane");
  assert.equal(panel.querySelector('[data-field-input="tile1.headline"]')?.value,"Run it past redline");
  assert.equal(panel.querySelector('[data-field-input="tile1.imageUrl"]')?.value,"/assets/presets/fuel-free-time/earned-hours-hero.webp");
  assert.ok(panel.querySelector('[data-pick-media="tile1.imageUrl"]'));
  assert.ok(panel.querySelector('[data-link-trigger="tile1.href"]'));
  const secondBefore=doc.querySelector('[data-select-block="tile2"]')?.textContent;
  const eyebrow=panel.querySelector('[data-field-input="tile1.eyebrow"]');
  eyebrow.value="New editorial kicker";
  eyebrow.dispatchEvent(new w.Event("input",{bubbles:true}));
  const source=panel.querySelector('[data-field-input="tile1.imageUrl"]');
  source.value="/media/editorials/replacement.webp";
  source.dispatchEvent(new w.Event("change",{bubbles:true}));
  doc.getElementById('te-save').click();
  await tick();await tick();
  assert.equal(writes.length,1);
  assert.equal(writes[0].content.tile1.eyebrow,"New editorial kicker");
  assert.equal(writes[0].content.tile1.imageUrl,"/media/editorials/replacement.webp");
  assert.equal(writes[0].content.tile2.eyebrow,"The long way home");
  assert.equal(writes[0].content.tile1.href,"/shop/collections/high-octane-performance-gear");
  assert.equal(doc.querySelector('[data-select-block="tile2"]')?.textContent,secondBefore);
 }finally{dom.window.close();}
});


test("Editorial Tile merchant chooses a real Media Library image and another existing collection; only tile1 saves",async()=>{
 const stale=normalizeCmsDefinition({id:"cmsd_stale",definition_key:"editorial-grid",kind:"section",
  origin:"package",status:"active",version:"1",
  settings_schema_json:'{"eyebrow":{"type":"text"},"heading":{"type":"text"},"anchor":{"type":"text"}}',
  allowed_blocks_json:'["group"]'});
 const registryOverride=attachCmsDefinitions(registryForAdmin(),[stale]);
 const newImage="https://assets.example.test/r2/new-editorial.webp";
 const {dom,doc,w,writes}=await editorFixture({registryOverride,
  mediaAssets:[{id:42,filename:"new-editorial.webp",r2_key:"editorial/new.webp",content_type:"image/webp",delivery_url:newImage}],
  linkDestinations:{collections:[{slug:"masters",title:"Masters Collection"},{slug:"high-octane-performance-gear",title:"High Octane Collection"}],
    products:[{slug:"heavyweight-tee",title:"Heavyweight Tee"}]}});
 try {
  doc.querySelector('[data-select-block="tile1"][data-block-section="editorial-grid"]').click();
  doc.querySelector('[data-pick-media="tile1.imageUrl"]').click();
  await tick();await tick();
  assert.ok(doc.querySelector('#te-media-grid [data-media-url]'));
  doc.querySelector('#te-media-grid [data-media-url]').click();
  doc.getElementById('te-media-confirm').click();
  assert.equal(doc.querySelector('[data-field-input="tile1.imageUrl"]').value,newImage);
  const linkButton=doc.querySelector('[data-link-trigger="tile1.href"]');
  linkButton.click();
  await tick();await tick();await tick();
  const picker=doc.querySelector('[data-link-picker="tile1.href"]');
  assert.ok(picker.querySelector('[data-link-choice="/shop/collections/masters"]'),"real collections are discoverable");
  assert.ok(picker.querySelector('[data-link-choice="/products/heavyweight-tee"]'),"real products are discoverable");
  picker.querySelector('[data-link-choice="/shop/collections/masters"]').click();
  assert.match(doc.querySelector('[data-link-trigger="tile1.href"]').textContent,/Masters Collection/);
  doc.getElementById('te-save').click();
  await tick();await tick();
  assert.equal(writes.length,1);
  assert.equal(writes[0].content.tile1.imageUrl,newImage);
  assert.equal(writes[0].content.tile1.href,"/shop/collections/masters");
  assert.equal(writes[0].content.tile2.imageUrl,"/assets/presets/fuel-free-time/masters.webp");
  assert.equal(writes[0].content.tile3.headline,"Clock out. Get gone.");
  assert.equal(writes[0].content.__editor.blocks.length,3);
 }finally{dom.window.close();}
});

test("installed draft never switches into unrelated Resolve showcase",async()=>{
  const {dom,doc}=await editorFixture({hostTheme:'Revise',themePreviews:[
    {id:'heuristic',name:'Heuristic',status:'installed'},
    {id:'resolve',name:'Resolve',status:'installed'},
  ]});
  try {
    assert.equal(doc.getElementById('te-theme-name')?.textContent,'Revise');
    assert.equal(doc.querySelector('.te-theme-switcher')?.hidden,true,
      'the stock demo selector is not offered in a site-owned draft');
    doc.querySelector('[data-theme-preview="resolve"]')?.click();
    await tick();
    assert.equal(doc.getElementById('te-theme-name')?.textContent,'Revise');
    assert.equal(doc.getElementById('te-theme-trigger-label')?.textContent,'Revise');
  }finally{dom.window.close();}
});
