import { icon } from "./icons";
import { assetUrl } from "./asset-url";
import { compositionInventory } from "./model-inventory";
import "./gallery.css";

export type SketchProjectKind = "draft" | "blank" | "starter" | "saved";
export type SketchProjectCategory = "Draft" | "Canvas" | "Composition" | "Sculpt" | "Editorial" | "Scene";

export type SketchProjectCard = {
  id: string;
  name: string;
  category: SketchProjectCategory;
  kind: SketchProjectKind;
  subtitle: string;
  meta: string;
  preview: string | null;
  accent?: string;
  starterId?: string;
  itemCount?: number;
  updatedAt?: string;
};

export type GalleryApi = {
  show: () => void;
  hide: () => void;
  isVisible: () => boolean;
  refresh: () => void;
};

type GalleryOptions = {
  host: HTMLElement;
  getActiveDraft: () => { name: string; brand: string; itemCount: number; updatedAt?: string };
  listSaved: () => Array<{ id: string; name: string; category: SketchProjectCategory; itemCount: number; updatedAt: string; preview?: string | null }>;
  onOpenDraft: () => void;
  onOpenBlank: () => void;
  onOpenSaved: (id: string) => void;
  onOpenStarter: (starterId: string, name: string, category: SketchProjectCategory) => void;
  onDeleteSaved?: (id: string) => void;
};

