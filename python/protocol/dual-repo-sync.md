# Dual-repo sync checklist

Use this every time you add or change an `agentsam_sdk` tool/feature.

## Before coding

- [ ] Name the module (`agentsam_sdk.<domain>.<tool>`) and CLI verb
- [ ] Confirm it belongs in SDK (portable) vs platform-only Worker hot path
- [ ] Note in-app inspiration path (if any), e.g. `src/core/code-indexer.js`

## Land

- [ ] Implement + tests in **`inneranimalmedia/agentsam-sdk/`**
- [ ] Mirror the same module/CLI/docs into **`agentsam-sdk`** (npm repo)
- [ ] Update `docs/gaps.md` (or equivalent) in **both** trees
- [ ] Update `protocol/` only in monorepo if law changed; copy README blurb to npm

## Publish / deploy (operator)

- [ ] Platform: commit/push IAM → deploy by host (`deploy:full` / `ship:remote`)
- [ ] SDK: bump `package.json` version in npm repo → `npm publish` (manual)
- [ ] Record versions next to each other (PR description or receipt):  
      `iam@<sha>` ↔ `@inneranimalmedia/agentsam-sdk@<semver>`

## Drift signals (fail the PR)

- Module exists only in one repo
- CLI flag / JSON field renamed on one side only
- README claims “this is not the npm package” / “audits don’t belong here”
- npm publish without a same-day IAM mirror commit (or documented lag ticket)

## jq / host tools

Host tooling (`jq`, `wrangler`, Python ≥3.10) is documented in
`docs/tooling.md`. Keep that file mirrored when recipes change.
