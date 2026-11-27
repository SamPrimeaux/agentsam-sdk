import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import {
  Check, Circle, Download, Eraser, GripVertical, ImagePlus, LoaderCircle, Maximize2, Minus, Plus,
  MessageSquare, MousePointer2, PanelRightOpen, PencilLine, Redo2, Share2,
  SlidersHorizontal, Square, Type, Undo2, X,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { MAX_CHAT_IMAGE_BYTES, readChatAttachment, stageChatImage, type ChatImageReference } from "@/lib/content/chat-images";
import { useWorkStore } from "@/lib/work/store";
import { toast } from "sonner";
import { removeConnectedBackgroundPixels } from "@inneranimalmedia/agentsam-sdk/sam/background";
import "./image-lightbox.css";

type Point = { x: number; y: number };
type MarkupItem = {
  id: string;
  kind: "path" | "rect" | "ellipse" | "text";
  points?: Point[];
  x: number;
  y: number;
  w?: number;
  h?: number;
  text?: string;
  color: string;
  size: number;
  mask?: boolean;
};
type ImageComment = { id: string; x: number; y: number; text: string };
type EditModel = { id: string; name: string };
type Mode = "view" | "markup" | "comment" | "erase";
type MarkupTool = "select" | "pen" | "text" | "rect" | "ellipse" | "eraser";

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not export this image.")), "image/png");
  });
}

