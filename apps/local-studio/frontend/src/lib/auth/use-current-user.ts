import { useSyncExternalStore } from "react";
import { authClient, authEnabled } from "./client";
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
  } | null;
};

function normalizeDesktopUser(user: DesktopIdentityMessage["user"]): AppUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    displayName: user.displayName ?? user.display_name ?? null,
    primaryEmail: user.email ?? null,
    profileImageUrl: null,
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
};

/**
 * Current user + loading state. Same behavior in live preview and when deployed:
 *   - Auth enabled -> the real signed-in user; `user` is `null` while
 *                            the session resolves (`isPending: true`) and when
 *                            signed out (`isPending: false`). Session comes from
 *                            Better Auth `useSession()` → `/api/auth/get-session`
 *                            (cookie when deployed; bearer in live preview).
 *   - Auth disabled (`VITE_AUTH_ENABLED=false`) -> `DEV_USER`, never pending.
 *
 * Protect a route by waiting out `isPending` before acting on `user` —
 * redirecting on `user: null` alone bounces signed-in visitors to sign-in on
 * every hard reload:
 *
 *   import { RedirectToSignIn } from "@/lib/auth/gates";
 *   const { user, isPending } = useCurrentUserState();
 *   if (isPending) return null;              // still resolving — don't redirect yet
 *   if (!user) return <RedirectToSignIn />;  // definitely signed out
 *
 * `authEnabled` is a module-level constant fixed at load, so the guarded hook
 * call keeps a stable hook order across every render of a given component.
 */
export function useCurrentUserState(): CurrentUserState {
  if (isPackagedDesktop()) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- packaged-desktop mode is constant for the app lifetime
    return useDesktopCurrentUserState();
  }
  if (!authEnabled) return { user: DEV_USER, isPending: false };
  // eslint-disable-next-line react-hooks/rules-of-hooks -- authEnabled is constant for the app's lifetime
  const { data, isPending } = authClient.useSession();
  const user = data?.user;
  return {
    user: user
      ? {
          id: user.id,
          displayName: user.name ?? null,
          primaryEmail: user.email ?? null,
          profileImageUrl: user.image ?? null,
          isDevFallback: false,
        }
      : null,
    isPending,
  };
}

/**
 * Convenience view of `useCurrentUserState().user` for display (e.g.
 * `user?.displayName ?? "Guest"`). NOTE: `null` means *loading OR signed out* —
 * for redirects/guards use `useCurrentUserState()` and check `isPending`.
 */
export function useCurrentUser(): AppUser | null {
  return useCurrentUserState().user;
}
