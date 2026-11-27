import { WorkspaceOpeningField } from "@/components/runtime/LocalStudioRuntimeField";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, LoaderCircle, RefreshCw } from "lucide-react";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import {
  DesignCanvasApp,
  type CreativeArtifact,
  type CreativeType,
} from "@inneranimalmedia/agentsam-design-canvas/react";
import { CanvasEntryStage } from "./canvas-entry-stage";
import { useWorkStore } from "@/lib/work/store";

const API = "/api/work/canvases";
const CREATIVE_SCHEMA = "agentsam.creative-workspace.v1";
type CanvasSummary = { id: string; contentHash: string; name: string; revision: number };
type CanvasRecord = { etag: string; serialized: string };
type CanvasResponse = { ok: boolean; canvas?: CanvasSummary; document?: CreativeCanvasDocument; error?: string };
type CreativeCanvasDocument = {
  version: 1;
  name: string;
  host: string;
  brief: string;
  artboards: Array<{
    id: string; name: string; x: number; y: number; width: number; height: number;
    background: string; nodes: Array<Record<string, unknown>>;
  }>;
  tokens: Record<string, unknown>;
  components: Array<unknown>;
  assets: Array<unknown>;
  dataRequirements: Array<unknown>;
  provenance: Record<string, unknown>;
  creativeWorkspace?: { schema: string; artifact: CreativeArtifact };
};
type LoadResponse = { ok: boolean; canvases?: CanvasSummary[]; error?: string };

function canvasNode(object: Record<string, unknown>, fallbackId: string) {
  const type = object.type === "text" ? "text" : object.type === "image" ? "image" : "frame";
  const style: Record<string, string | number> = {};
  if (typeof object.fill === "string" && object.fill !== "transparent") style.backgroundColor = object.fill;
  if (typeof object.color === "string") style.color = object.color;
  if (typeof object.fontFamily === "string") style.fontFamily = object.fontFamily;
  if (typeof object.fontSize === "number") style.fontSize = object.fontSize;
  if (typeof object.weight === "number") style.fontWeight = object.weight;
  if (typeof object.align === "string") style.textAlign = object.align;
  if (typeof object.radius === "number") style.borderRadius = object.radius;
  if (typeof object.borderColor === "string") style.borderColor = object.borderColor;
  if (typeof object.borderWidth === "number") style.borderWidth = object.borderWidth;
  if (typeof object.borderStyle === "string") style.borderStyle = object.borderStyle;
  if (typeof object.opacity === "number") style.opacity = object.opacity;
  const node: Record<string, unknown> = {
    id: typeof object.id === "string" ? object.id : fallbackId,
    type,
    name: typeof object.name === "string" && object.name ? object.name : "Object",
    x: typeof object.x === "number" ? object.x : 0,
    y: typeof object.y === "number" ? object.y : 0,
    width: Math.max(1, typeof object.w === "number" ? object.w : 120),
    height: Math.max(1, typeof object.h === "number" ? object.h : 48),
    style,
  };
  if (typeof object.text === "string") node.text = object.text;
  if (typeof object.src === "string" && (/^https:\/\//i.test(object.src) || /^\/(?!\/)/.test(object.src))) node.src = object.src;
  return node;
}

function previewBoards(artifact: CreativeArtifact) {
  if (artifact.type === "slides") {
    const data = artifact.data as { slides: Array<{ id: string; name: string; background: string; objects: Array<Record<string, unknown>> }> };
    return data.slides.slice(0, 64).map((slide, index) => ({
      id: slide.id, name: slide.name, x: 0, y: index * 720, width: 1200, height: 675,
      background: slide.background, nodes: slide.objects.map((object, i) => canvasNode(object, "slide-object-" + index + "-" + i)),
    }));
  }
  if (artifact.type === "design" || artifact.type === "whiteboard") {
    const data = artifact.data as { artboards: Array<{ id: string; name: string; width: number; height: number; background: string; objects: Array<Record<string, unknown>> }> };
    return data.artboards.slice(0, 64).map((board) => ({
      id: board.id, name: board.name, x: 0, y: 0, width: board.width, height: board.height,
      background: board.background, nodes: board.objects.map((object, i) => canvasNode(object, board.id + "-object-" + i)),
    }));
  }
  if (artifact.type === "system") {
    const data = artifact.data as { colors?: Array<{ id: string; name: string; value: string }>; typography?: Array<{ id: string; role: string; family: string; size: number }> };
    const nodes: Array<Record<string, unknown>> = [{
      id: "system-title", type: "text", name: "Design System", x: 54, y: 42, width: 900, height: 68,
      text: artifact.name, style: { color: "#20252d", fontSize: 42, fontWeight: 650 },
    }];
    (data.colors || []).slice(0, 12).forEach((token, index) => {
      nodes.push({ id: "system-color-" + index, type: "frame", name: token.name, x: 56 + (index % 6) * 180, y: 150 + Math.floor(index / 6) * 150, width: 132, height: 92, style: { backgroundColor: token.value, borderRadius: 8 } });
    });
    (data.typography || []).slice(0, 4).forEach((token, index) => {
      nodes.push({ id: "system-type-" + index, type: "text", name: token.role, x: 56, y: 490 + index * 34, width: 1000, height: 30, text: token.role + " · " + token.family + " · " + token.size, style: { color: "#20252d", fontSize: 17 } });
    });
    return [{ id: "system-preview", name: "Overview", x: 0, y: 0, width: 1200, height: 675, background: "#ffffff", nodes }];
  }
  return [{
    id: "build-preview", name: "AgentSam build", x: 0, y: 0, width: 1200, height: 675, background: "#f6f7f8",
    nodes: [{ id: "build-title", type: "text", name: "Create in Code", x: 70, y: 70, width: 1000, height: 100, text: "AgentSam · CLI workflow", style: { color: "#20252d", fontSize: 42, fontWeight: 650 } }],
  }];
}

function toCanvasDocument(artifact: CreativeArtifact, project?: { id: string; name: string } | null): CreativeCanvasDocument {
  return {
    version: 1,
    name: artifact.name,
    host: artifact.type,
    brief: "Native editable AgentSam Creative Workspace document.",
    artboards: previewBoards(artifact),
    tokens: {},
    components: [],
    assets: [],
    dataRequirements: [],
    provenance: {
      appId: "agentsam-design-canvas",
      schema: CREATIVE_SCHEMA,
      projectId: project?.id || null,
      projectName: project?.name || null,
      workspace: artifact.type,
    },
    creativeWorkspace: { schema: CREATIVE_SCHEMA, artifact },
  };
}

async function readJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok || (body && typeof body === "object" && "ok" in body && body.ok === false)) {
    throw new Error(body?.error || "creative_workspace_request_failed_" + response.status);
  }
  return body;
}

