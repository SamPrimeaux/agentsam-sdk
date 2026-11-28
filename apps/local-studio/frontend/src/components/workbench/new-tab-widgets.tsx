import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuiltinWidget, WidgetFrame, creativeWidgetEntry, type CreativeWidgetHost } from '@inneranimalmedia/agentsam-workbench/widgets';
import type { AgentSamWidgetDataHost } from '@inneranimalmedia/agentsam-contracts/widgets';
import '@inneranimalmedia/agentsam-workbench/widgets/widgets.css';
import { Minus, ArrowDown, ArrowUp, GripVertical, LayoutGrid, Pin, PinOff, Plus, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconAction } from '@/components/ui/icon-action';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCurrentUser } from '@/lib/auth/use-current-user';
import {
  loadAccountWidgets, installAccountWidget, updateAccountWidget, uninstallAccountWidget, reorderAccountWidgets,
  type AccountWidget,
} from '@/lib/widgets/account-widgets';
import { cn } from '@/lib/utils';
import './new-tab-widgets.css';
import {WorkspaceMediaPicker} from './workspace-media-picker';
import type {WorkArtifact} from '@inneranimalmedia/agentsam-work/contracts';
import { useWorkStore } from '@/lib/work/store';
import { startArtifactCreation } from '@/lib/work/artifact-launcher';

/**
 * Widgets inside the existing New tab. The catalog and user state come from D1;
 * actual code is resolved only through the compiled Workbench BuiltinWidget.
 * Concept/catalog-only entries are discoverable but can never be installed here.
 */
