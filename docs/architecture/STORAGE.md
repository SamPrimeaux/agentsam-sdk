# AgentSam storage architecture

## Authorities

AgentSam's own local execution state defaults to one database per project:
`<projectRoot>/.agentsam/data/agentsam.sqlite`. A model or provider switch
keeps the same ProjectSession and storage authority. A `cwd` change inside the
project also keeps it. Switching repositories selects a new project authority.

The user's application keeps its actual storage. In this repository,
`apps/local-studio/backend/wrangler.jsonc` declares a deployed Worker with D1,
Hyperdrive, R2, Workers AI, and service bindings. AgentSam must honor those
bindings for Worker features. Its local SQLite session state does not replace
the Worker's data, provision new cloud state, or start an implicit sync. Inspect
the project's real deployment and data bindings before choosing storage for
application features. Use local SQLite for application data only when the user
selects it or the task benefits from a clearly scoped local cache or scratch
store.

Cloudflare, Postgres/Supabase, object stores, and vector systems are connected
infrastructure. Their use is explicit and governed by the user's project and
credentials. Ordinary `agentsam` boot requires none of them. Durable Objects
are reserved for a future optional actor adapter with a demonstrated need for
globally addressed, serialized distributed actors. No default runtime path may
require one.

## Runtime state and lifecycle

`src/local/runtime-store.js`, `src/local/sqlite.js`, and
`src/local/migrations.js` own the local relational runtime and its versioned
SQL. `src/lib/local-sessions.js` writes resumable session records to the same
database. The older `~/.agentsam/sessions/*.json` files are a read-only
compatibility source: a session is imported only when its saved project root
matches the selected project. New sessions do not write there.
`agentsam resume` lists sessions for the current project; use
`agentsam resume --cwd <project-path>` when invoking it elsewhere. Opaque
provider response IDs can continue across process restarts. Provider message
arrays remain in memory for the active shell and are not stored in generic
session state, so providers without an opaque continuation ID start a fresh
model conversation after process restart.

| Lifecycle | Keep | Expire or discard |
| --- | --- | --- |
| persistent | project configuration, selected model metadata, valuable cache | stale derived copies |
| session | safe continuation IDs, status, usage, bounded receipts | raw prompts and provider message arrays |
| work_cycle | accepted objective/plan, final checkpoint and evidence | search frontier and rejected candidates |
| ttl | useful temporary context digest until expiry | expired digest/scratch |
| scratch | recoverable intermediate state only while needed | all obsolete scratch |

Existing runtime tables carry their own status and expiry fields where
applicable. New persisted concepts require a migration, an owner, and a
cleanup rule. Credentials stay in the existing credential-specific machine
stores. Session state retains no access/refresh tokens, provider keys, cookies,
or raw prompts. Blob and vector data do not belong behind a pretend universal
relational interface. `SQLITE_RUNTIME_CAPABILITIES` reports transactions,
relational queries, application-managed expiry, and local-only storage; it
does not claim shared remote state, blob/vector storage, or actor semantics.

## Connected infrastructure and sync

Use the cheapest appropriate authority already available. Local session and
run state belongs in SQLite. Remote relational application data may belong in
the user's D1 or Postgres. Blobs may belong in the user's object store; vectors
in the selected vector system. An explicit remote integration must state its
source authority, owner, direction, retry, conflict, freshness, and deletion
policy before copying state between stores. Connected D1 does not move a local
ProjectSession into D1.

## Enforcement

The existing source boundary verifier rejects a new Durable Object dependency
in the default shell, runtime store, agent, and provider paths. It also checks
that resumable sessions use the canonical project SQLite database and that
runtime schema definitions stay in versioned migrations. Focused storage tests
cover project-root selection, project isolation, model-independent session
storage, migration behavior, and secret-free session rows.
