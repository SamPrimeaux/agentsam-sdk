import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  Box,
  ChevronLeft,
  ChevronRight,
  Film,
  FileStack,
  FolderOpen,
  Grid2X2,
  Images,
  List,
  Loader2,
  Maximize2,
  RefreshCw,
  X,
} from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { RedirectToSignIn } from "@/lib/auth/gates";
import "./media-library.css";

type MediaKind = "all" | "image" | "video" | "model" | "file";
type ProviderFilter = "all" | "cf_images" | "r2" | "stream" | "drive" | "local";

type MediaAsset = {
  id: string;
  filename: string;
  content_type?: string;
  mime_type?: string;
  size_bytes?: number;
  url?: string;
  delivery_url?: string;
  thumbnail_url?: string;
  source?: string;
  r2_bucket?: string | null;
  r2_key?: string | null;
  cloudflare_image_id?: string | null;
  cloudflare_stream_uid?: string | null;
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  folder?: string;
};

type CfResources = {
  ok?: boolean;
  status?: string;
  account?: { id?: string } | null;
  r2?: {
    status?: string;
    available?: boolean;
    buckets?: Array<{ name: string; creation_date?: string | null }>;
    count?: number;
    error?: string | null;
    cursor?: string | null;
  };
  images?: { status?: string; available?: boolean; count?: number; delivery_hash?: string | null; error?: string | null };
  stream?: { status?: string; available?: boolean; count?: number; customer_code?: string | null; error?: string | null };
  missing_scopes?: string[];
  connect_url?: string;
  reconnect_url?: string;
  error?: string;
};

const KIND_FROM_PATH: Array<{ match: RegExp; kind: MediaKind; title: string }> = [
  { match: /^\/media\/images(?:\/|$)/, kind: "image", title: "Images" },
  { match: /^\/media\/videos(?:\/|$)/, kind: "video", title: "Videos" },
  { match: /^\/media\/models(?:\/|$)/, kind: "model", title: "Models" },
  { match: /^\/media\/files(?:\/|$)/, kind: "file", title: "All files" },
  { match: /^\/media(?:\/|$)/, kind: "all", title: "Media Library" },
];

function resolveMediaSurface(pathname: string) {
  return KIND_FROM_PATH.find((entry) => entry.match.test(pathname)) || KIND_FROM_PATH[KIND_FROM_PATH.length - 1];
}

/** Keep OAuth return on Media Library even if discovery supplies Settings. */
function mediaConnectUrl(raw?: string | null, returnTo = "/media") {
  const fallback = `/api/connections/cloudflare/start?packs=media,data&return_to=${encodeURIComponent(returnTo)}`;
  if (!raw) return fallback;
  try {
    const url = new URL(raw, typeof window !== "undefined" ? window.location.origin : "https://agentsam.local");
    url.searchParams.set("return_to", returnTo);
    return `${url.pathname}${url.search}`;
  } catch {
    return fallback;
  }
}

function classifyAsset(asset: MediaAsset): MediaKind {
  const mime = String(asset.mime_type || asset.content_type || "").toLowerCase();
  const name = String(asset.filename || "").toLowerCase();
  if (asset.cloudflare_stream_uid || mime.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/.test(name)) return "video";
  if (mime.startsWith("image/") || asset.cloudflare_image_id || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(name)) return "image";
  if (/\.(glb|gltf|obj|fbx|stl|3mf|usd|usda|usdc)$/.test(name) || asset.folder === "models") return "model";
  return "file";
}

function providerOf(asset: MediaAsset): ProviderFilter {
  const source = String(asset.source || "").toLowerCase();
  if (source === "cf_images" || asset.cloudflare_image_id) return "cf_images";
  if (source === "stream" || asset.cloudflare_stream_uid) return "stream";
  if (source === "r2" || asset.r2_key) return "r2";
  if (source === "drive" || source === "google-drive") return "drive";
  if (source === "local") return "local";
  return "all";
}

