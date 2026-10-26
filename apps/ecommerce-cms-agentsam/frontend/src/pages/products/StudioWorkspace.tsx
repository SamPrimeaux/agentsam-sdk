import { useEffect, useRef, useState, type PointerEvent } from "react";
import { createMiniAgentSam } from "../../../../packages/agentsam-workbench/src/mini-agentsam.js";
import { selectStudioSideImage } from "./studio-side-image";
import { blankGarmentImageSources } from "./studio-blank-image";
import { updateSellingVariants, toggleSellingGroup } from "./studio-selling-variants";
import { adminFetch, adminFormFetch } from "../../lib/api";
import { evaluateManufacturingCompatibility } from "../../../../packages/agentsam-merch/src/index.js";
import { studioArtworkQuality, type ArtworkCrop } from "./studio-artwork-quality";
import { suggestPrintScale } from "./studio-print-fit";
import { alphaBounds } from "./studio-alpha-bounds";
import StudioIcon from "./StudioIcon";
import ProductImage from "./ProductImage";
import {
  catalogProductId,
  catalogVariantId,
  printPixelSize,
  printSizeLabel,
  selectVariantForAxis,
  variantAttributes,
  variantAxes,
  variantAxisValues,
  variantImage,
  type MediaAsset,
  type ProductDetail,
} from "./studio-model";


function removeConnectedFlatBackground(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance = 42,
) {
  const countPixels = width * height;
  if (countPixels > 10_000_000) {
    throw new Error("Background removal is limited to 10 megapixel source artwork in the browser.");
  }
  let red = 0;
  let green = 0;
  let blue = 0;
  let samples = 0;
  const sample = (x: number, y: number) => {
    const offset = (y * width + x) * 4;
    if (pixels[offset + 3] < 16) return;
    red += pixels[offset];
    green += pixels[offset + 1];
    blue += pixels[offset + 2];
    samples += 1;
  };
  const stepX = Math.max(1, Math.floor(width / 160));
  const stepY = Math.max(1, Math.floor(height / 160));
  for (let x = 0; x < width; x += stepX) {
    sample(x, 0);
    sample(x, height - 1);
  }
  for (let y = 0; y < height; y += stepY) {
    sample(0, y);
    sample(width - 1, y);
  }
  if (!samples) return 0;
  const background = [red / samples, green / samples, blue / samples];
  const threshold = tolerance * tolerance * 3;
  const matches = (index: number) => {
    const offset = index * 4;
    if (pixels[offset + 3] < 16) return true;
    const dr = pixels[offset] - background[0];
    const dg = pixels[offset + 1] - background[1];
    const db = pixels[offset + 2] - background[2];
    return dr * dr + dg * dg + db * db <= threshold;
  };
  const visited = new Uint8Array(countPixels);
  const queue = new Int32Array(countPixels);
  let head = 0;
  let tail = 0;
  const enqueue = (index: number) => {
    if (index < 0 || index >= countPixels || visited[index] || !matches(index)) return;
    visited[index] = 1;
    queue[tail++] = index;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  let removed = 0;
  while (head < tail) {
    const index = queue[head++];
    const offset = index * 4;
    if (pixels[offset + 3] !== 0) {
      pixels[offset + 3] = 0;
      removed += 1;
    }
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) enqueue(index - 1);
    if (x + 1 < width) enqueue(index + 1);
    if (y > 0) enqueue(index - width);
    if (y + 1 < height) enqueue(index + width);
  }
  return removed;
}

type StoredSidePlacement = {
  original_media_asset_id: number | null;
  prepared_media_asset_id: number | null;
  preview_media_asset_id: number | null;
  x: number; y: number; scale: number; rotation: number;
  flipX: boolean; flipY: boolean; trimTransparent: boolean; removeFlatBackground: boolean;
  showArtwork: boolean;
};
type EditorSidePlacement = {
  asset: MediaAsset | null; preparedAsset: MediaAsset | null; previewAsset: MediaAsset | null;
  preparedFor: string | null;
  x: number; y: number; scale: number; rotation: number;
  flipX: boolean; flipY: boolean; trimTransparent: boolean; removeFlatBackground: boolean;
  showArtwork: boolean;
};

type StudioDraft = {
  id: string;
  completeful_catalog_product_id: string;
  product_id: number;
  state: "draft" | "prepared" | "rendering" | "rendered" | "created" | "published" | "error";
  selected_variant_ids: string[];
  print_location_ids: string[];
  placement?: {
    x?: number; y?: number; scale?: number; rotation?: number; flipX?: boolean; flipY?: boolean;
    trimTransparent?: boolean; removeFlatBackground?: boolean; notes?: string;
    sides?: Record<string, StoredSidePlacement>;
  };
  original_media_asset_id?: number | null;
  prepared_media_asset_id?: number | null;
  preview_media_asset_id?: number | null;
  completeful_design_id?: string | null;
  completeful_render_id?: string | null;
  completeful_render_status?: string | null;
  completeful_render_url?: string | null;
  title: string;
  description?: string | null;
  retail_price_cents: number;
  version: number;
};

function placementKey(assetId: number | null | undefined, variantId: string, locationId: string,
  x: number, y: number, scale: number, rotation: number, flipX: boolean, flipY: boolean,
  trimTransparent: boolean, removeFlatBackground: boolean) {
  return JSON.stringify([assetId || null, variantId, locationId, x, y, scale, rotation, flipX, flipY,
    trimTransparent, removeFlatBackground]);
}

// lucide pencil-sparkles: the Tools tab is the AI image toolkit.
function PencilSparklesIcon({ size = 22 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 3H8" /><path d="m15.007 5.008 3.987 3.986" /><path d="M20 15v4" />
      <path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
      <path d="M22 17h-4" /><path d="M4 5v4" /><path d="M6 7H2" /><path d="M9 2v2" />
    </svg>
  );
}

