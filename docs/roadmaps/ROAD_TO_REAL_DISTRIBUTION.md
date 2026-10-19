# AgentSam — Road to Real Distribution

**Status:** PROPOSED owner development track (not a release receipt)
**Scope:** InnerAnimalMedia-owned AgentSam SDK, Local Studio, CLI, Go daemon and native distribution.
**Candidate:** SDK source 2.6.13; npm remains at 2.6.12 until manual click-through and approval. Verify registry state before publishing.

## Standard: proof over issue closure

The canonical plan is `protocol/governance/distribution-roadmap.v1.json`; this document is the human-readable strategy. GitHub issues and PRs track accountable development; SAM GOAP plans and receipts track execution evidence. An AgentSam Ticket may *project* a GitHub issue, but must not pretend a GitHub label is installation evidence.

**Order:** discover existing code -> define user journey -> plan dependencies -> implement -> run negative and real install tests -> review/merge -> verify installed destination -> collect owner approval -> promote artifacts. A successful PR is not a shipped runtime. Do not publish npm 2.6.13 until the owner visually approves the deployed Worker/Local Studio.

**Current reality (inspect anew for each issue):**

- `scripts/build-sea.mjs` already generates SEA config and build commands, and injects an **existing** CommonJS bundle. It is not proof that `bin/agentsam` bundles or that a standalone no-Node CLI works.
- `scripts/install.sh` exists for npm bootstrap. Extend its install contracts instead of making an unrelated installer.
- `apps/agentsam-go-worker/runtime` implements Go agentsamd and PTY; `scripts/verify-go-distribution.mjs` already has clean-room receipts. Verify Windows behavior rather than assuming the README is a test.
- `scripts/release-train.mjs`, `scripts/npm-publish-preflight.sh`, and `.github/workflows/publish-stable.yml` own npm publication. This distribution initiative must not implicitly publish.
- Python frozen binaries, Rust native artifacts and C++ static binaries are **different deliverable classes**, not Node SEA. Add them later as independent engines under shared provenance/installation contracts. Native binaries can still depend on platform libraries.

## Governance labels

The only canonical inventory is `protocol/governance/github-labels.v1.json` (40 definitions). Maintain these with `node scripts/github/sync-labels.mjs --dry-run`, then the repository's manually dispatched **GitHub governance — labels and safe triage** workflow in `apply` mode after review. The sync is idempotent and never deletes labels.

One `type:`, one `priority:`, and one `scope:` are the normal **three core labels** when known. `status:` and `size:` are supplementary and never substitutes for receipts. Don't enforce three labels on ambiguous intake: `status: needs-triage` alone is okay. P0 is for actual incidents, security emergencies or confirmed release stoppers; architecture aspirations are not P0. Priority is an ordering signal, not a contractual SLA. `good first issue` and `help wanted` are **opt-in** for genuinely external-contributor-friendly work; not every public repository task is community-safe.

Automatic intake:
- A newly opened GitHub issue receives `status: needs-triage` **unless** it already has an explicit status.
- A PR touching exactly one recognizable component may receive one `scope:` label, unless already scoped.
- Mixed-component PRs remain unguessed; humans assign owner/type/priority/size/status.
- No workflow auto-closes issues, claims shipment, guesses severity, changes permissions, or executes a fork's code with a write-capable token.
- Status changes must follow evidence: `ready` requires accepted outcome and prerequisites, `blocked` names the dependency, `in-progress` means active work. GitHub closed state and AgentSam `shipped` remain independent.

## Distribution milestones and dependency-ordered tickets

These are **planned issue seeds**, not claims that GitHub issues have been created or completed. Stable IDs are local roadmap identifiers; when issues are approved, link them by canonical `owner/repo#number` and keep the ID in the issue body.

| Phase | Milestone / capability | Planned tickets | Gate to exit |
| --- | --- | --- | --- |
| P0 | Authority and Tickets/Projects projection | DIST-00, DIST-12 | Release channels, owner decisions and issue identity contract reviewed |
| P1 | Bundle and embedded assets | DIST-01, DIST-02, DIST-03 | No-Node CLI smoke with real assets, or explicit unsupported-feature list |
| P2 | Go daemon and platform lifecycle | DIST-04, DIST-05 | Native PTY recovery and Windows lifecycle evidenced on target hosts |
| P3 | Binary artifacts and provenance | DIST-06, DIST-07 | Five-target artifact matrix, digests, SBOM and required signatures |
| P4 | Install and upgrade | DIST-08, DIST-09 | Idempotent installer, verified receipts, rollback and uninstall |
| P5 | Distribution proof and approval | DIST-10, DIST-11 | Clean-room install + owner click-through before release |

