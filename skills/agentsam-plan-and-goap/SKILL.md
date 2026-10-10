---
name: agentsam-plan-and-goap
description: >
  Check, create, advance, and prove durable project-local work plans (`agentsam plan`) and read
  the GOAP blackboard (`agentsam goap`). Use before planning from scratch, when resuming work or
  switching sessions, and whenever a task spans several steps. Triggers on "plan", "next step",
  "where did we leave off", "resume", "todo", "sprint", "goap", "blackboard", "what is active",
  and "acceptance criteria".
metadata:
  short-description: "Read plan state first; advance steps with evidence, only when asked"
  aliases:
    - plan
    - plans
    - goap
    - blackboard
    - resume-work
user-invocable: true
---

# AgentSam plans and GOAP

A plan ledger and a GOAP blackboard already exist. Do not invent a second todo list, a
`PLAN.md`, or another tracker. **Read state first, then act.**

## 1. Read state (always safe)

```bash
agentsam plan list             # active plans and progress (e.g. 3/9)
agentsam plan show current     # goal, steps, and each step's status
agentsam plan next --json      # the next step; add --start only to begin it
agentsam goap                  # blackboard: active task, world snapshot, knowledge freshness
```

`agentsam goap` also prints `Updated:` and whether knowledge is `stale`. If state is old or
stale, say so before relying on it. Re-indexing is heavy: do it only when asked.

## 2. Lifecycle commands

| Command | Use |
| --- | --- |
| `agentsam plan new "<title>" [--goal "..."] [--type feature\|sprint\|refactor\|incident\|daily\|run]` | Create a plan |
| `agentsam plan add "<step>" [--kind inspect\|implement\|verify\|deploy\|decision] [--acceptance "..."]` | Add a step |
| `agentsam plan depends TODO_ID DEPENDENCY_ID` | Order steps |
| `agentsam plan start TODO_ID` | Mark a step running |
| `agentsam plan evidence TODO_ID --type TYPE --ref REF [--note "..."]` | Attach proof |
| `agentsam plan accept TODO_ID "<criterion>" [--evidence REF]` | Record a met criterion |
| `agentsam plan done TODO_ID` / `agentsam plan block TODO_ID --reason "..."` | Close or block |

## 3. Rules

- **Only change plan state when the user asks in the current turn.** Reading is always fine.
  Do not start, complete, or add steps on your own initiative.
- **A step is done when its acceptance criterion has evidence** (test output, command result,
  hash, commit), not when code was written. Attach evidence, then accept, then done.
- **One ledger.** Resume from `plan next`; do not restate the whole plan in chat.
- **Plan vs GOAP.** The plan is the durable step ledger. GOAP plans over world state:
  `planning.goap` (see `agentsam-sam-operations`) and domain plans such as
  `agentsam plan brand --goap --json`.

## 4. Which docs are authority

| Doc | Status |
| --- | --- |
| `packages/agentsam-goap/README.md` | Authority: maps GOAP ports onto existing tables; frozen v1 contracts |
| `docs/architecture/SAM_KERNEL.md` | Authority for `planning.goap` and `planning.astar` |
| `docs/plans/SAM_WORK_PROTOCOL.md` | **Proposal only** ("no runtime or package split is authorized"). Do not treat as implemented |

`agentsam work` is **not** a command, even where help text lists it. Use `plan` and `goap`.

## Verify before trusting this skill

```bash
agentsam plan --help    # command list still matches section 2?
agentsam goap           # blackboard still prints?
```

Last verified against agentsam-sdk 2.6.12.
