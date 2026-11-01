import { isPackagedDesktop } from '@/lib/desktop/tauri';

/**
 * Hosted account identity for Theme Studio reconciliation.
 *
 * The hosted Worker authenticates every document request before the React app
 * mounts, but the production bundle ships with VITE_AUTH_ENABLED=false, so
 * `useCurrentUser()` reports the sandbox `dev-user` fallback. Treating that as
 * "no account" skipped the cms_themes registry on React routes (/media, /themes,
 * AgentSam) and left the dark palette while static Console routes (/admin/home)
 * rendered the saved account theme — two competing appearance authorities.
 *
 * This resolves the real account from the same IAM contract the Worker uses
 * (`/api/auth/me`). It never invents an identity: signed-out / failure → null.
 */
let pending: Promise<string | null> | null = null;
let known: string | null = null;

export function knownHostedAccountId(): string | null {
  return known;
}

export function resolveHostedAccountId(force = false): Promise<string | null> {
  if (typeof window === 'undefined' || isPackagedDesktop()) return Promise.resolve(null);
  if (pending && !force) return pending;
  pending = fetch('/api/auth/me', { credentials: 'same-origin', headers: { accept: 'application/json' } })
    .then(async (response) => {
      if (!response.ok) return null;
      const body = await response.json().catch(() => null) as { authenticated?: boolean; user?: { id?: string } } | null;
      const id = body?.authenticated && typeof body.user?.id === 'string' ? body.user.id : null;
      known = id;
      return id;
    })
    .catch(() => null);
  return pending;
}

export function forgetHostedAccountId() {
  pending = null;
  known = null;
}
