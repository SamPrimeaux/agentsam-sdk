import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BuiltinWidget, WidgetFrame } from '@inneranimalmedia/agentsam-workbench/widgets';
import '@inneranimalmedia/agentsam-workbench/widgets/widgets.css';
import { ArrowDown, ArrowUp, GripVertical, LayoutGrid, Pin, PinOff, Plus, SlidersHorizontal, Trash2 } from 'lucide-react';
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
import { loadProviderWidgetData } from '@/lib/widgets/provider-widget-data';
import type { AgentSamWidgetProviderData } from '@inneranimalmedia/agentsam-contracts/widgets';
import './new-tab-widgets.css';

/**
 * Widgets inside the existing New tab. The catalog and user state come from D1;
 * actual code is resolved only through the compiled Workbench BuiltinWidget.
 * Concept/catalog-only entries are discoverable but can never be installed here.
 */
export function NewTabWidgets({ onOpenGallery }: { onOpenGallery: () => void }) {
  const user = useCurrentUser();
  const [catalog, setCatalog] = useState<AccountWidget[]>([]);
  const [providerData, setProviderData] = useState<Record<string, AgentSamWidgetProviderData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
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
  useEffect(() => {
    let cancelled = false;
    const targets = installed.filter(widget => Boolean(widget.requiredProvider));
    const initial = Object.fromEntries(targets.map(widget => [widget.key, {
      provider: widget.requiredProvider!, status: 'loading' as const,
    }]));
    setProviderData(initial);
    if (!targets.length) return () => { cancelled = true; };
    const loadOne = async (widget: AccountWidget) => {
      const result = await loadProviderWidgetData(widget.key, widget.configuration);
      if (!cancelled) setProviderData(current => ({ ...current, [widget.key]: result }));
    };
    targets.forEach(widget => { void loadOne(widget); });
    const refreshers = targets.map(widget => window.setInterval(
      () => { void loadOne(widget); },
      widget.key === 'queues' ? 30_000 : 5 * 60_000,
    ));
    return () => { cancelled = true; refreshers.forEach(window.clearInterval); };
  }, [installed, user?.id]);

  const ready = catalog.filter(widget => widget.available && !widget.installed);
  const hidden = catalog.filter(widget => widget.installed && widget.hidden);
  const concepts = catalog.filter(widget => !widget.available);
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
          <p className="mt-1 text-xs text-muted-foreground">Add, pin and arrange real widgets on this New tab.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" disabled={loading || (Boolean(error) && !catalog.length)}>
                <Plus className="size-3.5" /> Add widget
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-[min(28rem,70vh)] w-[min(22rem,90vw)] overflow-y-auto">
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
              <DropdownMenuLabel>Concepts · previews only</DropdownMenuLabel>
              {concepts.map(widget => (
                <DropdownMenuItem key={widget.key} disabled>
                  <LayoutGrid className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">{widget.title}</span>
                  <span className="text-[10px] text-muted-foreground">Concept</span>
                </DropdownMenuItem>
              ))}
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
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-3">
            {installed.map((widget, index) => (
              <li key={widget.installationId ?? widget.key} data-widget-key={widget.key}
                className={cn('min-w-0 rounded-xl transition-[outline-color,opacity]',
                  widget.sizeClass === 'large' && 'as-new-tab-widget--large',
                  draggingKey === widget.key && 'opacity-55',
                  dropTargetKey === widget.key && dropTargetKey !== draggingKey && 'outline outline-2 outline-primary')}>
                <WidgetFrame title={widget.title} size={widget.sizeClass as 'small' | 'medium' | 'large'}
                  actions={<div className="flex w-full flex-wrap items-center justify-between gap-2">
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
                      <IconAction type="button" variant="ghost" label={'Remove ' + widget.title}
                        disabled={Boolean(busyKey)}
                        onClick={() => void act(widget.key, () => uninstallAccountWidget(widget.key))}>
                        <Trash2 className="size-4"/>
                      </IconAction>
                    </div>
                  </div>}>
                  <BuiltinWidget widgetId={widget.key} compact configuration={widget.configuration} data={widget.requiredProvider ? providerData[widget.key] : undefined} onLoadHistory={widget.key === "queues" ? (queueId) => loadProviderWidgetData("queues", { history: "24h", queueId }) : undefined} />
                  {detailsKey === widget.key ? (
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
                    </div>
                  ) : null}
                </WidgetFrame>
              </li>
            ))}
          </ul>
        )}
      {!loading && (!error || catalog.length > 0) && <p className="mt-2 text-[11px] text-muted-foreground">
        {installed.length} visible · {hidden.length} hidden · {ready.length} available · {concepts.length} concepts. Widget placement and settings are saved to your account.
      </p>}
    </section>
  );
}
