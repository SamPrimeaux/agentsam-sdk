import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Code2,
  Copy,
  Filter,
  Play,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Rows3,
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
import { DatabaseInventory } from "./DatabaseInventory";
import { DatabaseManagement } from "./DatabaseManagement";
import { SchemaEditor } from "./SchemaEditor";

type View = "overview" | "data" | "sql" | "schema" | "time-travel" | "settings";
type TableTabState = {
  schema: DatabaseSchemaInfo | null;
  rows: DatabaseRowsResponse | null;
  page: number;
  selectedRow: Record<string, unknown> | null;
  view: "data" | "schema";
  sort?: string;
  dir?: "asc" | "desc";
  filter?: string;
  scrollTop?: number;
  scrollLeft?: number;
};
type EditMode = "insert" | "edit";

import type { LocalDatabaseHost } from "./local-host";
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
  if (
    source.provider.includes("supabase") ||
    source.provider.includes("postgres")
  )
    return "supabase";
  if (source.provider.includes("local")) return "local";
  return "other";
}

function providerLabel(source?: DatabaseSource | null) {
  const family = providerFamily(source);
  if (family === "cloudflare") return "Cloudflare";
  if (family === "supabase")
    return source?.accelerator === "hyperdrive"
      ? "Supabase · Hyperdrive"
      : "Supabase";
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
  if (value == null || Number.isNaN(Number(value)))
    return opts?.unknownLabel || "Not reported";
  const bytes = Number(value);
  if (bytes < 0) return opts?.unknownLabel || "Not reported";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
}

function storageDisplay(
  metrics: DatabaseMetricsResponse | null,
  source: DatabaseSource | null,
) {
  const fromMetrics = metrics?.kpis?.storage;
  if (fromMetrics != null && Number(fromMetrics) > 0)
    return formatBytes(fromMetrics);
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
  return error instanceof Error
    ? error.message
    : String(error || "Request failed");
}

function normalizeFormValue(value: string, column: DatabaseColumnInfo) {
  // NULL is an explicit field control; an empty string remains an empty string.
  const type = column.type.toLowerCase();
  if (/json/.test(type)) return JSON.parse(value);
  if (/\b(bool|boolean)\b/.test(type)) {
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
  }
  if (
    /\b(int|integer|bigint|smallint|numeric|decimal|real|double|float)\b/.test(
      type,
    )
  ) {
    const n = Number(value);
    if (Number.isFinite(n) && value.trim() !== "") return n;
  }
  return value;
}

function KpiCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
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
    return (
      (a != null && !Number.isNaN(Number(a))) ||
      (b != null && !Number.isNaN(Number(b)))
    );
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
            <BarChart
              data={data}
              margin={{ top: 16, right: 18, bottom: 4, left: 0 }}
            >
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
              <Bar
                dataKey={first}
                fill="var(--db-accent)"
                radius={[3, 3, 0, 0]}
              />
              {second ? (
                <Bar
                  dataKey={second}
                  fill="var(--db-accent-2)"
                  radius={[3, 3, 0, 0]}
                />
              ) : null}
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

