import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ArrowUpRight, ChevronDown, ChevronRight, Copy, Download, Eye, ExternalLink, File, Globe2, Lock, MoreHorizontal, Pencil, Plus, Settings2, Store } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { resolveEcommerceAdminDestination } from '@/lib/apps/ecommerce-routing';

/**
 * Native Online Store: profile-scoped website, cover preview, Draft themes with real
 * renders, and Discover themes from the public Theme Store catalog. Colors
 * come from theme tokens only.
 */

type StoreSite = { id: string; name?: string; title?: string; slug?: string; url?: string; primary_domain?: string };
type StoreTheme = {
  id: string; name?: string; version?: string; package_version?: string;
  snapshot_url?: string | null; preview_url?: string | null; edit_href?: string | null; site_id?: string;
  last_saved?: string; updated_at?: string; created_at?: string; publish_ready?: boolean; scope?: 'account'|'site';
};
type StorePayload = {
  ok?: boolean; error?: string;
  selected_site_id?: string; selected_site_name?: string; available_sites?: StoreSite[];
  site_preview?: { url?: string; title?: string; name?: string; edit_href?: string } | null;
  store?: { visibility?: string; url?: string } | null;
  active_theme?: StoreTheme | null; preview_theme?: StoreTheme | null; draft_themes?: StoreTheme[];
  new_theme_url?: string;
};
type MarketTheme = {
  slug: string; name?: string; version?: string; developer?: string; author?: string;
  thumbnail_url?: string | null; preview_url?: string | null; preview_alias?: string; can_install?: boolean;
};

const THEME_STORE = 'https://themes.inneranimalmedia.com';
const EDITOR_PATH = /^\/admin\/sites\/([A-Za-z0-9_-]{1,160})\/themes\/([A-Za-z0-9_-]{1,160})\/editor/;

function go(to: string) { window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to } })); }

/** Validate Online Store navigation against Local Studio's canonical admin routes. */
export function editorTarget(href: string | null | undefined, siteId?: string): string | null {
  return resolveEcommerceAdminDestination(href, siteId, window.location.origin);
}

/** Theme Store assets are only trusted from the Theme Store origin and its known paths. */
function trusted(value: string | null | undefined, prefix: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin === THEME_STORE && url.pathname.startsWith(prefix) ? url.href : null;
  } catch { return null; }
}
function marketCover(theme: MarketTheme) {
  return trusted(theme.thumbnail_url, '/site-media/' + theme.slug + '/') || trusted(theme.thumbnail_url, '/previews/');
}
function marketPreview(theme: MarketTheme) {
  const direct = trusted(theme.preview_url, '/theme-packages/' + theme.slug + '/')
    || trusted(theme.preview_url, '/themes/' + theme.slug + '/presets/' + theme.slug + '/demo/');
  if (direct) return direct;
  try {
    const url = new URL(theme.preview_url || '');
    const alias = theme.preview_alias || '';
    return url.origin === THEME_STORE && /^[a-z][a-z0-9-]{1,63}$/.test(alias) && url.pathname === '/' + alias + '/' && !url.search && !url.hash
      ? url.href : null;
  } catch { return null; }
}

function InAppLink({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    go(to);
  };
  return <a href={to} onClick={onClick} className={className}>{children}</a>;
}

const pill = 'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted';
const primary = 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90';

