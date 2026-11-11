import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, ExternalLink, Plus, Search, X } from 'lucide-react';

export interface AdminInstallableApp {
  key: string;
  label: string;
  kind: 'app' | 'plugin';
  icon_url?: string | null;
  href: string | null;
  sign_in_url?: string | null;
  installed: boolean;
  enabled: boolean;
  installable: boolean;
  setup_status: string;
}
export interface AdminAppsDialogProps {
  onClose(): void;
  loadApps(): Promise<AdminInstallableApp[]>;
  installApp(key: string): Promise<void>;
  onOpenApp?(href: string): void;
  onInstalled?(): void;
  theme?: 'dark' | 'light' | 'system';
}

/**
 * Portable admin Apps picker. A host supplies its authenticated catalogue and
 * install actions; the component never invents entitlements or duplicates
 * navigation, theme editing, and storefront app embeds.
 */
export function AdminAppsDialog({ onClose, loadApps, installApp, onOpenApp, onInstalled, theme='system' }: AdminAppsDialogProps) {
  const [apps, setApps] = useState<AdminInstallableApp[]>([]);
  const [view, setView] = useState<'browse' | 'installed'>('browse');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [active, setActive] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled=false;
    setLoading(true);
    setError('');
    void loadApps()
      .then(next => { if (!cancelled) setApps(next); })
      .catch(() => { if (!cancelled) setError('Apps could not be verified. Retry to load your installation status.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadApps, reload]);
  const visible = apps.filter(app => (view === 'installed' ? app.installed : !app.installed)
    && (!query || [app.label, app.kind, app.key].join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())));
  const onInstall = async (app: AdminInstallableApp) => {
    if (active || !app.installable) return;
    setActive(app.key);
    setError('');
    try {
      await installApp(app.key);
      onInstalled?.();
      setApps(current => current.map(item => item.key === app.key
        ? { ...item, installed: true, enabled: true, setup_status: 'configured' } : item));
      setView('installed');
    } catch {
      setError('Installation did not complete. No access was granted. Retry or review your account permissions.');
    } finally { setActive(null); }
  };
  return <Dialog.Root open onOpenChange={next => { if (!next) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="as-apps-picker-overlay" />
      <Dialog.Content className="as-nav-scope as-apps-picker" data-nav-theme={theme} aria-describedby="as-apps-picker-description">
        <header className="as-apps-picker-header">
          <div><Dialog.Title>Apps</Dialog.Title><Dialog.Description id="as-apps-picker-description">Open an installed app or install an available capability into this account.</Dialog.Description></div>
          <Dialog.Close className="as-apps-picker-close" aria-label="Close Apps"><X size={18}/></Dialog.Close>
        </header>
        <div className="as-apps-picker-controls">
          <div className="as-apps-picker-tabs" role="tablist" aria-label="Apps view">
            <button role="tab" aria-selected={view === 'installed'} type="button" onClick={() => setView('installed')}>Installed</button>
            <button role="tab" aria-selected={view === 'browse'} type="button" onClick={() => setView('browse')}>Browse</button>
          </div>
          <label className="as-apps-picker-search"><Search size={17}/><input autoFocus type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find apps and integrations" aria-label="Search apps"/></label>
        </div>
        <section className="as-apps-picker-list" aria-label={view === 'installed' ? 'Installed apps' : 'Available apps'} aria-live="polite">
          {loading ? <p className="as-apps-picker-state">Checking your installations…</p>
            : error && !apps.length ? <div className="as-apps-picker-state"><p>{error}</p><button type="button" onClick={()=>setReload(n=>n+1)}>Retry</button></div>
            : visible.length ? visible.map(app => <div className="as-apps-picker-item" key={app.key}>
                <span className="as-apps-picker-symbol" aria-hidden="true">{app.icon_url && (app.icon_url.startsWith('/') || /^https:\/\//.test(app.icon_url)) ? <img src={app.icon_url} alt="" loading="lazy"/> : app.kind === 'app' ? <Plus size={17}/> : <ExternalLink size={17}/>}</span>
                <div className="as-apps-picker-item-label"><strong>{app.label}</strong><small>{app.kind === 'app' ? 'Admin application' : 'Integration'}{app.installed && !app.enabled ? ' · Disabled' : ''}</small></div>
                {app.installed && app.enabled && app.href
                  ? <button type="button" className="as-apps-picker-primary" onClick={()=>{onClose();onOpenApp?.(app.href!);}}>Open</button>
                  : app.installed ? <span className="as-apps-picker-status"><Check size={14}/> {app.enabled ? 'Installed' : 'Disabled'}</span>
                    : app.installable ? <button type="button" className="as-apps-picker-primary" disabled={Boolean(active)} onClick={()=>void onInstall(app)}>{active===app.key?'Installing…':'Install'}</button>
                      : <span className="as-apps-picker-status">Setup required</span>}
              </div>) : <p className="as-apps-picker-state">{query ? 'No matching apps.' : view === 'installed' ? 'No installed apps in this account.' : 'No additional installable apps in this catalog.'}</p>}
        </section>
        {error && apps.length ? <p role="alert" className="as-apps-picker-error">{error}</p> : null}
        <footer className="as-apps-picker-footer"><span>Apps, plugins, and storefront embeds retain their own install permissions.</span><a href="https://apps.inneranimalmedia.com/" target="_blank" rel="noopener noreferrer">Browse public App Store <ExternalLink size={13}/></a></footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
