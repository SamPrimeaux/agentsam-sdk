# AgentSam Plugin Productization Spine

Status: canonical platform contract implemented by `agentsam plugin inspect|verify|receipt`.

A plugin is a product package, not merely an MCP endpoint.

## Governing evidence pipeline

```text
Machine inspect / crawl
        ↓
Repository graph
        ↓
repository.mine reuse + authority findings
        ↓
plugin inspect
        ↓
plugin verify
        ↓
quality receipt
```

Plugin Productization is **not another scanner**. `plugin inspect` consumes already-produced Machine, Repository, capability and package evidence. It may validate its own small manifests, but it must not walk repositories, invent a second dependency graph, rediscover OAuth implementations, or create another MCP registry. When evidence is unavailable it reports the fact as unverified instead of silently scanning again.

Every finding names its evidence source and, when the finding concerns duplicated/misplaced authority, the expected canonical owner. Repository ownership comes from Repository/refinery evidence when available; product code does not maintain a parallel package-owner lookup table. Every AgentSam plugin must pass the same identity, ownership, capability, permission, installation, authorization, health, verification, portability and release lifecycle.

## Canonical lifecycle

```text
available → installed → needs_connection → connected → ready
```

These states MUST NOT collapse. An installation record is not connection proof, and a successful OAuth exchange is not readiness proof. `ready` is never a writable product state: it is computed from current evidence. Persistable runtime observations may include `last_verified_at`, `last_verification_receipt`, `last_health`, and `last_error`, but not an administrator-set `ready=true`.

## Package boundary

Each product plugin adds `agentsam.product.json` beside its public `plugin.json` and `mcp.json`.

The product contract declares:

- product identity and version
- canonical domain package
- domain-specific ownership
- platform authorities that MUST be reused
- capabilities and risk
- declared permissions
- auth requirements
- health strategy
- lifecycle states
- required verification checks
- release receipt requirement

Generic OAuth, credential custody, installation, MCP transport, Settings, generic health, receipts and retry infrastructure are platform authorities. Domain packages own only what is unique to the product.

## Deterministic commands

```bash
agentsam plugin inspect ./plugins/agentsam-brand
agentsam plugin verify ./plugins/agentsam-brand
agentsam plugin receipt ./plugins/agentsam-brand
```

`inspect` reports contract/ownership findings and can consume an existing `agentsam.plugin-evidence-bundle/v1` via `--evidence`. `verify` combines package evidence with existing capability/runtime receipts; checks with no proof remain `unverified`. `receipt` renders the same verification result as an `agentsam.plugin-quality-receipt/v1` document rather than running a third verification engine. READY is computed; it is never manually declared.

## Evidence contract

A plugin may carry `agentsam.quality.json` using `agentsam.plugin-quality-evidence/v1`. Required checks not backed by evidence remain `unverified`; any required `fail` or `unverified` keeps the product NOT_READY.

Reference graduation checks should include package/manifest validity, install/uninstall, authorization/refresh/disconnect, health, capability discovery, a real tool call, result render/save round-trip, least privilege, tenant isolation, fresh-account and fresh-install portability.

Brand and Campaign are the first reference products. A third official plugin should not establish a competing lifecycle.


## Calibration law

Brand and Campaign are the first two reference products and must use this exact generic pipeline without `if brand` / `if campaign` special cases. Do not introduce a third official plugin until both can progress from inspect → verify → computed receipt with fresh-account runtime proof.

The generator is intentionally later. A future `agentsam plugin create <name>` must first consume Repository ownership, Machine/refinery evidence, the capability catalog and this product contract, then propose the smallest domain-only package.


## Repository/refinery evidence quality

Product inspection must not treat a large candidate count as proof. Repository/refinery evidence should distinguish at least:

- **EXACT** — byte/source equivalent
- **STRUCTURAL** — same implementation with edits
- **CAPABILITY** — different implementations of the same job
- **RELATED** — shared infrastructure but distinct purpose
- **FALSE_POSITIVE** — similar-looking code that must not be recommended for consolidation

Before refinery recommendations can become trusted automated guidance, fixtures must cover a known exact duplicate, an evolved duplicate, an intentionally separate similar implementation, and a case where an existing package owner is resolved correctly. `plugin inspect` consumes those proposals; it does not perform the classification itself.

## Repository authority bridge

A future `agentsam repository authority <domain>` command belongs on top of the existing Repository graph. It must derive authority from package exports, capability ownership, contracts, consumer imports, manifests and supporting docs. It must not be implemented as a hand-maintained domain→package lookup table.

The result may legitimately be multiple primary authorities for a broad domain. For example, media identity/provenance, content lifecycle/provider representations and media preparation may remain separate package authorities.

## Definition versus observation

The product manifest contains stable definition only. Installation rows, authorization state, health, discovered tool counts, runtime success and READY are observations. A host may persist the latest observation receipt, timestamp, health result and error, but the current status is always re-derived from evidence.
