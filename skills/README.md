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
| `agentsam-plan-and-goap` | **current** | Read plan state first; advance plans with evidence, only when asked |
| `agentsam-sam-operations` | **current** | Exact SAM operation inputs; judge results, not envelopes |
| `agentsam-repo-recon` | **current** | Map a repo with deterministic read-only tools first |
| `agentsam-cad` | **current** | CAD/BIM routing across project contracts, native engines, IAMScene, IFC, Python jobs and verified outputs |
| `agentsam-experience-delivery` | **proposed workflow** | Machine-first, source-faithful brand/UX/scene handoffs with real functional gates |
| `agentsam-sdk-orientation` | **current** | Where things live, which source is authoritative |

List or open them with `agentsam skills`; aliases such as `quick-bytes`, `no-regress`,
`ingest` are intentionally short enough for terminal use.

## PrimeTech package skills

The nine `primetech-*` entries in `skills/catalog.json` are a catalog projection of the npm package `@inneranimalmedia/primetech-procedures`; the package owns the canonical `SKILL.md` and adjacent `agentsam.skill.json` files. In the SDK distribution, those paths resolve through `node_modules/@inneranimalmedia/primetech-procedures/skills/` rather than a second vendored copy.

- `agentsam skills` lists and loads the package skills directly from the installed dependency.
- `agentsam skill install @inneranimalmedia/primetech-procedures` imports all nine into the user's local skill registry.
- Updating a package skill updates the existing canonical package file and the matching `agentsam_skill` row; it does not create a duplicate skill identity.

The SDK package declares the PrimeTech npm dependency explicitly. If it is absent, the catalog omits those package-backed skills instead of advertising unavailable instructions.

## Portable game-development cookbooks

Fourteen engine-independent or engine-specific game cookbooks live in
`skills/agentsam-game-*` and are registered in `skills/catalog.json`.
They cover playable loops, controls, physics, multiplayer, interface design,
asset generation, 2D maps, tiles, animation, 3D engines and game sharing.
Use `agentsam-game-building` as the starting workflow and load specific
cookbooks for controls, multiplayer, rendering, assets, and delivery as needed.

The game schemas remain in the separate canonical Game Studio schema pack.
These skills are guidance, not a second application catalog, rendering engine,
scene format, installation registry, or save-state authority.
Original third-party licenses and provenance notices are retained alongside
the adapted cookbooks.
## D1 registries (normalize for new users)

| Table | Owns | New-user requirement |
|-------|------|----------------------|
| `agentsam_skill` | Canonical skill identity, metadata, and slash triggers | Keep one row per skill; store long Markdown in its configured content source and update the existing row on package releases |
| `agentsam_tools` (+ capabilities/call log) | Callable tools: AST retrieve, merkle, D1, Vectorize, … | Ship schema migrations under `migrations/d1/` + optional seed of filesystem/code AST tools so scaffolds match IAM host |

Apps may contain host-specific skill directories of their own. Those do not
replace the portable SDK skills in this directory.

<!-- agentsam:trademark-notice -->
> Independent project. Not affiliated with, endorsed by, or sponsored by Cloudflare, Inc. or by any other company whose products are named here. Cloudflare is a registered trademark of Cloudflare, Inc. Other names are trademarks of their respective owners. See [TRADEMARKS](https://github.com/SamPrimeaux/agentsam-sdk/blob/main/TRADEMARKS.md).
