import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Code2,
  Copy,
  Filter,
  Play,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Rows3,
  ServerCog,
  Table2,
  Trash2,
  X,
} from "lucide-react";
import { SqlMonacoEditor, formatSqlFallback } from "./SqlMonacoEditor";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  createDatabaseStudioClient,
  type DatabaseColumnInfo,
  type DatabaseMetricsResponse,
  type DatabaseQueryResponse,
  type DatabaseRowsResponse,
  type DatabaseSchemaInfo,
  type DatabaseSource,
  type DatabaseSourcesResponse,
  type DatabaseStudioClient,
  type DatabaseTableInfo,
} from "./client";
import "./database-editor.css";

type View = "overview" | "data" | "sql" | "schema";
type EditMode = "insert" | "edit";

import type { LocalDatabaseHost, ProviderCapability } from "./local-host";
import {
  DATABASE_PROVIDER_THEMES,
  cssVarsForTheme,
  themeIdForProviderFamily,
} from "./provider-theme";

export type DatabaseEditorAppProps = {
  client?: DatabaseStudioClient;
  initialSourceId?: string;
  compact?: boolean;
  onOpenConnections?: () => void;
  onAuthenticate?: () => void;
  /** Machine-local SQLite host (Local Studio / Tauri / agentsamd). */
  localHost?: LocalDatabaseHost;
  onAskAgentSam?: (context: Record<string, unknown>) => void;
};

function providerFamily(source?: DatabaseSource | null) {
  if (!source) return "none";
  if (source.provider.includes("cloudflare")) return "cloudflare";
  if (source.provider.includes("supabase") || source.provider.includes("postgres")) return "supabase";
  if (source.provider.includes("local")) return "local";
  return "other";
}

function providerLabel(source?: DatabaseSource | null) {
  const family = providerFamily(source);
  if (family === "cloudflare") return "Cloudflare";
  if (family === "supabase") return source?.accelerator === "hyperdrive" ? "Supabase · Hyperdrive" : "Supabase";
  if (family === "local") return "Local SQLite";
  return source?.provider || "Database";
}

function formatCompact(value?: number | null) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatBytes(value?: number | null, opts?: { unknownLabel?: string }) {
  if (value == null || Number.isNaN(Number(value))) return opts?.unknownLabel || "Not reported";
  const bytes = Number(value);
  if (bytes < 0) return opts?.unknownLabel || "Not reported";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function storageDisplay(metrics: DatabaseMetricsResponse | null, source: DatabaseSource | null) {
  const fromMetrics = metrics?.kpis?.storage;
  if (fromMetrics != null && Number(fromMetrics) > 0) return formatBytes(fromMetrics);
  // Never treat unknown / failed size probes as 0 B.
  if (metrics?.wired === false || fromMetrics == null) {
    const file = source?.file_size;
    if (file != null && Number(file) > 0) return formatBytes(file);
    return "Not reported";
  }
  if (Number(fromMetrics) === 0) return "Not reported";
  return formatBytes(fromMetrics);
}

function tableKey(table: DatabaseTableInfo) {
  return table.schema ? `${table.schema}.${table.name}` : table.name;
}

function labelForTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Request failed");
}

function normalizeFormValue(value: string, column: DatabaseColumnInfo) {
  if (value === "" && column.nullable) return null;
  const type = column.type.toLowerCase();
  if (/\b(bool|boolean)\b/.test(type)) {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (/\b(int|integer|bigint|smallint|numeric|decimal|real|double|float)\b/.test(type)) {
    const n = Number(value);
    if (Number.isFinite(n) && value.trim() !== "") return n;
  }
  return value;
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <section className="db-kpi-card">
      <div className="db-kpi-label">{label}</div>
      <div className="db-kpi-value">{value}</div>
      {sub ? <div className="db-kpi-sub">{sub}</div> : null}
    </section>
  );
}

function MetricChart({
  title,
  data,
  first,
  second,
}: {
  title: string;
  data: Array<Record<string, unknown>>;
  first: string;
  second?: string;
}) {
  const hasSeries = data.some((point) => {
    const a = point[first];
    const b = second ? point[second] : null;
    return (a != null && !Number.isNaN(Number(a))) || (b != null && !Number.isNaN(Number(b)));
  });
  return (
    <section className="db-chart-card">
      <header className="db-chart-title">
        <Activity size={14} aria-hidden />
        <span>{title}</span>
      </header>
      <div className="db-chart-body">
        {hasSeries ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 16, right: 18, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--db-grid)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: "var(--db-muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={24}
              />
              <YAxis
                tick={{ fill: "var(--db-muted)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--db-panel)",
                  border: "1px solid var(--db-border)",
                  borderRadius: 10,
                  fontSize: 12,
                }}
              />
              <Bar dataKey={first} fill="var(--db-accent)" radius={[3, 3, 0, 0]} />
              {second ? <Bar dataKey={second} fill="var(--db-accent-2)" radius={[3, 3, 0, 0]} /> : null}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="db-chart-empty">No series for this range.</div>
        )}
      </div>
    </section>
  );
}

type QueryTab = { id: string; title: string; sql: string };

function newQueryTab(index: number, sql = "SELECT 1 AS ok;"): QueryTab {
  return { id: `q-${Date.now()}-${index}`, title: `Query ${index}`, sql };
}