export function NewTabWidgets({ onOpenGallery, arranging, onArrangingChange:setArranging, addRequest }: { onOpenGallery: () => void; arranging:boolean; onArrangingChange:(value:boolean)=>void; addRequest:number }) {
  const user = useCurrentUser();
  const widgetDataHost = useMemo<AgentSamWidgetDataHost>(() => ({
    async load(widgetId, signal) {
      const response = await fetch('/api/widgets/data?key=' + encodeURIComponent(widgetId), {
        credentials: 'same-origin', cache: 'no-store', signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'widget_data_unavailable');
      return payload.data;
    },
  }),[]);
  const [catalog, setCatalog] = useState<AccountWidget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [addOpen,setAddOpen]=useState(false);
  const [mediaKey,setMediaKey]=useState<string|null>(null);
  const hold=useRef<ReturnType<typeof setTimeout>|null>(null);
  const held=useRef(false);
  const holdOrigin=useRef({x:0,y:0});
  const clearHold=()=>{if(hold.current!==null)clearTimeout(hold.current);hold.current=null;};
  useEffect(()=>()=>{if(hold.current!==null)clearTimeout(hold.current)},[]);
  useEffect(()=>{if(addRequest>0)setAddOpen(true)},[addRequest]);
  useEffect(()=>{if(!arranging){setDetailsKey(null);setMediaKey(null);}},[arranging]);
  const [artifactState,setArtifactState] = useState<{owner:string|undefined;status:'loading'|'ready'|'unavailable';items:WorkArtifact[]}>({owner:undefined,status:'loading',items:[]});
  const [detailsKey, setDetailsKey] = useState<string | null>(null);
  const accountGeneration = useRef(0);
  const draggingRef = useRef<string | null>(null);
  const [draggingKey,setDraggingKey] = useState<string | null>(null);
  const [dropTargetKey,setDropTargetKey] = useState<string | null>(null);


  const refresh = useCallback(async () => {
    const generation = accountGeneration.current;
    const next = await loadAccountWidgets('agentsam_stage');
    if (generation === accountGeneration.current) setCatalog(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const generation = ++accountGeneration.current;
    setLoading(true);
    setCatalog([]);
    setError(null);
    loadAccountWidgets('agentsam_stage').then(next => {
      if (!cancelled && generation === accountGeneration.current) setCatalog(next);
    }).catch(() => {
      if (!cancelled && generation === accountGeneration.current) setError('Couldn’t load your widget catalog.');
    }).finally(() => {
      if (!cancelled && generation === accountGeneration.current) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    let subscribed = true;
    const handleChanged = () => {
      void refresh().catch(() => {
        if (subscribed) setError('Couldn’t refresh the widgets.');
      });
    };
    window.addEventListener('agentsam:widgets-changed', handleChanged);
    return () => { subscribed = false; window.removeEventListener('agentsam:widgets-changed', handleChanged); };
  }, [refresh]);

  const act = async (key: string, fn: () => Promise<unknown>) => {
    if (busyKey) return;
    setBusyKey(key);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message.replaceAll('_', ' ') : 'Couldn’t update the widget.');
    } finally {
      setBusyKey(null);
    }
  };
  const installed = useMemo(() => catalog.filter(widget => widget.installed && !widget.hidden)
    .sort((a,b) => Number(b.pinned) - Number(a.pinned) || a.orderIndex - b.orderIndex || a.title.localeCompare(b.title)), [catalog]);
  const ready = catalog.filter(widget => widget.available && !widget.installed);
  const hidden = catalog.filter(widget => widget.installed && widget.hidden);
  const showArtifacts = installed.some(widget=>widget.key==='artifact-preview');
  useEffect(()=>{
    if(!showArtifacts)return;
    let cancelled=false;let sequence=0;
    const refreshArtifacts=()=>{const generation=++sequence;setArtifactState({owner:user?.id,status:'loading',items:[]});
      void import('@/components/work/LocalStudioWorkPage').then(({sharedLiveWorkHost})=>sharedLiveWorkHost().snapshot({surface:'artifacts'})).then(snapshot=>{
        if(!cancelled&&generation===sequence)setArtifactState({owner:user?.id,status:'ready',items:snapshot.artifacts.filter(item=>!item.deleted).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,30)});
      }).catch(()=>{if(!cancelled&&generation===sequence)setArtifactState({owner:user?.id,status:'unavailable',items:[]});});};
    refreshArtifacts();window.addEventListener('agentsam:work-refresh',refreshArtifacts);
    return()=>{cancelled=true;window.removeEventListener('agentsam:work-refresh',refreshArtifacts);};
  },[showArtifacts,user?.id]);
  const artifactItems=artifactState.owner===user?.id?artifactState.items:[];
  const safeThumbnail=(value:unknown)=>{if(typeof value!=='string')return undefined;try{const u=new URL(value,window.location.href);return (u.protocol==='https:'||u.origin===window.location.origin&&u.protocol==='http:')&&!u.username&&!u.password?u.href:undefined;}catch{return undefined;}};
  const creativeHost:CreativeWidgetHost={artifactStatus:artifactState.owner===user?.id?artifactState.status:'loading',artifacts:artifactItems.map(a=>({id:a.id,title:a.name,kind:a.kind,thumbnail:safeThumbnail(a.preview||(a.kind==='image'?a.open:undefined))})),openEntry(key){
    const work=useWorkStore.getState();
    if(key==='artifact-preview'){const id=work.openSideTab('artifacts',{title:'Artifacts',ephemeral:false});work.setActiveSideTab(id);work.setSideOpen(true);return;}
    if(key==='design-entry'||key==='slides-entry'||key==='whiteboard-entry'){startArtifactCreation(key==='design-entry'?'design':key==='slides-entry'?'slides':'whiteboard');return;}
    if(key==='code-entry'){work.setWorkSurface('code');return;}
    if(key==='design-system-entry'||key==='brand-guidelines-entry'){const id=work.openSideTab('design',{title:key==='design-system-entry'?'Design System':'Brand Guidelines',ephemeral:false,url:key==='design-system-entry'?'/canvas?host=system':'/canvas?host=slides&template=brand-guidelines'});work.setActiveSideTab(id);work.setSideOpen(true);}
  },openArtifact(id){const a=artifactItems.find(item=>item.id===id);if(!a)return;const work=useWorkStore.getState();if(a.artifactType==='design-canvas'&&a.providerId){work.openSideTab('design',{title:a.name,ephemeral:false,url:'/canvas?canvas='+encodeURIComponent(a.providerId)});return;}if(a.source==='local'){void import('@/components/work/LocalStudioWorkPage').then(({sharedLiveWorkHost})=>sharedLiveWorkHost().openArtifact?.(a));return;}const url=safeThumbnail(a.open||a.preview);if(url)work.openSideTab('browser',{title:a.name,url,history:[url],historyIndex:0,ephemeral:false});else work.openSideTab('artifacts',{title:'Artifacts',ephemeral:false});}};
  const reorder = (sourceKey: string, targetKey: string) => {
    if(sourceKey === targetKey || busyKey) return;
    const from = installed.findIndex(item => item.key === sourceKey);
    const to = installed.findIndex(item => item.key === targetKey);
    if(from < 0 || to < 0) return;
    if(installed[from].pinned !== installed[to].pinned){
      setError("Pinned widgets remain in the first group. Unpin a widget to move it into another group.");
      return;
    }
    const next = [...installed];
    next.splice(to, 0, ...next.splice(from, 1));
    void act(sourceKey, () => reorderAccountWidgets(next.map(widget => widget.key)));
  };
  const move = (widget: AccountWidget, direction: -1 | 1) => {
    const index = installed.findIndex(item => item.key === widget.key);
    const neighbor = installed[index+direction];
    if(neighbor) reorder(widget.key,neighbor.key);
  };
  const dropWidgetAt = (x:number,y:number) => document.elementFromPoint(x,y)
    ?.closest<HTMLElement>('[data-widget-key]')?.dataset.widgetKey ?? null;
  const finishDrag = (sourceKey:string,targetKey:string|null) => {
    draggingRef.current=null;
    setDraggingKey(null);
    setDropTargetKey(null);
    if(targetKey) reorder(sourceKey,targetKey);
  };

  return (
    <section aria-label="Widgets" className="as-new-tab-widgets min-w-0">
      <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your widgets</h3>

        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant={arranging?'secondary':'ghost'} size="sm" aria-pressed={arranging} onClick={()=>{setArranging(!arranging);setDetailsKey(null);}}>{arranging?'Done':'Arrange'}</Button>
          <DropdownMenu open={addOpen} onOpenChange={setAddOpen}>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={loading || (Boolean(error) && !catalog.length)}>
                <Plus className="size-3.5" /> Add widget
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="as-workspace-glass-menu max-h-[min(28rem,70vh)] overflow-y-auto">
              <DropdownMenuLabel>Available widgets</DropdownMenuLabel>
              {ready.map(widget => (
                <DropdownMenuItem key={widget.key} disabled={Boolean(busyKey)}
                  onSelect={() => void act(widget.key, () => installAccountWidget(widget.key))}>
                  <Plus className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">{widget.title}</span>
                </DropdownMenuItem>
              ))}
              {!ready.length && !hidden.length && <div className="px-3 py-2 text-xs text-muted-foreground">All working widgets have been added.</div>}
              {hidden.length ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Hidden widgets</DropdownMenuLabel>
                  {hidden.map(widget => (
                    <DropdownMenuItem key={widget.key} disabled={Boolean(busyKey)}
                      onSelect={() => void act(widget.key, () => updateAccountWidget(widget.key, {hidden:false}))}>
                      <Plus className="size-3.5" />
                      <span className="min-w-0 flex-1 truncate">Show {widget.title}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              ) : null}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onOpenGallery}>
                <SlidersHorizontal className="size-3.5" /> Explore widget gallery
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" variant="ghost" size="sm" onClick={onOpenGallery}>
            Browse gallery
          </Button>
        </div>
      </div>
      {error && <div role="alert" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 p-3 text-xs text-destructive">
        <span>{error}</span>
        <Button size="sm" variant="outline" type="button" onClick={() => { setError(null); void refresh().catch(() => setError('Couldn’t load widgets.')); }}>Retry</Button>
      </div>}
      {loading ? <p role="status" className="py-4 text-xs text-muted-foreground">Loading widgets…</p> :
        !catalog.length && error ? (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            Widget catalog temporarily unavailable. Your existing installations are unchanged.
          </p>
        ) : !installed.length ? (
          <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {hidden.length ? "Your widgets are hidden. Use Add widget to show them again." :
              <>No widgets installed on this New tab yet. Use <strong className="font-medium text-foreground">Add widget</strong> to install Countdown, Clock, Calculator or Queue Depth.</>}
          </div>
        ) : (
          <ul className="agentsam-widget-grid" data-arranging={arranging}>
            {installed.map((widget, index) => (
              <li key={widget.installationId ?? widget.key} data-widget-key={widget.key} data-size={widget.sizeClass}
                onPointerDown={e=>{if(arranging||e.button!==0||e.pointerType==='mouse')return;clearHold();held.current=false;holdOrigin.current={x:e.clientX,y:e.clientY};hold.current=setTimeout(()=>{held.current=true;setArranging(true);if(typeof navigator.vibrate==='function')navigator.vibrate(12);},480);}}
                onPointerMove={e=>{if(Math.hypot(e.clientX-holdOrigin.current.x,e.clientY-holdOrigin.current.y)>9)clearHold();}}
                onPointerUp={clearHold} onPointerCancel={clearHold} onPointerLeave={clearHold}
                onContextMenu={e=>{e.preventDefault();clearHold();setArranging(true);}}
                onClickCapture={e=>{if(held.current){e.preventDefault();e.stopPropagation();held.current=false;}}}
                className={cn('agentsam-widget-tile min-w-0 rounded-xl transition-[outline-color,opacity]',
                  widget.sizeClass === 'large' && 'as-new-tab-widget--large',
                  draggingKey === widget.key && 'opacity-55',
                  dropTargetKey === widget.key && dropTargetKey !== draggingKey && 'outline outline-2 outline-primary')}>
                {arranging&&<button type="button" className="as-widget-remove" disabled={Boolean(busyKey)} aria-label={'Remove '+widget.title} onClick={()=>void act(widget.key,()=>uninstallAccountWidget(widget.key))}><Minus size={16}/></button>}
                <div className="as-widget-content" aria-hidden={arranging||undefined} ref={node=>{if(node)node.inert=arranging}}>
                {widget.key==='media'||creativeWidgetEntry(widget.key)&&widget.key!=='artifact-preview'||widget.key==='pull-request-summary'||widget.key==='release-readiness'?
                  <BuiltinWidget widgetId={widget.key} compact configuration={widget.configuration} creativeHost={creativeHost} dataHost={widgetDataHost}/>:
                  <WidgetFrame title={widget.key==='artifact-preview'?'':widget.title} size={widget.sizeClass as 'small' | 'medium' | 'large'}>
                    <BuiltinWidget widgetId={widget.key} compact configuration={widget.configuration} creativeHost={creativeHost} dataHost={widgetDataHost}/>
                  </WidgetFrame>}
                </div>
                {arranging?<div className="flex w-full flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1">
                      <IconAction type="button" variant="ghost" className="as-new-tab-drag-handle cursor-grab active:cursor-grabbing"
                        label={'Drag ' + widget.title + ' to arrange'}
                        hint="Drag to rearrange. On keyboards use the arrow keys while focused; pinned widgets stay together."
                        disabled={Boolean(busyKey)}
                        onPointerDown={event=>{
                          if(event.pointerType==='mouse' && event.button!==0)return;
                          draggingRef.current=widget.key; setDraggingKey(widget.key);
                          event.currentTarget.setPointerCapture(event.pointerId);
                        }}
                        onPointerMove={event=>{
                          if(draggingRef.current===widget.key)
                            setDropTargetKey(dropWidgetAt(event.clientX,event.clientY));
                        }}
                        onPointerUp={event=>{
                          if(draggingRef.current!==widget.key)return;
                          const target=dropWidgetAt(event.clientX,event.clientY);
                          if(event.currentTarget.hasPointerCapture(event.pointerId))
                            event.currentTarget.releasePointerCapture(event.pointerId);
                          finishDrag(widget.key,target);
                        }}
                        onPointerCancel={()=>finishDrag(widget.key,null)}
                        onKeyDown={event=>{
                          if(event.key==='ArrowUp'||event.key==='ArrowLeft'){event.preventDefault();move(widget,-1);}
                          if(event.key==='ArrowDown'||event.key==='ArrowRight'){event.preventDefault();move(widget,1);}
                        }}>
                        <GripVertical className="size-4" />
                      </IconAction>
                      <IconAction type="button" variant="ghost" label={widget.pinned ? 'Unpin widget' : 'Pin widget'}
                        disabled={Boolean(busyKey)}
                        onClick={() => void act(widget.key, () => updateAccountWidget(widget.key, {pinned: !widget.pinned}))}>
                        {widget.pinned ? <PinOff className="size-4"/> : <Pin className="size-4"/>}
                      </IconAction>
                      <IconAction type="button" variant="ghost" label={'Move ' + widget.title + ' up'}
                        disabled={Boolean(busyKey) || index === 0 || installed[index-1]?.pinned !== widget.pinned} onClick={() => move(widget,-1)}>
                        <ArrowUp className="size-4"/>
                      </IconAction>
                      <IconAction type="button" variant="ghost" label={'Move ' + widget.title + ' down'}
                        disabled={Boolean(busyKey) || index === installed.length-1 || installed[index+1]?.pinned !== widget.pinned} onClick={() => move(widget,1)}>
                        <ArrowDown className="size-4"/>
                      </IconAction>
                    </div>
                    <div className="flex items-center gap-1">
                      <IconAction type="button" variant="ghost" label={'Configure ' + widget.title}
                        disabled={Boolean(busyKey)}
                        onClick={() => setDetailsKey(detailsKey === widget.key ? null : widget.key)}>
                        <SlidersHorizontal className="size-4"/>
                      </IconAction>

                    </div>
                  </div>:null}
                  {arranging && detailsKey === widget.key ? (
                    <div className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                      <label className="flex items-center justify-between gap-3">
                        <span>Size</span>
                        <select className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                          aria-label={'Size for ' + widget.title} disabled={Boolean(busyKey)}
                          value={widget.sizeClass}
                          onChange={event => void act(widget.key, () => updateAccountWidget(widget.key, {sizeClass: event.target.value}))}>
                          {widget.sizes.map(size => <option key={size} value={size}>{size}</option>)}
                        </select>
                      </label>
                      {widget.key === 'media' && <Button type="button" size="sm" onClick={()=>setMediaKey(widget.key)}>Choose media</Button>}
                      {widget.key === 'artifact-preview' && <label className="flex items-center justify-between gap-3"><span>Preview</span><select aria-label="Artifact preview mode" value={String(widget.configuration.previewMode??'preview')} onChange={event=>void act(widget.key,()=>updateAccountWidget(widget.key,{configuration:{previewMode:event.target.value}}))}><option value="preview">Preview</option><option value="list">List</option><option value="cover">Cover only</option></select></label>}
                      {widget.key === 'countdown' && <label className="flex items-center justify-between gap-3">
                        <span>Duration</span>
                        <select className="min-w-0 rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                          aria-label="Countdown duration" disabled={Boolean(busyKey)}
                          value={Number(widget.configuration.durationMs ?? 300000)}
                          onChange={event => void act(widget.key, () => updateAccountWidget(widget.key, {configuration: {durationMs: Number(event.target.value)}}))}>
                          {[5,15,25,45,60].map(min => <option key={min} value={min*60000}>{min} minutes</option>)}
                        </select>
                      </label>}
                      {widget.key === 'clock' && <label className="flex items-center justify-between gap-3">
                        <span>Time zone</span>
                        <select className="min-w-0 max-w-[65%] rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                          aria-label="Clock time zone" disabled={Boolean(busyKey)}
                          value={String(widget.configuration.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC')}
                          onChange={event => void act(widget.key, () => updateAccountWidget(widget.key, {configuration: {timeZone:event.target.value}}))}>
                          {[...new Set([String(widget.configuration.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'), 'UTC','America/Chicago','America/New_York','America/Los_Angeles','Europe/London','Asia/Tokyo'])].map(zone => <option value={zone} key={zone}>{zone}</option>)}
                        </select>
                      </label>}
                      {widget.key === 'pull-request-summary' && <>
                        <label className="flex items-center justify-between gap-3">
                          <span>Repository</span>
                          <input className="min-w-0 max-w-[65%] rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                            aria-label="Pull request repository" placeholder="owner/repository" disabled={Boolean(busyKey)}
                            defaultValue={String(widget.configuration.repository ?? '')}
                            onBlur={event => void act(widget.key, () => updateAccountWidget(widget.key, {configuration:{repository:event.currentTarget.value.trim()}}))}/>
                        </label>
                        <label className="flex items-center justify-between gap-3">
                          <span>Pull request #</span>
                          <input type="number" min={1} className="w-24 rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                            aria-label="Pull request number" placeholder="844" disabled={Boolean(busyKey)}
                            defaultValue={String(widget.configuration.pullNumber ?? '')}
                            onBlur={event => {const raw=event.currentTarget.value.trim();void act(widget.key, () => updateAccountWidget(widget.key, {configuration:{pullNumber:raw?Number(raw):null}}));}}/>
                        </label>
                        <p className="text-[11px] text-muted-foreground">Live data uses your connected GitHub account.</p>
                      </>}
                      {widget.key === 'release-readiness' && <>
                        <label className="flex items-center justify-between gap-3">
                          <span>Repository</span>
                          <input className="min-w-0 max-w-[65%] rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                            aria-label="Release repository" placeholder="owner/repository" disabled={Boolean(busyKey)}
                            defaultValue={String(widget.configuration.repository ?? '')}
                            onBlur={event => void act(widget.key, () => updateAccountWidget(widget.key, {configuration:{repository:event.currentTarget.value.trim()}}))}/>
                        </label>
                        <label className="flex items-center justify-between gap-3">
                          <span>Branch / commit</span>
                          <input className="min-w-0 max-w-[65%] rounded-md border border-border bg-background px-2 py-1.5 text-foreground"
                            aria-label="Release branch or commit" placeholder="main" disabled={Boolean(busyKey)}
                            defaultValue={String(widget.configuration.ref ?? 'main')}
                            onBlur={event => void act(widget.key, () => updateAccountWidget(widget.key, {configuration:{ref:event.currentTarget.value.trim()}}))}/>
                        </label>
                        <p className="text-[11px] text-muted-foreground">Only checks and SDK receipts tied to this exact commit are included.</p>
                      </>}
                    </div>
                  ) : null}
              </li>
            ))}
          </ul>
        )}
      {mediaKey&&<WorkspaceMediaPicker onClose={()=>setMediaKey(null)} onChoose={async choice=>{await updateAccountWidget(mediaKey,{configuration:choice});await refresh();setMediaKey(null)}}/>}
      {!loading && (!error || catalog.length > 0) && <p className="mt-2 text-[11px] text-muted-foreground">
        {arranging ? 'Drag to arrange. Changes are saved to your account.' : null}
      </p>}
    </section>
  );
}
