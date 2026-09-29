import { useEffect, useState } from "react";
import { authClient, authEnabled } from "./client";
import { getTauriInvoke, invokeIdentity, isPackagedDesktop, secureStoreGet } from "@/lib/desktop/tauri";

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

function useDesktopCurrentUserState(): CurrentUserState {
  const [state, setState] = useState<CurrentUserState>({
    user: null,
    isPending: true,
  });

  useEffect(() => {
    const invoke = getTauriInvoke();
    if (!invoke) {
      setState({ user: DEV_USER, isPending: false });
      return;
    }

    let active = true;

    async function restore() {
      try {
        const sessionId = await secureStoreGet("identity_session");

        if (!sessionId) {
          if (active) setState({ user: DEV_USER, isPending: false });
          return;
        }

        const status = (await invokeIdentity({
          op: "status",
          session_id: sessionId,
        })) as DesktopIdentityMessage;
        const user = normalizeDesktopUser(status.user);
        if (active) {
          setState({
            user: status.authenticated && user ? user : DEV_USER,
            isPending: false,
          });
        }
      } catch {
        if (active) setState({ user: DEV_USER, isPending: false });
      }
    }

    function onMessage(event: MessageEvent) {
      const message = event.data as DesktopIdentityMessage | undefined;
      if (message?.type !== "agentsam:desktop-identity") return;
      const user = normalizeDesktopUser(message.user);
      setState({
        user: message.authenticated && user ? user : DEV_USER,
        isPending: false,
      });
    }

    void restore();
    window.addEventListener("message", onMessage);
    return () => {
      active = false;
      window.removeEventListener("message", onMessage);
    };
  }, []);

  return state;
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
