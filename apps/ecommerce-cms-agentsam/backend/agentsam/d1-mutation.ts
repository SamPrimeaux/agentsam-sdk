/**
 * agentsam_d1_write and agentsam_d1_delete.
 *
 * Every call is two steps. The first returns a preview (statement, table, how many rows it would touch) and a
 * confirm code, and changes nothing. The code is an HMAC over the exact statement, params, row cap and user, so
 * it only unlocks that one statement, and the model cannot know it before the preview runs. After the owner
 * agrees, the model repeats the call with the code and the statement executes.
 */
import { checkSql, type D1Kind } from "./d1-sql.ts";

const CONFIRM_WINDOW_MS = 10 * 60 * 1000;
const DEFAULT_MAX_ROWS = 100;
const HARD_MAX_ROWS = 10000;
const MAX_PARAMS = 32;

type Env = { DB?: any; AGENTSAM_BRIDGE_KEY?: string };
type Options = { user?: { id?: string | number; email?: string } | null };
type Bind = string | number | null;

function readBinds(value: unknown): Bind[] | null {
  const list = Array.isArray(value) ? value : [];
  if (list.length > MAX_PARAMS) return null;
  const out: Bind[] = [];
  for (const v of list) {
    if (v === null || typeof v === "string" || typeof v === "number") out.push(v);
    else if (typeof v === "boolean") out.push(v ? 1 : 0);
    else return null;
  }
  return out;
}

function readMaxRows(value: unknown): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, HARD_MAX_ROWS) : DEFAULT_MAX_ROWS;
}

async function confirmCode(secret: string, parts: unknown[]): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode("agentsam_d1_confirm:v1:" + secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(JSON.stringify(parts))));
  return Array.from(sig.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
}

const sqlError = (error: unknown) => ({
  ok: false,
  error: "sql_error",
  message: String((error as { message?: string })?.message || error).slice(0, 300),
});

export async function runD1Mutation(
  env: Env,
  kind: Exclude<D1Kind, "query">,
  params: Record<string, unknown> = {},
  options: Options = {},
) {
  if (!env.DB?.prepare) return { ok: false, error: "DB_not_bound" };
  const checked = checkSql(kind, params.sql);
  if (!checked.ok) return { ok: false, error: checked.error, ...(checked.detail ? { message: checked.detail } : {}) };
  const binds = readBinds(params.params);
  if (!binds) return { ok: false, error: "invalid_params" };
  const secret = String(env.AGENTSAM_BRIDGE_KEY || "").trim();
  if (!secret) {
    return {
      ok: false,
      error: "confirm_key_not_configured",
      message: "Write confirmation needs the AGENTSAM_BRIDGE_KEY secret on this deployment. Nothing was run.",
    };
  }
  const maxRows = readMaxRows(params.max_rows);

  let wouldAffect: number | null = null;
  if (checked.countSql) {
    try {
      const row = await env.DB.prepare(checked.countSql).bind(...binds.slice(checked.countSkipParams)).first();
      wouldAffect = Number(row?.n ?? 0);
    } catch (error) {
      return sqlError(error);
    }
    if (wouldAffect > maxRows) {
      return {
        ok: false,
        error: "too_many_rows",
        would_affect: wouldAffect,
        max_rows: maxRows,
        message:
          "This would touch " + wouldAffect + " rows. If that is intended, ask the owner, then call again with max_rows set to at least " +
          wouldAffect + " (limit " + HARD_MAX_ROWS + ").",
      };
    }
  }

  const userId = String(options.user?.id ?? options.user?.email ?? "");
  const bucket = Math.floor(Date.now() / CONFIRM_WINDOW_MS);
  const material = (b: number) => [kind, checked.sql, binds, userId, maxRows, b];
  const current = await confirmCode(secret, material(bucket));
  const supplied = typeof params.confirm === "string" ? params.confirm.trim().toLowerCase() : "";
  const previous = supplied && supplied !== current ? await confirmCode(secret, material(bucket - 1)) : null;
  if (!supplied || (supplied !== current && supplied !== previous)) {
    return {
      ok: false,
      confirmation_required: true,
      ...(supplied ? { code_mismatch: true } : {}),
      confirm: current,
      expires_in_minutes: 10,
      preview: {
        operation: checked.operation,
        table: checked.table,
        sql: checked.sql,
        params: binds,
        rows_affected: wouldAffect,
        ...(checked.countSql ? { max_rows: maxRows } : {}),
      },
      message:
        "NOT EXECUTED. Show the owner exactly what will change (operation, table, rows_affected and the SQL) and ask whether to proceed. " +
        "Only after they say yes, call this tool again with the same sql and params and confirm set to the code above. " +
        "Never run it without the owner saying yes.",
    };
  }

  try {
    const out = await env.DB.prepare(checked.sql).bind(...binds).all();
    const rows = Array.isArray(out?.results) ? out.results : [];
    return {
      ok: true,
      operation: checked.operation,
      table: checked.table,
      changes: Number(out?.meta?.changes ?? 0),
      last_row_id: out?.meta?.last_row_id ?? null,
      ...(rows.length ? { rows: rows.slice(0, 50) } : {}),
    };
  } catch (error) {
    return sqlError(error);
  }
}
