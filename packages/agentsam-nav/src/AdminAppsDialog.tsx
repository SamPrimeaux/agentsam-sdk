import { useEffect, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Box, Check, Clapperboard, Layers3, LayoutPanelTop, Search, TrendingUp, X } from 'lucide-react';

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
export interface AdminAppsDialogProps extends AdminAppsDirectoryProps {
  onClose(): void;
  theme?: 'dark' | 'light' | 'system';
}

function AppMark({app}:{app:AdminInstallableApp}){
  if(app.icon_url&&(app.icon_url.startsWith('/')||/^https:\/\//.test(app.icon_url)))
    return <img src={app.icon_url} alt="" loading="lazy"/>;
  const icon=app.nav_icon?.toLowerCase()||'';
  if(icon==='cad'||icon==='cad-creator')return <Box size={20}/>;
  if(icon==='moviemode'||icon==='film')return <Clapperboard size={20}/>;
  if(icon==='samsketch')return <Layers3 size={20}/>;
  if(icon==='growth')return <TrendingUp size={20}/>;
  return <LayoutPanelTop size={20}/>;
}

/** The account-owned Apps inventory, reused by Settings and the shared + menu. */
export function AdminAppsDirectory({loadApps,installApp,removeApp,updateApp,onOpenApp,onInstalled}:AdminAppsDirectoryProps) {
  const [apps,setApps]=useState<AdminInstallableApp[]>([]);
  const [view,setView]=useState<'installed'|'browse'>('installed');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [active,setActive]=useState<string|null>(null);
  const [confirmRemove,setConfirmRemove]=useState<string|null>(null);
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    setLoading(true);setError('');
    void loadApps().then(next=>{if(!cancelled)setApps(next);})
      .catch(()=>{if(!cancelled)setError('Could not verify account Apps. Retry; no installations were changed.');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[loadApps,reload]);
  const needle=query.trim().toLocaleLowerCase();
  const visible=apps.filter(app=>(view==='installed'?app.installed:!app.installed)
    && (!needle||[app.label,app.key,app.kind].join(' ').toLocaleLowerCase().includes(needle)));
  async function perform(app:AdminInstallableApp,kind:'install'|'remove'|'enable'|'disable') {
    if(active)return;
    setError('');setActive(app.key);
    try {
      if(kind==='install') await installApp(app.key);
      if(kind==='remove') await removeApp?.(app.key);
      if(kind==='enable') await updateApp?.(app.key,true);
      if(kind==='disable') await updateApp?.(app.key,false);
      // Round-trip to the account registry before showing success. A 2xx
      // mutation is not authority for the final enabled/setup state.
      const verified=await loadApps();
      setApps(verified);
      setConfirmRemove(null);
      onInstalled?.();
      if(kind==='install')setView('installed');
    }catch{
      setError('Account App change failed. No success has been assumed; refresh to verify its current state.');
    }finally{setActive(null);}
  }
  return <div className="as-apps-directory">
    <div className="as-apps-picker-controls">
      <div className="as-apps-picker-tabs" role="tablist" aria-label="Apps view">
        <button role="tab" aria-selected={view==='installed'} type="button" onClick={()=>setView('installed')}>Installed ({apps.filter(a=>a.installed).length})</button>
        <button role="tab" aria-selected={view==='browse'} type="button" onClick={()=>setView('browse')}>Browse ({apps.filter(a=>!a.installed).length})</button>
        <button type="button" className="as-apps-picker-refresh" onClick={()=>setReload(x=>x+1)} disabled={loading||Boolean(active)}>Refresh</button>
      </div>
      <label className="as-apps-picker-search"><Search size={17}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search Apps" aria-label="Search Apps"/></label>
    </div>
    <section className="as-apps-picker-list" aria-label={view==='installed'?'Installed Apps':'Available Apps'} aria-live="polite">
      {loading ? <p className="as-apps-picker-state">Verifying Apps…</p>
        : error&&!apps.length ? <div className="as-apps-picker-state" role="alert"><p>{error}</p><button type="button" onClick={()=>setReload(x=>x+1)}>Retry</button></div>
        : visible.length ? visible.map(app=><div className="as-apps-picker-item" key={app.key}>
            <span className="as-apps-picker-symbol" aria-hidden="true"><AppMark app={app}/></span>
            <div className="as-apps-picker-item-label"><strong>{app.label}</strong><small>{app.description||'Admin application'} · {app.installed?(app.enabled?'Installed':'Disabled'):'Not installed'}</small></div>
            {confirmRemove===app.key ? <span className="as-apps-picker-actions"><span className="as-apps-picker-confirm-label">Remove from this account?</span><button type="button" onClick={()=>setConfirmRemove(null)}>Cancel</button><button type="button" disabled={Boolean(active)} onClick={()=>void perform(app,'remove')}>Remove</button></span>
              : app.installed ? <span className="as-apps-picker-actions">
                  {app.enabled&&app.href?<button type="button" className="as-apps-picker-primary" onClick={()=>onOpenApp?.(app.href!)}>Open</button>:null}
                  {updateApp?<button type="button" disabled={Boolean(active)} onClick={()=>void perform(app,app.enabled?'disable':'enable')}>{app.enabled?'Disable':'Enable'}</button>:null}
                  {removeApp?<button type="button" disabled={Boolean(active)} onClick={()=>setConfirmRemove(app.key)}>Remove</button>:null}
                  {!updateApp&&!removeApp?<span className="as-apps-picker-status"><Check size={14}/> Installed</span>:null}
                </span> : app.installable ? <button type="button" className="as-apps-picker-primary" disabled={Boolean(active)} onClick={()=>void perform(app,'install')}>{active===app.key?'Installing…':'Install'}</button>
                  : <span className="as-apps-picker-status">Setup required</span>}
          </div>):<p className="as-apps-picker-state">{needle?'No Apps match this search.':view==='installed'?'No Apps installed for this account.':'No additional Apps available in this catalog.'}</p>}
    </section>
    {error&&apps.length?<p role="alert" className="as-apps-picker-error">{error}</p>:null}
    <footer className="as-apps-picker-footer"><span>App installations belong to your account. Side Stage visibility, plugins and public storefront apps are managed separately.</span></footer>
  </div>;
}

/** The same directory is used in this host-independent install dialog. */
export function AdminAppsDialog({onClose,theme='system',...directory}:AdminAppsDialogProps){
  return <Dialog.Root open onOpenChange={next=>{if(!next)onClose();}}><Dialog.Portal>
    <Dialog.Overlay className="as-apps-picker-overlay"/>
    <Dialog.Content className="as-nav-scope as-apps-picker" data-nav-theme={theme} aria-describedby="as-apps-picker-description">
      <header className="as-apps-picker-header"><div><Dialog.Title>Apps</Dialog.Title><Dialog.Description id="as-apps-picker-description">Install, open and manage your account's applications.</Dialog.Description></div><Dialog.Close className="as-apps-picker-close" aria-label="Close Apps"><X size={18}/></Dialog.Close></header>
      <AdminAppsDirectory {...directory} onOpenApp={href=>{onClose();directory.onOpenApp?.(href);}}/>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
