/**
 * Reusable Database Studio HTTP request handler.
 *
 * Hosts inject identity + source resolution only:
 *   - listSources(ctx)
 *   - resolveSource(ctx, sourceId) → { source, adapter, ... }
 *   - readMetrics?(ctx, sourceId, range)  (optional)
 *   - onError?(error, ctx)
 *
 * IAM, OAuth, and credential vaults stay host-owned.
 */

import { withHonestCapabilities } from './capabilities.js';
import { buildDdlSql, DDL_ACTIONS } from './ddl.js';
import { readTableRows } from './rows.js';
import { assertSqlAllowed } from './sql-guard.js';

function clean(value) {
  return value == null ? '' : String(value).trim();
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function defaultSha256Hex(value) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const bytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(String(value || '')),
    );
    return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Node fallback without importing node:crypto at module top (Workers-safe).
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(String(value || '')).digest('hex');
}

const DEFAULT_ROUTES = Object.freeze([
  'sources',
  'metrics',
  'tables',
  'schema',
  'rows',
  'query',
  'ddl',
  'resources',
  'account-metrics',
]);

/**
 * @param {{
 *   pathPrefix?: string,
 *   listSources: (ctx: object) => Promise<{ sources: object[], connections?: object }>,
 *   resolveSource: (ctx: object, sourceId: string) => Promise<{ source: object, adapter: object }>,
 *   readMetrics?: (ctx: object, sourceId: string, range: string) => Promise<object>,
 *   manageResource?: (ctx: object, input: object) => Promise<object>,
 *   readAccountMetrics?: (ctx: object, accountId: string, range: string) => Promise<object>,
 *   onError?: (error: Error, ctx: object) => void | Promise<void>,
 *   sha256Hex?: (value: string) => Promise<string>,
 *   requireAccount?: boolean,
 * }} options
 */