function safe(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

function relativeTime(iso?: string) {
  if (!iso) return "Just now";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "Recently";
  const delta = Date.now() - time;
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.round(minutes / 60);
  if (hours < 48) return hours + "h ago";
  return new Date(time).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function starterCards(): SketchProjectCard[] {
  return compositionInventory.slice(0, 12).map((entry) => ({
    id: "starter:" + entry.id,
    name: entry.name,
    category: (entry.category === "Sculpt" || entry.category === "Composition" || entry.category === "Editorial"
      ? entry.category
      : "Composition") as SketchProjectCategory,
    kind: "starter" as const,
    subtitle: "SamSketch · source-backed canvas",
    meta: entry.sku + " · " + entry.sourceCount + " mesh" + (entry.sourceCount === 1 ? "" : "es"),
    preview: entry.preview,
    starterId: entry.id,
    itemCount: entry.sourceCount,
  }));
}

export function mountSketchGallery(options: GalleryOptions): GalleryApi {
  const root = document.createElement("section");
  root.className = "ss-gallery";
  root.setAttribute("aria-label", "SamSketch projects");
  root.hidden = true;
  options.host.prepend(root);

  let filter: "all" | "drafts" | "starters" = "all";
  let query = "";
  let menuId: string | null = null;

  function buildCards(): SketchProjectCard[] {
    const draft = options.getActiveDraft();
    const cards: SketchProjectCard[] = [
      {
        id: "blank",
        name: "Blank canvas",
        category: "Canvas",
        kind: "blank",
        subtitle: "SamSketch · new scene",
        meta: "Start empty · editable",
        preview: null,
        accent: "blank",
      },
      {
        id: "active-draft",
        name: draft.name || "Untitled scene",
        category: "Draft",
        kind: "draft",
        subtitle: "SamSketch · current draft",
        meta: relativeTime(draft.updatedAt) + " · " + draft.itemCount + " object" + (draft.itemCount === 1 ? "" : "s"),
        preview: compositionInventory.find((entry) => entry.preview)?.preview || "web/stack.webp",
        itemCount: draft.itemCount,
        updatedAt: draft.updatedAt,
        accent: draft.brand,
      },
      ...options.listSaved().map((project) => ({
        id: project.id,
        name: project.name,
        category: project.category,
        kind: "saved" as const,
        subtitle: "SamSketch · saved scene",
        meta: relativeTime(project.updatedAt) + " · " + project.itemCount + " object" + (project.itemCount === 1 ? "" : "s"),
        preview: project.preview || null,
        itemCount: project.itemCount,
        updatedAt: project.updatedAt,
      })),
      ...starterCards(),
    ];
    return cards.filter((card) => {
      if (filter === "drafts" && !(card.kind === "draft" || card.kind === "saved" || card.kind === "blank")) return false;
      if (filter === "starters" && card.kind !== "starter") return false;
      if (!query) return true;
      const haystack = `${card.name} ${card.category} ${card.subtitle} ${card.meta}`.toLowerCase();
      return haystack.includes(query);
    });
  }

  function cardMarkup(card: SketchProjectCard) {
    const preview = card.preview
      ? `<img loading="lazy" src="${safe(assetUrl(card.preview))}" alt="" />`
      : `<span class="ss-resource-card__placeholder">${icon(card.kind === "blank" ? "plus" : "pen", 28)}<small>${card.kind === "blank" ? "New" : "Sketch"}</small></span>`;
    const openLabel = card.kind === "blank" ? "Create" : card.kind === "starter" ? "Open starter" : "Open";
    return `<article class="ss-resource-card" data-card-id="${safe(card.id)}" data-card-kind="${card.kind}" data-starter-id="${safe(card.starterId || "")}" data-card-name="${safe(card.name)}" data-card-category="${safe(card.category)}">
      <button type="button" class="ss-resource-card__open" aria-label="${safe(openLabel + " " + card.name)}">
        <span class="ss-resource-card__preview tone-${safe(card.accent || card.category.toLowerCase())}">${preview}
          <span class="ss-resource-card__badge">SamSketch</span>
          <span class="ss-resource-card__kind">${safe(card.category)}</span>
          <span class="ss-resource-card__cta"><span>${icon("arrow", 14)}</span>${safe(openLabel)}</span>
        </span>
        <span class="ss-resource-card__body">
          <strong>${safe(card.name)}</strong>
          <span>${safe(card.subtitle)}</span>
          <small>${safe(card.meta)}</small>
        </span>
      </button>
      <button type="button" class="ss-resource-card__more" aria-label="Actions for ${safe(card.name)}" aria-expanded="false" data-more="${safe(card.id)}">${icon("menu", 16)}</button>
      <div class="ss-resource-card__menu" hidden role="group" aria-label="Actions for ${safe(card.name)}">
        <button type="button" data-action="open">Open / Edit</button>
        ${card.kind === "saved" ? '<button type="button" data-action="delete">Delete</button>' : ""}
        <button type="button" data-action="cancel">Cancel</button>
      </div>
    </article>`;
  }

  function render() {
    const cards = buildCards();
    root.innerHTML = `
      <header class="ss-gallery__top">
        <div class="ss-gallery__brand">
          <span class="ss-gallery__mark" aria-hidden="true">${icon("pen", 18)}</span>
          <div>
            <strong>SamSketch</strong>
            <span>Sketch & scene studio</span>
          </div>
        </div>
        <div class="ss-gallery__actions">
          <button type="button" class="ss-gallery__primary" data-gallery-action="blank">${icon("plus", 15)} New canvas</button>
          <button type="button" class="ss-gallery__secondary" data-gallery-action="continue">${icon("folder", 15)} Continue draft</button>
        </div>
      </header>
      <div class="ss-gallery__intro">
        <div>
          <span class="ss-gallery__eyebrow">Creative workspace</span>
          <h1>Your canvases</h1>
          <p>Open a draft, start blank, or launch a source-backed composition. Previews stay lightweight — the 3D engine loads only in the editor.</p>
        </div>
        <span class="ss-gallery__count">${cards.length} surfaces</span>
      </div>
      <div class="ss-gallery__toolbar">
        <label class="ss-gallery__search">${icon("search", 15)}<input type="search" id="ss-gallery-search" placeholder="Search canvases, compositions, drafts…" aria-label="Search SamSketch projects" value="${safe(query)}"></label>
        <div class="ss-gallery__filters" role="group" aria-label="Organize canvases">
          <button type="button" data-filter="all" class="${filter === "all" ? "is-active" : ""}">All</button>
          <button type="button" data-filter="drafts" class="${filter === "drafts" ? "is-active" : ""}">Drafts</button>
          <button type="button" data-filter="starters" class="${filter === "starters" ? "is-active" : ""}">Starters</button>
        </div>
      </div>
      <div class="ss-gallery__grid" role="list">${cards.map(cardMarkup).join("") || `<div class="ss-gallery__empty">${icon("search", 22)}<strong>No matching canvases</strong><span>Try another search or filter.</span></div>`}</div>
      <footer class="ss-gallery__foot"><span>SamSketch · Creative Department</span><span>Batch 2 will add Concept Board, Product Sketch, and Scene Layout templates</span></footer>
    `;

    root.querySelector<HTMLInputElement>("#ss-gallery-search")?.addEventListener("input", (event) => {
      query = (event.currentTarget as HTMLInputElement).value.trim().toLowerCase();
      render();
      root.querySelector<HTMLInputElement>("#ss-gallery-search")?.focus();
    });
  }

  function openCard(card: HTMLElement) {
    const kind = card.dataset.cardKind as SketchProjectKind;
    const id = card.dataset.cardId || "";
    const starterId = card.dataset.starterId || "";
    const name = card.dataset.cardName || "Untitled";
    const category = (card.dataset.cardCategory || "Scene") as SketchProjectCategory;
    if (kind === "blank") options.onOpenBlank();
    else if (kind === "draft") options.onOpenDraft();
    else if (kind === "saved") options.onOpenSaved(id);
    else if (kind === "starter" && starterId) options.onOpenStarter(starterId, name, category);
  }

  root.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const filterButton = target.closest<HTMLButtonElement>("[data-filter]");
    if (filterButton) {
      filter = (filterButton.dataset.filter as typeof filter) || "all";
      render();
      return;
    }
    const galleryAction = target.closest<HTMLButtonElement>("[data-gallery-action]");
    if (galleryAction) {
      if (galleryAction.dataset.galleryAction === "blank") options.onOpenBlank();
      if (galleryAction.dataset.galleryAction === "continue") options.onOpenDraft();
      return;
    }
    const more = target.closest<HTMLButtonElement>("[data-more]");
    if (more) {
      const id = more.dataset.more || "";
      menuId = menuId === id ? null : id;
      root.querySelectorAll(".ss-resource-card__menu").forEach((menu) => {
        const card = menu.closest<HTMLElement>(".ss-resource-card");
        const open = card?.dataset.cardId === menuId;
        (menu as HTMLElement).hidden = !open;
        card?.querySelector("[data-more]")?.setAttribute("aria-expanded", String(open));
      });
      return;
    }
    const action = target.closest<HTMLButtonElement>("[data-action]");
    if (action) {
      const card = action.closest<HTMLElement>(".ss-resource-card");
      if (!card) return;
      const verb = action.dataset.action;
      if (verb === "open") openCard(card);
      if (verb === "delete" && card.dataset.cardKind === "saved") options.onDeleteSaved?.(card.dataset.cardId || "");
      menuId = null;
      render();
      return;
    }
    const open = target.closest<HTMLButtonElement>(".ss-resource-card__open");
    if (open) {
      const card = open.closest<HTMLElement>(".ss-resource-card");
      if (card) openCard(card);
    }
  });

  render();

  return {
    show() {
      root.hidden = false;
      options.host.dataset.ssSurface = "gallery";
      render();
    },
    hide() {
      root.hidden = true;
      options.host.dataset.ssSurface = "studio";
    },
    isVisible() {
      return !root.hidden;
    },
    refresh: render,
  };
}