function formatBytes(size?: number) {
  const n = Number(size || 0);
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function identityLabel(asset: MediaAsset) {
  if (asset.cloudflare_image_id) return `CF Images · ${asset.cloudflare_image_id}`;
  if (asset.cloudflare_stream_uid) return `Stream · ${asset.cloudflare_stream_uid}`;
  if (asset.r2_bucket && asset.r2_key) return `R2 · ${asset.r2_bucket}/${asset.r2_key}`;
  if (asset.r2_key) return `R2 · ${asset.r2_key}`;
  return asset.id;
}

function previewUrl(asset: MediaAsset) {
  return asset.thumbnail_url || asset.delivery_url || asset.url || "";
}

function KindIcon({ kind }: { kind: MediaKind }) {
  if (kind === "video") return <Film size={18} />;
  if (kind === "model") return <Box size={18} />;
  if (kind === "file") return <FileStack size={18} />;
  if (kind === "all") return <FolderOpen size={18} />;
  return <Images size={18} />;
}

/**
 * First-party Media Library. MovieMode stays under /admin/moviemode.
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

  return <MediaLibraryBody surface={surface} />;
}

function MediaLibraryBody({
  surface,
}: {
  surface: { kind: MediaKind; title: string };
}) {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [resources, setResources] = useState<CfResources | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState<ProviderFilter>("all");
  const [grid, setGrid] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeBucket, setActiveBucket] = useState<string | null>(null);
  const [bucketObjects, setBucketObjects] = useState<MediaAsset[]>([]);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [cfAccountId, setCfAccountId] = useState<string>("");
  const [accountChoices, setAccountChoices] = useState<Array<{ connectionId?: string; cloudflareAccountId?: string; accountLabel?: string }>>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mediaSource =
        surface.kind === "video" ? "stream"
          : surface.kind === "image" ? "cf_images"
            : surface.kind === "file" || surface.kind === "model" ? "r2"
              : "cf_images";
      // provider=cloudflare — never depend on IAM_API for user-owned CF gallery (#419).
      const mediaQs = new URLSearchParams({
        page: "1",
        per_page: "96",
        source: mediaSource,
        provider: "cloudflare",
      });
      if (cfAccountId) mediaQs.set("account_id", cfAccountId);
      const resourceQs = new URLSearchParams({ per_page: "50", return_to: "/media" });
      if (cfAccountId) resourceQs.set("connection_id", cfAccountId);
      const [mediaRes, cfRes] = await Promise.all([
        fetch(`/api/admin/media?${mediaQs}`, {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }),
        fetch(`/api/connections/cloudflare/resources?${resourceQs}`, {
          credentials: "same-origin",
          headers: { accept: "application/json" },
        }),
      ]);
      const mediaBody = await mediaRes.json().catch(() => ({}));
      const cfBody = await cfRes.json().catch(() => ({}));
      const accounts = Array.isArray(mediaBody?.accounts)
        ? mediaBody.accounts
        : Array.isArray(cfBody?.accounts)
          ? cfBody.accounts
          : [];
      if (accounts.length) setAccountChoices(accounts);
      if (!mediaRes.ok) {
        const connectUrl = String(mediaBody?.connect_url || cfBody?.connect_url || "").trim();
        if (mediaRes.status === 401 || mediaBody?.error === "cloudflare_reconnect_required") {
          setError(
            connectUrl
              ? `Cloudflare reconnection required. Open ${connectUrl}`
              : String(mediaBody?.message || mediaBody?.error || "Cloudflare reconnection required"),
          );
        } else if (mediaRes.status === 409 || mediaBody?.error === "cloudflare_account_selection_required") {
          setError("Select a Cloudflare account to browse media for that grant.");
        } else {
          setError(String(mediaBody?.message || mediaBody?.error || `Media API ${mediaRes.status}`));
        }
        setAssets([]);
      } else {
        const list = Array.isArray(mediaBody?.assets)
          ? mediaBody.assets
          : Array.isArray(mediaBody?.images)
            ? mediaBody.images
            : Array.isArray(mediaBody?.data)
              ? mediaBody.data
              : [];
        setAssets(list.map((row: MediaAsset) => ({ ...row, id: String(row.id || row.cloudflare_image_id || row.cloudflare_stream_uid || crypto.randomUUID()) })));
      }
      setResources(cfBody && typeof cfBody === "object" ? cfBody : null);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }, [surface.kind, cfAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openBucket = useCallback(async (bucket: string) => {
    setActiveBucket(bucket);
    setBucketLoading(true);
    setBucketObjects([]);
    try {
      const objectQs = new URLSearchParams({ per_page: "100" });
      if (cfAccountId) objectQs.set("connection_id", cfAccountId);
      const res = await fetch(
        `/api/connections/cloudflare/r2/buckets/${encodeURIComponent(bucket)}/objects?${objectQs}`,
        { credentials: "same-origin", headers: { accept: "application/json" } },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(String(body?.message || body?.error || `R2 list failed (${res.status})`));
        return;
      }
      const objects = Array.isArray(body?.objects) ? body.objects : [];
      setBucketObjects(objects.map((row: { key: string; size?: number; uploaded?: string | null }) => {
        const key = String(row.key || "");
        const name = key.split("/").pop() || key;
        return {
          id: `r2:${bucket}:${key}`,
          filename: name,
          size_bytes: Number(row.size || 0) || 0,
          source: "r2",
          r2_bucket: bucket,
          r2_key: key,
          content_type: guessMime(name),
          mime_type: guessMime(name),
        } satisfies MediaAsset;
      }));
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setBucketLoading(false);
    }
  }, [cfAccountId]);

  const catalog = activeBucket ? bucketObjects : assets;

  const visible = useMemo(() => {
    return catalog.filter((asset) => {
      const kind = classifyAsset(asset);
      if (surface.kind === "image" && kind !== "image") return false;
      if (surface.kind === "video" && kind !== "video") return false;
      if (surface.kind === "model" && kind !== "model") return false;
      if (surface.kind === "file" && kind === "image") return true; // files view includes everything
      const q = query.trim().toLowerCase();
      if (q && !asset.filename.toLowerCase().includes(q) && !identityLabel(asset).toLowerCase().includes(q)) {
        return false;
      }
      if (provider !== "all" && providerOf(asset) !== provider) return false;
      return true;
    });
  }, [catalog, surface.kind, query, provider]);

  const selectedIndex = visible.findIndex((a) => a.id === selectedId);
  const selected = selectedIndex >= 0 ? visible[selectedIndex] : null;

  const connectUrl = mediaConnectUrl(resources?.connect_url || resources?.reconnect_url, "/media");

  return (
    <div className="agentsam-media-library" data-agentsam-media-library={surface.kind}>
      <header className="agentsam-media-library__header">
        <span className="agentsam-media-library__mark" aria-hidden="true">
          <KindIcon kind={surface.kind} />
        </span>
        <div className="agentsam-media-library__titles">
          <h1>{surface.title}</h1>
          <p>
            {surface.kind === "all"
              ? "Universal gallery across Cloudflare Images, R2, Stream, and connected providers. MovieMode stays under Apps."
              : `Filtered Media Library · ${surface.title}`}
          </p>
        </div>
        <div className="agentsam-media-library__header-actions">
          <a className="agentsam-media-btn" href="/admin/moviemode">Open MovieMode</a>
          <button type="button" className="agentsam-media-btn" onClick={() => void load()} aria-label="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </header>

      <ConnectionStrip resources={resources} connectUrl={connectUrl} />

      {accountChoices.length > 1 ? (
        <div className="agentsam-media-toolbar" role="group" aria-label="Cloudflare account">
          <label>
            Cloudflare account
            <select
              aria-label="Select Cloudflare account"
              value={cfAccountId}
              onChange={(e) => {
                const next = e.target.value;
                setCfAccountId(next);
                if (!next) return;
                void fetch("/api/connections/cloudflare/select", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { accept: "application/json", "content-type": "application/json" },
                  body: JSON.stringify({ account_id: next, connection_id: next }),
                }).catch(() => {
                  /* selection still applies for this session via query param */
                });
              }}
            >
              <option value="">Select account…</option>
              {accountChoices.map((row) => {
                const id = String(row.cloudflareAccountId || row.connectionId || "");
                return (
                  <option key={id} value={id}>
                    {row.accountLabel || id}
                  </option>
                );
              })}
            </select>
          </label>
        </div>
      ) : null}

      {resources?.r2?.buckets?.length ? (
        <div className="agentsam-media-buckets" role="navigation" aria-label="R2 buckets">
          <button
            type="button"
            className={!activeBucket ? "is-active" : undefined}
            onClick={() => { setActiveBucket(null); setBucketObjects([]); }}
          >
            Library
          </button>
          {resources.r2.buckets.map((bucket) => (
            <button
              key={bucket.name}
              type="button"
              className={activeBucket === bucket.name ? "is-active" : undefined}
              onClick={() => void openBucket(bucket.name)}
            >
              {bucket.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="agentsam-media-toolbar">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or provider id"
          aria-label="Search media"
        />
        <label>
          Provider
          <select aria-label="Filter by provider" value={provider} onChange={(e) => setProvider(e.target.value as ProviderFilter)}>
            <option value="all">All</option>
            <option value="cf_images">Cloudflare Images</option>
            <option value="r2">R2</option>
            <option value="stream">Stream</option>
            <option value="drive">Drive</option>
            <option value="local">Local</option>
          </select>
        </label>
        <span className="agentsam-media-count" aria-live="polite">{visible.length} items</span>
        <button type="button" className={!grid ? "is-active" : undefined} onClick={() => setGrid(false)} aria-label="List view">
          <List size={15} />
        </button>
        <button type="button" className={grid ? "is-active" : undefined} onClick={() => setGrid(true)} aria-label="Grid view">
          <Grid2X2 size={15} />
        </button>
      </div>

      <div className="agentsam-media-body">
        {loading || bucketLoading ? (
          <div className="agentsam-media-skeleton-grid" aria-busy="true">
            {Array.from({ length: 12 }).map((_, i) => <div key={i} className="agentsam-media-skeleton" />)}
          </div>
        ) : error ? (
          <div className="agentsam-media-empty is-error" role="alert">
            <strong>Could not load media</strong>
            <p>{error}</p>
            <button type="button" className="agentsam-media-btn" onClick={() => void load()}>Retry</button>
          </div>
        ) : !visible.length ? (
          <div className="agentsam-media-empty">
            <strong>{catalog.length ? "No matching assets" : activeBucket ? "Bucket is empty" : "No registered media yet"}</strong>
            <p>
              Empty results are not proof a provider is disconnected. Connect Cloudflare OAuth under Settings → Integrations for Images, R2, or Stream — InnerAnimalMedia is only used when you explicitly select provider=inneranimalmedia.
            </p>
            <a className="agentsam-media-btn" href={connectUrl}>Manage Cloudflare connection</a>
          </div>
        ) : (
          <div className={grid ? "agentsam-media-grid" : "agentsam-media-list"}>
            {visible.map((asset) => {
              const kind = classifyAsset(asset);
              const preview = previewUrl(asset);
              const duration = formatDuration(asset.duration_ms);
              return (
                <button
                  key={asset.id}
                  type="button"
                  className={`agentsam-media-card${selectedId === asset.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(asset.id)}
                >
                  <div className={`agentsam-media-thumb is-${kind}`}>
                    {kind === "image" && preview ? (
                      <img src={preview} alt="" loading="lazy" decoding="async" />
                    ) : kind === "video" && preview ? (
                      <>
                        <img src={preview} alt="" loading="lazy" decoding="async" />
                        {duration ? <span className="agentsam-media-duration">{duration}</span> : null}
                      </>
                    ) : (
                      <span className="agentsam-media-file-glyph">
                        <KindIcon kind={kind} />
                      </span>
                    )}
                  </div>
                  <div className="agentsam-media-card-meta">
                    <strong title={asset.filename}>{asset.filename}</strong>
                    <span>{providerOf(asset)} · {formatBytes(asset.size_bytes)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected ? (
        <MediaViewer
          asset={selected}
          onClose={() => setSelectedId(null)}
          onPrev={selectedIndex > 0 ? () => setSelectedId(visible[selectedIndex - 1].id) : undefined}
          onNext={selectedIndex < visible.length - 1 ? () => setSelectedId(visible[selectedIndex + 1].id) : undefined}
        />
      ) : null}
    </div>
  );
}

/** Failure states are labelled explicitly — a failed probe is never shown as "0 buckets". */
function familyLabel(
  name: string,
  fam?: { status?: string; count?: number | null } | null,
  connectedDetail?: string,
) {
  const status = fam?.status || "unknown";
  if (status === "connected") return `${name}: ${connectedDetail || "connected"}`;
  if (status === "empty") return `${name}: empty`;
  if (status === "needs_scope") return `${name}: permission required`;
  if (status === "unavailable") return `${name}: not enabled`;
  if (status === "error") return `${name}: provider error`;
  if (status === "not_connected") return `${name}: not connected`;
  return `${name}: ${status}`;
}

function ConnectionStrip({
  resources,
  connectUrl,
}: {
  resources: CfResources | null;
  connectUrl: string;
}) {
  if (!resources) {
    return (
      <div className="agentsam-media-connection is-loading">
        Checking Cloudflare connection…
      </div>
    );
  }
  const status = resources.status || "unknown";
  const buckets = resources.r2?.buckets?.length ?? 0;
  const missing = resources.missing_scopes || [];
  return (
    <div className={`agentsam-media-connection is-${status}`}>
      <div>
        <strong>Cloudflare</strong>
        <span>
          {status === "not_connected" ? "Not connected"
            : status === "needs_scope" ? "Connected — additional permissions required"
              : status === "partial" ? "Connected — some media APIs limited"
                : status === "empty" ? "Connected — no media resources found"
                  : status === "error" ? `Error · ${resources.error || resources.r2?.error || "probe failed"}`
                    : `Connected · account ${resources.account?.id || "—"}`}
        </span>
        <span>
          {familyLabel("R2", resources.r2, `${buckets} bucket${buckets === 1 ? "" : "s"}`)}
          {" · "}{familyLabel("Images", resources.images)}
          {" · "}{familyLabel("Stream", resources.stream)}
        </span>
        {(["r2", "images", "stream"] as const).map((key) => {
          const fam = resources[key] as { status?: string; error?: string | null } | undefined;
          if (!fam?.error || !["error", "unavailable", "needs_scope"].includes(String(fam.status))) return null;
          return <span key={key} role="alert">{key.toUpperCase()} · {fam.error}</span>;
        })}
        {missing.length ? <span>Missing scopes: {missing.slice(0, 6).join(", ")}</span> : null}
      </div>
      <a className="agentsam-media-btn" href={connectUrl}>
        {status === "not_connected" ? "Connect Cloudflare" : "Reconnect / expand scopes"}
      </a>
    </div>
  );
}

function MediaViewer({
  asset,
  onClose,
  onPrev,
  onNext,
}: {
  asset: MediaAsset;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}) {
  const kind = classifyAsset(asset);
  const preview = previewUrl(asset);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && onPrev) onPrev();
      if (event.key === "ArrowRight" && onNext) onNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div className="agentsam-media-viewer" role="dialog" aria-modal="true" aria-label={asset.filename}>
      <div className="agentsam-media-viewer__chrome">
        <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <strong>{asset.filename}</strong>
        <div className="agentsam-media-viewer__spacer" />
        <button type="button" disabled={!onPrev} onClick={onPrev} aria-label="Previous"><ChevronLeft size={16} /></button>
        <button type="button" disabled={!onNext} onClick={onNext} aria-label="Next"><ChevronRight size={16} /></button>
        <button type="button" onClick={() => setInspectorOpen((v) => !v)} aria-pressed={inspectorOpen}>
          Inspector
        </button>
        {preview ? (
          <a className="agentsam-media-btn" href={preview} target="_blank" rel="noopener noreferrer">
            <Maximize2 size={14} /> Open
          </a>
        ) : null}
      </div>
      <div className="agentsam-media-viewer__stage">
        <div className="agentsam-media-viewer__preview">
          {kind === "image" && preview ? (
            <img src={preview} alt={asset.filename} />
          ) : kind === "video" && preview ? (
            <div className="agentsam-media-viewer__video-poster">
              <img src={preview} alt="" />
              <p>Poster only — full Stream playback opens via Open when authorized.</p>
            </div>
          ) : (
            <div className="agentsam-media-viewer__file">
              <KindIcon kind={kind} />
              <p>No inline preview for this type. Provider identity is preserved below.</p>
            </div>
          )}
        </div>
        {inspectorOpen ? (
          <aside className="agentsam-media-viewer__inspector">
            <h2>Details</h2>
            <dl>
              <div><dt>Identity</dt><dd>{identityLabel(asset)}</dd></div>
              <div><dt>Provider</dt><dd>{providerOf(asset)}</dd></div>
              <div><dt>Type</dt><dd>{asset.mime_type || asset.content_type || kind}</dd></div>
              <div><dt>Size</dt><dd>{formatBytes(asset.size_bytes)}</dd></div>
              {asset.width || asset.height ? (
                <div><dt>Dimensions</dt><dd>{asset.width || "—"} × {asset.height || "—"}</dd></div>
              ) : null}
              {asset.duration_ms ? (
                <div><dt>Duration</dt><dd>{formatDuration(asset.duration_ms)}</dd></div>
              ) : null}
              {asset.r2_bucket ? <div><dt>Bucket</dt><dd>{asset.r2_bucket}</dd></div> : null}
              {asset.r2_key ? <div><dt>Key</dt><dd>{asset.r2_key}</dd></div> : null}
              {asset.cloudflare_image_id ? <div><dt>CF Image ID</dt><dd>{asset.cloudflare_image_id}</dd></div> : null}
              {asset.cloudflare_stream_uid ? <div><dt>Stream UID</dt><dd>{asset.cloudflare_stream_uid}</dd></div> : null}
            </dl>
            <div className="agentsam-media-viewer__actions">
              {preview ? <a className="agentsam-media-btn" href={preview} target="_blank" rel="noopener noreferrer">Open</a> : null}
              {preview ? (
                <button
                  type="button"
                  className="agentsam-media-btn"
                  onClick={() => void navigator.clipboard?.writeText(preview)}
                >
                  Copy link
                </button>
              ) : null}
              <a className="agentsam-media-btn" href={`/admin/moviemode?import=${encodeURIComponent(asset.id)}`}>
                Use in MovieMode
              </a>
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function guessMime(name: string) {
  const lower = name.toLowerCase();
  if (/\.png$/.test(lower)) return "image/png";
  if (/\.jpe?g$/.test(lower)) return "image/jpeg";
  if (/\.gif$/.test(lower)) return "image/gif";
  if (/\.webp$/.test(lower)) return "image/webp";
  if (/\.svg$/.test(lower)) return "image/svg+xml";
  if (/\.mp4$/.test(lower)) return "video/mp4";
  if (/\.webm$/.test(lower)) return "video/webm";
  if (/\.pdf$/.test(lower)) return "application/pdf";
  if (/\.glb$/.test(lower)) return "model/gltf-binary";
  return "application/octet-stream";
}
