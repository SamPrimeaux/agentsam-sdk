# AgentSam Plugin Productization Spine

Status: canonical platform contract implemented by `agentsam plugin inspect|verify|receipt`.

A plugin is a product package, not merely an MCP endpoint. Every AgentSam plugin must pass the same identity, ownership, capability, permission, installation, authorization, health, verification, portability and release lifecycle.

## Canonical lifecycle

```text
available → installed → needs_connection → connected → ready
```

These states MUST NOT collapse. An installation record is not connection proof, and a successful OAuth exchange is not readiness proof.

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

`inspect` reports contract/ownership findings. `verify` evaluates required checks from `agentsam.quality.json`. `receipt` emits an `agentsam.plugin-quality-receipt/v1` document. READY is computed; it is never manually declared.

## Evidence contract

A plugin may carry `agentsam.quality.json` using `agentsam.plugin-quality-evidence/v1`. Required checks not backed by evidence remain `unverified`; any required `fail` or `unverified` keeps the product NOT_READY.

Reference graduation checks should include package/manifest validity, install/uninstall, authorization/refresh/disconnect, health, capability discovery, a real tool call, result render/save round-trip, least privilege, tenant isolation, fresh-account and fresh-install portability.

Brand and Campaign are the first reference products. A third official plugin should not establish a competing lifecycle.
