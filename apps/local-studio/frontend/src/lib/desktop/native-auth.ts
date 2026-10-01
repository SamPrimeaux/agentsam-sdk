import {
  getCurrentDeepLinks,
  getTauriInvoke,
  invokeIdentity,
  listenDeepLinks,
  openExternalUrl,
  identityStoreDelete,
  identityStoreGet,
  identityStoreSet,
} from "@/lib/desktop/tauri";

export const DESKTOP_IDENTITY_SESSION_ACCOUNT = "identity_session";
export const DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT = "identity_native_oauth_pending";
export const DESKTOP_NATIVE_REDIRECT = "agentsamstudio://auth/callback";

const DEFAULT_IDENTITY_SERVICE_ORIGIN = "https://agentsam.inneranimalmedia.com";
const PENDING_AUTH_MAX_AGE_MS = 10 * 60 * 1000;
const PKCE_VALUE = /^[A-Za-z0-9_-]{43}$/;

export type NativeIdentityProvider = "google" | "github" | "cloudflare" | "inneranimalmedia";

export type NativeIdentityUser = {
  id?: string;
  email?: string;
  display_name?: string | null;
  displayName?: string | null;
};

export type NativeIdentityStatus = {
  ok?: boolean;
  authenticated?: boolean;
  session_id?: string;
  expires_at?: string | number | null;
  user?: NativeIdentityUser | null;
  error?: string;
};

type PendingNativeAuth = {
  schema: "agentsam.desktop-native-auth.v1";
  verifier: string;
  challenge: string;
  provider: NativeIdentityProvider;
  created_at_ms: number;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function identityServiceOrigin(override?: string): string {
  const viteOrigin = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_AGENTSAM_IDENTITY_SERVICE_ORIGIN;
  const raw = String(override || viteOrigin || DEFAULT_IDENTITY_SERVICE_ORIGIN)
    .trim()
    .replace(/\/+$/, "");
  const parsed = new URL(raw);
  const isLoopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    throw new Error("identity_service_origin_requires_https");
  }
  return parsed.origin;
}

function notifyDesktopIdentity(authenticated: boolean, user: NativeIdentityUser | null = null): void {
  if (typeof window === "undefined") return;
  window.postMessage(
    {
      type: "agentsam:desktop-identity",
      authenticated,
      user,
    },
    "*",
  );
}

function parsePendingNativeAuth(raw: string | null): PendingNativeAuth | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingNativeAuth>;
    if (
      parsed.schema !== "agentsam.desktop-native-auth.v1" ||
      typeof parsed.verifier !== "string" ||
      !PKCE_VALUE.test(parsed.verifier) ||
      typeof parsed.challenge !== "string" ||
      !PKCE_VALUE.test(parsed.challenge) ||
      !["google", "github", "cloudflare", "inneranimalmedia"].includes(String(parsed.provider)) ||
      typeof parsed.created_at_ms !== "number"
    ) {
      return null;
    }
    return parsed as PendingNativeAuth;
  } catch {
    return null;
  }
}

export async function createPkcePair(): Promise<{ verifier: string; challenge: string }> {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = base64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const challenge = base64Url(new Uint8Array(digest));
  if (!PKCE_VALUE.test(verifier) || !PKCE_VALUE.test(challenge)) {
    throw new Error("pkce_generation_failed");
  }
  return { verifier, challenge };
}

export function buildNativeLoginUrl(
  provider: NativeIdentityProvider,
  challenge: string,
  serviceOrigin?: string,
): string {
  if (!PKCE_VALUE.test(challenge)) throw new Error("native_challenge_invalid");
  if (provider === "google") {
    throw new Error("google_desktop_native_flow_required");
  }
  if (!["github", "cloudflare", "inneranimalmedia"].includes(provider)) {
    throw new Error("native_provider_invalid");
  }
  const url = new URL(`/api/oauth/${provider}/start`, identityServiceOrigin(serviceOrigin));
  url.searchParams.set("client", "native");
  url.searchParams.set("native_challenge", challenge);
  url.searchParams.set("native_redirect", DESKTOP_NATIVE_REDIRECT);
  url.searchParams.set("next", "/agentsam");
  return url.toString();
}

export function parseNativeCallback(urlValue: string): { handoff: string } {
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("native_callback_invalid");
  }
  if (
    url.protocol !== "agentsamstudio:" ||
    url.hostname !== "auth" ||
    url.pathname.replace(/\/+$/, "") !== "/callback"
  ) {
    throw new Error("native_callback_not_identity");
  }
  const error = url.searchParams.get("error");
  if (error) throw new Error(`native_oauth_${error}`);
  const handoff = String(url.searchParams.get("handoff") || "").trim();
  if (!handoff) throw new Error("native_handoff_missing");
  return { handoff };
}

export function isNativeIdentityCallback(urlValue: string): boolean {
  try {
    const url = new URL(urlValue);
    return (
      url.protocol === "agentsamstudio:" &&
      url.hostname === "auth" &&
      url.pathname.replace(/\/+$/, "") === "/callback"
    );
  } catch {
    return false;
  }
}

