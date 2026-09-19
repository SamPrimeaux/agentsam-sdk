# AgentSam as an MCP client — plan

`main` @ `14b6454` (PR #58 merged). Read this whole file before touching
anything. This closes a real, verified gap, not a speculative feature:
`agentsam_tool_call_log` — the account's own real call-telemetry table —
shows zero rows with `source_client: cursor` or `codex`, ever, while
`chatgpt` and `claude_ai` have thousands between them. Cursor's own
`~/.cursor/mcp.json` is `{"mcpServers": {}}` — genuinely never configured,
globally. `agentsam mcp add` does not exist; `agentsam add` is a different,
unrelated command (`runAdd()` writes `.agentsam/features.json` for product
add-ons, nothing to do with MCP).

## Why this is worth building now, not later

`inneranimalmedia-mcp-server` is proven infrastructure — real accounts, ~218
tools, actively used daily by two people, with its own D1-backed telemetry
already built for exactly this purpose (`agentsam_tool_call_log`,
`agentsam_mcp_tool_execution`). Making `agentsam` itself a client of it means
every native-agentsam tool call gets the same receipt quality Cursor/Codex
calls already get when they're properly connected — not a separate
observability project, a side effect of wiring this correctly once.

The live server: `https://mcp.inneranimalmedia.com/mcp`, OAuth beginning at
`https://mcp.inneranimalmedia.com/auth/connect`. The external-client spine
already recognizes Cursor specifically —
`src/mcp/dispatch/external-mcp-spine.js` (in `inneranimalmedia`) mints
`cursor_mcp:<external-chat>` conversation ids, `arun_mcp_cursor_<short>` run
ids, `source_client: cursor` — the server side is ready and waiting. The gap
is entirely client-side, in `agentsam-sdk`.

## What NOT to build

- Don't hand-roll the MCP JSON-RPC protocol. Use `@modelcontextprotocol/sdk`
  — a standard client library exists; this is transport plumbing, not novel
  design.
- Don't make `~/.cursor/mcp.json` (or any one client's config file) the
  authority. It's an adapter output, not the source of truth — same pattern
  as everything else in this repo. AgentSam's own connection state is
  authoritative; each client config gets generated/synced from it.
- Don't overload the existing `agentsam add` command. MCP is a distinct
  first-class noun.
- Don't conflate this with `agentsam eval live` (below) — MCP client wiring
  produces the raw telemetry; eval-live turns telemetry into graded
  observations. Two different pieces, sequenced, not merged into one PR.

## CLI surface

```
agentsam mcp add inneranimalmedia
agentsam mcp add inneranimalmedia --client cursor
agentsam mcp status
agentsam mcp doctor inneranimalmedia
agentsam mcp list
agentsam mcp remove inneranimalmedia
```

`agentsam mcp add inneranimalmedia` flow:

```
agentsam mcp add inneranimalmedia
       │
       ├── detect installed clients (Cursor / Claude / etc.)
       ├── open IAM OAuth (mcp.inneranimalmedia.com/auth/connect)
       ├── user consents
       ├── receive MCP credential
       ├── store credential securely under ~/.agentsam/mcp/inneranimalmedia.json
       ├── materialize client adapter(s)
       │      └── e.g. ~/.cursor/mcp.json, generated from AgentSam's own state
       ├── call MCP initialize
       ├── tools/list
       ├── ping
       └── ✓ connected
```

Same shape as `codex mcp add cloudflare-api --url ... ` — that's the UX bar,
not just an analogy.

## Where state lives

`~/.agentsam/mcp/<server-name>.json` is the connection authority. Client
configs (`~/.cursor/mcp.json`, Claude Desktop's config, etc.) are generated
adapters written *from* that state, not edited by hand and not treated as
sources of truth. Same "one authority, N adapters" pattern as everything
else audited in this repo tonight — don't special-case MCP.

## Catalog merging — the actual hard part

Once connected, an MCP server's tool list has to sit alongside the native
`protocol/capabilities/manifest.json` catalog for whatever model the
interactive session is driving — not as a second, separately-searched
system. Extend the existing `src/tools/search.js`/`hydrate.js` layer to
treat a connected MCP server's `tools/list` result as another source
feeding the same search/hydrate index, tagged with its origin so collisions
(a connected server offering something the native manifest already has) are
detectable the same way the tools.js dedup audit found `handler_key`
collisions earlier tonight. Don't build a second, parallel discovery path.

## Telemetry — the actual payoff

Every call made through a connected MCP server from an `agentsam` session
should land in `agentsam_tool_call_log` with real `source_client`
attribution (`agentsam`, not blank/unknown), the same schema Cursor and
Codex would use if *they* were writing there. This is what closes the
observability gap — not a new table, just making sure agentsam's own calls
go through the same pipe.

## Related, sequenced after this: `agentsam eval live`

Don't overload the existing deterministic `agentsam eval context` (which
explicitly reports `live_provider_used: false` — it's offline/deterministic
by design, leave it that way). Add a separate live-capture path:

```
agentsam eval live start \
  --suite sdk-real-work-20260919 \
  --case cad-shell-unification \
  --client cursor \
  --provider cursor \
  --model "Muse Spark 1.3" \
  --reasoning high

... real work happens, MCP calls land in agentsam_tool_call_log /
    agentsam_mcp_tool_execution / agentsam_tool_call_outcomes /
    agentsam_tool_chain via the client wired above ...

agentsam eval live finish
```

`eval live finish` aggregates the real receipts collected during the
session and writes to `agentsam_eval_runs` (the primary model-comparison
row) and `agentsam_model_eval_observations` (supporting evidence) —
built from *actual* tool-call receipts, not re-typed after the fact. One
important constraint to respect: the MCP server can know what tool was
called, when, duration, success/failure, cache state, resource touched,
retries, authorization outcome — it cannot know a connected client's own
hidden model token usage. Combine what MCP telemetry actually knows with
whatever the client/CLI session itself reports (git/test/CI evidence,
commit/PR references) rather than inventing precision that isn't there.
Model tokens/cost from a third-party client should read "unknown /
client-reported if available," not a fabricated number.

## Order of operations

1. `agentsam mcp add/status/doctor/list/remove` — the client transport +
   connection-state authority + first adapter (Cursor, since that's the
   proven daily-use client with zero current telemetry).
2. Catalog merge in `search.js`/`hydrate.js`.
3. Telemetry wiring into `agentsam_tool_call_log` with correct
   `source_client`.
4. `agentsam eval live start/finish`, once real MCP telemetry is flowing —
   this step is worthless without step 3 landing first.

Do not skip ahead to `eval live` before the transport and telemetry wiring
are real — that would just recreate the exact "manual/intentional eval
recording, not an automatic facility" gap this plan exists to close.
