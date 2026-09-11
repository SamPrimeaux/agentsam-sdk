const KEY = "agentsam-ship-secrets";

export type ShipSecrets = {
  githubToken: string;
  cloudflareToken: string;
};

const EMPTY: ShipSecrets = { githubToken: "", cloudflareToken: "" };

export function readSecrets(): ShipSecrets {
  if (typeof window === "undefined") return { ...EMPTY };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<ShipSecrets>;
    return {
      githubToken: typeof parsed.githubToken === "string" ? parsed.githubToken : "",
      cloudflareToken: typeof parsed.cloudflareToken === "string" ? parsed.cloudflareToken : "",
    };
  } catch {
    return { ...EMPTY };
  }
}

export function writeSecrets(next: Partial<ShipSecrets>) {
  if (typeof window === "undefined") return;
  const merged = { ...readSecrets(), ...next };
  window.localStorage.setItem(KEY, JSON.stringify(merged));
}

export function clearSecrets() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
}

export function maskToken(value: string) {
  const v = value.trim();
  if (!v) return "";
  if (v.length <= 8) return "••••";
  return `${v.slice(0, 4)}…${v.slice(-3)}`;
}
