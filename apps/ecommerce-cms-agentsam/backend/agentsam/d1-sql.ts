/**
 * SQL guard for the agentsam_d1_* tools (query, write, delete).
 *
 * D1 has no read-only connection and no per-table permissions, so this guard has to be correct on its own.
 * It tokenizes the statement the way SQLite does (string literals, quoted identifiers, line and block
 * comments), so a keyword or table name hidden inside a literal can neither cause a false rejection nor
 * smuggle something past the checks.
 */
export const D1_SQL_MAX_CHARS = 4000;

export type D1Kind = "query" | "write" | "delete";
export type D1Rejection = { ok: false; error: string; detail?: string };
export type D1Statement = {
  ok: true;
  sql: string;
  operation: "select" | "insert" | "replace" | "update" | "delete";
  table: string | null;
  /** SELECT count(*) predicting how many rows an UPDATE or DELETE will touch; null for everything else. */
  countSql: string | null;
  /** Leading positional params that belong to the part of the statement the count query leaves out. */
  countSkipParams: number;
};
export type D1Check = D1Statement | D1Rejection;

/** Credentials, sessions, tokens, nonces. An agent may neither read nor write these. Matched by name so it holds on any install. */
export const SECRET_TABLE = /(?:^|_)(?:sessions?|tokens?|secrets?|credentials?|passwords?|oauth|nonces?)(?:_|$)|^auth_/i;
/** Identity and tenancy, the agent's own configuration and logs, provider state, engine internals. Readable, never writable from chat. */
export const MANAGED_TABLE = /^(?:accounts?|account_.+|agentsam_.+|completeful_.+|sqlite_.+|_cf_.+)$/i;

const FIRST_WORDS: Record<D1Kind, readonly string[]> = {
  query: ["select", "with"],
  write: ["insert", "update", "replace"],
  delete: ["delete"],
};
const FIRST_WORD_ERROR: Record<D1Kind, string> = {
  query: "select_only",
  write: "write_requires_insert_update_or_replace",
  delete: "delete_requires_delete_statement",
};
const ADMIN_WORDS = new Set([
  "drop", "alter", "create", "attach", "detach", "pragma", "vacuum", "reindex", "analyze",
  "begin", "commit", "rollback", "savepoint", "release",
]);
const TABLE_KEYWORDS = new Set(["from", "join", "into", "update"]);
const NOT_A_TABLE = new Set([
  "where", "join", "left", "right", "inner", "outer", "cross", "natural", "full", "on", "using", "group",
  "order", "limit", "offset", "set", "values", "select", "union", "intersect", "except", "having",
  "returning", "default", "indexed", "not", "window", "from", "into", "with", "and", "or",
]);

type Token = { type: "space" | "word" | "num" | "ident" | "string" | "punct"; raw: string; value: string; start: number };

const reject = (error: string, detail?: string): D1Rejection => (detail ? { ok: false, error, detail } : { ok: false, error });

/** Comments become a single space token. `start` is the offset in the comment-free text the tokens concatenate to. */
function tokenize(sql: string): Token[] | null {
  const tokens: Token[] = [];
  let out = 0;
  const push = (type: Token["type"], raw: string, value: string = raw) => {
    tokens.push({ type, raw, value, start: out });
    out += raw.length;
  };
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (c === "-" && n === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      push("space", " ");
      continue;
    }
    if (c === "/" && n === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      push("space", " ");
      continue;
    }
    if (/\s/.test(c)) {
      let j = i + 1;
      while (j < sql.length && /\s/.test(sql[j])) j++;
      push("space", sql.slice(i, j));
      i = j;
      continue;
    }
    if (c === "'" || c === '"' || c === "`" || c === "[") {
      const close = c === "[" ? "]" : c;
      let j = i + 1;
      let value = "";
      for (;;) {
        if (j >= sql.length) return null;
        if (sql[j] === close) {
          if (close !== "]" && sql[j + 1] === close) {
            value += close;
            j += 2;
            continue;
          }
          break;
        }
        value += sql[j];
        j++;
      }
      push(c === "'" ? "string" : "ident", sql.slice(i, j + 1), value.toLowerCase());
      i = j + 1;
      continue;
    }
    const rest = sql.slice(i);
    const word = /^[A-Za-z_\u0080-\uffff][\w$\u0080-\uffff]*/.exec(rest);
    if (word) {
      push("word", word[0], word[0].toLowerCase());
      i += word[0].length;
      continue;
    }
    const num = /^\d[\w.]*/.exec(rest) || /^\.\d\w*/.exec(rest);
    if (num) {
      push("num", num[0]);
      i += num[0].length;
      continue;
    }
    push("punct", c);
    i++;
  }
  return tokens;
}

const isPunct = (t: Token | undefined, ch: string) => !!t && t.type === "punct" && t.raw === ch;
const isName = (t: Token | undefined) => !!t && (t.type === "word" || t.type === "ident");
const isWord = (t: Token | undefined, value: string) => !!t && t.type === "word" && t.value === value;

/** Every table a statement names, in order of appearance (target first for INSERT, UPDATE and DELETE). */
function tableRefs(sig: Token[]): string[] {
  const refs: string[] = [];
  for (let i = 0; i < sig.length; i++) {
    const kw = sig[i];
    if (kw.type !== "word" || !TABLE_KEYWORDS.has(kw.value)) continue;
    let j = i + 1;
    if (kw.value === "update" && isWord(sig[j], "or")) j += 2;
    for (;;) {
      const first = sig[j];
      if (!isName(first) || (first.type === "word" && NOT_A_TABLE.has(first.value))) break;
      let name = first.value;
      j++;
      while (isPunct(sig[j], ".") && isName(sig[j + 1])) {
        name = sig[j + 1].value;
        j += 2;
      }
      refs.push(name);
      if (isWord(sig[j], "as")) j++;
      if (isName(sig[j]) && !(sig[j].type === "word" && NOT_A_TABLE.has(sig[j].value))) j++;
      if (kw.value === "from" && isPunct(sig[j], ",")) {
        j++;
        continue;
      }
      break;
    }
  }
  return refs;
}

