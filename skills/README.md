# AgentSam Skills

Portable, on-demand AgentSam behavior modules. Skills keep specialized guidance
out of the permanent system prompt and load deeper `references/` only when the
current task calls for them.

## Canonical skills

- `agentsam-jr-dev/` — explain, inspect, build, and revise real software using
  beginner-friendly language grounded in the actual repository and runtime.

- `agentsam-app-fundamentals/` — quick application-building laws for trust,
  contracts, credentials, dependency graphs, AST evidence, and Merkle evidence.
- `agentsam-progression-guard/` — checkpoint/hook discipline for local work, CI,
  deploy, postdeploy verification, promotion, runtime observation, and rollback.

List or open them with `agentsam skills`; aliases such as `quick-bytes` and
`no-regress` are intentionally short enough for terminal use.

Apps may contain host-specific skill directories of their own. Those do not
replace the portable SDK skills in this directory.
