# Media Truth / BrandOps source recovery — October 8, 2026

## Ownership and scope
The nine scripts under scripts/brandops/ were recovered from the old
feat/media-truth-v1 worktree. They are developer/operator evidence tools,
not a second media service and not a production transform implementation.

The current media-kit/runtime remains the source of truth for derivatives,
delivery URLs, and original media. The scripts may inspect, plan, or verify,
but must not manufacture a ready release receipt without real provider output.

## Evidence run (read-only source, scratch output outside the repository)
- Python source compiled successfully using python3.14.
- Repo/media inventory: 109 assets / 7.6 MB / 15 duplicate groups.
- Derivative plan: 146 planned variants.
- Sprint receipt: NOT READY.
- Blocker: no materialized-derivatives.json; no physical transform output
  or delivery URLs have been demonstrated by the product pipeline.
- No R2 writes or asset deletions occurred.

## Closure gate
1. Connect actual media-kit Prepare/transform execution to persisted artifacts.
2. Record per output: immutable source identity, transform settings, output
   object key/URL, byte size, checksum, capability provenance, and status.
3. Generate the manifest from outputs, not from a planned-only inventory.
4. Run verify_media_truth.py over those outputs with a real delivery probe.
5. Only then permit sprint_receipt.py to mark READY.
6. Preserve master assets and avoid eager derivatives without explicit Prepare.

Original untracked .agentsam/brandops/ remains in the old worktree; this
recovery deliberately does not put runtime receipts or local SQLite into Git.
