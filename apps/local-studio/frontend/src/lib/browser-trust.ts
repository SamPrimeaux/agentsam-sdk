export type TrustScope = "persistent" | "session" | "debug";
export type TrustedOrigin = { origin: string; trust_scope: TrustScope; created_at: string };
export type EmbedRule = { host_suffix: string; embed_mode: string };

async function request(method: "GET" | "POST" | "DELETE", body?: Record<string, unknown>) {
  const response = await fetch("/api/settings/browser", {
    method,
    credentials: "same-origin",
    headers: { accept: "application/json", ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "browser_settings_request_failed");
  return payload;
}

export async function loadBrowserSettings(): Promise<{ trusted: TrustedOrigin[]; rules: EmbedRule[] }> {
  const payload = await request("GET");
  return { trusted: payload.trusted_origins ?? [], rules: payload.embed_policy ?? [] };
}
export async function trustBrowserOrigin(origin: string, trust_scope: TrustScope): Promise<void> {
  await request("POST", { origin, trust_scope });
}
export async function untrustBrowserOrigin(origin: string): Promise<void> {
  await request("DELETE", { origin });
}

/** Plain-language errors; never raw codes in the UI. */
export function browserTrustMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  if (code === "trust_origin_invalid") return "Enter a website address like https://example.com.";
  return "Couldn’t save that change. Nothing was changed.";
}
