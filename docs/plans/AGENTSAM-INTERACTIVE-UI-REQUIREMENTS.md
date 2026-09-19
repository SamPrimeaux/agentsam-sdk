# AgentSam Interactive CLI UI/UX Requirements

**Authority:** `AGENTSAM.md`  
**Status:** Implemented on `feat/cli-interactive-presence` (PR #56)  
**Target:** Interactive terminal shell (`agentsam shell` / `src/commands/shell.js`)

---

## 1. Context & Motivation

AgentSam's interactive shell provides a developer-facing agent environment. While core reasoning and tool execution run beneath the surface, the terminal UI must deliver immediate responsiveness, spatial awareness, and non-blocking control comparable to Codex CLI.

Existing primitives (`src/ui/cli/activity.js`, `src/ui/cli/footer.js`) provide the baseline spinner, token counts, and basic footers. This specification establishes the five critical UX behaviors required for a production-grade interactive terminal.

---

## 2. The Five Core UX Patterns

### 2.1 Elapsed Timer with Interrupt Hint
- **Behavior:** During model generation or tool execution, the inline activity indicator must display a running timer and explicit interrupt guidance.
- **Display format:**
  ```text
  ◐ Working · 6.2s · ctrl-c to cancel
  ```
- **Lifecycle:**
  - Spinner cycles through unicode states (`◐ ◓ ◑ ◒`).
  - Timer updates at ~100ms intervals.
  - On SIGINT (`Ctrl+C`), gracefully aborts the in-flight step and preserves session context.

### 2.2 Shimmer / Active State Sweep
- **Behavior:** The active status label ("Working", "Executing tool", "Synthesizing") undergoes a smooth visual highlight sweep across the text, indicating live background compute.
- **Rendering details:**
  - Truecolor ANSI gradient sweep across character indices.
  - 256-color fallback on restricted terminals.
  - Complete bypass (static text) when `NO_COLOR` is set in the environment or terminal does not support colors.

### 2.3 Persistent Model, Project, and Connection Status Footer
- **Behavior:** Printed at shell start and refreshed after commands or state changes to maintain environmental orientation.
- **Fields:**
  - **Project identity & root:** Name, directory path.
  - **Git status:** Current branch, clean/dirty state.
  - **Active model:** Model identifier, provider, reasoning mode.
  - **Context window usage:** Input/output tokens, % of context window consumed.
  - **Shortcuts bar:** Quick reference for `/` commands, `@` file references, `!` shell escapes, and cancellation.

### 2.4 Diff Preview Formatter (`/diff`)
- **Behavior:** When the user enters `/diff` or asks for review, format git diffs with high-legibility syntax highlighting directly in the terminal stream.
- **Formatting rules:**
  - Header lines: bold cyan / dim path metadata.
  - Hunk headers (`@@ ... @@`): magenta / bold.
  - Additions (`+`): emerald green.
  - Deletions (`-`): rose red.
  - Must strictly honor `NO_COLOR` to avoid corrupting scripted outputs or piped terminals.

### 2.5 Bracketed Paste Collapsing
- **Behavior:** Pasting large blocks of code, error stack traces, or logs into the prompt must not flood the terminal scrollback or disorient the user.
- **Threshold:** Input exceeding **5 lines** OR **300 characters**.
- **Display format:**
  ```text
  [Pasted 42 lines (1,840 chars) — Enter to run, Backspace to clear]
  ```
- **Keybindings:**
  - `Enter`: Submit the collapsed payload directly to the model turn.
  - `Backspace`: Discard the pasted block cleanly without leaving dangling characters.
  - Normal typing remains un-collapsed.

---

## 3. Implementation Map

| Requirement | Module | Contract / Export |
|---|---|---|
| Elapsed timer & interrupt hint | `src/ui/cli/activity.js` | `createInlineActivity({ interruptHint: true })` |
| Truecolor shimmer sweep | `src/ui/cli/activity.js` | `renderShimmer(text, frame)` |
| Persistent status footer | `src/ui/cli/footer.js` | `renderCliFooter(state)` |
| Diff preview renderer | `src/ui/cli/footer.js` | `renderDiffPreview(diffText)` |
| Bracketed paste collapsing | `src/commands/shell.js` | Paste buffer interceptor in readline loop |

---

## 4. Verification Contract

- `test/cli/runtime-ui.test.mjs`: Validates ANSI formatting, shimmer fallback under `NO_COLOR`, footer fields, and diff coloration.
- `test/shell.test.mjs`: Validates readline paste collapse and command execution flow.
- Zero ANSI escape code leakage into non-interactive or file-redirected runs.
