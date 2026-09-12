# `@inneranimalmedia/agentsam-sdk` release receipts

**2.6.0 is published and is the npm `latest` release.** The private identity workspace continues to
ship through root SDK exports and is not published separately.

Published at `2026-09-12T21:14:57.827Z` from git SHA
`ae32fba0a761cb18c5f940957bdcd58e3cab6072`, tagged `v2.6.0`. Registry integrity:
`sha512-98xvyIXGcX6/S0nFUkB2+s4zPxF5WvN/eYBjt6s575uC/ux/xB9Y0dH+pw7ur5TMRkQj7JDR4XN5cSy6I2Hr+w==`.
Publishing remains manual and `prepublishOnly` runs `npm run verify:release`.

## 2.6.0 highlights

- Interactive AgentSam now has persistent machine-local account/session identity with explicit `login`, `logout`, `whoami`, and `resume` flows.
- `/models` and model-selection UX bind to the canonical model inventory v2 contract instead of maintaining a second CLI catalog.
- Provider credentials and account BYOK resolution are scoped, source-aware, and reusable across interactive, deploy, and tunnel flows without storing secrets in project state.
- Runtime receipts now model account-owned runs, provider usage, approvals, and terminal jobs with stable lineage and no tenant/workspace/user ownership aliases.
- Cloudflare diagnostics, context economics, repository evidence, and security/indexing contracts accumulated after 2.5.0 are included in the same verified release lineage.

## 2.5.0 highlights

- `agentsam` is the interactive product entrypoint; renderer selection is internal, and live thinking/activity scenes now run automatically around real Agent Sam work.
- Portable project authority is `.agentsam/config.json` + `.agentsamrules`; local CLI preferences remain non-authoritative.
- Public SDK seams include `/context`, `/tools`, `/indexing`, `/repository`, `/knowledge`, and `/skills`.
- Context resolution is bounded by independent budgets and result policies; consumed tool results compact to evidence-preserving receipts.
- Tool discovery is cards-first rather than full-schema catalog injection.
- `RepositoryKnowledgeProvider` keeps local, hosted, and custom repository-intelligence implementations behind one contract.
- Portable skills now include `agentsam-jr-dev`, `agentsam-app-fundamentals` (`quick-bytes`), and `agentsam-progression-guard` (`no-regress`), with deeper references loaded on demand and CLI discovery through `agentsam skills`.
- Local model inventory/Ollama support remains preference-only and does not become a second routing authority.
- Merkle/repository evidence, knowledge receipts, and project identity share the same portable repository identity.
- `agentsam security scan` now combines OSV/dependency evidence with Merkle-bound AST execution trust-boundary contradictions; `agentsam inspect` exposes the same bounded analysis and mechanical repair actions.

| npm version | Published (UTC) | IAM git SHA (40) | Notes |
|-------------|-----------------|------------------|-------|
| 2.6.0 | 2026-09-12T21:14:57.827Z | `ae32fba0a761cb18c5f940957bdcd58e3cab6072` | Published package; npm `latest`; registry `gitHead`, shasum, integrity, and `v2.6.0` tag verified. |
| 2.5.0 | 2026-09-11T21:27:11.516Z | `da28623dc4808025b77605ed09aa16217b1db607` | Published package; registry `gitHead` receipt. |
| 2.4.1 | 2026-09-11T05:45:03.622Z | `a256ababededd904da555e7898bc8afd753737d2` | Latest published package before 2.5.0. |
| 2.4.0 | 2026-09-11T05:29:02.811Z | `81c8659977953bed53c2adb0a341ce7382be4794` | Published 2.4 line. |
| 2.3.0 | 2026-09-11T05:09:40.046Z | `b517a720fb9b90f35c26f9ef87a84abd60d7ee01` | Published 2.3 line. |
| 2.2.1 | 2026-09-11T04:08:18.238Z | `fefb587312df4fd4e177e839c5374c9621e7463d` | Published 2.2 patch. |
| 2.2.0 | 2026-09-11T02:48:47.291Z | `06539ba3d3c2238b08201192dbec33d0e8df4b8a` | Published 2.2 line. |
| 2.1.0 | 2026-09-09 (UTC, approx) | `a2570afdf1ae99542565fa3937abd7dbf95d121f` | Recon bounded-worker protocol: `protocol/recon/*` schemas, `python/agentsam_sdk/repository/recon` (packet/validate + `from_ripgrep`/`from_ast_grep` adapters), `agentsam recon pack\|validate` CLI (#27, #28). SDK-native change — no corresponding IAM platform-repo mirror SHA. |
| 2.0.0 | 2026-09-03T02:21:44.857Z | `ed629869e701809d2bf4c61bd56d05d8d8d1e183` | Stable SDK 2.0.0; npm `latest`; identity bundled through root exports; release verification and dependency scan passed before publish. |
| 2.0.0-alpha.identity.5 | _(pending npm)_ | `df064114eb7f8888f163e4a07dfddf19035b7169` | Password reset service, `registerFinalizeInboundOAuth`, IAM live proof. |
| 2.0.0-alpha.identity.4 | 2026-08-22 | `df064114eb7f8888f163e4a07dfddf19035b7169` | IAM auth portal sync: signup→`/api/auth/signup`, `company-branding.js`, preview stubs. SDK git `d7498ca`. |
| 2.0.0-alpha.identity.3 | 2026-08-22 | `559bc37267f76790136004f5fa94a2bb3cd6a721` | `company` table + `GET/PATCH /api/company` branding SSOT. |
| 2.0.0-alpha.identity.2 | 2026-08-22 | `559bc37267f76790136004f5fa94a2bb3cd6a721` | `agentsam identity init` scaffold; SDK git `029eebf72c8c166e157dd188340ec966755b4735`. |
| 2.0.0-alpha.identity.1 | 2026-08-22 | `559bc37267f76790136004f5fa94a2bb3cd6a721` | Preview CLI + docs/export fixes; SDK git `360a3049bcfdc71f86d795019817a417048abb9a`. |
| 1.9.0 | 2026-08-05T07:12:21.726Z | `fc1628505cb3c9946c149e4c468c2e264d6f381e` | `python/agentsam_sdk/repository/inspect.py` (`--dupes`); CLI `agentsam repository inspect` |
| 1.8.0 | 2026-08-02T13:57:12.080Z | `580547301e370b77ec26bd72558979d335feedd9` | `python/` + `protocol/` in npm `files`; `repository.scan_bloat`; shell-kit folded to `packages/agentsam-shell-kit` (private). SDK git at publish: `ac52669b89ddb16fad87c42fe53f2c93ef13bd1a`. |
| 1.7.0 | 2026-07-14 | _(pre-receipt)_ | Prior publish |

**Pairing (identity alpha .2):** `iam@559bc37267f76790136004f5fa94a2bb3cd6a721` ↔ `@inneranimalmedia/agentsam-sdk@2.0.0-alpha.identity.2`

**Pairing (identity alpha .1):** `iam@559bc37267f76790136004f5fa94a2bb3cd6a721` ↔ `@inneranimalmedia/agentsam-sdk@2.0.0-alpha.identity.1`

**Pairing (identity alpha):** `iam@559bc37267f76790136004f5fa94a2bb3cd6a721` ↔ `@inneranimalmedia/agentsam-sdk@2.0.0-alpha.identity`

**Pairing (1.9):** `iam@fc1628505cb3c9946c149e4c468c2e264d6f381e` ↔ `@inneranimalmedia/agentsam-sdk@1.9.0`
