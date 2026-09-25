# AgentSam Skills

Portable, on-demand AgentSam behavior modules. Skills keep specialized guidance
out of the permanent system prompt and load deeper `references/` only when the
current task calls for them.

## Canonical portable skills (`skills/catalog.json`)

| id | Status | Use when |
|----|--------|----------|
| `agentsam-jr-dev` | **current** | Teach/inspect/build with beginner-friendly, evidence-grounded language |
| `agentsam-app-fundamentals` | **current** | Contracts, credentials, graphs, AST, Merkle — application laws |
| `agentsam-progression-guard` | **current** | Local → CI → deploy → postdeploy gates; no silent regress |
| `agentsam-cloudflare-workers` | **current** | Wrangler-native ops, observability, CPU profiling |
| `agentsam-codebaseindex` | **current** | Guided ingest / `codebaseindex.ingest` / Vectorize+pgvector+local lanes |

List or open them with `agentsam skills`; aliases such as `quick-bytes`, `no-regress`,
`ingest` are intentionally short enough for terminal use.

## Not portable (host / app scoped)

`apps/local-studio/.grok/skills/*` (game/UI/sprite/xAI packs) are **Local Studio
Grok host skills**. They do not belong in the SDK portable catalog and must not
be confused with D1 `agentsam_skill` rows or `agentsam_tools`.

## D1 registries (normalize for new users)

| Table | Owns | New-user requirement |
|-------|------|----------------------|
| `agentsam_skill` (+ revision/invocation) | Dashboard Skills CRUD / slash triggers | Ship schema + seed portable skill metadata that mirrors `skills/catalog.json` |
| `agentsam_tools` (+ capabilities/call log) | Callable tools: AST retrieve, merkle, D1, Vectorize, … | Ship schema migrations under `migrations/d1/` + optional seed of filesystem/code AST tools so scaffolds match IAM host |

Apps may contain host-specific skill directories of their own. Those do not
replace the portable SDK skills in this directory.