export function createDatabaseRequestHandler(options = {}) {
  const pathPrefix = clean(options.pathPrefix || '/api/database').replace(/\/$/, '') || '/api/database';
  const listSources = options.listSources;
  const resolveSource = options.resolveSource;
  const readMetrics = options.readMetrics;
  const onError = options.onError;
  const sha256Hex = options.sha256Hex || defaultSha256Hex;
  const requireAccount = options.requireAccount !== false;

  if (typeof listSources !== 'function') throw new Error('listSources_required');
  if (typeof resolveSource !== 'function') throw new Error('resolveSource_required');

  async function withResolved(ctx, sourceId, fn) {
    const resolved = await resolveSource(ctx, sourceId);
    if (!resolved?.adapter || !resolved?.source) {
      throw new Error('database_source_not_found');
    }
    const adapter = withHonestCapabilities(resolved.adapter);
    return fn({ ...resolved, adapter });
  }

  async function requireRowIdentity(adapter, body) {
    const schema = await adapter.describeTable({ name: body.table, schema: body.schema });
    const keys = (schema.columns || []).filter(column => column.primaryKey);
    if (!keys.length || keys.some(key => body.where?.[key.name] == null)) throw new Error("stable_row_identity_required");
  }

  function isDatabaseRequest(pathname) {
    const path = clean(pathname);
    return DEFAULT_ROUTES.some((route) => path === `${pathPrefix}/${route}`);
  }

  /**
   * @param {Request} request
   * @param {{ accountId?: string|null, env?: object, [key: string]: unknown }} [ctx]
   */
  async function handle(request, ctx = {}) {
    const accountId = clean(ctx.accountId);
    if (requireAccount && !accountId) {
      return json({ ok: false, error: 'unauthorized' }, 401);
    }
    const url = new URL(request.url);
    const requestCtx = { ...ctx, accountId, request, url };

    try {
      if (url.pathname === `${pathPrefix}/sources` && request.method === 'GET') {
        return json({ ok: true, ...(await listSources(requestCtx)) });
      }

      if (url.pathname === `${pathPrefix}/resources` && request.method === "POST") {
        if (typeof options.manageResource !== "function") return json({ ok: false, error: "database_management_not_configured" }, 501);
        const body = await request.json();
        return json({ ok: true, result: await options.manageResource(requestCtx, body) });
      }
      if (url.pathname === `${pathPrefix}/account-metrics` && request.method === "GET") {
        if (typeof options.readAccountMetrics !== "function") return json({ ok: false, error: "account_metrics_not_configured" }, 501);
        return json(await options.readAccountMetrics(requestCtx, clean(url.searchParams.get("account_id")), clean(url.searchParams.get("range")) || "24h"));
      }

      const sourceId =
        clean(url.searchParams.get('source_id')) ||
        clean(
          request.method !== 'GET'
            ? (await request.clone().json().catch(() => ({}))).source_id
            : '',
        );

      if (url.pathname === `${pathPrefix}/metrics` && request.method === 'GET') {
        if (typeof readMetrics !== 'function') {
          return json({ ok: false, error: 'metrics_not_configured' }, 501);
        }
        return json(
          await readMetrics(requestCtx, sourceId, clean(url.searchParams.get('range')) || '24h'),
        );
      }

      if (url.pathname === `${pathPrefix}/tables` && request.method === 'GET') {
        const payload = await withResolved(requestCtx, sourceId, async ({ source, adapter }) => ({
          ok: true,
          source,
          tables: await adapter.listTables(),
        }));
        return json(payload);
      }

      if (url.pathname === `${pathPrefix}/schema` && request.method === 'GET') {
        const table = clean(url.searchParams.get('table'));
        const schema = clean(url.searchParams.get('schema')) || undefined;
        const payload = await withResolved(requestCtx, sourceId, async ({ source, adapter }) => ({
          ok: true,
          source,
          schema: await adapter.describeTable({ name: table, schema }),
        }));
        return json(payload);
      }

      if (url.pathname === `${pathPrefix}/rows` && request.method === 'GET') {
        const payload = await withResolved(requestCtx, sourceId, async ({ source, adapter }) => ({
          ok: true,
          source,
          ...(await readTableRows(adapter, source, url.searchParams)),
        }));
        return json(payload);
      }

      if (url.pathname === `${pathPrefix}/query` && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const id = clean(body.source_id);
        const payload = await withResolved(requestCtx, id, async ({ source, adapter }) => {
          const kind = assertSqlAllowed(source, body.sql, body);
          const result = await adapter.query({
            sql: body.sql,
            params: Array.isArray(body.params) ? body.params : [],
          });
          return {
            ok: true,
            source,
            receipt: {
              kind: kind.first,
              mutating: kind.mutating,
              destructive: kind.destructive,
              sql_hash: await sha256Hex(clean(body.sql)),
              source_id: source.id,
              account_id: accountId || null,
            },
            ...result,
          };
        });
        return json(payload);
      }

      if (url.pathname === `${pathPrefix}/ddl` && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const id = clean(body.source_id);
        const action = clean(body.action || 'create_table').toLowerCase();
        if (!DDL_ACTIONS.includes(action)) {
          return json({ ok: false, error: 'ddl_action_unsupported' }, 400);
        }
        const payload = await withResolved(requestCtx, id, async ({ source, adapter }) => {
          if (source.writable === false) throw new Error('database_read_only');
          const built = buildDdlSql({
            ...body,
            action,
            engine: source.engine || source.provider || adapter.dialect,
          });
          if (body.preview_only === true || body.dry_run === true) {
            return {
              ok: true,
              preview: true,
              source,
              sql: built.sql,
              table_name: built.tableName || null,
              schema: built.schema ?? null,
              action: built.action,
            };
          }
          const kind = assertSqlAllowed(source, built.sql, {
            studio_approved: body.studio_approved === true,
            destructive_confirmed: body.destructive_confirmed === true,
          });
          const result = await adapter.query({ sql: built.sql, params: [] });
          return {
            ok: true,
            source,
            sql: built.sql,
            table_name: built.tableName || null,
            schema: built.schema ?? null,
            action: built.action,
            receipt: {
              kind: kind.first,
              action: built.action,
              mutating: kind.mutating,
              destructive: kind.destructive,
              sql_hash: await sha256Hex(built.sql),
              source_id: source.id,
              account_id: accountId || null,
              table_name: built.tableName || null,
            },
            ...result,
          };
        });
        return json(payload);
      }

      if (url.pathname === `${pathPrefix}/rows` && request.method === 'POST') {
        const body = await request.json().catch(() => ({}));
        const payload = await withResolved(requestCtx, body.source_id, async ({ source, adapter }) => {
          if (source.writable === false || typeof adapter.insert !== 'function') {
            throw new Error('database_read_only');
          }
          const result = await adapter.insert({
            table: body.table,
            schema: body.schema,
            values: body.values,
          });
          return { ok: true, source, result };
        });
        return json(payload);
      }

      if (url.pathname === `${pathPrefix}/rows` && request.method === 'PATCH') {
        const body = await request.json().catch(() => ({}));
        const payload = await withResolved(requestCtx, body.source_id, async ({ source, adapter }) => {
          if (source.writable === false || typeof adapter.update !== 'function') {
            throw new Error('database_read_only');
          }
          await requireRowIdentity(adapter, body);
          const result = await adapter.update({
            table: body.table,
            schema: body.schema,
            values: body.values,
            where: body.where,
          });
          return { ok: true, source, result };
        });
        return json(payload);
      }

      if (url.pathname === `${pathPrefix}/rows` && request.method === 'DELETE') {
        const body = await request.json().catch(() => ({}));
        const payload = await withResolved(requestCtx, body.source_id, async ({ source, adapter }) => {
          if (source.writable === false || typeof adapter.delete !== 'function') {
            throw new Error('database_read_only');
          }
          await requireRowIdentity(adapter, body);
          const result = await adapter.delete({
            table: body.table,
            schema: body.schema,
            where: body.where,
          });
          return { ok: true, source, result };
        });
        return json(payload);
      }

      return json({ ok: false, error: 'not_found' }, 404);
    } catch (error) {
      if (typeof onError === 'function') {
        try {
          await onError(error, requestCtx);
        } catch {
          /* host logging must not mask the original error */
        }
      }
      return json(
        {
          ok: false,
          error: error?.message || 'database_request_failed',
          requires_approval: error?.requiresApproval === true,
          requires_destructive_confirmation: error?.requiresDestructiveConfirmation === true,
          accounts: Array.isArray(error?.accounts) ? error.accounts : undefined,
          connect_url: error?.connect_url || undefined,
        },
        Number(error?.status || 400),
      );
    }
  }

  return {
    pathPrefix,
    isDatabaseRequest,
    handle,
    routes: DEFAULT_ROUTES,
  };
}
