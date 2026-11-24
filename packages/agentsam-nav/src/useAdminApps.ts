import { useEffect, useState } from 'react';

export interface AdminInstallableApp {
  key: string;
  label: string;
  kind: 'app' | 'plugin';
  icon_url?: string | null;
  nav_icon?: string | null;
  description?: string;
  href: string | null;
  sign_in_url?: string | null;
  installed: boolean;
  enabled: boolean;
  installable: boolean;
  setup_status: string;
  /** Manifest-backed screen registrations resolved from the existing apps catalog. */
  screen_status?: 'registered' | 'not_registered' | 'manifest_missing' | string;
  manifest_id?: string | null;
  manifest_version?: string | null;
  surfaces?: string[];
  screens?: Array<{
    id: string;
    app_id?: string;
    route?: string;
    label?: string;
    navigation?: Record<string, unknown>;
    [key: string]: unknown;
  }>;
  /** Same-origin work view a host can frame in place (an app's standalone mount). */
  embed_href?: string | null;
  pinned?: boolean;
  last_opened_at?: number | null;
}
export interface AdminAppsDirectoryProps {
  loadApps(): Promise<AdminInstallableApp[]>;
  installApp(key: string): Promise<void>;
  removeApp?(key: string): Promise<void>;
  updateApp?(key: string, enabled: boolean): Promise<void>;
  onOpenApp?(href: string): void;
  onInstalled?(): void;
}

export type AdminAppsView = 'installed' | 'browse' | 'all';
export type AdminAppAction = 'install' | 'remove' | 'enable' | 'disable';
export type UseAdminAppsOptions = Pick<AdminAppsDirectoryProps, 'loadApps' | 'installApp' | 'removeApp' | 'updateApp' | 'onInstalled'> & {
  initialView?: AdminAppsView;
};

/** User-facing failure states must not confuse an unverified inventory with zero installs. */
export function accountAppsErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message : String(error ?? '');
  if (/unsupported_studio_service_operation|studio_service_apps_(?:path|method)_invalid|studio_service_bridge_unavailable/.test(code)) {
    return 'This AgentSam Desktop build cannot load account Apps. Update the desktop app; no installations were changed.';
  }
  if (code.includes('apps_account_sign_in_required')) {
    return 'AgentSam Desktop needs a valid account session. Sign in again to verify your Apps; no installations were changed.';
  }
  if (code.includes('apps_account_service_unavailable')) {
    return 'The account Apps service is temporarily unavailable. Retry; no installations were changed.';
  }
  return 'Could not verify account Apps. Retry; no installations were changed.';
}

/**
 * Account Apps state + lifecycle. One implementation shared by every surface
 * (Settings directory, the + dialog, the Side Stage App library) so install,
 * enable, disable and remove can never drift between them. `loadApps` must be
 * referentially stable (wrap it in useCallback).
 */
export function useAdminApps({ loadApps, installApp, removeApp, updateApp, onInstalled, initialView = 'installed' }: UseAdminAppsOptions) {
  const [apps, setApps] = useState<AdminInstallableApp[]>([]);
  const [view, setView] = useState<AdminAppsView>(initialView);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    void loadApps().then(next => { if (!cancelled) setApps(next); })
      .catch((error) => { if (!cancelled) setError(accountAppsErrorMessage(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadApps, reload]);
  const needle = query.trim().toLocaleLowerCase();
  const matching = apps.filter(app => (view === 'all' || (view === 'installed' ? app.installed : !app.installed))
    && (!needle || [app.label, app.key, app.kind].join(' ').toLocaleLowerCase().includes(needle)));
  // Installed apps lead the combined view; the catalog order is otherwise kept.
  const visible = view === 'all' ? [...matching].sort((a, b) => Number(b.installed) - Number(a.installed)) : matching;
  async function perform(app: AdminInstallableApp, kind: AdminAppAction) {
    if (active) return;
    setError(''); setActive(app.key);
    try {
      if (kind === 'install') await installApp(app.key);
      if (kind === 'remove') await removeApp?.(app.key);
      if (kind === 'enable') await updateApp?.(app.key, true);
      if (kind === 'disable') await updateApp?.(app.key, false);
      // Round-trip to the account registry before showing success. A 2xx
      // mutation is not authority for the final enabled/setup state.
      const verified = await loadApps();
      setApps(verified);
      setConfirmRemove(null);
      onInstalled?.();
      if (kind === 'install' && view !== 'all') setView('installed');
    } catch {
      setError('Account App change failed. No success has been assumed; refresh to verify its current state.');
    } finally { setActive(null); }
  }
  return {
    apps, visible, view, setView, query, setQuery, needle, loading, error, active,
    confirmRemove, setConfirmRemove, perform,
    refresh: () => setReload(x => x + 1),
    installedCount: apps.filter(a => a.installed).length,
    availableCount: apps.filter(a => !a.installed).length,
  };
}
