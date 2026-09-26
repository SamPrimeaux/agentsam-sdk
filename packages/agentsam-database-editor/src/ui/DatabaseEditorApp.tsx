import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Cloud,
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

export type DatabaseEditorAppProps = {
  client?: DatabaseStudioClient;
  initialSourceId?: string;
  compact?: boolean;
  onOpenConnections?: () => void;
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
  const n = Number(value || 0);
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function formatBytes(value?: number | null) {
  const bytes = Number(value || 0);
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${Math.round(bytes)} B`;
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
  return (
    <section className="db-chart-card">
      <header className="db-chart-title">
        <Activity size={14} aria-hidden />
        <span>{title}</span>
      </header>
      <div className="db-chart-body">
        {data.length ? (
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
          <div className="db-chart-empty">Waiting for provider metrics.</div>
        )}
      </div>
    </section>
  );
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
            .filter((column) => mode === "edit" || !column.primaryKey || initial[column.name] != null)
            .map((column) => (
              <label key={column.name} className="db-field">
                <span>
                  {column.name}
                  <small>{column.type || "value"}{column.primaryKey ? " · PK" : ""}</small>
                </span>
                <input
                  value={draft[column.name] ?? ""}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, [column.name]: event.target.value }))
                  }
                  placeholder={column.defaultValue ? `default: ${column.defaultValue}` : column.nullable ? "NULL / value" : "value"}
                />
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
  const [sql, setSql] = useState("SELECT 1 AS ok;");
  const [queryResult, setQueryResult] = useState<DatabaseQueryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMain, setLoadingMain] = useState(false);
  const [busyMutation, setBusyMutation] = useState(false);
  const [editMode, setEditMode] = useState<EditMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  const source = useMemo(
    () => catalog?.sources.find((item) => item.id === sourceId) || null,
    [catalog, sourceId],
  );

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await client.listSources();
      setCatalog(next);
      setSourceId((current) => {
        if (current && next.sources.some((item) => item.id === current)) return current;
        if (initialSourceId && next.sources.some((item) => item.id === initialSourceId)) return initialSourceId;
        return next.sources[0]?.id || "";
      });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [client, initialSourceId]);

  useEffect(() => {
    void loadSources();
  }, [loadSources]);

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
      const family = providerFamily(item);
      map.set(family, [...(map.get(family) || []), item]);
    }
    return map;
  }, [catalog]);

  const filteredTables = useMemo(() => {
    const needle = tableSearch.trim().toLowerCase();
    if (!needle) return tables;
    return tables.filter((table) => tableKey(table).toLowerCase().includes(needle));
  }, [tableSearch, tables]);

  const chartData = useMemo(
    () =>
      (metrics?.series || []).map((point) => ({
        ...point,
        label: labelForTime(point.t),
        queries: Number(point.queries || 0),
        readQueries: Number(point.readQueries || 0),
        writeQueries: Number(point.writeQueries || 0),
        rowsRead: Number(point.rowsRead || 0),
        rowsWritten: Number(point.rowsWritten || 0),
      })),
    [metrics],
  );

  const pk = schema?.columns.find((column) => column.primaryKey) || null;

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
              return value !== "" || !column?.defaultValue;
            }),
          );
          await client.insert(sourceId, selectedTable, payload);
        } else {
          if (!pk || !selectedRow) throw new Error("A primary key is required to edit rows safely.");
          const changed = Object.fromEntries(
            Object.entries(values).filter(([key, value]) => value !== selectedRow[key]),
          );
          if (Object.keys(changed).length) {
            await client.update(sourceId, selectedTable, changed, {
              [pk.name]: selectedRow[pk.name],
            });
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
    [client, editMode, loadMetrics, loadTable, page, pk, schema, selectedRow, selectedTable, sourceId],
  );

  const deleteRow = useCallback(async () => {
    if (!sourceId || !selectedTable || !pk || !selectedRow) return;
    if (!window.confirm(`Delete this row from ${tableKey(selectedTable)}? This cannot be undone.`)) return;
    setBusyMutation(true);
    setError(null);
    try {
      await client.delete(sourceId, selectedTable, { [pk.name]: selectedRow[pk.name] });
      await Promise.all([loadTable(selectedTable, page), loadMetrics()]);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusyMutation(false);
    }
  }, [client, loadMetrics, loadTable, page, pk, selectedRow, selectedTable, sourceId]);

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

  if (!catalog?.sources.length) {
    return (
      <div className="db-editor db-empty">
        <Database size={28} />
        <div className="db-eyebrow">AGENTSAM DATABASE</div>
        <h1>No authorized database resources yet</h1>
        <p>
          Connect Cloudflare to discover D1 databases. Supabase/Postgres appears when this Local
          Studio deployment has an authorized Hyperdrive source. Local SQLite appears only through
          a real attached local runtime.
        </p>
        <div className="db-empty-actions">
          <a
            className="db-button primary"
            href={cloudflareConnection?.connect_url || "/api/connections/cloudflare/start?packs=data&return_to=/database"}
          >
            Connect Cloudflare
          </a>
          <button className="db-button secondary" type="button" onClick={onOpenConnections}>
            Connections
          </button>
        </div>
        {localConnection?.message ? <small>{localConnection.message}</small> : null}
      </div>
    );
  }

  return (
    <div
      className="db-editor"
      data-provider={providerFamily(source)}
      data-compact={compact || undefined}
    >
      <header className="db-toolbar">
        <div className="db-provider-tabs" aria-label="Database providers">
          <button
            type="button"
            data-active={providerFamily(source) === "cloudflare" || undefined}
            disabled={!families.get("cloudflare")?.length}
            onClick={() => setSourceId(families.get("cloudflare")?.[0]?.id || sourceId)}
          >
            <Cloud size={13} /> Cloudflare
          </button>
          <button
            type="button"
            data-active={providerFamily(source) === "supabase" || undefined}
            disabled={!families.get("supabase")?.length}
            onClick={() => setSourceId(families.get("supabase")?.[0]?.id || sourceId)}
          >
            <ServerCog size={13} /> Supabase
          </button>
          <button
            type="button"
            data-active={providerFamily(source) === "local" || undefined}
            disabled={!families.get("local")?.length}
            onClick={() => setSourceId(families.get("local")?.[0]?.id || sourceId)}
            title={localConnection?.message || "Local SQLite"}
          >
            <Database size={13} /> Local
          </button>
        </div>

        {!compact ? (
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

        <button className="db-icon-button" type="button" onClick={() => void refreshActive()} title="Refresh">
          <RefreshCw className={loadingMain ? "spin" : ""} size={15} />
        </button>

        <button
          className="db-button primary db-explore"
          type="button"
          onClick={() => setView(view === "overview" ? "data" : "overview")}
        >
          <Table2 size={14} />
          {view === "overview" ? "Explore Data" : "Overview"}
        </button>
      </header>

      {source ? (
        <div className="db-source-meta">
          <span>{source.label}</span>
          <span className="db-chip">{source.database_id ? `${source.database_id.slice(0, 8)}…` : source.engine}</span>
          <span>· {providerLabel(source)}</span>
          {metrics?.health?.latencyMs != null ? <span>· {metrics.health.latencyMs}ms</span> : null}
          <span className={source.writable ? "db-write-status write" : "db-write-status"}>{source.writable ? "CRUD" : "read only"}</span>
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
              value={formatBytes(metrics?.kpis?.storage ?? source?.file_size)}
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

          <MetricChart title="Total queries" data={chartData} first="queries" />
          <div className="db-chart-grid">
            <MetricChart title="Read / write queries" data={chartData} first="readQueries" second="writeQueries" />
            <MetricChart title="Rows read / written" data={chartData} first="rowsRead" second="rowsWritten" />
          </div>

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
            <div className="db-table-search">
              <input
                value={tableSearch}
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="Search tables"
              />
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
                >
                  <Rows3 size={13} />
                  <span>{tableKey(table)}</span>
                  <small>{table.kind || ""}</small>
                </button>
              ))}
            </div>
          </aside>

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
                  {item}
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
                    disabled={!source?.writable || !selectedRow || !pk}
                  >
                    Edit row
                  </button>
                  <button
                    type="button"
                    className="danger"
                    onClick={() => void deleteRow()}
                    disabled={!source?.writable || !selectedRow || !pk || busyMutation}
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                </>
              ) : null}
            </nav>

            {view === "sql" ? (
              <div className="db-sql-view">
                <textarea
                  value={sql}
                  onChange={(event) => setSql(event.target.value)}
                  spellCheck={false}
                  aria-label="SQL query"
                />
                <div className="db-sql-actions">
                  <span>
                    {source?.writable
                      ? "Writes require confirmation. Destructive schema changes require a second confirmation."
                      : "Read-only source."}
                  </span>
                  <button
                    type="button"
                    className="db-button primary"
                    disabled={!sql.trim() || loadingMain}
                    onClick={() => void runSql()}
                  >
                    {loadingMain ? <Loader2 className="spin" size={14} /> : null}
                    Run
                  </button>
                </div>
                {queryResult ? (
                  <div className="db-query-result">
                    <div className="db-result-meta">
                      {queryResult.rowCount ?? queryResult.objects?.length ?? 0} rows
                      {queryResult.durationMs != null ? ` · ${queryResult.durationMs}ms` : ""}
                      {queryResult.rowsRead != null ? ` · ${queryResult.rowsRead} read` : ""}
                      {queryResult.rowsWritten != null ? ` · ${queryResult.rowsWritten} written` : ""}
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
                  </div>
                ) : null}
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
                      {pk ? <span>PK: {pk.name}</span> : <span className="warn">No PK · edits disabled</span>}
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
    </div>
  );
}
