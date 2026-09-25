/**
 * Metrics adapter contract — Overview KPIs/charts never call provider GraphQL directly.
 * Donor: IAM /dashboard/database (Cloudflare GraphQL + Supabase/Hyperdrive twin).
 *
 * Lazy-load / cache: key by (connectionId, provider, range, seriesId).
 * Queries list is deferred until the user focuses search.
 *
 * @typedef {object} MetricSummary
 * @property {string} range
 * @property {Record<string, number|string>} kpis
 * @property {string} [subtitle]
 *
 * @typedef {object} TimeSeriesPoint
 * @property {string} t
 * @property {number} v
 *
 * @typedef {object} TimeSeries
 * @property {string} id
 * @property {TimeSeriesPoint[]} points
 *
 * @typedef {object} MetricsAdapter
 * @property {string} id
 * @property {() => { ranges: string[], series: string[] }} capabilities
 * @property {(range: string) => Promise<MetricSummary>} summary
 * @property {(id: string, range: string) => Promise<TimeSeries>} series
 */

/** Scaffold ids — implementations land in Phase 1.1+ */
export const METRICS_ADAPTER_IDS = Object.freeze([
  'local-sqlite-pragma',
  'cloudflare-graphql',
  'supabase-hyperdrive',
]);

/**
 * @param {string} connectionId
 * @param {string} provider
 * @param {string} range
 * @param {string} seriesId
 */
export function metricsCacheKey(connectionId, provider, range, seriesId) {
  return `metrics:${connectionId}:${provider}:${range}:${seriesId}`;
}
