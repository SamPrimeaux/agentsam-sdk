import type { SettingsStorageTarget, HealthState } from "@inneranimalmedia/agentsam-settings/contracts";

/** Only observed provider status, never bucket or database configuration fixtures. */
export type StorageFamily = {
  status?: string;
  available?: boolean;
  count?: number | null;
  buckets?: Array<{ name: string }>;
  truncated?: boolean;
};
export type CloudflareStorageDiscovery = {
  ok?: boolean;
  status?: string;
  account?: { id?: string } | null;
  r2?: StorageFamily;
  images?: StorageFamily;
  stream?: StorageFamily;
};

function familyHealth(family: StorageFamily | undefined): HealthState {
  if (!family) return "unknown";
  if (family.status === "needs_scope" || family.status === "not_connected" ||
      family.status === "unavailable") return "attention";
  if (family.status === "error" || family.status === "account_required") return "unknown";
  return family.available === true ? "healthy" : "unknown";
}

function countDetail(family: StorageFamily | undefined, noun: string): string {
  const count = Number(family?.count);
  if (!family || !family.available || !Number.isFinite(count) || count < 0) {
    return "Inventory unavailable or not authorized.";
  }
  return String(count) + " " + noun + (count === 1 ? "" : "s") +
    (family.truncated ? " (more pages available)" : "") + ".";
}

export function projectSettingsStorageTargets(
  indexedDbAvailable: boolean,
  cloudflare: CloudflareStorageDiscovery | null,
): SettingsStorageTarget[] {
  const local: SettingsStorageTarget = {
    id: "local-content-indexeddb",
    name: "Browser content storage",
    kind: "IndexedDB · current device",
    detail: indexedDbAvailable
      ? "Content Studio uses account-scoped IndexedDB on this device. Availability does not verify persistence or backup."
      : "IndexedDB is unavailable in this runtime. Local content persistence is not verified.",
    status: indexedDbAvailable ? "unknown" : "attention",
  };
  const connected = cloudflare?.account?.id && cloudflare.ok !== false;
  const families: Array<{id:string; name:string; kind:string; family:StorageFamily|undefined; noun:string}> = [
    {id:"cloudflare-r2",name:"Cloudflare R2",kind:"Connected Cloudflare account · object buckets",family:cloudflare?.r2,noun:"bucket"},
    {id:"cloudflare-images",name:"Cloudflare Images",kind:"Connected Cloudflare account · image delivery",family:cloudflare?.images,noun:"image"},
    {id:"cloudflare-stream",name:"Cloudflare Stream",kind:"Connected Cloudflare account · videos",family:cloudflare?.stream,noun:"video"},
  ];
  return [local, ...families.map(({id,name,kind,family,noun}) => ({
    id, name, kind,
    status: connected ? familyHealth(family) : (cloudflare?.status === "not_connected" ? "attention" : "unknown"),
    detail: connected
      ? (family?.available ? countDetail(family,noun)
        : family?.status === "needs_scope" ? "The current OAuth grant lacks this provider permission."
        : "The provider was not verified; no files are assumed missing.")
      : cloudflare?.status === "not_connected"
        ? "No active Cloudflare authorization. Connect in Plugins to browse this storage."
        : "Cloudflare resource discovery could not be verified from this host.",
  }))];
}
