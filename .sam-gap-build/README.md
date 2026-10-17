# SAM P0 — executable implementation register

This **tracked** directory is the active implementation handoff for
SAM-001 through SAM-010 on the agentsam-sdk P0 integration branch.
The authoritative runtime implementation remains in src/, packages/,
and existing ACP/MCP/IAM owners. This folder is **not a replacement runtime**.

## Version-controlled sources

- prompts/SAM-001.md through SAM-010.md: ticket definitions and acceptance work.
- prompts/SAM-001-execution.md: attempted SAM-001 execution prompt.
- reports/SAM-001.json through SAM-010.json: historical attempt results.
- reports/baseline-machine-acceptance-c37123c2.json: immutable older baseline.
- summary.json and REVIEW.md: original historical handoff.
- scripts/verify.sh: regenerate evidence and run bounded baseline checks.

The original reports are *historical* and mostly not_executed or
REVIEW_REQUIRED. Their head_before, base, working_tree, and absolute
paths refer to the **old** baseline; they do not describe the current checkout.
Never change a failed/blocked ticket to complete merely because tests compile.

## Deliberately local / ignored

- logs/: CLI sessions, stdout/stderr and possibly future credentials.
- machine-acceptance/: reproducible build output and language-ID projections.

Neither is deleted by Git ignore. The generated contents remain available on
the current Mac and are rebuilt with the script below. Only reviewed,
non-sensitive receipt summaries should be committed to reports/.

## Run

From the SDK root:

    bash .sam-gap-build/scripts/verify.sh

This runs the existing SAM Machine checks and evaluates only the **currently
implemented JS/Python/project/SQLite slice**. The full --require all release
gate intentionally remains red until required runtime, IAM, and app
capabilities have real execution evidence.

## Ticket completion contract

For each SAM-00X record: source owner, actual diff/handler, positive and
negative contract tests, scope/approval proof, real receipt(s), merged PR,
and installed-main verification. Require an independent filesystem/test check
even if a model reports turn_completed.

Security gate: SAM-007 cannot be considered done until IAM consent, token
scope, server enforcement, and SDK denial are tested together.