async function chatSizedImage(blob: Blob): Promise<Blob> {
  if (blob.size <= MAX_CHAT_IMAGE_BYTES) return blob;
  const bitmap = await createImageBitmap(blob);
  let scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  let quality = 0.9;
  try {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not prepare an image preview for chat.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const candidate = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
      if (candidate && candidate.size <= MAX_CHAT_IMAGE_BYTES) return candidate;
      if (quality > 0.72) quality -= 0.08;
      else scale *= 0.82;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("The result is too large to attach to chat, but it is still available to download.");
}

function imageExtension(mime: string) {
  return mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
}

function itemPath(points: Point[]) {
  return points.map((point, index) => (index ? "L" : "M") + point.x + " " + point.y).join(" ");
}

function itemTouchesPoint(item: MarkupItem, point: Point, radius: number) {
  if (item.kind === "path") {
    return (item.points || []).some((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) <= radius);
  }
  const left = Math.min(item.x, item.x + (item.w || 0));
  const right = Math.max(item.x, item.x + (item.w || 0));
  const top = Math.min(item.y, item.y + (item.h || 0));
  const bottom = Math.max(item.y, item.y + (item.h || 0));
  return point.x >= left - radius && point.x <= right + radius
    && point.y >= top - radius && point.y <= bottom + radius;
}

export function ImageLightbox({
  src,
  alt,
  children,
  triggerClassName,
  attachment,
  chatId,
  assistant,
}: {
  src: string;
  alt: string;
  children: ReactNode;
  triggerClassName?: string;
  attachment?: ChatImageReference;
  chatId?: string;
  /** The host's real composer: model inventory, @ menu, files, plugins, voice and send. */
  assistant?: ReactNode;
}) {
  const { user } = useCurrentUserState();
  const [open, setOpen] = useState(false);
  const [assistantCollapsed, setAssistantCollapsed] = useState(false);
  const [assistantOffset, setAssistantOffset] = useState({ x: 0, y: 0 });
  const [activeAttachment, setActiveAttachment] = useState<ChatImageReference | undefined>(attachment);
  const [mode, setMode] = useState<Mode>("view");
  const [zoom, setZoom] = useState(62);
  const [markupTool, setMarkupTool] = useState<MarkupTool>("pen");
  const [markupColor, setMarkupColor] = useState("#ef3434");
  const [brushSize, setBrushSize] = useState(28);
  const [brushOptionsOpen, setBrushOptionsOpen] = useState(false);
  const [markupItems, setMarkupItems] = useState<MarkupItem[]>([]);
  const [markupUndo, setMarkupUndo] = useState<MarkupItem[][]>([]);
  const [markupRedo, setMarkupRedo] = useState<MarkupItem[][]>([]);
  const [eraseItems, setEraseItems] = useState<MarkupItem[]>([]);
  const [eraseUndo, setEraseUndo] = useState<MarkupItem[][]>([]);
  const [eraseRedo, setEraseRedo] = useState<MarkupItem[][]>([]);
  const [activeItem, setActiveItem] = useState<MarkupItem | null>(null);
  const [selectedMarkupId, setSelectedMarkupId] = useState<string | null>(null);
  const [cursorPoint, setCursorPoint] = useState<Point | null>(null);
  const [pendingTextPoint, setPendingTextPoint] = useState<Point | null>(null);
  const [pendingText, setPendingText] = useState("");
  const [comments, setComments] = useState<ImageComment[]>([]);
  const [pendingCommentPoint, setPendingCommentPoint] = useState<Point | null>(null);
  const [pendingComment, setPendingComment] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [resizeOpen, setResizeOpen] = useState(false);
  const [keepAspect, setKeepAspect] = useState(true);
  const [resizeWidth, setResizeWidth] = useState(0);
  const [resizeHeight, setResizeHeight] = useState(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultAttachment, setResultAttachment] = useState<ChatImageReference | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [busy, setBusy] = useState<"background" | "erase" | "resize" | "markup" | null>(null);
  const [editModels, setEditModels] = useState<EditModel[]>([]);
  const [editModelId, setEditModelId] = useState("");
  const [editModelsConfigured, setEditModelsConfigured] = useState<boolean | null>(null);
  const [editModelsLoading, setEditModelsLoading] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const resultUrlRef = useRef<string | null>(null);
  const erasingMarkupRef = useRef(false);
  const draggingMarkupRef = useRef<{ id: string; point: Point; item: MarkupItem } | null>(null);
  const assistantDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  const annotationChatId = chatId || useWorkStore.getState().activeChatId || undefined;
  const displayedSrc = resultUrl && !showOriginal ? resultUrl : src;
  const dirty = markupItems.length > 0 || eraseItems.length > 0 || comments.length > 0
    || pendingCommentPoint !== null || pendingTextPoint !== null || activeItem !== null;

  useEffect(() => () => {
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
  }, []);

  useEffect(() => {
    setActiveAttachment(attachment);
  }, [attachment?.source.blobId]);

  function resetTransientEdits() {
    setMode("view");
    setMarkupTool("pen");
    setMarkupItems([]);
    setMarkupUndo([]);
    setMarkupRedo([]);
    setEraseItems([]);
    setEraseUndo([]);
    setEraseRedo([]);
    setActiveItem(null);
    setCursorPoint(null);
    setPendingTextPoint(null);
    setPendingText("");
    setComments([]);
    setPendingCommentPoint(null);
    setPendingComment("");
    setBrushOptionsOpen(false);
    erasingMarkupRef.current = false;
  }

  function requestClose() {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    setOpen(false);
    resetTransientEdits();
  }

  async function ensureSourceAttachment() {
    if (activeAttachment || !user?.id || !annotationChatId) return;
    try {
      const response = await fetch(src, { credentials: "same-origin" });
      if (!response.ok) return;
      let blob = await response.blob();
      if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type)) {
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not prepare this image for chat.");
        context.drawImage(bitmap, 0, 0);
        bitmap.close();
        blob = await canvasBlob(canvas);
      }
      const name = /\.(png|jpe?g|webp)$/i.test(alt) ? alt : ((alt || "image").replace(/[^a-z0-9._-]+/gi, "-") + ".png");
      const ref = await stageChatImage(new File([blob], name, { type: blob.type }), user.id);
      const previewUrl = URL.createObjectURL(blob);
      useWorkStore.getState().setPendingComposerAttachments(annotationChatId, (items) => {
        if (items.some((item) => item.name === ref.name && item.size === ref.size)) return items;
        return [...items, { ...ref, previewUrl }].slice(0, 20);
      });
      setActiveAttachment(ref);
    } catch (error) {
      toast.message("This image can still be viewed, but it could not be attached to the contextual chat: " + (error instanceof Error ? error.message : "source unavailable"));
    }
  }

  function onDialogOpenChange(next: boolean) {
    if (next) {
      setOpen(true);
      if (!activeAttachment) void ensureSourceAttachment();
      return;
    }
    requestClose();
  }

  function pointAt(event: ReactPointerEvent<SVGSVGElement>): Point {
    const bounds = imageRef.current?.getBoundingClientRect();
    if (!bounds || !bounds.width || !bounds.height) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1000, ((event.clientX - bounds.left) / bounds.width) * 1000)),
      y: Math.max(0, Math.min(1000, ((event.clientY - bounds.top) / bounds.height) * 1000)),
    };
  }

  function commitMarkup(next: MarkupItem[]) {
    setMarkupUndo((items) => [...items, markupItems].slice(-40));
    setMarkupItems(next);
    setMarkupRedo([]);
  }

  function commitErase(next: MarkupItem[]) {
    setEraseUndo((items) => [...items, eraseItems].slice(-40));
    setEraseItems(next);
    setEraseRedo([]);
  }

  function eraseMarkupAt(point: Point) {
    const radius = Math.max(18, brushSize * 1.25);
    setMarkupItems((items) => items.filter((item) => !itemTouchesPoint(item, point, radius)));
  }

  function onOverlayPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (mode === "comment") {
      setPendingCommentPoint(pointAt(event));
      setPendingComment("");
      return;
    }
    if (mode !== "markup" && mode !== "erase") return;
    const point = pointAt(event);
    setCursorPoint(point);
    if (mode === "markup" && markupTool === "select") {
      const selected = [...markupItems].reverse().find((item) => itemTouchesPoint(item, point, 24));
      setSelectedMarkupId(selected?.id || null);
      if (selected) {
        setMarkupUndo((items) => [...items, markupItems].slice(-40));
        setMarkupRedo([]);
        draggingMarkupRef.current = { id: selected.id, point, item: selected };
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }
    if (mode === "markup" && markupTool === "text") {
      setPendingTextPoint(point);
      setPendingText("");
      return;
    }
    if (mode === "markup" && markupTool === "eraser") {
      setMarkupUndo((items) => [...items, markupItems].slice(-40));
      setMarkupRedo([]);
      erasingMarkupRef.current = true;
      eraseMarkupAt(point);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const kind = mode === "erase" || markupTool === "pen" ? "path" : markupTool;
    const item: MarkupItem = {
      id: crypto.randomUUID(), kind: kind as MarkupItem["kind"],
      points: kind === "path" ? [point] : undefined,
      x: point.x, y: point.y, w: 0, h: 0,
      color: mode === "erase" ? "#279af2" : markupColor,
      size: mode === "erase" ? brushSize : markupTool === "pen" ? 4 : 2,
      mask: mode === "erase",
    };
    setActiveItem(item);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onOverlayPointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const point = pointAt(event);
    setCursorPoint(point);
    if (erasingMarkupRef.current) {
      eraseMarkupAt(point);
      return;
    }
    if (draggingMarkupRef.current) {
      const drag = draggingMarkupRef.current;
      const dx = point.x - drag.point.x;
      const dy = point.y - drag.point.y;
      setMarkupItems((items) => items.map((item) => item.id !== drag.id ? item : {
        ...drag.item,
        x: drag.item.x + dx,
        y: drag.item.y + dy,
        points: drag.item.points?.map((candidate) => ({ x: candidate.x + dx, y: candidate.y + dy })),
      }));
      return;
    }
    if (!activeItem) return;
    if (activeItem.kind === "path") {
      const points = activeItem.points || [];
      const last = points[points.length - 1];
      if (!last || Math.hypot(point.x - last.x, point.y - last.y) >= 2) {
        setActiveItem({ ...activeItem, points: [...points, point] });
      }
      return;
    }
    setActiveItem({ ...activeItem, w: point.x - activeItem.x, h: point.y - activeItem.y });
  }

  function onOverlayPointerUp() {
    if (draggingMarkupRef.current) {
      draggingMarkupRef.current = null;
      return;
    }
    if (erasingMarkupRef.current) {
      erasingMarkupRef.current = false;
      return;
    }
    if (!activeItem) return;
    if (mode === "erase") commitErase([...eraseItems, activeItem]);
    else commitMarkup([...markupItems, activeItem]);
    setActiveItem(null);
  }

  function undo() {
    if (mode === "erase") {
      if (!eraseUndo.length) return;
      setEraseRedo((items) => [...items, eraseItems]);
      setEraseItems(eraseUndo[eraseUndo.length - 1]);
      setEraseUndo((items) => items.slice(0, -1));
      return;
    }
    if (!markupUndo.length) return;
    setMarkupRedo((items) => [...items, markupItems]);
    setMarkupItems(markupUndo[markupUndo.length - 1]);
    setMarkupUndo((items) => items.slice(0, -1));
  }

  function redo() {
    if (mode === "erase") {
      if (!eraseRedo.length) return;
      setEraseUndo((items) => [...items, eraseItems]);
      setEraseItems(eraseRedo[eraseRedo.length - 1]);
      setEraseRedo((items) => items.slice(0, -1));
      return;
    }
    if (!markupRedo.length) return;
    setMarkupUndo((items) => [...items, markupItems]);
    setMarkupItems(markupRedo[markupRedo.length - 1]);
    setMarkupRedo((items) => items.slice(0, -1));
  }

  async function sourceBlob(): Promise<Blob> {
    if (resultBlob && !showOriginal) return resultBlob;
    if (activeAttachment && user?.id) return readChatAttachment(activeAttachment, user.id);
    const response = await fetch(src, { credentials: "same-origin" });
    if (!response.ok) throw new Error("The original image could not be reopened.");
    return response.blob();
  }

  async function presentResult(blob: Blob, filename: string, operation: string): Promise<boolean> {
    const mime = blob.type || "image/png";
    if (!mime.startsWith("image/")) throw new Error("The image provider returned a non-image result.");
    if (resultUrlRef.current) URL.revokeObjectURL(resultUrlRef.current);
    const viewerUrl = URL.createObjectURL(blob);
    resultUrlRef.current = viewerUrl;
    setResultUrl(viewerUrl);
    setResultBlob(blob);
    setShowOriginal(false);
    setResultAttachment(null);
    if (!user?.id || !annotationChatId) {
      toast.message(operation + " result is ready. Sign in and open a conversation to attach it.");
      return false;
    }
    try {
      const chatBlob = await chatSizedImage(blob);
      const chatMime = chatBlob.type || mime;
      const chatFilename = chatMime === "image/webp"
        ? filename.replace(/\.(png|jpe?g|webp)$/i, ".webp")
        : filename;
      const file = new File([chatBlob], chatFilename, { type: chatMime });
      const ref = await stageChatImage(file, user.id);
      const previewUrl = URL.createObjectURL(chatBlob);
      useWorkStore.getState().setPendingComposerAttachments(annotationChatId, (items) => [...items, { ...ref, previewUrl }].slice(0, 20));
      useWorkStore.getState().setPendingAnnotations(annotationChatId, (items) => [...items, {
        id: crypto.randomUUID(), label: alt, page: "Image editor", tag: operation + " result",
        text: operation + " created a new image derivative from " + alt + ". The original image remains unchanged.",
        point: { x: 500, y: 500 },
      }].slice(-8));
      setResultAttachment(ref);
      toast.success(operation + " complete. The new image is in the composer.");
      return true;
    } catch (error) {
      toast.message(operation + " result is ready, but it could not be attached: " + (error instanceof Error ? error.message : "image attachment unavailable"));
      return false;
    }
  }

  async function loadEditModels() {
    if (editModelsLoading || editModelsConfigured !== null) return;
    setEditModelsLoading(true);
    try {
      const response = await fetch("/api/admin/media/image-models", { credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || data.error || "Image models could not be loaded.");
      const models = Array.isArray(data.models) ? data.models as EditModel[] : [];
      setEditModels(models);
      setEditModelsConfigured(Boolean(data.configured && models.length));
      if (models.length) setEditModelId((current) => current || models[0].id);
    } catch (error) {
      setEditModelsConfigured(false);
      toast.error(error instanceof Error ? error.message : "Image models could not be loaded.");
    } finally {
      setEditModelsLoading(false);
    }
  }

  async function createEraseMask(original: Blob) {
    const bitmap = await createImageBitmap(original);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the erase mask.");
    context.fillStyle = "#000000";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "destination-out";
    const displayWidth = imageRef.current?.getBoundingClientRect().width || bitmap.width;
    const scale = bitmap.width / displayWidth;
    for (const item of eraseItems) {
      const points = item.points || [];
      if (!points.length) continue;
      context.beginPath();
      context.moveTo(points[0].x / 1000 * bitmap.width, points[0].y / 1000 * bitmap.height);
      for (const point of points.slice(1)) context.lineTo(point.x / 1000 * bitmap.width, point.y / 1000 * bitmap.height);
      context.lineWidth = Math.max(1, item.size * scale);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = "rgba(0,0,0,1)";
      context.stroke();
    }
    bitmap.close();
    return canvasBlob(canvas);
  }

  async function removeBackground() {
    if (busy) return;
    setBusy("background");
    let bitmap: ImageBitmap | null = null;
    try {
      const original = await sourceBlob();
      bitmap = await createImageBitmap(original);
      const { width, height } = bitmap;
      const maxPixels = 6_000_000;
      if (width * height > maxPixels) {
        throw new Error("This image is too large for local solid-background removal. Resize it below 6 megapixels first.");
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("The browser could not create an image-processing surface.");
      context.drawImage(bitmap, 0, 0);
      const imageData = context.getImageData(0, 0, width, height);
      const result = removeConnectedBackgroundPixels(imageData.data, width, height, {
        tolerance: 42,
        maxPixels,
      });
      if (!result.removedPixels) {
        throw new Error("No connected flat-color background was detected. This works best with a solid or nearly solid backdrop; it is not AI subject segmentation.");
      }
      imageData.data.set(result.pixels);
      context.putImageData(imageData, 0, 0);
      const output = await canvasBlob(canvas);
      const filename = (alt.replace(/\.[^.]+$/, "") || "image") + "-background-removed.png";
      await presentResult(output, filename, "Solid background removal");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Solid background removal failed. The original was not changed.");
    } finally {
      bitmap?.close();
      setBusy(null);
    }
  }

  async function applyErase() {
    if (busy) return;
    if (!eraseItems.length) {
      toast.message("Brush over the area you want removed first.");
      return;
    }
    if (!editModelsConfigured || !editModelId) {
      toast.error("Masked image editing is not configured. The brush selection is preserved.");
      return;
    }
    setBusy("erase");
    try {
      const original = await sourceBlob();
      const mask = await createEraseMask(original);
      const form = new FormData();
      form.append("image", new File([original], alt || "image", { type: original.type || "image/png" }));
      form.append("mask", new File([mask], "erase-mask.png", { type: "image/png" }));
      form.append("prompt", "Remove the object or content inside the transparent mask area and naturally reconstruct the background. Preserve the unmasked parts of the original image.");
      form.append("model_id", editModelId);
      const response = await fetch("/api/admin/media/image/edit", { method: "POST", credentials: "same-origin", body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || data.error || "The selected area could not be removed.");
      }
      const result = await response.blob();
      if (result.type !== "image/png") throw new Error("Image editing returned an invalid image format.");
      const filename = (alt.replace(/\.[^.]+$/, "") || "image") + "-edited.png";
      await presentResult(result, filename, "Erase");
      setEraseItems([]);
      setEraseUndo([]);
      setEraseRedo([]);
      setMode("view");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The selected area could not be removed. The original was not changed.");
    } finally {
      setBusy(null);
    }
  }

  async function exportMarkup(original: Blob) {
    const bitmap = await createImageBitmap(original);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not create the marked-up image.");
    context.drawImage(bitmap, 0, 0);
    const displayWidth = imageRef.current?.getBoundingClientRect().width || bitmap.width;
    const scale = bitmap.width / displayWidth;
    for (const item of markupItems) {
      context.save();
      context.strokeStyle = item.color;
      context.fillStyle = item.color;
      context.lineWidth = Math.max(1, item.size * scale);
      context.lineCap = "round";
      context.lineJoin = "round";
      const x = item.x / 1000 * bitmap.width;
      const y = item.y / 1000 * bitmap.height;
      if (item.kind === "path") {
        const points = item.points || [];
        if (points.length) {
          context.beginPath();
          context.moveTo(points[0].x / 1000 * bitmap.width, points[0].y / 1000 * bitmap.height);
          for (const point of points.slice(1)) context.lineTo(point.x / 1000 * bitmap.width, point.y / 1000 * bitmap.height);
          context.stroke();
        }
      } else if (item.kind === "rect") {
        context.strokeRect(x, y, (item.w || 0) / 1000 * bitmap.width, (item.h || 0) / 1000 * bitmap.height);
      } else if (item.kind === "ellipse") {
        const w = (item.w || 0) / 1000 * bitmap.width;
        const h = (item.h || 0) / 1000 * bitmap.height;
        context.beginPath();
        context.ellipse(x + w / 2, y + h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
        context.stroke();
      } else if (item.kind === "text" && item.text) {
        context.font = "600 " + Math.max(12, item.size * scale) + "px sans-serif";
        context.fillText(item.text, x, y);
      }
      context.restore();
    }
    bitmap.close();
    return canvasBlob(canvas);
  }

  async function sendMarkup() {
    if (!markupItems.length) {
      toast.message("Add a mark before sending.");
      return;
    }
    setBusy("markup");
    try {
      const original = await sourceBlob();
      const result = await exportMarkup(original);
      const filename = (alt.replace(/\.[^.]+$/, "") || "image") + "-marked-up.png";
      const attached = await presentResult(result, filename, "Markup");
      if (attached && annotationChatId) {
        const store = useWorkStore.getState();
        store.setDraft(annotationChatId, [store.drafts[annotationChatId], "Please review the marked-up version of " + alt + "."].filter(Boolean).join("\n\n"));
        await store.send(annotationChatId, "chat");
        setOpen(false);
      }
      setMarkupItems([]);
      setMarkupUndo([]);
      setMarkupRedo([]);
      setSelectedMarkupId(null);
      setMode("view");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The markup could not be exported.");
    } finally {
      setBusy(null);
    }
  }

  async function sendComments() {
    if (!comments.length) {
      toast.message("Click the image to add a comment first.");
      return;
    }
    const target = annotationChatId;
    if (!target) {
      toast.error("Open this image from a conversation to send comments.");
      return;
    }
    const store = useWorkStore.getState();
    store.setPendingAnnotations(target, (items) => [...items, ...comments.map((comment, index) => ({
      id: comment.id,
      label: alt + " · Comment " + (index + 1),
      page: "Image",
      tag: "Image comment",
      text: "Comment on " + alt + " at " + Math.round(comment.x / 10) + "% from the left and " + Math.round(comment.y / 10) + "% from the top: " + comment.text,
      point: { x: comment.x, y: comment.y },
    }))].slice(-8));
    store.setDraft(target, [store.drafts[target], "Please review my " + comments.length + " comment" + (comments.length === 1 ? "" : "s") + " on " + alt + "."].filter(Boolean).join("\n\n"));
    try {
      await store.send(target, "chat");
      setComments([]);
      setPendingCommentPoint(null);
      setPendingComment("");
      setEditingCommentId(null);
      setMode("view");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The comments could not be sent.");
    }
  }

  async function applyResize() {
    if (!resizeWidth || !resizeHeight || resizeWidth < 1 || resizeHeight < 1
      || resizeWidth > 8192 || resizeHeight > 8192 || resizeWidth * resizeHeight > 20_000_000) {
      toast.error("Choose dimensions up to 8192 px and no more than 20 megapixels.");
      return;
    }
    setBusy("resize");
    try {
      const original = await sourceBlob();
      const bitmap = await createImageBitmap(original);
      const canvas = document.createElement("canvas");
      canvas.width = resizeWidth;
      canvas.height = resizeHeight;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not resize this image.");
      context.drawImage(bitmap, 0, 0, resizeWidth, resizeHeight);
      bitmap.close();
      const result = await canvasBlob(canvas);
      const filename = (alt.replace(/\.[^.]+$/, "") || "image") + "-" + resizeWidth + "x" + resizeHeight + ".png";
      await presentResult(result, filename, "Resize");
      setResizeOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The image could not be resized.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadImage() {
    try {
      const blob = await sourceBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = resultUrl && !showOriginal ? ((alt.replace(/\.[^.]+$/, "") || "image") + "-edited." + imageExtension(blob.type)) : alt;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The image could not be downloaded.");
    }
  }

  async function shareImage() {
    try {
      const blob = await sourceBlob();
      const shareName = resultUrl && !showOriginal ? ((alt.replace(/\.[^.]+$/, "") || "image") + "-edited." + imageExtension(blob.type)) : (alt || ("image." + imageExtension(blob.type)));
      const file = new File([blob], shareName, { type: blob.type || "image/png" });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: alt, files: [file] });
        return;
      }
      if (navigator.clipboard?.writeText && /^https?:/i.test(displayedSrc)) {
        await navigator.clipboard.writeText(displayedSrc);
        toast.success("Image link copied.");
      } else {
        await downloadImage();
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "The image could not be shared.");
    }
  }

  function openInSidePanel() {
    const ref = resultAttachment && !showOriginal ? resultAttachment : activeAttachment;
    if (!ref) {
      toast.message("This image is not a stored conversation attachment.");
      return;
    }
    const store = useWorkStore.getState();
    store.openSideTab("files", {
      title: ref.name,
      fileId: null,
      ephemeral: false,
      attachedResource: { blobId: ref.source.blobId, name: ref.name, mimeType: ref.mimeType, size: ref.size, kind: "image" },
    });
    store.setSideOpen(true);
  }

  function activateMode(next: Mode) {
    if (mode === next) {
      setMode("view");
      setActiveItem(null);
      setPendingCommentPoint(null);
      setPendingTextPoint(null);
      return;
    }
    setMode(next);
    setActiveItem(null);
    setSelectedMarkupId(null);
    draggingMarkupRef.current = null;
    setPendingCommentPoint(null);
    setPendingTextPoint(null);
    if (next === "erase") void loadEditModels();
  }

  function addComment() {
    if (!pendingCommentPoint || !pendingComment.trim()) return;
    if (editingCommentId) {
      setComments((items) => items.map((item) => item.id === editingCommentId
        ? { ...item, x: pendingCommentPoint.x, y: pendingCommentPoint.y, text: pendingComment.trim() }
        : item));
    } else {
      setComments((items) => [...items, {
        id: crypto.randomUUID(), x: pendingCommentPoint.x, y: pendingCommentPoint.y, text: pendingComment.trim(),
      }].slice(0, 8));
    }
    setPendingCommentPoint(null);
    setPendingComment("");
    setEditingCommentId(null);
  }

  function addMarkupText() {
    if (!pendingTextPoint || !pendingText.trim()) return;
    commitMarkup([...markupItems, {
      id: crypto.randomUUID(), kind: "text", x: pendingTextPoint.x, y: pendingTextPoint.y,
      text: pendingText.trim(), color: markupColor, size: 18,
    }]);
    setPendingTextPoint(null);
    setPendingText("");
  }

  function startAssistantDrag(event: ReactPointerEvent<HTMLSpanElement>) {
    event.preventDefault();
    assistantDragRef.current = {
      startX: event.clientX, startY: event.clientY,
      originX: assistantOffset.x, originY: assistantOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveAssistantDrag(event: ReactPointerEvent<HTMLSpanElement>) {
    const drag = assistantDragRef.current;
    if (!drag) return;
    setAssistantOffset({
      x: Math.max(-window.innerWidth / 2 + 120, Math.min(window.innerWidth / 2 - 120, drag.originX + event.clientX - drag.startX)),
      y: Math.max(-window.innerHeight + 160, Math.min(80, drag.originY + event.clientY - drag.startY)),
    });
  }

  function endAssistantDrag() {
    assistantDragRef.current = null;
  }

  function handleImageLoad() {
    const image = imageRef.current;
    if (!image) return;
    const size = { width: image.naturalWidth, height: image.naturalHeight };
    setNaturalSize(size);
    setResizeWidth(size.width);
    setResizeHeight(size.height);
  }

  function setWidthFromInput(value: number) {
    setResizeWidth(value);
    if (keepAspect && naturalSize?.width) setResizeHeight(Math.max(1, Math.round(value * naturalSize.height / naturalSize.width)));
  }

  function setHeightFromInput(value: number) {
    setResizeHeight(value);
    if (keepAspect && naturalSize?.height) setResizeWidth(Math.max(1, Math.round(value * naturalSize.width / naturalSize.height)));
  }

  function renderItem(item: MarkupItem) {
    const common = { stroke: item.color, strokeWidth: item.size + (selectedMarkupId === item.id ? 2 : 0), strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    if (item.kind === "path") return <path key={item.id} d={itemPath(item.points || [])} fill="none" {...common} opacity={item.mask ? 0.42 : 1} />;
    if (item.kind === "rect") return <rect key={item.id} x={item.x + Math.min(0, item.w || 0)} y={item.y + Math.min(0, item.h || 0)} width={Math.abs(item.w || 0)} height={Math.abs(item.h || 0)} fill="none" {...common} />;
    if (item.kind === "ellipse") return <ellipse key={item.id} cx={item.x + (item.w || 0) / 2} cy={item.y + (item.h || 0) / 2} rx={Math.abs(item.w || 0) / 2} ry={Math.abs(item.h || 0) / 2} fill="none" {...common} />;
    return <text key={item.id} x={item.x} y={item.y} fill={item.color} fontSize={item.size} fontWeight="600">{item.text}</text>;
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onDialogOpenChange}>
        <DialogTrigger asChild>
          <button type="button" className={triggerClassName} aria-label={"Open image editor: " + alt}>
            {children}
          </button>
        </DialogTrigger>
        <DialogContent portalToBody className="as-image-lightbox-dialog" onPointerDownOutside={(event) => {
          if (dirty) { event.preventDefault(); setConfirmDiscard(true); }
        }}>
          <DialogTitle className="sr-only">{alt}</DialogTitle>
          <div className="as-image-lightbox" data-mode={mode}>
            <div className="as-image-viewer-actions" role="toolbar" aria-label="Image actions">
              {mode === "view" ? <div className="as-image-edit-toolbar">
                <span className="as-image-toolbar-grip" aria-hidden="true"><GripVertical size={15}/></span>
                <button type="button" onClick={() => activateMode("markup")}><PencilLine size={15}/>Markup</button>
                <button type="button" onClick={() => activateMode("comment")}><MessageSquare size={15}/>Comment</button>
                <button
                  type="button"
                  disabled={busy !== null}
                  title="Removes connected flat-color backgrounds locally. This is not AI subject segmentation."
                  onClick={() => void removeBackground()}
                >
                  {busy === "background" ? <LoaderCircle className="as-image-spin" size={15}/> : <ImagePlus size={15}/>}Remove BG
                </button>
                <button type="button" onClick={() => activateMode("erase")}><Eraser size={15}/>Erase</button>
                <button type="button" onClick={() => { setResizeWidth(naturalSize?.width || 0); setResizeHeight(naturalSize?.height || 0); setResizeOpen(true); }}><Maximize2 size={15}/>Resize</button>
              </div> : null}
              <div className="as-image-viewer-controls">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><button type="button" className="as-image-zoom-trigger">{zoom}% <span>⌄</span></button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="as-image-zoom-menu">
                    {[25, 50, 62, 75, 100, 125, 150, 200].map((value) => <DropdownMenuItem key={value} onSelect={() => setZoom(value)}>{value}%{zoom === value ? <Check size={13}/> : null}</DropdownMenuItem>)}
                    <DropdownMenuItem onSelect={() => setZoom(100)}>Fit to screen</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <button type="button" aria-label="Download image" title="Download" onClick={() => void downloadImage()}><Download size={17}/></button>
                <button type="button" aria-label="Share image" title="Share" onClick={() => void shareImage()}><Share2 size={17}/></button>
                <button type="button" aria-label="Open in side panel" title="Open in side panel" onClick={openInSidePanel}><PanelRightOpen size={17}/><span>Open in side panel</span></button>
                <button type="button" aria-label="Close image" title="Close" onClick={requestClose}><X size={19}/></button>
              </div>
            </div>

            <div className="as-image-stage-scroll">
              <div className="as-image-stage-media" style={{ transform: "scale(" + (zoom / 100) + ")" }}>
                <img ref={imageRef} src={displayedSrc} alt={alt} draggable={false} onLoad={handleImageLoad}/>
                <svg
                  className="as-image-annotation-layer"
                  viewBox="0 0 1000 1000"
                  preserveAspectRatio="none"
                  aria-label={mode === "comment" ? "Click the image to add comments" : mode === "erase" ? "Brush over the area to remove" : "Image markup layer"}
                  onPointerDown={onOverlayPointerDown}
                  onPointerMove={onOverlayPointerMove}
                  onPointerUp={onOverlayPointerUp}
                  onPointerCancel={onOverlayPointerUp}
                >
                  {mode === "markup" ? markupItems.map(renderItem) : null}
                  {mode === "markup" && activeItem ? renderItem(activeItem) : null}
                  {mode === "erase" ? eraseItems.map(renderItem) : null}
                  {mode === "erase" && activeItem ? renderItem(activeItem) : null}
                  {mode === "markup" && markupTool === "eraser" && cursorPoint ? <circle cx={cursorPoint.x} cy={cursorPoint.y} r={brushSize / 2} fill="rgba(255,255,255,.08)" stroke="rgba(255,255,255,.85)" strokeWidth="2"/> : null}
                  {mode === "erase" && cursorPoint ? <circle cx={cursorPoint.x} cy={cursorPoint.y} r={brushSize / 2} fill="rgba(39,154,242,.16)" stroke="rgba(90,190,255,.9)" strokeWidth="2"/> : null}
                </svg>
                {mode === "comment" ? comments.map((comment, index) => <button type="button" key={comment.id} className="as-image-comment-pin" style={{ left: (comment.x / 10) + "%", top: (comment.y / 10) + "%" }} title={comment.text} onClick={(event) => { event.stopPropagation(); setPendingCommentPoint({ x: comment.x, y: comment.y }); setPendingComment(comment.text); }}><span>{index + 1}</span></button>) : null}
                {mode === "comment" && pendingCommentPoint ? <form className="as-image-comment-entry" style={{ left: Math.max(8, Math.min(92, pendingCommentPoint.x / 10)) + "%", top: Math.max(8, Math.min(92, pendingCommentPoint.y / 10)) + "%" }} onSubmit={(event) => { event.preventDefault(); addComment(); }} onPointerDown={(event) => event.stopPropagation()}>
                  <input autoFocus value={pendingComment} onChange={(event) => setPendingComment(event.target.value)} placeholder="Add a comment…" aria-label="Image comment"/>
                  <button type="submit" disabled={!pendingComment.trim()}>Add</button>
                  <button type="button" aria-label="Cancel comment" onClick={() => { setPendingCommentPoint(null); setPendingComment(""); setEditingCommentId(null); }}><X size={14}/></button>
                </form> : null}
                {mode === "markup" && pendingTextPoint ? <form className="as-image-text-entry" style={{ left: (pendingTextPoint.x / 10) + "%", top: (pendingTextPoint.y / 10) + "%" }} onSubmit={(event) => { event.preventDefault(); addMarkupText(); }} onPointerDown={(event) => event.stopPropagation()}>
                  <input autoFocus value={pendingText} onChange={(event) => setPendingText(event.target.value)} placeholder="Add text…" aria-label="Markup text"/>
                  <button type="submit" disabled={!pendingText.trim()}>Add</button>
                  <button type="button" aria-label="Cancel text" onClick={() => setPendingTextPoint(null)}><X size={14}/></button>
                </form> : null}
              </div>
            </div>

            {resultUrl ? <div className="as-image-result-switch" role="group" aria-label="Original and edited image">
              <span>Edited result</span>
              <button type="button" onClick={() => setShowOriginal((value) => !value)}>{showOriginal ? "Show result" : "Show original"}</button>
              <span>Original preserved</span>
            </div> : null}

            {mode === "view" && assistant ? <div className="as-image-assistant-dock" style={{ transform: "translate(" + assistantOffset.x + "px, " + assistantOffset.y + "px)" }}>
              <div className="as-image-assistant-header">
                <button type="button" aria-label={assistantCollapsed ? "Expand image chat" : "Collapse image chat"} onClick={() => setAssistantCollapsed((value) => !value)}>
                  {assistantCollapsed ? <Plus size={14}/> : <Minus size={14}/>}
                </button>
                <span>Chat</span>
                <span className="as-image-assistant-grip" aria-label="Move image chat" title="Drag to move" onPointerDown={startAssistantDrag} onPointerMove={moveAssistantDrag} onPointerUp={endAssistantDrag} onPointerCancel={endAssistantDrag}><GripVertical size={15}/></span>
              </div>
              {!assistantCollapsed ? assistant : null}
            </div> : null}

            {mode === "markup" ? <div className="as-image-mode-toolbar as-image-markup-toolbar" role="toolbar" aria-label="Markup tools">
              <span className="as-image-toolbar-grip" aria-hidden="true"><GripVertical size={15}/></span>
              <button type="button" data-active={markupTool === "select"} aria-label="Select" title="Select" onClick={() => setMarkupTool("select")}><MousePointer2 size={16}/></button>
              <button type="button" data-active={markupTool === "pen"} aria-label="Freehand markup" title="Freehand" onClick={() => setMarkupTool("pen")}><PencilLine size={16}/></button>
              <button type="button" data-active={markupTool === "text"} aria-label="Add text" title="Text" onClick={() => setMarkupTool("text")}><Type size={16}/></button>
              <button type="button" data-active={markupTool === "rect"} aria-label="Rectangle" title="Rectangle" onClick={() => setMarkupTool("rect")}><Square size={16}/></button>
              <button type="button" data-active={markupTool === "ellipse"} aria-label="Ellipse" title="Ellipse" onClick={() => setMarkupTool("ellipse")}><Circle size={16}/></button>
              <label className="as-image-color-picker" title="Markup color"><input type="color" value={markupColor} onChange={(event) => setMarkupColor(event.target.value)}/><span style={{ background: markupColor }}/></label>
              <button type="button" data-active={markupTool === "eraser"} aria-label="Eraser" title="Eraser" onClick={() => setMarkupTool("eraser")}><Eraser size={16}/></button>
              <button type="button" aria-label="Undo" title="Undo" disabled={!markupUndo.length} onClick={undo}><Undo2 size={16}/></button>
              <button type="button" aria-label="Redo" title="Redo" disabled={!markupRedo.length} onClick={redo}><Redo2 size={16}/></button>
              <button type="button" className="as-image-send-tool" disabled={busy !== null} onClick={() => void sendMarkup()}>{busy === "markup" ? <LoaderCircle className="as-image-spin" size={15}/> : "Send"}</button>
              <button type="button" aria-label="Close markup" title="Close markup" onClick={requestClose}><X size={16}/></button>
            </div> : null}

            {mode === "comment" ? <div className="as-image-mode-toolbar as-image-comment-toolbar">
              <span className="as-image-toolbar-grip" aria-hidden="true"><GripVertical size={15}/></span>
              <span>Click on the image to add comments</span>
              {comments.length ? <small>{comments.length} comment{comments.length === 1 ? "" : "s"}</small> : null}
              <button type="button" className="as-image-send-tool" disabled={!comments.length || busy !== null} onClick={() => void sendComments()}>Send</button>
              <button type="button" aria-label="Exit comment mode" onClick={() => activateMode("comment")}><X size={16}/></button>
            </div> : null}

            {mode === "erase" ? <div className="as-image-mode-toolbar as-image-erase-toolbar">
              <span className="as-image-toolbar-grip" aria-hidden="true"><GripVertical size={15}/></span>
              <button type="button" className="as-image-brush-size" onClick={() => setBrushOptionsOpen((value) => !value)} aria-expanded={brushOptionsOpen}><SlidersHorizontal size={15}/>Brush {brushSize}px</button>
              <span className="as-image-erase-hint">Brush over what you want to remove</span>
              {editModelsLoading ? <small>Loading image models…</small> : editModels.length ? <select aria-label="Image editing model" value={editModelId} onChange={(event) => setEditModelId(event.target.value)}>{editModels.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}</select> : <small>{editModelsConfigured === false ? "Image editing unavailable" : "Select an area"}</small>}
              <button type="button" className="as-image-send-tool" disabled={!eraseItems.length || busy !== null || !editModelId} onClick={() => void applyErase()}>{busy === "erase" ? <LoaderCircle className="as-image-spin" size={15}/> : "Send"}</button>
              <button type="button" aria-label="Exit erase mode" onClick={() => activateMode("erase")}><X size={16}/></button>
              {brushOptionsOpen ? <div className="as-image-brush-popover"><label>Brush size <strong>{brushSize}px</strong></label><input type="range" min="8" max="120" step="2" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))}/><div><span>Fine</span><span>Broad</span></div></div> : null}
            </div> : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={resizeOpen} onOpenChange={setResizeOpen}>
        <DialogContent portalToBody className="as-image-resize-dialog">
          <DialogTitle>Resize image</DialogTitle>
          <DialogDescription>Creates a new image derivative. The original remains unchanged.</DialogDescription>
          <div className="as-image-resize-fields">
            <label>Width (px)<input type="number" min="1" max="8192" value={resizeWidth || ""} onChange={(event) => setWidthFromInput(Number(event.target.value))}/></label>
            <label>Height (px)<input type="number" min="1" max="8192" value={resizeHeight || ""} onChange={(event) => setHeightFromInput(Number(event.target.value))}/></label>
          </div>
          <label className="as-image-aspect-lock"><input type="checkbox" checked={keepAspect} onChange={(event) => setKeepAspect(event.target.checked)}/> Keep aspect ratio</label>
          <div className="as-image-dialog-actions"><button type="button" onClick={() => setResizeOpen(false)}>Cancel</button><button type="button" className="as-image-primary" disabled={busy !== null} onClick={() => void applyResize()}>{busy === "resize" ? <LoaderCircle className="as-image-spin" size={15}/> : "Apply resize"}</button></div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent portalToBody className="as-image-discard-dialog">
          <DialogTitle>Discard changes?</DialogTitle>
          <DialogDescription>Your changes won't be saved.</DialogDescription>
          <div className="as-image-discard-actions"><button type="button" onClick={() => setConfirmDiscard(false)}>Keep editing</button><button type="button" className="as-image-discard-danger" onClick={() => { setConfirmDiscard(false); setOpen(false); resetTransientEdits(); }}>Discard changes</button></div>
        </DialogContent>
      </Dialog>
    </>
  );
}
