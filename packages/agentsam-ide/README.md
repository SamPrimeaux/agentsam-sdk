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
