import { parseCoProProject } from "@inneranimalmedia/copro-project";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);
const MAX_ASSETS = 500;
const MAX_ASSET_BYTES = 1024 * 1024 * 1024;
const IMAGE_SECONDS = 3;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._-]*(\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;

export type ImportedMedia = { id: string; name: string; kind: "video" | "image" | "audio"; file: File; durationUs?: number };
export type EvidenceImportResult = { projectId: string; runId: string; status: string; media: ImportedMedia[] };
type ProjectStoreLike = { save(project: any): Promise<unknown> };
type MediaStoreLike = { put(item: ImportedMedia): Promise<unknown> } | null;

/** Only a package served from this machine can be opened by link; hosted packages arrive by upload instead. */
function loopbackUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("evidence_url_invalid"); }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) throw new Error("evidence_url_not_loopback");
  return url;
}

async function bytesOf(fetchImpl: typeof fetch, url: URL, limit: number): Promise<Uint8Array> {
  const response = await fetchImpl(url.href);
  if (!response.ok) throw new Error("evidence_fetch_failed:" + response.status);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > limit) throw new Error("evidence_asset_too_large");
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function inside(base: URL, key: string): URL {
  if (!KEY.test(key) || key.includes("..")) throw new Error("evidence_key_invalid");
  const url = new URL(key, base);
  if (!url.href.startsWith(base.href)) throw new Error("evidence_key_invalid");
  return url;
}

export async function importEvidencePackage({ manifestUrl, projectStore, mediaStore, fetchImpl = fetch }: {
  manifestUrl: string; projectStore: ProjectStoreLike; mediaStore: MediaStoreLike; fetchImpl?: typeof fetch;
}): Promise<EvidenceImportResult> {
  const manifestLocation = loopbackUrl(manifestUrl);
  const base = new URL("./", manifestLocation);
  const manifest = JSON.parse(new TextDecoder().decode(await bytesOf(fetchImpl, manifestLocation, 16 * 1024 * 1024)));
  if (manifest?.schema !== "agentsam.evidence.v1") throw new Error("not_an_evidence_manifest");
  if (manifest.status === "failed") throw new Error("evidence_run_failed");
  const handoff = new Map<string, { sha256: string }>((manifest.handoff ?? []).map((h: any) => [h.key, h]));
  const projectEntry = handoff.get("06-Handoff/project.copro.json");
  const assetsEntry = handoff.get("06-Handoff/assets.json");
  if (!projectEntry || !assetsEntry) throw new Error("package_has_no_editor_project");

  const projectBytes = await bytesOf(fetchImpl, inside(base, "06-Handoff/project.copro.json"), 16 * 1024 * 1024);
  const assetsBytes = await bytesOf(fetchImpl, inside(base, "06-Handoff/assets.json"), 16 * 1024 * 1024);
  if ((await sha256Hex(projectBytes)) !== projectEntry.sha256 || (await sha256Hex(assetsBytes)) !== assetsEntry.sha256) throw new Error("evidence_integrity_mismatch");
  const assets: Record<string, any> = JSON.parse(new TextDecoder().decode(assetsBytes)).assets ?? {};
  if (Object.keys(assets).length > MAX_ASSETS) throw new Error("evidence_too_many_assets");
  const project = parseCoProProject(new TextDecoder().decode(projectBytes));

  const media: ImportedMedia[] = [];
  for (const [id, asset] of Object.entries(assets)) {
    const bytes = await bytesOf(fetchImpl, inside(base, String(asset.key)), MAX_ASSET_BYTES);
    if ((await sha256Hex(bytes)) !== asset.sha256) throw new Error("evidence_integrity_mismatch");
    const kind = asset.kind === "video" ? "video" : asset.kind === "audio" ? "audio" : "image";
    const durationUs = kind === "image" ? IMAGE_SECONDS * 1_000_000 : Number.isFinite(asset.durationMs) ? Math.round(asset.durationMs * 1000) : undefined;
    const record: ImportedMedia = { id, name: String(asset.name), kind, file: new File([bytes as unknown as BlobPart], String(asset.name), { type: String(asset.contentType) }), durationUs };
    if (mediaStore) await mediaStore.put(record);
    media.push(record);
  }
  await projectStore.save(project);
  return { projectId: (project as any).id, runId: manifest.runId, status: manifest.status, media };
}
