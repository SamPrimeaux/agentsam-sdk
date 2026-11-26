import { useEffect, useState, type CSSProperties } from 'react';
import type { AgentSamWidgetProviderData } from '@inneranimalmedia/agentsam-contracts/widgets';

type Queue = {
  queue_id: string;
  queue_name: string;
  environment: string | null;
  owner_app: string | null;
  delivery_status: string;
  producers_total_count: number | null;
  consumers_total_count: number | null;
  metrics: {
    state: string;
    backlog_count: number | null;
    backlog_bytes: number | null;
    oldest_message_timestamp_ms: number | null;
  };
};
type HistoryPoint = { at: string | null; backlog_count: number | null };
type QueueHistory = { state: string; points: HistoryPoint[] };
type QueuePayload = { collected_at?: string; queues?: Queue[]; history?: QueueHistory };
type HistoryReader = (queueId: string) => Promise<AgentSamWidgetProviderData>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function ageOf(timestamp: number | null | undefined) {
  if (!timestamp || timestamp < 0) return 'Unknown';
  const age = Math.max(0, Date.now() - timestamp);
  return age < 60_000 ? '<1m' : age < 3_600_000
    ? `${Math.floor(age / 60_000)}m` : `${Math.floor(age / 3_600_000)}h`;
}

/**
 * Presentational queue inventory. The host supplies account-scoped data and
 * history through its readWidgetData adapter; this component never fetches a
 * Local Studio route or handles Cloudflare credentials itself.
 */
export function QueueDepthWidget({
  compact = false,
  interactive = true,
  data,
  onLoadHistory,
}: {
  compact?: boolean;
  interactive?: boolean;
  data?: AgentSamWidgetProviderData;
  onLoadHistory?: HistoryReader;
}) {
  const payload = record(data?.data) as QueuePayload;
  const queues = Array.isArray(payload.queues) ? payload.queues : [];
  const [selectedId, setSelectedId] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<QueueHistory | undefined>();
  const [historyState, setHistoryState] = useState<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  const selected = queues.find(queue => queue.queue_id === selectedId) || queues[0];

  useEffect(() => {
    if (!queues.some(queue => queue.queue_id === selectedId)) setSelectedId(queues[0]?.queue_id || '');
  }, [queues, selectedId]);

  const loadHistory = async () => {
    if (!selected || !onLoadHistory) {
      setHistoryState('unavailable');
      return;
    }
    setHistoryState('loading');
    try {
      const result = await onLoadHistory(selected.queue_id);
      const next = record(record(result.data).history) as unknown as QueueHistory;
      if (result.status === 'ready' && next.state === 'ready' && Array.isArray(next.points)) {
        setHistory(next);
        setHistoryState('ready');
      } else {
        setHistory(next);
        setHistoryState('unavailable');
      }
    } catch {
      setHistory(undefined);
      setHistoryState('unavailable');
    }
  };

  const toggleHistory = () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setShowHistory(true);
    void loadHistory();
  };

  if (data?.status === 'loading' || !data) {
    return <p role="status" className="text-xs text-muted-foreground">Loading Cloudflare Queues…</p>;
  }
  if (data.status !== 'ready') {
    return <p role="status" className="text-xs text-muted-foreground">{data.message || 'Queue metrics unavailable. Connect Cloudflare or grant queue observability access in the host.'}</p>;
  }
  if (queues.length === 0) {
    return <p role="status" className="text-xs text-muted-foreground">No queues found for this Cloudflare account.</p>;
  }
  if (!selected) return null;

  const metrics = selected.metrics || { state: 'unavailable', backlog_count: null, backlog_bytes: null, oldest_message_timestamp_ms: null };
  const count = metrics.state === 'ready' ? metrics.backlog_count : null;
  const points = history?.points || [];
  const max = Math.max(1, ...points.map(point => point.backlog_count ?? 0));
  const collectedAt = payload.collected_at || data.updatedAt;
  const sourceLabel = data.source === 'fixture' ? 'Cloudflare · sample data' : 'Cloudflare · live';

  return <section className="flex min-w-0 flex-col gap-3 text-foreground" aria-label="Cloudflare queue depth">
    <div className="flex items-center justify-between gap-2">
      {interactive ? <select aria-label="Physical queue" className="min-w-0 max-w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
        value={selected.queue_id} onChange={event => { setSelectedId(event.target.value); setShowHistory(false); setHistory(undefined); setHistoryState('idle'); }}>
        {queues.map(queue => <option key={queue.queue_id} value={queue.queue_id}>{queue.queue_name}</option>)}
      </select> : <span className="min-w-0 truncate text-xs font-medium">{selected.queue_name}</span>}
      <span className="shrink-0 text-[10px] text-muted-foreground">{sourceLabel}</span>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div><div className="font-mono text-xl font-semibold">{count ?? '—'}</div><div className="text-[10px] text-muted-foreground">Backlog</div></div>
      <div><div className="font-mono text-xl font-semibold">{metrics.state === 'ready' ? ageOf(metrics.oldest_message_timestamp_ms) : '—'}</div><div className="text-[10px] text-muted-foreground">Oldest age</div></div>
      <div><div className="font-mono text-xl font-semibold">{metrics.state === 'ready' && metrics.backlog_bytes != null ? metrics.backlog_bytes.toLocaleString() : '—'}</div><div className="text-[10px] text-muted-foreground">Bytes</div></div>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground">
      <span>{selected.delivery_status} · {selected.producers_total_count ?? '—'} producers · {selected.consumers_total_count ?? '—'} consumers</span>
      {interactive && <button type="button" className="rounded border border-border px-2 py-1 text-foreground disabled:cursor-not-allowed disabled:opacity-45" onClick={toggleHistory}
        disabled={!onLoadHistory} aria-expanded={showHistory}>{showHistory ? 'Hide history' : '24h history'}</button>}
    </div>
    {showHistory && <div className="space-y-1" aria-label="Backlog over the last 24 hours">
      {historyState === 'unavailable' || history?.state === 'unavailable' ? <p className="text-xs text-muted-foreground">Historical analytics unavailable.</p>
        : historyState === 'ready' && points.length ? <div className="flex h-12 items-end gap-px" role="img" aria-label="Hourly average backlog">
          {points.map((point, index) => <div key={point.at || index} className="min-w-0 flex-1 rounded-t-sm bg-violet-400/75 h-[var(--queue-height)]"
            title={`${point.at || 'Unknown'}: ${point.backlog_count ?? 'unavailable'} messages`}
            style={{ '--queue-height': `${Math.max(2, ((point.backlog_count ?? 0) / max) * 100)}%` } as CSSProperties}/>)}
        </div> : historyState === 'loading' ? <p className="text-xs text-muted-foreground">Loading history…</p>
          : <p className="text-xs text-muted-foreground">No historical samples for this period.</p>}
    </div>}
    {!compact && <p className="text-[10px] text-muted-foreground">Last checked {collectedAt ? new Date(collectedAt).toLocaleTimeString() : 'time unavailable'}. Cloudflare backlog is not AgentSam job status.</p>}
    {metrics.state !== 'ready' && <p className="text-xs text-amber-400">Current backlog metrics unavailable.</p>}
  </section>;
}
