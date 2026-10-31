import { icon } from "./icons";
import { toolFamilies, renderIcon } from "./icon-catalog";
import { assetUrl } from "./asset-url";
import { modelInventory, compositionInventory, sourcePartInventory } from "./model-inventory";
import "./progressive.css";

type MountOptions = {
  insertTemplate: (id: string) => void;
  context: () => string;
  startBuild: (prompt: string, skill: string) => void;
  localAction?: (input: string) => string | null;
};

function safe(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}
function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function download(content: string, filename: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const skillPrompts: Record<string, string> = {
  Sculpt: "Help me sculpt a new form from this idea. Start with a clear shape proposal, editable geometry, and a useful camera view: ",
  Draft: "Help me draft a precise 2D profile, identify dimensions and constraints, and plan how it becomes 3D geometry: ",
  Model: "Help me create a 3D model from this idea. Identify the geometry, relationships, materials, and constraints before changing the scene: ",
  Animate: "Help me plan a scene animation with keyframes, timing, camera movement, and an editable timeline: ",
  Vector: "Help me create clean, editable vector iconography with normalized SVG geometry, consistent strokes, and no text baked into the mark: ",
  Scene: "Help me compose a polished claymorphic scene from the existing source-backed model inventory. Preserve source files and work only with scene instances: ",
};

export function mountProgressiveStudio(options: MountOptions) {
  const tabs = [...document.querySelectorAll<HTMLButtonElement>("[data-library]")];
  const panes: Record<string, HTMLElement | null> = {
    templates: document.getElementById("templates-section"),
    objects: document.getElementById("objects-section"),
    shapes: document.getElementById("shapes-section"),
    icons: document.getElementById("icons-section"),
  };
  function activateLibrary(tab: string) {
    for (const button of tabs) {
      const selected = button.dataset.library === tab;
      button.classList.toggle("active", selected);
      button.setAttribute("aria-selected", String(selected));
    }
    for (const [name, pane] of Object.entries(panes)) if (pane) pane.hidden = name !== tab;
  }
  for (const button of tabs) button.addEventListener("click", () => activateLibrary(button.dataset.library || "templates"));
  activateLibrary("templates");

  const catalog = document.getElementById("template-catalog")!;
  const search = document.getElementById("template-search") as HTMLInputElement;
  const filterButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-model-filter]")];
  let currentFilter = "all";
  function renderModels() {
    const query = search.value.trim().toLowerCase();
    const matches = modelInventory
      .filter((entry) => currentFilter === "all" || entry.kind === currentFilter)
      .filter((entry) => [
        entry.name, entry.id, entry.sku, entry.category, entry.sourcePaths.join(" "),
      ].some((value) => value.toLowerCase().includes(query)))
      .sort((a, b) => a.sku.localeCompare(b.sku));

    catalog.innerHTML = matches.map((entry) => {
      const ref = entry.kind === "source-part" ? "part:" + entry.id : entry.id;
      const preview = entry.preview
        ? `<img loading="lazy" src="${safe(assetUrl(entry.preview))}" alt="" />`
        : `<span class="model-placeholder">${icon("cube", 27)}<small>STL source</small></span>`;
      const detail = entry.kind === "composition"
        ? `${entry.sourceCount} source mesh${entry.sourceCount === 1 ? "" : "es"} · ${safe(entry.category)}`
        : "Source STL · editable scene instance";
      return `<button type="button" class="template-card model-inventory-card" data-template-insert="${safe(ref)}" data-model-kind="${entry.kind}" aria-label="Add ${safe(entry.name)} (${entry.sku}) to the scene" title="Add ${safe(entry.name)} to the scene">
        <span class="template-picture">${preview}<span class="model-sku">${entry.sku}</span></span>
        <span class="template-details"><strong>${safe(entry.name)}</strong><small>${detail}</small></span>
        <span class="template-add">${icon("plus", 15)}</span>
      </button>`;
    }).join("") || '<p class="template-empty">No matching models. Try another name, SKU or source type.</p>';

    const summary = document.getElementById("model-inventory-summary");
    if (summary) summary.textContent = `Showing ${matches.length} of ${modelInventory.length} entries · ${compositionInventory.length} compositions · ${sourcePartInventory.length} source parts. Source files remain unchanged.`;
    const count = document.getElementById("model-inventory-count");
    if (count) count.textContent = `${modelInventory.length} source-backed entries`;
  }
  search.addEventListener("input", renderModels);
  for (const button of filterButtons) button.addEventListener("click", () => {
    currentFilter = button.dataset.modelFilter || "all";
    for (const item of filterButtons) item.classList.toggle("active", item === button);
    renderModels();
  });
  renderModels();
  catalog.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-template-insert]");
    if (!button) return;
    const ref = button.dataset.templateInsert;
    if (!ref) return;
    options.insertTemplate(ref);
    activateLibrary("objects");
  });

  const skills = [...document.querySelectorAll<HTMLButtonElement>("[data-build-skill]")];
  function startSkill(skill: string) {
    const prompt = skillPrompts[skill] || skillPrompts.Scene;
    options.startBuild(prompt, skill);
  }
  for (const button of skills) button.addEventListener("click", () => startSkill(button.dataset.buildSkill || "Scene"));
  document.getElementById("start-build")?.addEventListener("click", () => startSkill("Scene"));

  const iconSearch = document.getElementById("icon-search") as HTMLInputElement;
  const iconCatalog = document.getElementById("icon-catalog")!;
  const iconSelection = document.getElementById("icon-selection")!;
  const iconEntries = toolFamilies.flatMap((family) => family.tools.map((tool) => ({
    id: family.id + "-" + slug(tool.name),
    familyId: family.id,
    family: family.title,
    name: tool.name,
    icon: tool.icon,
    note: tool.note,
  })));
  const iconCount = document.getElementById("icon-count");
  if (iconCount) iconCount.textContent = `${iconEntries.length} reference icons`;

  function renderIcons() {
    const query = iconSearch.value.trim().toLowerCase();
    const matching = iconEntries.filter((entry) =>
      [entry.name, entry.family, entry.note, entry.id].some((value) => value.toLowerCase().includes(query))
    );
    iconCatalog.innerHTML = toolFamilies.map((family) => {
      const entries = matching.filter((entry) => entry.familyId === family.id);
      if (!entries.length) return "";
      return `<section class="icon-family" aria-labelledby="icon-family-${family.id}">
        <header><strong id="icon-family-${family.id}">${safe(family.title)}</strong><span>${entries.length}</span></header>
        <div class="icon-family-grid">${entries.map((entry) => `<button type="button" class="icon-library-card" data-icon-key="${safe(entry.id)}" title="${safe(entry.note)}" aria-label="${safe(entry.name)} — ${safe(entry.note)}">
          <span>${renderIcon(entry.icon, 22)}</span><strong>${safe(entry.name)}</strong>
        </button>`).join("")}</div>
      </section>`;
    }).join("") || '<p class="template-empty">No matching icons. Try a tool name or capability.</p>';
  }
  iconSearch.addEventListener("input", renderIcons);
  renderIcons();
  iconCatalog.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-icon-key]");
    if (!button) return;
    const selected = iconEntries.find((entry) => entry.id === button.dataset.iconKey);
    if (!selected) return;
    iconCatalog.querySelectorAll(".icon-library-card").forEach((card) => card.classList.toggle("is-selected", card === button));
    iconSelection.innerHTML = `<span class="icon-selection-preview">${renderIcon(selected.icon, 26)}</span><span><strong>${safe(selected.name)}</strong><small>${safe(selected.family)} · ${safe(selected.note)} · 24×24 viewBox · 1.8 stroke</small></span>`;
  });

  document.getElementById("export-icon-pack")?.addEventListener("click", () => {
    const manifest = iconEntries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      family: entry.family,
      description: entry.note,
      viewBox: "0 0 24 24",
      strokeWidth: 1.8,
      variant: "outline",
      symbol: "#" + entry.id,
    }));
    const symbols = iconEntries.map((entry) => {
      const svg = renderIcon(entry.icon, 24);
      const body = svg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1] || "";
      return `<symbol id="${entry.id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`;
    }).join("\n  ");
    const sprite = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" role="img" aria-label="SamSketch system iconography sprite"><title>SamSketch system iconography</title><defs>
  ${symbols}
