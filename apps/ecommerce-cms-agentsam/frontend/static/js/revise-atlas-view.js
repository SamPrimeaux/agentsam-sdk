/**
 * Existing FNF CMS / Revise Atlas. Edits are a live local preview until a
 * merchant explicitly imports one section into the shared CMS draft endpoint.
 */
(() => {
  const byId = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? "").replace(/&/g, "&amp;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const get = (object, path) => String(path).split(".").reduce((v, k) => v?.[k], object);
  const put = (object, path, value) => {
    const keys = path.split(".");
    let cursor = object;
    for (const key of keys.slice(0, -1)) {
      if (!cursor[key] || typeof cursor[key] !== "object") cursor[key] = {};
      cursor = cursor[key];
    }
    cursor[keys[keys.length - 1]] = value;
  };
  const atlas = window.ThemeReviseAtlas;
  const runtime = window.ThemePortableSections;
  let fixture = null;
  let page = null;
  let selected = null;
  let enhancer = null;
  const sections = new Map();

  function status(message, error = false) {
    const node = byId("atlas-message");
    node.textContent = message;
    node.style.color = error ? "#b42318" : "#396c3c";
  }
  function setPane(pane) {
    document.body.dataset.pane = pane;
    byId("atlas-mobile").querySelectorAll("[data-pane]").forEach((button) => {
      if (button.dataset.pane === pane) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }
  function sectionList() {
    byId("atlas-sections").innerHTML = page.sections.map((source) => {
      const content = sections.get(source.id)?.content;
      const schema = content ? atlas.schema(content.__editor?.themePreset) : null;
      return '<button type="button" data-select="' + escape(source.id) + '" aria-selected="' +
        String(selected === source.id) + '"><strong>' +
        escape(schema?.label || source.preset) + '</strong><small>' +
        escape(source.preset) + ' · ' + escape(source.id) + '</small></button>';
    }).join("");
    byId("atlas-sections").querySelectorAll("[data-select]").forEach((button) =>
      button.addEventListener("click", () => choose(button.dataset.select, true)));
  }
  function renderCanvas() {
    if (!page) return;
    enhancer?.dispose?.();
    enhancer = null;
    byId("atlas-rendered").innerHTML = page.sections.map((section) => {
      const entry = sections.get(section.id);
      return entry ? runtime.render(entry) : "";
    }).join("");
    byId("atlas-rendered").querySelectorAll("[data-cms-section]").forEach((node) => {
      node.classList.toggle("is-selected", node.dataset.cmsSection === selected);
      node.addEventListener("click", (event) => {
        // Let actual CTA links remain inspectable instead of navigating away from
        // this draft preview when the merchant is selecting sections.
        if (event.target.closest("a")) event.preventDefault();
        choose(node.dataset.cmsSection, false);
      });
    });
    try { enhancer = atlas.enhance(byId("atlas-rendered")); }
    catch (error) { console.warn("[Revise Atlas] Enhancement unavailable", error); }
  }
  function editorField(field, base = "") {
    const entry = sections.get(selected);
    const key = base ? base + "." + field.key : field.key;
    const value = get(entry.content, key);
    const id = "atlas-field-" + key.replace(/[^a-z0-9_-]/gi, "-");
    const type = field.type || "text";
    const label = escape(field.label || field.key);
    if (type === "boolean") {
      return '<div class="atlas-field"><label for="' + id + '">' + label + '</label>' +
        '<input type="checkbox" id="' + id + '" data-path="' + escape(key) + '" data-type="boolean"' +
        (Boolean(value) ? " checked" : "") + '></div>';
    }
    if (type === "json" || type === "textarea" || (type === "text" && typeof value === "string" && value.includes("\n"))) {
      const str = type === "json" ? JSON.stringify(value ?? [], null, 2) : String(value ?? "");
      return '<div class="atlas-field"><label for="' + id + '">' + label +
        '<span>' + escape(type) + '</span></label><textarea id="' + id + '" data-path="' +
        escape(key) + '" data-type="' + escape(type) + '"' + (type === "json" ? ' data-json="true"' : "") +
        ' spellcheck="' + (type === "json" ? "false" : "true") + '">' + escape(str) + '</textarea></div>';
    }
    return '<div class="atlas-field"><label for="' + id + '">' + label +
      '<span>' + escape(type) + '</span></label><input id="' + id +
      '" data-path="' + escape(key) + '" data-type="' + escape(type) + '"' +
      (type === "number" ? ' type="number"' : ' type="text"') + ' value="' + escape(value ?? "") +
      '"></div>';
  }
  function editor() {
    const entry = sections.get(selected);
    if (!entry) return;
    const schema = atlas.schema(entry.content.__editor?.themePreset);
    byId("atlas-selected").textContent = schema?.label || "Select section";
    byId("atlas-detail").textContent = "Real renderer: " + entry.content.__editor.sourcePreset +
      ". Changes below affect this genuine local preview; nothing is published.";
    const blocks = entry.content.__editor.blocks || [];
    const blockDef = schema?.blocks?.[0];
    byId("atlas-fields").innerHTML = (schema?.fields || []).map((f) => editorField(f)).join("") +
      blocks.map((block) => '<div class="atlas-block"><h3>' + escape(block.id) + '</h3>' +
        (blockDef?.fields || []).map((field) => editorField(field, block.id)).join("") + '</div>').join("");
    byId("atlas-fields").querySelectorAll("[data-path]").forEach((input) => {
      const type = input.dataset.type;
      const apply = () => {
        let value = type === "boolean" ? input.checked : input.value;
        if (type === "json") {
          try { value = JSON.parse(input.value); input.removeAttribute("aria-invalid"); }
          catch { input.setAttribute("aria-invalid", "true"); status("Correct the JSON before applying changes.", true); return; }
        }
        if (type === "number") value = Number(value);
        const previous = get(entry.content, input.dataset.path);
        put(entry.content, input.dataset.path, value);
        const result = atlas.validate(entry.content.__editor.themePreset, entry.content);
        if (!result.ok) {
          put(entry.content, input.dataset.path, previous);
          input.setAttribute("aria-invalid", "true");
          status(result.error, true);
          return;
        }
        input.removeAttribute("aria-invalid");
        status("Updated local draft preview. Import to CMS when ready.");
        renderCanvas();
      };
      input.addEventListener(type === "json" ? "change" : "input", apply);
    });
  }
  function choose(key, scroll = false) {
    if (!sections.has(key)) return;
    selected = key;
    sectionList();
    editor();
    byId("atlas-rendered").querySelectorAll("[data-cms-section]").forEach((node) =>
      node.classList.toggle("is-selected", node.dataset.cmsSection === key));
    if (scroll) byId(key)?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (window.matchMedia("(max-width:790px)").matches) setPane("inspector");
  }
  function setPage(id, wantedSection = null) {
    page = fixture.pages.find((item) => item.id === id) || fixture.pages[0];
    selected = null;
    byId("atlas-page-path").textContent = page.path;
    byId("atlas-page-title").textContent = page.title;
    byId("atlas-page-desc").textContent = page.description;
    byId("atlas-tree-info").textContent = page.sections.length + " genuine donor sections. Select one to inspect, edit or add to the real CMS draft.";
    byId("atlas-pages").querySelectorAll("[data-page]").forEach((button) => {
      if (button.dataset.page === page.id) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    for (const source of page.sections) {
      if (!sections.has(source.id)) sections.set(source.id, {
        key: source.id,
        content: atlas.fromSiteSection(source, fixture.media),
        status: "draft",
      });
    }
    selected = wantedSection && sections.has(wantedSection) ? wantedSection : page.sections[0]?.id;
    renderCanvas();
    sectionList();
    editor();
    status("These are local preview edits. Nothing has been published.");
    if (wantedSection) requestAnimationFrame(() => byId(wantedSection)?.scrollIntoView({ block: "start" }));
  }
  async function importSelected() {
    const entry = sections.get(selected);
    if (!entry) return;
    const destination = byId("atlas-target").value;
    const validation = atlas.validate(entry.content.__editor.themePreset, entry.content);
    if (!validation.ok) return status("Section validation failed: " + validation.error, true);
    if (!confirm("Add this actual Revise section and its source content to the " +
      destination + " CMS draft? This writes a draft only. It will NOT publish or replace the current website.")) return;
    const button = byId("atlas-import");
    button.disabled = true;
    status("Writing the new, unpublished CMS section…");
    try {
      const response = await fetch("/api/admin/cms/pages/" + encodeURIComponent(destination) + "/sections", {
        method: "POST", credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          templateKey: "portable",
          themePreset: entry.content.__editor.themePreset,
          content: entry.content,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw Error(result.error || "CMS server rejected the draft");
      status("Draft section saved as " + result.section_key + ". Open the Theme Editor to inspect it. Nothing published.");
    } catch (error) { status("Could not save: " + (error.message || error), true); }
    finally { button.disabled = false; }
  }

  byId("atlas-import").addEventListener("click", importSelected);
  byId("atlas-mobile").querySelectorAll("[data-pane]").forEach((button) =>
    button.addEventListener("click", () => setPane(button.dataset.pane)));
  fetch("/admin/fixtures/fnf-revise-site.json", { credentials: "same-origin" })
    .then((response) => { if (!response.ok) throw Error("FNF donor fixture unavailable"); return response.json(); })
    .then((data) => {
      if (data.catalog?.length !== 24 || data.pages?.length !== 5)
        throw Error("Donor fixture did not pass its source-count contract");
      fixture = data;
      byId("atlas-origin").textContent = "Source " + data.source.commit.slice(0, 8) +
        " · " + data.catalog.length + " real renderer presets · " +
        data.pages.reduce((n, p) => n + p.sections.length, 0) + " placed sections";
      byId("atlas-pages").innerHTML = data.pages.map((item) =>
        '<button type="button" data-page="' + escape(item.id) + '">' +
        escape(item.title) + '</button>').join("");
      byId("atlas-pages").querySelectorAll("[data-page]").forEach((button) =>
        button.addEventListener("click", () => setPage(button.dataset.page)));
      const fragment = decodeURIComponent(location.hash.slice(1));
      const found = data.pages.find((candidate) => candidate.sections.some((s) => s.id === fragment));
      setPage(found?.id || "home", found ? fragment : null);
    })
    .catch((error) => { byId("atlas-origin").textContent = "Unable to load donor source"; status(error.message, true); });
})();
