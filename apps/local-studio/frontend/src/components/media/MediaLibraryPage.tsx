import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { FolderOpen, Grid2X2, List, Loader2, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { BucketPicker, loadPinnedBuckets, savePinnedBuckets } from "./BucketPicker";
import { ConnectionStatus } from "./ConnectionStatus";
import { MediaItems } from "./MediaGrid";
import { MediaViewer } from "./MediaViewer";
import { createLocalStudioContentHostBridge, rememberLocalMediaDirectory, restoreLocalMediaDirectory } from "@/lib/content/localContentHost";
import { listLocalMedia } from "./localMediaSource";
import {
  formatCount,
  guessMime,
  matchesSurface,
  mediaConnectUrl,
  previewUrl,
  canEditMediaMetadata,
  resolveMediaSurface,
  sortAssets,
  toLibraryError,
  type AccountChoice,
  type CfResources,
  type LibraryError,
  type MediaAsset,
  type MediaSource,
  type MediaSurface,
  type R2Bucket,
  type SortKey,
} from "./media-utils";
import "./media-library.css";

const PAGE_SIZE = 100;

// Remember only display preferences, NEVER OAuth access or refresh credentials.
// The encrypted OAuth grant remains on the server in user_oauth_tokens.
function mediaPreference(owner: string, key: "account" | "bucket", cfAccount = "") {
  try { return localStorage.getItem(`agentsam.media.v1.${owner}.${key}${key === "bucket" ? `.${cfAccount || "default"}` : ""}`) || ""; }
  catch { return ""; }
}
function rememberMediaPreference(owner: string, key: "account" | "bucket", value: string, cfAccount = "") {
  try {
    const path = `agentsam.media.v1.${owner}.${key}${key === "bucket" ? `.${cfAccount || "default"}` : ""}`;
    if (value) localStorage.setItem(path, value);
    else localStorage.removeItem(path);
  } catch { /* storage is optional; the server remains authoritative */ }
}

async function getJson(url: string) {
  const res = await fetch(url, { credentials: "same-origin", headers: { accept: "application/json" } });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { res, body };
}

async function getJsonWithPatch(id: string, qs: URLSearchParams, patch: { alt_text: string; folder: string }) {
  const res = await fetch("/api/admin/media/" + encodeURIComponent(id) + "?" + qs, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, any>;
  return { res, body };
}

function rowsFrom(body: Record<string, any>): MediaAsset[] {
  const list = Array.isArray(body?.assets) ? body.assets
    : Array.isArray(body?.images) ? body.images
      : Array.isArray(body?.data) ? body.data : [];
  return list.map((row: MediaAsset) => ({
    ...row,
    id: String(row.id || row.cloudflare_image_id || row.cloudflare_stream_uid || crypto.randomUUID()),
  }));
}

function mergeById(prev: MediaAsset[], next: MediaAsset[]) {
  const seen = new Set(prev.map((a) => a.id));
  return [...prev, ...next.filter((a) => !seen.has(a.id))];
}

/**
 * First-party Media Library over the user's own Cloudflare account (Images, Stream, R2).
 * MovieMode stays under /admin/moviemode.
 */
export function MediaLibraryPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const surface = resolveMediaSurface(pathname);
  const { user, isPending } = useCurrentUserState();

  if (isPending) {
    return (
      <div className="agentsam-media-library is-loading" role="status">
        <Loader2 className="agentsam-media-spin" size={18} /> Resolving account…
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;

  return <MediaLibraryBody key={String(user.id)} surface={surface} accountId={String(user.id)} returnTo={pathname} />;
}

function MediaLibraryBody({ surface, accountId, returnTo }: { surface: MediaSurface; accountId: string; returnTo: string }) {
  const [source, setSource] = useState<MediaSource>(surface.source);
  const localHost = useMemo(() => createLocalStudioContentHostBridge(), []);
  const [localRoot, setLocalRoot] = useState<string | null>(null);
  const [localFolders, setLocalFolders] = useState<Array<{ ref: string; name: string }>>([]);
  const [localBusy, setLocalBusy] = useState(false);
  const localUrls = useRef<string[]>([]);
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const localDirectory = localFolders.at(-1)?.ref || localRoot;

  useEffect(() => {
    let active = true;
    void restoreLocalMediaDirectory(accountId).then(async (ref) => {
      if (!active || !ref) return;
      const info = await localHost.stat(ref);
      if (!active) return;
      setLocalRoot(ref);
      setLocalFolders([{ ref, name: info.name || "Local folder" }]);
    }).catch(() => {});
    return () => { active = false; };
  }, [accountId, localHost]);

  useEffect(() => () => {
    localUrls.current.forEach((url) => URL.revokeObjectURL(url));
    localUrls.current = [];
  }, []);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<LibraryError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [resources, setResources] = useState<CfResources | null>(null);
  const [buckets, setBuckets] = useState<R2Bucket[]>([]);
  // Restore device preferences after hydration, never during the server render.
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [cfAccountId, setCfAccountId] = useState("");
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string[]>(() => loadPinnedBuckets());
  const [accountChoices, setAccountChoices] = useState<AccountChoice[]>([]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerIntent, setViewerIntent] = useState<"details" | "edit" | "delete">("details");
  const [confirmBatch, setConfirmBatch] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  const requestRef = useRef(0);
  const pageRef = useRef(1);
  const cursorRef = useRef<string | null>(null);

  const accountQs = useCallback((key: "connection_id" | "account_id", qs: URLSearchParams) => {
    if (cfAccountId) qs.set(key, cfAccountId);
    return qs;
  }, [cfAccountId]);

  // Route changes must not reset the authorized account or chosen provider.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("source");
    setSource(requested === "local" && surface.kind === "all" ? "local" : surface.source);
  }, [surface.source, surface.kind]);
  useEffect(() => {
    const preferredAccount = mediaPreference(accountId, "account");
    setCfAccountId(preferredAccount);
    setActiveBucket(mediaPreference(accountId, "bucket", preferredAccount) || null);
    setPreferencesReady(true);
  }, [accountId]);
  useEffect(() => {
    if (preferencesReady) rememberMediaPreference(accountId, "bucket", activeBucket || "", cfAccountId);
  }, [accountId, activeBucket, cfAccountId, preferencesReady]);
  useEffect(() => {
    if (preferencesReady) rememberMediaPreference(accountId, "account", cfAccountId);
  }, [accountId, cfAccountId, preferencesReady]);

  /* ---- account + connection resources (also the full R2 bucket list) ---- */
  useEffect(() => {
    if (!preferencesReady) return;
    let cancelled = false;
    (async () => {
      try {
        const qs = accountQs("connection_id", new URLSearchParams({ per_page: "200", return_to: "/media" }));
        const first = await getJson(`/api/connections/cloudflare/resources?${qs}`);
        if (cancelled) return;
        if (!first.res.ok) {
          if (Array.isArray(first.body?.accounts)) setAccountChoices(first.body.accounts);
          setResources({ ...first.body, status: "error" } as CfResources);
          setConnectionError(String(first.body?.message || first.body?.error || "Cloudflare discovery unavailable"));
          return;
        }
        setConnectionError(null);
        const accounts = Array.isArray(first.body?.accounts) ? first.body.accounts : [];
        if (accounts.length) setAccountChoices(accounts);
        setResources(first.body as CfResources);
        let all: R2Bucket[] = Array.isArray(first.body?.r2?.buckets) ? first.body.r2.buckets : [];
        let cursor: string | null = first.body?.r2?.cursor || null;
        // Follow cursors so the picker offers every bucket, not just the first page.
        for (let i = 0; i < 8 && cursor && first.body?.r2?.truncated !== false; i += 1) {
          const next = accountQs("connection_id", new URLSearchParams({ per_page: "200", return_to: "/media", cursor }));
          const page = await getJson(`/api/connections/cloudflare/resources?${next}`);
          if (cancelled) return;
          const more: R2Bucket[] = Array.isArray(page.body?.r2?.buckets) ? page.body.r2.buckets : [];
          if (!more.length) break;
          all = [...all, ...more.filter((b) => !all.some((x) => x.name === b.name))];
          const after: string | null = page.body?.r2?.cursor || null;
          cursor = after && after !== cursor ? after : null;
        }
        setBuckets(all);
        // A stored bucket may have been removed; keep the choice only if it exists.
        if (all.length) {
          setActiveBucket((current) => current && !all.some((bucket) => bucket.name === current) ? null : current);
        }
      } catch (cause) {
        if (!cancelled) {
          setResources({ status: "error" });
          setConnectionError(cause instanceof Error ? cause.message : "Could not check Cloudflare connection");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [accountQs, refreshTick, preferencesReady]);

  const pickLocalFolder = useCallback(async (useSaved = false) => {
    setLocalBusy(true);
    try {
      const ref = (useSaved ? await restoreLocalMediaDirectory(accountId, true) : null)
        || await localHost.pickDirectory?.({ title: "Choose a local media folder" });
      if (!ref) return;
      const details = await localHost.stat(ref);
      await rememberLocalMediaDirectory(ref, accountId);
      setLocalRoot(ref);
      setLocalFolders([{ ref, name: details.name || "Local folder" }]);
      setQuery("");
      setSource("local");
      setNotice(null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Local folder is unavailable in this browser.");
    } finally {
      setLocalBusy(false);
    }
  }, [accountId, localHost]);

  /* ---- assets for the current source ---- */
  const loadAssets = useCallback(async (append: boolean) => {
    const ticket = ++requestRef.current;
    if (append) setLoadingMore(true);
    else { setLoading(true); setError(null); setSelected(new Set()); }
    try {
      if (source === "local") {
        if (!localDirectory) {
          setAssets([]); setTotal(0); setHasMore(false);
          return;
        }
        const local = await listLocalMedia(localHost, localDirectory);
        if (ticket !== requestRef.current) {
          local.previewUrls.forEach((url) => URL.revokeObjectURL(url));
          return;
        }
        localUrls.current.forEach((url) => URL.revokeObjectURL(url));
        localUrls.current = local.previewUrls;
        setAssets(local.assets);
        setTotal(local.assets.length);
        setHasMore(false);
        if (local.truncated) setNotice("Showing the first 500 entries in this folder.");
        return;
      }
      if (source === "r2") {
        if (!activeBucket) {
          setAssets([]); setTotal(null); setHasMore(false);
          return;
        }
        const qs = accountQs("connection_id", new URLSearchParams({ per_page: String(PAGE_SIZE) }));
        if (append && cursorRef.current) qs.set("cursor", cursorRef.current);
        const { res, body } = await getJson(`/api/connections/cloudflare/r2/buckets/${encodeURIComponent(activeBucket)}/objects?${qs}`);
        if (ticket !== requestRef.current) return;
        if (!res.ok) {
          setError(toLibraryError(res.status, body));
          if (!append) setAssets([]);
          return;
        }
        const objects: Array<{ key: string; size?: number; uploaded?: string | null }> = Array.isArray(body?.objects) ? body.objects : [];
        const rows = objects.map((row) => {
          const key = String(row.key || "");
          const name = key.split("/").pop() || key;
          return {
            id: `r2:${activeBucket}:${key}`,
            filename: name,
            size_bytes: Number(row.size || 0) || 0,
            source: "r2",
            r2_bucket: activeBucket,
            r2_key: key,
            created_at: row.uploaded || null,
            content_type: guessMime(name),
            mime_type: guessMime(name),
          } satisfies MediaAsset;
        });
        setAssets((prev) => (append ? mergeById(prev, rows) : rows));
        cursorRef.current = body?.cursor || null;
        setHasMore(Boolean(body?.truncated && body?.cursor));
        setTotal(null);
        return;
      }

      const nextPage = append ? pageRef.current + 1 : 1;
      const qs = accountQs("account_id", new URLSearchParams({
        page: String(nextPage),
        per_page: String(PAGE_SIZE),
        source,
        provider: "cloudflare", // user-owned Cloudflare media; never depends on IAM_API
      }));
      const { res, body } = await getJson(`/api/admin/media?${qs}`);
      if (ticket !== requestRef.current) return;
      if (Array.isArray(body?.accounts) && body.accounts.length) setAccountChoices(body.accounts);
      if (!res.ok) {
        setError(toLibraryError(res.status, body));
        if (!append) setAssets([]);
        return;
      }
      const rows = rowsFrom(body);
      setAssets((prev) => (append ? mergeById(prev, rows) : rows));
      pageRef.current = nextPage;
      setTotal(typeof body?.total === "number" ? body.total : null);
      setHasMore(Boolean(body?.pagination?.has_next));
    } catch (err) {
      if (ticket === requestRef.current) setError({ kind: "generic", message: String(err instanceof Error ? err.message : err) });
    } finally {
      if (ticket === requestRef.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [source, activeBucket, accountQs, localHost, localDirectory]);

  useEffect(() => {
    if (!preferencesReady) return;
    pageRef.current = 1;
    cursorRef.current = null;
    void loadAssets(false);
  }, [loadAssets, refreshTick, preferencesReady]);

  /* ---- derived ---- */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = assets.filter((asset) => {
      if (!matchesSurface(surface.kind, asset)) return false;
      if (!q) return true;
      return asset.filename.toLowerCase().includes(q) || (asset.r2_key || "").toLowerCase().includes(q);
    });
    return sortAssets(filtered, sort);
  }, [assets, surface.kind, query, sort]);

  const viewerIndex = visible.findIndex((a) => a.id === viewerId);
  const viewing = viewerIndex >= 0 ? visible[viewerIndex] : null;
  const connectUrl = mediaConnectUrl(resources?.connect_url || resources?.reconnect_url, returnTo);
  const notConnected = source !== "local" && (resources?.status === "not_connected" || error?.kind === "reconnect");

  const counts = {
    cf_images: resources?.images?.count ?? null,
    stream: resources?.stream?.count ?? null,
    r2: buckets.length || (resources?.r2?.count ?? null),
  };
  const tabs: Array<{ id: MediaSource; label: string; count: number | null }> = [
    { id: "cf_images", label: "Images", count: counts.cf_images },
    { id: "stream", label: "Videos", count: counts.stream },
    { id: "r2", label: "R2 buckets", count: counts.r2 },
    { id: "local", label: "Local", count: source === "local" ? total : null },
  ];

  /* ---- actions ---- */
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const togglePin = (name: string) => {
    setPinned((prev) => {
      const next = prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name];
      savePinnedBuckets(next);
      return next;
    });
  };

  const removeAssets = useCallback(async (list: MediaAsset[]) => {
    const failed: string[] = [];
    const removed = new Set<string>();
    for (const asset of list) {
      if (asset.source === "local") {
        failed.push(asset.filename);
        continue;
      }
      try {
        const qs = accountQs("connection_id", new URLSearchParams());
        const res = await fetch(`/api/admin/media/${encodeURIComponent(asset.id)}?${qs}`, {
          method: "DELETE",
          credentials: "same-origin",
          headers: { accept: "application/json" },
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body?.ok !== false) removed.add(asset.id); else failed.push(asset.filename);
      } catch {
        failed.push(asset.filename);
      }
    }
    if (removed.size) {
      setAssets((prev) => prev.filter((a) => !removed.has(a.id)));
      setSelected((prev) => new Set([...prev].filter((id) => !removed.has(id))));
      setTotal((prev) => (prev == null ? prev : Math.max(0, prev - removed.size)));
    }
    setNotice(failed.length
      ? `Deleted ${removed.size}. Could not delete ${failed.length}: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`
      : `Deleted ${removed.size} item${removed.size === 1 ? "" : "s"}.`);
    return failed.length === 0;
  }, [accountQs]);

  const showAsset = (id: string, intent: "details" | "edit" | "delete" = "details") => {
    setViewerIntent(intent);
    setViewerId(id);
  };

  const copyAssetLink = async (asset: MediaAsset) => {
    const link = previewUrl(asset);
    if (!link || asset.source === "local" || asset.meta?.require_signed_urls) {
      setNotice("This asset has no public URL to copy.");
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      setNotice("Copied delivery URL.");
    } catch {
      setNotice("Could not copy the URL. Try opening the asset instead.");
    }
  };

  const exportAssetPreview = async (asset: MediaAsset) => {
    const link = previewUrl(asset);
    if (!link) { setNotice("No downloadable preview is available."); return; }
    try {
      const response = await fetch(link, { credentials: "omit" });
      if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("No authorized downloadable preview");
      if (Number(response.headers.get("content-length") || 0) > 150 * 1024 * 1024) {
        throw new Error("Use Open for large media files");
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = asset.filename || "asset";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      setNotice("Exported the available preview. The original asset is unchanged.");
    } catch {
      setNotice("Preview export isn't available for this provider. Open the file instead.");
    }
  };

  const saveAssetMetadata = async (asset: MediaAsset, patch: { alt_text: string; folder: string }) => {
    if (!canEditMediaMetadata(asset)) return false;
    try {
      const qs = accountQs("connection_id", new URLSearchParams());
      const { res, body } = await getJsonWithPatch(asset.id, qs, patch);
      if (!res.ok || body?.ok === false) throw new Error(String(body?.error || res.status));
      setAssets((prev) => prev.map((current) => current.id === asset.id
        ? { ...current, ...body.asset, meta: { ...current.meta, ...body.asset?.meta, ...patch } }
        : current));
      setNotice("Cloudflare image metadata saved.");
      return true;
    } catch {
      setNotice("Couldn't save metadata. Nothing was changed.");
      return false;
    }
  };

  const uploadAssets = async (files: FileList | File[] | null) => {
    if (!files?.length || uploading) return;
    if (source !== "cf_images" && source !== "r2") {
      setNotice("Use the provider's dedicated upload workflow for this media type.");
      return;
    }
    if (source === "r2" && !activeBucket) {
      setNotice("Select the destination R2 bucket before uploading.");
      return;
    }
    const items = Array.from(files);
    if (source === "cf_images" && items.some((file) => !file.type.startsWith("image/"))) {
      setNotice("Cloudflare Images accepts image files. Select R2 for other files.");
      return;
    }
    const form = new FormData();
    items.forEach((file) => form.append("files", file, file.name));
    if (source === "r2" && activeBucket) {
      form.set("r2_bucket", activeBucket);
      form.set("derivative_role", "original");
    }
    const qs = accountQs("connection_id", new URLSearchParams({ provider: "cloudflare" }));
    setUploading(true);
    try {
      const res = await fetch("/api/admin/media?" + qs, {
        method: "POST", credentials: "same-origin", body: form, headers: { accept: "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      const uploaded = Number(body?.uploaded_count || 0);
      const failed = Number(body?.failed_count || (res.ok ? 0 : items.length));
      setNotice(uploaded
        ? "Uploaded " + uploaded + " asset(s)." + (failed ? " " + failed + " failed." : "")
        : "Upload failed: " + String(body?.message || body?.error || res.status));
      if (uploaded) setRefreshTick((tick) => tick + 1);
    } catch {
      setNotice("Upload failed. No assets have been removed or changed.");
    } finally {
      setUploading(false);
      if (fileUploadRef.current) fileUploadRef.current.value = "";
    }
  };

  const chooseSource = (next: MediaSource) => {
    if (next === source) return;
    setSource(next);
    setQuery("");
    setViewerId(null);
    setViewerIntent("details");
  };

  const selectedAssets = visible.filter((a) => selected.has(a.id));
  const openMediaItem = (id: string) => {
    const asset = visible.find((item) => item.id === id);
    if (source === "local" && asset?.local_directory && asset.local_ref) {
      setLocalFolders((folders) => [...folders, { ref: asset.local_ref!, name: asset.filename }]);
      setQuery("");
      return;
    }
    showAsset(id);
  };
  const subtitle = surface.kind === "all"
    ? "Browse connected Cloudflare media or your local device—without copying files to the cloud."
    : `Your Cloudflare ${surface.title.toLowerCase()}.`;
  const countLabel = total != null ? `${formatCount(total)} total` : `${formatCount(visible.length) ?? 0} shown`;

  return (
    <div className={viewing ? "agentsam-media-library is-inspecting" : "agentsam-media-library"} data-agentsam-media-library={surface.kind}>
      <header className="agentsam-media-header">
        <div className="agentsam-media-header__titles">
          <h1>{surface.title}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="agentsam-media-header__actions">
          {source === "local" ? <span className="agentsam-media-local-status"><FolderOpen size={14} /> Local device</span>
            : <ConnectionStatus resources={resources} bucketCount={buckets.length} connectUrl={connectUrl} />}
          {accountChoices.length > 1 ? (
            <select
              className="agentsam-media-select"
              aria-label="Cloudflare account"
              value={cfAccountId}
              onChange={(e) => {
                const next = e.target.value;
                setCfAccountId(next);
                setActiveBucket(mediaPreference(accountId, "bucket", next) || null);
                if (!next) return;
                void fetch("/api/connections/cloudflare/select", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { accept: "application/json", "content-type": "application/json" },
                  body: JSON.stringify({ account_id: next, connection_id: next }),
                }).catch(() => { /* selection still applies this session via the query parameter */ });
              }}
            >
              <option value="">Select account…</option>
              {accountChoices.map((row) => {
                const id = String(row.cloudflareAccountId || row.connectionId || "");
                return <option key={id} value={id}>{row.accountLabel || id}</option>;
              })}
            </select>
          ) : null}
          {(source === "cf_images" || source === "r2") ? (
            <>
              <input ref={fileUploadRef} type="file" multiple className="agentsam-media-upload-input"
                accept={source === "cf_images" ? "image/*" : undefined}
                aria-label="Select files to upload"
                onChange={(event) => { void uploadAssets(event.currentTarget.files); }} />
              <button type="button" className="agentsam-media-btn" disabled={uploading || (source === "r2" && !activeBucket)}
                title={source === "r2" && !activeBucket ? "Select an R2 bucket first" : "Upload to the selected provider"}
                onClick={() => fileUploadRef.current?.click()}>
                {uploading ? <Loader2 size={14} className="agentsam-media-spin" /> : <Upload size={14} />}
                {uploading ? "Uploading…" : "Upload"}
              </button>
            </>
          ) : null}
          <button type="button" className="agentsam-media-btn" onClick={() => setRefreshTick((n) => n + 1)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "agentsam-media-spin" : undefined} /> Refresh
          </button>
          <a className="agentsam-media-btn is-primary" href="/admin/moviemode">Open MovieMode</a>
        </div>
      </header>

      {notConnected ? (
        <div className="agentsam-media-body">
          <div className="agentsam-media-state">
            <strong>{error?.kind === "reconnect" ? "Reconnect Cloudflare" : "Connect Cloudflare"}</strong>
            <p>
              {error?.kind === "reconnect"
                ? error.message
                : "Authorize Cloudflare to browse your Images, Stream videos and R2 buckets here."}
            </p>
            <div className="agentsam-media-connect-actions">
              <a className="agentsam-media-btn is-primary" href={error?.connectUrl || connectUrl}>
                {error?.kind === "reconnect" ? "Reconnect" : "Connect Cloudflare"}
              </a>
              <button type="button" className="agentsam-media-btn" onClick={() => chooseSource("local")}>
                <FolderOpen size={14} /> Browse local files
              </button>
            </div>
            <div className="agentsam-media-settings-links">
              <a href="/settings/storage">Storage settings</a>
              <a href="/settings/customize?view=plugins">Plugins</a>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="agentsam-media-toolbar">
            <label className="agentsam-media-search">
              <Search size={15} aria-hidden="true" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={source === "r2" ? "Filter loaded objects" : "Search by name"}
                aria-label="Search media"
              />
            </label>
            {surface.kind === "all" ? (
            <div className="agentsam-media-tabs" role="tablist" aria-label="Source">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={source === tab.id}
                  className={source === tab.id ? "is-active" : undefined}
                  onClick={() => chooseSource(tab.id)}
                >
                  {tab.label}
                  {formatCount(tab.count) ? <small>{formatCount(tab.count)}</small> : null}
                </button>
              ))}
            </div>
            ) : null}
            {source === "local" ? (
              <div className="agentsam-media-local-controls">
                {localFolders.length > 1 ? (
                  <button type="button" className="agentsam-media-btn" onClick={() => { setLocalFolders((folders) => folders.slice(0, -1)); setQuery(""); }}>
                    Back
                  </button>
                ) : null}
                {localFolders.length ? <span title={localFolders.map((d) => d.name).join(" / ")}>{localFolders.map((d) => d.name).join(" / ")}</span> : null}
                <button type="button" className="agentsam-media-btn" disabled={localBusy} onClick={() => void pickLocalFolder(false)}>
                  <FolderOpen size={14} /> {localRoot ? "Change folder" : "Choose folder"}
                </button>
              </div>
            ) : null}
            {source === "r2" ? (
              <BucketPicker
                buckets={buckets}
                active={activeBucket}
                pinned={pinned}
                onPick={(name) => { setActiveBucket(name); setQuery(""); }}
                onTogglePin={togglePin}
              />
            ) : null}
            <span className="agentsam-media-toolbar__spacer" />
            <select className="agentsam-media-select" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
              <option value="recent">Recent</option>
              <option value="name">Name</option>
              <option value="size">Size</option>
            </select>
            <div className="agentsam-media-segment" role="group" aria-label="Layout">
              <button type="button" className={view === "list" ? "is-active" : undefined} onClick={() => setView("list")} aria-label="List view"><List size={15} /></button>
              <button type="button" className={view === "grid" ? "is-active" : undefined} onClick={() => setView("grid")} aria-label="Grid view"><Grid2X2 size={15} /></button>
            </div>
          </div>

          {connectionError && source !== "local" ? (
            <div className="agentsam-media-banner is-error" role="status">
              <span>Cloudflare status could not be verified: {connectionError}. Your account authorization has not been cleared.</span>
              <button type="button" className="agentsam-media-btn" onClick={() => setRefreshTick((n) => n + 1)}>Retry</button>
            </div>
          ) : null}
          {resources?.status === "needs_scope" ? (
            <div className="agentsam-media-banner" role="status">
              Some Cloudflare permissions are missing.{" "}
              <a href={connectUrl}>Reconnect to expand scopes</a>
            </div>
          ) : null}
          {notice ? (
            <div className="agentsam-media-banner" role="status">
              {notice}
              <button type="button" className="agentsam-media-icon" onClick={() => setNotice(null)} aria-label="Dismiss"><X size={14} /></button>
            </div>
          ) : null}

          <div className="agentsam-media-body">
            {loading ? (
              <div className="agentsam-media-grid" aria-busy="true">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="agentsam-media-skeleton" />
                ))}
              </div>
            ) : error && error.kind !== "reconnect" ? (
              <div className="agentsam-media-state is-error" role="alert">
                <strong>{error.kind === "account" ? "Choose an account" : error.kind === "session" ? "Sign in to Studio" : "Couldn’t load media"}</strong>
                <p>{error.message}</p>
                {error.kind === "session" ? <a className="agentsam-media-btn" href="/auth/login">Sign in</a>
                  : <button type="button" className="agentsam-media-btn" onClick={() => setRefreshTick((n) => n + 1)}>Try again</button>}
              </div>
            ) : source === "local" && !localDirectory ? (
              <div className="agentsam-media-state">
                <strong>Browse files on this device</strong>
                <p>Choose a folder to view images, videos, models and files. Nothing is uploaded or shared.</p>
                <div className="agentsam-media-connect-actions">
                  <button type="button" className="agentsam-media-btn is-primary" disabled={localBusy} onClick={() => void pickLocalFolder(false)}>
                    <FolderOpen size={14} /> Connect local folder
                  </button>
                </div>
              </div>
            ) : source === "r2" && !activeBucket ? (
              <div className="agentsam-media-state">
                <strong>Choose a bucket</strong>
                <p>{buckets.length ? `${formatCount(buckets.length)} R2 buckets are available. Pin the ones you use most.` : "No R2 buckets were found for this account."}</p>
                {pinned.length ? (
                  <div className="agentsam-media-chips">
                    {pinned.filter((name) => buckets.some((b) => b.name === name)).map((name) => (
                      <button key={name} type="button" className="agentsam-media-btn" onClick={() => setActiveBucket(name)}>{name}</button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : !visible.length ? (
              <div className="agentsam-media-state">
                <strong>{assets.length ? "Nothing matches" : source === "r2" ? "This bucket is empty" : "No media yet"}</strong>
                <p>{assets.length ? "Try a different search." : "Files you add to Cloudflare will appear here."}</p>
              </div>
            ) : (
              <>
                <div className="agentsam-media-count">{countLabel}</div>
                <MediaItems
                  assets={visible}
                  view={view}
                  selected={selected}
                  anySelected={selected.size > 0}
                  inspectingId={viewerId}
                  onOpen={openMediaItem}
                  onToggle={toggle}
                  onEdit={(asset) => showAsset(asset.id, "edit")}
                  onCopy={(asset) => { void copyAssetLink(asset); }}
                  onExport={(asset) => { void exportAssetPreview(asset); }}
                  onDelete={(asset) => showAsset(asset.id, "delete")}
                />
                {hasMore ? (
                  <div className="agentsam-media-more">
                    <button type="button" className="agentsam-media-btn" disabled={loadingMore} onClick={() => void loadAssets(true)}>
                      {loadingMore ? <Loader2 size={14} className="agentsam-media-spin" /> : null}
                      Load more
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}

      {selected.size > 0 ? (
        <div className="agentsam-media-batch" role="toolbar" aria-label="Selection">
          <span>{selected.size} selected</span>
          <button
            type="button"
            className="agentsam-media-btn"
            onClick={() => {
              const links = selectedAssets.filter((item) => item.source !== "local").map(previewUrl).filter(Boolean).join("\n");
              if (links) void navigator.clipboard?.writeText(links);
              setNotice(links ? `Copied ${links.split("\n").length} link(s).` : "These items have no public link.");
            }}
          >
            Copy links
          </button>
          {source === "local" ? <span className="agentsam-media-local-note">Local files are read-only here</span> : confirmBatch ? (
            <>
              <button
                type="button"
                className="agentsam-media-btn is-danger"
                onClick={async () => { await removeAssets(selectedAssets); setConfirmBatch(false); }}
              >
                <Trash2 size={14} /> Delete {selected.size} permanently
              </button>
              <button type="button" className="agentsam-media-btn" onClick={() => setConfirmBatch(false)}>Cancel</button>
            </>
          ) : (
            <button type="button" className="agentsam-media-btn is-ghost-danger" onClick={() => setConfirmBatch(true)}>
              <Trash2 size={14} /> Delete
            </button>
          )}
          <button type="button" className="agentsam-media-btn" onClick={() => { setSelected(new Set()); setConfirmBatch(false); }}>Clear</button>
        </div>
      ) : null}

      {viewing ? (
        <MediaViewer
          asset={viewing}
          intent={viewerIntent}
          onClose={() => { setViewerId(null); setViewerIntent("details"); }}
          onPrev={viewerIndex > 0 ? () => showAsset(visible[viewerIndex - 1].id) : undefined}
          onNext={viewerIndex < visible.length - 1 ? () => showAsset(visible[viewerIndex + 1].id) : undefined}
          onSaveMetadata={saveAssetMetadata}
          onExport={exportAssetPreview}
          onDelete={async (asset) => {
            const ok = await removeAssets([asset]);
            if (ok) setViewerId(null);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}