</defs></svg>`;
    download(sprite, "samsketch-system-icons-v1.svg", "image/svg+xml;charset=utf-8");
    download(JSON.stringify({ name: "SamSketch System Iconography", version: 1, count: manifest.length, icons: manifest }, null, 2), "samsketch-system-icons-v1.json", "application/json;charset=utf-8");
  });

  const dockInspector = document.getElementById("dock-inspector")!;
  const dockAgent = document.getElementById("dock-agent")!;
  const inspector = document.getElementById("inspector")!;
  const assistant = document.getElementById("assistant")!;
  const right = document.getElementById("right")!;
  function openInspector() {
    inspector.hidden = false;
    if (assistant) assistant.hidden = true;
    dockInspector?.classList.add("active");
    dockAgent?.classList.remove("active");
    right.classList.add("open");
  }
  dockInspector?.addEventListener("click", openInspector);
  dockAgent?.addEventListener("click", () => {
    options.startBuild("Help me inspect the current scene and suggest the next useful modeling action. Preserve all source files.", "Scene");
  });
  if (matchMedia("(max-width:850px)").matches) {
    inspector.hidden = true;
    if (assistant) assistant.hidden = true;
    dockInspector?.classList.remove("active");
    dockAgent?.classList.remove("active");
    right.classList.remove("open");
  } else openInspector();
  return {
    refreshContext() {},
    openDock: openInspector,
    openLibrary: activateLibrary,
  };
}
