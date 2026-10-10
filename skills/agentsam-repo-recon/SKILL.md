---
name: agentsam-repo-recon
description: >
  Understand an unfamiliar or large repository with read-only deterministic tools before reading
  files or spending model tokens: `agentsam inspect`, `agentsam machine inspect`, brand, security
  and package scans, and the knowledge index. Use at the start of any task in a repo you have not
  mapped, when asked "what is in this repo", "what changed", "is it safe", or "where does X live".
  Triggers on "recon", "inspect", "map the repo", "audit", "scan", and "what do we have".
metadata:
  short-description: "Map a repo with deterministic read-only commands first; escalate to the index or a model last"
  aliases:
    - recon
    - repo-recon
    - inspect-first
    - map-repo
user-invocable: true
---

# Repository recon

Deterministic tools are cheaper, faster, and checkable. Use them first. Escalate to the index
or a model only for what they cannot answer.

## Order of operations

```bash
agentsam inspect --json                    # snapshot: files, systems, Merkle root, trust boundary
agentsam machine inspect <path>            # focused look at a directory; detail goes to .agentsam/machine/runs/<run_id>/
agentsam brand scan --json                 # colors, type, assets, token conflicts
agentsam security scan --json              # dependency + trust-boundary scan (needs network to be complete)
agentsam package audit --json              # publish readiness of each package
agentsam index status                      # is the knowledge index fresh?
```

Add `--offline` to the security and package commands only when you have no network, and then
**report the result as incomplete**: offline `security.scan` returns `status: "incomplete"` with
`checked_count: 0`, which is not a clean bill of health.

## Read the result honestly

- Check completeness fields (`status`, `complete`, `checked_count`, `unchecked`) before saying "clean".
- `brand scan` includes donor and `reference/` copies of the same files, so counts and
  near-duplicate colors are inflated until those paths are excluded.
- `machine inspect` writes run artifacts under the target's `.agentsam/machine/runs/`. That is
  expected; it is not a source change.
- Cite what you ran and the output you saw. Do not infer repository facts from folder names.

## Index sharp edges

- `agentsam codebaseindex` is a guided wizard that can call an embedding provider and write under
  `.agentsam/`. Run it only when asked.
- In 2.6.12 the wizard's inventory step printed `0 files` for source directories and a LOC figure
  far below `agentsam inspect`'s count, then cancelled after "Yes". Treat its inventory as
  unreliable and trust `agentsam inspect`.
- A narrow ingest scope reported hundreds of previously indexed files as `removed`. Read the
  `changes` block before narrowing scope.

## Related

- Operation inputs for the same machinery: `agentsam-sam-operations`.
- Where a command or package lives: `agentsam-sdk-orientation`.

Last verified against agentsam-sdk 2.6.12.
