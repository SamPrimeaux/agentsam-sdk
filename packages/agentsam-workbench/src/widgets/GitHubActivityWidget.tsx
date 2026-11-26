import type { AgentSamWidgetProviderData } from '@inneranimalmedia/agentsam-contracts/widgets';

type Props = { data?: AgentSamWidgetProviderData; compact?: boolean };
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const list = (value: unknown): Array<Record<string, unknown>> => Array.isArray(value) ? value.filter(item => item && typeof item === 'object') as Array<Record<string, unknown>> : [];
function dateLabel(value: unknown) { const raw = String(value || ''); const date = new Date(raw); return raw && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Date unavailable'; }
function safeGitHubUrl(value: unknown) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' && url.hostname === 'github.com' ? url.href : null; } catch { return null; } }

export function GitHubActivityWidget({ data, compact = false }: Props) {
  if (!data || data.status === 'loading') return <p className="text-xs text-muted-foreground">Checking your GitHub repositories…</p>;
  if (data.status !== 'ready') return <div className="space-y-1 text-xs"><p className="font-medium text-foreground">{data.status === 'not_connected' ? 'GitHub is not connected' : data.status === 'unsupported' ? 'GitHub data is unavailable in this host' : 'GitHub repositories could not be loaded'}</p><p className="text-muted-foreground">{data.message || 'Connect or verify GitHub in Settings → Git & PRs.'}</p></div>;
  const payload = record(data.data);
  const repositories = list(payload.repositories).slice(0, compact ? 3 : 6);
  return <div className="space-y-2 text-xs">
    {repositories.length ? repositories.map((repo, index) => <div key={String(repo.id || repo.fullName || index)} className="rounded-lg border border-border/70 bg-muted/15 px-3 py-2"><div className="flex min-w-0 items-center justify-between gap-2">{safeGitHubUrl(repo.htmlUrl) ? <a className="min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline" href={safeGitHubUrl(repo.htmlUrl)!} target="_blank" rel="noopener noreferrer">{String(repo.fullName || 'Repository')}</a> : <span className="min-w-0 truncate font-medium text-foreground">{String(repo.fullName || 'Repository')}</span>}<span className="shrink-0 text-[9px] text-muted-foreground">{repo.private === true ? 'Private' : 'Public'}</span></div><div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground"><span className="truncate">{String(repo.defaultBranch || 'No default branch')}</span><span className="shrink-0">{dateLabel(repo.updatedAt)}</span></div></div>) : <p className="text-muted-foreground">No repositories were returned for this GitHub connection.</p>}
    <div className="flex items-center justify-between text-[9px] text-muted-foreground"><span>{data.accountLabel || 'GitHub account'} · {Number(payload.totalCount ?? repositories.length)} repositories</span>{data.source === 'fixture' ? <span className="uppercase tracking-wide">Sample data</span> : <span>Sorted by recent update</span>}</div>
  </div>;
}