const tabs = [
  { id: "options", label: "Options", icon: "options" },
  { id: "upload", label: "Upload", icon: "upload" },
  { id: "designs", label: "Designs", icon: "image" },
  { id: "layers", label: "Layers", icon: "layers" },
  { id: "tools", label: "Tools", icon: "tools" },
];
export default function StudioWorkspace({
  detail,
  initialVariantId = "",
  resumeDraftId = null,
  catalogWarning = "",
  onBack,
}: {
  detail: ProductDetail;
  initialVariantId?: string;
  resumeDraftId?: string | null;
  catalogWarning?: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState("options");
  const [manageVariants, setManageVariants] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [fullPreviewOpen, setFullPreviewOpen] = useState(false);
  useEffect(() => {
    if (!fullPreviewOpen) return;
    fullPreviewCloseRef.current?.focus();
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullPreviewOpen(false);
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [fullPreviewOpen]);
  const [canvasZoom, setCanvasZoom] = useState(100);
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [albums, setAlbums] = useState<Array<{ id: number; name: string; asset_count?: number }>>([]);
  const [albumId, setAlbumId] = useState(0);
  const [targetAlbumId, setTargetAlbumId] = useState(0);
  const [collectionName, setCollectionName] = useState("");
  const [designName, setDesignName] = useState("");
  const [collectionEditorOpen, setCollectionEditorOpen] = useState(false);
  const [designView, setDesignView] = useState<"mine" | "shared">("mine");
  const [mediaReload, setMediaReload] = useState(0);
  const [mediaPage, setMediaPage] = useState(1);
  const [mediaHasMore, setMediaHasMore] = useState(false);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [preparedAsset, setPreparedAsset] = useState<MediaAsset | null>(null);
  const [preparedFor, setPreparedFor] = useState<string | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [sidePlacements, setSidePlacements] = useState<Record<string, EditorSidePlacement>>({});
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [restoringDraft, setRestoringDraft] = useState(Boolean(resumeDraftId));
  const [title, setTitle] = useState(detail.product.default_title || detail.product.name);
  const [providerRenderUrl, setProviderRenderUrl] = useState<string | null>(null);
  const [supplierMockups, setSupplierMockups] = useState<Array<{
    mockup_id: string; variant_color: string; print_location_id: string;
    render_id?: string; status: string; error?: string;
    asset?: { url: string } | null;
  }>>([]);

  const [trimTransparent, setTrimTransparent] = useState(false);
  const [croppedPreview, setCroppedPreview] = useState<{
    key: string; url: string; crop: ArtworkCrop;
  } | null>(null);
  const [cropError, setCropError] = useState("");
  const [removeFlatBackground, setRemoveFlatBackground] = useState(false);
  const [subjectRemovalAvailable, setSubjectRemovalAvailable] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locationId, setLocationId] = useState(
    detail.print_locations.find((l) => l.enabled && /(?:^|[_\s-])front(?:$|[_\s-])/i.test(l.name || l.print_location_id))?.print_location_id ||
    detail.print_locations.find((l) => l.enabled)?.print_location_id || "",
  );
  const initialVariant =
    detail.variants.find(
      (candidate) => catalogVariantId(candidate) === initialVariantId,
    ) || detail.variants[0];
  const [variantId, setVariantId] = useState(
    catalogVariantId(initialVariant) || "",
  );
  // The sellable assortment is not the one garment currently used for editing.
  // Use only catalog variant IDs; do not synthesize color/size combinations.
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(() =>
    detail.variants.map(catalogVariantId).filter(Boolean),
  );
  const [scale, setScale] = useState(80);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [mediaSearch, setMediaSearch] = useState("");
  // Default to artwork made or uploaded in Product Studio; the full media library is opt-in.
  const [artworkScope, setArtworkScope] = useState<"studio" | "library">("studio");
  // Image tools use the installed Model Catalog and preserve original artwork.
  const [aiMode, setAiMode] = useState<"generate" | "edit">("generate");
  const [aiPrompt, setAiPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [editableModels, setEditableModels] = useState<Array<{ id: string; name: string }>>([]);
  const [editModel, setEditModel] = useState("");
  const [revisionCandidate, setRevisionCandidate] = useState<MediaAsset | null>(null);

  const [aiBackground, setAiBackground] = useState<"auto" | "transparent" | "white">("auto");
  const [aiSize, setAiSize] = useState<"auto" | "square" | "landscape" | "portrait">("auto");
  const [aiQuality, setAiQuality] = useState<"auto" | "high" | "medium" | "low">("auto");
  const [mediaQuery, setMediaQuery] = useState("");
  const [showArtwork, setShowArtwork] = useState(true);
  const [guides, setGuides] = useState(false);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [artworkSelected, setArtworkSelected] = useState(false);
  const [agentVisible, setAgentVisible] = useState(false);
  const miniRef = useRef<ReturnType<typeof createMiniAgentSam> | null>(null);
  const miniSendRef = useRef<(message: string, signal: AbortSignal, resource: unknown) => Promise<{ reply: string }>>(async () => ({ reply: "" }));
  const variantDialogRef = useRef<HTMLElement>(null);
  const fullPreviewCloseRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ mode: "move" | "resize"; corner: "tl" | "tr" | "bl" | "br"; startX: number; startY: number; x: number; y: number; scale: number } | null>(null);
  const [reply, setReply] = useState("");
  // Generated images remain candidates until explicitly accepted. A model
  // response must not silently replace existing artwork or placement.
  const [generatedCandidate, setGeneratedCandidate] = useState<{
    base64: string; mime: string; prompt: string;
  } | null>(null);

  const [conversationId, setConversationId] = useState<string>();
  const [notes, setNotes] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mini = createMiniAgentSam({
      preferAbove: true,
      resultStatus: "Reply ready · review the result",
      capabilities: { list: () => [] },
      send: ({ prompt: text, signal, resource }) => miniSendRef.current(text, signal, resource),
      onResult: (result) => setReply(result.reply),
      onClose: () => setAgentVisible(false),
    });
    miniRef.current = mini;
    return () => { mini.destroy(); if (miniRef.current === mini) miniRef.current = null; };
  }, []);

  function openMiniAgentSam() {
    if (agentVisible) { miniRef.current?.close(); return; }
    if (!miniRef.current) {
      setError("miniAgentSam is unavailable. Reload the editor to try again.");
      return;
    }
    miniRef.current.select(
      { type: "product_artwork", surface: "product-studio",
        productId: catalogId, variantId, locationId, assetId: asset?.id || null },
      () => new DOMRect(window.innerWidth / 2, window.innerHeight - 96, 0, 0),
    );
    setAgentVisible(true);
  }

  // The global top-bar crosshair dispatches a cancelable `agentsam:mini-open`. Product Studio owns
  // product/artwork context (and artwork generation), so it claims the request and opens its composer.
  const openMiniRef = useRef(openMiniAgentSam);
  openMiniRef.current = openMiniAgentSam;
  useEffect(() => {
    const claim = (event: Event) => { event.preventDefault(); openMiniRef.current(); };
    window.addEventListener("agentsam:mini-open", claim);
    return () => window.removeEventListener("agentsam:mini-open", claim);
  }, []);
  // Report composer state so the global crosshair stays lit while this page's composer is open.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("agentsam:mini-state", { detail: { open: agentVisible } }));
    return () => { window.dispatchEvent(new CustomEvent("agentsam:mini-state", { detail: { open: false } })); };
  }, [agentVisible]);

  // The actual image model and requested output settings are resolved by the
  // server. Provider-incompatible options fail clearly instead of being ignored.
  async function generateImage() {
    try { await askAI(true, aiPrompt); } catch { /* askAI presents the failure */ }
  }
  const nextLabel = busy === "prepare" ? "Preparing print artwork…"
    : busy === "save" ? "Saving design…" : "Next step · Product details";

  function startDrag(event: PointerEvent<HTMLDivElement>, mode: "move" | "resize", corner: "tl" | "tr" | "bl" | "br" = "br") {
    if (!asset || !showArtwork) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, corner, startX: event.clientX, startY: event.clientY, x, y, scale };
    setArtworkSelected(true);
  }
  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const from = dragRef.current;
    if (!from) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - from.startX) / Math.max(1, rect.width)) * 100;
    const dy = ((event.clientY - from.startY) / Math.max(1, rect.height)) * 100;
    if (from.mode === "resize") {
      // Each corner must grow when dragged AWAY from the artwork center.
      const horizontal = from.corner.endsWith("r") ? dx : -dx;
      const vertical = from.corner.startsWith("b") ? dy : -dy;
      setScale(Math.max(5, Math.min(150, Math.round(from.scale + horizontal + vertical))));
    }
    else {
      const snap = (value: number) => {
        const rounded = Math.max(0, Math.min(100, Math.round(value)));
        return snapEnabled && Math.abs(rounded - Math.round(rounded / 5) * 5) < 2
          ? Math.round(rounded / 5) * 5 : rounded;
      };
      setX(snap(from.x + dx));
      setY(snap(from.y + dy));
    }
  }

  function openTab(next: string) {
    setManageVariants(false);
    setPanelOpen((current) => next === tab ? !current : true);
    setTab(next);
    if (next === "designs") {
      setArtworkScope("library");
      if (asset) setDesignName(asset.filename.replace(/\.[^.]+$/, ""));
    }
    // On small screens the tools remain in a compact bottom pane; keep the canvas visible.
  }
  const location = detail.print_locations.find(
    (l) => l.print_location_id === locationId,
  );
  const variant =
    detail.variants.find((v) => catalogVariantId(v) === variantId) ||
    detail.variants[0];
  const selectedAttributes = variantAttributes(variant);
  const optionAxes = variantAxes(detail.variants);
  // Blank garment source is NOT the supplier's decorated demonstration mockup.
  // "realistic_image_url" and the generic mockup gallery can already contain
  // another customer's artwork. Never position merchant artwork over those.
  // Choose images scoped to the selected variant, never another color.
  const blankVariantSources = blankGarmentImageSources(variant, detail.product);
  const enabledLocations = detail.print_locations.filter((candidate) => candidate.enabled);
  const isFrontLocation = /(?:^|[_\s-])front(?:$|[_\s-])/i.test(location?.name || locationId);
  const hasDistinctProviderSideArtboard = Boolean(
    !isFrontLocation && location?.artboard_image_url &&
    enabledLocations.some((candidate) => candidate.print_location_id !== locationId) &&
    enabledLocations.every((candidate) => candidate.print_location_id === locationId ||
      (candidate.artboard_image_url && candidate.artboard_image_url !== location.artboard_image_url)),
  );
  const designImage = selectStudioSideImage(
    // Supplier mockups and their "realistic" pictures may embed stock artwork.
    // Do not treat those as blank manufacturer base images.
    [], locationId, variantId, location?.artboard_image_url,
    blankVariantSources[0], isFrontLocation, selectedAttributes,
    hasDistinctProviderSideArtboard,
  );
  const designImageSources = designImage
    ? (isFrontLocation
      ? [...new Set([...blankVariantSources, location?.artboard_image_url].filter(
          (url): url is string => Boolean(url)))]
      : [designImage])
    : [];
  // Never use a generic silhouette to impersonate a provider garment photo.
  // Unverified side/color combinations keep their print geometry, but no garment claim.
  const artboardAspectRatio = location?.artboard_width && location?.artboard_height
    ? Number(location.artboard_width) / Number(location.artboard_height)
    : 4 / 5;
  // Switching a print location must never carry the previous side's artwork.
  // Keep each side's artwork and transforms independently in the same draft.
  function snapshotActiveSide(): EditorSidePlacement {
    return { asset, preparedAsset, previewAsset, preparedFor, x, y, scale, rotation,
      flipX, flipY, trimTransparent, removeFlatBackground, showArtwork };
  }
  function restoreSide(next?: EditorSidePlacement) {
    setAsset(next?.asset || null);
    setPreparedAsset(next?.preparedAsset || null);
    setPreviewAsset(next?.previewAsset || null);
    setPreparedFor(next?.preparedFor || null);
    setX(next?.x ?? 50);
    setY(next?.y ?? 50);
    setScale(next?.scale ?? 80);
    setRotation(next?.rotation ?? 0);
    setFlipX(next?.flipX ?? false);
    setFlipY(next?.flipY ?? false);
    setTrimTransparent(next?.trimTransparent ?? false);
    setRemoveFlatBackground(next?.removeFlatBackground ?? false);
    setShowArtwork(next?.showArtwork ?? true);
    setDimensions(null);
    setCroppedPreview(null);
    setCropError("");
    setArtworkSelected(false);
    setProviderRenderUrl(null);
  }
  function choosePrintLocation(nextLocationId: string) {
    if (nextLocationId === locationId) return;
    setSidePlacements((current) => ({ ...current, [locationId]: snapshotActiveSide() }));
    restoreSide(sidePlacements[nextLocationId]);
    setLocationId(nextLocationId);
  }
  const catalogId = catalogProductId(detail.product);
  useEffect(() => {
    const controller = new AbortController();
    adminFetch<{ capabilities?: { can_remove_background?: boolean } }>("/api/admin/media?limit=1", {
      signal: controller.signal,
    }).then((result) => {
      if (!controller.signal.aborted) setSubjectRemovalAvailable(Boolean(result.capabilities?.can_remove_background));
    }).catch(() => { if (!controller.signal.aborted) setSubjectRemovalAvailable(false); });
    return () => controller.abort();
  }, []);


  function chooseVariantOption(axis: string, value: string) {
    const next = selectVariantForAxis(detail.variants, variant, axis, value);
    if (next && catalogVariantId(next) !== variantId) {
      setVariantId(catalogVariantId(next));
      setProviderRenderUrl(null); // A render and composite belong to the previous variant.
      setPreviewAsset(null);
    }
  }
  const selectedVariantSet = new Set(selectedVariantIds);
  const catalogVariantIds = detail.variants.map(catalogVariantId).filter(Boolean);
  function updateSelectedVariants(ids: string[], include: boolean) {
    setSelectedVariantIds((current) => updateSellingVariants(catalogVariantIds, current, ids, include));
  }
  function toggleSellingAxis(axis: string, value: string) {
    const ids = detail.variants.filter((candidate) =>
      variantAttributes(candidate)[axis] === value).map(catalogVariantId).filter(Boolean);
    setSelectedVariantIds((current) => toggleSellingGroup(catalogVariantIds, current, ids));
  }
  function toggleSellingVariant(id: string, included: boolean) {
    updateSelectedVariants([id], included);
  }
  useEffect(() => {
    if (!manageVariants) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = variantDialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
    ) || []);
    focusable()[0]?.focus();
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setManageVariants(false);
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      previousFocus?.focus();
    };
  }, [manageVariants]);
  // Color thumbnails: one per color being sold, so every colorway can be reviewed without opening a menu.
  // These are client composites (garment plate + current artwork placement), not stored mockups.
  // These small color chips are local previews; exact per-color provider renders are saved in supplierMockups.
  const colorAxis = optionAxes.find((axis) => /color|colour/i.test(axis));
  const colorways = colorAxis
    ? variantAxisValues(detail.variants, colorAxis).flatMap((value) => {
        const sample = detail.variants.find((candidate) =>
          variantAttributes(candidate)[colorAxis] === value && selectedVariantSet.has(catalogVariantId(candidate)));
        if (!sample) return [];
        const blank = blankGarmentImageSources(sample, detail.product);
        const image = selectStudioSideImage(
          [], locationId, catalogVariantId(sample), location?.artboard_image_url,
          blank[0], isFrontLocation, variantAttributes(sample), hasDistinctProviderSideArtboard,
        );
        const sources = image ? (isFrontLocation && blank.length ? blank : [image]) : [];
        return [{ value, sources }];
      })
    : [];
  const printPixels = printPixelSize(location);
  const ratio =
    location?.file_width && location.file_height
      ? location.file_width / location.file_height
      : 1;
  const hasProviderPlacementFrame = Boolean(
    location?.artboard_width &&
      location?.artboard_height &&
      location?.width &&
      location?.height &&
      location?.x != null &&
      location?.y != null,
  );
  const placementFrameStyle = hasProviderPlacementFrame
    ? {
        left: `${(Number(location?.x) / Number(location?.artboard_width)) * 100}%`,
        top: `${(Number(location?.y) / Number(location?.artboard_height)) * 100}%`,
        width: `${(Number(location?.width) / Number(location?.artboard_width)) * 100}%`,
        height: `${(Number(location?.height) / Number(location?.artboard_height)) * 100}%`,
        transform: "none",
      }
    : { aspectRatio: ratio };
  useEffect(() => {
    // Starting from the supplier catalog is a NEW design, not a request to
    // overwrite the most recently saved draft for this garment. Only the
    // explicit Edit design deep link is permitted to restore persisted art.
    if (!resumeDraftId) { setRestoringDraft(false); return; }
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) { setBusy("restore"); setRestoringDraft(true); } });
    adminFetch<{ draft: StudioDraft | null }>(
      `/api/admin/product-studio/drafts/${encodeURIComponent(resumeDraftId)}`,
      { signal: controller.signal },
    )
      .then(async ({ draft: saved }) => {
        if (controller.signal.aborted) return;
        if (saved?.id !== resumeDraftId || saved?.completeful_catalog_product_id !== catalogId) {
          setError("Saved design could not be matched to this product. The design was not reset.");
          return;
        }
        if (!saved) return;
        setDraft(saved);
        setTitle(saved.title || detail.product.default_title || detail.product.name);
        // Resume the entire assortment. An editing preview remains a single example.
        setSelectedVariantIds(saved.selected_variant_ids || []);
        if (saved.selected_variant_ids?.[0]) setVariantId(saved.selected_variant_ids[0]);
        if (saved.print_location_ids?.[0]) setLocationId(saved.print_location_ids[0]);
        if (saved.placement) {
          setX(Number(saved.placement.x ?? 50));
          setY(Number(saved.placement.y ?? 50));
          setScale(Number(saved.placement.scale ?? 80));
          setRotation(Number(saved.placement.rotation ?? 0));
          setFlipX(Boolean(saved.placement.flipX));
          setFlipY(Boolean(saved.placement.flipY));
          setTrimTransparent(Boolean(saved.placement.trimTransparent));
          setRemoveFlatBackground(Boolean(saved.placement.removeFlatBackground));
          setNotes(String(saved.placement.notes || ""));
        }
        setProviderRenderUrl(saved.completeful_render_url || null);
        if (saved.prepared_media_asset_id) {
          setPreparedFor(placementKey(saved.original_media_asset_id,
            saved.selected_variant_ids?.[0] || "", saved.print_location_ids?.[0] || "",
            Number(saved.placement?.x ?? 50), Number(saved.placement?.y ?? 50),
            Number(saved.placement?.scale ?? 80), Number(saved.placement?.rotation ?? 0),
            Boolean(saved.placement?.flipX), Boolean(saved.placement?.flipY),
            Boolean(saved.placement?.trimTransparent), Boolean(saved.placement?.removeFlatBackground)));
        }
        if (saved.original_media_asset_id || saved.prepared_media_asset_id || saved.preview_media_asset_id) {
          // Never search a paginated gallery to restore durable media references.
          // Fetch the exact saved IDs; the artwork may be well beyond page one.
          const ids = [saved.original_media_asset_id, saved.prepared_media_asset_id, saved.preview_media_asset_id];
          const assets = await Promise.all(ids.map(async (id) => {
            if (!id) return null;
            const result = await adminFetch<{ asset: MediaAsset }>(`/api/admin/media/${id}`, { signal: controller.signal });
            return result.asset;
          }));
          if (controller.signal.aborted) return;
          if (assets[0]) setAsset(assets[0]);
          if (assets[1]) setPreparedAsset(assets[1]);
          if (assets[2]) setPreviewAsset(assets[2]);
        }
        if (saved.placement?.sides) {
          const sideEntries = Object.entries(saved.placement.sides);
          const sideAssetIds = [...new Set(sideEntries.flatMap(([, side]) =>
            [side.original_media_asset_id, side.prepared_media_asset_id, side.preview_media_asset_id]
              .filter((id): id is number => Number.isSafeInteger(id) && Number(id) > 0)))];
          const retrieved = await Promise.all(sideAssetIds.map(async (id) => {
            try {
              const result = await adminFetch<{ asset: MediaAsset }>(`/api/admin/media/${id}`, { signal: controller.signal });
              return [id, result.asset] as const;
            } catch { return [id, null] as const; }
          }));
          if (controller.signal.aborted) return;
          const byId = new Map(retrieved);
          const restored: Record<string, EditorSidePlacement> = {};
          for (const [id, side] of sideEntries) {
            const sideAsset = side.original_media_asset_id ? byId.get(side.original_media_asset_id) || null : null;
            const sidePrepared = side.prepared_media_asset_id ? byId.get(side.prepared_media_asset_id) || null : null;
            restored[id] = {
              asset: sideAsset, preparedAsset: sidePrepared,
              previewAsset: side.preview_media_asset_id ? byId.get(side.preview_media_asset_id) || null : null,
              preparedFor: sidePrepared ? placementKey(sideAsset?.id, saved.selected_variant_ids?.[0] || "",
                id, side.x, side.y, side.scale, side.rotation, side.flipX, side.flipY,
                side.trimTransparent, side.removeFlatBackground) : null,
              x: side.x, y: side.y, scale: side.scale, rotation: side.rotation,
              flipX: side.flipX, flipY: side.flipY, trimTransparent: side.trimTransparent,
              removeFlatBackground: side.removeFlatBackground, showArtwork: side.showArtwork,
            };
          }
          setSidePlacements(restored);
          const active = restored[saved.print_location_ids?.[0] || ""];
          if (active) {
            setAsset(active.asset); setPreparedAsset(active.preparedAsset); setPreviewAsset(active.previewAsset);
            setPreparedFor(active.preparedFor);
            setX(active.x); setY(active.y); setScale(active.scale); setRotation(active.rotation);
            setFlipX(active.flipX); setFlipY(active.flipY);
            setTrimTransparent(active.trimTransparent); setRemoveFlatBackground(active.removeFlatBackground);
            setShowArtwork(active.showArtwork);
          }
        }
        // Restoring an existing draft is normal; no standing success notice.
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) { setBusy(""); setRestoringDraft(false); }
      });
    return () => controller.abort();
  }, [catalogId, detail.product.default_title, detail.product.name, resumeDraftId]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setMediaQuery(mediaSearch.trim());
      setMediaPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [mediaSearch]);
  useEffect(() => {
    if (tab !== "upload" && tab !== "tools" && tab !== "designs") return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setBusy("library");
        setError("");
      }
    });
    const query = new URLSearchParams({
      view: "images", page_size: "48", page: String(mediaPage),
      ...(albumId > 0 ? { album_id: String(albumId) } : {}),
      ...(mediaQuery ? { q: mediaQuery } : {}),
    });
    adminFetch<{
      assets: MediaAsset[];
      albums?: Array<{ id: number; name: string; asset_count?: number }>;
      pagination?: { has_next?: boolean };
    }>(`/api/admin/media?${query}`, { signal: controller.signal })
      .then((d) => {
        if (controller.signal.aborted) return;
        // Generated derivatives (placement previews, prepared print files) are outputs, never inputs.
        const isDerivative = (a: MediaAsset) =>
          /\/studio\/(?:previews|prepared)\//.test(a.url || "") || /^(?:placement|prepared)-/i.test(a.filename || "");
        const inStudioScope = (a: MediaAsset) => /\/studio\/artwork\//.test(a.url || "");
        const artwork = d.assets.filter((a) =>
          (a.content_type?.startsWith("image/") || /\.(png|jpe?g|webp|svg)$/i.test(a.filename)) &&
          !isDerivative(a) && (artworkScope === "library" || inStudioScope(a)));
        setMedia((current) => mediaPage === 1 ? artwork : [
          ...current, ...artwork.filter((a) => !current.some((item) => item.id === a.id)),
        ]);
        setMediaHasMore(Boolean(d.pagination?.has_next));
        if (d.albums) setAlbums(d.albums);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy("");
      });
    return () => controller.abort();
  }, [tab, albumId, mediaPage, mediaQuery, artworkScope, mediaReload]);
  useEffect(() => {
    if (!asset) return;
    let active = true;
    const image = new Image();
    image.onload = () => {
      if (active)
        setDimensions({
          width: image.naturalWidth,
          height: image.naturalHeight,
        });
    };
    image.src = asset.url;
    return () => {
      active = false;
    };
  }, [asset]);
  // Use the exact processing and alpha-bound logic used for print preparation
  // so preview dimensions, source pixel counts, and exported pixels agree.
  useEffect(() => {
    if (!asset || (!trimTransparent && !removeFlatBackground)) return;
    let active = true;
    let objectUrl: string | null = null;
    const key = JSON.stringify([asset.id, asset.url, trimTransparent, removeFlatBackground]);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        if (canvas.width * canvas.height > 32_000_000) throw new Error("Artwork is too large to inspect in the browser");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) throw new Error("Cannot inspect artwork pixels");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        if (removeFlatBackground) {
          removeConnectedFlatBackground(pixels.data, canvas.width, canvas.height);
          context.putImageData(pixels, 0, 0);
        }
        const crop = trimTransparent
          ? alphaBounds(pixels.data, canvas.width, canvas.height)
          : { x: 0, y: 0, width: canvas.width, height: canvas.height };
        const preview = document.createElement("canvas");
        preview.width = crop.width;
        preview.height = crop.height;
        const previewContext = preview.getContext("2d");
        if (!previewContext) throw new Error("Cannot preview trimmed artwork");
        previewContext.drawImage(canvas, crop.x, crop.y, crop.width, crop.height,
          0, 0, crop.width, crop.height);
        preview.toBlob((blob) => {
          if (!active) return;
          if (!blob) {
            setCropError("Unable to preview artwork crop");
            return;
          }
          objectUrl = URL.createObjectURL(blob);
          setCroppedPreview({ key, crop, url: objectUrl });
          setCropError("");
        }, "image/png");
      } catch (e) {
        if (active) setCropError(e instanceof Error ? e.message : "Unable to inspect artwork crop");
      }
    };
    image.onerror = () => { if (active) setCropError("Unable to read artwork for print preparation"); };
    image.src = asset.url;
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [asset, trimTransparent, removeFlatBackground]);

  useEffect(() => {
    if (aiMode !== "edit") return;
    const controller = new AbortController();
    adminFetch<{ models?: Array<{ id: string; name: string }> }>("/api/admin/media/image-models", {
      signal: controller.signal,
    }).then(({ models }) => {
      if (controller.signal.aborted) return;
      setEditableModels(models || []);
      setEditModel((current) => current && models?.some((model) => model.id === current)
        ? current : models?.[0]?.id || "");
    }).catch(() => { if (!controller.signal.aborted) setEditableModels([]); });
    return () => controller.abort();
  }, [aiMode]);

  async function reviseSelectedArtwork(kind: "ai-edit" | "resample") {
    if (!asset || busy) return;
    if (kind === "ai-edit" && (!editModel || !editPrompt.trim())) {
      setError("Choose an available image editing model and describe the change.");
      return;
    }
    const sourceId = asset.id;
    setBusy(kind);
    setError("");
    try {
      const result = await adminFetch<{ ok: boolean; asset: MediaAsset }>(
        `/api/admin/media/${encodeURIComponent(sourceId)}/${kind}`, {
          method: "POST",
          body: JSON.stringify(kind === "ai-edit"
            ? { model_id: editModel, prompt: editPrompt.trim() } : { scale: 2 }),
        },
      );
      if (!result.ok || !result.asset) throw new Error("Image operation produced no asset.");
      setMedia((current) => [result.asset, ...current.filter((item) => item.id !== result.asset.id)]);
      setRevisionCandidate(result.asset);
      setNotice("New version saved. Your selected original has not been replaced.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Image operation failed.");
    } finally {
      setBusy("");
    }
  }

  function choose(a: MediaAsset) {
    setDesignName(a.filename.replace(/\.[^.]+$/, ""));
    setDimensions(null);
    setCroppedPreview(null);
    setCropError("");
    setAsset(a);
    setRevisionCandidate(null);
    setPreparedAsset(null);
    setPreparedFor(null);
    setPreviewAsset(null);
    setProviderRenderUrl(null);
    setShowArtwork(true);
    setArtworkSelected(true);
    setNotice("");
    if (window.matchMedia("(max-width: 760px)").matches)
      requestAnimationFrame(() =>
        stage.current?.scrollIntoView({ block: "start" }),
      );
  }
  async function removeBackgroundAI() {
    if (!asset || busy || !subjectRemovalAvailable) return;
    setBusy("remove-background");
    setError("");
    try {
      const result = await adminFetch<{ ok: boolean; asset?: MediaAsset; provider?: string }>(
        `/api/admin/media/${encodeURIComponent(asset.id)}/remove-background`, { method: "POST" },
      );
      if (!result.ok || !result.asset) throw new Error("Background removal did not produce a derivative.");
      setMedia((current) => [result.asset!, ...current.filter((item) => item.id !== result.asset!.id)]);
      choose(result.asset);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Subject segmentation failed.");
    } finally {
      setBusy("");
    }
  }

  async function uploadMediaFile(file: File, prefix: string, options: {
    derivativeRole?: "original/master" | "manufacturing" | "mockup";
    transformPolicy?: "auto" | "preserve";
    sourceAsset?: MediaAsset | null;
  } = {}) {
    const form = new FormData();
    form.append("files", file);
    form.append("folder", "images");
    form.append("prefix", prefix);
    if (options.derivativeRole) form.append("derivative_role", options.derivativeRole);
    if (options.transformPolicy) form.append("transform_policy", options.transformPolicy);
    if (options.sourceAsset?.id) form.append("source_media_asset_id", String(options.sourceAsset.id));
    const result = await adminFormFetch<{ assets?: MediaAsset[] }>("/api/admin/media", form);
    return result.assets?.[0];
  }

  async function createDesignCollection() {
    const name = collectionName.trim();
    if (!name) { setError("Name the collection first."); return; }
    setBusy("collection");
    setError("");
    try {
      // Existing Media Album contract: memberships reference assets, not copies in R2.
      const result = await adminFetch<{ album: { id: number; name: string; asset_count?: number } }>(
        "/api/admin/media/albums", {
          method: "POST",
          body: JSON.stringify({ name, kind: "album", description: "Product Studio design collection" }),
        });
      setAlbums((current) => [...current, result.album].sort((a,b) => a.name.localeCompare(b.name)));
      setTargetAlbumId(result.album.id);
      setCollectionEditorOpen(false);
      setCollectionName("");
      setNotice(`Collection “${result.album.name}” created. Choose an artwork to add.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create collection");
    } finally { setBusy(""); }
  }

  async function addSelectedToCollection() {
    if (!asset || !targetAlbumId) { setError("Select artwork and a destination collection."); return; }
    setBusy("collection");
    setError("");
    try {
      await adminFetch("/api/admin/media/batch", {
        method: "POST",
        body: JSON.stringify({ action: "album_add", ids: [asset.id], album_id: targetAlbumId }),
      });
      // Read the real membership count: album_add is idempotent for repeats.
      const refreshed = await adminFetch<{ albums: Array<{ id: number; name: string; asset_count?: number }> }>(
        "/api/admin/media/albums");
      setAlbums(refreshed.albums);
      setMediaReload((n) => n + 1);
      setNotice(`“${asset.filename}” added to the collection.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add artwork to collection");
    } finally { setBusy(""); }
  }

  async function renameSelectedDesign() {
    if (!asset) { setError("Select a design to rename."); return; }
    const base = designName.trim().replace(/[\/\\]/g, "-").replace(/\.[a-z0-9]+$/i, "").slice(0, 180);
    if (!base) { setError("Enter a design name."); return; }
    const extension = asset.filename.match(/\.[a-z0-9]+$/i)?.[0] || "";
    const filename = base + extension;
    if (filename === asset.filename) return;
    setBusy("rename");
    setError("");
    try {
      const result = await adminFetch<{ asset: MediaAsset }>(
        `/api/admin/media/${asset.id}`, { method: "PATCH", body: JSON.stringify({ filename }) });
      setAsset(result.asset);
      setMedia((current) => current.map((item) => item.id === result.asset.id ? result.asset : item));
      setNotice(`Design renamed to “${filename}”. The original media bytes were not changed.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not rename design");
    } finally { setBusy(""); }
  }

  async function upload(file?: File): Promise<boolean> {
    if (!file) return false;
    if (!/\.(png|jpe?g|webp|svg|pdf)$/i.test(file.name)) {
      setError("Choose a PNG, JPG, WebP, SVG, or PDF file.");
      return false;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a file under the studio’s 20 MB upload limit.");
      return false;
    }
    setBusy("upload");
    setError("");
    try {
      const uploaded = await uploadMediaFile(file, "studio/artwork", {
        derivativeRole: "original/master", transformPolicy: "preserve",
      });
      if (file.type === "application/pdf") {
        setNotice(
          "Original PDF saved to the media library. Add a PNG preview to position it in the Studio; the PDF remains untouched.",
        );
      } else if (uploaded) {
        if (albumId > 0) {
          // Existing Media Album membership; no duplicate storage or new folder.
          try {
            await adminFetch("/api/admin/media/batch", {
              method: "POST",
              body: JSON.stringify({ action: "album_add", ids: [uploaded.id], album_id: albumId }),
            });
          } catch {
            // Upload is still valid; do not lose the placed artwork because
            // optional album organization failed.
            setNotice("Artwork uploaded; adding it to the album needs a retry.");
          }
        }
        setMedia((current) => [uploaded, ...current.filter((item) => item.id !== uploaded.id)]);
        choose(uploaded);
        return true;
      }
      return false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      return false;
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function askAI(generate: boolean, text: string, signal?: AbortSignal, selectedResource?: unknown): Promise<{ reply: string }> {
    if (!text.trim()) throw new Error("Describe what you would like AgentSam to make or change.");
    if (busy) throw new Error("Another operation is running.");
    setBusy(generate ? "generate" : "ideas");
    setError("");
    try {
      const creative = generate
        ? {
            task_type: "image_generation",
            lane: "image",
            mode: "image",
            workflow_key: "fnf_creative_studio",
            image_options: {
              background: aiBackground,
              size: aiSize,
              quality: aiQuality,
              format: "png",
              variations: 1,
            },
          }
        : {};
      const result = await adminFetch<{
        reply: string;
        conversation_id?: string;
        ai?: { image_base64?: string; mime_type?: string; error_code?: string };
      }>("/api/admin/agentsam/chat", {
        method: "POST",
        signal,
        body: JSON.stringify({
          message: text.trim(),
          conversation_id: conversationId,
          ...creative,
          context: {
            page: "/admin/products/create",
            workflow_key: "product_studio",
            selected_resource: selectedResource,
            ...creative,
          },
        }),
      });
      setReply(result.reply);
      setConversationId(result.conversation_id);
      if (generate) {
        if (!result.ai?.image_base64) {
          const error = result.ai?.error_code || "";
          const guidance = error === "workers_ai_image_options_require_model_profile"
            ? "This Workers AI model needs Auto background, size, and quality. Change those options and try again."
            : error === "openai_credentials_unavailable" ? "OpenAI is not configured for this installation."
            : error.startsWith("openai_image_http_") ? "The image provider rejected this request (" + error.replace("openai_image_http_", "HTTP ") + "). Check model access and options."
            : error === "provider_returned_invalid_image" ? "The image provider returned an unreadable file. No artwork was changed."
            : "No image was produced by the selected model. Check its media capability and try again.";
          throw new Error(guidance);
        }
        setGeneratedCandidate({
          base64: result.ai.image_base64,
          mime: result.ai.mime_type || "image/png",
          prompt: text.trim(),
        });
      }
      return { reply: result.reply };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Creative request failed";
      setError(message);
      throw new Error(message, { cause: e });
    } finally {
      setBusy("");
    }
  }
  useEffect(() => {
    miniSendRef.current = (message, signal, resource) => {
      const generate = /^\/image\b/i.test(message);
      return askAI(generate, message, signal, resource);
    };
  });
  async function acceptGeneratedCandidate() {
    if (!generatedCandidate) return;
    const candidate = generatedCandidate;
    const bytes = Uint8Array.from(atob(candidate.base64), (c) => c.charCodeAt(0));
    const ext = candidate.mime === "image/webp" ? "webp" : candidate.mime === "image/jpeg" ? "jpg" : "png";
    const saved = await upload(new File([bytes], `studio-artwork-${crypto.randomUUID().slice(0, 12)}.${ext}`, { type: candidate.mime }));
    if (saved) setGeneratedCandidate(null);
  }

  async function saveDraft(nextPrepared: MediaAsset | null = preparedFor === currentPlacementKey ? preparedAsset : null,
    nextPreview: MediaAsset | null = preparedFor === currentPlacementKey ? previewAsset : null,
    placementScale: number = scale) {
    if (!variantId || !locationId || !selectedVariantIds.length) {
      setError("Choose at least one selling variant and a print area before saving.");
      setTab("options");
      setPanelOpen(true);
      return null;
    }
    setBusy("save");
    setError("");
    try {
      const allSides = { ...sidePlacements, [locationId]: snapshotActiveSide() };
      const persistedSides: Record<string, StoredSidePlacement> = {};
      for (const [id, side] of Object.entries(allSides)) {
        // Moving or replacing artwork invalidates only that side's derivative.
        const matchingPrepared = Boolean(side.preparedAsset && side.preparedFor ===
          placementKey(side.asset?.id, variantId, id, side.x, side.y, side.scale,
            side.rotation, side.flipX, side.flipY, side.trimTransparent, side.removeFlatBackground));
        persistedSides[id] = {
          original_media_asset_id: side.asset?.id || null,
          prepared_media_asset_id: matchingPrepared ? side.preparedAsset?.id || null : null,
          preview_media_asset_id: matchingPrepared ? side.previewAsset?.id || null : null,
          x: side.x, y: side.y, scale: side.scale, rotation: side.rotation,
          flipX: side.flipX, flipY: side.flipY,
          trimTransparent: side.trimTransparent, removeFlatBackground: side.removeFlatBackground,
          showArtwork: side.showArtwork,
        };
      }
      const result = await adminFetch<{ draft: StudioDraft }>("/api/admin/product-studio/drafts", {
        method: "POST",
        body: JSON.stringify({
          id: draft?.id,
          product_id: draft?.product_id,
          force_new: !draft && !resumeDraftId,
          catalog_product_id: catalogId,
          selected_variant_ids: selectedVariantIds,
          print_location_ids: Object.entries(allSides)
            .filter(([, side]) => side.asset && side.showArtwork)
            .map(([id]) => id),
          original_media_asset_id: asset?.id || null,
          prepared_media_asset_id: nextPrepared?.id || null,
          preview_media_asset_id: nextPreview?.id || null,
          placement: { x, y, scale: placementScale, rotation, flipX, flipY, trimTransparent, removeFlatBackground,
            sides: { ...persistedSides, [locationId]: { ...persistedSides[locationId], scale: placementScale,
              prepared_media_asset_id: nextPrepared?.id || null, preview_media_asset_id: nextPreview?.id || null } } },
          notes,
          title: title.trim() || detail.product.name,
        }),
      });
      setDraft(result.draft);
      setSidePlacements({
        ...allSides,
        [locationId]: {
          ...allSides[locationId],
          preparedAsset: nextPrepared,
          previewAsset: nextPreview,
          preparedFor: nextPrepared
            ? placementKey(asset?.id, variantId, locationId, x, y, placementScale,
                rotation, flipX, flipY, trimTransparent, removeFlatBackground)
            : null,
        },
      });
      setProviderRenderUrl(preparedFor === currentPlacementKey || Boolean(nextPrepared)
        ? result.draft.completeful_render_url || null : null);
      setNotice("");
      return result.draft;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save product draft");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function continueToProductDetails() {
    // "Next step" must not silently strand the merchant at an original-only
    // draft. Prepare the exact selected print file before handing off.
    if (!asset || !showArtwork) {
      setError("Select artwork before moving to Product Details.");
      setTab("upload");
      setPanelOpen(true);
      return;
    }
    const needsPreparation = !preparedAsset || preparedFor !== currentPlacementKey;
    const saved = needsPreparation ? await prepareArtwork() : await saveDraft();
    if (!saved) return;
    // A visible logo is not yet a supplier print file. Prepare every active side.
    const ready = await prepareRemainingSides(saved);
    if (!ready) return;
    const productId = Number(ready.product_id);
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      setError("The design was saved, but no storefront draft product was returned. Reopen the design before continuing.");
      return;
    }
    // Local draft product, NOT a fulfillment-provider product or public listing.
    window.location.assign("/admin/product-edit?id=" + encodeURIComponent(String(productId)));
  }

  async function buildPreparedArtworkBlob(
    placementScale: number = scale,
    targetSide: EditorSidePlacement = snapshotActiveSide(),
    targetLocation = location,
  ) {
    const targetAsset = targetSide.asset;
    const targetPixels = printPixelSize(targetLocation);
    if (!targetAsset || !targetSide.showArtwork || !targetPixels) {
      throw new Error("Add artwork and select a print area with known pixel dimensions first.");
    }
    const { width, height } = targetPixels;
    if (width * height > 32000000) {
      throw new Error("This print area is too large for safe browser preparation.");
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = targetAsset.url;
    await image.decode();
    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("Artwork preparation is unavailable");
    sourceContext.drawImage(image, 0, 0);
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
    if (targetSide.removeFlatBackground) {
      removeConnectedFlatBackground(sourcePixels.data, source.width, source.height);
      sourceContext.putImageData(sourcePixels, 0, 0);
    }
    const crop = targetSide.trimTransparent
      ? alphaBounds(sourcePixels.data, source.width, source.height)
      : { x: 0, y: 0, width: source.width, height: source.height };
    // Secondary sides follow the same print-resolution floor as the active side.
    // Do not turn a low-resolution back logo into a silently approved print file.
    if (targetLocation?.print_location_id !== locationId) {
      const quality = studioArtworkQuality({
        location: targetLocation,
        source: { width: source.width, height: source.height },
        crop, scalePercent: placementScale, fileName: targetAsset.filename,
      });
      if (quality.lowResolution) {
        throw new Error(`${targetLocation?.name || "Other side"}: ${quality.badge} is below the supplier target. Choose sharper artwork or reduce its print scale.`);
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas preparation is unavailable");
    const w = (width * placementScale) / 100;
    const h = (crop.height / crop.width) * w;
    ctx.translate((width * targetSide.x) / 100, (height * targetSide.y) / 100);
    ctx.rotate((targetSide.rotation * Math.PI) / 180);
    ctx.scale(targetSide.flipX ? -1 : 1, targetSide.flipY ? -1 : 1);
    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, -w / 2, -h / 2, w, h);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Artwork preparation failed"))),
        "image/png",
      ),
    );
  }

  async function persistPlacementPreview(prepared: MediaAsset) {
    // A provider print-area URL can point at the FRONT even for the Back.
    // Only produce a draft composite when the exact side/variant photo is verified.
    // Otherwise leave preview_media_asset_id empty rather than persist a false mockup.
    const backgroundUrl = designImage;
    if (!backgroundUrl || !location) return null;
    try {
      const background = new Image();
      background.crossOrigin = "anonymous";
      background.src = backgroundUrl;
      await background.decode();
      const artwork = new Image();
      artwork.crossOrigin = "anonymous";
      artwork.src = prepared.url;
      await artwork.decode();
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Number(location.artboard_width) || background.naturalWidth || 1500);
      canvas.height = Math.max(1, Number(location.artboard_height) || background.naturalHeight || 1500);
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
      const frame = hasProviderPlacementFrame
        ? { x: Number(location.x), y: Number(location.y), width: Number(location.width), height: Number(location.height) }
        : { x: canvas.width * 0.33, y: canvas.height * 0.3, width: canvas.width * 0.34, height: canvas.height * 0.4 };
      ctx.drawImage(artwork, frame.x, frame.y, frame.width, frame.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Preview export failed"))), "image/png"),
      );
      const filename = `placement-${catalogId.slice(0, 8)}-${locationId.slice(0, 8)}-${crypto.randomUUID().slice(0, 12)}.png`;
      return (await uploadMediaFile(
        new File([blob], filename, { type: "image/png" }), "studio/previews",
        { derivativeRole: "mockup", transformPolicy: "preserve", sourceAsset: prepared },
      )) || null;
    } catch (e) {
      console.warn("Placement preview could not be persisted", e);
      return null;
    }
  }

  async function prepareArtwork() {
    if (cropPending || cropError) {
      setError("Wait for artwork inspection or fix the crop before preparation.");
      return null;
    }
    setBusy("prepare");
    setError("");
    try {
      // Print DPI describes available detail, not image enhancement.
      // Changing the physical print size must be an explicit merchant action.
      const blockingIssues = manufacturingPreflight?.issues.filter((issue) =>
        issue.status === "needs_variant" || issue.status === "unsupported") || [];
      const fittedScale = suggestPrintScale({
        currentScale: scale,
        effectivePpi: manufacturingPreflight?.effectivePpi,
        targetPpi: manufacturingPreflight?.target.ppi,
      });
      if (manufacturingPreflight && ["unsupported", "needs_variant"].includes(manufacturingPreflight.status)) {
        throw new Error(fittedScale !== null && blockingIssues.every((issue) => issue.code === "insufficient_resolution")
          ? "This artwork is below the supplier's resolution target. Tap the DPI control to make the physical print smaller, or choose a genuinely sharper source."
          : blockingIssues[0]?.message || manufacturingPreflight.issues[0]?.message ||
              "Use a higher-resolution source or a smaller print placement.");
      }
      const finalScale = scale;
      // Preparing unchanged artwork twice must not produce another numbered asset.
      if (preparedAsset && preparedFor === currentPlacementKey) {
        return await saveDraft(preparedAsset, previewAsset, finalScale);
      }
      const blob = await buildPreparedArtworkBlob(finalScale);
      const filename = `prepared-${catalogId.slice(0, 8)}-${locationId.slice(0, 8)}-${crypto.randomUUID().slice(0, 12)}.png`;
      const uploaded = await uploadMediaFile(
        new File([blob], filename, { type: "image/png" }), "studio/prepared",
        { derivativeRole: "manufacturing", transformPolicy: "preserve", sourceAsset: asset },
      );
      if (!uploaded) throw new Error("Prepared artwork was not saved");
      setPreparedAsset(uploaded);
      setPreparedFor(placementKey(asset?.id, variantId, locationId, x, y, finalScale, rotation, flipX, flipY, trimTransparent, removeFlatBackground));
      setPreviewAsset(null);
      setProviderRenderUrl(null);
      const preview = await persistPlacementPreview(uploaded);
      if (preview) setPreviewAsset(preview);
      const saved = await saveDraft(uploaded, preview || null, finalScale);
      if (!saved) throw new Error("Prepared artwork was uploaded, but the design draft could not be saved");
      return saved;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Artwork preparation failed");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function prepareRemainingSides(saved: StudioDraft): Promise<StudioDraft | null> {
    const sides = { ...(saved.placement?.sides || {}) };
    const localSides = { ...sidePlacements, [locationId]: snapshotActiveSide() };
    const updatedSides = { ...localSides };
    let changed = false;
    try {
      for (const [id, side] of Object.entries(sides)) {
        if (!side.original_media_asset_id || !side.showArtwork) continue;
        const area = detail.print_locations.find((item) => item.print_location_id === id);
        if (!area || !printPixelSize(area)) throw new Error(`Missing supplier print dimensions for ${id}`);
        // The current side was prepared by prepareArtwork() immediately above.
        if (id === locationId && side.prepared_media_asset_id) continue;
        let stored = updatedSides[id];
        if (!stored?.asset || stored.asset.id !== side.original_media_asset_id) {
          const response = await adminFetch<{ asset: MediaAsset }>(
            `/api/admin/media/${side.original_media_asset_id}`);
          if (!response.asset) throw new Error(`Missing source artwork for ${area.name}`);
          stored = { ...side, asset: response.asset, preparedAsset: null,
            previewAsset: null, preparedFor: null };
        }
        const expected = placementKey(stored.asset?.id, variantId, id, side.x, side.y,
          side.scale, side.rotation, side.flipX, side.flipY,
          side.trimTransparent, side.removeFlatBackground);
        if (side.prepared_media_asset_id && stored.preparedAsset?.id === side.prepared_media_asset_id
          && stored.preparedFor === expected) continue;
        setBusy("prepare");
        setNotice(`Preparing ${area.name} artwork for print…`);
        const placed = { ...stored, ...side, asset: stored.asset };
        const blob = await buildPreparedArtworkBlob(side.scale, placed, area);
        const filename = `prepared-${catalogId.slice(0, 8)}-${id.slice(0, 8)}-${crypto.randomUUID().slice(0, 12)}.png`;
        const uploaded = await uploadMediaFile(
          new File([blob], filename, { type: "image/png" }), "studio/prepared",
          { derivativeRole: "manufacturing", transformPolicy: "preserve", sourceAsset: stored.asset });
        if (!uploaded) throw new Error(`The ${area.name} print file could not be saved`);
        sides[id] = { ...side, prepared_media_asset_id: uploaded.id, preview_media_asset_id: null };
        updatedSides[id] = { ...placed, preparedAsset: uploaded, previewAsset: null, preparedFor: expected };
        changed = true;
      }
      if (!changed) { setNotice(""); return saved; }
      const response = await adminFetch<{ draft: StudioDraft }>("/api/admin/product-studio/drafts", {
        method: "POST",
        body: JSON.stringify({
          id: saved.id, product_id: saved.product_id, catalog_product_id: catalogId,
          selected_variant_ids: selectedVariantIds,
          print_location_ids: Object.entries(sides).filter(([, side]) =>
            side.original_media_asset_id && side.showArtwork).map(([id]) => id),
          original_media_asset_id: saved.original_media_asset_id ?? null,
          prepared_media_asset_id: saved.prepared_media_asset_id ?? null,
          preview_media_asset_id: saved.preview_media_asset_id ?? null,
          title: saved.title, placement: { ...saved.placement, sides },
        }),
      });
      setDraft(response.draft);
      setSidePlacements(updatedSides);
      setNotice("");
      return response.draft;
    } catch (e) {
      setError(`Could not prepare both sides: ${e instanceof Error ? e.message : "Unknown error"}. Your design is saved.`);
      return null;
    } finally {
      setBusy("");
    }
  }

  async function renderSupplierMockups() {
    if (!preparedAsset || preparedFor !== currentPlacementKey) {
      setError("Prepare the current artwork before rendering supplier mockups.");
      return;
    }
    const saved = await saveDraft();
    if (!saved) return;
    setBusy("render-batch");
    setError("");
    try {
      const result = await adminFetch<{
        ok: boolean; error?: string; skipped?: Array<{ reason: string }>;
        rendered?: Array<{
          mockup_id: string; variant_color: string; print_location_id: string;
          render_id?: string; status: string; error?: string; asset?: { url: string } | null;
        }>;
      }>(`/api/admin/product-studio/drafts/${encodeURIComponent(saved.id)}/render-batch`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!result.ok || !result.rendered?.length) {
        throw new Error(result.error || "No color-verified supplier mockups were available.");
      }
      setSupplierMockups(result.rendered);
      const missing = result.skipped?.length || 0;
      setNotice(`Submitted ${result.rendered.length} exact-color supplier mockups.` +
        (missing ? ` ${missing} combinations lack supplier imagery and were skipped.` : ""));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Supplier mockup rendering failed.");
    } finally {
      setBusy("");
    }
  }

  async function refreshSupplierMockups() {
    const pending = supplierMockups.filter((item) => item.render_id && !item.asset && item.status !== "failed");
    if (!pending.length || busy) return;
    setBusy("refresh-mockups");
    try {
      const results = await Promise.all(pending.map(async (item) => {
        try {
          return await adminFetch<{
            status: string; render_id: string; asset?: { url: string } | null;
          }>(`/api/admin/product-studio/renders/${encodeURIComponent(item.render_id!)}/batch`);
        } catch {
          return null;
        }
      }));
      setSupplierMockups((current) => current.map((item) => {
        const next = results.find((result) => result?.render_id === item.render_id);
        return next ? { ...item, status: next.status, asset: next.asset || item.asset } : item;
      }));
      setNotice("Supplier render statuses refreshed. Completed images are saved in Media Library.");
    } finally {
      setBusy("");
    }
  }

  const cropKey = asset ? JSON.stringify([asset.id, asset.url, trimTransparent, removeFlatBackground]) : "";
  const cropPending = Boolean(asset && (trimTransparent || removeFlatBackground) &&
    croppedPreview?.key !== cropKey);
  const artworkCrop = trimTransparent && croppedPreview?.key === cropKey ? croppedPreview.crop : null;
  const artworkPreviewUrl = croppedPreview?.key === cropKey ? croppedPreview.url : asset?.url;
  const quality = studioArtworkQuality({
    location, source: dimensions, crop: artworkCrop, cropPending, scalePercent: scale,
    fileName: asset?.filename,
  });
  const lowResolution = quality.lowResolution;
  const filteredMedia = media;
  // Generated artwork is saved as studio-artwork-<id>.<ext> by upload() after askAI().
  const aiImages = media.filter((item) => /^studio-artwork-/i.test(item.filename || ""));
  const currentPlacementKey = placementKey(asset?.id, variantId, locationId, x, y, scale, rotation, flipX, flipY, trimTransparent, removeFlatBackground);
  const preparedIsCurrent = Boolean(preparedAsset && preparedFor === currentPlacementKey);
  const currentRenderUrl = preparedIsCurrent ? providerRenderUrl : null;
  const manufacturingPreflight = dimensions && !cropPending && printPixels && asset && location
    ? evaluateManufacturingCompatibility(
        { format: asset.filename?.split(".").pop(),
          widthPx: artworkCrop?.width ?? dimensions.width,
          heightPx: artworkCrop?.height ?? dimensions.height, bytes: asset.size_bytes },
        { id: "fnf.catalog-raster", manufacturer: "completeful",
          process: String(detail.product.print_type || "catalog").toLowerCase(),
          format: "png", allowRaster: true, allowVector: false,
          ppi: Number(location.dpi) || 300,
          source: { kind: "catalog-artboard", verified: false } },
        { printWidthIn: ((printPixels.width * scale) / 100) / (Number(location.dpi) || 300),
          printHeightIn: ((printPixels.width * scale) / 100) / (Number(location.dpi) || 300) *
            (artworkCrop?.height ?? dimensions.height) / Math.max(1, artworkCrop?.width ?? dimensions.width) },
      )
    : null;
  const resolutionFit = suggestPrintScale({ currentScale: scale,
    effectivePpi: manufacturingPreflight?.effectivePpi,
    targetPpi: manufacturingPreflight?.target.ppi });
  const resolutionBlockers = manufacturingPreflight?.issues.filter((issue) =>
    issue.status === "needs_variant" || issue.status === "unsupported") || [];
  const autoFitAvailable = resolutionFit !== null && resolutionBlockers.length > 0 &&
    resolutionBlockers.every((issue) => issue.code === "insufficient_resolution");
  return (
    <div className="ps-workspace" data-agentsam-resource="product-design-workspace">
      <header className="ps-workspace-header">
        <button
          className="ps-text-button ps-icon-action ps-icon-action--ghost"
          data-tip="Back to product details"
          onClick={onBack}
          aria-label="Back to product details"
        >
          <StudioIcon name="back" />
          <span className="ps-sr-only">Product details</span>
        </button>
        <nav className="ps-steps" aria-label="Product creation progress">
          <ol>
            {["Choose product", "Design", "Product details", "Publish"].map((label, index) => (
              <li key={label} className={index === 1 ? "is-current" : index < 1 ? "is-done" : ""}
                aria-current={index === 1 ? "step" : undefined}>
                <span className="ps-steps__dot" aria-hidden="true">{index < 1 ? "✓" : index + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </nav>
        <div className="ps-workspace-actions">
          <button type="button" className="ps-icon-action" data-tip={busy === "save" ? "Saving…" : "Save design"}
            aria-label="Save design" disabled={Boolean(busy)} onClick={() => void saveDraft()}>
            {busy === "save" ? <span className="ps-icon-action__busy" aria-hidden="true" /> : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 17V3" /><path d="m6 11 6 6 6-6" /><path d="M19 21H5" />
              </svg>
            )}
            <span className="ps-sr-only">Save design</span>
          </button>
          <button type="button" className="ps-icon-action ps-icon-action--primary" data-tip={nextLabel}
            aria-label={nextLabel} disabled={Boolean(busy)} onClick={() => void continueToProductDetails()}>
            {busy === "prepare" ? <span className="ps-icon-action__busy" aria-hidden="true" /> : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17 12H3" /><path d="m11 18 6-6-6-6" /><path d="M21 5v14" />
              </svg>
            )}
            <span className="ps-sr-only">{nextLabel}</span>
          </button>
          {error && <p className="ps-step-feedback ps-step-feedback--error" role="alert">{error}</p>}
          {cropError && <p className="ps-step-feedback ps-step-feedback--error" role="alert">{cropError}</p>}
          {!error && notice && <p className="ps-step-feedback" role="status">{notice}</p>}
        </div>
        <div className="ps-header-artwork-tools">
            {asset && !currentRenderUrl && artworkSelected && (
              <div className="ps-artwork-toolbar" role="toolbar" aria-label="Selected artwork tools">
                <button type="button" title="Edit artwork placement" aria-label="Edit artwork placement"
                  onClick={() => { setTab("layers"); setPanelOpen(true); }}><StudioIcon name="pen" size={17} /></button>
                <button type="button" title="Background cutout" aria-label="Background cutout"
                  onClick={() => { setTab("tools"); setPanelOpen(true); setRemoveFlatBackground(true); }}><StudioIcon name="image" size={17} /></button>
                <span className="ps-artwork-toolbar__divider" aria-hidden="true" />
                <button type="button" title="Reduce artwork size" aria-label="Reduce artwork size"
                  onClick={() => setScale((value) => Math.max(5, value - 5))}>−</button>
                <output aria-label="Artwork size" className="ps-artwork-scale">{scale}%</output>
                <button type="button" title="Increase artwork size" aria-label="Increase artwork size"
                  onClick={() => setScale((value) => Math.min(150, value + 5))}>+</button>
                <button type="button" title="Center artwork" aria-label="Center artwork"
                  onClick={() => { setX(50); setY(50); }}><StudioIcon name="center" size={17} /></button>
                <button type="button" title="Rotate 90 degrees" aria-label="Rotate artwork 90 degrees"
                  onClick={() => setRotation((value) => ((value + 270) % 360) - 180)}><StudioIcon name="rotate" size={17} /></button>
                <button type="button" title="Flip horizontally" aria-label="Flip artwork horizontally"
                  aria-pressed={flipX} onClick={() => setFlipX((value) => !value)}><StudioIcon name="flip" size={17} /></button>
                <span className="ps-artwork-toolbar__divider" aria-hidden="true" />
                <button type="button" className={"ps-dpi-badge" + (lowResolution ? " is-low" : "")}
                  aria-label={autoFitAvailable && resolutionFit != null
                    ? `${quality.aria}. Reduce print placement from ${scale}% to ${resolutionFit}%`
                    : quality.aria}
                  title={autoFitAvailable && resolutionFit != null
                    ? `${quality.detail}. Tap to reduce physical print size to ${resolutionFit}%. This does not sharpen the original pixels.`
                    : quality.detail}
                  disabled={!autoFitAvailable || resolutionFit === null}
                  onClick={() => { if (resolutionFit !== null) { setScale(resolutionFit); setError(""); } }}>
                  {quality.badge}{autoFitAvailable ? " · Fit" : ""}
                </button>
              </div>
            )}
        </div>
      </header>
      {catalogWarning && <p className="ps-restore-notice" role="alert">{catalogWarning}</p>}
      {restoringDraft && <p className="ps-restore-notice" role="status">Restoring saved design and artwork…</p>}
      <div className={`ps-workspace-body ${panelOpen ? "" : "is-panel-collapsed"}`}>
        <nav className="ps-toolrail" aria-label="Design tools">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={panelOpen && tab === t.id ? "is-active" : ""}
              onClick={() => openTab(t.id)}
              aria-pressed={panelOpen && tab === t.id}
              aria-expanded={panelOpen && tab === t.id}
            >
              {t.id === "tools" ? <PencilSparklesIcon /> : <StudioIcon name={t.icon} />}
              <span>{t.label}</span>
            </button>
          ))}
          <a className="ps-toolrail__help" href="/admin/products/help/artwork" title="Artwork help">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
              <path d="M12 17h.01" /><path d="M9.1 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3" />
            </svg>
            <span>Artwork help</span>
          </a>
        </nav>
        <aside className="ps-toolpanel" ref={panel} hidden={!panelOpen} aria-label="Selected design tool">
          <div className="ps-panel-heading">
            <div>
              <span className="ps-eyebrow">MAKE IT YOURS</span>
              <h2>{tabs.find((t) => t.id === tab)?.label}</h2>
            </div>
            <button type="button" className="ps-panel-dismiss" onClick={() => setPanelOpen(false)} aria-label="Collapse tool panel">×</button>
          </div>
          {tab === "options" && (
            <div className="ps-selling-editor" aria-label="Product options">
              <section className="ps-selling-section" aria-labelledby="ps-selling-heading">
                <div className="ps-selling-heading">
                  <strong id="ps-selling-heading">Selling options</strong>
                  <output aria-live="polite">{selectedVariantIds.length} of {catalogVariantIds.length} selected</output>
                </div>
                <p className="ps-selling-help">Choose which actual supplier variants customers can buy.</p>
                <div className="ps-selling-actions">
                  <button type="button" onClick={() => setSelectedVariantIds(catalogVariantIds)}>Select all</button>
                  <button type="button" onClick={() => setSelectedVariantIds([])}>Clear</button>
                  <button type="button" className="ps-variant-manage" onClick={() => setManageVariants(true)}>Manage variants</button>
                </div>
                {optionAxes.map((axis) => (
                  <div className="ps-selling-axis" key={axis}>
                    <strong>{/size/i.test(axis) ? "Sizes offered" : /color|colour/i.test(axis) ? "Colors offered" : axis + " offered"}</strong>
                    <div className="ps-selling-values" role="group" aria-label={`Selling ${axis}`}>
                      {variantAxisValues(detail.variants, axis).map((value) => {
                        const matching = detail.variants.filter((candidate) =>
                          variantAttributes(candidate)[axis] === value);
                        const includedCount = matching.filter((candidate) =>
                          selectedVariantSet.has(catalogVariantId(candidate))).length;
                        const allIncluded = matching.length > 0 && includedCount === matching.length;
                        const sample = matching[0];
                        return (
                          <button type="button" key={value}
                            className={allIncluded ? "is-selected" : includedCount ? "is-partial" : ""}
                            aria-pressed={allIncluded}
                            aria-label={`${value}, ${includedCount} of ${matching.length} variants selected for sale`}
                            title={`${includedCount} of ${matching.length} supplier variants included`}
                            onClick={() => toggleSellingAxis(axis, value)}>
                            {/color|colour|finish|material/i.test(axis) && variantImage(sample) && (
                              <ProductImage sources={[variantImage(sample)]} alt="" />
                            )}
                            <span>{value}</span>
                            <span className="ps-selling-tick" aria-hidden="true">{allIncluded ? "✓" : includedCount ? "−" : "+"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!selectedVariantIds.length && (
                  <p className="ps-selling-warning" role="status">Choose at least one variant before saving.</p>
                )}
              </section>
              <section className="ps-editing-section" aria-labelledby="ps-editing-heading">
                <strong id="ps-editing-heading">Editing preview</strong>
                <p className="ps-selling-help">Change the garment shown on the canvas without changing the selling selection.</p>
                <div className="ps-preview-fields">
                  {optionAxes.map((axis) => (
                    <label key={axis}>
                      <span>{/size/i.test(axis) ? "Preview size" : /color|colour/i.test(axis) ? "Preview color" : "Preview " + axis}</span>
                      <select value={selectedAttributes[axis] || ""}
                        onChange={(event) => chooseVariantOption(axis, event.target.value)}>
                        {variantAxisValues(detail.variants, axis).map((value) => (
                          <option key={value} value={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                  {!optionAxes.length && (
                    <label>
                      <span>Preview variant</span>
                      <select value={variantId} onChange={(event) => setVariantId(event.target.value)}>
                        {detail.variants.map((candidate) => (
                          <option key={catalogVariantId(candidate)} value={catalogVariantId(candidate)}>
                            {candidate.variant_title || candidate.name || "Default"}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <p className="ps-editing-summary">
                  <strong>Editing: {variant?.variant_title || variant?.name || Object.values(selectedAttributes).join(" / ") || "Default"}</strong>
                  <span>{selectedVariantSet.has(variantId) ? "Included for sale" : "Preview only · not included for sale"}</span>
                </p>
              </section>
              <div className="ps-print-details" title="Provider print area dimensions">
                <span>{printSizeLabel(location)}</span>
                <span>{location?.dpi ? `Supplier target: ${location.dpi} DPI` : "Supplier target DPI: unavailable"}</span>
              </div>
              <button type="button" className="ps-button ps-wide" onClick={() => { setTab("upload"); setPanelOpen(true); }}>
                <StudioIcon name="upload" /> Add your artwork
              </button>
              {manageVariants && (
                <div className="ps-variant-overlay" onMouseDown={(event) => {
                  if (event.currentTarget === event.target) setManageVariants(false);
                }}>
                  <section className="ps-variant-dialog" ref={variantDialogRef} role="dialog" aria-modal="true"
                    aria-labelledby="ps-variant-dialog-title">
                    <header className="ps-variant-dialog-heading">
                      <div>
                        <h3 id="ps-variant-dialog-title">Manage all variants</h3>
                        <p>{selectedVariantIds.length} of {catalogVariantIds.length} valid combinations included</p>
                      </div>
                      <button type="button" aria-label="Close variant manager" onClick={() => setManageVariants(false)}>×</button>
                    </header>
                    <div className="ps-variant-dialog-actions">
                      <button type="button" onClick={() => setSelectedVariantIds(catalogVariantIds)}>Select all</button>
                      <button type="button" onClick={() => setSelectedVariantIds([])}>Clear</button>
                    </div>
                    <div className="ps-variant-dialog-list">
                      {detail.variants.map((candidate) => {
                        const id = catalogVariantId(candidate);
                        return (
                          <label key={id} className="ps-variant-row">
                            <input type="checkbox" checked={selectedVariantSet.has(id)}
                              onChange={(event) => toggleSellingVariant(id, event.target.checked)} />
                            <span>
                              <strong>{candidate.variant_title || candidate.name || Object.values(variantAttributes(candidate)).join(" / ") || "Default variant"}</strong>
                              {candidate.sku && <small>{candidate.sku}</small>}
                            </span>
                            {id === variantId && <em>Previewing</em>}
                          </label>
                        );
                      })}
                    </div>
                    <footer className="ps-variant-dialog-footer">
                      <span>{selectedVariantIds.length} selected</span>
                      <button type="button" className="ps-button ps-primary" onClick={() => setManageVariants(false)}>Done</button>
                    </footer>
                  </section>
                </div>
              )}
            </div>
          )}
          {(tab === "upload" || tab === "designs") && (
            <div className="ps-asset-rail">
              {tab === "upload" && <>
              <button type="button" className="ps-upload-zone" disabled={Boolean(busy)}
                onClick={() => fileInput.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); if (!busy) void upload(event.dataTransfer.files[0]); }}>
                <StudioIcon name="upload" size={21} />
                <strong>{busy === "upload" ? "Uploading…" : "Choose files"}</strong>
                <small>or drop artwork here</small>
              </button>
              <input ref={fileInput} type="file" hidden accept=".png,.jpg,.jpeg,.webp,.svg,.pdf"
                onChange={(event) => void upload(event.target.files?.[0])} />
              </>}
              {tab === "designs" && (
                <div className="ps-designs-controls">
                  <label className="ps-asset-search">
                    <StudioIcon name="search" size={15} />
                    <input type="search" value={mediaSearch}
                      onChange={(event) => setMediaSearch(event.target.value)}
                      placeholder="Search designs and logos" aria-label="Search designs" />
                  </label>
                  <div className="ps-designs-toolbar">
                    <strong>Design library</strong>
                    <button type="button" className="ps-designs-create"
                      onClick={() => setCollectionEditorOpen((value) => !value)}
                      aria-expanded={collectionEditorOpen}>+ Collection</button>
                  </div>
                  {collectionEditorOpen && (
                    <form className="ps-collection-create" onSubmit={(event) => {
                      event.preventDefault(); void createDesignCollection();
                    }}>
                      <input value={collectionName} maxLength={120} autoFocus
                        onChange={(event) => setCollectionName(event.target.value)}
                        aria-label="Collection name" placeholder="Collection name" />
                      <button type="submit" disabled={Boolean(busy) || !collectionName.trim()}>Create</button>
                      <button type="button" onClick={() => setCollectionEditorOpen(false)}
                        aria-label="Cancel collection creation">×</button>
                    </form>
                  )}
                  <div className="ps-designs-tabs" role="group" aria-label="Design library view">
                    <button type="button" className={designView === "mine" ? "is-active" : ""}
                      aria-pressed={designView === "mine"} onClick={() => setDesignView("mine")}>Design library</button>
                    <button type="button" className={designView === "shared" ? "is-active" : ""}
                      aria-pressed={designView === "shared"} onClick={() => setDesignView("shared")}>Shared with me</button>
                  </div>
                </div>
              )}
              <div className="ps-asset-rail__heading">
                <strong>{tab === "designs" ? "Collections" : "Artwork"}</strong>
                <a href="/admin/media" title="Organize media albums" aria-label="Organize media albums">Manage</a>
              </div>
              <select className="ps-asset-album" value={albumId} aria-label="Artwork album"
                onChange={(event) => { setAlbumId(Number(event.target.value)); setMediaPage(1); setMedia([]); }}>
                <option value={0}>{tab === "designs" ? "All designs" : "All artwork"}</option>
                {albums.map((album) => (
                  <option key={album.id} value={album.id}>{album.name} ({album.asset_count ?? 0})</option>
                ))}
              </select>
              {tab === "designs" && designView === "mine" && (
                <div className="ps-designs-add">
                  <select value={targetAlbumId} aria-label="Destination collection"
                    onChange={(event) => setTargetAlbumId(Number(event.target.value))}>
                    <option value={0}>Choose collection…</option>
                    {albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
                  </select>
                  <button type="button" disabled={!asset || !targetAlbumId || Boolean(busy)}
                    onClick={() => void addSelectedToCollection()}>Add selected</button>
                </div>
              )}
              {tab === "designs" && designView === "mine" && asset && (
                <form className="ps-designs-rename" onSubmit={(event) => {
                  event.preventDefault(); void renameSelectedDesign();
                }}>
                  <label htmlFor="ps-design-rename-input">Selected design name</label>
                  <div>
                    <input id="ps-design-rename-input" value={designName}
                      onChange={(event) => setDesignName(event.target.value)}
                      placeholder="Name this design" maxLength={180} />
                    <button type="submit" disabled={Boolean(busy) || !designName.trim()}>Rename</button>
                  </div>
                </form>
              )}
              {tab === "designs" && designView === "shared" && (
                <p className="ps-asset-status" role="status">Individual design sharing requires member-specific collection permissions. Collections already organize the account's existing media library; sharing grants are not enabled yet.</p>
              )}
              {(tab === "upload" || designView === "mine") && <>
              <div className="ps-asset-scope" role="group" aria-label="Artwork source">
                {([["studio", "Studio artwork"], ["library", "Whole library"]] as const).map(([value, label]) => (
                  <button type="button" key={value} className={artworkScope === value ? "is-active" : ""}
                    aria-pressed={artworkScope === value}
                    onClick={() => { setArtworkScope(value); setMediaPage(1); setMedia([]); }}>
                    {label}
                  </button>
                ))}
              </div>
              {tab === "upload" && <label className="ps-asset-search">
                <StudioIcon name="search" size={15} />
                <input type="search" value={mediaSearch} onChange={(event) => setMediaSearch(event.target.value)}
                  placeholder="Find artwork" aria-label="Search media library" />
              </label>}
              {busy === "library" && <p className="ps-asset-status" role="status">Loading artwork…</p>}
              <div className="ps-media-grid">
                {filteredMedia.map((item) => (
                  <button type="button" key={item.id} title={item.filename}
                    aria-label={`Place ${item.filename}`}
                    aria-pressed={asset?.id === item.id}
                    onClick={() => choose(item)}
                    className={asset?.id === item.id ? "is-active" : ""}>
                    <img src={item.url} alt="" loading="lazy" />
                    <span>{item.filename}</span>
                  </button>
                ))}
              </div>
              {!busy && filteredMedia.length === 0 && (
                <p className="ps-asset-status">{mediaSearch ? "No matching artwork." :
                  albumId ? "This album has no artwork yet." :
                  artworkScope === "studio" ? "No studio artwork yet. Upload a file, or switch to Whole library." :
                  "Choose or upload your first artwork."}</p>
              )}
              {mediaHasMore && (
                <button type="button" className="ps-button ps-wide"
                  disabled={busy === "library"} onClick={() => setMediaPage((page) => page + 1)}>
                  Load more artwork
                </button>
              )}
              </>}
            </div>
          )}
          {tab === "layers" && (
            <>
              {asset ? (
                <>
                  <div className="ps-layer">
                    <img src={asset.url} alt="" />
                    <strong>{asset.filename}</strong>
                    <input
                      type="checkbox"
                      checked={showArtwork}
                      onChange={(e) => setShowArtwork(e.target.checked)}
                      aria-label="Show artwork layer"
                    />
                  </div>
                  <label className="ps-field">
                    Size <span>{scale}%</span>
                    <input
                      type="range"
                      min="5"
                      max="150"
                      value={scale}
                      onChange={(e) => setScale(Number(e.target.value))}
                    />
                  </label>
                  <label className="ps-field">
                    Horizontal position
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={x}
                      onChange={(e) => setX(Number(e.target.value))}
                    />
                  </label>
                  <label className="ps-field">
                    Vertical position
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={y}
                      onChange={(e) => setY(Number(e.target.value))}
                    />
                  </label>
                  <label className="ps-field">
                    Rotation <span>{rotation}°</span>
                    <input
                      type="range"
                      min="-180"
                      max="180"
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                    />
                  </label>
                  <label className="ps-check">
                    <input type="checkbox" checked={flipY} onChange={(event) => setFlipY(event.target.checked)} />
                    Flip vertically
                  </label>
                  <label className="ps-check">
                    <input type="checkbox" checked={guides} onChange={(event) => setGuides(event.target.checked)} />
                    Show grid
                  </label>
                  <label className="ps-check">
                    <input type="checkbox" checked={snapEnabled} onChange={(event) => setSnapEnabled(event.target.checked)} />
                    Snap to grid
                  </label>
                  <button
                    className="ps-button"
                    onClick={() => {
                      setX(50);
                      setY(50);
                      setScale(80);
                      setRotation(0);
                    }}
                  >
                    Reset placement
                  </button>
                </>
              ) : (
                <div className="ps-paper-note">
                  <p>Your artwork layer will appear here.</p>
                  <button
                    className="ps-button"
                    onClick={() => setTab("upload")}
                  >
                    Choose artwork
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "tools" && (
            <div className="ps-ai-tools">
              <div className="ps-ai-tabs" role="tablist" aria-label="AI image tools">
                {([["generate", "Image generator"], ["edit", "Upscale & edit"]] as const).map(([id, label]) => (
                  <button type="button" role="tab" key={id} aria-selected={aiMode === id}
                    className={aiMode === id ? "is-active" : ""} onClick={() => setAiMode(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {aiMode === "generate" && (
                <>
                  <label className="ps-field ps-ai-prompt">
                    Prompt
                    <textarea rows={4} value={aiPrompt} maxLength={1000}
                      onChange={(event) => setAiPrompt(event.target.value)}
                      placeholder={'e.g. "Retro sunset badge, bold vector shapes, 2 colors"'} />
                    <small className="ps-ai-count">{aiPrompt.length} / 1000</small>
                  </label>
                  <details className="ps-ai-options" open>
                    <summary>More options</summary>
                    <div className="ps-chip-group" role="group" aria-label="Background">
                      <span>Background</span>
                      {(["auto", "transparent", "white"] as const).map((value) => (
                        <button type="button" key={value} className={aiBackground === value ? "is-active" : ""}
                          aria-pressed={aiBackground === value} onClick={() => setAiBackground(value)}>
                          {value === "auto" ? "Auto" : value === "transparent" ? "Transparent" : "White"}
                        </button>
                      ))}
                    </div>
                    <div className="ps-chip-group" role="group" aria-label="Size">
                      <span>Size</span>
                      {(["auto", "square", "landscape", "portrait"] as const).map((value) => (
                        <button type="button" key={value} className={aiSize === value ? "is-active" : ""}
                          aria-pressed={aiSize === value} onClick={() => setAiSize(value)}>
                          {{ auto: "Auto", square: "Square (1:1)", landscape: "Landscape (3:2)", portrait: "Portrait (2:3)" }[value]}
                        </button>
                      ))}
                    </div>
                    <div className="ps-chip-group" role="group" aria-label="Quality">
                      <span>Quality</span>
                      {(["auto", "high", "medium", "low"] as const).map((value) => (
                        <button type="button" key={value} className={aiQuality === value ? "is-active" : ""}
                          aria-pressed={aiQuality === value} onClick={() => setAiQuality(value)}>
                          {value}
                        </button>
                      ))}
                    </div>
                    <p className="ps-ai-hint">Options are sent to the selected model. Some Workers AI models require Auto settings. Final print quality is verified separately.</p>
                  </details>
                  <button type="button" className="ps-button ps-primary ps-wide"
                    disabled={!aiPrompt.trim() || Boolean(busy)} onClick={() => void generateImage()}>
                    {busy === "generate" ? "Generating…" : "Generate image"}
                  </button>
                  {generatedCandidate && (
                    <section className="ps-ai-source" aria-label="Generated artwork candidate">
                      <img src={`data:${generatedCandidate.mime};base64,${generatedCandidate.base64}`}
                        alt="Generated artwork preview; not yet applied" />
                      <div>
                        <strong>Review generated artwork</strong>
                        <small>Not added to your design. The original is unchanged.</small>
                        <div className="ps-ai-actions">
                          <button type="button" className="ps-button ps-primary"
                            disabled={Boolean(busy)} onClick={() => void acceptGeneratedCandidate()}>
                            Accept and add to design
                          </button>
                          <button type="button" className="ps-button" disabled={Boolean(busy)}
                            onClick={() => setGeneratedCandidate(null)}>Discard</button>
                        </div>
                      </div>
                    </section>
                  )}
                  <div className="ps-ai-gallery-head">
                    <strong>Your AI images</strong>
                    <span className="ps-count">{aiImages.length}</span>
                  </div>
                  {aiImages.length ? (
                    <div className="ps-media-grid ps-ai-gallery">
                      {aiImages.map((item) => (
                        <button type="button" key={item.id} title={item.filename}
                          aria-label={`Place ${item.filename}`} aria-pressed={asset?.id === item.id}
                          className={asset?.id === item.id ? "is-active" : ""} onClick={() => choose(item)}>
                          <img src={item.url} alt="" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="ps-asset-status">Generated images appear here.</p>
                  )}
                </>
              )}
              {aiMode === "edit" && (
                <>
                  <div className="ps-ai-source">
                    {asset ? (
                      <>
                        <img src={asset.url} alt="" />
                        <div><strong>{asset.filename}</strong><small>Selected artwork</small></div>
                      </>
                    ) : (
                      <p className="ps-asset-status">Choose artwork to edit.</p>
                    )}
                    <button type="button" className="ps-button" onClick={() => openTab("upload")}>
                      {asset ? "Change" : "Choose artwork"}
                    </button>
                  </div>
                  <div className="ps-ai-actions">
                    <strong>Edit</strong>
                    <button type="button" className="ps-button ps-wide"
                      disabled={!asset || Boolean(busy) || !subjectRemovalAvailable}
                      title={subjectRemovalAvailable ? "Remove the background and save a cutout copy" : "Background removal is not configured for this install"}
                      onClick={() => void removeBackgroundAI()}>
                      {busy === "remove-background" ? "Removing background…" : "Remove background"}
                    </button>
                    <label className="ps-check">
                      <input type="checkbox" checked={removeFlatBackground}
                        onChange={(event) => setRemoveFlatBackground(event.target.checked)} />
                      Remove connected flat background
                    </label>
                    <label className="ps-check">
                      <input type="checkbox" checked={trimTransparent}
                        onChange={(event) => setTrimTransparent(event.target.checked)} />
                      Trim transparent edges
                    </label>
                    <button type="button" className="ps-button ps-wide"
                      disabled={!asset || Boolean(busy)}
                      onClick={() => void reviseSelectedArtwork("resample")}>
                      {busy === "resample" ? "Resampling…" : "Resize to 2× pixels"}
                    </button>
                    <small>Resampling does not recover missing image detail or certify print readiness.</small>
                    <label className="ps-field">
                      AI edit model
                      <select value={editModel} onChange={(event) => setEditModel(event.target.value)}
                        disabled={!editableModels.length || Boolean(busy)}>
                        {!editableModels.length && <option value="">No enabled image-edit models</option>}
                        {editableModels.map((model) => (
                          <option key={model.id} value={model.id}>{model.name || model.id}</option>
                        ))}
                      </select>
                    </label>
                    <label className="ps-field">
                      Edit with a prompt
                      <textarea rows={3} value={editPrompt} maxLength={1000}
                        onChange={(event) => setEditPrompt(event.target.value)}
                        placeholder="Describe exactly what should change in the selected artwork" />
                    </label>
                    <button type="button" className="ps-button ps-wide"
                      disabled={!asset || !editPrompt.trim() || !editModel || Boolean(busy)}
                      onClick={() => void reviseSelectedArtwork("ai-edit")}>
                      {busy === "ai-edit" ? "Editing…" : "Generate edited version"}
                    </button>
                    {revisionCandidate && (
                      <section className="ps-ai-source" aria-label="Artwork revision review">
                        <img src={revisionCandidate.url} alt="Proposed new artwork version" />
                        <div>
                          <strong>New version · not selected</strong>
                          <small>Saved separately in Media Library. Original remains unchanged.</small>
                          <div className="ps-ai-actions">
                            <button type="button" className="ps-button ps-primary"
                              disabled={Boolean(busy)} onClick={() => choose(revisionCandidate)}>
                              Use this version
                            </button>
                            <button type="button" className="ps-button" disabled={Boolean(busy)}
                              onClick={() => setRevisionCandidate(null)}>
                              Keep current version
                            </button>
                          </div>
                        </div>
                      </section>
                    )}
                  </div>
                  <button type="button" className="ps-button ps-wide"
                    disabled={!asset || preparedIsCurrent || Boolean(busy)} onClick={() => void prepareArtwork()}>
                    {busy === "prepare" ? "Preparing…" : preparedIsCurrent ? "Print file ready" : "Prepare for print"}
                  </button>
                  <button type="button" className="ps-button ps-wide"
                    disabled={!preparedIsCurrent || Boolean(busy)}
                    onClick={() => void renderSupplierMockups()}>
                    {busy === "render-batch" ? "Submitting supplier renders…" : "Render Completeful colorways"}
                  </button>
                  <small>Uses exact supplier color and print-area mockups. Missing color matches are not fabricated.</small>
                  {supplierMockups.length > 0 && (
                    <section className="ps-ai-gallery" aria-label="Supplier mockup results">
                      <div className="ps-ai-gallery-head">
                        <strong>Completeful renders</strong>
                        <span className="ps-count">{supplierMockups.length}</span>
                      </div>
                      <div className="ps-media-grid">
                        {supplierMockups.map((mockup) => (
                          <figure key={mockup.mockup_id + mockup.variant_color + mockup.print_location_id}>
                            {mockup.asset?.url
                              ? <img src={mockup.asset.url} alt={`Completeful ${mockup.variant_color} ${mockup.print_location_id} mockup`} />
                              : <div className="ps-asset-status" role="status">{mockup.status}</div>}
                            <figcaption>{mockup.variant_color} · {mockup.print_location_id}</figcaption>
                          </figure>
                        ))}
                      </div>
                      {supplierMockups.some((mockup) => mockup.render_id && !mockup.asset && mockup.status !== "failed") && (
                        <button type="button" className="ps-button"
                          disabled={Boolean(busy)} onClick={() => void refreshSupplierMockups()}>
                          {busy === "refresh-mockups" ? "Checking…" : "Refresh supplier renders"}
                        </button>
                      )}
                    </section>
                  )}
                  {asset && preparedAsset && preparedIsCurrent && (
                    <div className="ps-derivative-compare" aria-label="Original and prepared artwork comparison">
                      <figure>
                        <img src={asset.url} alt="Original artwork" />
                        <figcaption>Original · unchanged</figcaption>
                      </figure>
                      <figure>
                        <img src={preparedAsset.url} alt="Prepared artwork derivative" />
                        <figcaption>Prepared derivative</figcaption>
                      </figure>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </aside>
        <div className="ps-stage-column" ref={stage}>
          <div className="ps-stage-toolbar">
            <h1 className="ps-stage-title" title={detail.product.name}>{detail.product.name}</h1>
            <div className="ps-stage-toolbar__controls">
              {enabledLocations.length > 1 && (
                <div className="ps-print-side-toggle" role="group" aria-label="Print location">
                  {enabledLocations.map((candidate) => (
                    <button type="button" key={candidate.print_location_id}
                      className={locationId === candidate.print_location_id ? "is-active" : ""}
                      aria-pressed={locationId === candidate.print_location_id}
                      onClick={() => choosePrintLocation(candidate.print_location_id)}>
                      {candidate.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="ps-canvas-controls">
                <button type="button" onClick={() => setCanvasZoom(100)}>Fit</button>
                <label><span className="ps-sr-only">Canvas zoom</span>
                  <input type="range" min="50" max="160" step="5" value={canvasZoom}
                    aria-label="Canvas zoom" onChange={(event) => setCanvasZoom(Number(event.target.value))} />
                </label>
                <span>{canvasZoom}%</span>
              </div>
            </div>
          </div>
          <div className="ps-stage" data-agentsam-resource="product-design-stage">
            <div className="ps-product-design-preview" style={{
              transform: `scale(${canvasZoom / 100})`,
              width: `min(100%, 880px, calc((100dvh - 350px) * ${artboardAspectRatio}))`,
            }}>
              <div className="ps-product-design-image">
                <div className="ps-design-guide" style={{ aspectRatio: artboardAspectRatio }}
                  aria-label={`${location?.name || "Selected"} garment design view`}>
                  {designImage ? (
                    <ProductImage
                      key={`${variantId}:${locationId}:${designImage}`}
                      className={"ps-design-product-image" + (hasProviderPlacementFrame ? " is-geometry-mapped" : "")}
                      sources={designImageSources}
                      lazy={false}
                      alt={`${location?.name || "Selected"} provider catalog reference`}
                    />
                  ) : (
                    <div className="ps-unverified-garment" role="status">
                      <strong>{location?.name || "Print"} artwork placement</strong>
                      <span>Position your design inside the supplier print area. A garment photo will appear when an exact-side render is available.</span>
                    </div>
                  )}
                  <div className={"ps-design-print-area" + (guides ? " is-gridded" : "")} style={{ ...placementFrameStyle, aspectRatio: ratio }}
                    onPointerDown={(event) => {
                      const target = event.target as HTMLElement;
                      const cornerHandle = target.closest(".ps-selection-handle");
                      if (cornerHandle) {
                        const corner = cornerHandle.classList.contains("ps-selection-handle--tl") ? "tl"
                          : cornerHandle.classList.contains("ps-selection-handle--tr") ? "tr"
                          : cornerHandle.classList.contains("ps-selection-handle--bl") ? "bl" : "br";
                        startDrag(event, "resize", corner);
                      }
                      else if (target.closest(".ps-artwork-layer")) startDrag(event, "move");
                      else setArtworkSelected(false);
                    }}
                    onPointerMove={updateDrag}
                    onPointerUp={() => { dragRef.current = null; }}
                    onPointerCancel={() => { dragRef.current = null; }}
                  >
                    {guides && <>
                      <span className="ps-design-crosshair-x" aria-hidden="true" />
                      <span className="ps-design-crosshair-y" aria-hidden="true" />
                    </>}
                    {asset && showArtwork ? (
                      <img
                        className={"ps-artwork-layer ps-artwork-layer--interactive" + (artworkSelected ? " is-selected" : "")}
                        src={artworkPreviewUrl}
                        alt="Selected artwork — use arrow keys to nudge the placement"
                        draggable={false}
                        tabIndex={0}
                        onKeyDown={(event) => {
                          const step = event.shiftKey ? 5 : 1;
                          if (event.key === "ArrowLeft") setX((value) => Math.max(0, value - step));
                          else if (event.key === "ArrowRight") setX((value) => Math.min(100, value + step));
                          else if (event.key === "ArrowUp") setY((value) => Math.max(0, value - step));
                          else if (event.key === "ArrowDown") setY((value) => Math.min(100, value + step));
                          else return;
                          event.preventDefault();
                        }}
                        style={{
                          width: `${scale}%`,
                          left: `${x}%`,
                          top: `${y}%`,
                          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
                        }}
                      />
                    ) : (
                      <button className="ps-placement-empty" type="button"
                        aria-label="Add artwork" title="Add artwork" onClick={() => openTab("upload")} />
                    )}
                    {asset && showArtwork && artworkSelected && (
                      <div className="ps-selection-frame" aria-hidden="true" style={{
                        left: x + "%", top: y + "%", width: scale + "%",
                        aspectRatio: dimensions
                          ? (artworkCrop?.width ?? dimensions.width) + "/" + (artworkCrop?.height ?? dimensions.height) : "1",
                        transform: "translate(-50%, -50%) rotate(" + rotation + "deg)",
                      }}>
                        <span className="ps-selection-handle ps-selection-handle--tl" />
                        <span className="ps-selection-handle ps-selection-handle--tr" />
                        <span className="ps-selection-handle ps-selection-handle--bl" />
                        <span className="ps-selection-handle ps-selection-handle--br" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="ps-product-design-caption">
                <strong>{variant?.variant_title || variant?.name || detail.product.name}</strong>
                <span>
                  {asset
                    ? `${asset.filename} · ${location?.name || "choose a print area"}`
                    : `No artwork selected · ${location?.name || "choose a print area"}`}
                </span>
              </div>
            </div>
            <div className="ps-mini-map">
              <div className="ps-mini-head">
                <strong>Product preview</strong>
                <button type="button" onClick={() => setMiniMapOpen((value) => !value)} aria-expanded={miniMapOpen} aria-label={miniMapOpen ? "Hide product preview" : "Show product preview"}>{miniMapOpen ? "Hide" : "Show"}</button>
              </div>
              {miniMapOpen && (
                <>
                  <div className="ps-mini-image">
                    {currentRenderUrl || designImage
                      ? <ProductImage key={`${variantId}:${locationId}`} sources={currentRenderUrl ? [currentRenderUrl] : designImageSources} alt={`${location?.name || "Selected"} garment variant: ${variant?.variant_title || variant?.name || detail.product.name}`} />
                      : <div className="ps-mini-unverified">{location?.name || "Selected"} print placement · garment image pending</div>}
                    {!currentRenderUrl && asset && showArtwork && (
                      <div className="ps-mini-placement" style={placementFrameStyle}>
                        <img src={artworkPreviewUrl} alt="" style={{ width: `${scale}%`, left: `${x}%`, top: `${y}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` }} />
                      </div>
                    )}
                    <button type="button" className="ps-mini-expand-hitarea" aria-label="Enlarge product preview" title="Enlarge product preview"
                      onClick={() => setFullPreviewOpen(true)} />
                  </div>
                  <small>{currentRenderUrl ? "Completeful render" : designImage
                    ? hasDistinctProviderSideArtboard ? `${location?.name || "Selected"} · supplier print-area reference` : location?.name || "Selected view"
                    : `${location?.name || "Selected"} · preview unavailable`}
                    {" · "}{variant?.variant_title || variant?.name || "Selected color"}</small>
                </>
              )}
            </div>
          </div>
          {colorways.length > 1 && colorAxis && (
            <div className="ps-colorway-rail" role="group" aria-label="Preview color">
              {colorways.map(({ value, sources }) => (
                <button type="button" key={value}
                  className={"ps-colorway" + (selectedAttributes[colorAxis] === value ? " is-active" : "")}
                  aria-pressed={selectedAttributes[colorAxis] === value}
                  aria-label={`Preview ${value}`} title={value}
                  onClick={() => chooseVariantOption(colorAxis, value)}>
                  <span className="ps-colorway__thumb" style={{ aspectRatio: artboardAspectRatio }}>
                    {sources.length
                      ? <ProductImage sources={sources} alt="" />
                      : <span className="ps-colorway__empty" aria-hidden="true" />}
                    {sources.length > 0 && asset && showArtwork && (
                      <span className="ps-mini-placement" style={placementFrameStyle}>
                        <img src={artworkPreviewUrl} alt="" style={{
                          width: `${scale}%`, left: `${x}%`, top: `${y}%`,
                          transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`,
                        }} />
                      </span>
                    )}
                  </span>
                  <span className="ps-colorway__label">{value}</span>
                </button>
              ))}
            </div>
          )}
          {fullPreviewOpen && (
            <div className="ps-preview-overlay" onMouseDown={(event) => {
              if (event.target === event.currentTarget) setFullPreviewOpen(false);
            }}>
              <section className="ps-preview-dialog" role="dialog" aria-modal="true" aria-label="Enlarged product preview">
                <header>
                  <div>
                    <strong>Product preview · {location?.name || "Selected side"}</strong>
                    <small>{variant?.variant_title || variant?.name || detail.product.name}</small>
                  </div>
                  <button ref={fullPreviewCloseRef} type="button" aria-label="Close enlarged product preview"
                    onClick={() => setFullPreviewOpen(false)}>Close ×</button>
                </header>
                <div className="ps-preview-enlarged-image">
                  {currentRenderUrl || designImage
                    ? <ProductImage key={`expanded:${variantId}:${locationId}`} sources={currentRenderUrl ? [currentRenderUrl] : designImageSources}
                        alt={`${variant?.variant_title || variant?.name || detail.product.name}, ${location?.name || "selected view"}`} lazy={false} />
                    : <div className="ps-mini-unverified">No verified photo is available for this side or variant.</div>}
                  {!currentRenderUrl && designImage && asset && showArtwork && (
                    <div className="ps-mini-placement" style={placementFrameStyle}>
                      <img src={artworkPreviewUrl} alt="" style={{ width: `${scale}%`, left: `${x}%`, top: `${y}%`,
                        transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})` }} />
                    </div>
                  )}
                </div>
                <footer>{currentRenderUrl ? "Completeful provider render" : designImage ? "Supplier garment reference with local artwork placement — not a final render" : "Preview unavailable"}</footer>
              </section>
            </div>
          )}
          {reply && (
            <details open className="ps-ai-reply">
              <summary>Creative direction</summary>
              <p>{reply}</p>
            </details>
          )}

        </div>
      </div>
    </div>
  );
}
