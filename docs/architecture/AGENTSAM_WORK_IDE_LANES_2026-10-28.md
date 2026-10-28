# AgentSam Work / IDE / storage lanes — 2026-10-28

## One existing product, not competing IDEs

- packages/agentsam-work owns portable Work navigation, Artifacts and Project Detail.
- apps/local-studio/backend/worker/work-service.js supplies account-scoped Work snapshots.
- packages/agentsam-ide owns Monaco document models, LSP contracts, save-queue conflict detection and filetree.
- apps/local-studio/frontend/src/components/workbench/files.tsx embeds the existing Monaco editor in the AgentSam side-stage.
- Legacy /files endpoints redirect into /admin/agentsam with the Files side tab; no duplicate full-page IDE.
- Work Project Gallery filters only explicit media_assets.project_id === projects.id, authorized by the project's owner_user_id. A local filesystem workspace is linked only when exactly one explicit Work-project assignment exists in Studio trails.
- Storage source choices: R2, local, Google Drive, shared drives and registered artifacts. Live hosted Work currently lists selected R2 prefixes and owner-authorized registered media. Local workspace metadata comes from mounted authorized workspaces in browser state; Google Drive/shared drives provider listing are NOT implemented in Work host. OAuth alone does not prove file-listing capability.
- Public preview URLs are restricted to the known public R2 prefix. No arbitrary private R2 key or local path becomes an unauthenticated URL.

## Multiple agent work lanes

Monaco document URIs are keyed by Studio workspace/project ID plus file path. Separate scratch workspaces have independent editor models and undo stacks but no independent on-disk Git branch.

For real filesystem lane isolation, use separate authorized Git worktrees, one loopback AgentSam PTY/FS service per root. The UI attaches to these services by loopback URL; the runtime reports the authorized root and temporary capability. Two services reporting the same root cannot both register as independent Studio lanes.

Example (inspect Git status and branches first; never discard unrelated work):

    cd ~/agentsam-sdk
    git status --short --branch
    git worktree list
    git -C ~/dreamhouse worktree list

    # When the requested branches/worktrees do not already exist:
    git -C ~/agentsam-sdk worktree add -b lane/site ~/agentsam-lanes/site HEAD
    git -C ~/dreamhouse worktree add -b lane/architecture ~/agentsam-lanes/architecture HEAD
    git -C ~/agentsam-sdk worktree add -b lane/platform ~/agentsam-lanes/platform HEAD

    # Run each in a separate Mac terminal:
    cd ~/agentsam-sdk
    ./bin/agentsam start-local --cwd ~/agentsam-lanes/site --port 3101
    ./bin/agentsam start-local --cwd ~/agentsam-lanes/architecture --port 3102
    ./bin/agentsam start-local --cwd ~/agentsam-lanes/platform --port 3103

In AgentSam -> Files side-stage -> Host, attach http://127.0.0.1:3101, :3102 and :3103 to the appropriate lane. The local capability is never an unrestricted public Worker token.

## Remaining full orchestration gates

- Agent-to-worktree job assignment and task-scoped permissions.
- Per-lane agent/terminal lifecycle, LSP sessions and cancellation.
- Cross-agent merge/review queue, optimistic concurrency, separate branch ownership.
- GitHub provider browsing and Google Drive/shared drive listing in the Work artifact host.
- Accessible project-file linking UI, authorized private preview/download and durable file provenance.
- Hosted Artifacts/mobile and multi-agent end-to-end visual acceptance.

## Verification

Two temporary local PTY/FS runtimes on distinct roots/ports reported different workspace IDs, and both capability bootstraps passed; both servers and test roots were cleaned up. IDE package 16 tests; Work package 13; Local Studio frontend 81; local Gallery/CLI 4 integration tests; all pass. TypeScript checks pass. Hosted deployment and full multi-agent orchestration are NOT claimed. Unrelated CAD/3D repository changes were not modified by this work.
