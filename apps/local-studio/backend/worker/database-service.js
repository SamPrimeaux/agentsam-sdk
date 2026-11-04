import { Client } from 'pg';
import {
  createD1Adapter,
  createD1BindingAdapter,
  createHyperdriveAdapter,
  createDatabaseRequestHandler,
  readD1Metrics,
  readD1AccountMetrics,
  listD1Resources,
  manageD1Resource,
  readPostgresMetrics,
} from '../../../../packages/agentsam-database-editor/backend/index.js';
import { resolveCloudflareCredential as resolveCloudflareConnectorCredential } from '../../../../packages/connectors/cfoa/src/credential.js';
import { scheduleStudioErrorLog } from './studio-error-log.js';
import { listCloudflareConnectionRecords } from '../../../../packages/connectors/cfoa/src/credential.js';

const RANGE_SECONDS = Object.freeze({
  '1h': 60 * 60,
  '24h': 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '30d': 30 * 24 * 60 * 60,
});

function clean(value) {
  return value == null ? '' : String(value).trim();
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


const OAUTH_D1_CAPABILITIES = Object.freeze([
  'schema', 'read', 'query', 'insert', 'update', 'delete', 'metrics',
]);
const DEPLOYMENT_D1_CAPABILITIES = Object.freeze([
  'schema', 'read', 'query', 'insert', 'update', 'delete',
]);
const DEPLOYMENT_PG_CAPABILITIES = Object.freeze([
  'schema', 'read', 'query', 'insert', 'update', 'delete', 'metrics',
]);

function isOpaqueBindingDatabaseId(databaseId) {
  const id = clean(databaseId);
  if (!id) return true;
  if (id.startsWith('binding:')) return true;
  // Real Cloudflare D1 UUIDs are 36-char dashed hex.
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function withSourceProvenance(source, provenance) {
  return {
    ...source,
    source_kind: provenance.source_kind,
    owner_scope: provenance.owner_scope,
    capabilities: provenance.capabilities,
  };
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

async function resolveCloudflareCredential(env, accountId, cloudflareAccountId = '') {
  const resolved = await resolveCloudflareConnectorCredential({
    env,
    ownerId: accountId,
    authMode: 'oauth',
    capabilityId: 'cloudflare.d1',
    explicitAccountId: cloudflareAccountId || undefined,
  });
  if (!resolved?.bearerToken) return null;
  return {
    token: resolved.bearerToken,
    cloudflareAccountId: clean(resolved.accountId) || null,
    scopes: Array.isArray(resolved.grantedScopes) ? resolved.grantedScopes : [],
    expiresAt: resolved.expiresAt || null,
    source: resolved.source || 'oauth_connection',
    connectionId: resolved.connectionId || null,
  };
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
  const records = await listCloudflareConnectionRecords(env, accountId);
  const sources = [], accounts = [];
  for (const record of records) {
    const cfId = record.cloudflareAccountId;
    if (!cfId) continue;
    try {
      const credential = await resolveCloudflareCredential(env, accountId, cfId);
      if (!credential?.token || credential.cloudflareAccountId !== cfId) throw new Error("cloudflare_connection_unavailable");
      const writable = credential.scopes.some(scope => /(^|[.:_])d1[.:_]write$/i.test(scope));
      const rows = await listD1Resources({ token: credential.token, accountId: cfId });
      accounts.push({ id: cfId, name: record.accountLabel || cfId, writable });
      for (const row of rows) {
        const databaseId = clean(row.uuid || row.id);
        sources.push(withSourceProvenance({
          id: "cf-d1:" + cfId + ":" + databaseId, provider: "cloudflare-d1", engine: "sqlite",
          label: clean(row.name) || databaseId, database_name: clean(row.name) || databaseId,
          database_id: databaseId, account_id: cfId, created_at: row.created_at,
          file_size: row.file_size == null ? null : Number(row.file_size),
          region: row.primary_location_hint || null, writable, metrics: true, management: true, connection: "oauth",
        }, { source_kind: "oauth_resource", owner_scope: "account", capabilities: writable ? OAUTH_D1_CAPABILITIES : OAUTH_D1_CAPABILITIES.filter(c => !["insert","update","delete"].includes(c)) }));
      }
    } catch (error) {
      accounts.push({ id: cfId, name: record.accountLabel || cfId, writable: false, error: error.message });
    }
  }
  return { sources, accounts, connection: {
    provider: "cloudflare", status: !records.length ? "not_connected" : accounts.some(a => !a.error) ? "connected" : "error",
    error: accounts.filter(a => a.error).map(a => a.name + ": " + a.error).join("; ") || undefined,
    connect_url: "/api/connections/cloudflare/start?packs=data&return_to=/database",
    reconnect_url: "/api/connections/cloudflare/start?packs=data&return_to=/database",
  } };
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
  // Bound D1 is the SSOT — never read LOCAL_STUDIO_D1_DATABASE_* env duplicates.
  if (!owner || owner !== accountId || !env?.DB?.prepare) return null;

  let tableCount = 0;
  let fileSize = null;

  try {
    const tableRow = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).first();
    tableCount = Number(tableRow?.count || 0) || 0;
  } catch {
    tableCount = 0;
  }

  // D1 does not guarantee every SQLite page pragma on every runtime. Size is
  // observability-only: failure / zero must never be reported as "0 B".
  try {
    const [pageCount, pageSize] = await Promise.all([
      env.DB.prepare("PRAGMA page_count").first(),
      env.DB.prepare("PRAGMA page_size").first(),
    ]);
    const pages = Number(pageCount?.page_count || 0);
    const size = Number(pageSize?.page_size || 0);
    const computed = pages * size;
    fileSize = computed > 0 ? computed : null;
  } catch {
    fileSize = null;
  }

  // Prefer wrangler-declared UUID when present; otherwise opaque binding:DB.
  const configuredUuid = clean(env?.AGENTSAM_D1_DATABASE_UUID || env?.D1_DATABASE_UUID);
  let databaseId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(configuredUuid)
    ? configuredUuid
    : 'binding:DB';
  let metricsReady = !isOpaqueBindingDatabaseId(databaseId);
  let oauthAccountId = null;

  // Deployment-owned Worker binding — only for explicitly authorized deployment owner.
  // Never treat env.DB as a generic user's Cloudflare catalog entry.
  // Never use CLOUDFLARE_ACCOUNT_ID as a silent user-ops substitute.
  return withSourceProvenance({
    id: 'binding-d1:primary',
    provider: 'cloudflare-d1',
    engine: 'sqlite',
    label: 'AgentSam platform D1 (env.DB)',
    database_name: 'DB',
    database_id: databaseId,
    account_id: oauthAccountId || null,
    file_size: fileSize,
    num_tables: tableCount,
    writable: true,
    metrics: metricsReady,
    connection: 'worker_binding',
    binding_ref: 'binding:DB',
  }, {
    source_kind: 'deployment_binding',
    owner_scope: 'deployment',
    capabilities: metricsReady
      ? [...DEPLOYMENT_D1_CAPABILITIES, 'metrics']
      : DEPLOYMENT_D1_CAPABILITIES,
  });
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
    return withSourceProvenance({
      id: 'hyperdrive:primary',
      provider: 'supabase-postgres',
      engine: 'postgres',
      accelerator: 'hyperdrive',
      label: clean(row.database_name) || 'Supabase Postgres (Hyperdrive)',
      database_name: clean(row.database_name) || 'postgres',
      file_size: Number(row.size_bytes || 0) || 0,
      writable: true,
      metrics: true,
      connection: 'deployment_hyperdrive',
      latency_ms: Date.now() - started,
    }, {
      source_kind: 'deployment_binding',
      owner_scope: 'deployment',
      capabilities: DEPLOYMENT_PG_CAPABILITIES,
    });
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
  // Product path: user's Cloudflare OAuth → their account D1s.
  // Deployment bindings (env.DB / Hyperdrive) are separate and owner-gated.
  const [cloudflare, boundD1, hyperdrive] = await Promise.all([
    listCloudflareD1Sources(env, accountId),
    getBoundD1Source(env, accountId),
    getHyperdriveSource(env, accountId),
  ]);
  const oauthD1 = cloudflare.sources || [];
  const deploymentSources = [
    ...(boundD1 ? [boundD1] : []),
    ...(hyperdrive ? [hyperdrive] : []),
  ];
  const cfConnection = { ...cloudflare.connection };
  if (cfConnection.status === 'connected' && oauthD1.length === 0) {
    cfConnection.catalog_status = 'empty';
    cfConnection.warning =
      'Cloudflare OAuth is connected, but no D1 databases were enumerated for this account. This is a connector/catalog gap — do not invent platform D1 rows.';
  }
  return {
    accounts: cloudflare.accounts || [],
    sources: [
      ...oauthD1,
      ...deploymentSources,
    ],
    connections: {
      cloudflare: cfConnection,
      hyperdrive: hyperdrive
        ? {
            status: hyperdrive.status === 'degraded' ? 'degraded' : 'connected',
            source_id: hyperdrive.id,
            source_kind: 'deployment_binding',
            owner_scope: 'deployment',
            latency_ms: hyperdrive.latency_ms ?? null,
          }
        : { status: 'not_available', source_kind: 'deployment_binding', owner_scope: 'deployment' },
      local_sqlite: {
        status: 'attachable',
        source_kind: 'local_runtime',
        owner_scope: 'user',
        message:
          'Attach AgentSam Local Studio / local runtime to open `.agentsam/data/agentsam.sqlite` (same DB as `agentsam db`). Never invented in the hosted browser.',
      },
    },
  };
}

async function resolveSource(env, accountId, sourceId) {
  const id = clean(sourceId);
  if (!id) throw new Error('source_id_required');

  if (id.startsWith('cf-d1:')) {
    const parts = id.split(":");
    let cfId, databaseId;
    if (parts.length === 3) { cfId = parts[1]; databaseId = parts[2]; }
    else {
      // Compatibility with saved source links: resolve only through a single explicit grant.
      const records = await listCloudflareConnectionRecords(env, accountId);
      if (records.length !== 1) throw new Error("cloudflare_account_selection_required");
      cfId = records[0].cloudflareAccountId; databaseId = parts[1];
    }
    const credential = await resolveCloudflareCredential(env, accountId, cfId);
    if (!credential?.token || credential.cloudflareAccountId !== cfId) throw new Error("cloudflare_account_not_authorized");
    const body = await cloudflareJson(
      "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfId) + "/d1/database/" + encodeURIComponent(databaseId), credential.token);
    const row = body.result;
    if (clean(row?.uuid || row?.id) !== databaseId) throw new Error("d1_database_not_authorized");
    const writable = credential.scopes.some(scope => /(^|[.:_])d1[.:_]write$/i.test(scope));
    const source = {
      id, provider: "cloudflare-d1", engine: "sqlite", label: clean(row.name) || databaseId,
      database_name: clean(row.name), account_id: cfId, database_id: databaseId,
      created_at: row.created_at, file_size: row.file_size == null ? null : Number(row.file_size),
      writable, metrics: true, management: true, connection: "oauth", source_kind: "oauth_resource", owner_scope: "account",
    };
    return { source, adapter: createD1Adapter({ id, label: source.label, token: credential.token, accountId: cfId, databaseId, writable }), credential };
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
      const opaqueBinding = isOpaqueBindingDatabaseId(source.database_id);
      if (!cfCredential?.token || !metricsAccountId || opaqueBinding) {
        return {
          ok: true,
          source,
          range: requestedRange,
          capacity: {
            usedBytes: source.file_size > 0 ? Number(source.file_size) : null,
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
            tables: source.num_tables > 0 ? Number(source.num_tables) : null,
            storage: source.file_size > 0 ? Number(source.file_size) : null,
          },
          series: [],
          health: await adapter.health(),
          wired: false,
          warning: opaqueBinding
            ? 'Analytics are not reported for this deployment database yet. Browse tables and run SQL as usual.'
            : 'Connect Cloudflare OAuth (data pack) to load analytics for this database.',
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
          tables: null,
          storage: source.file_size > 0 ? Number(source.file_size) : null,
        },
        series: metrics.series,
        insights: metrics.insights,
        insightsWarning: metrics.insightsWarning,
        start: metrics.start,
        end: metrics.end,
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

/**
 * Package-owned HTTP surface. Local Studio only injects:
 * identity (accountId), OAuth/credential resolution, source catalog, metrics.
 */
const packageDatabaseHandler = createDatabaseRequestHandler({
  pathPrefix: '/api/database',
  listSources: (ctx) => listSources(ctx.env, ctx.accountId),
  resolveSource: async (ctx, sourceId) =>
    withResolvedSource(ctx.env, ctx.accountId, sourceId, async (resolved) => resolved),
  readMetrics: (ctx, sourceId, range) => readMetrics(ctx.env, ctx.accountId, sourceId, range),
  manageResource: async (ctx, body) => {
    const action = clean(body.action);
    if (action === "create") {
      const cfId = clean(body.account_id);
      const credential = await resolveCloudflareCredential(ctx.env, ctx.accountId, cfId);
      if (!cfId || !credential?.token || credential.cloudflareAccountId !== cfId) throw new Error("cloudflare_account_not_authorized");
      return manageD1Resource({ token: credential.token, accountId: cfId, action, input: body, writable: credential.scopes.some(scope => /(^|[.:_])d1[.:_]write$/i.test(scope)) });
    }
    const resolved = await resolveSource(ctx.env, ctx.accountId, body.source_id);
    if (!resolved.source.management) throw new Error("provider_management_unavailable");
    return manageD1Resource({ token: resolved.credential.token, accountId: resolved.source.account_id, source: resolved.source, writable: resolved.source.writable, action, input: body });
  },
  readAccountMetrics: async (ctx, cfId, range) => {
    const credential = await resolveCloudflareCredential(ctx.env, ctx.accountId, cfId);
    if (!cfId || !credential?.token || credential.cloudflareAccountId !== cfId) throw new Error("cloudflare_account_not_authorized");
    let metrics;
    try { metrics = await readD1AccountMetrics({ token: credential.token, accountId: cfId, range }); }
    catch (error) { metrics = { warning: error.message, totals: null, databases: [] }; }
    let billing;
    try {
      const info = await cloudflareJson("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfId) + "/billable-usage/info", credential.token);
      const usage = await cloudflareJson("https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(cfId) + "/billable-usage", credential.token);
      billing = { status: "available", message: "Provider-reported billing records; billing cycle is defined by the provider.", info: info.result, usage: usage.result };
    } catch (error) { billing = { status: "unavailable", message: "Billing records unavailable: " + error.message }; }
    return { ok: true, account_id: cfId, range, ...metrics, billing, captured_at: new Date().toISOString() };
  },
  sha256Hex,
  onError: async (error, ctx) => {
    console.error('database_service_error', String(error?.stack || error));
    scheduleStudioErrorLog(ctx.env, ctx.executionCtx || null, {
      accountId: ctx.accountId,
      errorCode: error?.code || error?.message || 'database_request_failed',
      errorType: 'database_studio',
      errorMessage: String(error?.message || error || 'database_request_failed'),
      source: 'local-studio.database-service',
      stackTrace: error?.stack || null,
      contextJson: {
        path: ctx.url?.pathname,
        method: ctx.request?.method,
      },
    });
  },
});

export function isDatabaseRequest(pathname) {
  return packageDatabaseHandler.isDatabaseRequest(pathname);
}

export async function handleDatabaseRequest(request, env, accountId, ctx = null) {
  return packageDatabaseHandler.handle(request, {
    env,
    accountId,
    executionCtx: ctx,
  });
}
