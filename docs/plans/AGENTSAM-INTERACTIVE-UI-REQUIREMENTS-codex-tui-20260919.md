# AgentSam Interactive Shell — UI Requirements

Reference implementation: OpenAI Codex CLI's TUI, observed directly running
in `~/agentsam-sdk` on 2026-09-19. Codex is not the target — its specific
*patterns* are. Sam's stated reason for all five, verbatim: "trustworthy.
never wondering if my machine died/something failed. its present.
professional." That's the actual spec — every item below exists to answer
"is this thing still alive and what is it doing" at a glance, continuously,
without the user asking.

Read this whole file before touching UI code. Each item below is graded
against the real current state of `src/ui/cli/activity.js`,
`src/ui/cli/footer.js`, and `src/commands/shell.js` — checked directly, not
assumed.

## 1. Elapsed-time "Working" indicator — mostly built, missing the interrupt hint

**Current state:** `src/ui/cli/activity.js`'s `createInlineActivity()` already
renders `◐ Working · 6.2s` with a live-updating spinner + elapsed time via
`setInterval`. This is the right foundation — reuse it, don't replace it.

**Gap:** Codex's line reads `Working (6s • esc to interrupt)`. Ours has no
interrupt hint. Add it to the `frame()` render in `activity.js`:

```js
write(`\r${CLEAR_LINE}  ${icon} ${label} ${pc.dim('· ' + elapsed(now() - startedAt) + ' · esc to interrupt')}`);
```

Only show the hint when the shell is actually listening for an interrupt
keypress — don't print a false affordance. Wire the esc handler in
`shell.js` if one doesn't already exist for the active-task state.

## 2. Shimmer/gradient sweep across the "Working" label

**Current state:** the spinner icon (◐◓◑◒) animates; the label text
(`Working`) is static plain `pc.cyan`. No gradient.

**Build:** a per-frame brightness/color sweep across the label characters —
the common technique is picking a moving highlight index into the string
and rendering characters near it brighter (or a different color) than the
rest, advancing the index each `frame()` tick alongside the spinner. This
stays inside `activity.js`'s existing `frame()` function — same timer, same
interval, just render the label through a small `shimmer(label, tick)`
helper instead of a flat `pc.cyan(label)`. Keep it subtle — "faint," per
the ask, not a strobe. Terminal color support varies; fall back to the
current flat rendering when `process.stdout` doesn't report truecolor/256
support, don't assume every terminal handles it.

## 3. Persistent status footer — extend, don't rebuild

**Current state:** `renderCliFooter()` in `src/ui/cli/footer.js` already
renders `model · ctx N% · ↑tokens ↓tokens · [cache] · [tier] · [elapsed]`.
Solid foundation, wrong field set for this ask.

**Add two fields:**
- **Project/cwd** — the directory the session is rooted in. Codex shows
  `directory: ~/agentsam-sdk` in its startup card and keeps it visible.
  Pass `cwd` (already available everywhere `renderCliFooter` is called
  from, per `shell.js`'s `state.cwd`) and prepend a shortened form (`~`-
  collapsed, like Codex does) to the footer parts array.
- **Current action / connection state** — the live "what is this session
  doing or waiting on" field, equivalent to Codex's `Log in to Cloudflare
  API` in its title bar. This needs a piece of session state that gets set
  whenever the shell is mid-auth-flow, mid-tool-call, or blocked on
  something external, and cleared back to a neutral state (e.g. "Ready")
  otherwise. Surface it in the footer render, not just the terminal title
  bar — the terminal title updates only help if the user is looking at the
  tab; the footer is always in view.

**Render order matters:** put project and current-action first/most
prominent since those answer "where am I and is it alive," with the
existing model/context/token detail after — that ordering matches why this
whole feature is being asked for.

## 4. Inline diffs on file edits

**Current state:** not checked in depth against `fs_edit_file`/patch
call sites — flagging as a requirement, not yet scoped. When an
interactive session edits a file (`fs_edit_file`, `agentsam_github_patch`
equivalents, or anything routed through the scaffold/CMS write paths),
show a compact unified diff (red/green line-level) inline in the session
output, the way Codex renders a diff block immediately after an edit
tool call. Don't build a separate diff renderer if one already exists
elsewhere in the SDK (check `src/ui/` and `src/lib/` for an existing
diff-formatting utility before writing a new one — this is exactly the
kind of thing that gets silently reinvented).

## 5. Paste-collapse for large pasted input

**Current state:** not present. Pasting a large block into the interactive
prompt currently shows the raw text inline (or is unhandled — check
`readline` setup in `shell.js`).

**Build:** detect a paste event (readline's `keypress`/bracketed-paste
handling, or a heuristic on input arriving faster than typing speed),
and once pasted content crosses a size threshold, collapse the prompt
display to `[Pasted Content N chars]` — keeping the full content as the
actual submitted value, only changing what's rendered in the input line.
Codex's threshold and exact wording are the reference; match that format
(`[Pasted Content <n> chars]`) since it's already a pattern the user
recognizes from daily use.

## Implementation order

1. §1 (interrupt hint) — smallest change, extends existing working code.
2. §3 (footer fields) — second smallest, same file, no new subsystems.
3. §5 (paste-collapse) — self-contained in `shell.js`'s input handling.
4. §2 (shimmer) — cosmetic, do after the functional gaps are closed.
5. §4 (inline diffs) — needs a scoping pass first (check for an existing
   diff renderer before writing one); do last.

None of this blocks anything else in the current laundry list — it's a
parallel track, not a dependency of the auth-closure or scaffold work.
