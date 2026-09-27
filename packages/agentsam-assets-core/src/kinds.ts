export type AssetId = `ast_${string}` | (string & {});

export type AssetKind =
  | "image"
  | "video"
  | "model"
  | "font"
  | "document"
  | "audio";

/** Who stores/transports bytes — never the asset identity itself. */
export type RepresentationProvider =
  | "r2"
  | "cloudflare-images"
  | "cloudflare-stream"
  | "google-drive"
  | "local"
  | "cms"
  | (string & {});

export type RepresentationRole =
  | "original"
  | "master"
  | "derivative"
  | "preview"
  | "poster"
  | "backup"
  | "delivery"
  | "source";
