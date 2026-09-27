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

export interface GoogleDriveConfig {
  /** OAuth access-token supplier (host owns refresh). */
  getAccessToken: () => Promise<string>;
  folderId?: string;
  fetch?: FetchLike;
  baseUrl?: string;
}

interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  createdTime?: string;
  imageMediaMetadata?: { width?: number; height?: number };
  videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string };
}

/** Google Drive provider — source backups and folder sync. */
export function googleDrive(config: GoogleDriveConfig): ContentProvider {
  const f: FetchLike = config.fetch ?? ((url, init) => fetch(url, init));
  const base = config.baseUrl ?? "https://www.googleapis.com/drive/v3";

  const auth = async (): Promise<Record<string, string>> => ({
    Authorization: `Bearer ${await config.getAccessToken()}`,
  });

  const toObject = (file: DriveFile): ProviderObject => ({
    ref: file.id,
    name: file.name,
    mime: file.mimeType,
    bytes: file.size ? Number(file.size) : undefined,
    width: file.imageMediaMetadata?.width ?? file.videoMediaMetadata?.width,
    height: file.imageMediaMetadata?.height ?? file.videoMediaMetadata?.height,
    durationMs: file.videoMediaMetadata?.durationMillis
      ? Number(file.videoMediaMetadata.durationMillis)
      : undefined,
    createdAt: file.createdTime,
  });

  return {
    name: "google-drive",
    kinds: ["image", "video", "model", "audio", "document", "font"],
    capabilities: ["list", "upload", "delete", "sync", "download", "metadata"],

    async list(opts?: ProviderListOptions): Promise<ProviderListResult> {
      const params = new URLSearchParams({
        fields:
          "nextPageToken,files(id,name,mimeType,size,createdTime,imageMediaMetadata,videoMediaMetadata)",
        pageSize: String(opts?.limit ?? 100),
      });
      if (config.folderId) params.set("q", `'${config.folderId}' in parents and trashed=false`);
      if (opts?.cursor) params.set("pageToken", opts.cursor);
      const res = await f(`${base}/files?${params}`, { headers: await auth() });
      if (!res.ok) throw new Error(`google-drive list failed: ${res.status}`);
      const body = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
      return { objects: (body.files ?? []).map(toObject), cursor: body.nextPageToken };
    },

    async head(ref: string): Promise<ProviderObject | null> {
      const params = new URLSearchParams({
        fields: "id,name,mimeType,size,createdTime,imageMediaMetadata,videoMediaMetadata",
      });
      const res = await f(`${base}/files/${ref}?${params}`, { headers: await auth() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`google-drive head failed: ${res.status}`);
      return toObject((await res.json()) as DriveFile);
    },

    async upload(input: ProviderUploadInput): Promise<ProviderRef> {
      if (!input.bytes) throw new Error("google-drive upload requires bytes");
      const metadata = {
        name: input.name,
        parents: config.folderId ? [config.folderId] : undefined,
      };
      const boundary = "agentsam-content-" + Math.random().toString(36).slice(2);
      const head =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${
          input.mime ?? "application/octet-stream"
        }\r\n\r\n`;
      const tail = `\r\n--${boundary}--`;
      const body = new Blob([head, input.bytes as BlobPart, tail]);
      const res = await f(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        {
          method: "POST",
          headers: {
            ...(await auth()),
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      if (!res.ok) throw new Error(`google-drive upload failed: ${res.status}`);
      const file = (await res.json()) as { id?: string };
      if (!file.id) throw new Error("google-drive upload returned no id");
      return { provider: "google-drive", ref: file.id, role: "backup", mime: input.mime };
    },

    async delete(ref: string): Promise<void> {
      const res = await f(`${base}/files/${ref}`, { method: "DELETE", headers: await auth() });
      if (!res.ok && res.status !== 404) throw new Error(`google-drive delete failed: ${res.status}`);
    },

    deliveryUrl(_ref: string, _opts?: DeliveryOptions): string | null {
      // Drive is a source/backup provider, not an edge delivery provider.
      return null;
    },
  };
}