function EditorModal({
  mode,
  table,
  columns,
  initial,
  busy,
  onClose,
  onSave,
}: {
  mode: EditMode;
  table: DatabaseTableInfo;
  columns: DatabaseColumnInfo[];
  initial: Record<string, unknown>;
  busy: boolean;
  onClose: () => void;
  onSave: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      columns.map((column) => [
        column.name,
        initial[column.name] == null ? "" : String(initial[column.name]),
      ]),
    ),
  );

  return (
    <div className="db-modal-backdrop" role="dialog" aria-modal="true">
      <div className="db-modal">
        <header className="db-modal-header">
          <div>
            <div className="db-eyebrow">{mode === "insert" ? "INSERT ROW" : "UPDATE ROW"}</div>
            <strong>{tableKey(table)}</strong>
          </div>
          <button type="button" className="db-icon-button" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="db-modal-fields">
          {columns
            .map((column) => (
              <label key={column.name} className="db-field">
                <span>
                  {column.name}
                  <small>{column.type || "value"}{column.primaryKey ? " · PK" : ""}</small>
                </span>
                {(/text|json|blob/i.test(column.type) && (draft[column.name] || "").length > 120) ? <textarea
                  rows={4}
                  spellCheck={false}
                  value={draft[column.name] ?? ""}
                  onChange={(event) => setDraft((current) => ({ ...current, [column.name]: event.target.value }))}
                /> : <input
                  value={draft[column.name] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [column.name]: event.target.value }))
                  }
                  placeholder={column.defaultValue ? `default: ${column.defaultValue}` : column.nullable ? "NULL / value" : "value"}
                />}
              </label>
            ))}
        </div>
        <footer className="db-modal-actions">
          <button type="button" className="db-button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="db-button primary"
            disabled={busy}
            onClick={() =>
              void onSave(
                Object.fromEntries(
                  columns
                    .filter((column) => column.name in draft)
                    .map((column) => [column.name, normalizeFormValue(draft[column.name] ?? "", column)]),
                ),
              )
            }
          >
            {busy ? <Loader2 className="spin" size={14} /> : null}
            {mode === "insert" ? "Insert row" : "Save changes"}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function DatabaseEditorApp({
  client: providedClient,
  initialSourceId,
  compact = false,
  onOpenConnections,
  onAuthenticate,
  localHost,
  onAskAgentSam,
}: DatabaseEditorAppProps) {
  const client = useMemo(() => providedClient || createDatabaseStudioClient(), [providedClient]);
  const [catalog, setCatalog] = useState<DatabaseSourcesResponse | null>(null);
  const [sourceId, setSourceId] = useState(initialSourceId || "");
  const [range, setRange] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [view, setView] = useState<View>("overview");
  const [metrics, setMetrics] = useState<DatabaseMetricsResponse | null>(null);
  const [tables, setTables] = useState<DatabaseTableInfo[]>([]);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<DatabaseTableInfo | null>(null);
  const [schema, setSchema] = useState<DatabaseSchemaInfo | null>(null);
  const [rows, setRows] = useState<DatabaseRowsResponse | null>(null);
  const [page, setPage] = useState(1);
  const [selectedRow, setSelectedRow] = useState<Record<string, unknown> | null>(null);
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>(() => {
    const first = newQueryTab(1);
    return [first];
  });
  const [activeQueryTabId, setActiveQueryTabId] = useState(() => queryTabs[0]?.id || "");
  const activeQueryTab = queryTabs.find((tab) => tab.id === activeQueryTabId) || queryTabs[0] || null;
  const sql = activeQueryTab?.sql ?? "SELECT 1 AS ok;";
  const setSql = useCallback((next: string | ((prev: string) => string)) => {
    setQueryTabs((tabs) => {
      const targetId = activeQueryTabId || tabs[0]?.id;
      return tabs.map((tab) => {
        if (tab.id !== targetId) return tab;
        const value = typeof next === "function" ? next(tab.sql) : next;
        return { ...tab, sql: value };
      });
    });
  }, [activeQueryTabId]);
  const [queryResult, setQueryResult] = useState<DatabaseQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMain, setLoadingMain] = useState(false);
  const [busyMutation, setBusyMutation] = useState(false);
  const [editMode, setEditMode] = useState<EditMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceLoadStatus, setSourceLoadStatus] = useState<number | null>(null);
  const [localCapability, setLocalCapability] = useState<ProviderCapability>("attachable");
  const [attachOpen, setAttachOpen] = useState(false);
  const [lastSourceByFamily, setLastSourceByFamily] = useState<Record<string, string>>({});
  const [railWidth, setRailWidth] = useState(compact ? 200 : 250);
  const [sqlSplitPct, setSqlSplitPct] = useState(48);
  const [paneCompact, setPaneCompact] = useState(Boolean(compact));
  const [tableFilterKind, setTableFilterKind] = useState<"all" | "table" | "view">("all");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; table: DatabaseTableInfo } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const resizingRail = useRef(false);
  const resizingSql = useRef(false);

  const source = useMemo(
    () => catalog?.sources.find((item) => item.id === sourceId) || null,
    [catalog, sourceId],
  );

  const family = providerFamily(source);
  const themeVars = useMemo(() => {
    const theme = DATABASE_PROVIDER_THEMES[themeIdForProviderFamily(family === "none" ? "local" : family)];
    return cssVarsForTheme(theme);
  }, [family]);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSourceLoadStatus(null);
    try {
      const next = await client.listSources();
      setCatalog(next);
      setSourceLoadStatus(null);
      if (localHost) {
        try {
          const status = await localHost.status();
          setLocalCapability(status === "unavailable" ? "unavailable" : status === "available" ? "available" : "attachable");
        } catch {
          setLocalCapability("attachable");
        }
      } else {
        const localConn = next.connections?.local_sqlite?.status;
        if (localConn === "connected") setLocalCapability("available");
        else if (next.sources.some((s) => providerFamily(s) === "local")) setLocalCapability("available");
        else setLocalCapability("attachable");
      }
      setSourceId((current) => {
        if (current && next.sources.some((item) => item.id === current)) return current;
        if (initialSourceId && next.sources.some((item) => item.id === initialSourceId)) return initialSourceId;
        return next.sources[0]?.id || "";
      });
    } catch (caught) {
      setSourceLoadStatus(
        typeof caught === "object" && caught !== null && "status" in caught
          ? Number((caught as { status?: unknown }).status) || null
          : null,
      );
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [client, initialSourceId, localHost]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

  useEffect(() => {
    if (!activeQueryTabId && queryTabs[0]?.id) setActiveQueryTabId(queryTabs[0].id);
  }, [activeQueryTabId, queryTabs]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      setPaneCompact(Boolean(compact));
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width || 0;
      setPaneCompact(Boolean(compact) || width > 0 && width < 760);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [compact]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (resizingRail.current && rootRef.current) {
        const rect = rootRef.current.getBoundingClientRect();
        const next = Math.min(420, Math.max(160, event.clientX - rect.left));
        setRailWidth(next);
      }
      if (resizingSql.current && rootRef.current) {
        const sqlView = rootRef.current.querySelector(".db-sql-split") as HTMLElement | null;
        if (sqlView) {
          const rect = sqlView.getBoundingClientRect();
          const pct = ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
          setSqlSplitPct(Math.min(75, Math.max(25, pct)));
        }
      }
    };
    const onUp = () => {
      resizingRail.current = false;
      resizingSql.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [ctxMenu]);

  useEffect(() => {
    if (source) {
      const fam = providerFamily(source);
      setLastSourceByFamily((prev) => (prev[fam] === source.id ? prev : { ...prev, [fam]: source.id }));
    }
  }, [source]);

  const attachAgentsamLocal = useCallback(async () => {
    if (!localHost) {
      setError("Local runtime host is not wired in this shell.");
      return;
    }
    try {
      setBusyMutation(true);
      const refs = await localHost.list();
      const agentsam = refs.find((r) => r.kind === "agentsam") || {
        id: "local-sqlite:agentsam",
        label: "AgentSam local database",
        ref: "agentsam",
        kind: "agentsam" as const,
      };
      const opened = await localHost.open(agentsam);
      setAttachOpen(false);
      await loadSources();
      setSourceId(opened.sourceId);
      setView("data");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusyMutation(false);
    }
  }, [loadSources, localHost]);

  const loadMetrics = useCallback(async () => {
    if (!sourceId) return;
    try {
      const next = await client.metrics(sourceId, range);
      setMetrics(next);
    } catch (caught) {
      setError(errorText(caught));
    }
  }, [client, range, sourceId]);

  const loadTables = useCallback(async () => {
    if (!sourceId) return;
    setLoadingMain(true);
    try {
      const next = await client.listTables(sourceId);
      setTables(next.tables || []);
      setSelectedTable((current) => {
        if (current && next.tables.some((item) => tableKey(item) === tableKey(current))) return current;
        return next.tables[0] || null;
      });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoadingMain(false);
    }
  }, [client, sourceId]);

  useEffect(() => {
    setMetrics(null);
    setTables([]);
    setSelectedTable(null);
    setSchema(null);
    setRows(null);
    setSelectedRow(null);
    setQueryResult(null);
    if (!sourceId) return;
    void Promise.all([loadMetrics(), loadTables()]);
  }, [sourceId, loadMetrics, loadTables]);

  useEffect(() => {
    if (sourceId) void loadMetrics();
  }, [range, sourceId, loadMetrics]);

  const loadTable = useCallback(
    async (table = selectedTable, requestedPage = page) => {
      if (!sourceId || !table) return;
      setLoadingMain(true);
      setError(null);
      try {
        const [schemaPayload, rowsPayload] = await Promise.all([
          client.schema(sourceId, table),
          client.rows(sourceId, table, { page: requestedPage, limit: compact ? 25 : 50 }),
        ]);
        setSchema(schemaPayload.schema);
        setRows(rowsPayload);
        setPage(rowsPayload.page);
        setSelectedRow(null);
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setLoadingMain(false);
      }
    },
    [client, compact, page, selectedTable, sourceId],
  );

  useEffect(() => {
    if (selectedTable) void loadTable(selectedTable, 1);
  }, [selectedTable, sourceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const families = useMemo(() => {
    const map = new Map<string, DatabaseSource[]>();
    for (const item of catalog?.sources || []) {
      const familyName = providerFamily(item);
      map.set(familyName, [...(map.get(familyName) || []), item]);
    }
    return map;
  }, [catalog]);

  const cloudflareCapability: ProviderCapability = families.get("cloudflare")?.length
    ? "available"
    : catalog?.connections?.cloudflare?.status === "connected"
      ? "attachable"
      : "attachable";
  const supabaseCapability: ProviderCapability = families.get("supabase")?.length ? "available" : "attachable";

  const selectProviderFamily = useCallback(
    (target: "cloudflare" | "supabase" | "local") => {
      const items = families.get(target) || [];
      if (items.length) {
        const preferred = lastSourceByFamily[target];
        const match = items.find((item) => item.id === preferred) || items[0];
        setSourceId(match.id);
        return;
      }
      if (target === "local") {
        setAttachOpen(true);
        return;
      }
      if (target === "cloudflare") {
        window.location.href =
          catalog?.connections?.cloudflare?.connect_url ||
          "/api/connections/cloudflare/start?packs=data&return_to=/database";
        return;
      }
      onOpenConnections?.();
    },
    [catalog, families, lastSourceByFamily, onOpenConnections],
  );

  const exploreData = useCallback(async () => {
    setView("data");
    let nextTables = tables;
    if (!nextTables.length && sourceId) {
      try {
        const listed = await client.listTables(sourceId);
        nextTables = listed.tables || [];
        setTables(nextTables);
      } catch (caught) {
        setError(errorText(caught));
        return;
      }
    }
    if (!selectedTable && nextTables[0]) setSelectedTable(nextTables[0]);
  }, [client, selectedTable, sourceId, tables]);

  const filteredTables = useMemo(() => {
    const needle = tableSearch.trim().toLowerCase();
    return tables.filter((table) => {
      if (tableFilterKind !== "all") {
        const kind = String(table.kind || "table").toLowerCase();
        if (tableFilterKind === "view" && !kind.includes("view")) return false;
        if (tableFilterKind === "table" && kind.includes("view")) return false;
      }
      if (!needle) return true;
      return tableKey(table).toLowerCase().includes(needle);
    });
  }, [tableFilterKind, tableSearch, tables]);

  const chartData = useMemo(
    () =>
      (metrics?.series || []).map((point) => {
        const numOrNull = (value: number | null | undefined) =>
          value == null || Number.isNaN(Number(value)) ? null : Number(value);
        return {
          ...point,
          label: labelForTime(point.t),
          // Preserve null/gaps — never coerce unavailable metrics into fake zeros.
          queries: numOrNull(point.queries),
          readQueries: numOrNull(point.readQueries),
          writeQueries: numOrNull(point.writeQueries),
          rowsRead: numOrNull(point.rowsRead),
          rowsWritten: numOrNull(point.rowsWritten),
        };
      }),
    [metrics],
  );

  const hasMetricSeries = useMemo(
    () =>
      chartData.some(
        (point) =>
          point.queries != null ||
          point.readQueries != null ||
          point.writeQueries != null ||
          point.rowsRead != null ||
          point.rowsWritten != null,
      ),
    [chartData],
  );

  const metricsUnavailable =
    Boolean(metrics && metrics.wired === false) || (!hasMetricSeries && Boolean(metrics));

  const addQueryTab = useCallback(() => {
    setQueryTabs((tabs) => {
      const next = newQueryTab(tabs.length + 1);
      setActiveQueryTabId(next.id);
      return [...tabs, next];
    });
    setView("sql");
    setQueryResult(null);
  }, []);

  const formatActiveSql = useCallback(() => {
    setSql((prev) => formatSqlFallback(prev));
  }, [setSql]);

  const copyText = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Clipboard unavailable in this context.");
    }
  }, []);

  const pkColumns = schema?.columns.filter((column) => column.primaryKey) || [];
  const hasRowIdentity = Boolean(selectedRow && pkColumns.length && pkColumns.every((column) => selectedRow[column.name] !== undefined));

  const refreshActive = useCallback(async () => {
    if (!sourceId) return;
    setLoadingMain(true);
    setError(null);
    try {
      await Promise.all([
        loadSources(),
        loadMetrics(),
        loadTables(),
        selectedTable ? loadTable(selectedTable, page) : Promise.resolve(),
      ]);
    } finally {
      setLoadingMain(false);
    }
  }, [loadMetrics, loadSources, loadTable, loadTables, page, selectedTable, sourceId]);

  const runSql = useCallback(
    async (approval: { studio_approved?: boolean; destructive_confirmed?: boolean } = {}) => {
      if (!sourceId || !sql.trim()) return;
      setLoadingMain(true);
      setError(null);
      try {
        const result = await client.query(sourceId, { sql, ...approval });
        setQueryResult(result);
        if (approval.studio_approved) {
          await Promise.all([loadMetrics(), loadTables()]);
          if (selectedTable) await loadTable(selectedTable, page);
        }
      } catch (caught) {
        const details = caught as Error & {
          requires_approval?: boolean;
          requires_destructive_confirmation?: boolean;
        };
        if (details.requires_approval) {
          if (window.confirm("This SQL statement changes data. Run it against the selected database?")) {
            await runSql({ studio_approved: true });
          }
          return;
        }
        if (details.requires_destructive_confirmation) {
          if (
            window.confirm(
              "This SQL statement changes schema or can be destructive. Confirm execution?",
            )
          ) {
            await runSql({ studio_approved: true, destructive_confirmed: true });
          }
          return;
        }
        setError(errorText(caught));
      } finally {
        setLoadingMain(false);
      }
    },
    [client, loadMetrics, loadTable, loadTables, page, selectedTable, sourceId, sql],
  );

  const saveRow = useCallback(
    async (values: Record<string, unknown>) => {
      if (!sourceId || !selectedTable || !schema) return;
      setBusyMutation(true);
      setError(null);
      try {
        if (editMode === "insert") {
          const payload = Object.fromEntries(
            Object.entries(values).filter(([key, value]) => {
              const column = schema.columns.find((item) => item.name === key);
              return value !== "" || !(column?.defaultValue || (column?.primaryKey && /int/i.test(column.type)));
            }),
          );
          await client.insert(sourceId, selectedTable, payload);
        } else {
          if (!hasRowIdentity || !selectedRow) throw new Error("Every primary key field is required to edit rows safely.");
          const changed = Object.fromEntries(
            Object.entries(values).filter(([key, value]) => value !== selectedRow[key]),
          );
          if (Object.keys(changed).length) {
            await client.update(sourceId, selectedTable, changed,
              Object.fromEntries(pkColumns.map((column) => [column.name, selectedRow[column.name]])));
          }
        }
        setEditMode(null);
        await Promise.all([loadTable(selectedTable, page), loadMetrics()]);
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setBusyMutation(false);
      }
    },
    [client, editMode, hasRowIdentity, loadMetrics, loadTable, page, pkColumns, schema, selectedRow, selectedTable, sourceId],
  );

  const deleteRow = useCallback(async () => {
    if (!sourceId || !selectedTable || !hasRowIdentity || !selectedRow) return;
    if (!window.confirm(`Delete this row from ${tableKey(selectedTable)}? This cannot be undone.`)) return;
    setBusyMutation(true);
    setError(null);
    try {
      await client.delete(sourceId, selectedTable,
        Object.fromEntries(pkColumns.map((column) => [column.name, selectedRow[column.name]])));
      await Promise.all([loadTable(selectedTable, page), loadMetrics()]);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusyMutation(false);
    }
  }, [client, hasRowIdentity, loadMetrics, loadTable, page, pkColumns, selectedRow, selectedTable, sourceId]);

  if (loading) {
    return (
      <div className="db-editor db-loading">
        <Loader2 className="spin" size={22} />
        Loading database resources…
      </div>
    );
  }

  const cloudflareConnection = catalog?.connections?.cloudflare;
  const localConnection = catalog?.connections?.local_sqlite;

  if (!catalog && error) {
    const unauthorized = sourceLoadStatus === 401;
    return (
      <div className="db-editor db-empty" style={themeVars as React.CSSProperties}>
        <Database size={28} />
        <div className="db-eyebrow">AGENTSAM DATABASE</div>
        <h1>{unauthorized ? "Sign in to load database resources" : "Database sources could not be loaded"}</h1>
        <p>
          {unauthorized
            ? "Local Studio needs an authenticated user session before it can resolve that user's separate database provider connections."
            : error}
        </p>
        <div className="db-empty-actions">
          {unauthorized && onAuthenticate ? (
            <button className="db-button primary" type="button" onClick={onAuthenticate}>Sign in</button>
          ) : null}
          <button className="db-button secondary" type="button" onClick={() => void loadSources()}>Retry</button>
          {onOpenConnections ? (
            <button className="db-button secondary" type="button" onClick={onOpenConnections}>Connections</button>
          ) : null}
        </div>
        <small>Provider authorization remains separate from the Local Studio user session.</small>
      </div>
    );
  }

  if (!catalog?.sources.length) {
    return (
      <div className="db-editor db-empty" style={themeVars as React.CSSProperties}>
        <Database size={28} />
        <div className="db-eyebrow">AGENTSAM DATABASE</div>
        <h1>No authorized database resources yet</h1>
        <p>
          Connect your Cloudflare account (data pack) to discover D1 and Hyperdrive. Local SQLite
          attaches through AgentSam Local Studio / local runtime — never invented in the hosted browser.
        </p>
        <div className="db-empty-actions">
          <a
            className="db-button primary"
            href={cloudflareConnection?.connect_url || "/api/connections/cloudflare/start?packs=data&return_to=/database"}
          >
            Connect Cloudflare
          </a>
          <button className="db-button secondary" type="button" onClick={() => setAttachOpen(true)}>
            Attach Local SQLite
          </button>
          <button className="db-button secondary" type="button" onClick={onOpenConnections}>
            Connections
          </button>
        </div>
        {localConnection?.message ? <small>{localConnection.message}</small> : null}
        {attachOpen ? (
          <div className="db-modal-backdrop" role="dialog" aria-modal="true">
            <div className="db-modal">
              <header className="db-modal-header">
                <div>
                  <div className="db-eyebrow">LOCAL SQLITE</div>
                  <strong>Attach local database</strong>
                </div>
                <button type="button" className="db-icon-button" onClick={() => setAttachOpen(false)} aria-label="Close">
                  <X size={16} />
                </button>
              </header>
              <footer className="db-modal-actions">
                <button
                  type="button"
                  className="db-button primary"
                  disabled={busyMutation || !localHost}
                  onClick={() => void attachAgentsamLocal()}
                >
                  Open AgentSam local database
                </button>
              </footer>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      className="db-editor"
      data-provider={providerFamily(source)}
      data-compact={paneCompact || undefined}
      style={{
        ...(themeVars as React.CSSProperties),
        ["--db-rail-width" as string]: `${railWidth}px`,
        ["--db-sql-editor-frac" as string]: `minmax(160px, ${sqlSplitPct}%)`,
      }}
    >
      <header className="db-toolbar">
        <div className="db-provider-tabs" aria-label="Database providers">
          <button
            type="button"
            data-active={providerFamily(source) === "cloudflare" || undefined}
            data-capability={cloudflareCapability}
            onClick={() => selectProviderFamily("cloudflare")}
            title={
              cloudflareCapability === "available"
                ? "Cloudflare D1"
                : "Connect Cloudflare (data pack) to discover D1"
            }
          >
            <Cloud size={13} /> Cloudflare
          </button>
          <button
            type="button"
            data-active={providerFamily(source) === "supabase" || undefined}
            data-capability={supabaseCapability}
            onClick={() => selectProviderFamily("supabase")}
            title={
              supabaseCapability === "available"
                ? "Postgres via Hyperdrive"
                : "Configure Hyperdrive / Postgres connection"
            }
          >
            <ServerCog size={13} /> Supabase
          </button>
          <button
            type="button"
            data-active={providerFamily(source) === "local" || undefined}
            data-capability={localCapability}
            disabled={localCapability === "unavailable"}
            onClick={() => selectProviderFamily("local")}
            title={localConnection?.message || "Local SQLite (AgentSam runtime)"}
          >
            <Database size={13} /> Local
          </button>
        </div>

        {!paneCompact ? (
          <div className="db-range-tabs">
            {(["1h", "24h", "7d", "30d"] as const).map((item) => (
              <button
                key={item}
                type="button"
                data-active={range === item || undefined}
                onClick={() => setRange(item)}
              >
                {item}
              </button>
            ))}
          </div>
        ) : null}

        <select
          className="db-source-select"
          value={sourceId}
          onChange={(event) => setSourceId(event.target.value)}
          aria-label="Database source"
        >
          {(catalog?.sources || []).map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} · {providerLabel(item)}
            </option>
          ))}
        </select>

        <button type="button" className="db-button db-sql-launch"
          data-active={view === "sql" || undefined}
          onClick={() => setView("sql")}
          aria-label="Open SQL editor"
          aria-pressed={view === "sql"}
          title="Write and run SQL against the selected database"
        ><Code2 size={15} /> SQL Editor</button>
        <button className="db-icon-button" type="button" onClick={() => void refreshActive()} title="Refresh">
          <RefreshCw className={loadingMain ? "spin" : ""} size={15} />
        </button>

        {onAskAgentSam ? (
          <button
            className="db-button secondary"
            type="button"
            onClick={() =>
              onAskAgentSam({
                provider: source?.provider,
                sourceId: source?.id,
                sourceLabel: source?.label,
                engine: source?.engine,
                selectedTable: selectedTable ? tableKey(selectedTable) : null,
                view,
                sqlDraft: sql,
                currentError: error,
                writable: Boolean(source?.writable),
                range,
              })
            }
          >
            Ask AgentSam
          </button>
        ) : null}

        <button
          className="db-button primary db-explore"
          type="button"
          onClick={() => {
            if (view === "overview") void exploreData();
            else setView("overview");
          }}
        >
          <Table2 size={14} />
          {view === "overview" ? "Explore Data" : "Overview"}
        </button>
      </header>

      {source ? (
        <div className="db-source-meta" data-quiet="true">
          <span>{source.label}</span>
          <span>· {providerLabel(source)}</span>
          {metrics?.health?.latencyMs != null ? <span>· {metrics.health.latencyMs}ms</span> : null}
          <span className={source.writable ? "db-write-status write" : "db-write-status"}>{source.writable ? "CRUD" : "read only"}</span>
          {source.source_kind === "deployment_binding" || source.database_id?.startsWith("binding:") ? (
            <details style={{ marginLeft: 8 }}>
              <summary style={{ cursor: "pointer" }}>Binding details</summary>
              <code className="db-source-path" title={source.database_id || ""}>
                {source.database_id || source.path_hint || "deployment binding"}
              </code>
            </details>
          ) : source.database_id ? (
            <span className="db-chip">{`${source.database_id.slice(0, 8)}…`}</span>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="db-alert" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss"><X size={14} /></button>
        </div>
      ) : null}

      {view === "overview" ? (
        <main className="db-overview">
          <div className="db-kpis">
            <KpiCard
              label="Storage"
              value={storageDisplay(metrics, source)}
              sub={source?.engine || ""}
            />
            <KpiCard label="Total queries" value={formatCompact(metrics?.kpis?.queries)} sub={range} />
            <KpiCard label="Rows read" value={formatCompact(metrics?.kpis?.rowsRead)} sub={range} />
            <KpiCard label="Rows written" value={formatCompact(metrics?.kpis?.rowsWritten)} sub={range} />
            <KpiCard
              label="Tables"
              value={formatCompact(metrics?.kpis?.tables ?? source?.num_tables)}
              sub={source?.database_name || source?.label}
            />
            {metrics?.kpis?.connections != null ? (
              <KpiCard
                label="Connections"
                value={formatCompact(metrics.kpis.connections)}
                sub={
                  metrics.capacity?.connectionsMax
                    ? `of ${metrics.capacity.connectionsMax}`
                    : "live"
                }
              />
            ) : null}
          </div>

          {metricsUnavailable ? (
            <div className="db-metrics-empty" role="status" data-metrics-wired="false">
              <span>
                {metrics?.warning ||
                  "Analytics are not reported for this database yet. Table browsing and SQL still work."}
              </span>
              <button type="button" className="db-button primary" onClick={() => void exploreData()}>
                <Table2 size={14} /> Browse Tables
              </button>
            </div>
          ) : (
            <>
              <MetricChart title="Total queries" data={chartData} first="queries" />
              <div className="db-chart-grid">
                <MetricChart title="Read / write queries" data={chartData} first="readQueries" second="writeQueries" />
                <MetricChart title="Rows read / written" data={chartData} first="rowsRead" second="rowsWritten" />
              </div>
            </>
          )}

          <section className="db-provider-health">
            <div>
              <div className="db-eyebrow">PROVIDER</div>
              <strong>{providerLabel(source)}</strong>
            </div>
            <div>
              <div className="db-eyebrow">HEALTH</div>
              <strong>{metrics?.health?.hyperdrive || metrics?.health?.status || "connected"}</strong>
            </div>
            <div>
              <div className="db-eyebrow">WRITE ACCESS</div>
              <strong>{source?.writable ? "Enabled" : "Read only"}</strong>
            </div>
            <div>
              <div className="db-eyebrow">METRIC SOURCE</div>
              <strong>
                {providerFamily(source) === "cloudflare"
                  ? "Cloudflare GraphQL"
                  : providerFamily(source) === "supabase"
                    ? "Postgres + local snapshots"
                    : "Local runtime"}
              </strong>
            </div>
          </section>
        </main>
      ) : (
        <main className="db-workspace">
          <aside className="db-table-rail">
            <div className="db-rail-toolbar">
              <div className="db-table-search">
                <input
                  value={tableSearch}
                  onChange={(event) => setTableSearch(event.target.value)}
                  placeholder="Search…"
                  aria-label="Search tables"
                />
              </div>
              <button
                type="button"
                className="db-icon-button"
                title={tableFilterKind === "all" ? "Filter tables" : `Filter: ${tableFilterKind}`}
                aria-label="Filter tables"
                onClick={() =>
                  setTableFilterKind((current) =>
                    current === "all" ? "table" : current === "table" ? "view" : "all",
                  )
                }
              >
                <Filter size={14} />
                {tableFilterKind !== "all" ? <span style={{ fontSize: 10 }}>{tableFilterKind === "table" ? "1" : "2"}</span> : null}
              </button>
              <button
                type="button"
                className="db-icon-button"
                title="Refresh tables"
                aria-label="Refresh tables"
                onClick={() => void loadTables()}
              >
                <RefreshCw className={loadingMain ? "spin" : ""} size={14} />
              </button>
              <button
                type="button"
                className="db-button secondary"
                title="Create table requires an authorized DDL migration flow"
                disabled
                onClick={() => setError("Create table is unavailable until an authorized DDL flow is wired for this source.")}
              >
                <Plus size={13} /> New
              </button>
            </div>
            <div className="db-table-list">
              {filteredTables.map((table) => (
                <button
                  key={tableKey(table)}
                  type="button"
                  data-active={selectedTable && tableKey(selectedTable) === tableKey(table) || undefined}
                  onClick={() => {
                    setSelectedTable(table);
                    setPage(1);
                    setView("data");
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setCtxMenu({ x: event.clientX, y: event.clientY, table });
                  }}
                >
                  <Rows3 size={13} />
                  <span title={tableKey(table)}>{tableKey(table)}</span>
                  <small>{table.kind || ""}</small>
                </button>
              ))}
            </div>
          </aside>
          <div
            className="db-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize table explorer"
            onMouseDown={(event) => {
              event.preventDefault();
              resizingRail.current = true;
            }}
          />

          <section className="db-editor-main">
            <nav className="db-editor-tabs">
              {(["data", "sql", "schema"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  data-active={view === item || undefined}
                  disabled={item !== "sql" && !selectedTable}
                  onClick={() => setView(item)}
                >
                  {item === "sql" ? "SQL Editor" : item === "data" ? "Table Data" : "Schema"}
                </button>
              ))}
              <span className="db-tab-spacer" />
              {view === "data" && selectedTable ? (
                <>
                  <button type="button" onClick={() => setEditMode("insert")} disabled={!source?.writable}>
                    <Plus size={13} /> Add row
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode("edit")}
                    disabled={!source?.writable || !hasRowIdentity}
                  >
                    Edit row
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void deleteRow()}
                    disabled={!source?.writable || !hasRowIdentity || busyMutation}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </>
              ) : null}
            </nav>

            {view === "sql" ? (
              <div className="db-sql-view" data-sql-workspace="true">
                <nav className="db-query-tabs" aria-label="Query tabs">
                  {queryTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      data-active={tab.id === activeQueryTabId || undefined}
                      onClick={() => {
                        setActiveQueryTabId(tab.id);
                        setQueryResult(null);
                      }}
                    >
                      <Database size={12} /> {tab.title}
                    </button>
                  ))}
                  <button type="button" onClick={addQueryTab} title="New query tab">
                    <Plus size={13} /> New
                  </button>
                  <span className="db-tab-spacer" />
                  <button
                    type="button"
                    disabled={!selectedTable}
                    onClick={() => {
                      if (!selectedTable) return;
                      setSql(
                        "SELECT * FROM " +
                          (selectedTable.schema ? '"' + selectedTable.schema.replace(/"/g, '""') + '".' : "") +
                          '"' +
                          selectedTable.name.replace(/"/g, '""') +
                          '" LIMIT 100;',
                      );
                      setQueryResult(null);
                    }}
                  >
                    Query selected table
                  </button>
                </nav>
                <div className="db-sql-split">
                  <div className="db-sql-editor-pane">
                    <div className="db-sql-monaco">
                      <SqlMonacoEditor
                        value={sql}
                        onChange={setSql}
                        onRun={() => {
                          if (sql.trim() && !loadingMain) void runSql();
                        }}
                        theme={providerFamily(source) === "cloudflare" ? "light" : "vs-dark"}
                        height="100%"
                      />
                    </div>
                    <div className="db-sql-actions">
                      <span id="db-sql-help">
                        {source?.writable
                          ? "Writes require confirmation. Destructive schema changes require a second confirmation."
                          : "Read-only source."}
                      </span>
                      <button type="button" className="db-button secondary" onClick={formatActiveSql}>
                        Format ⌥F
                      </button>
                      <button
                        type="button"
                        className="db-button primary"
                        disabled={!sql.trim() || loadingMain}
                        onClick={() => void runSql()}
                      >
                        {loadingMain ? <Loader2 className="spin" size={14} /> : <Play size={13} />}
                        Run · ⌘ Enter
                      </button>
                    </div>
                  </div>
                  <div
                    className="db-sql-resize"
                    role="separator"
                    aria-orientation="horizontal"
                    aria-label="Resize SQL results"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      resizingSql.current = true;
                    }}
                  />
                  <div className="db-query-result">
                    {queryResult ? (
                      <>
                        <div className="db-result-meta">
                          <span>
                            {queryResult.rowCount ?? queryResult.objects?.length ?? 0} rows
                            {queryResult.durationMs != null ? ` · ${queryResult.durationMs}ms` : ""}
                            {queryResult.rowsRead != null ? ` · ${queryResult.rowsRead} read` : ""}
                            {queryResult.rowsWritten != null ? ` · ${queryResult.rowsWritten} written` : ""}
                          </span>
                        </div>
                        <div className="db-grid-scroll">
                          <table className="db-data-grid">
                            <thead>
                              <tr>{(queryResult.columns || []).map((column) => <th key={column}>{column}</th>)}</tr>
                            </thead>
                            <tbody>
                              {(queryResult.objects || []).map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                  {(queryResult.columns || []).map((column) => (
                                    <td key={column}>
                                      {row[column] == null ? <em>NULL</em> : typeof row[column] === "object" ? JSON.stringify(row[column]) : String(row[column])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="db-editor-empty">Run a query to see results</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {view === "schema" && schema ? (
              <div className="db-schema-view">
                <section className="db-schema-card">
                  <div className="db-eyebrow">COLUMNS</div>
                  <table className="db-data-grid">
                    <thead>
                      <tr><th>Name</th><th>Type</th><th>Nullable</th><th>Key</th><th>Default</th></tr>
                    </thead>
                    <tbody>
                      {schema.columns.map((column) => (
                        <tr key={column.name}>
                          <td>{column.name}</td>
                          <td>{column.type}</td>
                          <td>{column.nullable ? "yes" : "no"}</td>
                          <td>{column.primaryKey ? "PRIMARY" : ""}</td>
                          <td>{column.defaultValue || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
                {schema.indexes?.length ? (
                  <section className="db-schema-card">
                    <div className="db-eyebrow">INDEXES</div>
                    {schema.indexes.map((index) => (
                      <pre key={index.name}>{index.sql || index.name}</pre>
                    ))}
                  </section>
                ) : null}
                {schema.createSql ? (
                  <section className="db-schema-card">
                    <div className="db-eyebrow">CREATE SQL</div>
                    <pre>{schema.createSql}</pre>
                  </section>
                ) : null}
              </div>
            ) : null}

            {view === "data" ? (
              <div className="db-data-view">
                {rows && selectedTable ? (
                  <>
                    <div className="db-result-meta">
                      <span>{tableKey(selectedTable)}</span>
                      <span>{rows.total.toLocaleString()} rows</span>
                      {pkColumns.length ? <span>PK: {pkColumns.map((column) => column.name).join(", ")}</span> : <span className="warn">No PK · edits disabled</span>}
                    </div>
                    <div className="db-grid-scroll">
                      <table className="db-data-grid">
                        <thead>
                          <tr>
                            {schema?.columns.map((column) => <th key={column.name}>{column.name}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {rows.rows.map((row, rowIndex) => {
                            const selected = selectedRow === row;
                            return (
                              <tr
                                key={rowIndex}
                                data-selected={selected || undefined}
                                onClick={() => setSelectedRow(row)}
                              >
                                {schema?.columns.map((column) => (
                                  <td key={column.name}>
                                    {row[column.name] == null ? (
                                      <em>NULL</em>
                                    ) : typeof row[column.name] === "object" ? (
                                      JSON.stringify(row[column.name])
                                    ) : (
                                      String(row[column.name])
                                    )}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <footer className="db-pagination">
                      <button
                        type="button"
                        disabled={rows.page <= 1 || loadingMain}
                        onClick={() => void loadTable(selectedTable, rows.page - 1)}
                      >
                        <ChevronLeft size={14} /> Previous
                      </button>
                      <span>Page {rows.page} of {rows.total_pages}</span>
                      <button
                        type="button"
                        disabled={rows.page >= rows.total_pages || loadingMain}
                        onClick={() => void loadTable(selectedTable, rows.page + 1)}
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </footer>
                  </>
                ) : (
                  <div className="db-editor-empty">
                    {loadingMain ? <Loader2 className="spin" size={18} /> : <Table2 size={22} />}
                    {loadingMain ? "Loading table…" : "Select a table"}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </main>
      )}

      {editMode && selectedTable && schema ? (
        <EditorModal
          mode={editMode}
          table={selectedTable}
          columns={schema.columns}
          initial={editMode === "edit" ? selectedRow || {} : {}}
          busy={busyMutation}
          onClose={() => setEditMode(null)}
          onSave={saveRow}
        />
      ) : null}

      {attachOpen ? (
        <div className="db-modal-backdrop" role="dialog" aria-modal="true">
          <div className="db-modal">
            <header className="db-modal-header">
              <div>
                <div className="db-eyebrow">LOCAL SQLITE</div>
                <strong>Attach local database</strong>
              </div>
              <button type="button" className="db-icon-button" onClick={() => setAttachOpen(false)} aria-label="Close">
                <X size={16} />
              </button>
            </header>
            <div className="db-modal-fields">
              <p style={{ margin: 0, color: "var(--db-muted)", fontSize: 13, lineHeight: 1.5 }}>
                Local SQLite is machine-runtime only. This opens your project{" "}
                <code>.agentsam/data/agentsam.sqlite</code> (same DB as <code>agentsam db</code>).
                Hosted browsers without Local Studio show an attach CTA — never a fake source.
              </p>
            </div>
            <footer className="db-modal-actions">
              <button type="button" className="db-button secondary" onClick={() => setAttachOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="db-button primary"
                disabled={busyMutation || !localHost}
                onClick={() => void attachAgentsamLocal()}
              >
                {busyMutation ? <Loader2 className="spin" size={14} /> : null}
                Open AgentSam local database
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {ctxMenu ? (
        <div
          className="db-ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setSelectedTable(ctxMenu.table);
              setPage(1);
              setView("data");
              setCtxMenu(null);
            }}
          >
            <Table2 size={13} /> Explore Data
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void copyText(tableKey(ctxMenu.table));
              setCtxMenu(null);
            }}
          >
            <Copy size={13} /> Copy table name
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              void (async () => {
                try {
                  const payload = await client.schema(sourceId, ctxMenu.table);
                  const createSql = payload.schema?.createSql || JSON.stringify(payload.schema?.columns || [], null, 2);
                  await copyText(createSql);
                } catch (caught) {
                  setError(errorText(caught));
                } finally {
                  setCtxMenu(null);
                }
              })();
            }}
          >
            <Copy size={13} /> Copy table schema
          </button>
        </div>
      ) : null}
    </div>
  );
}
