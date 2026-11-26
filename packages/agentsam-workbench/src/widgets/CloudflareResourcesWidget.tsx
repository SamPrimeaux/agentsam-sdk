import type { AgentSamWidgetProviderData } from '@inneranimalmedia/agentsam-contracts/widgets';

type Props = { data?: AgentSamWidgetProviderData; compact?: boolean };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
const count = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

export function CloudflareResourcesWidget({ data, compact = false }: Props) {
  if (!data || data.status === 'loading') return <p className="text-xs text-muted-foreground">Checking your Cloudflare account…</p>;
  if (data.status !== 'ready') return <div className="space-y-1 text-xs"><p className="font-medium text-foreground">{data.status === 'not_connected' ? 'Cloudflare is not connected' : data.status === 'unsupported' ? 'Cloudflare data is unavailable in this host' : 'Cloudflare resources could not be loaded'}</p><p className="text-muted-foreground">{data.message || 'Connect or verify your Cloudflare account in Settings → Storage.'}</p></div>;
  const payload = record(data.data);
  const r2 = record(payload.r2);
  const images = record(payload.images);
  const stream = record(payload.stream);
  const buckets = list(r2.buckets);
  const bucketCount = count(r2.count, buckets.length);
  const shown = buckets.slice(0, compact ? 2 : 5);
  return <div className="space-y-3 text-xs">
    <div className="grid grid-cols-3 gap-2">
      {[['R2 buckets', bucketCount], ['Images', count(images.count)], ['Stream', count(stream.count)]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p></div>)}
    </div>
    {shown.length ? <ul className="space-y-1.5">{shown.map((bucket, index) => <li key={String(bucket.name || index)} className="flex items-center justify-between gap-3 rounded-md bg-muted/20 px-2.5 py-2"><span className="min-w-0 truncate font-medium text-foreground">{String(bucket.name || 'Unnamed bucket')}</span><span className="shrink-0 text-[10px] text-muted-foreground">{String(bucket.location || bucket.jurisdiction || 'R2')}</span></li>)}</ul> : <p className="text-muted-foreground">No R2 buckets were returned for this account.</p>}
    {data.message ? <p className="text-[10px] text-amber-300">{data.message}</p> : null}
    <div className="flex items-center justify-between text-[9px] text-muted-foreground"><span>{data.accountLabel || 'Cloudflare account'}</span>{data.source === 'fixture' ? <span className="uppercase tracking-wide">Sample data</span> : <span>Live inventory</span>}</div>
  </div>;
}