function usesNonPositionalParams(sig: Token[]): boolean {
  return sig.some((t, i) => {
    const next = sig[i + 1];
    if (t.type !== "punct" || !next || next.start !== t.start + 1) return false;
    return (t.raw === "?" && next.type === "num") || ((t.raw === ":" || t.raw === "@" || t.raw === "$") && next.type === "word");
  });
}

export function checkSql(kind: D1Kind, input: unknown): D1Check {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return reject("sql_required");
  if (raw.length > D1_SQL_MAX_CHARS) return reject("sql_too_long");
  const tokens = tokenize(raw);
  if (!tokens) return reject("sql_unterminated_literal");
  const text = tokens.map((t) => t.raw).join("");
  let sig = tokens.filter((t) => t.type !== "space");
  if (isPunct(sig[sig.length - 1], ";")) sig = sig.slice(0, -1);
  if (sig.some((t) => isPunct(t, ";"))) return reject("single_statement_only");
  const first = sig[0];
  const op = first && first.type === "word" ? first.value : "";
  if (!FIRST_WORDS[kind].includes(op)) return reject(FIRST_WORD_ERROR[kind]);
  const sqlEnd = sig[sig.length - 1].start + sig[sig.length - 1].raw.length;
  const sql = text.slice(0, sqlEnd).trim();

  for (let i = 0; i < sig.length; i++) {
    const t = sig[i];
    if (t.type !== "word") continue;
    if (ADMIN_WORDS.has(t.value)) return reject(kind === "query" ? "write_or_admin_sql_blocked" : "ddl_or_admin_sql_blocked");
    const replaces = t.value === "replace" && (isWord(sig[i + 1], "into") || isWord(sig[i - 1], "or"));
    if (kind === "query" && (t.value === "insert" || t.value === "update" || t.value === "delete" || replaces)) {
      return reject("write_or_admin_sql_blocked");
    }
    if (kind === "write" && t.value === "delete") return reject("use_agentsam_d1_delete");
    if (kind === "delete" && (t.value === "insert" || t.value === "update" || replaces)) return reject("delete_tool_only_deletes");
  }

  const refs = tableRefs(sig);
  const table = refs[0] ?? null;
  for (const name of refs) {
    if (SECRET_TABLE.test(name)) return reject("protected_table", '"' + name + '" holds credentials or sessions and is not available to the agent.');
  }
  if (kind !== "query") {
    if (!table) return reject("table_not_found_in_statement");
    if (MANAGED_TABLE.test(table)) {
      return reject("protected_table", '"' + table + '" is managed by the app (accounts, agent configuration or provider state) and cannot be written from chat.');
    }
  }

  const operation = (op === "with" ? "select" : op) as D1Statement["operation"];
  let countSql: string | null = null;
  let countSkipParams = 0;
  if (op === "update" || op === "delete") {
    let depth = 0;
    let whereIdx = -1;
    let setIdx = -1;
    let returningIdx = -1;
    let fromAfterSet = false;
    sig.forEach((t, i) => {
      if (isPunct(t, "(")) depth++;
      else if (isPunct(t, ")")) depth--;
      else if (depth === 0 && t.type === "word") {
        if (t.value === "where" && whereIdx < 0) whereIdx = i;
        if (t.value === "set" && setIdx < 0) setIdx = i;
        if (t.value === "returning" && returningIdx < 0) returningIdx = i;
        if (t.value === "from" && setIdx >= 0) fromAfterSet = true;
      }
    });
    if (whereIdx < 0) return reject("where_required", "UPDATE and DELETE need a WHERE clause. To change every row, say so explicitly with WHERE 1 = 1.");
    const endOffset = returningIdx >= 0 ? sig[returningIdx].start : sqlEnd;
    if (op === "delete") {
      if (!isWord(sig[1], "from") || !sig[2]) return reject("delete_requires_delete_statement");
      countSql = "SELECT count(*) AS n FROM " + text.slice(sig[2].start, endOffset).trim();
    } else {
      const ti = isWord(sig[1], "or") ? 3 : 1;
      if (setIdx < 0 || whereIdx < setIdx || !sig[ti] || sig[ti] === sig[setIdx]) return reject("update_requires_set");
      if (fromAfterSet) return reject("update_from_not_supported");
      if (usesNonPositionalParams(sig)) return reject("positional_params_only", "Use plain ? placeholders in UPDATE statements.");
      const tableText = text.slice(sig[ti].start, sig[setIdx].start).trim();
      countSql = "SELECT count(*) AS n FROM " + tableText + " " + text.slice(sig[whereIdx].start, endOffset).trim();
      countSkipParams = sig.slice(0, whereIdx).filter((t) => isPunct(t, "?")).length;
    }
  }
  return { ok: true, sql, operation, table, countSql, countSkipParams };
}

/** Back-compat shape used by the query tool. */
export function readOnlySql(input: unknown): { ok: true; sql: string } | D1Rejection {
  const checked = checkSql("query", input);
  return checked.ok ? { ok: true, sql: checked.sql } : checked;
}
