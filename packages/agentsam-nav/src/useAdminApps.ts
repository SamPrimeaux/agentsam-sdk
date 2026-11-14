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
      .catch(() => { if (!cancelled) setError('Could not verify account Apps. Retry; no installations were changed.'); })
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
