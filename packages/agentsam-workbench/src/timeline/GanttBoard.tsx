import { useMemo, useState } from 'react';

export type GanttStatus = 'planned' | 'ready' | 'active' | 'blocked' | 'complete' | 'cancelled';
export type GanttKind = 'phase' | 'task' | 'milestone';

export interface GanttActor {
  id?: string;
  name: string;
  role?: string;
}

export interface GanttItem {
  id: string;
  title: string;
  kind?: GanttKind;
  status?: GanttStatus | string;
  owner?: GanttActor | string | null;
  start?: string | null;
  end?: string | null;
  baselineStart?: string | null;
  baselineEnd?: string | null;
  progress?: number | null;
  parentId?: string | null;
  dependencies?: string[];
  blockedReason?: string | null;
  estimateMinutes?: number | null;
  actualMinutes?: number | null;
  artifactCount?: number;
  evidenceCount?: number;
  metadata?: Record<string, unknown>;
}

export interface GanttGroup {
  id: string;
  title: string;
  start?: string | null;
  end?: string | null;
  progress?: number | null;
}

export interface GanttBoardProps {
  title: string;
  subtitle?: string;
  items: GanttItem[];
  groups: GanttGroup[];
  rangeStart: string;
  rangeEnd: string;
  today?: string;
  selectedId?: string | null;
  onSelect?: (item: GanttItem | null) => void;
  onCreateTask?: () => void;
}

const DAY = 86_400_000;

function dayKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function spanFor(start: string | null | undefined, end: string | null | undefined, rangeStart: string, count: number) {
  if (!start) return { offset: 0, span: 1 };
  const range = dayKey(rangeStart);
  const s = Math.max(0, Math.round((dayKey(start) - range) / DAY));
  const e = end ? Math.round((dayKey(end) - range) / DAY) : s;
  return { offset: Math.min(count - 1, s), span: Math.max(1, Math.min(count - s, e - s + 1)) };
}

function formatOwner(owner: GanttItem['owner']) {
  if (!owner) return 'Unassigned';
  return typeof owner === 'string' ? owner : owner.name;
}

function formatDateShort(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
}

