# Local filesystem / PTY authority (closure sprint)

## What protects `/v1/fs` today

| Control | Behavior |
|--------|----------|
| **Binding** | Loopback only (`127.0.0.1`). Non-loopback host refused at start. |
| **Root** | Process-bound at `agentsam start-local` cwd. Clients cannot submit an arbitrary absolute root to gain authority. |
| **Capability** | Short-lived `awc_…` minted per runtime. Required on all `/v1/fs/*` and PTY attach (`?capability=`). Distinct from `AGENTSAM_API_KEY`. |
| **Bootstrap** | `GET /v1/workspace/bootstrap` — loopback + Studio origin allowlist. Rejects `?root=` that ≠ authorized cwd. |
| **CORS** | Not `*`. Allowlist of local Studio origins only. |
| **Containment** | All paths resolved via `resolveContainedPath` (traversal + symlink escape rejected). |
| **PTY cwd** | Must equal authorized root or a contained path; mismatch closes the socket. |

## Trust chain (local → hosted)

```
AGENTSAM_API_KEY          (account/API — not used as PTY attach)
        ↓
local workspace capability awc_…   (this sprint)
        ↓
PTY session + /v1/fs under one root

Later:
account → terminal:connect → enrolled instance → approved workspace root
```

## Studio identity

Filesystem project stores:

- `workspaceRoot` (= runtime authorized root)
- `runtimeBaseUrl`
- `workspaceId`
- `runtimeCapability`

Scratch projects never receive these; they keep the virtual shell.
Filesystem projects **refuse** virtual-shell fallback.
