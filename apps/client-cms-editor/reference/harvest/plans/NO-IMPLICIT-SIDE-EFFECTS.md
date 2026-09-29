# No Implicit Side Effects

This is a hard product rule for all harvest and future AgentSam integration work.

## Capability availability is not action authorization

Installing AgentSam SDK or a theme/CMS/identity package means:

> the capability is available

It never means:

> execute the capability against a customer system

## Safe/read-only classes

These should be non-mutating by default:

- inspect
- inventory
- scan
- audit
- preview
- analyze
- plan
- diff
- validate

## Local/staging mutation classes

These may write only to an explicit local/staging target:

- scaffold
- export
- stage
- generate
- apply-local

They must not contact production resources unless a separate explicit option says so.

## Remote/customer mutation classes

These require explicit invocation and explicit target:

- sync
- upload
- promote
- publish
- deploy
- migrate
- rotate
- delete

A generic SDK lifecycle hook must never invoke them.

## Harvest scripts on this branch

The Python scripts added by this branch:

- never call Wrangler
- never deploy
- never publish
- never access D1/R2/KV
- never run npm lifecycle commands
- never change Git branches
- never push commits
- never write into active AgentSam SDK packages

The only optional SDK write target is:

`apps/_incoming/studio-cms-editor-harvest/`

and it requires the explicit `--stage-sdk` flag.

## Promotion receipts

Future mutating commands should emit a receipt containing at minimum:

- action
- target
- source revision
- files/resources affected
- timestamp
- result
- rollback/recovery information when available

This is especially important for theme/content/CMS systems because package discovery and preview must remain safe.