function isCreativeArtifact(value: unknown): value is CreativeArtifact {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<CreativeArtifact>;
  return typeof item.id === "string" && item.id.startsWith("canvas_") &&
    ["slides", "design", "code", "system", "whiteboard"].includes(String(item.type)) &&
    typeof item.name === "string" && !!item.data && typeof item.data === "object";
}

export function CreativeWorkspaceStage({ tab }: { tab: SideTab }) {
  const params = new URL(tab.url || "/canvas", window.location.origin).searchParams;
  const host = params.get("host");
  if (params.has("site_id") || (host && !["slides", "design", "code", "system", "whiteboard"].includes(host))) {
    return <CanvasEntryStage tab={tab}/>;
  }
  return <CreativeDocumentStage tab={tab}/>;
}

function CreativeDocumentStage({ tab }: { tab: SideTab }) {
  const setTabUrl = useWorkStore((state) => state.setTabUrl);
  const outputsOpen = useWorkStore((state) => state.sideTabs.find((item) => item.id === state.activeSideTabId)?.kind === "files");
  const project = useWorkStore((state) => {
    const parent = state.chats.find((chat) => chat.id === tab.parentChatId);
    const projectId = parent?.projectId || state.activeProjectId;
    return state.projects.find((item) => item.id === projectId) || state.projects[0] || null;
  });
  const [ready, setReady] = useState(false);
  const [loadingError, setLoadingError] = useState("");
  const [legacyCanvas, setLegacyCanvas] = useState(false);
  const [localFallback, setLocalFallback] = useState(false);
  const [initialArtifacts, setInitialArtifacts] = useState<CreativeArtifact[]>([]);
  const [initialWorkspace, setInitialWorkspace] = useState<CreativeType | undefined>();
  const [initialName, setInitialName] = useState<string | undefined>();
  const [initialActiveId, setInitialActiveId] = useState<string | undefined>();
  const [initialRoute, setInitialRoute] = useState<"gallery" | "references">("gallery");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const records = useRef(new Map<string, CanvasRecord>());
  const pending = useRef<CreativeArtifact[] | null>(null);
  const saveTimer = useRef<number | null>(null);
  const saving = useRef(false);
  const failed = useRef(false);
  const observed = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const urlPinned = useRef(false);

  useEffect(() => {
    let live = true;
    const load = async () => {
      setReady(false);
      setLoadingError("");
      setLegacyCanvas(false);
      setLocalFallback(false);
      records.current.clear();
      observed.current = false;
      failed.current = false;
      try {
        const params = new URL(tab.url || "/canvas", window.location.origin).searchParams;
        const requestedId = params.get("canvas") || "";
        const hostParam = params.get("host") || "";
        setInitialRoute(params.get("library") === "sources" ? "references" : "gallery");
        const allowed: CreativeType[] = ["slides", "design", "code", "system", "whiteboard"];
        const host = allowed.includes(hostParam as CreativeType) ? hostParam as CreativeType : undefined;
        // Always hydrate the account's Creative Workspace collection. A direct
        // document URL selects one item but must not hide the rest of the gallery.
        urlPinned.current = Boolean(requestedId) || params.get("workspace") === "creative";
        const summaries: CanvasSummary[] = [];
        const list = await readJson<LoadResponse>(await fetch(API + "?workspace=creative", { credentials: "same-origin" }));
        summaries.push(...(list.canvases || []));
        if (requestedId && !summaries.some((item) => item.id === requestedId)) {
          summaries.unshift({ id: requestedId, contentHash: "", name: "", revision: 0 });
        }
        const loaded: CreativeArtifact[] = [];
        for (let offset = 0; offset < summaries.length; offset += 8) {
          const batch = await Promise.all(summaries.slice(offset, offset + 8).map(async (summary) => {
            const response = await fetch(API + "/" + encodeURIComponent(summary.id), { credentials: "same-origin" });
            const payload = await readJson<CanvasResponse>(response);
            const artifact = payload.document?.creativeWorkspace?.schema === CREATIVE_SCHEMA
              ? payload.document.creativeWorkspace.artifact : null;
            if (!isCreativeArtifact(artifact)) return null;
            const etag = response.headers.get("etag") || (payload.canvas?.contentHash ? '"' + payload.canvas.contentHash + '"' : "");
            records.current.set(artifact.id, { etag, serialized: JSON.stringify(artifact) });
            return artifact;
          }));
          loaded.push(...batch.filter((item): item is CreativeArtifact => !!item));
        }
        if (!live) return;
        if (requestedId && !loaded.some((item) => item.id === requestedId)) {
          const legacy = await fetch(API + "/" + encodeURIComponent(requestedId), { credentials: "same-origin" });
          const payload = await readJson<CanvasResponse>(legacy);
          if (payload.document && payload.document.creativeWorkspace?.schema !== CREATIVE_SCHEMA) {
            setLegacyCanvas(true);
            setReady(true);
            return;
          }
        }
        setInitialArtifacts(loaded);
        setInitialActiveId(requestedId && loaded.some((item) => item.id === requestedId) ? requestedId : undefined);
        setInitialWorkspace(!requestedId ? host : undefined);
        setInitialName(host === "slides" && params.get("template") === "brand-guidelines" ? "Brand Guidelines" : undefined);
        setReady(true);
        if (requestedId) urlPinned.current = true;
      } catch (error) {
        if (!live) return;
        const message = error instanceof Error ? error.message : "creative_workspace_load_failed";
        // Vite's local preview does not mount the Cloudflare Work Service router.
        // Keep the actual package fully usable with its existing local draft
        // adapter; production never takes this path and always uses Work Canvas.
        if (import.meta.env.DEV && message.includes("_404")) {
          const params = new URL(tab.url || "/canvas", window.location.origin).searchParams;
          const hostParam = params.get("host") || "";
          const allowed: CreativeType[] = ["slides", "design", "code", "system", "whiteboard"];
          const host = allowed.includes(hostParam as CreativeType) ? hostParam as CreativeType : undefined;
          setLocalFallback(true);
          setInitialWorkspace(!params.get("canvas") ? host : undefined);
          setInitialName(host === "slides" && params.get("template") === "brand-guidelines" ? "Brand Guidelines" : undefined);
          setInitialActiveId(params.get("canvas") || undefined);
          setInitialRoute(params.get("library") === "sources" ? "references" : "gallery");
          setReady(true);
          return;
        }
        setLoadingError(message);
      }
    };
    void load();
    return () => { live = false; };
  }, [tab.id, loadAttempt]);

  const persistArtifacts = useCallback(async (items: CreativeArtifact[]) => {
    const ids = new Set(items.map((item) => item.id));
    for (const artifact of items) {
      const serialized = JSON.stringify(artifact);
      const previous = records.current.get(artifact.id);
      if (previous?.serialized === serialized) continue;
      const document = toCanvasDocument(artifact, project ? { id: project.id, name: project.name } : null);
      if (previous) {
        const response = await fetch(API + "/" + encodeURIComponent(artifact.id), {
          method: "PUT",
          credentials: "same-origin",
          headers: { "content-type": "application/json", "if-match": previous.etag },
          body: JSON.stringify({ document }),
        });
        // A lost response or another instance saving the exact same edit is safe
        // to acknowledge. Never replace a genuinely newer, different document.
        const result = response.status === 409
          ? await fetch(API + "/" + encodeURIComponent(artifact.id), { credentials: "same-origin" })
          : response;
        const payload = await readJson<CanvasResponse>(result);
        if (response.status === 409 && JSON.stringify(payload.document?.creativeWorkspace?.artifact) !== serialized) {
          throw new Error("revision_conflict");
        }
        const etag = result.headers.get("etag") || (payload.canvas?.contentHash ? '"' + payload.canvas.contentHash + '"' : "");
        if (!etag) throw new Error("canvas_revision_missing");
        records.current.set(artifact.id, { etag, serialized });
      } else {
        const response = await fetch(API, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: artifact.id, document }),
        });
        const payload = await readJson<CanvasResponse>(response);
        if (response.status === 200 && JSON.stringify(payload.document?.creativeWorkspace?.artifact) !== serialized) {
          throw new Error("revision_conflict");
        }
        const etag = response.headers.get("etag") || (payload.canvas?.contentHash ? '"' + payload.canvas.contentHash + '"' : "");
        if (!etag) throw new Error("canvas_revision_missing");
        records.current.set(artifact.id, { etag, serialized });
        if (!urlPinned.current) {
          setTabUrl(tab.id, "/canvas?workspace=creative&canvas=" + encodeURIComponent(artifact.id));
          urlPinned.current = true;
        }
      }
    }
    for (const [id, record] of [...records.current.entries()]) {
      if (ids.has(id)) continue;
      const response = await fetch(API + "/" + encodeURIComponent(id), {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "if-match": record.etag },
      });
      if (!response.ok && response.status !== 404) await readJson<CanvasResponse>(response);
      records.current.delete(id);
    }
    setSaveState("saved");
  }, [project, setTabUrl, tab.id]);

  const flush = useCallback(async () => {
    if (saving.current || failed.current) return;
    saving.current = true;
    let attempted: CreativeArtifact[] | null = null;
    try {
      while (pending.current) {
        attempted = pending.current;
        pending.current = null;
        setSaveState("saving");
        await persistArtifacts(attempted);
        attempted = null;
      }
      setLoadingError("");
    } catch (error) {
      // Preserve newer edits if they arrived during the failed request; otherwise
      // retain the exact attempted snapshot. Do not spin on a persistent 409.
      pending.current ??= attempted;
      failed.current = true;
      setSaveState("error");
      setLoadingError(error instanceof Error ? error.message : "creative_workspace_save_failed");
    } finally {
      saving.current = false;
      if (pending.current && !failed.current) void flushRef.current();
    }
  }, [persistArtifacts]);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  const onArtifactsChange = useCallback((items: CreativeArtifact[]) => {
    if (!observed.current) {
      observed.current = true;
      // The editor normalizes loaded artifacts on hydration. That is not a user
      // edit; adopt the normalized representation without writing stale versions.
      for (const artifact of items) {
        const record = records.current.get(artifact.id);
        if (record) record.serialized = JSON.stringify(artifact);
      }
      if (items.length === records.current.size && items.every(item => records.current.has(item.id))) {
        setSaveState("saved");
        return;
      }
    }
    pending.current = items;
    if (failed.current) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { saveTimer.current = null; void flushRef.current(); }, 420);
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!pending.current && !saving.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (pending.current && !failed.current) void flushRef.current();
    };
  }, []);

  const retrySave = () => {
    failed.current = false;
    void flushRef.current();
  };
  const exportUnsaved = () => {
    if (!pending.current) return;
    const changed = pending.current.filter(item => records.current.get(item.id)?.serialized !== JSON.stringify(item));
    const archivedIds = [...records.current.keys()].filter(id => !pending.current?.some(item => item.id === id));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: CREATIVE_SCHEMA, artifacts: changed, archivedIds }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url; link.download = "agentsam-unsaved-canvas.json"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onActiveArtifactChange = useCallback((artifactId: string | null, artifact?: CreativeArtifact | null) => {
    const next = artifactId
      ? "/canvas?workspace=creative&canvas=" + encodeURIComponent(artifactId) + (artifact?.type ? "&type=" + encodeURIComponent(artifact.type) : "")
      : "/canvas?workspace=creative";
    setTabUrl(tab.id, next);
    useWorkStore.getState().setTabTitle(tab.id, artifact?.name || "Creative Workspace");
    urlPinned.current = true;
  }, [setTabUrl, tab.id]);

  if (legacyCanvas) return <CanvasEntryStage tab={tab}/>;
  if (loadingError && !ready) {
    return <div className="flex h-full min-h-0 items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-border bg-card p-5">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold"><AlertCircle size={16}/> Creative workspace unavailable</div>
        <p className="mb-4 text-xs text-muted-foreground">{loadingError}</p>
        <button type="button" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-xs" onClick={() => setLoadAttempt((value) => value + 1)}><RefreshCw size={13}/> Retry</button>
      </div>
    </div>;
  }
  if (!ready) return <WorkspaceOpeningField label="Opening Creative Workspace" />;

  return <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden"><DesignCanvasApp
      embedded
      {...(localFallback ? {} : { initialArtifacts, onArtifactsChange })}
      initialWorkspace={initialWorkspace}
      initialName={initialName}
      initialActiveId={initialActiveId}
      initialRoute={initialRoute}
      onActiveArtifactChange={onActiveArtifactChange}
      onAskAgentSam={(context) => {
        const store = useWorkStore.getState();
        const chatId = tab.parentChatId || store.activeChatId;
        if (!chatId) return;
        if (!store.chats.some(chat => chat.id === chatId)) return;
        const annotation = {
          id: crypto.randomUUID(),
          label: context.selection?.label || context.title,
          page: context.title,
          tag: context.selection?.kind || "canvas",
          text: ["Canvas " + (context.artifactId || "unsaved") + " (" + context.artifactType + ")",
            context.selection ? "Selected object: " + context.selection.id : "", context.selection?.source ? "Current editable SVG source:\n" + context.selection.source : "", context.comment ? "Comment: " + context.comment : ""].filter(Boolean).join(" · "),
        };
        store.setActiveChat(chatId);
        store.setPendingAnnotations(chatId, items => [...items.filter(item => item.text !== annotation.text), annotation].slice(-8));
        // On narrow screens the one lead composer lives in Chat, not on top
        // of the editor. The selection remains a removable context attachment.
        if (window.matchMedia("(max-width: 1099px)").matches) {
          store.setWorkSurface("chat");
          store.setSideOpen(false);
        }
      }}
      onOpenCode={() => useWorkStore.getState().setWorkSurface("code")}
      outputsOpen={outputsOpen}
      onToggleOutputs={() => {
        const store = useWorkStore.getState();
        const current = store.sideTabs.find((item) => item.id === store.activeSideTabId);
        if (current?.kind === "files") store.setActiveSideTab(tab.id);
        else store.setWorkSurface("files");
      }}
    /></div>
    <div role="status" className="flex shrink-0 items-center justify-end gap-1 border-t border-border/70 bg-background px-3 py-1 text-[10px] text-muted-foreground">
      {localFallback ? <>Local draft · not synced</> :
       saveState === "saving" ? <><LoaderCircle size={11} className="animate-spin"/> Saving</> :
       saveState === "error" ? <><AlertCircle size={11} className="text-destructive"/> Save issue</> :
       saveState === "saved" ? <><Check size={11}/> Saved</> : <>Private workspace</>}
    </div>
    {saveState === "error" ? <div role="alert" className="shrink-0 border-t border-destructive/40 bg-background px-3 py-2 text-xs">
      <p className="text-destructive">{loadingError === "revision_conflict" ? "A newer revision exists. Your unsaved edits are retained while this editor is open; export them before closing." : "Could not save changes. Your edits remain in this editor."}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="rounded-md border border-border px-3 py-2" onClick={retrySave}>Retry save</button>
        <button type="button" className="rounded-md border border-border px-3 py-2" onClick={exportUnsaved}>Export unsaved edits</button>
      </div>
    </div> : null}
  </div>;
}
