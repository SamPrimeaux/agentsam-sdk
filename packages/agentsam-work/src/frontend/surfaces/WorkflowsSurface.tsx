import {
  AlertCircle,
  ArrowUpDown,
  Clock3,
  GitBranch,
  Layers3,
  Play,
  Plus,
  RefreshCw,
  Search,
  Workflow,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkWorkflowLifecycle, WorkWorkflowRunStatus, WorkWorkflowSummary } from "../../contracts/index";

export type WorkflowsLifecycle = WorkWorkflowLifecycle;
export type WorkflowsScope = WorkWorkflowSummary["scopeType"];
export type WorkflowsRunStatus = WorkWorkflowRunStatus;
export type WorkflowsLibraryItem = WorkWorkflowSummary;

export type WorkflowsSurfaceProps = {
  items: WorkflowsLibraryItem[];
  loading?: boolean;
  error?: string | null;
  selectedId?: string | null;
  onOpen?: (workflow: WorkflowsLibraryItem) => void | Promise<void>;
  onCreate?: () => void | WorkflowsLibraryItem | Promise<void | WorkflowsLibraryItem>;
  onRun?: (workflow: WorkflowsLibraryItem) => void | Promise<void>;
  onRetry?: () => void;
};

type Filter = "all" | WorkflowsLifecycle;

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All workflows" },
  { id: "active", label: "Active" },
  { id: "draft", label: "Drafts" },
  { id: "disabled", label: "Disabled" },
  { id: "retired", label: "Retired" },
];

function statusLabel(status: WorkflowsLifecycle | WorkflowsRunStatus): string {
  return status.replaceAll("_", " ");
}

function statusTone(status?: WorkflowsLifecycle | WorkflowsRunStatus | null): string {
  if (status === "active" || status === "completed") return "success";
  if (status === "failed" || status === "timed_out") return "danger";
  if (status === "running") return "active";
  if (status === "waiting") return "warning";
  return "neutral";
}