function newQueryTab(index: number, sql = ""): QueryTab {
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
        initial[column.name] == null
          ? ""
          : typeof initial[column.name] === "object"
            ? JSON.stringify(initial[column.name])
            : String(initial[column.name]),
      ]),
    ),
  );

  const [nulls, setNulls] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      columns.map((column) => [
        column.name,
        mode === "edit" && initial[column.name] === null,
      ]),
    ),
  );
  const [formError, setFormError] = useState("");
  return (
    <div
      className="db-row-inspector"
      role="region"
      aria-label={mode === "insert" ? "Add row" : "Edit row"}
    >
      <div className="db-modal">
        <header className="db-modal-header">
          <div>
            <div className="db-eyebrow">
              {mode === "insert" ? "INSERT ROW" : "UPDATE ROW"}
            </div>
            <strong>{tableKey(table)}</strong>
          </div>
          <button
            type="button"
            className="db-icon-button"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="db-modal-fields">
          {formError ? <p role="alert">{formError}</p> : null}
          {columns.map((column) => (
            <label key={column.name} className="db-field">
              <span>
                {column.name}
                <small>
                  {column.type || "value"}
                  {column.primaryKey ? " · PK" : ""}
                </small>
              </span>
              {/text|json|blob/i.test(column.type) &&
              (draft[column.name] || "").length > 120 ? (
                <textarea
                  rows={4}
                  spellCheck={false}
                  value={draft[column.name] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [column.name]: event.target.value,
                    }))
                  }
                />
              ) : (
                <input
                  value={draft[column.name] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [column.name]: event.target.value,
                    }))
                  }
                  disabled={nulls[column.name]}
                  placeholder={
                    column.defaultValue
                      ? `default: ${column.defaultValue}`
                      : "value"
                  }
                />
              )}
              {column.nullable ? (
                <span>
                  <input
                    type="checkbox"
                    checked={nulls[column.name] || false}
                    onChange={(event) =>
                      setNulls((current) => ({
                        ...current,
                        [column.name]: event.target.checked,
                      }))
                    }
                  />{" "}
                  NULL
                </span>
              ) : null}
            </label>
          ))}
        </div>
        <footer className="db-modal-actions">
          <button
            type="button"
            className="db-button secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="db-button primary"
            disabled={busy}
            onClick={() => {
              try {
                setFormError("");
                void onSave(
                  Object.fromEntries(
                    columns
                      .filter((column) => column.name in draft)
                      .map((column) => [
                        column.name,
                        nulls[column.name]
                          ? null
                          : normalizeFormValue(
                              draft[column.name] ?? "",
                              column,
                            ),
                      ]),
                  ),
                );
              } catch (caught) {
                setFormError(errorText(caught));
              }
            }}
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
  const client = useMemo(
    () => providedClient || createDatabaseStudioClient(),
    [providedClient],
  );
  const [catalog, setCatalog] = useState<DatabaseSourcesResponse | null>(null);
  const [sourceId, setSourceId] = useState(initialSourceId || "");
  const [range, setRange] = useState<"1h" | "24h" | "7d" | "30d">("24h");
  const [view, setView] = useState<View>("overview");
  const [metrics, setMetrics] = useState<DatabaseMetricsResponse | null>(null);
  const [tables, setTables] = useState<DatabaseTableInfo[]>([]);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<DatabaseTableInfo | null>(
    null,
  );
  const [tableTabs, setTableTabs] = useState<DatabaseTableInfo[]>([]);
  const [tableStates, setTableStates] = useState<Record<string, TableTabState>>(
    {},
  );
  const selectedKey = selectedTable ? tableKey(selectedTable) : "";
  const tableState = tableStates[selectedKey];
  const schema = tableState?.schema || null;
  const rows = tableState?.rows || null;
  const page = tableState?.page || 1;
  const selectedRow = tableState?.selectedRow || null;
  const updateTableState = useCallback(
    (key: string, patch: Partial<TableTabState>) => {
      setTableStates((states) => ({
        ...states,
        [key]: {
          ...(states[key] || {
            schema: null,
            rows: null,
            page: 1,
            selectedRow: null,
            view: "data" as const,
          }),
          ...patch,
        },
      }));
    },
    [],
  );
  const setPage = (value: number) =>
    updateTableState(selectedKey, { page: value });
  const setSelectedRow = (value: Record<string, unknown> | null) =>
    updateTableState(selectedKey, { selectedRow: value });
  const [cell, setCell] = useState<{
    row: number;
    column: string;
    editing: boolean;
    value: string;
    isNull: boolean;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DatabaseTableInfo | null>(
    null,
  );
  const [confirmation, setConfirmation] = useState("");
  const sourceRef = useRef(sourceId);
  sourceRef.current = sourceId;
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>(() => {
    const first = newQueryTab(1);
    return [first];
  });
  const [activeQueryTabId, setActiveQueryTabId] = useState(
    () => queryTabs[0]?.id || "",
  );
  const activeQueryTab =
    queryTabs.find((tab) => tab.id === activeQueryTabId) ||
    queryTabs[0] ||
    null;
  const sql = activeQueryTab?.sql ?? "";
  const setSql = useCallback(
    (next: string | ((prev: string) => string)) => {
      setQueryTabs((tabs) => {
        const targetId = activeQueryTabId || tabs[0]?.id;
        return tabs.map((tab) => {
          if (tab.id !== targetId) return tab;
          const value = typeof next === "function" ? next(tab.sql) : next;
          return { ...tab, sql: value };
        });
      });
    },
    [activeQueryTabId],
  );
  const [queryResults, setQueryResults] = useState<
    Record<string, DatabaseQueryResponse | null>
  >({});
  const queryResult = queryResults[activeQueryTabId] || null;
  const setQueryResult = useCallback(
    (result: DatabaseQueryResponse | null) => {
      setQueryResults((results) => ({
        ...results,
        [activeQueryTabId]: result,
      }));
    },
    [activeQueryTabId],
  );
  const [loading, setLoading] = useState(true);
  const [loadingMain, setLoadingMain] = useState(false);
  const [busyMutation, setBusyMutation] = useState(false);
  const [editMode, setEditMode] = useState<EditMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceLoadStatus, setSourceLoadStatus] = useState<number | null>(null);
  const [createTableOpen, setCreateTableOpen] = useState(false);
  const [createTableName, setCreateTableName] = useState("");
  const [createTableColumns, setCreateTableColumns] = useState<
    Array<{
      name: string;
      type: string;
      nullable: boolean;
      primaryKey: boolean;
    }>
  >([{ name: "id", type: "INTEGER", nullable: false, primaryKey: true }]);
  const [createTablePreview, setCreateTablePreview] = useState<string>("");
  const [railWidth, setRailWidth] = useState(() => {
    try {
      return Math.max(
        160,
        Math.min(
          420,
          Number(localStorage.getItem("database-editor.rail-width")) ||
            (compact ? 200 : 250),
        ),
      );
    } catch {
      return compact ? 200 : 250;
    }
  });
  const [railCollapsed, setRailCollapsed] = useState(false);
  useEffect(() => {
    try {
      localStorage.setItem("database-editor.rail-width", String(railWidth));
    } catch {
      /* Storage may be unavailable. */
    }
  }, [railWidth]);
  const tableLoads = useRef<Record<string, number>>({});
  const [sqlSplitPct, setSqlSplitPct] = useState(48);
  const [paneCompact, setPaneCompact] = useState(Boolean(compact));
  const [tableFilterKind, setTableFilterKind] = useState<
    "all" | "table" | "view"
  >("all");
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    table: DatabaseTableInfo;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tableGridRef = useRef<HTMLDivElement | null>(null);
  const tableScrolls = useRef<Record<string, { top: number; left: number }>>({});
  useEffect(() => {
    const grid = tableGridRef.current;
    const saved = tableScrolls.current[sourceId + ":" + selectedKey];
    if (grid) { grid.scrollTop = saved?.top || 0; grid.scrollLeft = saved?.left || 0; }
  }, [sourceId, selectedKey, view, Boolean(rows)]);

  const resizingRail = useRef(false);
  const resizingSql = useRef(false);

  const source = useMemo(
    () => catalog?.sources.find((item) => item.id === sourceId) || null,
    [catalog, sourceId],
  );

  // Presentation follows the host theme; changing providers never changes appearance.
  const themeVars = useMemo(() => ({}), []);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSourceLoadStatus(null);
    try {
      const next = await client.listSources();
      setCatalog(next);
      setSourceLoadStatus(null);
      setSourceId((current) => {
        if (current && next.sources.some((item) => item.id === current))
          return current;
        if (
          initialSourceId &&
          next.sources.some((item) => item.id === initialSourceId)
        )
          return initialSourceId;
        return "";
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
    if (!activeQueryTabId && queryTabs[0]?.id)
      setActiveQueryTabId(queryTabs[0].id);
  }, [activeQueryTabId, queryTabs]);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof ResizeObserver === "undefined") {
      setPaneCompact(Boolean(compact));
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width || 0;
      setPaneCompact(Boolean(compact) || (width > 0 && width < 760));
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
        const sqlView = rootRef.current.querySelector(
          ".db-sql-split",
        ) as HTMLElement | null;
        if (sqlView) {
          const rect = sqlView.getBoundingClientRect();
          const pct =
            ((event.clientY - rect.top) / Math.max(rect.height, 1)) * 100;
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

  const loadMetrics = useCallback(async () => {
    if (!sourceId) return;
    try {
      const next = await client.metrics(sourceId, range);
      if (sourceRef.current === sourceId) setMetrics(next);
    } catch (caught) {
      setError(errorText(caught));
    }
  }, [client, range, sourceId]);

  const loadTables = useCallback(async () => {
    if (!sourceId) return;
    setLoadingMain(true);
    try {
      const next = await client.listTables(sourceId);
      if (sourceRef.current !== sourceId) return;
      setTables(next.tables || []);
      setSelectedTable((current) =>
        current &&
        next.tables.some((item) => tableKey(item) === tableKey(current))
          ? current
          : null,
      );
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
    setTableTabs([]);
    setTableStates({});
    setCell(null);
    setEditMode(null);
    setCtxMenu(null);
    setDeleteTarget(null);
    setError(null);
    const first = newQueryTab(1);
    setQueryTabs([first]);
    setActiveQueryTabId(first.id);
    setQueryResults({});
    setView("overview");
    if (!sourceId) return;
    void loadTables();
  }, [sourceId]); // Scope every tab and draft to its database.

  useEffect(() => {
    if (sourceId) void loadMetrics();
  }, [range, sourceId, loadMetrics]);

  const loadTable = useCallback(
    async (table = selectedTable, requestedPage = page) => {
      if (!sourceId || !table) return;
      const key = sourceId + ":" + tableKey(table);
      const requestId = (tableLoads.current[key] || 0) + 1;
      tableLoads.current[key] = requestId;
      setLoadingMain(true);
      setError(null);
      try {
        const [schemaPayload, rowsPayload] = await Promise.all([
          client.schema(sourceId, table),
          client.rows(sourceId, table, {
            page: requestedPage,
            limit: compact ? 25 : 50,
            sort: tableStates[tableKey(table)]?.sort,
            dir: tableStates[tableKey(table)]?.dir,
            filter: tableStates[tableKey(table)]?.filter,
          }),
        ]);
        if (
          sourceRef.current !== sourceId ||
          tableLoads.current[key] !== requestId
        )
          return;
        updateTableState(tableKey(table), {
          schema: schemaPayload.schema,
          rows: rowsPayload,
          page: rowsPayload.page,
          selectedRow: null,
        });
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setLoadingMain(false);
      }
    },
    [client, compact, page, selectedTable, sourceId, tableStates],
  );

  useEffect(() => {
    if (selectedTable)
      void loadTable(
        selectedTable,
        tableStates[tableKey(selectedTable)]?.page || 1,
      );
  }, [
    selectedTable,
    sourceId,
    tableState?.sort,
    tableState?.dir,
    tableState?.filter,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const exploreData = useCallback(async () => {
    setView("sql");
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
    // Console starts in a blank Query tab; table selection is always explicit.
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
    Boolean(metrics && metrics.wired === false) ||
    (!hasMetricSeries && Boolean(metrics));

  const addQueryTab = useCallback(() => {
    setQueryTabs((tabs) => {
      const next = newQueryTab(tabs.length + 1);
      setActiveQueryTabId(next.id);
      return [...tabs, next];
    });
    setView("sql");
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

  const openTable = (table: DatabaseTableInfo, mode?: "data" | "schema") => {
    setTableTabs((tabs) =>
      tabs.some((item) => tableKey(item) === tableKey(table))
        ? tabs
        : [...tabs, table],
    );
    setSelectedTable(table);
    setView(mode || tableStates[tableKey(table)]?.view || "data");
    setCell(null);
  };
  const closeTable = (table: DatabaseTableInfo) => {
    const key = tableKey(table);
    setTableTabs((tabs) => tabs.filter((item) => tableKey(item) !== key));
    setTableStates((states) => {
      const next = { ...states };
      delete next[key];
      return next;
    });
    if (selectedKey === key && view !== "sql") {
      setSelectedTable(null);
      setView("sql");
    }
  };
  const pkColumns = schema?.columns.filter((column) => column.primaryKey) || [];
  const hasRowIdentity = Boolean(
    selectedRow &&
    pkColumns.length &&
    pkColumns.every((column) => selectedRow[column.name] != null),
  );

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
  }, [
    loadMetrics,
    loadSources,
    loadTable,
    loadTables,
    page,
    selectedTable,
    sourceId,
  ]);

  const runSql = useCallback(
    async (
      approval: {
        studio_approved?: boolean;
        destructive_confirmed?: boolean;
      } = {},
    ) => {
      if (!sourceId || !sql.trim()) return;
      setLoadingMain(true);
      setError(null);
      try {
        const result = await client.query(sourceId, { sql, ...approval });
        if (sourceRef.current !== sourceId) return;
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
          if (
            window.confirm(
              "This SQL statement changes data. Run it against the selected database?",
            )
          ) {
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
            await runSql({
              studio_approved: true,
              destructive_confirmed: true,
            });
          }
          return;
        }
        setError(errorText(caught));
      } finally {
        setLoadingMain(false);
      }
    },
    [
      client,
      loadMetrics,
      loadTable,
      loadTables,
      page,
      selectedTable,
      sourceId,
      sql,
      activeQueryTabId,
      setQueryResult,
    ],
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
              return (
                value !== "" ||
                !(
                  column?.defaultValue ||
                  (column?.primaryKey && /int/i.test(column.type))
                )
              );
            }),
          );
          await client.insert(sourceId, selectedTable, payload);
        } else {
          if (!hasRowIdentity || !selectedRow)
            throw new Error(
              "Every primary key field is required to edit rows safely.",
            );
          const changed = Object.fromEntries(
            Object.entries(values).filter(
              ([key, value]) => value !== selectedRow[key],
            ),
          );
          if (Object.keys(changed).length) {
            await client.update(
              sourceId,
              selectedTable,
              changed,
              Object.fromEntries(
                pkColumns.map((column) => [
                  column.name,
                  selectedRow[column.name],
                ]),
              ),
            );
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
    [
      client,
      editMode,
      hasRowIdentity,
      loadMetrics,
      loadTable,
      page,
      pkColumns,
      schema,
      selectedRow,
      selectedTable,
      sourceId,
    ],
  );

  const deleteRow = useCallback(async () => {
    if (!sourceId || !selectedTable || !hasRowIdentity || !selectedRow) return;
    if (
      !window.confirm(
        `Delete this row from ${tableKey(selectedTable)}? This cannot be undone.`,
      )
    )
      return;
    setBusyMutation(true);
    setError(null);
    try {
      await client.delete(
        sourceId,
        selectedTable,
        Object.fromEntries(
          pkColumns.map((column) => [column.name, selectedRow[column.name]]),
        ),
      );
      await Promise.all([loadTable(selectedTable, page), loadMetrics()]);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusyMutation(false);
    }
  }, [
    client,
    hasRowIdentity,
    loadMetrics,
    loadTable,
    page,
    pkColumns,
    selectedRow,
    selectedTable,
    sourceId,
  ]);

  const commitCell = async () => {
    if (
      !cell?.editing ||
      !selectedTable ||
      !schema ||
      !rows ||
      !source?.writable
    )
      return;
    const row = rows.rows[cell.row];
    const column = schema.columns.find((item) => item.name === cell.column);
    if (
      !row ||
      !column ||
      !pkColumns.length ||
      pkColumns.some((key) => row[key.name] == null)
    )
      return;
    setBusyMutation(true);
    try {
      const value = cell.isNull
        ? null
        : normalizeFormValue(cell.value, { ...column, nullable: false });
      await client.update(
        sourceId,
        selectedTable,
        { [column.name]: value },
        Object.fromEntries(pkColumns.map((key) => [key.name, row[key.name]])),
      );
      setCell(null);
      await loadTable(selectedTable, page);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusyMutation(false);
    }
  };

  if (loading && !catalog) {
    return (
      <div className="db-editor db-loading">
        <Loader2 className="spin" size={22} />
        Loading database resources…
      </div>
    );
  }

  if (!catalog && error) {
    const unauthorized = sourceLoadStatus === 401;
    return (
      <div
        className="db-editor db-empty"
        style={themeVars as React.CSSProperties}
      >
        <Database size={28} />
        <div className="db-eyebrow">AGENTSAM DATABASE</div>
        <h1>
          {unauthorized
            ? "Sign in to load database resources"
            : "Database sources could not be loaded"}
        </h1>
        <p>
          {unauthorized
            ? "Local Studio needs an authenticated user session before it can resolve that user's separate database provider connections."
            : error}
        </p>
        <div className="db-empty-actions">
          {unauthorized && onAuthenticate ? (
            <button
              className="db-button primary"
              type="button"
              onClick={onAuthenticate}
            >
              Sign in
            </button>
          ) : null}
          <button
            className="db-button secondary"
            type="button"
            onClick={() => void loadSources()}
          >
            Retry
          </button>
          {onOpenConnections ? (
            <button
              className="db-button secondary"
              type="button"
              onClick={onOpenConnections}
            >
              Connections
            </button>
          ) : null}
        </div>
        <small>
          Provider authorization remains separate from the Local Studio user
          session.
        </small>
      </div>
    );
  }

  if (!sourceId) {
    return (
      <DatabaseInventory
        client={client}
        catalog={catalog}
        onOpen={setSourceId}
        onRefresh={loadSources}
        onConnections={onOpenConnections}
        localHost={localHost}
      />
    );
  }

  return (
    <div
      ref={rootRef}
      className="db-editor"
      data-provider={providerFamily(source)}
      data-compact={paneCompact || undefined}
      data-rail-collapsed={railCollapsed || undefined}
      style={{
        ...(themeVars as React.CSSProperties),
        ["--db-rail-width" as string]: `${railWidth}px`,
        ["--db-sql-editor-frac" as string]: `minmax(160px, ${sqlSplitPct}%)`,
      }}
    >
      <header className="db-toolbar">
        <button
          type="button"
          className="db-button secondary"
          onClick={() => setSourceId("")}
        >
          <ChevronLeft size={14} /> Databases
        </button>
        <span className="db-breadcrumb">{source?.label || "Database"}</span>
        {["data", "sql", "schema"].includes(view) ? (
          <button
            className="db-button secondary"
            aria-expanded={!railCollapsed}
            onClick={() => setRailCollapsed((value) => !value)}
          >
            <Table2 size={14} /> Tables
          </button>
        ) : null}
        <span className="db-tab-spacer" />
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
        <select
          className="db-source-select db-range-select"
          value={range}
          onChange={(event) => setRange(event.target.value as typeof range)}
          aria-label="Reporting period"
        >
          <option value="1h">Last hour</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
        <button
          className="db-icon-button"
          type="button"
          onClick={() => void refreshActive()}
          aria-label="Refresh database"
        >
          <RefreshCw className={loadingMain ? "spin" : ""} size={15} />
        </button>
      </header>
      <nav className="db-resource-tabs" aria-label="Database navigation">
        {(["overview", "console", "time-travel", "settings"] as const).map(
          (item) => (
            <button
              type="button"
              key={item}
              aria-current={
                (
                  item === "console"
                    ? ["data", "sql", "schema"].includes(view)
                    : view === item
                )
                  ? "page"
                  : undefined
              }
              onClick={() =>
                item === "console" ? void exploreData() : setView(item)
              }
            >
              {item === "time-travel"
                ? "Time Travel"
                : item[0].toUpperCase() + item.slice(1)}
            </button>
          ),
        )}
      </nav>

      {source ? (
        <div className="db-source-meta" data-quiet="true">
          <span>{source.label}</span>
          <span>· {providerLabel(source)}</span>
          {metrics?.health?.latencyMs != null ? (
            <span>· {metrics.health.latencyMs}ms</span>
          ) : null}
          <span
            className={
              source.writable ? "db-write-status write" : "db-write-status"
            }
          >
            {source.writable ? "CRUD" : "read only"}
          </span>
          {source.source_kind === "deployment_binding" ||
          source.database_id?.startsWith("binding:") ? (
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
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {view === "overview" ? (
        <main className="db-overview">
          <div className="db-overview-heading">
            <h1>{source?.label}</h1>
            <button
              type="button"
              className="db-button primary"
              onClick={() => void exploreData()}
            >
              <Table2 size={14} /> Explore data
            </button>
          </div>
          <div className="db-kpis">
            <KpiCard
              label="Storage"
              value={storageDisplay(metrics, source)}
              sub={source?.engine || ""}
            />
            <KpiCard
              label="Total queries"
              value={formatCompact(metrics?.kpis?.queries)}
              sub={range}
            />
            <KpiCard
              label="Rows read"
              value={formatCompact(metrics?.kpis?.rowsRead)}
              sub={range}
            />
            <KpiCard
              label="Rows written"
              value={formatCompact(metrics?.kpis?.rowsWritten)}
              sub={range}
            />
            <KpiCard
              label="Tables"
              value={formatCompact(tables.length)}
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
            <div
              className="db-metrics-empty"
              role="status"
              data-metrics-wired="false"
            >
              <span>
                {metrics?.warning ||
                  "Analytics are not reported for this database yet. Table browsing and SQL still work."}
              </span>
              <button
                type="button"
                className="db-button primary"
                onClick={() => void exploreData()}
              >
                <Table2 size={14} /> Browse Tables
              </button>
            </div>
          ) : (
            <>
              <MetricChart
                title="Total queries"
                data={chartData}
                first="queries"
              />
              <div className="db-chart-grid">
                <MetricChart
                  title="Read / write queries"
                  data={chartData}
                  first="readQueries"
                  second="writeQueries"
                />
                <MetricChart
                  title="Rows read / written"
                  data={chartData}
                  first="rowsRead"
                  second="rowsWritten"
                />
                <MetricChart
                  title="Query latency · ms"
                  data={chartData}
                  first="latencyMs"
                />
              </div>
            </>
          )}

          <section className="db-schema-card">
            <h2>Query insights</h2>
            {metrics?.insights?.length ? (
              <div className="db-grid-scroll">
                <table className="db-data-grid">
                  <thead>
                    <tr>
                      <th>Query</th>
                      <th>Executions</th>
                      <th>Avg latency · ms</th>
                      <th>Rows read</th>
                      <th>Rows written</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.insights.map((insight, index) => (
                      <tr key={index}>
                        <td>
                          <code>{insight.dimensions?.query}</code>
                        </td>
                        <td>{formatCompact(insight.count)}</td>
                        <td>
                          {insight.avg?.queryDurationMs?.toFixed(2) || "—"}
                        </td>
                        <td>{formatCompact(insight.sum?.rowsRead)}</td>
                        <td>{formatCompact(insight.sum?.rowsWritten)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>
                {metrics?.insightsWarning ||
                  "No query insights reported for this connection and period."}
              </p>
            )}
          </section>
          <section className="db-provider-health">
            <div>
              <div className="db-eyebrow">PROVIDER</div>
              <strong>{providerLabel(source)}</strong>
            </div>
            <div>
              <div className="db-eyebrow">HEALTH</div>
              <strong>
                {metrics?.health?.hyperdrive ||
                  metrics?.health?.status ||
                  "connected"}
              </strong>
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
      ) : view === "settings" || view === "time-travel" ? (
        source ? (
          <DatabaseManagement
            key={source.id + view}
            client={client}
            source={source}
            view={view}
            onDeleted={() => {
              setSourceId("");
              void loadSources();
            }}
          />
        ) : null
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
                title={
                  tableFilterKind === "all"
                    ? "Filter tables"
                    : `Filter: ${tableFilterKind}`
                }
                aria-label="Filter tables"
                onClick={() =>
                  setTableFilterKind((current) =>
                    current === "all"
                      ? "table"
                      : current === "table"
                        ? "view"
                        : "all",
                  )
                }
              >
                <Filter size={14} />
                {tableFilterKind !== "all" ? (
                  <span style={{ fontSize: 10 }}>
                    {tableFilterKind === "table" ? "1" : "2"}
                  </span>
                ) : null}
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
                title={
                  source?.writable
                    ? "Create a new table in the selected database"
                    : "Selected database is read-only"
                }
                disabled={!source?.writable}
                onClick={() => {
                  if (!source?.writable) {
                    setError(
                      "Create table requires a writable database and an authorized grant (for example d1.write).",
                    );
                    return;
                  }
                  setCreateTableName("");
                  setCreateTableColumns([
                    {
                      name: "id",
                      type: "INTEGER",
                      nullable: false,
                      primaryKey: true,
                    },
                  ]);
                  setCreateTablePreview("");
                  setCreateTableOpen(true);
                }}
              >
                <Plus size={13} /> New
              </button>
            </div>
            <div className="db-table-list">
              {filteredTables.map((table) => (
                <div
                  className="db-table-item"
                  key={tableKey(table)}
                  data-active={
                    (selectedTable &&
                      view !== "sql" &&
                      tableKey(selectedTable) === tableKey(table)) ||
                    undefined
                  }
                >
                  <button
                    type="button"
                    onClick={() => openTable(table)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setCtxMenu({ x: event.clientX, y: event.clientY, table });
                    }}
                  >
                    <Rows3 size={14} />
                    <span title={tableKey(table)}>{tableKey(table)}</span>
                  </button>
                  <button
                    type="button"
                    className="db-table-overflow"
                    aria-label={`Actions for ${tableKey(table)}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      setCtxMenu({
                        x: Math.min(rect.left, window.innerWidth - 220),
                        y: Math.min(rect.bottom, window.innerHeight - 230),
                        table,
                      });
                    }}
                  >
                    ···
                  </button>
                </div>
              ))}
            </div>
          </aside>
          <div
            className="db-resize-handle"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize table explorer"
            tabIndex={0}
            aria-valuemin={160}
            aria-valuemax={420}
            aria-valuenow={railWidth}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setRailWidth((width) =>
                  Math.min(
                    420,
                    Math.max(
                      160,
                      width + (event.key === "ArrowRight" ? 10 : -10),
                    ),
                  ),
                );
              }
            }}
            onMouseDown={(event) => {
              event.preventDefault();
              resizingRail.current = true;
            }}
          />

          <section className="db-editor-main">
            <nav
              className="db-query-tabs"
              aria-label="Console tabs"
              role="tablist"
            >
              {queryTabs.map((tab) => (
                <div className="db-console-tab" key={tab.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={
                      view === "sql" && tab.id === activeQueryTabId
                    }
                    onClick={() => {
                      setActiveQueryTabId(tab.id);
                      setView("sql");
                    }}
                  >
                    <Code2 size={13} />
                    {tab.title}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tab.title}`}
                    onClick={() => {
                      const remaining = queryTabs.filter(
                        (item) => item.id !== tab.id,
                      );
                      const next = remaining.length
                        ? remaining
                        : [newQueryTab(1)];
                      setQueryTabs(next);
                      if (activeQueryTabId === tab.id)
                        setActiveQueryTabId(next[0].id);
                    }}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              {tableTabs.map((table) => (
                <div className="db-console-tab" key={tableKey(table)}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={
                      view !== "sql" && selectedKey === tableKey(table)
                    }
                    onClick={() => openTable(table)}
                  >
                    <Table2 size={13} />
                    {tableKey(table)}
                  </button>
                  <button
                    type="button"
                    aria-label={`Close ${tableKey(table)}`}
                    onClick={() => closeTable(table)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addQueryTab}
                aria-label="New query tab"
              >
                <Plus size={14} /> New
              </button>
            </nav>
            <nav className="db-editor-tabs" aria-label="Table actions">
              {view !== "sql" && selectedTable ? (
                (["data", "schema"] as const).map((item) => (
                  <button
                    type="button"
                    key={item}
                    data-active={view === item || undefined}
                    onClick={() => {
                      setView(item);
                      updateTableState(selectedKey, { view: item });
                    }}
                  >
                    {item === "data" ? "Data" : "Schema"}
                  </button>
                ))
              ) : (
                <span className="db-console-label">SQL query</span>
              )}
              <span className="db-tab-spacer" />
              {view === "data" && selectedTable ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditMode("insert")}
                    disabled={!source?.writable}
                  >
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
                    disabled={
                      !source?.writable || !hasRowIdentity || busyMutation
                    }
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </>
              ) : null}
            </nav>

            {view === "sql" ? (
              <div className="db-sql-view" data-sql-workspace="true">
                <div className="db-sql-split">
                  <div className="db-sql-editor-pane">
                    <div className="db-sql-monaco">
                      <SqlMonacoEditor
                        path={
                          "database://" +
                          sourceId +
                          "/" +
                          activeQueryTabId +
                          ".sql"
                        }
                        value={sql}
                        onChange={setSql}
                        onRun={() => {
                          if (sql.trim() && !loadingMain) void runSql();
                        }}
                        theme="vs-dark"
                        height="100%"
                      />
                    </div>
                    <div className="db-sql-actions">
                      <span id="db-sql-help">
                        {source?.writable
                          ? "Writes require confirmation. Destructive schema changes require a second confirmation."
                          : "Read-only source."}
                      </span>
                      <button
                        type="button"
                        className="db-button secondary"
                        onClick={formatActiveSql}
                      >
                        Format ⌥F
                      </button>
                      <button
                        type="button"
                        className="db-button primary"
                        disabled={!sql.trim() || loadingMain}
                        onClick={() => void runSql()}
                      >
                        {loadingMain ? (
                          <Loader2 className="spin" size={14} />
                        ) : (
                          <Play size={13} />
                        )}
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
                            {queryResult.rowCount ??
                              queryResult.objects?.length ??
                              0}{" "}
                            rows
                            {queryResult.durationMs != null
                              ? ` · ${queryResult.durationMs}ms`
                              : ""}
                            {queryResult.rowsRead != null
                              ? ` · ${queryResult.rowsRead} read`
                              : ""}
                            {queryResult.rowsWritten != null
                              ? ` · ${queryResult.rowsWritten} written`
                              : ""}
                          </span>
                        </div>
                        <div className="db-grid-scroll">
                          <table className="db-data-grid">
                            <thead>
                              <tr>
                                {(queryResult.columns || []).map((column) => (
                                  <th key={column}>{column}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {(queryResult.objects || []).map(
                                (row, rowIndex) => (
                                  <tr key={rowIndex}>
                                    {(queryResult.columns || []).map(
                                      (column) => (
                                        <td key={column}>
                                          {row[column] == null ? (
                                            <em>NULL</em>
                                          ) : typeof row[column] ===
                                            "object" ? (
                                            JSON.stringify(row[column])
                                          ) : (
                                            String(row[column])
                                          )}
                                        </td>
                                      ),
                                    )}
                                  </tr>
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </>
                    ) : (
                      <div className="db-editor-empty">
                        Run a query to see results
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {view === "schema" && schema ? (
              <div className="db-schema-view">
                {selectedTable && source ? (
                  <SchemaEditor
                    key={sourceId + selectedKey}
                    client={client}
                    source={source}
                    table={selectedTable}
                    schema={schema}
                    onApplied={() => loadTable(selectedTable, page)}
                  />
                ) : null}
                {schema.foreignKeys?.length ? (
                  <section className="db-schema-card">
                    <h2>Relationships</h2>
                    {schema.foreignKeys.map((key, i) => (
                      <p key={key.name || i}>
                        {key.columns?.join(", ")} →{" "}
                        {key.refSchema ? key.refSchema + "." : ""}
                        {key.refTable} ({key.refColumns?.join(", ")})
                      </p>
                    ))}
                  </section>
                ) : null}
                <section className="db-schema-card">
                  <div className="db-eyebrow">COLUMNS</div>
                  <table className="db-data-grid">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Nullable</th>
                        <th>Key</th>
                        <th>Default</th>
                      </tr>
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
                {selectedTable ? (
                  <form
                    className="db-row-controls"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = new FormData(event.currentTarget);
                      updateTableState(selectedKey, {
                        filter: String(form.get("filter") || ""),
                        page: 1,
                      });
                    }}
                  >
                    <input
                      key={selectedKey}
                      name="filter"
                      defaultValue={tableState?.filter || ""}
                      placeholder="Filter rows…"
                      aria-label="Filter rows"
                    />
                    <button type="submit" className="db-button secondary">
                      <Filter size={13} /> Apply
                    </button>
                    <select
                      aria-label="Sort rows"
                      value={tableState?.sort || ""}
                      onChange={(event) =>
                        updateTableState(selectedKey, {
                          sort: event.target.value,
                          page: 1,
                        })
                      }
                    >
                      <option value="">Sort by column</option>
                      {schema?.columns.map((column) => (
                        <option key={column.name}>{column.name}</option>
                      ))}
                    </select>
                    <button
                      className="db-button secondary"
                      type="button"
                      onClick={() =>
                        updateTableState(selectedKey, {
                          dir: tableState?.dir === "desc" ? "asc" : "desc",
                          page: 1,
                        })
                      }
                    >
                      {tableState?.dir === "desc" ? "Descending" : "Ascending"}
                    </button>
                  </form>
                ) : null}
                {rows && selectedTable ? (
                  <>
                    <div className="db-result-meta">
                      <span>{tableKey(selectedTable)}</span>
                      <span>{rows.total.toLocaleString()} rows</span>
                      {pkColumns.length ? (
                        <span>
                          PK:{" "}
                          {pkColumns.map((column) => column.name).join(", ")}
                        </span>
                      ) : (
                        <span className="warn">No PK · edits disabled</span>
                      )}
                    </div>
                    <div className="db-grid-scroll" ref={tableGridRef} onScroll={event => { tableScrolls.current[sourceId + ":" + selectedKey] = { top: event.currentTarget.scrollTop, left: event.currentTarget.scrollLeft }; }}>
                      <table className="db-data-grid">
                        <thead>
                          <tr>
                            {schema?.columns.map((column) => (
                              <th key={column.name}>{column.name}</th>
                            ))}
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
                                  <td
                                    key={column.name}
                                    tabIndex={0}
                                    data-cell-selected={
                                      (cell?.row === rowIndex &&
                                        cell.column === column.name) ||
                                      undefined
                                    }
                                    onClick={() => {
                                      if (!cell?.editing)
                                        setCell({
                                          row: rowIndex,
                                          column: column.name,
                                          editing: false,
                                          value:
                                            row[column.name] == null
                                              ? ""
                                              : typeof row[column.name] ===
                                                  "object"
                                                ? JSON.stringify(
                                                    row[column.name],
                                                  )
                                                : String(row[column.name]),
                                          isNull: row[column.name] == null,
                                        });
                                    }}
                                    onDoubleClick={() => {
                                      if (
                                        source?.writable &&
                                        pkColumns.length &&
                                        pkColumns.every(
                                          (key) => row[key.name] != null,
                                        )
                                      )
                                        setCell({
                                          row: rowIndex,
                                          column: column.name,
                                          editing: true,
                                          value:
                                            row[column.name] == null
                                              ? ""
                                              : typeof row[column.name] ===
                                                  "object"
                                                ? JSON.stringify(
                                                    row[column.name],
                                                  )
                                                : String(row[column.name]),
                                          isNull: row[column.name] == null,
                                        });
                                    }}
                                    onKeyDown={(event) => {
                                      if (
                                        event.key === "Enter" &&
                                        !cell?.editing &&
                                        source?.writable &&
                                        pkColumns.length
                                      ) {
                                        event.preventDefault();
                                        setCell({
                                          row: rowIndex,
                                          column: column.name,
                                          editing: true,
                                          value:
                                            row[column.name] == null
                                              ? ""
                                              : String(row[column.name]),
                                          isNull: row[column.name] == null,
                                        });
                                      }
                                      if (event.key === "Escape") setCell(null);
                                    }}
                                  >
                                    {cell?.row === rowIndex &&
                                    cell.column === column.name &&
                                    cell.editing ? (
                                      <div
                                        className="db-cell-editor"
                                        onClick={(event) =>
                                          event.stopPropagation()
                                        }
                                      >
                                        <input
                                          aria-label={`Edit ${column.name}`}
                                          autoFocus
                                          value={cell.value}
                                          disabled={cell.isNull || busyMutation}
                                          onChange={(event) =>
                                            setCell({
                                              ...cell,
                                              value: event.target.value,
                                            })
                                          }
                                          onKeyDown={(event) => {
                                            if (event.key === "Enter") {
                                              event.stopPropagation();
                                              void commitCell();
                                            }
                                            if (event.key === "Escape") {
                                              event.stopPropagation();
                                              setCell(null);
                                            }
                                          }}
                                        />
                                        {column.nullable ? (
                                          <label>
                                            <input
                                              type="checkbox"
                                              checked={cell.isNull}
                                              onChange={(event) =>
                                                setCell({
                                                  ...cell,
                                                  isNull: event.target.checked,
                                                })
                                              }
                                            />{" "}
                                            NULL
                                          </label>
                                        ) : null}
                                        <div>
                                          <button
                                            className="db-button secondary"
                                            disabled={busyMutation}
                                            onClick={() => setCell(null)}
                                          >
                                            Cancel
                                          </button>
                                          <button
                                            className="db-button primary"
                                            disabled={busyMutation}
                                            onClick={() => void commitCell()}
                                          >
                                            Save
                                          </button>
                                        </div>
                                      </div>
                                    ) : row[column.name] == null ? (
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
                        onClick={() =>
                          void loadTable(selectedTable, rows.page - 1)
                        }
                      >
                        <ChevronLeft size={14} /> Previous
                      </button>
                      <span>
                        Page {rows.page} of {rows.total_pages}
                      </span>
                      <button
                        type="button"
                        disabled={rows.page >= rows.total_pages || loadingMain}
                        onClick={() =>
                          void loadTable(selectedTable, rows.page + 1)
                        }
                      >
                        Next <ChevronRight size={14} />
                      </button>
                    </footer>
                  </>
                ) : (
                  <div className="db-editor-empty">
                    {loadingMain ? (
                      <Loader2 className="spin" size={18} />
                    ) : (
                      <Table2 size={22} />
                    )}
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
          key={sourceId + selectedKey + editMode}
          mode={editMode}
          table={selectedTable}
          columns={schema.columns}
          initial={editMode === "edit" ? selectedRow || {} : {}}
          busy={busyMutation}
          onClose={() => setEditMode(null)}
          onSave={saveRow}
        />
      ) : null}

      {createTableOpen ? (
        <div
          className="db-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Create table"
        >
          <div className="db-modal" style={{ maxWidth: 640 }}>
            <header className="db-modal-header">
              <div>
                <div className="db-eyebrow">AUTHORIZED DDL</div>
                <strong>Create table</strong>
              </div>
              <button
                type="button"
                className="db-icon-button"
                onClick={() => setCreateTableOpen(false)}
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </header>
            <div
              className="db-modal-fields"
              style={{ display: "grid", gap: 12 }}
            >
              <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
                Table name
                <input
                  value={createTableName}
                  onChange={(event) => setCreateTableName(event.target.value)}
                  placeholder="studio_ddl_test_notes"
                  autoFocus
                />
              </label>
              <div style={{ display: "grid", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <strong style={{ fontSize: 12 }}>Columns</strong>
                  <button
                    type="button"
                    className="db-button secondary"
                    onClick={() =>
                      setCreateTableColumns((cols) => [
                        ...cols,
                        {
                          name: "",
                          type: "TEXT",
                          nullable: true,
                          primaryKey: false,
                        },
                      ])
                    }
                  >
                    Add column
                  </button>
                </div>
                {createTableColumns.map((column, index) => (
                  <div
                    key={`col-${index}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1.4fr 1fr auto auto auto",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <input
                      value={column.name}
                      placeholder="column"
                      onChange={(event) => {
                        const value = event.target.value;
                        setCreateTableColumns((cols) =>
                          cols.map((item, i) =>
                            i === index ? { ...item, name: value } : item,
                          ),
                        );
                      }}
                    />
                    <select
                      value={column.type}
                      onChange={(event) => {
                        const value = event.target.value;
                        setCreateTableColumns((cols) =>
                          cols.map((item, i) =>
                            i === index ? { ...item, type: value } : item,
                          ),
                        );
                      }}
                    >
                      {[
                        "INTEGER",
                        "TEXT",
                        "REAL",
                        "BLOB",
                        "NUMERIC",
                        "BOOLEAN",
                      ].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                    <label
                      style={{
                        fontSize: 11,
                        display: "flex",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={column.primaryKey}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setCreateTableColumns((cols) =>
                            cols.map((item, i) =>
                              i === index
                                ? {
                                    ...item,
                                    primaryKey: checked,
                                    nullable: checked ? false : item.nullable,
                                  }
                                : item,
                            ),
                          );
                        }}
                      />
                      PK
                    </label>
                    <label
                      style={{
                        fontSize: 11,
                        display: "flex",
                        gap: 4,
                        alignItems: "center",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={column.nullable}
                        disabled={column.primaryKey}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setCreateTableColumns((cols) =>
                            cols.map((item, i) =>
                              i === index
                                ? { ...item, nullable: checked }
                                : item,
                            ),
                          );
                        }}
                      />
                      Null
                    </label>
                    <button
                      type="button"
                      className="db-icon-button"
                      aria-label="Remove column"
                      disabled={createTableColumns.length <= 1}
                      onClick={() =>
                        setCreateTableColumns((cols) =>
                          cols.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              {createTablePreview ? (
                <div style={{ display: "grid", gap: 4 }}>
                  <strong style={{ fontSize: 12 }}>DDL preview</strong>
                  <pre
                    style={{
                      margin: 0,
                      padding: 10,
                      fontSize: 11,
                      overflow: "auto",
                      maxHeight: 180,
                    }}
                  >
                    {createTablePreview}
                  </pre>
                </div>
              ) : null}
              <p
                style={{
                  margin: 0,
                  color: "var(--db-muted)",
                  fontSize: 12,
                  lineHeight: 1.45,
                }}
              >
                Executes against the selected source only (
                {source?.label || sourceId}). Requires confirmation before
                apply.
              </p>
            </div>
            <footer className="db-modal-actions">
              <button
                type="button"
                className="db-button secondary"
                onClick={() => setCreateTableOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="db-button secondary"
                disabled={busyMutation || !createTableName.trim()}
                onClick={() => {
                  void (async () => {
                    if (!sourceId) return;
                    setBusyMutation(true);
                    setError(null);
                    try {
                      const preview = await client.createTable(sourceId, {
                        table_name: createTableName.trim(),
                        columns: createTableColumns,
                        preview_only: true,
                      });
                      setCreateTablePreview(String(preview.sql || ""));
                    } catch (caught) {
                      setError(errorText(caught));
                    } finally {
                      setBusyMutation(false);
                    }
                  })();
                }}
              >
                Preview DDL
              </button>
              <button
                type="button"
                className="db-button primary"
                disabled={busyMutation || !createTableName.trim()}
                onClick={() => {
                  void (async () => {
                    if (!sourceId) return;
                    if (
                      !window.confirm(
                        `Create table "${createTableName.trim()}" on ${source?.label || sourceId}?`,
                      )
                    ) {
                      return;
                    }
                    setBusyMutation(true);
                    setError(null);
                    try {
                      const result = await client.createTable(sourceId, {
                        table_name: createTableName.trim(),
                        columns: createTableColumns,
                        studio_approved: true,
                      });
                      setCreateTableOpen(false);
                      await loadTables();
                      const created = {
                        name: String(
                          result.table_name || createTableName.trim(),
                        ),
                        schema: result.schema || undefined,
                        kind: "table" as const,
                      };
                      openTable(created, "schema");
                      setPage(1);
                      await loadTable(created, 1);
                    } catch (caught) {
                      setError(errorText(caught));
                    } finally {
                      setBusyMutation(false);
                    }
                  })();
                }}
              >
                {busyMutation ? <Loader2 className="spin" size={14} /> : null}
                Create table
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div
          className="db-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm table deletion"
        >
          <div className="db-modal">
            <header className="db-modal-header">
              <strong>Delete table {tableKey(deleteTarget)}</strong>
            </header>
            <div className="db-modal-fields">
              <p>
                This removes the table and its data from {source?.label}. Type
                the exact table name to confirm.
              </p>
              <input
                aria-label="Table name confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoFocus
              />
            </div>
            <footer className="db-modal-actions">
              <button
                className="db-button secondary"
                disabled={busyMutation}
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                className="db-button danger"
                disabled={busyMutation || confirmation !== deleteTarget.name}
                onClick={async () => {
                  setBusyMutation(true);
                  try {
                    await client.dropTable(sourceId, {
                      table_name: deleteTarget.name,
                      schema: deleteTarget.schema,
                      studio_approved: true,
                      destructive_confirmed: true,
                      confirm_name: confirmation,
                    });
                    closeTable(deleteTarget);
                    setDeleteTarget(null);
                    await loadTables();
                  } catch (caught) {
                    setError(errorText(caught));
                  } finally {
                    setBusyMutation(false);
                  }
                }}
              >
                Delete table
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
              openTable(ctxMenu.table);
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
                  const createSql =
                    payload.schema?.createSql ||
                    JSON.stringify(payload.schema?.columns || [], null, 2);
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
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              openTable(ctxMenu.table, "schema");
              setCtxMenu(null);
            }}
          >
            Edit table schema
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            disabled={!source?.writable}
            onClick={() => {
              setDeleteTarget(ctxMenu.table);
              setConfirmation("");
              setCtxMenu(null);
            }}
          >
            <Trash2 size={13} /> Delete table
          </button>
        </div>
      ) : null}
    </div>
  );
}
