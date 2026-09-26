import { Client } from 'pg';
import {
  createD1Adapter,
  createD1BindingAdapter,
  createHyperdriveAdapter,
  readD1Metrics,
  readPostgresMetrics,
} from '../../../../packages/agentsam-database-editor/src/index.js';
import { decryptSecret as decryptCloudflareSecret } from '../../../../packages/connectors/cloudflare/src/vault.js';

const RANGE_SECONDS = Object.freeze({
  '1h': 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
});

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

function parseJson(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function splitScopes(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean);
  return clean(value).split(/[\s,]+/).filter(Boolean);
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(value || '')),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function resolveDeploymentOwnerAccount(env) {
  const token = clean(env?.AGENTSAM_API_KEY);
  if (!token || !env?.DB?.prepare) return null;
  try {
    const hash = await sha256Hex(token);
    const row = await env.DB.prepare(
      `SELECT account_id
         FROM agentsam_api_credentials
        WHERE credential_hash = ?
          AND revoked_at_unix IS NULL
          AND (expires_at_unix IS NULL OR expires_at_unix > unixepoch())
        LIMIT 1`,
    ).bind(hash).first();
    return clean(row?.account_id) || null;
  } catch {
    return null;
  }
}

async function resolveCloudflareCredential(env, accountId) {
  if (!env?.DB?.prepare || !accountId) return null;

  try {
    const row = await env.DB.prepare(
      `SELECT id, account_identifier, account_display, access_token, scopes, scope,
              metadata_json, expires_at, updated_at
         FROM user_oauth_tokens
        WHERE user_id = ?
          AND LOWER(provider) = 'cloudflare'
          AND COALESCE(is_active, 1) = 1
          AND (revoked_at IS NULL OR revoked_at = 0)
        ORDER BY updated_at DESC
        LIMIT 1`,
    ).bind(accountId).first();

    if (row?.access_token) {
      const metadata = parseJson(row.metadata_json);
      return {
        token: String(row.access_token),
        cloudflareAccountId:
          clean(row.account_identifier) ||
          clean(metadata.cloudflare_account_id) ||
          null,
        scopes: splitScopes(row.scopes || row.scope),
        expiresAt: row.expires_at == null ? null : Number(row.expires_at) || null,
        source: 'user_oauth_tokens',
      };
    }
  } catch {
    // Fall through to encrypted legacy connection.
  }

  try {
    const row = await env.DB.prepare(
      `SELECT connection_id, cloudflare_account_id, scopes, access_token_encrypted,
              expires_at, updated_at
         FROM agentsam_cloudflare_connections
        WHERE owner_id = ? AND status = 'connected'
        ORDER BY updated_at DESC
        LIMIT 1`,
    ).bind(accountId).first();
    if (!row?.access_token_encrypted) return null;
    const token = await decryptCloudflareSecret(
      env,
      row.access_token_encrypted,
      `cloudflare-connection:${accountId}`,
    );
    return {
      token,
      cloudflareAccountId: clean(row.cloudflare_account_id) || null,
      scopes: splitScopes(row.scopes),
      expiresAt: row.expires_at == null ? null : Number(row.expires_at) || null,
      source: 'agentsam_cloudflare_connections',
    };
  } catch {
    return null;
  }
}

async function cloudflareJson(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) {
    const error = new Error(
      body?.errors?.[0]?.message ||
      body?.message ||
      `Cloudflare request failed (${response.status})`,
    );
    error.status = response.status;
    throw error;
  }
  return body;
}

async function resolveCloudflareAccountId(credential) {
  if (credential?.cloudflareAccountId && /^[a-f0-9]{32}$/i.test(credential.cloudflareAccountId)) {
    return credential.cloudflareAccountId;
  }
  const body = await cloudflareJson(
    'https://api.cloudflare.com/client/v4/accounts?per_page=2',
    credential.token,
  );
  const accounts = Array.isArray(body?.result) ? body.result : [];
  if (accounts.length !== 1) {
    if (!accounts.length) throw new Error('cloudflare_account_not_found');
    throw new Error('cloudflare_account_selection_required');
  }
  return clean(accounts[0]?.id);
}