function relativeTime(epoch?: number | null): string | null {
  if (!epoch || !Number.isFinite(epoch)) return null;
  const date = new Date(epoch > 10_000_000_000 ? epoch : epoch * 1000);
  if (Number.isNaN(date.getTime())) return null;
  const delta = Math.max(0, Date.now() - date.getTime());
  if (delta < 60_000) return "Updated just now";
  if (delta < 3_600_000) return `Updated ${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `Updated ${Math.floor(delta / 3_600_000)}h ago`;
  if (delta < 7 * 86_400_000) return `Updated ${Math.floor(delta / 86_400_000)}d ago`;
  return `Updated ${date.toLocaleDateString()}`;
}

function formatDuration(ms?: number | null): string | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

export function WorkflowsSurface({
  items,
  loading = false,
  error = null,
  selectedId = null,
  onOpen,
  onCreate,
  onRun,
  onRetry,
}: WorkflowsSurfaceProps) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "name" | "runs">("updated");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = items.filter((item) => {
      if (filter !== "all" && item.lifecycle !== filter) return false;
      if (!needle) return true;
      return [item.displayName, item.workflowKey, item.description ?? ""].some((value) => value.toLowerCase().includes(needle));
    });
    return result.sort((a, b) => {
      if (sort === "name") return a.displayName.localeCompare(b.displayName);
      if (sort === "runs") return (b.runCount ?? -1) - (a.runCount ?? -1);
      return (b.updatedAt ?? -1) - (a.updatedAt ?? -1) || a.displayName.localeCompare(b.displayName);
    });
  }, [filter, items, query, sort]);

  const counts = useMemo(() => ({
    all: items.length,
    active: items.filter((item) => item.lifecycle === "active").length,
    draft: items.filter((item) => item.lifecycle === "draft").length,
    disabled: items.filter((item) => item.lifecycle === "disabled").length,
    retired: items.filter((item) => item.lifecycle === "retired").length,
  }), [items]);

  async function createWorkflow() {
    if (!onCreate) return;
    setCreating(true);
    setActionError(null);
    try {
      const created = await onCreate();
      if (created && onOpen) {
        try {
          await onOpen(created);
        } catch (cause) {
          const detail = cause instanceof Error ? cause.message : "the editor could not be opened";
          setActionError(`Created “${created.displayName}”, but ${detail}.`);
        }
      }
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "Could not create a workflow.");
    } finally {
      setCreating(false);
    }
  }

  async function runWorkflow(item: WorkflowsLibraryItem) {
    if (!onRun) return;
    setRunningId(item.id);
    setActionError(null);
    try {
      await onRun(item);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : `Could not start ${item.displayName}.`);
    } finally {
      setRunningId(null);
    }
  }

  if (loading) {
    return <section className="agentsam-work aw-workflows"><div className="aw-workflows__skeleton" /><div className="aw-workflows__skeleton" /><div className="aw-workflows__skeleton" /><span>Loading workflows…</span></section>;
  }

  if (error) {
    return <section className="agentsam-work aw-workflows aw-workflows--message"><AlertCircle size={22} /><strong>Workflows could not be loaded</strong><p>{error}</p>{onRetry ? <button type="button" className="aw-btn aw-btn--primary" onClick={onRetry}><RefreshCw size={15} />Try again</button> : null}</section>;
  }

  return (
    <section className="agentsam-work aw-workflows">
      <header className="aw-workflows__header">
        <div>
          <span className="aw-workflows__eyebrow">Work</span>
          <h1>Workflows</h1>
          <p>Reusable processes and automations available to this workspace.</p>
        </div>
        {onCreate ? <button type="button" className="aw-btn aw-btn--primary" disabled={creating} onClick={() => void createWorkflow()}><Plus size={15} />{creating ? "Creating…" : "New workflow"}</button> : null}
      </header>

      {actionError ? <div className="aw-workflows__error" role="alert"><AlertCircle size={15} />{actionError}<button type="button" onClick={() => setActionError(null)} aria-label="Dismiss error"><X size={14} /></button></div> : null}

      <div className="aw-workflows__controls">
        <label className="aw-workflows__search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search workflows" /><span>{filtered.length}</span></label>
        <label className="aw-workflows__sort"><ArrowUpDown size={14} /><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Sort workflows"><option value="updated">Recently updated</option><option value="name">Name</option><option value="runs" disabled={!items.some((item) => item.runCount != null)}>Most runs</option></select></label>
      </div>

      <nav className="aw-workflows__filters" aria-label="Filter workflows">
        {FILTERS.map((option) => <button type="button" key={option.id} data-active={filter === option.id} aria-pressed={filter === option.id} onClick={() => setFilter(option.id)}>{option.label}<span>{counts[option.id]}</span></button>)}
      </nav>

      {filtered.length ? (
        <div className="aw-workflows__list" aria-label="Workflow library">
          {filtered.map((item) => {
            const canRun = Boolean(onRun && item.lifecycle === "active");
            const updated = relativeTime(item.updatedAt);
            const runDuration = formatDuration(item.latestRun?.durationMs);
            const mainContent = (
              <>
                <span className="aw-workflows__item-icon"><Workflow size={19} /></span>
                <span className="aw-workflows__item-copy">
                  <span className="aw-workflows__item-title"><strong>{item.displayName}</strong><span className={`aw-workflows__status aw-workflows__status--${statusTone(item.lifecycle)}`}>{statusLabel(item.lifecycle)}</span></span>
                  <span className="aw-workflows__item-description">{item.description || item.workflowKey}</span>
                  <span className="aw-workflows__item-meta">
                    <span>v{item.revision}</span>
                    {item.nodeCount != null ? <span><Layers3 size={12} />{item.nodeCount} nodes</span> : null}
                    {item.edgeCount != null ? <span><GitBranch size={12} />{item.edgeCount} connections</span> : null}
                    {item.runCount != null ? <span><Play size={11} />{item.runCount} runs</span> : null}
                    {updated ? <span><Clock3 size={11} />{updated}</span> : null}
                    <span>{item.scopeType === "account" ? "Account" : "Platform"}</span>
                  </span>
                </span>
                {onOpen ? <span className="aw-workflows__open">Open</span> : null}
              </>
            );
            return (
              <article className="aw-workflows__item" key={item.id} data-selected={selectedId === item.id}>
                {onOpen ? <button type="button" className="aw-workflows__item-main" onClick={() => onOpen(item)}>{mainContent}</button> : <div className="aw-workflows__item-main">{mainContent}</div>}
                <div className="aw-workflows__item-actions">
                  {item.latestRun ? <span className={`aw-workflows__latest aw-workflows__latest--${statusTone(item.latestRun.status)}`}><span>{statusLabel(item.latestRun.status)}</span>{runDuration ? <small>{runDuration}</small> : null}</span> : null}
                  {canRun ? <button type="button" className="aw-btn aw-btn--small" disabled={runningId === item.id} onClick={() => void runWorkflow(item)}><Play size={13} />{runningId === item.id ? "Starting…" : "Run"}</button> : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="aw-workflows__empty">
          <span><Workflow size={24} /></span>
          <strong>{query || filter !== "all" ? "No matching workflows" : "No workflows yet"}</strong>
          <p>{query || filter !== "all" ? "Try a different search or lifecycle filter." : "Workflows provided by the host will appear here. Create one when the host supports workflow authoring."}</p>
          {query ? <button type="button" className="aw-btn" onClick={() => setQuery("")}>Clear search</button> : onCreate && filter === "all" ? <button type="button" className="aw-btn aw-btn--primary" disabled={creating} onClick={() => void createWorkflow()}><Plus size={15} />Create workflow</button> : null}
        </div>
      )}
    </section>
  );
}
