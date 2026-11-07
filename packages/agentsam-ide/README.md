# @inneranimalmedia/agentsam-ide

**Reusable, host-neutral IDE editor and workspace contracts for AgentSam.**

The SDK package source is the canonical owner of the Monaco editing UI. Local Studio Desktop/Work and other product UIs supply authorized workspace adapters; the package **does not** read files, install tools, spawn terminals, or infer remote/cloud backends by itself.

## Public modules

| Import | Implemented role |
|---|---|
| `@inneranimalmedia/agentsam-ide/monaco` | Real React Monaco editor, document identity, selection, diagnostics, format/save actions, model lifecycle and customizable palette |
| `@inneranimalmedia/agentsam-ide/workspace` | Generic serialized/debounced optimistic save queue with explicit version-conflict protection |
| `@inneranimalmedia/agentsam-ide/filetree` | Collapsible tree state and path selection model |
| `@inneranimalmedia/agentsam-ide/terminal` | Terminal boot contract and agentsamd health probe |
| `@inneranimalmedia/agentsam-ide/lsp` | Language-pack/capability handshake contracts; **not** a working standalone LSP transport |
| `@inneranimalmedia/agentsam-ide/onboarding` | First-login CLI tutorial |
| `@inneranimalmedia/agentsam-ide` | Runtime-neutral document/workspace/terminal contracts (does not import Monaco/React) |

## Editable Monaco component

```tsx
import { AgentSamMonacoEditor } from '@inneranimalmedia/agentsam-ide/monaco';

<AgentSamMonacoEditor
  document={{ workspaceId: activeWorkspace.id, path: selectedFile.path, text: selectedFile.content }}
  onChange={(text, document) => workspace.updateDraft(document.path, text)}
  onSave={(text, document) => workspace.saveWithVersionCheck(document.path, text)}
  onSelectionChange={(selection, document) => inspectSelection(document.path, selection)}
  onDiagnostics={(markers, document) => updateProblems(document.path, markers)}
/>
```

`WorkspaceSaveQueue` provides host-independent, per-file 700ms debouncing, ordered writes, version checks, explicit overwrite decisions, and safe handling of keystrokes typed before disk-read completion. A host injects its own `write` implementation; the package does not know whether files live on a Mac, VM, or other authorized runtime.

`workspaceId` + `path` produces a stable, URI-safe Monaco model identity. Two unrelated repositories may each have `src/App.tsx` with independent undo history. Switching open tabs keeps their models/view state. Call `disposeWorkspaceModels(monaco, workspaceId)` **when closing a workspace**, not when changing tabs.

Formatting (Shift+Alt+F), save (Cmd/Ctrl+S), themes, minimap/options, selection events and native Monaco diagnostics are implemented. `onSave` is a host callback: actual write/optimistic concurrency/version-conflict handling remains with the authorized filesystem runtime.

Monaco has built-in TypeScript/JavaScript language workers; this is **not equivalent to a real LSP connection**. The Go/Rust/Python language-pack discovery available through `agentsamd` still needs process supervision and a workspace-authorized JSON-RPC client/transport. Never report external LSP `ready` without initialization and actual document diagnostics.

### Bundling offline / desktop

The React package has `react`, `react-dom`, `@monaco-editor/react` and `monaco-editor` as peer dependencies. Consumer hosts configure Monaco assets/workers using their own bundler or static-asset service. No provider-specific daemon, Cloudflare binding, Docker container or CDN is required.

Local Studio's Vite host explicitly bundles editor, TypeScript, HTML, CSS and JSON workers in `frontend/src/components/workbench/monaco-runtime.ts`, loaded **only in the browser**. The native desktop app reuses the same package and workers; its Tauri bridge retains all privileged filesystem/terminal authority.

### Verification

```bash
npm --prefix packages/agentsam-ide run build
npm --prefix packages/agentsam-ide test
npm --prefix apps/local-studio run build:desktop
npm --prefix apps/local-studio run smoke:desktop
npm run verify:ide-package
```

A separate React/Vite consumer smoke test verified browser edits, selection, Cmd+S callback, per-project model isolation, tab switches and no external network requests against a packed tarball.

**Do not** ship a second Monaco component or assume arbitrary scratch content is a real filesystem project. The three separately testable owners are: the editor UI, the workspace filesystem host, and the optional language-server session.


### Unified IDE host (November 2026 WIP)

Local Studio Side Stage Files mounts the packaged WorkspaceEditor used by
Ecommerce Theme Studio, replacing a second file tree and editor chrome.

