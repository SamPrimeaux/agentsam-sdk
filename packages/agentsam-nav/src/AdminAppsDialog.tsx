import * as Dialog from '@radix-ui/react-dialog';
import { Box, Check, Clapperboard, ClipboardList, Database, Layers3, LayoutPanelTop, PenTool, Search, ShoppingBag, Target, TrendingUp, X } from 'lucide-react';
import { useAdminApps, type AdminAppsDirectoryProps, type AdminInstallableApp } from './useAdminApps.js';

export type { AdminAppsDirectoryProps, AdminInstallableApp } from './useAdminApps.js';
export interface AdminAppsDialogProps extends AdminAppsDirectoryProps {
  onClose(): void;
  theme?: 'dark' | 'light' | 'system';
}

/** Catalog icon: an uploaded icon_url wins, otherwise the app's nav_icon key maps to a symbol. */
export function AdminAppMark({app,size=20}:{app:AdminInstallableApp;size?:number}){
  if(app.icon_url&&(app.icon_url.startsWith('/')||/^https:\/\//.test(app.icon_url)))
    return <img src={app.icon_url} alt="" loading="lazy"/>;
  const icon=app.nav_icon?.toLowerCase()||'';
  if(icon==='cad'||icon==='cad-creator')return <Box size={size}/>;
  if(icon==='moviemode'||icon==='film')return <Clapperboard size={size}/>;
  if(icon==='samsketch')return <Layers3 size={size}/>;
  if(icon==='growth')return <TrendingUp size={size}/>;
  if(icon==='database')return <Database size={size}/>;
  if(icon==='goalguru'||icon==='target')return <Target size={size}/>;
  if(icon==='cms'||icon==='commerce')return <ShoppingBag size={size}/>;
  if(icon==='forms')return <ClipboardList size={size}/>;
  if(icon==='canvas'||icon==='design-canvas')return <PenTool size={size}/>;
  return <LayoutPanelTop size={size}/>;
}

/** The account-owned Apps inventory, reused by Settings and the shared + menu. */
export function AdminAppsDirectory({loadApps,installApp,removeApp,updateApp,onOpenApp,onInstalled}:AdminAppsDirectoryProps) {
  const {apps,visible,view,setView,query,setQuery,needle,loading,error,active,confirmRemove,setConfirmRemove,perform,refresh}=
    useAdminApps({loadApps,installApp,removeApp,updateApp,onInstalled});
  const installedCount = !apps.length && (loading || Boolean(error)) ? '—' : String(apps.filter(a=>a.installed).length);
  const browseCount = !apps.length && (loading || Boolean(error)) ? '—' : String(apps.filter(a=>!a.installed).length);
  return <div className="as-apps-directory">
    <div className="as-apps-picker-controls">
      <div className="as-apps-picker-tabs" role="tablist" aria-label="Apps view">
        <button role="tab" aria-selected={view==='installed'} type="button" onClick={()=>setView('installed')}>Installed ({installedCount})</button>
        <button role="tab" aria-selected={view==='browse'} type="button" onClick={()=>setView('browse')}>Browse ({browseCount})</button>
        <button type="button" className="as-apps-picker-refresh" onClick={()=>refresh()} disabled={loading||Boolean(active)}>Refresh</button>
      </div>
      <label className="as-apps-picker-search"><Search size={17}/><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search Apps" aria-label="Search Apps"/></label>
    </div>
    <section className="as-apps-picker-list" aria-label={view==='installed'?'Installed Apps':'Available Apps'} aria-live="polite">
      {loading ? <p className="as-apps-picker-state">Verifying Apps…</p>
        : error&&!apps.length ? <div className="as-apps-picker-state" role="alert"><p>{error}</p><button type="button" onClick={()=>refresh()}>Retry</button></div>
        : visible.length ? visible.map(app=><div className="as-apps-picker-item" key={app.key}>
            <span className="as-apps-picker-symbol" aria-hidden="true"><AdminAppMark app={app}/></span>
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
    <footer className="as-apps-picker-footer"><span>App installations belong to your account. Tool visibility, plugins and public storefront apps are managed separately.</span></footer>
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
