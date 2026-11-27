import { WidgetFrame } from './WidgetFrame';
import { readPullRequestSnapshot, readReleaseSnapshot } from './release-snapshots';
import { CheckCircle2, Circle, Clock, GitPullRequest, XCircle } from 'lucide-react';
type Props = {configuration?: Record<string, unknown>};
const fmt = (n: number) => n.toLocaleString('en-US');
const observed = (value: string) => new Date(value).toISOString().replace('T',' ').slice(0,16) + ' UTC';
export function PullRequestSummaryWidget({configuration = {}}: Props) {
  const s = readPullRequestSnapshot(configuration.snapshot);
  if (!s) return <WidgetFrame title="Pull Request Summary" size="medium" state={{status:'empty'}}>No recorded pull request yet. Attach a verified PR snapshot.</WidgetFrame>;
  const metrics = [{label:s.scope==='commit'?'Files changed in commit':'Files changed in PR',value:fmt(s.files),tone:''},{label:'Commits recorded',value:s.commits===undefined?'Not recorded':fmt(s.commits),tone:''},{label:'Lines added',value:'+'+fmt(s.additions),tone:'positive'},{label:'Lines removed',value:'−'+fmt(s.deletions),tone:'negative'}];
  return <WidgetFrame title={<span className="agentsam-release-title"><GitPullRequest size={19}/> Pull request #{s.number}</span>} size="medium" description={s.state==='merged'?'Merged at snapshot':s.state==='closed'?'Closed at snapshot':'Open at snapshot'} className="agentsam-release-widget">
    <a className="agentsam-release-link" href={'https://github.com/'+s.repository+'/pull/'+s.number} target="_blank" rel="noopener noreferrer">Review the pull request on GitHub ↗</a>
    <div className="agentsam-release-metrics">{metrics.map(m=><div key={m.label}><strong data-tone={m.tone}>{m.value}</strong><span>{m.label}</span></div>)}</div>
    <dl className="agentsam-release-meta"><dt>Recorded commit</dt><dd><code>{s.commit.slice(0,9)}</code></dd><dt>Branch</dt><dd><code>{s.branch}</code></dd></dl>
    {s.cleanWorktree!==undefined?<p>{s.cleanWorktree?'Working tree was clean.':'Working tree had changes.'}</p>:null}
    {s.mergeable===false?<p data-tone="negative">Not mergeable at snapshot.</p>:null}
    <small className="agentsam-release-source">Recorded {observed(s.observedAt)} · {s.repository}</small>
  </WidgetFrame>;
}
export function ReleaseReadinessWidget({configuration = {}}: Props) {
  const s = readReleaseSnapshot(configuration.snapshot);
  if (!s) return <WidgetFrame title="Verification & Release Readiness" size="medium" state={{status:'empty'}}>No recorded test evidence yet. Attach a commit-scoped verification snapshot.</WidgetFrame>;
  const icons = {passed:CheckCircle2,failed:XCircle,pending:Clock,unknown:Circle};
  const tone = s.total>0 && s.passed===s.total?'positive':'';
  return <WidgetFrame title="Verification & Release Readiness" size="medium" className="agentsam-release-widget" description={'Recorded commit '+s.commit.slice(0,9)}>
    <div className="agentsam-release-score"><strong data-tone={tone}>{s.passed} / {s.total} passed</strong>{s.total>0?<progress max={s.total} value={s.passed} aria-label="Recorded test completion"/>:null}<span>{s.label}</span></div>
    {s.checks.length>0?<><h3>Focused verification</h3><ul className="agentsam-release-checks">{s.checks.map((c,i)=>{const Icon=icons[c.status];return <li key={i}><Icon size={17} data-tone={c.status==='passed'?'positive':c.status==='failed'?'negative':''}/><span>{c.name}</span><span className="agentsam-release-sr">{c.status}</span></li>})}</ul></>:null}
    {s.blockers.length>0?<><h3>Recorded release blockers</h3><ul className="agentsam-release-checks">{s.blockers.map((b,i)=><li key={i}><Circle size={14}/><span>{b}</span></li>)}</ul></>:null}
    <small className="agentsam-release-source">Recorded {observed(s.observedAt)} · {s.source}. Not a live release gate.</small>
  </WidgetFrame>;
}
