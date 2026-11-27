// Recorded, commit-scoped evidence. No live network claims or executable input.
type RecordValue = Record<string, unknown>;
const object = (value: unknown): value is RecordValue => !!value && typeof value === 'object' && !Array.isArray(value);
const str = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const only = (value: RecordValue, keys: string[]) => Object.keys(value).every(key => keys.includes(key));
const sha = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{7,40}$/i.test(value);
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
export interface PullRequestSnapshot {
  repository: string; number: number; title: string; branch: string; commit: string;
  state: 'open' | 'merged' | 'closed'; files: number; additions: number; deletions: number;
  scope: 'pull-request' | 'commit'; observedAt: string;
  mergeable?: boolean; commits?: number; cleanWorktree?: boolean;
}
export interface ReleaseCheck { name: string; status: 'passed' | 'failed' | 'pending' | 'unknown'; }
export interface ReleaseSnapshot {
  commit: string; observedAt: string; source: string; label: string;
  passed: number; total: number; checks: ReleaseCheck[]; blockers: string[];
}
export function readPullRequestSnapshot(value: unknown): PullRequestSnapshot | null {
  if (!object(value) || !only(value,['repository','number','title','branch','commit','state','files','additions','deletions','scope','observedAt','mergeable','commits','cleanWorktree'])) return null;
  if (!str(value.repository,180) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository) || !count(value.number) || value.number === 0 || !str(value.title,240) || !str(value.branch,220) || !sha(value.commit) || !date(value.observedAt)) return null;
  if (!['open','merged','closed'].includes(String(value.state)) || !['pull-request','commit'].includes(String(value.scope)) || !count(value.files) || !count(value.additions) || !count(value.deletions)) return null;
  if (value.mergeable !== undefined && typeof value.mergeable !== 'boolean' || value.cleanWorktree !== undefined && typeof value.cleanWorktree !== 'boolean' || value.commits !== undefined && !count(value.commits)) return null;
  return value as unknown as PullRequestSnapshot;
}
export function readReleaseSnapshot(value: unknown): ReleaseSnapshot | null {
  if (!object(value) || !only(value,['commit','observedAt','source','label','passed','total','checks','blockers']) || !sha(value.commit) || !date(value.observedAt) || !str(value.source,200) || !str(value.label,200) || !count(value.passed) || !count(value.total) || value.passed > value.total) return null;
  if (!Array.isArray(value.checks) || value.checks.length > 20 || !value.checks.every(check => object(check) && only(check,['name','status']) && str(check.name,140) && ['passed','failed','pending','unknown'].includes(String(check.status)))) return null;
  if (!Array.isArray(value.blockers) || value.blockers.length > 12 || !value.blockers.every(item => str(item,180))) return null;
  return value as unknown as ReleaseSnapshot;
}
export function validReleaseWidgetConfiguration(key: string, value: unknown): boolean {
  if (!object(value) || !only(value,['snapshot'])) return false;
  if (!Object.hasOwn(value,'snapshot')) return true;
  return key === 'pull-request-summary' ? !!readPullRequestSnapshot(value.snapshot) : key === 'release-readiness' && !!readReleaseSnapshot(value.snapshot);
}
