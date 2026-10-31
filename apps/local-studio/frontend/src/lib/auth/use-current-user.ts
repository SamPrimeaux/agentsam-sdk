import { useSyncExternalStore } from "react";
import { authEnabled, getBearerToken } from "./client";
import { createBrowserSessionStore, PENDING_BROWSER_SESSION } from "./browser-session";
import { getTauriInvoke, invokeIdentity, isPackagedDesktop } from "@/lib/desktop/tauri";

/** Normalized user shape used across the app, auth on or off. */
export type AppUser = {
  id: string;
  displayName: string | null;
  primaryEmail: string | null;
  profileImageUrl: string | null;
  /** True when this is the sandbox/dev fallback (auth not configured). */
  isDevFallback: boolean;
};

/**
 * Stable fallback user, used ONLY when auth is disabled
 * (`VITE_AUTH_ENABLED=false`, the shipped default). With auth on, the sandbox
 * live preview does real sign-in via the baked preview client. Its id is
 * `"dev-user"` — the SAME id `verify.server.ts` returns server-side — so per-user
 * rows written in that mode belong to one consistent owner.
 */
export const DEV_USER: AppUser = {
  id: "dev-user",
  displayName: "Dev User",
  primaryEmail: "dev@example.com",
  profileImageUrl: null,
  isDevFallback: true,
};

type DesktopIdentityMessage = {
  type?: string;
  authenticated?: boolean;
  user?: {
    id?: string;
    email?: string;
    display_name?: string | null;
    displayName?: string | null;
    avatar_url?: string | null;
    image?: string | null;
  } | null;
};

function normalizeDesktopUser(user: DesktopIdentityMessage["user"]): AppUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    displayName: user.displayName ?? user.display_name ?? null,
    primaryEmail: user.email ?? null,
    profileImageUrl: user.image ?? user.avatar_url ?? null,
    isDevFallback: false,
  };
}

// Shared desktop restore: a component-level hook previously invoked /auth/me
// once per consumer and could trigger dozens of Keychain reads before the
// first application window painted. One restore per webview, never per hook.
const desktopListeners = new Set<() => void>();
let desktopRestorationStarted = false;
let desktopSnapshot: CurrentUserState = { user: DEV_USER, isPending: false };

function publishDesktopUser(user: AppUser | null) {
  desktopSnapshot = { user: user ?? DEV_USER, isPending: false };
  for (const listener of desktopListeners) listener();
}

function startDesktopIdentityRestore() {
  if (desktopRestorationStarted || typeof window === 'undefined') return;
  desktopRestorationStarted = true;
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.source !== window) return;
    const message = event.data as DesktopIdentityMessage | undefined;
    if (message?.type !== 'agentsam:desktop-identity') return;
    publishDesktopUser(message.authenticated ? normalizeDesktopUser(message.user) : null);
  });
  // Render the native Studio shell before requesting secured session state.
  // The request can trigger a macOS approval dialog on an ad-hoc signed build.
  window.setTimeout(() => {
    void invokeIdentity({ op: 'status' }).then((raw) => {
      const status = raw as DesktopIdentityMessage;
      publishDesktopUser(status.authenticated ? normalizeDesktopUser(status.user) : null);
    }).catch(() => publishDesktopUser(null));
  }, 750);
}

function subscribeDesktopIdentity(listener: () => void): () => void {
  desktopListeners.add(listener);
  startDesktopIdentityRestore();
  return () => { desktopListeners.delete(listener); };
}

function desktopCurrentUser(): CurrentUserState { return desktopSnapshot; }
function useDesktopCurrentUserState(): CurrentUserState {
  return useSyncExternalStore(subscribeDesktopIdentity, desktopCurrentUser, desktopCurrentUser);
}


/** `useCurrentUserState()` result: the user plus the session-loading flag. */
export type CurrentUserState = {
  /** The user — `null` BOTH while the session loads and when signed out. */
  user: AppUser | null;
  /** True while the session is still resolving — don't treat `user: null` as signed out yet. */
  isPending: boolean;
  /** A transport failure is recoverable; it is not a signed-out result. */
  error?: string | null;
};

// One account read per webview, shared by every consumer. Native and disabled
// auth modes retain their existing lifecycles and never initialize this store.
export const browserIdentity = createBrowserSessionStore({
  fetch: (...args) => fetch(...args), bearer: getBearerToken,
});
let browserSubscriptions = 0;
const refreshBrowserIdentity = () => { void browserIdentity.refresh(); };
function subscribeBrowserIdentity(listener: () => void) {
  const unsubscribe = browserIdentity.subscribe(listener);
  if (browserSubscriptions++ === 0) {
    window.addEventListener('focus', refreshBrowserIdentity);
    window.addEventListener('online', refreshBrowserIdentity);
    refreshBrowserIdentity();
  }
  return () => {
    unsubscribe();
    if (--browserSubscriptions === 0) {
      window.removeEventListener('focus', refreshBrowserIdentity);
      window.removeEventListener('online', refreshBrowserIdentity);
    }
  };
}

/** Current principal from the same host authority that gates document routes. */
export function useCurrentUserState(): CurrentUserState {
  if (isPackagedDesktop()) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- runtime is constant for the app lifetime
    return useDesktopCurrentUserState();
  }
  if (!authEnabled) return { user: DEV_USER, isPending: false };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- runtime is constant for the app lifetime
  return useSyncExternalStore(subscribeBrowserIdentity, browserIdentity.getSnapshot, () => PENDING_BROWSER_SESSION);
}

/**
 * Convenience view of `useCurrentUserState().user` for display (e.g.
 * `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
 * for redirects/guards use `useCurrentUserState()` and check `isPending`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