async function persistDesktopIdentitySession(
  response: NativeIdentityStatus,
): Promise<NativeIdentityStatus> {
  const sessionId = typeof response.session_id === "string" ? response.session_id.trim() : "";
  if (response.ok === false || !sessionId) {
    throw new Error(response.error || "desktop_identity_session_missing");
  }
  try {
    await identityStoreSet(DESKTOP_IDENTITY_SESSION_ACCOUNT, sessionId);
  } catch (error) {
    try {
      await invokeIdentity({ op: "logout", session_id: sessionId });
    } catch {
      // Best effort: don't strand a server session if Keychain persistence fails.
    }
    throw error;
  }
  notifyDesktopIdentity(true, response.user || null);
  return { ...response, authenticated: true };
}

async function beginGoogleDesktopLogin(
  serviceOrigin?: string,
): Promise<NativeIdentityStatus> {
  const invoke = getTauriInvoke();
  if (!invoke) throw new Error("google_desktop_identity_unavailable");
  const response = (await invoke("google_desktop_identity_login", {
    request: {
      serviceOrigin: identityServiceOrigin(serviceOrigin),
    },
  })) as NativeIdentityStatus;
  return persistDesktopIdentitySession(response);
}

export async function beginNativeLogin(
  provider: NativeIdentityProvider,
  serviceOrigin?: string,
): Promise<NativeIdentityStatus | null> {
  if (provider === "google") {
    return beginGoogleDesktopLogin(serviceOrigin);
  }

  const { verifier, challenge } = await createPkcePair();
  const pending: PendingNativeAuth = {
    schema: "agentsam.desktop-native-auth.v1",
    verifier,
    challenge,
    provider,
    created_at_ms: Date.now(),
  };
  await identityStoreSet(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT, JSON.stringify(pending));
  try {
    await openExternalUrl(buildNativeLoginUrl(provider, challenge, serviceOrigin));
    return null;
  } catch (error) {
    await identityStoreDelete(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT);
    throw error;
  }
}

export async function exchangeNativeHandoff(callbackUrl: string): Promise<NativeIdentityStatus> {
  const { handoff } = parseNativeCallback(callbackUrl);
  const pending = parsePendingNativeAuth(await identityStoreGet(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT));
  if (!pending) {
    await identityStoreDelete(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT);
    throw new Error("native_login_not_pending");
  }
  if (Date.now() - pending.created_at_ms > PENDING_AUTH_MAX_AGE_MS) {
    await identityStoreDelete(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT);
    throw new Error("native_login_expired");
  }

  const response = (await invokeIdentity({
    op: "native_exchange",
    handoff,
    code_verifier: pending.verifier,
  })) as NativeIdentityStatus;

  if (response.ok === false || !response.session_id) {
    await identityStoreDelete(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT);
    throw new Error(response.error || "native_exchange_failed");
  }

  try {
    const persisted = await persistDesktopIdentitySession(response);
    await identityStoreDelete(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT);
    return persisted;
  } catch (error) {
    await identityStoreDelete(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT);
    throw error;
  }
}

export async function restoreNativeSession(): Promise<NativeIdentityStatus> {
  const sessionId = await identityStoreGet(DESKTOP_IDENTITY_SESSION_ACCOUNT);
  if (!sessionId) return { ok: true, authenticated: false, user: null };

  const status = (await invokeIdentity({
    op: "status",
    session_id: sessionId,
  })) as NativeIdentityStatus;

  if (!status.authenticated) {
    await identityStoreDelete(DESKTOP_IDENTITY_SESSION_ACCOUNT);
    notifyDesktopIdentity(false, null);
  }
  return status;
}

export async function logoutNativeSession(): Promise<void> {
  const sessionId = await identityStoreGet(DESKTOP_IDENTITY_SESSION_ACCOUNT);
  let revokeError: unknown = null;
  if (sessionId) {
    try {
      const response = (await invokeIdentity({
        op: "logout",
        session_id: sessionId,
      })) as NativeIdentityStatus;
      if (response.ok === false) {
        revokeError = new Error(response.error || "identity_logout_failed");
      }
    } catch (error) {
      revokeError = error;
    }
  }

  await identityStoreDelete(DESKTOP_IDENTITY_SESSION_ACCOUNT);
  await identityStoreDelete(DESKTOP_NATIVE_AUTH_PENDING_ACCOUNT);
  notifyDesktopIdentity(false, null);

  if (revokeError) throw revokeError;
}

export async function listenForNativeIdentityCallbacks(
  onAuthenticated: (status: NativeIdentityStatus) => void,
  onError: (error: Error) => void,
): Promise<() => void> {
  const handled = new Set<string>();

  function handle(payload: string): void {
    if (handled.has(payload) || !isNativeIdentityCallback(payload)) return;
    handled.add(payload);
    void exchangeNativeHandoff(payload)
      .then(onAuthenticated)
      .catch((error) => onError(error instanceof Error ? error : new Error(String(error))));
  }

  const unlisten = await listenDeepLinks(handle);
  const current = await getCurrentDeepLinks();
  for (const payload of current) handle(payload);
  return unlisten;
}
