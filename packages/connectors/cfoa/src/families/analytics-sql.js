/**
 * Cloudflare Analytics SQL Workers binding. Account scope is supplied by
 * Cloudflare; never append accountTag / zoneTag to Worker binding queries.
 * Datasets/columns are discovered by a separately authorized host connector.
 */
export function createCloudflareAnalyticsSqlClient({ binding, retries = 2, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  const available = Boolean(binding && typeof binding.query === 'function');
  return Object.freeze({
    available,
    async query(query, params = {}) {
      if (!available) return { available: false, rows: [], statistics: null, reason: 'analytics_sql_not_bound' };
      if (typeof query !== 'string' || !/^\s*SELECT\b/i.test(query) ||
          /;\s*\S|\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|FORMAT)\b/i.test(query)) {
        throw new TypeError('Analytics SQL binding requires a single read-only SELECT query');
      }
      if (/\b(?:accountTag|zoneTag|scope\.accountTag|scope\.zoneTag)\b/i.test(query)) {
        throw new TypeError('Worker Analytics SQL scope comes from the binding; do not specify tenancy in SQL');
      }
      const maxAttempts = Math.min(Math.max(0, Math.floor(retries)), 3) + 1;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
          const result = await binding.query({ query, params });
          if (!result || !Array.isArray(result.data)) throw new Error('analytics_sql_invalid_response');
          return { available: true, rows: result.data, statistics: result.statistics || null, reason: null };
        } catch (error) {
          if (error?.retryable !== true || attempt + 1 === maxAttempts) {
            const failure = new Error(error?.message || 'analytics_sql_unavailable');
            failure.retryable = error?.retryable === true;
            failure.code = error?.code || 'analytics_sql_query_failed';
            throw failure;
          }
          await sleep(Math.min(150 * (2 ** attempt), 1000));
        }
      }
    },
  });
}

export function normalizeAnalyticsSqlCount(rows, name = 'requests') {
  const raw = rows?.[0]?.[name];
  if (raw == null) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
