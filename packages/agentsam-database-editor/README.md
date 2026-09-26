# @inneranimalmedia/agentsam-database-editor

Portable AgentSam Database Editor harvested from the production InnerAnimalMedia database studio.

Cloudflare D1, Supabase/Postgres, Hyperdrive and local SQLite are **adapters**. The product is the common editor + observability surface.

## Package boundary

```
@inneranimalmedia/agentsam-database-editor
├── frontend/
│   └── DatabaseEditorApp + browser client
├── backend/
│   ├── D1 REST / D1 binding
│   ├── Postgres / Hyperdrive / Supabase
│   └── provider metrics
└── backend/sqlite
    └── Node-only local SQLite
```

Browser apps import:

```ts
import {
  DatabaseEditorApp,
  createDatabaseStudioClient,
} from "@inneranimalmedia/agentsam-database-editor/frontend";
```

Worker/server apps import:

```js
import {
  createD1Adapter,
  createD1BindingAdapter,
  createPostgresAdapter,
  createHyperdriveAdapter,
  createSupabaseAdapter,
  readD1Metrics,
  readPostgresMetrics,
} from "@inneranimalmedia/agentsam-database-editor/backend";
```

Local Node runtimes import SQLite explicitly so `node:sqlite` never enters a Worker/browser graph:

```js
import { createSqliteAdapter } from "@inneranimalmedia/agentsam-database-editor/backend/sqlite";
```

## Local Studio

`apps/local-studio` is the first production host.

`/database` provides:

- provider/source switcher
- Cloudflare D1 GraphQL metrics
- Postgres/Hyperdrive metrics
- tables + schema + indexes + relations
- paginated data browser
- SQL execution
- insert / update / delete
- explicit write confirmation for mutating SQL
- second confirmation for destructive/schema SQL
- compact workbench embedding

Local Studio owns authenticated account identity, OAuth/token storage, Cloudflare bindings, Hyperdrive connection lifecycle, and local-device transport. The package never owns provider secrets.

## Resource rules

- **Cloudflare D1:** account OAuth catalog or a host-owned D1 binding. OAuth tokens stay server-side.
- **Supabase/Postgres:** host injects a Postgres query function. Hyperdrive is an accelerator/connection path, not a separate SQL dialect.
- **Local SQLite:** real Node/local-runtime access only. The hosted browser must never manufacture a fake `.sqlite` connection.
- **Vectors:** optional and independent from the relational database adapter.

## CLI/install

```sh
agentsam app install database-editor
# or
curl -fsSL https://agentsam.inneranimalmedia.com/install | bash -s -- --app-id database-editor
```

`app_id = database-editor` is stable product identity.

See [docs/HARVEST_REPORT.md](./docs/HARVEST_REPORT.md) for the donor inventory and portability rules.
