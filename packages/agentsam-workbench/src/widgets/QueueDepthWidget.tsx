import { useEffect, useState } from 'react';

type Queue = {
  queue_id: string;
  queue_name: string;
  environment: string | null;
  owner_app: string | null;
  delivery_status: string;
  producers_total_count: number;
  consumers_total_count: number;
  metrics: {
    state: string;
    backlog_count: number | null;
    backlog_bytes: number | null;
    oldest_message_timestamp_ms: number | null;
  };
};
type HistoryPoint = { at: string | null; backlog_count: number | null };
type Snapshot = {
  ok: boolean; collected_at: string; queues: Queue[];
  history?: { state: string; points: HistoryPoint[] };
};

function ageOf(timestamp: number | null | undefined) {
  if (!timestamp || timestamp < 0) return 'Unknown';
  const age = Math.max(0, Date.now() - timestamp);
  return age < 60_000 ? '<1m' : age < 3_600_000
    ? `${Math.floor(age / 60_000)}m` : `${Math.floor(age / 3_600_000)}h`;
}

export function QueueDepthWidget({ compact = false }: { compact?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<Snapshot['history']>(undefined);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/queues/observability', {
          credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok) throw new Error('inventory_unavailable');
        const next: Snapshot = await response.json();
        if (!next.ok || !Array.isArray(next.queues)) throw new Error('invalid_inventory');
        setSnapshot(next);
        setSelectedId(previous => next.queues.some(queue => queue.queue_id === previous)
          ? previous : next.queues[0]?.queue_id || '');
        setState('ready');
      } catch {
        if (!controller.signal.aborted) setState('unavailable');
      }
    };
    void load();
    const polling = setInterval(() => void load(), 30_000);
    return () => { controller.abort(); clearInterval(polling); };
  }, []);

  useEffect(() => {
    if (!showHistory || !selectedId) { setHistory(undefined); return; }
    const controller = new AbortController();
    setHistory(undefined);
    void (async () => {
      try {
        const response = await fetch(
          `/api/queues/observability?history=24h&queue_id=${encodeURIComponent(selectedId)}`,
          { credentials: 'same-origin', cache: 'no-store', signal: controller.signal },
        );
        if (!response.ok) throw new Error('history_unavailable');
        const next: Snapshot = await response.json();
        if (!controller.signal.aborted) setHistory(next.history || { state: 'unavailable', points: [] });
      } catch {
        if (!controller.signal.aborted) setHistory({ state: 'unavailable', points: [] });
      }
    })();
    return () => controller.abort();
  }, [showHistory, selectedId]);

  if (state === 'loading') return <p role="status" className="text-xs text-muted-foreground">Loading Cloudflare Queues…</p>;
  if (state === 'unavailable' || !snapshot)
    return <p role="status" className="text-xs text-muted-foreground">Queue metrics unavailable. Operator access or Cloudflare credentials may not be configured.</p>;
  if (snapshot.queues.length === 0)
    return <p role="status" className="text-xs text-muted-foreground">No queues found for this Cloudflare account.</p>;

  const selected = snapshot.queues.find(queue => queue.queue_id === selectedId) || snapshot.queues[0];
  const metrics = selected.metrics;
  const count = metrics.state === 'ready' ? metrics.backlog_count : null;
  const points = history?.points || [];
  const max = Math.max(1, ...points.map(p => p.backlog_count ?? 0));
  return <section className="flex min-w-0 flex-col gap-3 text-foreground" aria-label="Cloudflare queue depth">
    <div className="flex items-center justify-between gap-2">
      <select aria-label="Physical queue" className="min-w-0 max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
        value={selected.queue_id} onChange={event => { setSelectedId(event.target.value); setShowHistory(false); }}>
        {snapshot.queues.map(queue => <option key={queue.queue_id} value={queue.queue_id}>{queue.queue_name}</option>)}
      </select>
      <span className="shrink-0 text-[10px] text-muted-foreground">Cloudflare · live</span>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div><div className="font-mono text-xl font-semibold">{count ?? '—'}</div><div className="text-[10px] text-muted-foreground">Backlog</div></div>
      <div><div className="font-mono text-xl font-semibold">{metrics.state === 'ready' ? ageOf(metrics.oldest_message_timestamp_ms) : '—'}</div><div className="text-[10px] text-muted-foreground">Oldest age</div></div>
      <div><div className="font-mono text-xl font-semibold">{metrics.state === 'ready' && metrics.backlog_bytes != null ? metrics.backlog_bytes.toLocaleString() : '—'}</div><div className="text-[10px] text-muted-foreground">Bytes</div></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
      <span>{selected.delivery_status} · {selected.producers_total_count} producers · {selected.consumers_total_count} consumers</span>
      <button type="button" className="rounded border border-border px-2 py-1 text-foreground" onClick={() => setShowHistory(previous => !previous)}
        aria-expanded={showHistory}>{showHistory ? 'Hide history' : '24h history'}</button>
    </div>
    {showHistory && <div className="space-y-1" aria-label="Backlog over the last 24 hours">
      {history?.state === 'unavailable' ? <p className="text-xs text-muted-foreground">Historical analytics unavailable.</p>
        : history?.state === 'ready' ? points.length ? <div className="flex h-12 items-end gap-px" role="img" aria-label="Hourly average backlog">
          {points.map((point, index) => <div key={point.at || index} className="min-w-0 flex-1 rounded-t-sm bg-violet-400/75"
            title={`${point.at || 'Unknown'}: ${point.backlog_count ?? 'unavailable'} messages`}
            style={{ height: `${Math.max(2, ((point.backlog_count ?? 0) / max) * 100)}%` }}/>)}
        </div> : <p className="text-xs text-muted-foreground">No historical samples for this period.</p>
        : <p className="text-xs text-muted-foreground">Loading history…</p>}
    </div>}
    {!compact && <p className="text-[10px] text-muted-foreground">Last checked {new Date(snapshot.collected_at).toLocaleTimeString()}. Cloudflare backlog is not AgentSam job status.</p>}
    {metrics.state !== 'ready' && <p className="text-xs text-amber-400">Current backlog metrics unavailable.</p>}
  </section>;
}