function formatMinutes(value?: number | null) {
  if (value == null) return '—';
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function GanttBoard({
  title,
  subtitle,
  items,
  groups,
  rangeStart,
  rangeEnd,
  today,
  selectedId,
  onSelect,
  onCreateTask,
}: GanttBoardProps) {
  const [hideCompleted, setHideCompleted] = useState(false);
  const [zoom, setZoom] = useState<'Day' | 'Week'>('Day');

  const days = useMemo(() => {
    const start = dayKey(rangeStart);
    const end = dayKey(rangeEnd);
    const result: Date[] = [];
    for (let value = start; value <= end; value += DAY) result.push(new Date(value));
    return result;
  }, [rangeStart, rangeEnd]);

  const visible = hideCompleted ? items.filter((item) => item.status !== 'complete') : items;
  const byGroup = new Map(groups.map((group) => [group.id, visible.filter((item) => item.parentId === group.id)]));
  const selected = items.find((item) => item.id === selectedId) ?? null;
  const todayIndex = today ? Math.round((dayKey(today) - dayKey(rangeStart)) / DAY) : -1;

  return (
    <section className="as-gantt-shell">
      <header className="as-gantt-project-header">
        <div>
          <p className="as-kicker">PROJECT</p>
          <h1>{title}</h1>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="as-gantt-project-actions">
          <button type="button" className="as-button">Share</button>
          <button type="button" className="as-button as-button--primary" onClick={onCreateTask}>+ Add task</button>
        </div>
      </header>

      <nav className="as-view-tabs" aria-label="Project views">
        {['Gantt', 'List', 'Calendar', 'Discussions'].map((tab) => <button key={tab} type="button" data-active={tab === 'Gantt' || undefined}>{tab}</button>)}
        <button type="button">More ▾</button>
      </nav>

      <div className="as-gantt-toolbar">
        <div className="as-gantt-toolbar__group">
          <button type="button">Menu ▾</button>
          <button type="button">View ▾</button>
          <button type="button" onClick={() => setZoom((value) => value === 'Day' ? 'Week' : 'Day')}>Zoom · {zoom}</button>
          <button type="button">Filter ▾</button>
          <label><input type="checkbox" checked={hideCompleted} onChange={(event) => setHideCompleted(event.target.checked)} /> Hide completed</label>
        </div>
        <div className="as-gantt-toolbar__group as-gantt-toolbar__group--right">
          <span>{formatDateShort(rangeStart)} – {formatDateShort(rangeEnd)}</span>
          <button type="button">Today</button>
        </div>
      </div>

      <div className="as-gantt-layout" data-inspector={selected ? 'open' : 'closed'}>
        <div className="as-gantt-main">
          <div className="as-gantt-scroll">
            <div className="as-gantt-table" style={{ '--as-day-count': days.length } as React.CSSProperties}>
              <div className="as-gantt-header as-gantt-task-col">Workstream</div>
              <div className="as-gantt-header as-gantt-owner-col">Owner</div>
              <div className="as-gantt-days">
                {days.map((day) => (
                  <div className="as-gantt-day" key={day.toISOString()}>
                    <span>{day.toLocaleDateString('en-US', { month: day.getUTCDate() === 1 || day.getTime() === days[0]?.getTime() ? 'short' : undefined, timeZone: 'UTC' })}</span>
                    <strong>{day.getUTCDate()}</strong>
                    <small>{day.toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' })}</small>
                  </div>
                ))}
                {todayIndex >= 0 && todayIndex < days.length ? <span className="as-today-line" style={{ left: `${((todayIndex + 0.5) / days.length) * 100}%` }}><em>Today</em></span> : null}
              </div>

              {groups.flatMap((group) => {
                const groupItems = byGroup.get(group.id) ?? [];
                const phase = spanFor(group.start, group.end, rangeStart, days.length);
                const phaseProgress = typeof group.progress === 'number' ? Math.max(0, Math.min(1, group.progress)) : null;
                return [
                  <div className="as-gantt-group as-gantt-task-col" key={`${group.id}-label`}>
                    <span className="as-disclosure">⌄</span><strong>{group.title}</strong>
                  </div>,
                  <div className="as-gantt-group as-gantt-owner-col" key={`${group.id}-owner`} />,
                  <div className="as-gantt-group as-gantt-timeline-cell" key={`${group.id}-timeline`}>
                    <div className="as-phase-track" style={{ left: `${phase.offset / days.length * 100}%`, width: `${phase.span / days.length * 100}%` }}>
                      {phaseProgress != null ? <span style={{ width: `${phaseProgress * 100}%` }} /> : null}
                    </div>
                  </div>,
                  ...groupItems.flatMap((item) => {
                    const span = spanFor(item.start, item.end, rangeStart, days.length);
                    const progress = typeof item.progress === 'number' ? Math.max(0, Math.min(1, item.progress)) : null;
                    return [
                      <button className="as-gantt-row as-gantt-task-col" data-selected={item.id === selectedId || undefined} key={`${item.id}-label`} onClick={() => onSelect?.(item)}>
                        <span className="as-task-dot" data-status={item.status ?? 'planned'} />
                        <span className="as-task-title">{item.title}</span>
                        {progress != null && item.kind !== 'milestone' ? <span className="as-task-percent">{Math.round(progress * 100)}%</span> : null}
                      </button>,
                      <button className="as-gantt-row as-gantt-owner-col" data-selected={item.id === selectedId || undefined} key={`${item.id}-owner`} onClick={() => onSelect?.(item)}>{formatOwner(item.owner)}</button>,
                      <button className="as-gantt-row as-gantt-timeline-cell" data-selected={item.id === selectedId || undefined} key={`${item.id}-timeline`} onClick={() => onSelect?.(item)}>
                        {item.kind === 'milestone' ? (
                          <span className="as-milestone" title={item.title} style={{ left: `${((span.offset + 0.5) / days.length) * 100}%` }} />
                        ) : (
                          <>
                            {item.baselineStart ? (() => {
                              const baseline = spanFor(item.baselineStart, item.baselineEnd, rangeStart, days.length);
                              return <span className="as-baseline" style={{ left: `${baseline.offset / days.length * 100}%`, width: `${baseline.span / days.length * 100}%` }} />;
                            })() : null}
                            <span className="as-task-bar" data-status={item.status ?? 'planned'} style={{ left: `${span.offset / days.length * 100}%`, width: `${span.span / days.length * 100}%` }}>
                              {progress != null ? <span className="as-task-bar__progress" style={{ width: `${progress * 100}%` }} /> : null}
                              <strong>{item.title}</strong>
                            </span>
                          </>
                        )}
                      </button>,
                    ];
                  }),
                ];
              })}
            </div>
          </div>
        </div>

        {selected ? (
          <aside className="as-work-inspector">
            <button className="as-work-inspector__close" type="button" onClick={() => onSelect?.(null)} aria-label="Close inspector">×</button>
            <span className="as-status-pill" data-status={selected.status ?? 'planned'}>{selected.status ?? 'planned'}</span>
            <h2>{selected.title}</h2>
            <p className="as-work-inspector__summary">{String(selected.metadata?.summary ?? 'WorkGraph item projected into the schedule. The timeline is not the source of truth.')}</p>

            <dl className="as-inspector-grid">
              <div><dt>Owner</dt><dd>{formatOwner(selected.owner)}</dd></div>
              <div><dt>Status</dt><dd>{selected.status ?? 'planned'}</dd></div>
              <div><dt>Start</dt><dd>{formatDateShort(selected.start)}</dd></div>
              <div><dt>Due</dt><dd>{formatDateShort(selected.end)}</dd></div>
            </dl>

            <section>
              <h3>Progress</h3>
              {typeof selected.progress === 'number' ? (
                <>
                  <div className="as-progress-track"><span style={{ width: `${Math.round(selected.progress * 100)}%` }} /></div>
                  <p className="as-inspector-note">{Math.round(selected.progress * 100)}% · {formatMinutes(selected.actualMinutes)} actual / {formatMinutes(selected.estimateMinutes)} estimated</p>
                </>
              ) : <p className="as-inspector-note">Progress denominator is not known yet.</p>}
            </section>

            <section>
              <h3>Dependencies</h3>
              {selected.dependencies?.length ? selected.dependencies.map((dependency) => <div className="as-inspector-line" key={dependency}>← {dependency}</div>) : <p className="as-inspector-note">No dependencies</p>}
            </section>

            <section>
              <h3>Artifacts & evidence</h3>
              <div className="as-inspector-line">{selected.artifactCount ?? 0} artifacts</div>
              <div className="as-inspector-line">{selected.evidenceCount ?? 0} evidence records</div>
            </section>

            {selected.blockedReason ? <section><h3>Blocker</h3><div className="as-inspector-line as-inspector-line--danger">{selected.blockedReason}</div></section> : null}

            <div className="as-work-inspector__actions">
              <button className="as-button" type="button">Open tickets</button>
              <button className="as-button as-button--primary" type="button">Open work</button>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
