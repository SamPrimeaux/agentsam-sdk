import { useEffect, useState } from "react";
import type { DatabaseSource, DatabaseStudioClient } from "./client";

export function DatabaseManagement({
  client,
  source,
  view,
  onDeleted,
}: {
  client: DatabaseStudioClient;
  source: DatabaseSource;
  view: "settings" | "time-travel";
  onDeleted: () => void;
}) {
  const [details, setDetails] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [replication, setReplication] = useState("disabled");
  const [timestamp, setTimestamp] = useState("");
  const [bookmark, setBookmark] = useState("");
  const [preview, setPreview] = useState<Record<string, any> | null>(null);
  const [receipt, setReceipt] = useState<Record<string, any> | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [destructive, setDestructive] = useState<"delete" | "restore" | null>(
    null,
  );
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    let active = true;
    if (source.management)
      client
        .management("details", { source_id: source.id })
        .then((result) => {
          if (!active) return;
          setDetails(result.result);
          setReplication(result.result.read_replication?.mode || "disabled");
        })
        .catch((caught) => {
          if (active) setError(caught.message);
        });
    return () => {
      active = false;
    };
  }, [client, source.id, source.management]);
  const run = async (action: string, input: Record<string, unknown> = {}) => {
    setBusy(true);
    setError("");
    try {
      const result = await client.management(action, {
        source_id: source.id,
        ...input,
      });
      if (action === "bookmark") {
        setPreview(result.result);
        setBookmark(result.result.bookmark || "");
      } else if (action === "configure") {
        setDetails(result.result);
        setReceipt({ message: "Database settings saved." });
      } else if (action === "delete") onDeleted();
      else {
        setReceipt(result.result);
        setDestructive(null);
        setConfirmation("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="db-management">
      <h1>{view === "settings" ? "Settings" : "Time Travel"}</h1>
      {error ? (
        <div className="db-alert" role="alert">
          {error}
        </div>
      ) : null}
      {receipt ? (
        <div className="db-success" role="status">
          <p>{receipt.message || "Operation completed."}</p>
          {receipt.previous_bookmark ? (
            <p>
              Recovery bookmark before restore:{" "}
              <code>{receipt.previous_bookmark}</code>
            </p>
          ) : null}
        </div>
      ) : null}
      {view === "settings" ? (
        <>
          <section className="db-schema-card">
            <h2>Database details</h2>
            <dl>
              <dt>Name</dt>
              <dd>{source.label}</dd>
              <dt>Provider</dt>
              <dd>{source.provider}</dd>
              <dt>Account</dt>
              <dd>{source.account_id || "Deployment / local connection"}</dd>
              <dt>Database ID</dt>
              <dd>
                <code>
                  {source.database_id || source.path_hint || source.id}
                </code>
              </dd>
              <dt>Created</dt>
              <dd>
                {details?.created_at || source.created_at || "Not reported"}
              </dd>
              <dt>Location</dt>
              <dd>
                {details?.primary_location_hint ||
                  source.region ||
                  "Not reported"}
              </dd>
              <dt>Storage version</dt>
              <dd>{details?.version || "Not reported"}</dd>
              <dt>Access</dt>
              <dd>{source.writable ? "Read and write" : "Read only"}</dd>
            </dl>
          </section>
          {source.management ? (
            <section className="db-schema-card">
              <h2>Read replication</h2>
              <p>
                Control whether Cloudflare automatically places read replicas.
              </p>
              <select
                aria-label="Read replication"
                value={replication}
                onChange={(e) => setReplication(e.target.value)}
                disabled={!source.writable}
              >
                <option value="disabled">Disabled</option>
                <option value="auto">Automatic</option>
              </select>
              <button
                type="button"
                className="db-button primary"
                disabled={busy || !details || !source.writable}
                onClick={() => void run("configure", { replication })}
              >
                Save settings
              </button>
            </section>
          ) : (
            <section className="db-schema-card">
              <p>
                {source.provider.includes("local")
                  ? "Local file management is provided by the attached machine runtime."
                  : "Infrastructure configuration requires a management connection for this provider. This connection currently authorizes database queries."}
              </p>
            </section>
          )}
          <section className="db-schema-card db-danger-zone">
            <h2>Delete database</h2>
            <p>
              Deleting this database removes its tables and data. Confirm the
              exact resource name before proceeding.
            </p>
            <button
              type="button"
              className="db-button danger"
              disabled={!source.management || !source.writable || busy}
              onClick={() => {
                setConfirmation("");
                setDestructive("delete");
              }}
            >
              Delete database
            </button>
          </section>
        </>
      ) : (
        <section className="db-schema-card db-management-form">
          <h2>Restore a point in time</h2>
          {source.management ? (
            <>
              <p>
                Look up the actual provider bookmark before restoring. The
                provider validates the available recovery window for this
                database.
              </p>
              <label>
                Date and time
                <input
                  type="datetime-local"
                  value={timestamp}
                  onChange={(e) => {
                    setTimestamp(e.target.value);
                    setPreview(null);
                    setBookmark("");
                  }}
                />
              </label>
              <button
                className="db-button secondary"
                disabled={busy}
                onClick={() =>
                  void run("bookmark", {
                    timestamp: timestamp
                      ? new Date(timestamp).toISOString()
                      : undefined,
                  })
                }
              >
                {timestamp ? "Look up restore point" : "Get current bookmark"}
              </button>
              <label>
                Restore bookmark
                <input
                  value={bookmark}
                  onChange={(e) => {
                    setBookmark(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="Provider bookmark"
                />
              </label>
              {preview ? (
                <div className="db-success">
                  <strong>Provider-verified bookmark</strong>
                  <code>{preview.bookmark}</code>
                </div>
              ) : null}
              <p>
                Restoring overwrites the database in place. The restore receipt
                includes the previous bookmark for recovery.
              </p>
              <button
                className="db-button danger"
                disabled={busy || !bookmark || !source.writable}
                onClick={() => {
                  setDestructive("restore");
                  setConfirmation("");
                  setAcknowledged(false);
                }}
              >
                Review restore
              </button>
            </>
          ) : (
            <p>
              {source.provider.includes("local")
                ? "No backup or snapshot provider is attached to this SQLite connection. SQLite alone does not provide point-in-time history."
                : "Provider-backed backups or point-in-time recovery are not available through this connection. Connect an authorized provider management integration to access configured recovery."}
            </p>
          )}
        </section>
      )}
      {destructive ? (
        <div
          className="db-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={
            destructive === "delete"
              ? "Confirm database deletion"
              : "Confirm database restore"
          }
        >
          <div className="db-modal">
            <header className="db-modal-header">
              <strong>
                {destructive === "delete" ? "Delete " : "Restore "}
                {source.label}
              </strong>
            </header>
            <div className="db-modal-fields">
              <p>
                {destructive === "restore"
                  ? "This replaces the current database with bookmark " +
                    bookmark +
                    "."
                  : "This removes the selected database and all of its data."}
              </p>
              <label>
                Type <strong>{source.label}</strong> to confirm
                <input
                  aria-label="Database name confirmation"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoFocus
                />
              </label>
              {destructive === "restore" ? (
                <label>
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                  />{" "}
                  I understand this overwrites the current database.
                </label>
              ) : null}
            </div>
            <footer className="db-modal-actions">
              <button
                className="db-button secondary"
                disabled={busy}
                onClick={() => setDestructive(null)}
              >
                Cancel
              </button>
              <button
                className="db-button danger"
                disabled={
                  busy ||
                  confirmation !== source.label ||
                  (destructive === "restore" && !acknowledged)
                }
                onClick={() =>
                  void run(destructive, {
                    confirm_name: confirmation,
                    destructive_confirmed: true,
                    bookmark: destructive === "restore" ? bookmark : undefined,
                  })
                }
              >
                {busy
                  ? "Working…"
                  : destructive === "delete"
                    ? "Delete database"
                    : "Restore database"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
