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
- GitHub, R2, Drive, Cloudflare containers and Docker are visually discoverable
  but are not yet connected to Local Studio. No fixture fallback is allowed.
- Merkle comparison requires verified content hashes for every file. Snapshot
  captures a session baseline; Changes compares against it. Durable Merkle
  manifests, Git-aware diffs, cross-session history and provider auth remain WIP.
- Previous Side Stage LSP navigation and file-preview behaviors need live
  authenticated acceptance tests before shipping this new surface to customers.

The previous InnerAnimalMedia filesystem, virtual tree, Monaco, Merkle and
provider UI components remain authoritative donor references for remaining
work. Reuse and package their proven behavior without a parallel IDE product.