The shared package includes a source rail (Local, GitHub, R2, Drive, Cloudflare
container, Docker), command palette, system-font context menus, Explorer,
Search, Timeline, Problems, versioned saves, conflict handling, split editing
and verified Merkle snapshot/Changes contracts. Docker artwork uses the official
Simple Icons asset; the other source logos come from the InnerAnimalMedia
filesystem source assets.

**Status distinctions (must remain truthful):**
- The authorized RuntimeFilesystemAdapter supplies real versioned filesystem
  reads, writes, creates, renames and deletes. Local Studio passes its
  authenticated LSP transport into packaged Monaco.
- Opt-in Sample Tutorial files are isolated memory state, not a host filesystem.
- GitHub and Google Drive use explicit account-scoped OAuth-backed file adapters
  for authorized reads and guarded manual text writes; R2 supports authorized
  browsing and bounded text reads. Cloudflare containers expose management
  discovery only, and Docker has no authorized filesystem adapter yet.
  Unconnected sources never substitute tutorial files.
- Merkle comparison requires verified content hashes for every file. Runtime
  Snapshot captures a **session-only** baseline; Changes compares against it.
  Persisted D1/R2 snapshots require the existing account, repository and
  workspace authority; a local digest is never represented as a release record.
  Cross-session history and durable snapshot integration remain WIP.
- Previous Side Stage LSP navigation and file-preview behaviors need live
  authenticated acceptance tests before shipping this new surface to customers.

The previous InnerAnimalMedia filesystem, virtual tree, Monaco, Merkle and
provider UI components remain donor references. The shared WorkspaceEditor now
uses an overscanned virtualized file tree (instead of rendering every file),
a restrained right-click file menu, command palette, and system UI typography;
code itself remains monospaced. No parallel editor is introduced.

A Chromium web/PWA user may explicitly select a browser folder via File System
Access. The reusable IDE adapter supplies real text reads, manual writes,
SHA-256 version checks, post-save readback, and guarded delete. Native Tauri
WebKit instead uses the existing authorized runtime and native LSP/PTY path;
browser FSA does not pretend to supply native LSP, PTY, atomic CAS or history.
This remains separate from account-scoped remote providers.

### Authenticated remote provider browsing (November 2026 follow-on)

Local Studio's existing Work authentication routes now host read-only provider-backed
FileWorkspace views inside the same packaged WorkspaceEditor:

- Google Drive: Existing google_drive OAuth grant in user_oauth_tokens, encrypted
  token and refresh support from connector-oauth.js; explicit Google account
  selection; Google Drive v3 folder listing and bounded text reads. The OAuth
  application's drive.file permission only sees files the app is authorized
  for. Native Docs may be inspected as exported text, but are not edited.
  Unconnected accounts are not substituted with Gmail or Google Cloud grants.
- Cloudflare R2: Existing cfoa OAuth resolver, explicit Cloudflare account
  selection, R2 bucket listing, prefix/cursor browsing, bounded text reads
  and ETag metadata. Supports non-default bucket jurisdictions. Requires
  actually granted read scopes, not an available OAuth consent option.
- Cloudflare Containers: Management API read-only discovery of selected
  account applications when containers.read is granted. The control plane
  does NOT mount a container filesystem.
- GitHub: Authorized OAuth account/repository selection, installation-aware
  repo listing, scoped text read and branch-specific expected-SHA file save.
  Tokens remain backend-only. This does not claim native Git clone/commit/push.
- Docker: Source icon only; no Docker Engine filesystem grant or adapter yet.
- Merkle persistence: Use existing @inneranimalmedia/agentsam-repository and
  agentsam_fs_merkle_snapshots with account_id + repository_id and R2 manifests.
  No parallel IDE snapshot table. IDE in-memory snapshot remains short-lived;
  durable integration needs the existing repository ownership and index.

GitHub and eligible Google Drive text files can use the explicit manual Save
path. Drive checks a file version before write, but Drive's media endpoint does
not promise atomic CAS; concurrent external edits remain a live acceptance risk.
R2 remains read-only pending an ETag-conditional write authority. Native Docs
exports stay read-only. Never enable remote Delete/Rename from a generic
provider icon or inferred OAuth scope.

Backend: apps/local-studio/backend/worker/ide-source-service.js,
backend/worker/connector-oauth.js, frontend/src/lib/work/remote-ide-workspace.ts.
The shared WorkspaceSourceRail and Monaco UI hosts all providers; no alternate
provider-specific editor. Tokens never leave the authenticated backend.

OAuth permission rule: A scope that appears among 374 possible Cloudflare
consent options is not a granted permission. Verify every account's stored
grant before access. Never use a globally privileged environment API token to
stand in for the end user's Cloudflare OAuth connection.
