# Analytics + GraphQL scaffold (donor: /dashboard/database)

The IAM overview at [inneranimalmedia.com/dashboard/database](https://inneranimalmedia.com/dashboard/database) shows Cloudflare GraphQL analytics (capacity, queries, rows, latency) and a Supabase/Hyperdrive twin. That surface is a **donor** for Metrics — not the portable editor core.

## Lazy-load / cache goals

1. **Split Overview vs Explore** — KPI cards + charts load via `metrics.*` adapters; table browser is a separate route/panel (`Explore Data`).
2. **Time-range keyed cache** — cache key `(connectionId, provider, range, seriesId)`; SWR/stale-while-revalidate in Local Studio.
3. **Defer Queries list** — bottom “Queries” search is empty until user focuses; do not block first paint.
4. **Sparklines** — prefer downsampled series endpoints over full GraphQL dumps.

## GraphQL options (scaffold — not implemented)

| Option | Use when | Notes |
|--------|----------|--------|
| **A. Cloudflare GraphQL Analytics API** | D1 account metrics | Donor path today (`Cloudflare GraphQL` subtitle). Keep behind `metrics` adapter `cloudflare-graphql`. |
| **B. Adapter-owned SQL metrics** | Local SQLite / self-hosted PG | `PRAGMA` / `pg_stat_*` — no GraphQL. |
| **C. Hosted GraphQL gateway** | Multi-tenant product later | Optional Worker that federates A+B into one schema. |

Portable contract sketch:

```ts
interface MetricsAdapter {
  id: string;
  capabilities(): { ranges: string[]; series: string[] };
  summary(range: string): Promise<MetricSummary>;
  series(id: string, range: string): Promise<TimeSeries>;
}
```

Overview UI calls `MetricsAdapter`, never `fetch('https://api.cloudflare.com/...')` directly.

## Localhost preview

Phase 1 Local Studio `/database` opens EmptyState → user picks a `.sqlite` path (Tauri/file) or uses server-side `createSqliteAdapter` via Nitro/CLI. No Cloudflare account required for that path.
