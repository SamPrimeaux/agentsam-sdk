export type MediaKind = "all" | "image" | "video" | "model" | "file";
export type MediaSource = "cf_images" | "stream" | "r2" | "local";
export type MediaProvider = "cf_images" | "r2" | "stream" | "drive" | "local" | "other";

export type MediaAsset = {
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
  meta?: { variants?: string[]; require_signed_urls?: boolean; [key: string]: unknown };
  duration_ms?: number | null;
  width?: number | null;
  height?: number | null;
  folder?: string;
  local_ref?: string;
  local_directory?: boolean;
  created_at?: string | null;
};

export type R2Bucket = { name: string; creation_date?: string | null };

export type CfFamily = { status?: string; available?: boolean; count?: number | null; error?: string | null };

export type CfResources = {
  ok?: boolean;
  status?: string;
  account?: { id?: string } | null;
  r2?: CfFamily & { buckets?: R2Bucket[]; cursor?: string | null; truncated?: boolean };
  images?: CfFamily & { delivery_hash?: string | null };
  stream?: CfFamily & { customer_code?: string | null };
  missing_scopes?: string[];
  connect_url?: string;
  reconnect_url?: string;
  error?: string;
};

export type AccountChoice = { connectionId?: string; cloudflareAccountId?: string; accountLabel?: string };

/** Typed failure so the UI never has to parse prose to pick the right recovery action. */
export type LibraryError = { kind: "reconnect" | "account" | "session" | "generic"; message: string; connectUrl?: string };

export type MediaSurface = { kind: MediaKind; title: string; source: MediaSource };

const SURFACES: Array<{ match: RegExp } & MediaSurface> = [
  { match: /^\/media\/images(?:\/|$)/, kind: "image", title: "Images", source: "cf_images" },
  { match: /^\/media\/videos(?:\/|$)/, kind: "video", title: "Videos", source: "stream" },
  { match: /^\/media\/models(?:\/|$)/, kind: "model", title: "Models", source: "r2" },
  { match: /^\/media\/files(?:\/|$)/, kind: "file", title: "All files", source: "r2" },
  { match: /^\/media(?:\/|$)/, kind: "all", title: "Media Library", source: "cf_images" },
];

export function resolveMediaSurface(pathname: string): MediaSurface {
  const hit = SURFACES.find((entry) => entry.match.test(pathname)) || SURFACES[SURFACES.length - 1];
  return { kind: hit.kind, title: hit.title, source: hit.source };
}

/** Keep OAuth return on Media Library even if discovery supplies Settings. */
export function mediaConnectUrl(raw?: string | null, returnTo = "/media") {
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

export function classifyAsset(asset: MediaAsset): MediaKind {
  const mime = String(asset.mime_type || asset.content_type || "").toLowerCase();
  const name = String(asset.filename || "").toLowerCase();
  if (asset.cloudflare_stream_uid || mime.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/.test(name)) return "video";
  if (mime.startsWith("image/") || asset.cloudflare_image_id || /\.(png|jpe?g|gif|webp|svg|avif)$/.test(name)) return "image";
  if (/\.(glb|gltf|obj|fbx|stl|3mf|usd|usda|usdc)$/.test(name) || asset.folder === "models") return "model";
  return "file";
}

export function providerOf(asset: MediaAsset): MediaProvider {
  const source = String(asset.source || "").toLowerCase();
  if (source === "cf_images" || asset.cloudflare_image_id) return "cf_images";
  if (source === "stream" || asset.cloudflare_stream_uid) return "stream";
  if (source === "r2" || asset.r2_key) return "r2";
  if (source === "drive" || source === "google-drive") return "drive";
  if (source === "local") return "local";
  return "other";
}

const PROVIDER_LABEL: Record<MediaProvider, string> = {
  cf_images: "Cloudflare Images",
  stream: "Cloudflare Stream",
  r2: "R2",
  drive: "Google Drive",
  local: "Local",
  other: "Library",
};

export function providerLabel(provider: MediaProvider) {
  return PROVIDER_LABEL[provider];
}

export function formatBytes(size?: number) {
  const n = Number(size || 0);
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatCount(n?: number | null) {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("en-US") : null;
}

export function extensionOf(asset: MediaAsset) {
  const match = /\.([a-z0-9]{2,5})$/i.exec(asset.filename || "");
  return match ? match[1].toUpperCase() : null;
}

export function identityLabel(asset: MediaAsset) {
  if (asset.cloudflare_image_id) return `CF Images · ${asset.cloudflare_image_id}`;
  if (asset.cloudflare_stream_uid) return `Stream · ${asset.cloudflare_stream_uid}`;
  if (asset.r2_bucket && asset.r2_key) return `R2 · ${asset.r2_bucket}/${asset.r2_key}`;
  if (asset.r2_key) return `R2 · ${asset.r2_key}`;
  return asset.id;
}

/** Exactly the operations backed by the current OAuth media API. */
export function canEditMediaMetadata(asset: MediaAsset) {
  return providerOf(asset) === "cf_images";
}

export function canDeleteMediaAsset(asset: MediaAsset) {
  return ["cf_images", "r2", "stream"].includes(providerOf(asset));
}

export function previewUrl(asset: MediaAsset) {
  return asset.thumbnail_url || asset.delivery_url || asset.url || "";
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  svg: "image/svg+xml", avif: "image/avif", mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  glb: "model/gltf-binary", gltf: "model/gltf+json", pdf: "application/pdf", json: "application/json",
  txt: "text/plain", md: "text/markdown",
};

export function guessMime(name: string) {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() || "";
  return MIME_BY_EXT[ext] || "application/octet-stream";
}

/** Surface decides which kinds belong; "All files" and "Media Library" show everything. */
export function matchesSurface(surfaceKind: MediaKind, asset: MediaAsset) {
  if (surfaceKind === "all" || surfaceKind === "file") return true;
  return classifyAsset(asset) === surfaceKind;
}

export type SortKey = "recent" | "name" | "size";

export function sortAssets(list: MediaAsset[], key: SortKey) {
  if (key === "recent") return list;
  const copy = [...list];
  if (key === "name") copy.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true, sensitivity: "base" }));
  if (key === "size") copy.sort((a, b) => Number(b.size_bytes || 0) - Number(a.size_bytes || 0));
  return copy;
}

export function toLibraryError(status: number, body: Record<string, unknown> | null | undefined): LibraryError {
  const b = body || {};
  const connectUrl = mediaConnectUrl(String(b.connect_url || b.reconnect_url || "") || null);
  const code = String(b.error || "");
  // An expired Studio session is not a revoked Cloudflare OAuth grant.
  // Avoid sending an authenticated account through OAuth for every 401.
  if (code === "authentication_required" || code === "unauthorized" || (status === 401 && !code)) {
    return { kind: "session", message: "Your Studio session needs sign-in. Your Cloudflare authorization is unchanged." };
  }
  if (code === "cloudflare_reconnect_required" || code === "cloudflare_authorization_required"
      || code === "cloudflare_credential_required" || code === "cloudflare_token_required") {
    return { kind: "reconnect", message: "Cloudflare needs authorization again. Your saved media remains unchanged.", connectUrl };
  }
  if (status === 409 || code === "cloudflare_account_selection_required") {
    return { kind: "account", message: "Choose which Cloudflare account to browse." };
  }
  return { kind: "generic", message: String(b.message || code || `Request failed (${status})`), connectUrl };
}
