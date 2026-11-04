import { useEffect, useMemo, useState } from "react";
import { Database, Plus, RefreshCw, ChevronRight } from "lucide-react";
import type {
  DatabaseSourcesResponse,
  DatabaseStudioClient,
} from "./client";
import type { LocalDatabaseHost } from "./local-host";

const number = (value?: number | null) =>
  value == null ? "—" : new Intl.NumberFormat().format(value);
const bytes = (value?: number | null) =>
  value == null
    ? "—"
    : value >= 1e9
      ? (value / 1e9).toFixed(2) + " GB"
      : value >= 1e6
        ? (value / 1e6).toFixed(1) + " MB"
        : new Intl.NumberFormat().format(value) + " B";

export function DatabaseInventory({
  client,
  catalog,
  onOpen,
  onRefresh,
  onConnections,
  localHost,
}: {
  client: DatabaseStudioClient;
  catalog: DatabaseSourcesResponse | null;
  onOpen: (id: string) => void;
  onRefresh: () => Promise<void>;
  onConnections?: () => void;
  localHost?: LocalDatabaseHost;
}) {
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("");
  const [account, setAccount] = useState("");
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);
  const [deployment, setDeployment] = useState(false);
  const [range, setRange] = useState("24h");
  const [usage, setUsage] = useState<Awaited<
    ReturnType<DatabaseStudioClient["accountMetrics"]>
  > | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createProvider, setCreateProvider] = useState("cloudflare");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const accounts = catalog?.accounts || [];
  const accountId = account || (accounts.length === 1 ? accounts[0].id : "");
  const accountName = accounts.find((item) => item.id === accountId)?.name;
  const currentAccount = accounts.find((item) => item.id === accountId);
  const cfConnection = catalog?.connections?.cloudflare;
  useEffect(() => {
    setPage(1);
  }, [search, provider, account, deployment]);
  useEffect(() => {
    let active = true;
    setUsage(null);
    if (accountId)
      client
        .accountMetrics(accountId, range)
        .then((result) => {
          if (active) setUsage(result);
        })
        .catch((caught) => {
          if (active)
            setUsage({
              ok: false,
              account_id: accountId,
              range,
              warning: caught.message,
            });
        });
    return () => {
      active = false;
    };
  }, [client, accountId, range]);
  const resources = useMemo(
    () =>
      (catalog?.sources || [])
        .filter(
          (item) =>
            (deployment || item.source_kind !== "deployment_binding") &&
            (!provider || item.provider.includes(provider)) &&
            (!account || item.account_id === account) &&
            (!search ||
              (item.label + " " + item.database_id)
                .toLowerCase()
                .includes(search.toLowerCase())),
        )
        .sort((a, b) => {
          const queryCount = (id?: string) => usage?.databases?.find(row => row.databaseId === id)?.queries ?? -1;
          if (sort === "size") return (b.file_size ?? -1) - (a.file_size ?? -1);
          if (sort === "queries") return queryCount(b.database_id) - queryCount(a.database_id);
          if (sort === "tables") return (counts[b.id] ?? -1) - (counts[a.id] ?? -1);
          if (sort === "created") return String(b.created_at || "").localeCompare(a.created_at || "");
          return a.label.localeCompare(b.label);
        }),
    [catalog, deployment, provider, account, search, sort, usage, counts],
  );
  const visible = resources.slice((page - 1) * 25, page * 25);
  useEffect(() => {
    let active = true;
    // Introspect only visible resources and cache per UUID; never trust num_tables.
    const missing = visible.filter((item) => counts[item.id] == null);
    (async () => {
      for (let i = 0; i < missing.length && active; i += 3) {
        await Promise.all(
          missing.slice(i, i + 3).map(async (item) => {
            try {
              const result = await client.listTables(item.id);
              if (active)
                setCounts((prev) => ({
                  ...prev,
                  [item.id]: result.tables.length,
                }));
            } catch {
              /* A failed count remains unknown. */
            }
          }),
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [client, catalog, page, search, provider, account, deployment]);
  const accountSources = (catalog?.sources || []).filter(
    (item) =>
      item.account_id === accountId &&
      item.source_kind !== "deployment_binding",
  );
  const storageKnown = accountSources.every((item) => item.file_size != null);
  const storage = storageKnown
    ? accountSources.reduce((sum, item) => sum + (item.file_size || 0), 0)
    : null;
  const create = async () => {
    setBusy(true);
    setError("");
    try {
      if (createProvider === "local") {
        if (!localHost)
          throw new Error("Connect a local runtime to create SQLite files.");
        const result = await localHost.create({
          name: name.trim(),
          preset: "empty",
        });
        await onRefresh();
        onOpen(result.sourceId);
      } else {
        if (!accountId)
          throw new Error("Choose an authorized Cloudflare account.");
        const result = await client.management("create", {
          account_id: accountId,
          name: name.trim(),
          primary_location_hint: location || undefined,
          jurisdiction: jurisdiction || undefined,
        });
        await onRefresh();
        onOpen("cf-d1:" + accountId + ":" + result.result.uuid);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="db-editor db-inventory">
      <header className="db-inventory-heading">
        <div>
          <h1>{creating ? "Create database" : "Databases"}</h1>
          <p>{accountName || "Authorized connections and resources"}</p>
        </div>
        <div className="db-empty-actions">
          <button
            type="button"
            className="db-button secondary"
            onClick={onConnections}
          >
            Connections
          </button>
          <button
            type="button"
            className="db-icon-button"
            aria-label="Refresh inventory"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setCounts({});
              try {
                await onRefresh();
                if (accountId)
                  setUsage(await client.accountMetrics(accountId, range));
              } catch (e) {
                setError(String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={16} className={busy ? "spin" : ""} />
          </button>
          {!creating ? (
            <button
              type="button"
              className="db-button primary"
              onClick={() => setCreating(true)}
            >
              <Plus size={14} /> Create database
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <div role="alert" className="db-alert">
          {error}
        </div>
      ) : null}
      {creating ? (
        <section className="db-management-form">
          <label>
            Provider
            <select
              value={createProvider}
              onChange={(e) => setCreateProvider(e.target.value)}
            >
              <option value="cloudflare">Cloudflare D1</option>
              <option value="local" disabled={!localHost}>
                Local SQLite
              </option>
            </select>
          </label>
          {createProvider === "cloudflare" ? (
            <label>
              Cloudflare account
              <select
                value={accountId}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">Choose account</option>
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Database name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          {createProvider === "cloudflare" ? (
            <>
              <label>
                Preferred location
                <select
                  value={location}
                  disabled={!!jurisdiction}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="">Automatic placement</option>
                  {[
                    ["wnam", "Western North America"],
                    ["enam", "Eastern North America"],
                    ["weur", "Western Europe"],
                    ["eeur", "Eastern Europe"],
                    ["apac", "Asia Pacific"],
                    ["oc", "Oceania"],
                  ].map(([id, label]) => (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data residency
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                >
                  <option value="">No restriction</option>
                  <option value="eu">European Union</option>
                  <option value="us">United States</option>
                  <option value="fedramp">FedRAMP</option>
                </select>
              </label>
              {!currentAccount?.writable ? (
                <p>D1 write permission is required to create a database.</p>
              ) : null}
            </>
          ) : null}
          <footer>
            <button
              type="button"
              className="db-button secondary"
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="db-button primary"
              disabled={
                busy ||
                !name.trim() ||
                (createProvider === "cloudflare" && !currentAccount?.writable)
              }
              onClick={() => void create()}
            >
              Create database
            </button>
          </footer>
        </section>
      ) : (
        <div className="db-inventory-layout">
          <section className="db-resource-list">
            <div className="db-inventory-filters">
              <input
                placeholder="Search databases"
                aria-label="Search databases"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                aria-label="Provider filter"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                <option value="">All providers</option>
                <option value="cloudflare">Cloudflare D1</option>
                <option value="postgres">PostgreSQL</option>
                <option value="local">Local SQLite</option>
              </select>
              <select
                aria-label="Account filter"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
              >
                <option value="">All accounts</option>
                {accounts.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <select
                aria-label="Sort databases"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                <option value="name">Name</option>
                <option value="size">Storage</option>
                <option value="tables">Tables</option>
                <option value="queries">Queries</option>
                <option value="created">Created</option>
              </select>
            </div>
            <div className="db-grid-scroll">
              <table className="db-data-grid db-inventory-grid">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>UUID</th>
                    <th>Tables</th>
                    <th>Queries · {range}</th>
                    <th>Size</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          className="db-resource-link"
                          onClick={() => onOpen(item.id)}
                        >
                          <Database size={14} />
                          {item.label}
                        </button>
                        <small>
                          {item.provider}
                          {item.source_kind === "deployment_binding"
                            ? " · Deployment resource"
                            : ""}
                        </small>
                      </td>
                      <td>
                        <button
                          className="db-copy-id"
                          title={item.database_id || item.path_hint}
                          onClick={() => {
                            navigator.clipboard
                              .writeText(
                                item.database_id || item.path_hint || "",
                              )
                              .catch(() => setError("Clipboard unavailable."));
                          }}
                        >
                          {item.database_id || item.path_hint || "—"}
                        </button>
                      </td>
                      <td>{number(counts[item.id])}</td>
                      <td>
                        {number(
                          item.account_id === accountId
                            ? usage?.databases?.find(
                                (row) => row.databaseId === item.database_id,
                              )?.queries
                            : null,
                        )}
                      </td>
                      <td>{bytes(item.file_size)}</td>
                      <td>
                        {item.created_at
                          ? new Date(item.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        <button
                          className="db-icon-button"
                          aria-label={"Open " + item.label}
                          onClick={() => onOpen(item.id)}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!resources.length ? (
              <div className="db-editor-empty">
                <Database size={24} />
                <strong>No databases match this view</strong>
                <p>
                  {cfConnection?.error ||
                    cfConnection?.message ||
                    "Connect a provider to discover your databases."}
                </p>
                <a
                  className="db-button secondary"
                  href={
                    cfConnection?.connect_url ||
                    cfConnection?.reconnect_url ||
                    "/api/connections/cloudflare/start?packs=data&return_to=/database"
                  }
                >
                  Connect Cloudflare
                </a>
                {localHost ? (
                  <button
                    className="db-button secondary"
                    onClick={async () => {
                      try {
                        const ref = await localHost.pick();
                        if (ref) {
                          const opened = await localHost.open(ref);
                          await onRefresh();
                          onOpen(opened.sourceId);
                        }
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Open SQLite file
                  </button>
                ) : null}
              </div>
            ) : null}
            <footer className="db-pagination">
              <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span>
                {resources.length} databases · Page {page} of{" "}
                {Math.max(1, Math.ceil(resources.length / 25))}
              </span>
              <button
                disabled={page * 25 >= resources.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </footer>
            <label className="db-deployment-toggle">
              <input
                type="checkbox"
                checked={deployment}
                onChange={(e) => setDeployment(e.target.checked)}
              />{" "}
              Show separately authorized deployment resources
            </label>
            {accounts
              .filter((item) => item.error)
              .map((item) => (
                <p role="status" key={item.id}>
                  {item.name}: {item.error}
                </p>
              ))}
          </section>
          <aside className="db-account-usage">
            <h2>Account usage</h2>
            <select
              aria-label="Monitoring account"
              value={accountId}
              onChange={(e) => setAccount(e.target.value)}
            >
              <option value="">Choose an account</option>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Usage reporting period"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="1h">Last hour</option>
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
            {accountId ? (
              <>
                <dl>
                  <dt>Databases</dt>
                  <dd>{number(currentAccount?.error ? null : accountSources.length)}</dd>
                  <dt>Database allowance</dt>
                  <dd>Not reported by connection</dd>
                  <dt>Rows read</dt>
                  <dd>{number(usage?.totals?.rowsRead)}</dd>
                  <dt>Rows written</dt>
                  <dd>{number(usage?.totals?.rowsWritten)}</dd>
                  <dt>Current storage</dt>
                  <dd>{bytes(storage)}</dd>
                </dl>
                {usage?.warning ? <p role="status">{usage.warning}</p> : null}
                <small>
                  {usage?.start && usage?.end
                    ? new Date(usage.start).toLocaleString() +
                      " – " +
                      new Date(usage.end).toLocaleString()
                    : "Cloudflare account analytics"}
                  {usage?.captured_at
                    ? " · Updated " +
                      new Date(usage.captured_at).toLocaleTimeString()
                    : ""}
                </small>
                <h2>Billing & alerts</h2>
                <p>
                  {usage?.billing?.message ||
                    "Billing usage and charges require authorized provider billing records."}
                </p>
                {usage?.billing?.status === "available" ? (
                  <details>
                    <summary>Provider billing records</summary>
                    <pre>{JSON.stringify(usage.billing, null, 2)}</pre>
                  </details>
                ) : null}
                <a
                  href={"https://dash.cloudflare.com/" + accountId + "/billing"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Billing dashboard
                </a>
                <a
                  href={
                    "https://dash.cloudflare.com/" +
                    accountId +
                    "/notifications"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Manage budget & usage alerts
                </a>
              </>
            ) : (
              <p>Select an account to view its usage and billing status.</p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