async function listCloudflareD1Sources(env, accountId) {
  const credential = await resolveCloudflareCredential(env, accountId);
  if (!credential?.token) {
    return {
      sources: [],
      connection: {
        provider: 'cloudflare',
        status: 'not_connected',
        connect_url: '/api/connections/cloudflare/start?packs=data&return_to=/database',
      },
    };
  }

  try {
    const cloudflareAccountId = await resolveCloudflareAccountId(credential);
    const body = await cloudflareJson(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/d1/database?per_page=100`,
      credential.token,
    );
    const rows = Array.isArray(body?.result) ? body.result : [];
    const scopeSet = new Set(credential.scopes.map((scope) => scope.toLowerCase()));
    const writable =
      scopeSet.has('d1.write') ||
      scopeSet.has('d1:write') ||
      scopeSet.has('d1_write') ||
      scopeSet.has('com.cloudflare.api.account.d1.write');

    return {
      sources: rows.map((row) => {
        const databaseId = clean(row.uuid || row.id);
        return {
          id: `cf-d1:${databaseId}`,
          provider: 'cloudflare-d1',
          engine: 'sqlite',
          label: clean(row.name) || databaseId,
          account_id: cloudflareAccountId,
          database_id: databaseId,
          database_name: clean(row.name) || databaseId,
          file_size: Number(row.file_size || 0) || 0,
          num_tables: Number(row.num_tables || 0) || 0,
          writable,
          metrics: true,
          connection: 'oauth',
        };
      }),
      connection: {
        provider: 'cloudflare',
        status: 'connected',
        account_id: cloudflareAccountId,
        scopes: credential.scopes,
        reconnect_url: '/api/connections/cloudflare/start?packs=data&return_to=/database',
      },
    };
  } catch (error) {
    return {
      sources: [],
      connection: {
        provider: 'cloudflare',
        status: 'error',
        error: error?.message || String(error),
        reconnect_url: '/api/connections/cloudflare/start?packs=data&return_to=/database',
      },
    };
  }
}

async function withHyperdriveClient(env, fn) {
  if (!env?.HYPERDRIVE?.connectionString) throw new Error('hyperdrive_unavailable');
  const client = new Client({
    connectionString: env.HYPERDRIVE.connectionString,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    try {
      await client.end();
    } catch {
      // Best effort close.
    }
  }
}

async function getBoundD1Source(env, accountId) {
  const owner = await resolveDeploymentOwnerAccount(env);
  if (!owner || owner !== accountId || !env?.DB?.prepare) return null;
  const databaseId = clean(env.LOCAL_STUDIO_D1_DATABASE_ID);
  const databaseName = clean(env.LOCAL_STUDIO_D1_DATABASE_NAME) || 'AgentSam platform D1';
  if (!databaseId) return null;
  try {
    const [tableRow, sizeRow] = await Promise.all([
      env.DB.prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      ).first(),
      env.DB.prepare("PRAGMA page_count").first(),
    ]);
    const pageSize = await env.DB.prepare("PRAGMA page_size").first().catch(() => null);
    return {
      id: 'binding-d1:primary',
      provider: 'cloudflare-d1',
      engine: 'sqlite',
      label: databaseName,
      database_name: databaseName,
      database_id: databaseId,
      account_id: clean(env.CLOUDFLARE_ACCOUNT_ID) || null,
      file_size:
        Number(sizeRow?.page_count || 0) * Number(pageSize?.page_size || 0),
      num_tables: Number(tableRow?.count || 0),
      writable: true,
      metrics: true,
      connection: 'worker_binding',
    };
  } catch (error) {
    return {
      id: 'binding-d1:primary',
      provider: 'cloudflare-d1',
      engine: 'sqlite',
      label: databaseName,
      database_name: databaseName,
      database_id: databaseId,
      account_id: clean(env.CLOUDFLARE_ACCOUNT_ID) || null,
      file_size: 0,
      num_tables: 0,
      writable: false,
      metrics: true,
      connection: 'worker_binding',
      status: 'degraded',
      error: error?.message || String(error),
    };
  }
}

async function getHyperdriveSource(env, accountId) {
  const owner = await resolveDeploymentOwnerAccount(env);
  if (!owner || owner !== accountId || !env?.HYPERDRIVE?.connectionString) return null;

  return withHyperdriveClient(env, async (client) => {
    const started = Date.now();
    const result = await client.query(
      `SELECT current_database() AS database_name,
              pg_database_size(current_database())::bigint AS size_bytes`,
    );
    const row = result.rows?.[0] || {};
    return {
      id: 'hyperdrive:primary',
      provider: 'supabase-postgres',
      engine: 'postgres',
      accelerator: 'hyperdrive',
      label: clean(row.database_name) || 'Supabase Postgres',
      database_name: clean(row.database_name) || 'postgres',
      file_size: Number(row.size_bytes || 0) || 0,
      writable: true,
      metrics: true,
      connection: 'deployment_hyperdrive',
      latency_ms: Date.now() - started,
    };
  }).catch((error) => ({
    id: 'hyperdrive:primary',
    provider: 'supabase-postgres',
    engine: 'postgres',
    accelerator: 'hyperdrive',
    label: 'Supabase Postgres',
    database_name: 'postgres',
    file_size: 0,
    writable: false,
    metrics: true,
    connection: 'deployment_hyperdrive',
    status: 'degraded',
    error: error?.message || String(error),
  }));
}

async function listSources(env, accountId) {
  const [cloudflare, boundD1, hyperdrive] = await Promise.all([
    listCloudflareD1Sources(env, accountId),
    getBoundD1Source(env, accountId),
    getHyperdriveSource(env, accountId),
  ]);
  const oauthD1 = boundD1?.database_id
    ? cloudflare.sources.filter((source) => source.database_id !== boundD1.database_id)
    : cloudflare.sources;
  return {
    sources: [
      ...(boundD1 ? [boundD1] : []),
      ...oauthD1,
      ...(hyperdrive ? [hyperdrive] : []),
    ],
    connections: {
      cloudflare: cloudflare.connection,
      hyperdrive: hyperdrive
        ? {
            status: hyperdrive.status === 'degraded' ? 'degraded' : 'connected',
            source_id: hyperdrive.id,
            latency_ms: hyperdrive.latency_ms ?? null,
          }
        : { status: 'not_available' },
      local_sqlite: {
        status: 'requires_local_runtime',
        message: 'Local SQLite is exposed only by an attached AgentSam local runtime; no browser fake connection is created.',
      },
    },
  };
}

async function resolveSource(env, accountId, sourceId) {
  const id = clean(sourceId);
  if (!id) throw new Error('source_id_required');

  if (id.startsWith('cf-d1:')) {
    const databaseId = clean(id.slice('cf-d1:'.length));
    const credential = await resolveCloudflareCredential(env, accountId);
    if (!credential?.token) throw new Error('cloudflare_not_connected');
    const cloudflareAccountId = await resolveCloudflareAccountId(credential);
    const body = await cloudflareJson(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(cloudflareAccountId)}/d1/database?per_page=100`,
      credential.token,
    );
    const row = (Array.isArray(body?.result) ? body.result : []).find(
      (candidate) => clean(candidate.uuid || candidate.id) === databaseId,
    );
    if (!row) throw new Error('d1_database_not_authorized');
    const scopeSet = new Set(credential.scopes.map((scope) => scope.toLowerCase()));
    const writable =
      scopeSet.has('d1.write') ||
      scopeSet.has('d1:write') ||
      scopeSet.has('d1_write') ||
      scopeSet.has('com.cloudflare.api.account.d1.write');
    const source = {
      id,
      provider: 'cloudflare-d1',
      engine: 'sqlite',
      label: clean(row.name) || databaseId,
      account_id: cloudflareAccountId,
      database_id: databaseId,
      file_size: Number(row.file_size || 0) || 0,
      num_tables: Number(row.num_tables || 0) || 0,
      writable,
      metrics: true,
      connection: 'oauth',
    };
    return {
      source,
      adapter: createD1Adapter({
        id,
        label: source.label,
        token: credential.token,
        accountId: cloudflareAccountId,
        databaseId,
        writable,
      }),
      credential,
    };
  }

  throw new Error('database_source_not_found');
}

