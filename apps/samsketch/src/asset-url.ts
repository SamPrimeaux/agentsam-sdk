/** Resolve source assets against the active installation base, not a fixed host path. */
const configuredBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL || "./";

export function assetUrl(path: string): string {
  const runtimeUrl = typeof window !== "undefined" ? window.location.href : "http://localhost/";
  const baseUrl = new URL(configuredBase, runtimeUrl);
  return new URL(path.replace(/^\/+/, ""), baseUrl).href;
}
