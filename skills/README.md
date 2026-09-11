# AgentSam Skills

Portable, on-demand AgentSam behavior modules. Skills keep specialized guidance
out of the permanent system prompt and load deeper `references/` only when the
current task calls for them.

## Canonical skills

- `agentsam-jr-dev/` — explain, inspect, build, and revise real software using
  beginner-friendly language grounded in the actual repository and runtime.

Apps may contain host-specific skill directories of their own. Those do not
replace the portable SDK skills in this directory.