async function withResolvedSource(env, accountId, sourceId, fn) {
  const id = clean(sourceId);
  if (id === 'binding-d1:primary') {
    const source = await getBoundD1Source(env, accountId);
    if (!source || source.status === 'degraded') {
      throw new Error(source?.error || 'database_source_not_available');
    }
    return fn({
      source,
      adapter: createD1BindingAdapter({
        db: env.DB,
        id: source.id,
        label: source.label,
        writable: source.writable !== false,
      }),
      credential: await resolveCloudflareCredential(env, accountId),
    });
  }
  if (id === 'hyperdrive:primary') {
    const source = await getHyperdriveSource(env, accountId);
    if (!source || source.status === 'degraded') {
      throw new Error(source?.error || 'database_source_not_available');
    }
    return withHyperdriveClient(env, async (client) => {
      const adapter = createHyperdriveAdapter({
        id: source.id,
        label: source.label,
        query: (sql, params = []) => client.query(sql, params),
        writable: source.writable !== false,
      });
      return fn({ source, adapter, client });
    });
  }
  const resolved = await resolveSource(env, accountId, id);
  return fn(resolved);
}

function quoteSqliteIdent(value) {
  return `"${clean(value).replace(/"/g, '""')}"`;
}

function quotePgIdent(value) {
  return `"${clean(value).replace(/"/g, '""')}"`;
}

