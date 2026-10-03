import { useEffect, useRef, useState } from "react";
import { adminFetch } from "../../lib/api";
import StudioIcon from "./StudioIcon";
import ProductImage from "./ProductImage";
import {
  catalogProductId,
  catalogVariantId,
  printPixelSize,
  printSizeLabel,
  productImage,
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

function alphaBounds(pixels: Uint8ClampedArray, width: number, height: number) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4 + 3] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, width, height };
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

type StudioDraft = {
  id: string;
  product_id: number;
  state: "draft" | "prepared" | "rendering" | "rendered" | "created" | "published" | "error";
  selected_variant_ids: string[];
  print_location_ids: string[];
  placement?: { x?: number; y?: number; scale?: number; rotation?: number; notes?: string };
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
  onBack,
}: {
  detail: ProductDetail;
  initialVariantId?: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState("options");
  const [media, setMedia] = useState<MediaAsset[]>([]);
  const [asset, setAsset] = useState<MediaAsset | null>(null);
  const [preparedAsset, setPreparedAsset] = useState<MediaAsset | null>(null);
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [draft, setDraft] = useState<StudioDraft | null>(null);
  const [title, setTitle] = useState(detail.product.default_title || detail.product.name);
  const [description, setDescription] = useState(detail.product.default_description || "");
  const [retailPrice, setRetailPrice] = useState("");
  const [providerRenderUrl, setProviderRenderUrl] = useState<string | null>(null);
  const [trimTransparent, setTrimTransparent] = useState(false);
  const [removeFlatBackground, setRemoveFlatBackground] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [locationId, setLocationId] = useState(
    detail.print_locations.find((l) => l.enabled)?.print_location_id || "",
  );
  const initialVariant =
    detail.variants.find(
      (candidate) => catalogVariantId(candidate) === initialVariantId,
    ) || detail.variants[0];
  const [variantId, setVariantId] = useState(
    catalogVariantId(initialVariant) || "",
  );
  const [scale, setScale] = useState(80);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [rotation, setRotation] = useState(0);
  const [showArtwork, setShowArtwork] = useState(true);
  const [guides, setGuides] = useState(true);
  const [dimensions, setDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [notes, setNotes] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const panel = useRef<HTMLElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  function openTab(next: string) {
    setTab(next);
    if (window.matchMedia("(max-width: 760px)").matches)
      requestAnimationFrame(() =>
        panel.current?.scrollIntoView({ block: "start" }),
      );
  }
  const location = detail.print_locations.find(
    (l) => l.print_location_id === locationId,
  );
  const variant =
    detail.variants.find((v) => catalogVariantId(v) === variantId) ||
    detail.variants[0];
  const selectedAttributes = variantAttributes(variant);
  const optionAxes = variantAxes(detail.variants);
  const baseImage =
    variantImage(variant) ||
    productImage(detail.product) ||
    detail.images[0]?.url ||
    detail.mockups.find((mockup) => mockup.active && mockup.preview_url)
      ?.preview_url;
  const catalogId = catalogProductId(detail.product);

  function chooseVariantOption(axis: string, value: string) {
    const next = selectVariantForAxis(detail.variants, variant, axis, value);
    if (next) setVariantId(catalogVariantId(next));
  }
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
    const controller = new AbortController();
    setBusy("restore");
    adminFetch<{ draft: StudioDraft | null }>(
      `/api/admin/product-studio/drafts?catalog_product_id=${encodeURIComponent(catalogId)}`,
      { signal: controller.signal },
    )
      .then(async ({ draft: saved }) => {
        if (!saved || controller.signal.aborted) return;
        setDraft(saved);
        setTitle(saved.title || detail.product.default_title || detail.product.name);
        setDescription(saved.description || "");
        setRetailPrice(saved.retail_price_cents ? (saved.retail_price_cents / 100).toFixed(2) : "");
        if (saved.selected_variant_ids?.[0]) setVariantId(saved.selected_variant_ids[0]);
        if (saved.print_location_ids?.[0]) setLocationId(saved.print_location_ids[0]);
        if (saved.placement) {
          setX(Number(saved.placement.x ?? 50));
          setY(Number(saved.placement.y ?? 50));
          setScale(Number(saved.placement.scale ?? 80));
          setRotation(Number(saved.placement.rotation ?? 0));
          setNotes(String(saved.placement.notes || ""));
        }
        setProviderRenderUrl(saved.completeful_render_url || null);
        if (saved.original_media_asset_id || saved.prepared_media_asset_id || saved.preview_media_asset_id) {
          const library = await adminFetch<{ assets: MediaAsset[] }>("/api/admin/media?view=all", {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          const original = library.assets.find((item) => item.id === saved.original_media_asset_id) || null;
          const prepared = library.assets.find((item) => item.id === saved.prepared_media_asset_id) || null;
          const preview = library.assets.find((item) => item.id === saved.preview_media_asset_id) || null;
          if (original) setAsset(original);
          if (prepared) setPreparedAsset(prepared);
          if (preview) setPreviewAsset(preview);
        }
        setNotice(`Restored ${saved.state} product draft.`);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy("");
      });
    return () => controller.abort();
  }, [catalogId, detail.product.default_title, detail.product.name]);
  useEffect(() => {
    if (tab !== "designs") return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) {
        setBusy("library");
        setError("");
      }
    });
    adminFetch<{ assets: MediaAsset[] }>("/api/admin/media?view=all", {
      signal: controller.signal,
    })
      .then((d) => {
        if (!controller.signal.aborted)
          setMedia(
            d.assets.filter((a) => a.content_type?.startsWith("image/")),
          );
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy("");
      });
    return () => controller.abort();
  }, [tab]);
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
  function choose(a: MediaAsset) {
    setDimensions(null);
    setAsset(a);
    setPreparedAsset(null);
    setPreviewAsset(null);
    setProviderRenderUrl(null);
    setShowArtwork(true);
    setNotice("Artwork added. Review its placement on the selected product and print area.");
    if (window.matchMedia("(max-width: 760px)").matches)
      requestAnimationFrame(() =>
        stage.current?.scrollIntoView({ block: "start" }),
      );
  }
  async function uploadMediaFile(file: File, prefix: string) {
    const form = new FormData();
    form.append("files", file);
    form.append("folder", "images");
    form.append("prefix", prefix);
    const response = await fetch("/api/admin/media", { method: "POST", body: form });
    if (response.status === 401) {
      window.location.href = "/admin/login";
      throw new Error("Sign in again to continue");
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Upload failed");
    return result.assets?.[0] as MediaAsset | undefined;
  }

  async function upload(file?: File) {
    if (!file) return;
    if (!/\.(png|jpe?g|webp|svg|pdf)$/i.test(file.name)) {
      setError("Choose a PNG, JPG, WebP, SVG, or PDF file.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("Choose a file under the studio’s 20 MB upload limit.");
      return;
    }
    setBusy("upload");
    setError("");
    try {
      const uploaded = await uploadMediaFile(file, "studio/artwork");
      if (file.type === "application/pdf") {
        setNotice(
          "Original PDF saved to the media library. Add a PNG preview to position it in the Studio; the PDF remains untouched.",
        );
      } else if (uploaded) {
        choose(uploaded);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function askAI(generate: boolean) {
    if (!prompt.trim() || busy) return;
    setBusy(generate ? "generate" : "ideas");
    setError("");
    try {
      const creative = generate
        ? {
            task_type: "image_generation",
            lane: "image",
            mode: "image",
            workflow_key: "fnf_creative_studio",
          }
        : {};
      const result = await adminFetch<{
        reply: string;
        conversation_id?: string;
        ai?: { image_base64?: string; mime_type?: string };
      }>("/api/admin/agentsam/chat", {
        method: "POST",
        body: JSON.stringify({
          message: `${generate ? "Create standalone artwork" : "Brainstorm three concise visual directions"} for ${detail.product.name}. ${prompt}`,
          conversation_id: conversationId,
          ...creative,
          context: { page: "/admin/products/create", ...creative },
        }),
      });
      setReply(result.reply);
      setConversationId(result.conversation_id);
      if (result.ai?.image_base64) {
        const mime = result.ai.mime_type || "image/png";
        const bytes = Uint8Array.from(atob(result.ai.image_base64), (c) =>
          c.charCodeAt(0),
        );
        await upload(
          new File(
            [bytes],
            `studio-artwork-${Date.now()}.${mime === "image/jpeg" ? "jpg" : "png"}`,
            { type: mime },
          ),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Creative request failed");
    } finally {
      setBusy("");
    }
  }
  function currentRetailPriceCents() {
    const value = Number(retailPrice);
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
  }

  async function saveDraft(nextPrepared: MediaAsset | null = preparedAsset, nextPreview: MediaAsset | null = previewAsset) {
    if (!variantId || !locationId) {
      setError("Choose a product option and print area before saving.");
      return null;
    }
    setBusy("save");
    setError("");
    try {
      const result = await adminFetch<{ draft: StudioDraft }>("/api/admin/product-studio/drafts", {
        method: "POST",
        body: JSON.stringify({
          id: draft?.id,
          product_id: draft?.product_id,
          catalog_product_id: catalogId,
          selected_variant_ids: [variantId],
          print_location_ids: [locationId],
          original_media_asset_id: asset?.id || null,
          prepared_media_asset_id: nextPrepared?.id || null,
          preview_media_asset_id: nextPreview?.id || null,
          placement: { x, y, scale, rotation },
          notes,
          title: title.trim() || detail.product.name,
          description: description.trim() || null,
          retail_price_cents: currentRetailPriceCents(),
        }),
      });
      setDraft(result.draft);
      setProviderRenderUrl(result.draft.completeful_render_url || null);
      setNotice(`Saved product draft · ${result.draft.state}.`);
      return result.draft;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save product draft");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function buildPreparedArtworkBlob() {
    if (!asset || !showArtwork || !printPixels) {
      throw new Error("Add artwork and select a print area with known pixel dimensions first.");
    }
    const { width, height } = printPixels;
    if (width * height > 32000000) {
      throw new Error("This print area is too large for safe browser preparation.");
    }
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = asset.url;
    await image.decode();
    const source = document.createElement("canvas");
    source.width = image.naturalWidth;
    source.height = image.naturalHeight;
    const sourceContext = source.getContext("2d", { willReadFrequently: true });
    if (!sourceContext) throw new Error("Artwork preparation is unavailable");
    sourceContext.drawImage(image, 0, 0);
    const sourcePixels = sourceContext.getImageData(0, 0, source.width, source.height);
    if (removeFlatBackground) {
      removeConnectedFlatBackground(sourcePixels.data, source.width, source.height);
      sourceContext.putImageData(sourcePixels, 0, 0);
    }
    const crop = trimTransparent
      ? alphaBounds(sourcePixels.data, source.width, source.height)
      : { x: 0, y: 0, width: source.width, height: source.height };
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas preparation is unavailable");
    const w = (width * scale) / 100;
    const h = (crop.height / crop.width) * w;
    ctx.translate((width * x) / 100, (height * y) / 100);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, -w / 2, -h / 2, w, h);
    return new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Artwork preparation failed"))),
        "image/png",
      ),
    );
  }

  async function persistPlacementPreview(prepared: MediaAsset) {
    const backgroundUrl = location?.artboard_image_url || baseImage;
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
      const filename = `placement-${catalogId.slice(0, 8)}-${locationId.slice(0, 8)}-${Date.now()}.png`;
      return (await uploadMediaFile(new File([blob], filename, { type: "image/png" }), "studio/previews")) || null;
    } catch (e) {
      console.warn("Placement preview could not be persisted", e);
      return null;
    }
  }

  async function prepareArtwork() {
    setBusy("prepare");
    setError("");
    try {
      const blob = await buildPreparedArtworkBlob();
      const filename = `prepared-${catalogId.slice(0, 8)}-${locationId.slice(0, 8)}-${Date.now()}.png`;
      const uploaded = await uploadMediaFile(new File([blob], filename, { type: "image/png" }), "studio/prepared");
      if (!uploaded) throw new Error("Prepared artwork was not saved");
      setPreparedAsset(uploaded);
      setProviderRenderUrl(null);
      const preview = await persistPlacementPreview(uploaded);
      if (preview) setPreviewAsset(preview);
      const saved = await saveDraft(uploaded, preview || previewAsset);
      if (saved) {
        setNotice(
          `Prepared a ${printPixels?.width} × ${printPixels?.height} transparent production PNG. Original artwork is unchanged.`,
        );
      }
      return uploaded;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Artwork preparation failed");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function renderMockup() {
    let saved = await saveDraft();
    if (!saved) return;
    if (!preparedAsset) {
      setError("Prepare the artwork first so Completeful receives the production raster, not a browser-only placement.");
      return;
    }
    setBusy("render");
    setError("");
    try {
      const result = await adminFetch<{
        mode: "provider_render" | "placement_preview";
        provider_render: boolean;
        status?: string;
        render_id?: string;
        render_url?: string | null;
        message?: string;
        draft?: StudioDraft;
      }>(`/api/admin/product-studio/drafts/${encodeURIComponent(saved.id)}/render`, { method: "POST" });
      if (result.draft) {
        saved = result.draft;
        setDraft(result.draft);
      }
      if (!result.provider_render) {
        setProviderRenderUrl(null);
        setNotice(result.message || "This product has no Completeful mockup target; showing the labeled placement preview.");
        return;
      }
      if (result.render_url) {
        setProviderRenderUrl(result.render_url);
        setNotice("Completeful rendered the selected artwork on the selected product.");
        return;
      }
      if (!result.render_id) {
        setNotice("Completeful accepted the render but did not return a render id.");
        return;
      }
      setNotice("Completeful render queued. Waiting for the provider result…");
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 1400));
        const polled = await adminFetch<{
          status: string;
          render_id: string;
          mockups?: { url: string; width: number; height: number }[];
          error?: string;
        }>(
          `/api/admin/product-studio/renders/${encodeURIComponent(result.render_id)}?draft_id=${encodeURIComponent(saved.id)}`,
        );
        if (polled.status === "succeeded") {
          const url = polled.mockups?.[0]?.url || null;
          setProviderRenderUrl(url);
          setDraft((current) =>
            current
              ? { ...current, state: "rendered", completeful_render_status: "succeeded", completeful_render_url: url }
              : current,
          );
          setNotice("Completeful mockup render ready.");
          return;
        }
        if (polled.status === "failed") throw new Error(polled.error || "Completeful mockup render failed");
      }
      setNotice("Completeful is still rendering. You can continue working and retry the render check shortly.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mockup render failed");
    } finally {
      setBusy("");
    }
  }

  async function createProduct() {
    const saved = await saveDraft();
    if (!saved) return;
    if (!preparedAsset) {
      setError("Prepare the artwork before creating the fulfillment product.");
      return;
    }
    if (currentRetailPriceCents() <= 0) {
      setError("Set a retail price above $0 before creating the product.");
      return;
    }
    setBusy("create-product");
    setError("");
    try {
      const result = await adminFetch<{
        product_id: number;
        completeful_store_product_id: string;
        mapped_variants: number;
        draft: StudioDraft;
      }>(`/api/admin/product-studio/drafts/${encodeURIComponent(saved.id)}/create-product`, { method: "POST" });
      setDraft(result.draft);
      setNotice(
        `Created Completeful + storefront draft together. ${result.mapped_variants} variant${result.mapped_variants === 1 ? "" : "s"} mapped.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Product creation failed");
    } finally {
      setBusy("");
    }
  }

  async function publishProduct() {
    if (!draft) return;
    setBusy("publish");
    setError("");
    try {
      const result = await adminFetch<{ draft: StudioDraft; product_id: number }>(
        `/api/admin/product-studio/drafts/${encodeURIComponent(draft.id)}/publish`,
        { method: "POST" },
      );
      setDraft(result.draft);
      setNotice(`Published product ${result.product_id} to the storefront.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy("");
    }
  }

  const quality =
    dimensions && printPixels
      ? dimensions.width / ((printPixels.width * scale) / 100)
      : null;
  return (
    <div className="ps-workspace" data-agentsam-resource="product-design-workspace">
      <header className="ps-workspace-header">
        <button
          className="ps-text-button"
          onClick={onBack}
          aria-label="Back to product details"
        >
          <StudioIcon name="back" />
          <span>Product details</span>
        </button>
        <div>
          <small>YOUR WORKSPACE</small>
          <h1>{detail.product.name}</h1>
        </div>
        <div className="ps-workspace-actions">
          <a className="ps-text-button" href="/admin/products/help/artwork">
            <StudioIcon name="tools" size={15} />
            <span>Artwork help</span>
          </a>
          <button className="ps-button" disabled={Boolean(busy)} onClick={() => void saveDraft()}>
            {busy === "save" ? "Saving…" : "Save draft"}
          </button>
        </div>
      </header>
      <div className="ps-workspace-body">
        <nav className="ps-toolrail" aria-label="Design tools">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "is-active" : ""}
              onClick={() => openTab(t.id)}
              aria-pressed={tab === t.id}
            >
              <StudioIcon name={t.icon} />
              <span>{t.label}</span>
            </button>
          ))}
        </nav>
        <aside className="ps-toolpanel" ref={panel}>
          <div className="ps-panel-heading">
            <span className="ps-eyebrow">MAKE IT YOURS</span>
            <h2>{tabs.find((t) => t.id === tab)?.label}</h2>
          </div>
          {tab === "options" && (
            <>
              <div className="ps-field">
                <strong>Product option</strong>
                {optionAxes.length ? (
                  <div className="ps-option-groups ps-workspace-options">
                    {optionAxes.map((axis) => (
                      <div className="ps-option-group" key={axis}>
                        <span>{axis}</span>
                        <div className="ps-option-choices">
                          {variantAxisValues(detail.variants, axis).map((value) => {
                            const previewVariant = detail.variants.find(
                              (candidate) =>
                                variantAttributes(candidate)[axis] === value,
                            );
                            const showPreview =
                              /color|finish|material|style|tone/i.test(axis);
                            return (
                              <button
                                type="button"
                                key={value}
                                className={
                                  selectedAttributes[axis] === value
                                    ? "is-active"
                                    : ""
                                }
                                onClick={() => chooseVariantOption(axis, value)}
                                aria-pressed={selectedAttributes[axis] === value}
                              >
                                {showPreview && variantImage(previewVariant) && (
                                  <ProductImage
                                    sources={[variantImage(previewVariant)]}
                                    alt=""
                                  />
                                )}
                                <span>{value}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <select
                    value={variantId}
                    onChange={(e) => setVariantId(e.target.value)}
                    aria-label="Product option"
                  >
                    {detail.variants.map((candidate) => (
                      <option
                        key={catalogVariantId(candidate)}
                        value={catalogVariantId(candidate)}
                      >
                        {candidate.variant_title || candidate.name || "Default"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {detail.variants.length > 0 && (
                <p className="ps-selected-option">
                  <strong>{variant?.variant_title || variant?.name || "Default option"}</strong>
                  {variant?.sku ? ` · ${variant.sku}` : ""}
                </p>
              )}
              <div className="ps-field">
                <strong>Print area</strong>
                <div className="ps-option-choices ps-option-choices--compact">
                  {detail.print_locations
                    .filter((candidate) => candidate.enabled)
                    .map((candidate) => (
                      <button
                        type="button"
                        key={candidate.print_location_id}
                        className={
                          locationId === candidate.print_location_id
                            ? "is-active"
                            : ""
                        }
                        onClick={() => setLocationId(candidate.print_location_id)}
                        aria-pressed={
                          locationId === candidate.print_location_id
                        }
                      >
                        <span>{candidate.name}</span>
                      </button>
                    ))}
                </div>
              </div>
              <div className="ps-paper-note">
                <StudioIcon name="tools" />
                <strong>Designed for the details.</strong>
                <p>{printSizeLabel(location)}</p>
                <small>
                  {location?.dpi || 300} DPI{" "}
                  {location?.dpi
                    ? "provider target"
                    : "recommended for raster artwork"}
                  . Keep important elements inside the safe area.
                </small>
              </div>
              <div className="ps-merch-fields">
                <label className="ps-field">
                  Storefront title
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={180} />
                </label>
                <label className="ps-field">
                  Retail price (USD)
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    inputMode="decimal"
                    value={retailPrice}
                    onChange={(e) => setRetailPrice(e.target.value)}
                    placeholder="29.00"
                  />
                </label>
                <label className="ps-field">
                  Storefront description
                  <textarea
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe the finished product…"
                  />
                </label>
              </div>
              <button
                className="ps-button ps-wide"
                onClick={() => setTab("upload")}
              >
                <StudioIcon name="upload" /> Add your artwork
              </button>
            </>
          )}
          {tab === "upload" && (
            <>
              <button
                className="ps-upload-zone"
                disabled={Boolean(busy)}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!busy) void upload(e.dataTransfer.files[0]);
                }}
              >
                <StudioIcon name="upload" size={32} />
                <strong>
                  {busy === "upload"
                    ? "Uploading your artwork…"
                    : "Drop an idea here."}
                </strong>
                <span>Or tap to choose a file</span>
                <small>PNG, JPG, WebP, SVG, PDF · up to 20 MB</small>
              </button>
              <input
                ref={fileInput}
                type="file"
                hidden
                accept=".png,.jpg,.jpeg,.webp,.svg,.pdf"
                onChange={(e) => void upload(e.target.files?.[0])}
              />
              <div className="ps-upload-tips">
                <h3>A better file. A better finish.</h3>
                <a className="ps-upload-help-link" href="/admin/products/help/artwork">
                  Review artwork requirements
                </a>
                <p>
                  <strong>PNG</strong> for transparent backgrounds. JPG images
                  include their background.
                </p>
                <p>
                  <strong>SVG / PDF</strong> preserve vector artwork. Outline
                  text or embed fonts. PDF originals are stored; use PNG for
                  canvas previews.
                </p>
                <p>
                  <strong>300 DPI</strong> at final print size is the raster
                  target. Use RGB / sRGB and keep the highest quality original.
                </p>
                <p>
                  Safe-area guides are an editing aid. Confirm the provider’s
                  bleed and placement requirements before printing.
                </p>
              </div>
            </>
          )}
          {tab === "designs" && (
            <>
              <p className="ps-panel-intro">
                Your media library, right where you need it.
              </p>
              {busy === "library" && <p role="status">Loading your designs…</p>}
              <div className="ps-media-grid">
                {media.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => choose(a)}
                    aria-label={`Use ${a.filename}`}
                    className={asset?.id === a.id ? "is-active" : ""}
                  >
                    <img src={a.url} alt="" loading="lazy" />
                    <span>{a.filename}</span>
                  </button>
                ))}
              </div>
              {!busy && !media.length && (
                <button className="ps-button" onClick={() => setTab("upload")}>
                  Upload your first design
                </button>
              )}
            </>
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
                    onClick={() => setTab("designs")}
                  >
                    Choose artwork
                  </button>
                </div>
              )}
            </>
          )}
          {tab === "tools" && (
            <>
              <label className="ps-field">
                Design notes
                <textarea
                  rows={5}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Placement notes, color direction, changes for the next version…"
                />
              </label>
              <p className="ps-panel-intro">
                Notes belong to this product design. AgentSam annotation is intentionally limited to customer-facing storefront previews, never this admin shell.
              </p>
              <label className="ps-check">
                <input
                  type="checkbox"
                  checked={guides}
                  onChange={(e) => setGuides(e.target.checked)}
                />{" "}
                Show safe-area guide
              </label>
              <button
                className="ps-button ps-wide"
                disabled={!asset || Boolean(busy)}
                onClick={() => void prepareArtwork()}
              >
                {busy === "prepare" ? "Preparing…" : preparedAsset ? "Rebuild production artwork" : "Prepare for print"}
              </button>
              <div className="ps-paper-note ps-prep-options">
                <strong>Artwork preparation</strong>
                <label className="ps-check">
                  <input
                    type="checkbox"
                    checked={removeFlatBackground}
                    onChange={(e) => setRemoveFlatBackground(e.target.checked)}
                  />{" "}
                  Remove connected flat background
                </label>
                <label className="ps-check">
                  <input
                    type="checkbox"
                    checked={trimTransparent}
                    onChange={(e) => setTrimTransparent(e.target.checked)}
                  />{" "}
                  Trim transparent edges
                </label>
                <small>
                  Background removal is opt-in and deterministic: it removes only edge-connected pixels close to the sampled border color. Preview before using the derivative.
                </small>
              </div>
              <p className="ps-panel-intro">
                Preparation creates a versioned transparent PNG at the provider print-area dimensions and leaves the original asset untouched.
              </p>
              {asset && preparedAsset && (
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
              <button
                className="ps-button ps-wide"
                disabled={!preparedAsset || Boolean(busy)}
                onClick={() => void renderMockup()}
              >
                {busy === "render" ? "Rendering with Completeful…" : "Render Completeful mockup"}
              </button>
              <button
                className="ps-button ps-wide"
                disabled={Boolean(busy)}
                onClick={() => void saveDraft()}
              >
                Save product draft
              </button>
              <button
                className="ps-button ps-wide ps-primary"
                disabled={!preparedAsset || currentRetailPriceCents() <= 0 || Boolean(busy)}
                onClick={() => void createProduct()}
              >
                {busy === "create-product" ? "Creating product…" : "Create Completeful + store product"}
              </button>
              {draft?.state === "created" && (
                <button
                  className="ps-button ps-wide"
                  disabled={Boolean(busy)}
                  onClick={() => void publishProduct()}
                >
                  {busy === "publish" ? "Publishing…" : "Publish to store"}
                </button>
              )}
              <div className="ps-paper-note">
                <strong>Draft status</strong>
                <p>{draft?.state || "Not saved yet"}</p>
                <small>
                  {asset ? `Original #${asset.id}` : "No original artwork"}
                  {preparedAsset ? ` · Prepared #${preparedAsset.id}` : " · Not prepared"}
                  {previewAsset ? ` · Preview #${previewAsset.id}` : ""}
                  {draft?.completeful_design_id ? " · Completeful design linked" : ""}
                </small>
              </div>
            </>
          )}
        </aside>
        <div className="ps-stage-column" ref={stage}>
          <div className="ps-stage-toolbar">
            <div>
              <strong>Product design</strong>
              <span className="ps-stage-subtitle">
                {location?.name || "Choose a print area"}
              </span>
            </div>
            <span>{providerRenderUrl ? "Completeful render" : "Placement preview · provider render comes next"}</span>
          </div>
          <div className="ps-stage" data-agentsam-resource="product-design-stage">
            <div className="ps-product-design-preview">
              <div className="ps-product-design-image">
                {providerRenderUrl ? (
                  <>
                    <ProductImage
                      sources={[providerRenderUrl]}
                      alt={`Completeful render of ${title || detail.product.name}`}
                      lazy={false}
                    />
                    <span className="ps-preview-badge ps-preview-badge--provider">COMPLETEFUL RENDER</span>
                  </>
                ) : (
                  <>
                    {baseImage ? (
                      <ProductImage
                        sources={[
                          location?.artboard_image_url,
                          baseImage,
                          variant?.cover_image_url,
                          detail.product.realistic_image_url,
                          detail.product.cover_image_url,
                          detail.images[0]?.url,
                        ]}
                        alt={detail.product.name}
                        lazy={false}
                      />
                    ) : (
                      <div className="ps-canvas-empty">
                        <StudioIcon name="box" size={40} />
                        <p>No product image supplied.</p>
                      </div>
                    )}
                    <div
                      className="ps-placement-window"
                      style={placementFrameStyle}
                      aria-label={`${location?.name || "Print area"} placement preview`}
                    >
                      {guides && (
                        <div className="ps-safe-area">
                          <span>{location?.name || "PRINT AREA"}</span>
                        </div>
                      )}
                      {asset && showArtwork ? (
                        <img
                          className="ps-artwork-layer"
                          src={asset.url}
                          alt="Your artwork placement"
                          draggable={false}
                          style={{
                            width: `${scale}%`,
                            left: `${x}%`,
                            top: `${y}%`,
                            transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
                          }}
                        />
                      ) : (
                        <button
                          className="ps-placement-empty"
                          type="button"
                          onClick={() => openTab("upload")}
                        >
                          <StudioIcon name="upload" />
                          Add artwork
                        </button>
                      )}
                    </div>
                    <span className="ps-preview-badge">PLACEMENT PREVIEW</span>
                  </>
                )}
              </div>
              <div className="ps-product-design-caption">
                <strong>{variant?.variant_title || variant?.name || detail.product.name}</strong>
                <span>
                  {providerRenderUrl
                    ? `Rendered by Completeful · ${location?.name || "print area"}`
                    : asset
                      ? `${asset.filename} · ${location?.name || "choose a print area"}`
                      : `No artwork selected · ${location?.name || "choose a print area"}`}
                </span>
              </div>
            </div>
          </div>
          <details className="ps-reference-drawer">
            <summary>Provider references ({detail.mockups.filter((m) => m.active && m.preview_url).length})</summary>
            <div className="ps-mockup-grid">
              {detail.mockups
                .filter((m) => m.active && m.preview_url)
                .map((m) => (
                  <figure key={m.mockup_id}>
                    <ProductImage sources={[m.preview_url]} alt={m.name} />
                    <figcaption>{m.name}</figcaption>
                  </figure>
                ))}
              {!detail.mockups.some((m) => m.active && m.preview_url) && (
                <p>No provider reference images are supplied for this product.</p>
              )}
              <p className="ps-reference-note">
                References show provider-supplied product views only. They are not rendered previews of your artwork.
              </p>
            </div>
          </details>
          <div className="ps-quality" aria-live="polite">
            <span>
              {dimensions
                ? `${dimensions.width} × ${dimensions.height} px`
                : "Original artwork preserved"}
            </span>
            <span
              className={quality != null && quality < 1 ? "needs-review" : ""}
            >
              {quality == null
                ? "Check print requirements before production"
                : quality < 1
                  ? "Resolution below print-area target at this size"
                  : "Pixel dimensions meet this print-area target"}
            </span>
          </div>
          <div className="ps-composer">
            <div className="ps-composer-label">
              <StudioIcon name="spark" size={17} />
              <strong>A creative partner, on your canvas.</strong>
            </div>
            <textarea
              aria-label="Creative brief"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A vintage racing emblem, warm cream and burnt orange…"
              rows={2}
            />
            <div className="ps-composer-actions">
              <span>Powered by AgentSam</span>
              <button
                className="ps-text-button"
                disabled={!prompt.trim() || Boolean(busy)}
                onClick={() => askAI(false)}
              >
                {busy === "ideas" ? "Exploring…" : "Brainstorm"}
              </button>
              <button
                className="ps-button ps-primary"
                disabled={!prompt.trim() || Boolean(busy)}
                onClick={() => askAI(true)}
              >
                {busy === "generate" ? "Creating…" : "Create artwork"}
                <StudioIcon name="spark" size={16} />
              </button>
            </div>
          </div>
          {reply && (
            <details open className="ps-ai-reply">
              <summary>Creative direction</summary>
              <p>{reply}</p>
            </details>
          )}
          {error && (
            <div className="ps-feedback" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <p className="ps-notice" role="status">
              {notice}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
