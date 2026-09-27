import type { ProviderRef } from "../core/source.js";
import type {
  ContentProvider,
  DeliveryOptions,
  FetchLike,
  ProviderListOptions,
  ProviderListResult,
  ProviderObject,
  ProviderUploadInput,
} from "./types.js";

export interface CloudflareStreamConfig {
  accountId: string;
  apiToken: string;
  /** customer-{code}.cloudflarestream.com subdomain code. */
  customerCode: string;
  fetch?: FetchLike;
  baseUrl?: string;
}

interface StreamRecord {
  uid: string;
  meta?: { name?: string; [k: string]: unknown };
  created?: string;
  duration?: number; // seconds
  size?: number;
  input?: { width?: number; height?: number };
  status?: { state?: string };
  thumbnail?: string;
  playback?: { hls?: string; dash?: string };
}

/** Cloudflare Stream provider — video ingest, status, HLS/DASH delivery. */
export function cloudflareStream(config: CloudflareStreamConfig): ContentProvider {
  const f: FetchLike = config.fetch ?? ((url, init) => fetch(url, init));
  const base =
    config.baseUrl ?? `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/stream`;
  const headers = { Authorization: `Bearer ${config.apiToken}` };

  const toObject = (v: StreamRecord): ProviderObject => ({
    ref: v.uid,
    name: v.meta?.name,
    bytes: v.size,
    width: v.input?.width,
    height: v.input?.height,
    durationMs: v.duration !== undefined && v.duration >= 0 ? Math.round(v.duration * 1000) : undefined,
    createdAt: v.created,
    meta: {
      status: v.status?.state,
      thumbnail: v.thumbnail,
      hls: v.playback?.hls,
      dash: v.playback?.dash,
    },
  });

  return {
    name: "cloudflare-stream",
    kinds: ["video"],
    capabilities: ["list", "upload", "delete", "deliver", "stream", "captions", "download", "metadata"],

    async list(opts?: ProviderListOptions): Promise<ProviderListResult> {
      const params = new URLSearchParams();
      if (opts?.cursor) params.set("start", opts.cursor);
      const res = await f(`${base}?${params}`, { headers });
      if (!res.ok) throw new Error(`cloudflare-stream list failed: ${res.status}`);
      const body = (await res.json()) as { result?: StreamRecord[] };
      const videos = body.result ?? [];
      return {
        objects: videos.map(toObject),
        cursor: videos.length > 0 ? videos[videos.length - 1]!.created : undefined,
      };
    },

    async head(ref: string): Promise<ProviderObject | null> {
      const res = await f(`${base}/${ref}`, { headers });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`cloudflare-stream head failed: ${res.status}`);
      const body = (await res.json()) as { result?: StreamRecord };
      return body.result ? toObject(body.result) : null;
    },

    async upload(input: ProviderUploadInput): Promise<ProviderRef> {
      if (input.fromUrl) {
        const res = await f(`${base}/copy`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ url: input.fromUrl, meta: { name: input.name, ...input.meta } }),
        });
        if (!res.ok) throw new Error(`cloudflare-stream copy failed: ${res.status}`);
        const body = (await res.json()) as { result?: StreamRecord };
        const uid = body.result?.uid;
        if (!uid) throw new Error("cloudflare-stream copy returned no uid");
        return { provider: "cloudflare-stream", ref: uid, role: "delivery", mime: input.mime };
      }
      if (input.bytes) {
        const res = await f(base, {
          method: "POST",
          headers,
          body: new Blob([input.bytes as BlobPart], { type: input.mime ?? "video/mp4" }),
        });
        if (!res.ok) throw new Error(`cloudflare-stream upload failed: ${res.status}`);
        const body = (await res.json()) as { result?: StreamRecord };
        const uid = body.result?.uid;
        if (!uid) throw new Error("cloudflare-stream upload returned no uid");
        return { provider: "cloudflare-stream", ref: uid, role: "delivery", mime: input.mime };
      }
      throw new Error("cloudflare-stream upload requires bytes or fromUrl");
    },

    async delete(ref: string): Promise<void> {
      const res = await f(`${base}/${ref}`, { method: "DELETE", headers });
      if (!res.ok && res.status !== 404) {
        throw new Error(`cloudflare-stream delete failed: ${res.status}`);
      }
    },

    deliveryUrl(ref: string, opts?: DeliveryOptions): string {
      const host = `https://customer-${config.customerCode}.cloudflarestream.com`;
      if (opts?.format === "hls") return `${host}/${ref}/manifest/video.m3u8`;
      if (opts?.format === "dash") return `${host}/${ref}/manifest/video.mpd`;
      if (opts?.format === "poster") {
        const w = opts.width ? `?width=${opts.width}` : "";
        return `${host}/${ref}/thumbnails/thumbnail.jpg${w}`;
      }
      return `${host}/${ref}/iframe`;
    },
  };
}
