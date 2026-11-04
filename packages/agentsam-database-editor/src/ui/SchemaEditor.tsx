import { useState } from "react";
import type {
  DatabaseSource,
  DatabaseStudioClient,
  DatabaseSchemaInfo,
  DatabaseTableInfo,
} from "./client";

export function SchemaEditor({
  client,
  source,
  table,
  schema,
  onApplied,
}: {
  client: DatabaseStudioClient;
  source: DatabaseSource;
  table: DatabaseTableInfo;
  schema: DatabaseSchemaInfo;
  onApplied: () => Promise<void>;
}) {
  const [action, setAction] = useState("alter_table_add_column");
  const [column, setColumn] = useState(schema.columns[0]?.name || "");
  const [name, setName] = useState("");
  const [type, setType] = useState("TEXT");
  const [nullable, setNullable] = useState(true);
  const [defaultValue, setDefaultValue] = useState("");
  const [unique, setUnique] = useState(false);
  const [refTable, setRefTable] = useState("");
  const [refColumn, setRefColumn] = useState("");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const pg = source.engine.includes("postgres");
  const input = {
    action,
    table_name: table.name,
    schema: table.schema,
    column: { name, type, nullable, defaultValue },
    column_name: column,
    new_name: name,
    column_type: type,
    nullable,
    default_value: defaultValue,
    index_name: name,
    index_columns: [column],
    unique,
    constraint_name: name,
    ref_table: refTable,
    ref_column: refColumn,
  };
  const run = async (apply: boolean) => {
    setBusy(true);
    setError("");
    try {
      const result = await client.ddl(source.id, {
        ...input,
        preview_only: !apply,
        studio_approved: apply,
        destructive_confirmed: apply,
      });
      if (apply) {
        setPreview("");
        setAcknowledged(false);
        await onApplied();
      } else setPreview(result.sql || "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="db-schema-editor"
      onChange={() => {
        setPreview("");
        setAcknowledged(false);
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void run(false);
      }}
    >
      <h2>Edit schema</h2>
      {error ? <p role="alert">{error}</p> : null}
      <label>
        Operation
        <select value={action} onChange={(e) => setAction(e.target.value)}>
          <option value="alter_table_add_column">Add column</option>
          <option value="rename_column">Rename column</option>
          <option value="drop_column">Drop column</option>
          <option value="create_index">Create index</option>
          <option value="drop_index">Drop index</option>
          <option value="alter_column_type" disabled={!pg}>
            Change column type{!pg ? " · requires SQLite table rebuild" : ""}
          </option>
          <option value="alter_column_nullability" disabled={!pg}>
            Change nullability{!pg ? " · requires SQLite table rebuild" : ""}
          </option>
          <option value="alter_column_default" disabled={!pg}>
            Change default{!pg ? " · requires SQLite table rebuild" : ""}
          </option>
          <option value="add_foreign_key" disabled={!pg}>
            Add relationship{!pg ? " · requires SQLite table rebuild" : ""}
          </option>
        </select>
      </label>
      {action !== "alter_table_add_column" && action !== "drop_index" ? (
        <label>
          Column
          <select value={column} onChange={(e) => setColumn(e.target.value)}>
            {schema.columns.map((item) => (
              <option key={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
      ) : null}
      {[
        "alter_table_add_column",
        "rename_column",
        "create_index",
        "drop_index",
        "add_foreign_key",
      ].includes(action) ? (
        <label>
          {action.includes("index")
            ? "Index name"
            : action === "add_foreign_key"
              ? "Constraint name"
              : "Column name"}
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      ) : null}
      {[
        "alter_table_add_column",
        "alter_column_type",
        "alter_column_default",
      ].includes(action) ? (
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value)}>
            {(pg
              ? [
                  "TEXT",
                  "INTEGER",
                  "BIGINT",
                  "BOOLEAN",
                  "NUMERIC",
                  "DOUBLE PRECISION",
                  "UUID",
                  "JSONB",
                  "TIMESTAMPTZ",
                  "DATE",
                ]
              : [
                  "TEXT",
                  "INTEGER",
                  "REAL",
                  "BLOB",
                  "NUMERIC",
                  "BOOLEAN",
                  "DATE",
                  "DATETIME",
                ]
            ).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      ) : null}
      {action === "alter_table_add_column" ||
      action === "alter_column_nullability" ? (
        <label>
          <span>
            <input
              type="checkbox"
              checked={nullable}
              onChange={(e) => setNullable(e.target.checked)}
            />{" "}
            Nullable
          </span>
        </label>
      ) : null}
      {action === "alter_table_add_column" ||
      action === "alter_column_default" ? (
        <label>
          Default value
          <input
            value={defaultValue}
            onChange={(e) => setDefaultValue(e.target.value)}
          />
        </label>
      ) : null}
      {action === "create_index" ? (
        <label>
          <span>
            <input
              type="checkbox"
              checked={unique}
              onChange={(e) => setUnique(e.target.checked)}
            />{" "}
            Unique index
          </span>
        </label>
      ) : null}
      {action === "add_foreign_key" ? (
        <>
          <label>
            Referenced table
            <input
              value={refTable}
              onChange={(e) => setRefTable(e.target.value)}
            />
          </label>
          <label>
            Referenced column
            <input
              value={refColumn}
              onChange={(e) => setRefColumn(e.target.value)}
            />
          </label>
        </>
      ) : null}
      <button
        className="db-button secondary"
        type="submit"
        disabled={busy || !source.writable}
      >
        Preview SQL
      </button>
      {preview ? (
        <>
          <pre>{preview}</pre>
          <label>
            <span>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => {
                  e.stopPropagation();
                  setAcknowledged(e.target.checked);
                }}
              />{" "}
              Apply this schema change to {source.label}. Dropping a column or
              index can remove data or constraints.
            </span>
          </label>
          <button
            className="db-button primary"
            type="button"
            disabled={busy || !acknowledged}
            onClick={() => void run(true)}
          >
            Apply schema change
          </button>
        </>
      ) : null}
    </form>
  );
}