**Critical path:** DIST-00 -> [DIST-01/02/03 in parallel with DIST-04/05] -> DIST-06 -> DIST-07 -> DIST-08 -> DIST-09 -> DIST-10 -> DIST-11. Distribution is never blocked by optional Rust/C++/Python native-engine bundling unless those are separately approved release prerequisites.

### Issues to create only after review

- **DIST-00** — Resolve release authority, channel policy and ownership (`type: chore`, `priority: p1-high`, `scope: release`).
- **DIST-01** — SEA proof: bundle CLI, `--version`, `doctor`, report dynamic-import limitations.
- **DIST-02** — Reusable asset resolver for npm and Node SEA; no duplicated protocol or migrations.
- **DIST-03** — Lazy TypeScript/native dependency boundary; heavy npm functionality stays available.
- **DIST-04** — Reuse agentsamd for PTY and terminal cancellation rather than second Node-native lane.
- **DIST-05** — Verify Windows Go daemon support and process-management installation, not just cross-compilation.
- **DIST-06** — Native GitHub artifact preview build matrix and SHA256/SBOM/provenance metadata.
- **DIST-07** — Release security signatures and verified promotion policy; signing credentials handled only through vault.
- **DIST-08** — Existing installer extension + `install.ps1`, verification and install/uninstall receipts.
- **DIST-09** — `agentsam upgrade` with atomic swap, rollback, and healthy `doctor`.
- **DIST-10** — Real no-Node clean-room test on all target platforms, including tampering and denied operations.
- **DIST-11** — Human click-through approval, immutable artifact SHA and promotion to correct channel.
- **DIST-12** — Project external GitHub issues into account-owned Work/Tickets/Projects with traceable sync metadata.

Every planned issue has dependencies and three evidence acceptance criteria in the machine manifest. Do not mark all tasks `status: ready` automatically; the owner must accept the boundaries first.

## In-app Tickets / Projects integration

The existing account-owned `agentsam_tickets`, `projects`, and ticket event contracts in Local Studio remain the business authority for Work. Do **not** extend portable `cms_*` tables for planning, release data or application state. The future GitHub adapter should provide a **read/project + explicitly authorized write** lane:

```ts
interface ExternalIssueRef {
  provider: "github";
  repository: string;     // owner/repo
  issueNumber: number;    // stable GitHub identity; not a ticket ID
  issueUrl: string;
  lastSyncedAt?: string;
}
interface DistributionReceiptRef {
  commitSha: string;
  artifactSha256?: string;
  installReceiptId?: string;
  environment?: string;
  verifiedAt?: string;
  acceptedByOwnerAt?: string; // explicit approval, never inferred
}
```

Recommended UI: a **Road to Real Distribution** Project, milestone board (P0-P5), ticket details with type/priority/scope/size/status, a dependency view, and separate **Code**, **Verified**, **Installed**, **Accepted**, **Released** indicators. UI filters read the canonical manifest rather than hardcoded label colors. The GitHub issue is not duplicated into another authoritative external backlog; linked local tickets use account authorization and provenance and must not overwrite `shipped` just because an issue/PR closed.

**Drift controls:** importer upserts by `repository + issueNumber`, debounced polling/webhooks with event IDs, optimistic concurrency for outbound updates, explicit permissions for create/edit/close, GitHub-to-Ticket status mapping documented and confirmed rather than unilateral. Keep ticket events and GOAP receipts. Owner/customer workspaces choose their own label presets; IAM governance is not imposed on customer installs.

## Delivery gate: source -> executable -> audience

Before calling any platform shipped, require the target artifact SHA, platform/arch, test logs, signature/digest validation, install receipt, `agentsam doctor`, permissions/rollback checks, and the user-visible destination. Provenance is per distributable: npm, Node SEA, Go daemon, Tauri desktop, hosted Worker and optional CAD engine each have independent lifecycle receipts.

Distribution labels and roadmap do not authorize deployment, npm publication or a credentials migration.
