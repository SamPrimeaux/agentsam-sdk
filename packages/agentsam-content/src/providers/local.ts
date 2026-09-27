import type { ProviderRef } from "../core/source.js";
import type {
  ContentProvider,
  DeliveryOptions,
  ProviderListOptions,
  ProviderListResult,
  ProviderObject,
  ProviderUploadInput,
} from "./types.js";

interface StoredObject {
  ref: string;
  name: string;
  mime?: string;
  bytes: Uint8Array;
  meta?: Record<string, string>;
  createdAt: string;
  /** Optional externally supplied delivery URL (data URI, object URL...). */
  url?: string;
}

export interface LocalProviderOptions {
  /** Build a delivery URL for an object; defaults to a data URI when mime is known. */
  urlFor?: (obj: { ref: string; mime?: string; bytes: Uint8Array; url?: string }) => string | null;
  seed?: Array<{
    ref?: string;
    name: string;
    mime?: string;
    bytes?: Uint8Array;
    url?: string;
    meta?: Record<string, string>;
  }>;
}

export interface LocalProvider extends ContentProvider {
  /** Direct byte access for processors / machine pass. */
  read(ref: string): Promise<Uint8Array | null>;
  put(obj: { ref?: string; name: string; mime?: string; bytes?: Uint8Array; url?: string; meta?: Record<string, string> }): ProviderRef;
}

let seq = 0;

/**
 * Local provider — Local Studio's in-memory/on-device store. Also the
 * reference implementation and the test double for the provider contract.
 */
export function localFiles(options: LocalProviderOptions = {}): LocalProvider {
  const objects = new Map<string, StoredObject>();

  const put = (obj: {
    ref?: string;
    name: string;
    mime?: string;
    bytes?: Uint8Array;
    url?: string;
    meta?: Record<string, string>;
  }): ProviderRef => {
    const ref = obj.ref ?? `loc_${Date.now().toString(36)}_${seq++}`;
    objects.set(ref, {
      ref,
      name: obj.name,
      mime: obj.mime,
      bytes: obj.bytes ?? new Uint8Array(),
      meta: obj.meta,
      createdAt: new Date().toISOString(),
      url: obj.url,
    });
    return {
      provider: "local",
      ref,
      role: "original",
      bytes: obj.bytes?.byteLength,
      mime: obj.mime,
      url: obj.url,
    };
  };

  for (const s of options.seed ?? []) put(s);

  const toObject = (o: StoredObject): ProviderObject => ({
    ref: o.ref,
    name: o.name,
    mime: o.mime,
    bytes: o.bytes.byteLength || undefined,
    createdAt: o.createdAt,
    meta: o.meta,
  });

  return {
    name: "local",
    kinds: ["image", "video", "model", "audio", "document", "font"],
    capabilities: ["list", "upload", "delete", "deliver", "download", "metadata"],

    async list(opts?: ProviderListOptions): Promise<ProviderListResult> {
      let all = [...objects.values()];
      if (opts?.prefix) all = all.filter((o) => o.name.startsWith(opts.prefix!));
      const start = opts?.cursor ? Number(opts.cursor) : 0;
      const limit = opts?.limit ?? 100;
      const page = all.slice(start, start + limit);
      return {
        objects: page.map(toObject),
        cursor: start + limit < all.length ? String(start + limit) : undefined,
      };
    },

    async head(ref: string): Promise<ProviderObject | null> {
      const o = objects.get(ref);
      return o ? toObject(o) : null;
    },

    async upload(input: ProviderUploadInput): Promise<ProviderRef> {
      return put({ name: input.name, mime: input.mime, bytes: input.bytes, meta: input.meta });
    },

    async delete(ref: string): Promise<void> {
      objects.delete(ref);
    },

    deliveryUrl(ref: string, _opts?: DeliveryOptions): string | null {
      const o = objects.get(ref);
      if (!o) return null;
      if (options.urlFor) return options.urlFor(o);
      if (o.url) return o.url;
      if (o.mime && o.bytes.byteLength > 0 && o.bytes.byteLength < 512_000) {
        const b64 = typeof Buffer !== "undefined"
          ? Buffer.from(o.bytes).toString("base64")
          : btoa(String.fromCharCode(...o.bytes));
        return `data:${o.mime};base64,${b64}`;
      }
      return null;
    },

    async read(ref: string): Promise<Uint8Array | null> {
      return objects.get(ref)?.bytes ?? null;
    },

    put,
  };
}