function sqlKind(sql) {
  const normalized = clean(sql)
    .replace(/^\s*(?:--[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/g, '')
    .trim();
  const first = normalized.split(/\s+/, 1)[0]?.toLowerCase() || '';
  const read = ['select', 'pragma', 'with', 'explain', 'show'].includes(first);
  const destructive = ['drop', 'truncate', 'alter', 'vacuum', 'reindex'].includes(first);
  const mutating = !read;
  return { first, read, mutating, destructive };
}

function assertSqlAllowed(source, sql, body = {}) {
  const kind = sqlKind(sql);
  if (!kind.first) throw new Error('sql_required');
  if (kind.mutating && source.writable === false) throw new Error('database_read_only');
  if (kind.mutating && body.studio_approved !== true) {
    const error = new Error('database_write_requires_approval');
    error.status = 409;
    error.requiresApproval = true;
    throw error;
  }
  if (kind.destructive && body.destructive_confirmed !== true) {
    const error = new Error('destructive_sql_requires_confirmation');
    error.status = 409;
    error.requiresDestructiveConfirmation = true;
    throw error;
  }
  return kind;
}

async function ensureMetricsTable(env) {
  if (!env?.DB?.prepare) return;
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS agentsam_database_metric_snapshots (
       id TEXT PRIMARY KEY,
       account_id TEXT NOT NULL,
       source_id TEXT NOT NULL,
       provider TEXT NOT NULL,
       captured_at INTEGER NOT NULL,
       queries_total INTEGER,
       rows_read_total INTEGER,
       rows_written_total INTEGER,
       size_bytes INTEGER,
       table_count INTEGER,
       connections INTEGER,
       max_connections INTEGER
     )`,
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_agentsam_db_metric_source_time
       ON agentsam_database_metric_snapshots(account_id, source_id, captured_at)`,
  ).run();
}

async function persistPostgresSnapshot(env, accountId, source, metric) {
  if (!env?.DB?.prepare) return;
  try {
    await ensureMetricsTable(env);
    const captured = Number(metric.capturedAt || Math.floor(Date.now() / 1000));
    await env.DB.prepare(
      `INSERT INTO agentsam_database_metric_snapshots (
         id, account_id, source_id, provider, captured_at,
         queries_total, rows_read_total, rows_written_total,
         size_bytes, table_count, connections, max_connections
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `dbm_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`,
      accountId,
      source.id,
      source.provider,
      captured,
      Math.round(Number(metric.totals?.queries || 0)),
      Math.round(Number(metric.totals?.rowsRead || 0)),
      Math.round(Number(metric.totals?.rowsWritten || 0)),
      Math.round(Number(metric.sizeBytes || 0)),
      Math.round(Number(metric.tables || 0)),
      Math.round(Number(metric.connections || 0)),
      Math.round(Number(metric.maxConnections || 0)),
    ).run();

    // Keep a bounded history; 31 days covers the longest UI range.
    await env.DB.prepare(
      `DELETE FROM agentsam_database_metric_snapshots
        WHERE account_id = ? AND source_id = ? AND captured_at < ?`,
    ).bind(accountId, source.id, captured - 31 * 24 * 60 * 60).run();
  } catch (error) {
    console.error('database_metrics_snapshot_failed', String(error?.message || error));
  }
}

async function loadPostgresSeries(env, accountId, sourceId, range) {
  if (!env?.DB?.prepare) return [];
  const seconds = RANGE_SECONDS[range] || RANGE_SECONDS['24h'];
  try {
    const { results } = await env.DB.prepare(
      `SELECT captured_at, queries_total, rows_read_total, rows_written_total,
              size_bytes, table_count, connections, max_connections
         FROM agentsam_database_metric_snapshots
        WHERE account_id = ? AND source_id = ? AND captured_at >= ?
        ORDER BY captured_at ASC
        LIMIT 1000`,
    ).bind(accountId, sourceId, Math.floor(Date.now() / 1000) - seconds).all();
    const rows = results || [];
    let previous = null;
    return rows.map((row) => {
      const current = {
        queries: Number(row.queries_total || 0),
        rowsRead: Number(row.rows_read_total || 0),
        rowsWritten: Number(row.rows_written_total || 0),
      };
      const point = {
        t: new Date(Number(row.captured_at) * 1000).toISOString(),
        queries: previous ? Math.max(0, current.queries - previous.queries) : 0,
        readQueries: null,
        writeQueries: null,
        rowsRead: previous ? Math.max(0, current.rowsRead - previous.rowsRead) : 0,
        rowsWritten: previous ? Math.max(0, current.rowsWritten - previous.rowsWritten) : 0,
        sizeBytes: Number(row.size_bytes || 0),
        tables: Number(row.table_count || 0),
        connections: Number(row.connections || 0),
        maxConnections: Number(row.max_connections || 0),
      };
      previous = current;
      return point;
    });
  } catch {
    return [];
  }
}

async function readMetrics(env, accountId, sourceId, range) {
  const requestedRange = Object.hasOwn(RANGE_SECONDS, range) ? range : '24h';
  return withResolvedSource(env, accountId, sourceId, async ({ source, adapter, credential, client }) => {
    if (source.provider === 'cloudflare-d1') {
      const cfCredential = credential || await resolveCloudflareCredential(env, accountId);
      const metricsAccountId =
        source.account_id ||
        (cfCredential ? await resolveCloudflareAccountId(cfCredential) : null);
      if (!cfCredential?.token || !metricsAccountId || !source.database_id) {
        return {
          ok: true,
          source,
          range: requestedRange,
          capacity: {
            usedBytes: Number(source.file_size || 0),
            usedLabel: null,
            limitBytes: null,
            limitLabel: null,
            pctUsed: null,
          },
          kpis: {
            queries: null,
            readQueries: null,
            writeQueries: null,
            rowsRead: null,
            rowsWritten: null,
            tables: Number(source.num_tables || 0),
            storage: Number(source.file_size || 0),
          },
          series: [],
          health: await adapter.health(),
          wired: false,
          warning: 'Connect Cloudflare OAuth with the data pack for D1 GraphQL metrics.',
        };
      }
      const metrics = await readD1Metrics({
        token: cfCredential.token,
        accountId: metricsAccountId,
        databaseId: source.database_id,
        range: requestedRange,
      });
      return {
        ok: true,
        source,
        range: requestedRange,
        capacity: {
          usedBytes: Number(source.file_size || 0),
          usedLabel: null,
          limitBytes: null,
          limitLabel: null,
          pctUsed: null,
        },
        kpis: {
          queries: metrics.totals.queries,
          readQueries: metrics.totals.readQueries,
          writeQueries: metrics.totals.writeQueries,
          rowsRead: metrics.totals.rowsRead,
          rowsWritten: metrics.totals.rowsWritten,
          tables: Number(source.num_tables || 0),
          storage: Number(source.file_size || 0),
        },
        series: metrics.series,
        health: await adapter.health(),
        wired: true,
      };
    }

    const metric = await readPostgresMetrics({
      provider: source.provider,
      query: (sql, params = []) => client.query(sql, params),
    });
    await persistPostgresSnapshot(env, accountId, source, metric);
    const series = await loadPostgresSeries(env, accountId, source.id, requestedRange);
    return {
      ok: true,
      source: { ...source, file_size: metric.sizeBytes || source.file_size },
      range: requestedRange,
      capacity: {
        usedBytes: metric.sizeBytes,
        usedLabel: null,
        limitBytes: null,
        limitLabel: null,
        pctUsed: null,
        connectionsUsed: metric.connections,
        connectionsMax: metric.maxConnections,
      },
      kpis: {
        queries: metric.totals.queries,
        rowsRead: metric.totals.rowsRead,
        rowsWritten: metric.totals.rowsWritten,
        tables: metric.tables,
        storage: metric.sizeBytes,
        connections: metric.connections,
      },
      series,
      health: {
        status: 'ok',
        latencyMs: metric.latencyMs,
        hyperdrive: 'healthy',
      },
      stats_reset: metric.statsReset,
      wired: true,
    };
  });
}

async function readTableRows(adapter, source, params) {
  const table = clean(params.get('table'));
  const schema = clean(params.get('schema')) || undefined;
  if (!table) throw new Error('table_required');
  const page = Math.max(1, Number(params.get('page') || 1) || 1);
  const limit = Math.min(200, Math.max(1, Number(params.get('limit') || 50) || 50));
  const offset = (page - 1) * limit;
  const schemaInfo = await adapter.describeTable({ name: table, schema });
  const columns = Array.isArray(schemaInfo.columns) ? schemaInfo.columns : [];
  const sort = clean(params.get('sort'));
  const dir = clean(params.get('dir')).toLowerCase() === 'desc' ? 'DESC' : 'ASC';
  if (sort && !columns.some((column) => column.name === sort)) {
    throw new Error('invalid_sort_column');
  }

  if (source.engine === 'postgres') {
    const qualified = `${quotePgIdent(schema || 'public')}.${quotePgIdent(table)}`;
    const order = sort ? ` ORDER BY ${quotePgIdent(sort)} ${dir}` : '';
    const [data, count] = await Promise.all([
      adapter.query({
        sql: `SELECT * FROM ${qualified}${order} LIMIT $1 OFFSET $2`,
        params: [limit, offset],
      }),
      adapter.query({ sql: `SELECT COUNT(*)::bigint AS count FROM ${qualified}` }),
    ]);
    const total = Number(count.objects?.[0]?.count || 0) || 0;
    return {
      rows: data.objects || [],
      columns,
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
    };
  }

  const qualified = quoteSqliteIdent(table);
  const order = sort ? ` ORDER BY ${quoteSqliteIdent(sort)} ${dir}` : '';
  const [data, count] = await Promise.all([
    adapter.query({
      sql: `SELECT * FROM ${qualified}${order} LIMIT ? OFFSET ?`,
      params: [limit, offset],
    }),
    adapter.query({ sql: `SELECT COUNT(*) AS count FROM ${qualified}` }),
  ]);
  const total = Number(count.objects?.[0]?.count || 0) || 0;
  return {
    rows: data.objects || [],
    columns,
    page,
    limit,
    total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export function isDatabaseRequest(pathname) {
  return pathname === '/api/database/sources' ||
    pathname === '/api/database/metrics' ||
    pathname === '/api/database/tables' ||
    pathname === '/api/database/schema' ||
    pathname === '/api/database/rows' ||
    pathname === '/api/database/query';
}

export async function handleDatabaseRequest(request, env, accountId) {
  if (!accountId) return json({ ok: false, error: 'unauthorized' }, 401);
  const url = new URL(request.url);

  try {
    if (url.pathname === '/api/database/sources' && request.method === 'GET') {
      return json({ ok: true, ...(await listSources(env, accountId)) });
    }

    const sourceId =
      clean(url.searchParams.get('source_id')) ||
      clean((request.method !== 'GET' ? (await request.clone().json().catch(() => ({}))).source_id : ''));

    if (url.pathname === '/api/database/metrics' && request.method === 'GET') {
      return json(await readMetrics(env, accountId, sourceId, clean(url.searchParams.get('range')) || '24h'));
    }

    if (url.pathname === '/api/database/tables' && request.method === 'GET') {
      const payload = await withResolvedSource(env, accountId, sourceId, async ({ source, adapter }) => ({
        ok: true,
        source,
        tables: await adapter.listTables(),
      }));
      return json(payload);
    }

    if (url.pathname === '/api/database/schema' && request.method === 'GET') {
      const table = clean(url.searchParams.get('table'));
      const schema = clean(url.searchParams.get('schema')) || undefined;
      const payload = await withResolvedSource(env, accountId, sourceId, async ({ source, adapter }) => ({
        ok: true,
        source,
        schema: await adapter.describeTable({ name: table, schema }),
      }));
      return json(payload);
    }

    if (url.pathname === '/api/database/rows' && request.method === 'GET') {
      const payload = await withResolvedSource(env, accountId, sourceId, async ({ source, adapter }) => ({
        ok: true,
        source,
        ...(await readTableRows(adapter, source, url.searchParams)),
      }));
      return json(payload);
    }

    if (url.pathname === '/api/database/query' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const id = clean(body.source_id);
      const payload = await withResolvedSource(env, accountId, id, async ({ source, adapter }) => {
        assertSqlAllowed(source, body.sql, body);
        const result = await adapter.query({
          sql: body.sql,
          params: Array.isArray(body.params) ? body.params : [],
        });
        return { ok: true, source, ...result };
      });
      return json(payload);
    }

    if (url.pathname === '/api/database/rows' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const payload = await withResolvedSource(env, accountId, body.source_id, async ({ source, adapter }) => {
        if (source.writable === false || typeof adapter.insert !== 'function') throw new Error('database_read_only');
        const result = await adapter.insert({
          table: body.table,
          schema: body.schema,
          values: body.values,
        });
        return { ok: true, source, result };
      });
      return json(payload);
    }

    if (url.pathname === '/api/database/rows' && request.method === 'PATCH') {
      const body = await request.json().catch(() => ({}));
      const payload = await withResolvedSource(env, accountId, body.source_id, async ({ source, adapter }) => {
        if (source.writable === false || typeof adapter.update !== 'function') throw new Error('database_read_only');
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

    if (url.pathname === '/api/database/rows' && request.method === 'DELETE') {
      const body = await request.json().catch(() => ({}));
      const payload = await withResolvedSource(env, accountId, body.source_id, async ({ source, adapter }) => {
        if (source.writable === false || typeof adapter.delete !== 'function') throw new Error('database_read_only');
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
    console.error('database_service_error', String(error?.stack || error));
    return json(
      {
        ok: false,
        error: error?.message || 'database_request_failed',
        requires_approval: error?.requiresApproval === true,
        requires_destructive_confirmation: error?.requiresDestructiveConfirmation === true,
      },
      Number(error?.status || 400),
    );
  }
}
