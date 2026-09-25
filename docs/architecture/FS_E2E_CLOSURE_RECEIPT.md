# Filesystem E2E closure receipt

**Status:** COMPLETE (product adapter + real PTY + identity + conflict)  
**Commit target:** agentsam-sdk `main`  
**Date:** 2026-09-25

## UI workflow exercised

1. `startLocalPtyServer` bound to disposable git root (same as `agentsam start-local`)
2. Studio bootstrap: `GET /v1/workspace/bootstrap` → capability
3. Monaco path: `RuntimeFilesystemAdapter.read/write` (identical contract to FilesStage save)
4. Real PTY WebSocket with same `workspace_id` / root / capability
5. `git diff -- README.md` in PTY shows Monaco marker
6. External disk edit → version change → stale write → `version_conflict`
7. Studio UI: Projects → Open filesystem… binds to authorized runtime root only

## Proof artifacts (from last green run)

| Field | Value |
|------|--------|
| disposable root | tmp `agentsam-fs-e2e-*` git repo |
| workspace_id | minted `ws_…` |
| runtime | `http://127.0.0.1:<ephemeral>` |
| PTY session | `pty_…` via workspace_identity |
| Monaco path | `README.md` |
| PTY path | `NOTES.md` |
| stale write | `code: version_conflict` |
| scratch fallback | **disabled** for filesystem projects |

Automated: `test/integration/studio-fs-pty-e2e.test.mjs`  
Receipt JSON written under `$TMPDIR/agentsam-fs-e2e-receipt-*.json` on each run.

## Authorization model

See `docs/architecture/LOCAL_FS_AUTHORITY.md`.

- Loopback bind only
- Capability required (not API key)
- Arbitrary root claim rejected
- CORS allowlist (no `*`)

## Remaining (not blockers for FS closure)

- Native FS watcher → `workspace.file.changed` (today: focus/interval version check + conflict)
- Go agentsamd implementing `protocol/runtime/workspace-fs.v1.schema.json`
- Hosted account → enrolled instance graduation
- Computational Hyperspace Activity tab (separate product sprint; event-driven, not demo timer)

## Checklist

- [x] filesystem workspace opens (Studio dialog + runtime bind)
- [x] Monaco adapter reads/writes real file
- [x] Studio real PTY same root + identity frame
- [x] `git diff` sees Monaco edit
- [x] PTY/external edit observable; stale save conflicts
- [x] Scratch remains virtual; filesystem refuses virtual shell
- [x] no arbitrary path authority
- [x] filesystem contents not localStorage authority
- [x] integration receipt records workspace/root/runtime/session