function formatSaved(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const month = date.toLocaleString('en-GB', { month: 'short' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${date.getDate()} ${month} at ${time}`;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', headers: { accept: 'application/json' }, signal });
  const data = await response.json().catch(() => null);
  if (!response.ok || (data && data.ok === false)) throw new Error((data && data.error) || 'request_failed');
  return data as T;
}

/** A real, scaled render of the saved draft (never a placeholder when the project loads). */
function DraftPreview({ theme }: { theme: StoreTheme }) {
  const [html, setHtml] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const match = (theme.edit_href || '').match(EDITOR_PATH);
  const siteId = theme.site_id || match?.[1] || '';
  const projectId = match?.[2] || '';
  const snapshot = theme.snapshot_url && !imageFailed ? theme.snapshot_url : null;

  useEffect(() => {
    if (snapshot || !siteId || !projectId) return;
    const controller = new AbortController();
    (async () => {
      try {
        const data = await getJson<{ project?: { pages?: Array<{ slug?: string; assetBase?: string }>; tokens?: unknown } }>(
          `/api/admin/cms/theme-projects/${encodeURIComponent(projectId)}?site_id=${encodeURIComponent(siteId)}`, controller.signal);
        const pages = data.project?.pages || [];
        const page = pages.find(item => item.slug === 'home') || pages[0];
        if (!page) return;
        const { renderDraftPage } = await import('@/lib/themes/render-draft');
        if (!controller.signal.aborted) setHtml(renderDraftPage(page, data.project?.tokens || {}, page.assetBase || undefined));
      } catch { /* the initial tile below stays */ }
    })();
    return () => controller.abort();
  }, [snapshot, siteId, projectId]);

  const initial = (theme.name || 'T').trim().charAt(0).toUpperCase();
  return (
    <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
      {snapshot
        ? <img src={snapshot} alt="" loading="lazy" className="h-full w-full object-cover object-top" onError={() => setImageFailed(true)} />
        : html
          ? <iframe srcDoc={html} title="" aria-hidden="true" tabIndex={-1} sandbox="" loading="lazy"
              className="pointer-events-none absolute left-0 top-0 h-[800px] w-[1280px] origin-top-left scale-[0.1] border-0 bg-white" />
          : <span aria-hidden="true" className="flex h-full w-full items-center justify-center text-lg font-semibold text-muted-foreground">{initial}</span>}
    </div>
  );
}

function DraftRow({ theme, siteId, onPublished }: { theme: StoreTheme; siteId: string; onPublished: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const edit = editorTarget(theme.edit_href, theme.site_id || siteId);
  const saved = formatSaved(theme.last_saved || theme.updated_at || theme.created_at);
  const version = theme.version || theme.package_version;
  const canPublish = theme.publish_ready === true;

  const publish = async () => {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/store/themes/${encodeURIComponent(theme.id)}/publish`, { method: 'POST', credentials: 'same-origin' });
      const data = await response.json().catch(() => null);
      if (!response.ok || (data && data.ok === false)) throw new Error((data && data.error) || 'publish_failed');
      setConfirming(false);
      onPublished();
    } catch { setError('This theme could not be published. Your live site has not changed.'); }
    finally { setBusy(false); }
  };

  return (
    <li className="flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:flex sm:gap-4">
        <DraftPreview theme={theme} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold text-foreground">{theme.name || 'Untitled theme'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{saved ? `Last saved: ${saved}` : 'Not saved yet'}{version ? ` · v${version}` : ''}</p>
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-2 sm:ml-auto sm:shrink-0">
        {canPublish && <Button variant="outline" size="sm" onClick={() => setConfirming(true)} disabled={busy}>Publish</Button>}
        {edit && <InAppLink to={edit} className={cn(pill, primary)}>Edit theme</InAppLink>}
        <ThemeActions theme={theme} siteId={siteId} preview={publicPreviewUrl(theme.preview_url)} onChanged={onPublished}/>
        </div>
      </div>
      {confirming && (
        <div role="alertdialog" aria-label="Publish theme" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted px-4 py-3">
          <p className="text-sm text-foreground">Publish this theme? The current live theme moves to Drafts and can be restored.</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>Cancel</Button>
            <Button size="sm" onClick={publish} disabled={busy}>{busy ? 'Publishing…' : 'Publish'}</Button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

function DiscoverCard({ theme, siteId }: { theme: MarketTheme; siteId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const cover = marketCover(theme);
  const preview = marketPreview(theme);
  const add = async () => {
    if (!siteId) { setError('Choose a website before adding a theme.'); return; }
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/website-themes/${encodeURIComponent(theme.slug)}/install`, {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ version: theme.version, site_id: siteId }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || typeof data?.editor_url !== 'string') throw new Error(data?.error || 'install_failed');
      if (data.site_id !== siteId) throw new Error('installed_site_mismatch');
      const target = editorTarget(data.editor_url, siteId);
      if (!target) throw new Error('invalid_editor_destination');
      go(target);
    } catch { setError('This theme could not be added. Your existing sites have not changed.'); setBusy(false); }
  };
  const visual = cover && !imageFailed
    ? <img src={cover} alt={`${theme.name || theme.slug} theme cover`} loading="lazy" className="h-full w-full object-cover object-top" onError={() => setImageFailed(true)} />
    : <div className="flex h-full items-center justify-center text-3xl font-semibold text-muted-foreground" aria-hidden="true">{(theme.name || theme.slug).charAt(0).toUpperCase()}</div>;
  return (
    <li className="flex flex-col gap-3">
      <div className="aspect-[16/10] sm:aspect-[4/5] overflow-hidden rounded-xl border border-border bg-muted">
        {preview
          ? <a href={preview} target="_blank" rel="noopener noreferrer" aria-label={`Preview ${theme.name || theme.slug}`} className="block h-full w-full">{visual}</a>
          : visual}
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{theme.name || theme.slug}</p>
          <p className="break-all text-xs text-muted-foreground">by {theme.developer || theme.author || 'InnerAnimalMedia'}</p>
        </div>
        {theme.can_install && <Button variant="outline" size="sm" onClick={add} disabled={busy}>{busy ? 'Adding…' : 'Add'}</Button>}
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </li>
  );
}

function PreviewViewport({url, width, height, title}: {url: string; width: number; height: number; title: string}) {
  const frame = useRef<HTMLDivElement>(null);
  const [scale,setScale] = useState(0);
  useEffect(() => {
    const node=frame.current;
    if (!node) return;
    const resize=()=>setScale(node.clientWidth/width);
    resize();
    const observer=new ResizeObserver(resize);
    observer.observe(node);
    return ()=>observer.disconnect();
  },[width]);
  return <div ref={frame} className="relative w-full overflow-hidden bg-muted" style={{aspectRatio:width+'/'+height}}>
    {scale>0 && <iframe src={url} title={title} loading="lazy" sandbox="allow-scripts allow-same-origin"
      className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
      style={{width,height,transform:'scale('+scale+')'}} />}
  </div>;
}

function storeHref(siteId:string, view:'overview'|'themes'='overview') {
  return '/admin/store?'+new URLSearchParams({site_id:siteId,...(view==='themes'?{view}: {})});
}
function publicPreviewUrl(value?:string|null) {
  try {const url=new URL(value||'');return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}
}
type PasswordSettings={passwordProtection:boolean;hasStorePassword:boolean};
function StoreProtection({siteId,onProtectionChange}: {siteId:string;onProtectionChange:(value:boolean)=>void}) {
  const [settings,setSettings]=useState<PasswordSettings|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const prefs='/admin/preferences?site_id='+encodeURIComponent(siteId)+'#section-access';
  const endpoint='/api/admin/store/preferences?site_id='+encodeURIComponent(siteId);
  useEffect(()=>{
    const controller=new AbortController();
    setSettings(null);setMessage('');
    getJson<{settings?:PasswordSettings}>(endpoint,controller.signal).then(data=>{
      if(!controller.signal.aborted&&typeof data.settings?.passwordProtection==='boolean'){setSettings(data.settings);onProtectionChange(data.settings.passwordProtection);}
    }).catch(()=>{});
    return()=>controller.abort();
  },[endpoint,onProtectionChange]);
  const toggle=async()=>{
    if(!settings||busy)return;
    const enabled=!settings.passwordProtection;
    if(enabled&&!settings.hasStorePassword){go(prefs);return;}
    if(!enabled&&!window.confirm('Remove password protection for this website? Published pages may become publicly accessible.'))return;
    setBusy(true);setMessage('');
    try{
      const response=await fetch(endpoint,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({settings:{passwordProtection:enabled}})});
      const result=await response.json();
      if(!response.ok||!result.ok||typeof result.settings?.passwordProtection!=='boolean')throw Error('save_failed');
      setSettings(result.settings);
      onProtectionChange(result.settings.passwordProtection);
    }catch{setMessage('Could not update protection. Try again.');}finally{setBusy(false);}
  };
  return <section className="rounded-3xl border border-border bg-card p-4 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1"><p className="text-[17px] font-medium">Password protection</p><p className="text-sm text-muted-foreground">Protect your store with a password</p></div>
      {settings?<button type="button" role="switch" aria-label="Password protection" aria-checked={settings.passwordProtection} disabled={busy}
        onClick={toggle} className={cn('relative h-9 w-[60px] shrink-0 rounded-full border border-border p-1 transition-colors disabled:opacity-50',settings.passwordProtection?'bg-foreground':'bg-muted')}>
        <span className={cn('block size-7 rounded-full bg-background shadow transition-transform',settings.passwordProtection&&'translate-x-6')} />
      </button>:<InAppLink to={prefs} className="text-sm underline">Manage</InAppLink>}
    </div>
    {message&&<p role="alert" className="mt-2 text-xs text-destructive">{message}</p>}
    <InAppLink to={prefs} className="mt-3 flex min-h-12 items-center gap-3 text-[17px]"><Settings2 className="size-6 text-muted-foreground"/>Preferences<ChevronRight className="ml-auto size-4 text-muted-foreground"/></InAppLink>
  </section>;
}

function ThemeActions({theme,siteId,onChanged,preview}: {theme:StoreTheme;siteId:string;onChanged:()=>void;preview?:string|null}) {
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const match=theme.edit_href?.match(EDITOR_PATH);
  const accountProject=theme.scope==='account'&&theme.edit_href?.startsWith('/admin/theme-editor?')?new URL(theme.edit_href,location.origin).searchParams.get('project'):null;
  const projectId=match?.[2]||accountProject;
  const ownerSite=accountProject?null:theme.site_id||match?.[1]||null;
  const query=ownerSite?'?site_id='+encodeURIComponent(ownerSite):'';
  const base=projectId&&/^[A-Za-z0-9_-]{1,160}$/.test(projectId)&&(accountProject||ownerSite===siteId)?'/api/admin/cms/theme-projects/'+encodeURIComponent(projectId):null;
  const endpoint=base?base+query:null;
  async function execute(action:'rename'|'duplicate'|'download') {
    if(!endpoint||!base||!projectId||busy)return;
    setBusy(true);setError('');
    try{
      if(action==='duplicate'){
        const response=await fetch(base+'/duplicate'+query,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});
        const result=await response.json();if(!response.ok||!result.ok)throw Error('duplicate_failed');
        onChanged();
      } else {
        const result=await getJson<{project:Record<string,unknown>}>(endpoint);
        if(!result.project||result.project.id!==projectId)throw Error('project_missing');
        if(action==='download'){
          const url=URL.createObjectURL(new Blob([JSON.stringify(result.project,null,2)],{type:'application/json'}));
          const a=document.createElement('a');a.href=url;a.download=projectId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
        }else{
          const name=window.prompt('Rename theme',String(result.project.name||theme.name||''))?.trim();
          if(!name||name===result.project.name)return;
          if(!Number.isInteger(result.project.revision))throw Error('revision_missing');
          const response=await fetch(endpoint,{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({project:{...result.project,name},expected_version:result.project.revision})});
          const saved=await response.json();if(!response.ok||!saved.ok)throw Error('rename_failed');
          onChanged();
        }
      }
    }catch{setError('Theme action failed. Your existing theme has been retained.');}finally{setBusy(false);}
  }
  if(!endpoint&&!preview)return null;
  return <div>
    <DropdownMenu>
      <DropdownMenuTrigger asChild><button type="button" disabled={busy} className="grid size-12 place-items-center rounded-full border border-border bg-muted" aria-label="Theme actions"><MoreHorizontal className="size-6"/></button></DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-[60dvh] w-64 overflow-y-auto rounded-2xl p-2">
        {preview&&<DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>window.open(preview,'_blank','noopener,noreferrer')}><Eye className="size-5"/>Preview</DropdownMenuItem>}
        {endpoint&&<>
          <DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>void execute('rename')}><Pencil className="size-5"/>Rename</DropdownMenuItem>
          <DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>void execute('duplicate')}><Copy className="size-5"/>Duplicate</DropdownMenuItem>
          <DropdownMenuItem className="min-h-12" onSelect={()=>go('/admin/apps/ecommerce-cms-agentsam?'+new URLSearchParams({page:'/admin/theme-code-editor',project:projectId!,...(ownerSite?{site_id:ownerSite}:{})}))}>Edit code</DropdownMenuItem>
          <DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>void execute('download')}><Download className="size-5"/>Download project JSON</DropdownMenuItem>
        </>}
      </DropdownMenuContent>
    </DropdownMenu>
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}

export function OnlineStorePage({ siteId,view='overview' }: { siteId?: string;view?:'overview'|'themes' }) {
  const [data, setData] = useState<StorePayload | null>(null);
  const [error, setError] = useState('');
  const [market, setMarket] = useState<MarketTheme[] | null>(null);
  const [tick, setTick] = useState(0);
  const [moreOpen,setMoreOpen]=useState(false);
  const [protectionOverride,setProtectionOverride]=useState<{siteId:string;protected:boolean}|null>(null);
  const updateProtection=useCallback((value:boolean)=>{const id=data?.selected_site_id||siteId;if(id)setProtectionOverride({siteId:id,protected:value});},[data?.selected_site_id,siteId]);
  const reload = useCallback(() => setTick(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setError('');
    setData(null); // Never show the previous merchant's cover while switching accounts/sites.
    getJson<StorePayload>('/api/admin/store/online' + (siteId ? '?site_id=' + encodeURIComponent(siteId) : ''), controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(String(cause?.message || 'request_failed')); });
    return () => controller.abort();
  }, [siteId, tick]);

  useEffect(() => {
    const controller = new AbortController();
    // The canonical catalog returns products. Retain the verified installed-site
    // theme preview and card normalization introduced on main.
    getJson<{ products?: MarketTheme[] }>('/api/admin/website-themes', controller.signal)
      .then(result => setMarket((result.products || []).filter(item => item && item.slug && item.name)))
      .catch(() => { if (!controller.signal.aborted) setMarket([]); });
    return () => controller.abort();
  }, []);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl p-8" role="alert">
        <h1 className="text-xl font-semibold text-foreground">Online Store</h1>
        <p className="mt-3 text-sm text-muted-foreground">We couldn’t load your store right now.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="outline" onClick={reload}>Try again</Button>
          <Button onClick={() => window.location.assign('/start')}>Create or choose a store <ArrowUpRight className="ml-2 size-4" /></Button>
        </div>
      </div>
    );
  }
  if (!data) return <p role="status" className="p-8 text-sm text-muted-foreground">Loading Online Store…</p>;

  const sites = data.available_sites || [];
  if (!sites.length) {
    return <div className="mx-auto flex max-w-2xl flex-col gap-5 px-6 py-16">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Online Store</span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Create your first store</h1>
      <p className="text-sm leading-7 text-muted-foreground">Your account is ready. Give your website a name to create its own CMS workspace, then edit pages and choose a storefront design. You won't be redirected into someone else's dashboard.</p>
      <Button onClick={() => window.location.assign('/start')} className="w-fit">Create store <ArrowUpRight className="ml-2 size-4" /></Button>
    </div>;
  }
  const selectedId = data.selected_site_id || siteId || '';
  const selected = sites.find(site => site.id === selectedId);
  if (!selected) {
    return <div className="mx-auto max-w-2xl px-6 py-12" role="status">
      <h1 className="text-xl font-semibold text-foreground">Select a store from your profile</h1>
      <p className="mt-2 text-sm text-muted-foreground">The profile menu owns store switching. Choose a store there to open its cover and themes.</p>
    </div>;
  }
  const siteName = data.selected_site_name || selected?.name || selected?.title || 'Your website';
  const live = publicPreviewUrl(data.site_preview?.url || (data.store?.visibility==='public'||data.store?.visibility==='password'?data.store?.url:null));
  const activeTheme = data.active_theme || null;
  const isProtected=protectionOverride?.siteId===selectedId?protectionOverride.protected:data.store?.visibility==='password';
  const prefs='/admin/preferences?site_id='+encodeURIComponent(selectedId)+'#section-access';
  const pages='/admin/pages?site_id='+encodeURIComponent(selectedId);
  const themesView=view==='themes';
  const activeEdit = editorTarget(activeTheme?.edit_href || data.site_preview?.edit_href, selectedId);
  const createTheme = editorTarget(data.new_theme_url, selectedId);
  const activeSaved = formatSaved(activeTheme?.last_saved || activeTheme?.updated_at || activeTheme?.created_at);
  const drafts = (data.draft_themes || []).filter(draft => draft.id !== activeTheme?.id);


  return (
    <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-6 px-3 pt-4 pb-28 sm:gap-8 sm:px-6 sm:py-8">
      <header className="flex min-h-12 items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild><button className="flex min-w-0 items-center gap-1 text-left" type="button" aria-label="Online Store destinations"><h1 className="truncate text-[30px] font-semibold tracking-tight">{themesView?'Themes':'Online Store'}</h1><span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted"><ChevronDown className="size-4"/></span></button></DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 rounded-3xl p-2">
            <DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>go(storeHref(selectedId))}><Store className="size-5"/>Online Store{!themesView&&<span className="ml-auto">✓</span>}</DropdownMenuItem>
            <DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>go(storeHref(selectedId,'themes'))}><Globe2 className="size-5"/>Themes{themesView&&<span className="ml-auto">✓</span>}</DropdownMenuItem>
            <DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>go(pages)}><File className="size-5"/>Pages</DropdownMenuItem>
            <DropdownMenuItem className="min-h-12 gap-3" onSelect={()=>go(prefs)}><Settings2 className="size-5"/>Preferences</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!themesView&&<div className="flex shrink-0 items-center rounded-full border border-border bg-card px-1">
          {live&&<a href={live} target="_blank" rel="noopener noreferrer" aria-label="View website" className="grid size-11 place-items-center"><Eye className="size-6"/></a>}
          <button type="button" aria-label="More options" onClick={()=>setMoreOpen(true)} className="grid size-11 place-items-center"><MoreHorizontal className="size-6"/></button>
        </div>}
      </header>
      {moreOpen&&<div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/30 p-2" onClick={()=>setMoreOpen(false)}>
        <section role="dialog" aria-modal="true" aria-label="More options" className="w-full max-w-md rounded-[30px] border border-border bg-card p-5 shadow-xl pb-[max(24px,env(safe-area-inset-bottom))]" onClick={event=>event.stopPropagation()}>
          <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-muted-foreground/40"/>
          <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">More options</h2><Button variant="ghost" onClick={()=>setMoreOpen(false)}>Done</Button></div>
          <button type="button" className="flex min-h-12 w-full items-center gap-3 text-left" onClick={()=>{setMoreOpen(false);go(storeHref(selectedId,'themes'));}}>Manage all themes</button>
          <button type="button" className="flex min-h-12 w-full items-center gap-3 text-left" onClick={()=>{setMoreOpen(false);go(prefs);}}>Preferences</button>
        </section>
      </div>}

      <section aria-label={activeTheme?'Current theme':'Website preview'} className="min-w-0">
        <div className="relative mb-4 flex items-end bg-muted/40 px-1 pt-5">
          {live?<><div className="w-[77%] overflow-hidden rounded-t-lg border-2 border-border bg-card"><PreviewViewport url={live} width={1440} height={1050} title={siteName+' desktop preview'}/></div>
            <div className="absolute bottom-0 right-1 w-[34%] overflow-hidden rounded-t-xl border-2 border-border bg-card shadow-md"><PreviewViewport url={live} width={390} height={620} title={siteName+' mobile preview'}/></div></>
            :<div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 text-muted-foreground"><Globe2 className="size-8"/><p className="text-sm">No verified published website preview</p></div>}
          {isProtected&&<InAppLink to={prefs} className="absolute inset-x-3 bottom-3 z-10 flex min-h-11 items-center gap-2 rounded-2xl border border-amber-200 bg-amber-100 px-3 py-2 text-sm font-medium text-amber-950 shadow"><Lock className="size-5 shrink-0"/><span className="flex-1">Online store is password protected</span><ChevronRight className="size-5 shrink-0"/></InAppLink>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 break-words text-xl font-semibold">{activeTheme?.name||siteName}</h2>
          {!themesView&&activeTheme&&<span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-900">Current theme</span>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{activeSaved?'Last saved: '+activeSaved:live?'Published website':'No published theme'}</p>
        {themesView&&(activeTheme?.version||activeTheme?.package_version)&&<p className="mt-1 text-sm text-muted-foreground">Version {activeTheme.version||activeTheme.package_version}</p>}
        <div className={cn('mt-4 gap-2',themesView?'flex items-center':'flex flex-col')}>
          {themesView&&activeTheme&&<ThemeActions theme={activeTheme} siteId={selectedId} preview={live} onChanged={reload}/>}
          {activeEdit&&<InAppLink to={activeEdit} className={cn(pill,primary,'min-h-12 rounded-full text-base',!themesView&&'w-full')}>{activeTheme?'Edit theme':'Edit website'}</InAppLink>}
          {!themesView&&<InAppLink to={storeHref(selectedId,'themes')} className={cn(pill,'min-h-12 w-full rounded-full text-base')}>Manage all themes</InAppLink>}
        </div>
      </section>

      {!themesView&&<div className="grid gap-4">
        <InAppLink to={pages} className="flex min-h-14 items-center gap-3 rounded-full border border-border bg-card px-4 text-[17px] shadow-sm"><File className="size-6 text-muted-foreground"/>Pages<ChevronRight className="ml-auto size-4 text-muted-foreground"/></InAppLink>
        <StoreProtection key={selectedId} siteId={selectedId} onProtectionChange={updateProtection}/>
      </div>}

      {themesView&&<>
      <section aria-label="Draft themes">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Draft themes</h2>
          <div className="flex flex-wrap items-center gap-2">
            {createTheme && <InAppLink to={createTheme} className={cn(pill, primary)}><Plus className="size-4" aria-hidden="true" />New theme</InAppLink>}
            <a href="#discover-themes" className={pill}>Discover themes</a>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-card">
          {drafts.length
            ? <ul>{drafts.map(draft => <DraftRow key={draft.id} theme={draft} siteId={selectedId} onPublished={reload} />)}</ul>
            : <p className="px-5 py-8 text-sm text-muted-foreground">No draft themes yet. Create one, or add a theme below to start editing.</p>}
        </div>
      </section>

      <section id="discover-themes" aria-label="Discover themes">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Discover themes</h2>
          <a className={pill} href={THEME_STORE + '/'} target="_blank" rel="noopener noreferrer">Visit Theme Store <ExternalLink className="size-3.5" aria-hidden="true" /></a>
        </div>
        {market === null
          ? <p role="status" className="text-sm text-muted-foreground">Loading themes…</p>
          : market.length
            ? <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{market.map(theme => <DiscoverCard key={theme.slug} theme={theme} siteId={selectedId} />)}</ul>
            : <p className="text-sm text-muted-foreground">Themes couldn’t be loaded right now. Visit the Theme Store to browse them.</p>}
      </section>
      </>}
    </div>
  );
}
