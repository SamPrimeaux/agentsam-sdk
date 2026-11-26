import type { AgentSamWidgetProviderData } from '@inneranimalmedia/agentsam-contracts/widgets';

type Props = { data?: AgentSamWidgetProviderData; compact?: boolean };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
function dateLabel(value: unknown) { const raw = String(value || ''); const date = new Date(raw); return raw && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Date unavailable'; }
function safeDriveUrl(value: unknown) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && ['drive.google.com', 'docs.google.com'].includes(url.hostname) ? url.href : null; } catch { return null; } }

export function GoogleDriveRecentWidget({ data, compact = false }: Props) {
  if (!data || data.status === 'loading') return <p className="text-xs text-muted-foreground">Checking your Google Drive…</p>;
  if (data.status !== 'ready') return <div className="space-y-1 text-xs"><p className="font-medium text-foreground">{data.status === 'not_connected' ? 'Google Drive is not connected' : data.status === 'unsupported' ? 'Drive data is unavailable in this host' : 'Google Drive files could not be loaded'}</p><p className="text-muted-foreground">{data.message || 'Connect or verify Google Drive in Settings → Storage.'}</p></div>;
  const files = list(record(data.data).files).slice(0, compact ? 3 : 6);
  return <div className="space-y-1.5 text-xs">
    {files.length ? files.map((file, index) => <div key={String(file.id || index)} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/15 px-3 py-2"><div className="min-w-0"><p className="truncate font-medium text-foreground">{safeDriveUrl(file.webViewUrl) ? <a className="underline-offset-2 hover:underline" href={safeDriveUrl(file.webViewUrl)!} target="_blank" rel="noopener noreferrer">{String(file.name || 'Untitled file')}</a> : String(file.name || 'Untitled file')}</p><p className="mt-0.5 truncate text-[10px] text-muted-foreground">{String(file.mimeType || 'Drive file')}</p></div><span className="shrink-0 text-[10px] text-muted-foreground">{dateLabel(file.updatedAt)}</span></div>) : <p className="text-muted-foreground">No recent Drive files were returned.</p>}
    <div className="flex items-center justify-between text-[9px] text-muted-foreground"><span>{data.accountLabel || 'Google Drive'} · read-only · {files.length} shown</span>{data.source === 'fixture' ? <span className="uppercase tracking-wide">Sample data</span> : <span>Modified recently</span>}</div>
  </div>;
}
