import { useEffect, useState } from 'react';
import type { AgentSamWidgetDataHost } from '@inneranimalmedia/agentsam-contracts/widgets';
import { WidgetFrame } from './WidgetFrame';
import { CheckCircle2, Circle, Clock, GitPullRequest, XCircle } from 'lucide-react';

type Props = {dataHost?: AgentSamWidgetDataHost};
type LivePullRequest = {
  repository: string; number: number; title: string; url: string;
  state: 'open' | 'closed' | 'merged'; draft: boolean;
  mergeable: boolean | null; mergeableState: string | null;
  baseBranch: string | null; headBranch: string | null; commit: string | null;
  files: number | null; commits: number | null; additions: number | null; deletions: number | null;
  updatedAt: string | null; mergedAt: string | null; fetchedAt: string;
};
type LiveCheck = {name: string; status: 'passed' | 'failed' | 'pending' | 'unknown'; source: string; url?: string | null};
type LiveReadiness = {
  repository: string; ref: string; commit: string;
  state: 'clear' | 'blocked' | 'running' | 'partial' | 'no_evidence';
  counts: {passed: number; failed: number; pending: number; unknown: number; total: number};
  checks: LiveCheck[]; blockers: string[]; fetchedAt: string;
};

function useLiveData<T>(widgetId: string, dataHost?: AgentSamWidgetDataHost) {
  const [data,setData] = useState<T | null>(null);
  const [status,setStatus] = useState<'loading'|'ready'|'stale'|'error'>('loading');
  const [error,setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    const load = async () => {
      controller?.abort();
      const current = new AbortController();
      controller = current;
      try {
        if (!dataHost) throw new Error('widget_data_host_unavailable');
        const next = await dataHost.load(widgetId,current.signal);
        if (!active) return;
        setData(next as T);
        setStatus('ready');
        setError(null);
      } catch (cause) {
        if (!active || current.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'widget_data_unavailable');
        setStatus(previous => previous === 'ready' || previous === 'stale' ? 'stale' : 'error');
      }
    };
    void load();
    const polling = setInterval(() => void load(),60_000);
    return () => { active = false; controller?.abort(); clearInterval(polling); };
  },[widgetId,dataHost]);
  return {data,status,error};
}
function friendlyError(code: string | null) {
  switch (code) {
    case 'widget_configuration_required': return 'Configure a repository and pull request or branch in Edit widget.';
    case 'github_oauth_required': return 'Connect GitHub in Settings → Integrations to load live data.';
    case 'github_account_selection_required': return 'Choose a GitHub account in Settings → Integrations.';
    case 'github_account_not_connected': return 'The selected GitHub account is no longer connected.';
    case 'github_permission_denied': return 'This GitHub connection cannot read the selected repository.';
    case 'github_resource_not_found': return 'The repository, pull request or commit was not found or is not accessible.';
    case 'github_oauth_reconnect_required': return 'Reconnect GitHub in Settings → Integrations.';
    default: return 'Live GitHub data is temporarily unavailable.';
  }
}
const fmt = (value: number | null) => value == null ? '—' : value.toLocaleString('en-US');
const dateLabel = (value: string | null | undefined) => {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unknown';
  return new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
};
function LiveError({status,error,data}: {status: string; error: string | null; data: unknown}) {
  if (data) return null;
  return <p role="status" className="text-xs text-muted-foreground">
    {status === 'loading' ? 'Loading live GitHub data…' : friendlyError(error)}
  </p>;
}
export function PullRequestSummaryWidget({dataHost}: Props) {
  const live = useLiveData<LivePullRequest>('pull-request-summary',dataHost);
  const s = live.data;
  if (!s) return <WidgetFrame title="Pull Request Summary" size="medium" state={{status:live.status === 'loading' ? 'empty' : 'error', ...(live.status === 'loading' ? {} : {error:{code:live.error || 'widget_data_unavailable',message:friendlyError(live.error)}})}}>
    <LiveError status={live.status} error={live.error} data={s}/>
  </WidgetFrame>;
  const stateLabel = s.state === 'merged' ? 'Merged' : s.state === 'closed' ? 'Closed' : s.draft ? 'Draft · Open' : 'Open';
  const metrics = [
    {label:'Files changed',value:fmt(s.files),tone:''},
    {label:'Commits',value:fmt(s.commits),tone:''},
    {label:'Lines added',value:s.additions == null ? '—' : '+'+fmt(s.additions),tone:'positive'},
    {label:'Lines removed',value:s.deletions == null ? '—' : '−'+fmt(s.deletions),tone:'negative'},
  ];
  return <WidgetFrame title={<span className="agentsam-release-title"><GitPullRequest size={19}/> Pull request #{s.number}</span>}
    size="medium" description={stateLabel+' · '+s.repository} className="agentsam-release-widget">
    <a className="agentsam-release-link" href={s.url} target="_blank" rel="noopener noreferrer">Review the pull request on GitHub ↗</a>
    <h3>{s.title}</h3>
    <div className="agentsam-release-metrics">{metrics.map(m=><div key={m.label}><strong data-tone={m.tone}>{m.value}</strong><span>{m.label}</span></div>)}</div>
    <dl className="agentsam-release-meta">
      <dt>Head branch</dt><dd><code>{s.headBranch || '—'}</code></dd>
      <dt>Base branch</dt><dd><code>{s.baseBranch || '—'}</code></dd>
      <dt>Head commit</dt><dd><code>{s.commit?.slice(0,9) || '—'}</code></dd>
      <dt>Mergeability</dt><dd>{s.mergeable === true ? 'Mergeable' : s.mergeable === false ? 'Conflicts detected' : 'Checking'}</dd>
    </dl>
    {live.status === 'stale' ? <p data-tone="negative">Refresh failed. Showing the last successful GitHub response.</p> : null}
    <small className="agentsam-release-source">Live GitHub data · updated {dateLabel(s.fetchedAt)} · PR updated {dateLabel(s.updatedAt)}</small>
  </WidgetFrame>;
}
export function ReleaseReadinessWidget({dataHost}: Props) {
  const live = useLiveData<LiveReadiness>('release-readiness',dataHost);
  const s = live.data;
  if (!s) return <WidgetFrame title="Verification & Release Readiness" size="medium" state={{status:live.status === 'loading' ? 'empty' : 'error', ...(live.status === 'loading' ? {} : {error:{code:live.error || 'widget_data_unavailable',message:friendlyError(live.error)}})}}>
    <LiveError status={live.status} error={live.error} data={s}/>
  </WidgetFrame>;
  const icons = {passed:CheckCircle2,failed:XCircle,pending:Clock,unknown:Circle};
  const tone = s.state === 'clear' ? 'positive' : s.state === 'blocked' ? 'negative' : '';
  const summary = s.state === 'clear' ? 'All observed checks passed'
    : s.state === 'blocked' ? 'One or more checks failed'
    : s.state === 'running' ? 'Checks are still running'
    : s.state === 'partial' ? 'Some evidence could not be classified'
    : 'No current verification evidence';
  return <WidgetFrame title="Verification & Release Readiness" size="medium" className="agentsam-release-widget"
    description={s.repository+' · '+s.ref}>
    <div className="agentsam-release-score">
      <strong data-tone={tone}>{s.counts.passed} / {s.counts.total} passed</strong>
      {s.counts.total>0?<progress max={s.counts.total} value={s.counts.passed} aria-label="Live verification checks"/>:null}
      <span>{summary}</span>
    </div>
    {s.checks.length>0?<><h3>Live verification</h3><ul className="agentsam-release-checks">
      {s.checks.slice(0,12).map((check,index)=>{const Icon=icons[check.status];return <li key={check.source+check.name+index}>
        <Icon size={17} data-tone={check.status==='passed'?'positive':check.status==='failed'?'negative':''}/>
        {check.url?<a href={check.url} target="_blank" rel="noopener noreferrer">{check.name}</a>:<span>{check.name}</span>}
        <span className="agentsam-release-sr">{check.status}</span>
      </li>;})}
    </ul></>:<p className="text-xs text-muted-foreground">No GitHub checks or commit-scoped AgentSam receipts were found for this commit.</p>}
    {s.blockers.length>0?<><h3>Current blockers</h3><ul className="agentsam-release-checks">
      {s.blockers.slice(0,8).map((blocker,index)=><li key={index}><XCircle size={15} data-tone="negative"/><span>{blocker}</span></li>)}
    </ul></>:null}
    {live.status === 'stale' ? <p data-tone="negative">Refresh failed. Showing the last successful evidence.</p> : null}
    <small className="agentsam-release-source">GitHub checks + commit-scoped AgentSam receipts · updated {dateLabel(s.fetchedAt)}. Evidence only; this widget does not approve a release.</small>
  </WidgetFrame>;
}
