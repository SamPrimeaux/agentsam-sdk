/**
 * Browser client for the local agentsamd daemon. One home for the pairing token key,
 * discovery and authenticated exec, shared by the terminal and the Docker transport.
 * The pairing token never leaves this computer: it is stored in this browser only.
 */
export const AGENTSAMD_TOKEN_KEY = "agentsamd_pairing_token";
export const AGENTSAMD_BASE = "http://127.0.0.1:18765";
const TOKEN_HEADER = "X-Agentsamd-Token";

type TokenStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class AgentsamdError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message || code);
    this.name = "AgentsamdError";
    this.code = code;
  }
}

function defaultStore(): TokenStore | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function getAgentsamdToken(store: TokenStore | null = defaultStore()): string | null {
  try { return store?.getItem(AGENTSAMD_TOKEN_KEY) || null; } catch { return null; }
}

/** Accepts only a well-formed 64-hex pairing token; returns whether it was stored. */
export function setAgentsamdToken(token: string, store: TokenStore | null = defaultStore()): boolean {
  const value = String(token || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(value) || !store) return false;
  try { store.setItem(AGENTSAMD_TOKEN_KEY, value); return true; } catch { return false; }
}

export function clearAgentsamdToken(store: TokenStore | null = defaultStore()): void {
  try { store?.removeItem(AGENTSAMD_TOKEN_KEY); } catch { /* storage is optional */ }
}

export async function probeAgentsamd(fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const response = await fetchImpl(AGENTSAMD_BASE + "/health", { signal: AbortSignal.timeout(800) });
    return response.ok;
  } catch { return false; }
}

export type ExecResult = { ok: boolean; exit_code: number; stdout: string; stderr: string; timed_out?: boolean };

export async function agentsamdExec(
  command: string,
  args: string[],
  options: { timeoutMs?: number; token?: string | null; fetchImpl?: FetchLike; store?: TokenStore | null } = {},
): Promise<ExecResult> {
  const store = options.store === undefined ? defaultStore() : options.store;
  const token = options.token === undefined ? getAgentsamdToken(store) : options.token;
  if (!token) throw new AgentsamdError("agentsamd_pairing_required", "Connect this browser to your computer first.");
  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(AGENTSAMD_BASE + "/v1/exec", {
      method: "POST",
      headers: { "content-type": "application/json", [TOKEN_HEADER]: token },
      body: JSON.stringify({ command, args, timeout_ms: options.timeoutMs ?? 30000 }),
    });
  } catch {
    throw new AgentsamdError("agentsamd_unreachable", "AgentSam cannot reach this computer.");
  }
  if (response.status === 401) {
    clearAgentsamdToken(store);
    throw new AgentsamdError("agentsamd_pairing_required", "That pairing token was not accepted.");
  }
  const body = await response.json().catch(() => null) as Partial<ExecResult> & { error?: string } | null;
  if (!response.ok || !body) {
    throw new AgentsamdError("agentsamd_request_failed", String(body?.error || "Request failed (" + response.status + ")"));
  }
  return {
    ok: Boolean(body.ok), exit_code: Number(body.exit_code ?? -1),
    stdout: String(body.stdout ?? ""), stderr: String(body.stderr ?? ""), timed_out: Boolean(body.timed_out),
  };
}

/** Authenticated JSON call to any agentsamd route (used by the native Docker API). */
export async function agentsamdRequest(
  route: string,
  body: Record<string, unknown> = {},
  options: { token?: string | null; fetchImpl?: FetchLike; store?: TokenStore | null } = {},
): Promise<Record<string, unknown>> {
  const store = options.store === undefined ? defaultStore() : options.store;
  const token = options.token === undefined ? getAgentsamdToken(store) : options.token;
  if (!token) throw new AgentsamdError("agentsamd_pairing_required", "Connect this browser to your computer first.");
  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(AGENTSAMD_BASE + route, {
      method: "POST",
      headers: { "content-type": "application/json", [TOKEN_HEADER]: token },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AgentsamdError("agentsamd_unreachable", "AgentSam cannot reach this computer.");
  }
  if (response.status === 401) {
    clearAgentsamdToken(store);
    throw new AgentsamdError("agentsamd_pairing_required", "That pairing token was not accepted.");
  }
  const parsed = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok || !parsed || parsed.ok === false) {
    throw new AgentsamdError("agentsamd_request_failed", String(parsed?.message || parsed?.error || "Request failed (" + response.status + ")"));
  }
  return parsed;
}

export type PairingResult = { ok: true } | { ok: false; reason: "denied" | "cooldown" | "pending" | "unavailable" | "unreachable"; message: string };

/**
 * One-click pairing: agentsamd shows an Allow/Deny prompt on this computer and
 * returns the token only if the person allows it. The token is stored in this browser.
 */
export async function requestAgentsamdPairing(
  options: { fetchImpl?: FetchLike; store?: TokenStore | null } = {},
): Promise<PairingResult> {
  const fetchImpl = options.fetchImpl || fetch;
  let response: Response;
  try {
    response = await fetchImpl(AGENTSAMD_BASE + "/v1/pair/request", { method: "POST", signal: AbortSignal.timeout(70000) });
  } catch {
    return { ok: false, reason: "unreachable", message: "AgentSam cannot reach this computer." };
  }
  const body = await response.json().catch(() => null) as { ok?: boolean; token?: string; error?: string } | null;
  if (response.ok && body?.ok && typeof body.token === "string") {
    const store = options.store === undefined ? defaultStore() : options.store;
    return setAgentsamdToken(body.token, store)
      ? { ok: true }
      : { ok: false, reason: "unavailable", message: "This browser could not save the connection." };
  }
  switch (body?.error) {
    case "approval_denied": return { ok: false, reason: "denied", message: "The connection was not approved on your computer." };
    case "approval_cooldown": return { ok: false, reason: "cooldown", message: "Please wait a moment before trying again." };
    case "approval_pending": return { ok: false, reason: "pending", message: "A prompt is already open on your computer. Answer it, then try again." };
    default: return { ok: false, reason: "unavailable", message: "Your computer could not show the approval prompt. Use a pairing token below instead." };
  }
}
