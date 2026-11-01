# Native menu matrix

Contract: Rust emits `agentsam://native-menu` with `{ "v": 1, "command": "<id>" }` to the **focused**
window (else `main`, else any `studio-N`). The frontend registry
(`apps/local-studio/frontend/src/lib/commands/native-commands.ts`) is the single owner of command ids;
the native menu, command palette, and keyboard shortcuts all call `runCommand(id)`. Nothing synthesizes
keyboard events. Disabled items have no real implementation and are deliberately left disabled.

## History inventory

`menu.rs` has exactly one historical revision (`bc901e56`, #333, 2026-10-21). No earlier version exists in
git history or in the `agentsam-sdk` worktrees (`ecommerce-npm-product-v3`, `sdk-host-shell-cms-unification`,
`plan-authority`, `widget-platform`), so no menu was reconstructed from an older shape. All 37 historical
item ids are preserved below as implemented or disabled; there was **no Shell menu** before this sprint.

## Matrix

Legend: **Native** = handled in Rust. **Cmd** = forwarded as a command to the frontend registry.
**Off** = disabled placeholder (no capability yet).

| Menu | Item | Id | Kind | Status |
|---|---|---|---|---|
| AgentSam | About / Services / Hide / Quit | (AppKit predefined) | Native | works |
| AgentSam | Check for Updates… | `app.check_updates` | Cmd | new — `check_for_update` → toast → `install_update` |
| AgentSam | Settings… ⌘, | `settings.open` | Cmd | was Rust `eval` of `agentsam:navigate`; now contract |
| AgentSam | Delete Local Cache… | `delete_cache` | Native | works; result sent as `app.cache_deleted` / `app.cache_delete_failed` |
| AgentSam | Import Settings & Workspaces… | `import_workspace` | Off | no import capability |
| File | New Window ⇧⌘N | `new_window` | Native | works (`studio-N`) |
| File | New Chat ⌘N | `chat.new` | Cmd | **was synthetic KeyboardEvent**; now `startTrail()` + navigate |
| File | New Temporary Chat | `new_temp_chat` | Off | no ephemeral-chat capability |
| File | New Project… | `project.new` | Cmd | empty browser project via `createProject()` (no silent Scratch seed; host/sample remain explicit) |
| File | Open Folder in Terminal… ⇧⌘O | `folder.open_in_terminal` | Cmd | native folder picker (`local_sqlite_pick_directory`) → new terminal with that cwd. A full filesystem *workspace* still requires `agentsam start-local` (store rejects arbitrary roots), so the item is named for what it does |
| File | Close Window ⌘W | (AppKit predefined) | Native | works |
| Edit | Undo/Redo/Cut/Copy/Paste/Select All | (AppKit predefined) | Native | works |
| Edit | Paste and Match Style, Delete | `paste_match`, `delete_selection` | Off | no AppKit responder wired |
| Edit | Substitutions/Speech/Writing Tools/AutoFill | (empty submenus) | Off | disabled |
| Edit | Start Dictation, Emoji & Symbols | — | removed | AppKit appends these itself; the disabled duplicates were dead |
| View | Toggle Bottom Panel ⌘J | `view.toggle_terminal` | Cmd | toggles the CLI drawer (⌘` still works) |
| View | Open Terminal | `view.open_terminal` | Cmd | ensures a terminal is visible |
| View | Browser ▸ Open Browser Tab | `view.open_browser` | Cmd | `/browse` |
| View | Browser ▸ Back/Forward | `browser_back`, `browser_forward` | Off | |
| View | Toggle Sidebar / Pinned Summary / Navigation Panel / Switch Chat↔Tabs / Find / Prev-Next Sidebar Item / Prev-Next Tab | `toggle_sidebar`, `toggle_pinned_summary`, `toggle_nav_panel`, `switch_chat_tabs`, `find`, `prev_sidebar`, `next_sidebar`, `prev_tab`, `next_tab` | Off | no shared command exists |
| View | Back ⌘[ / Forward ⌘] | `back`, `forward` | Native | `history.back()/forward()` |
| View | Zoom In/Out/Actual Size | `zoom_in`, `zoom_out`, `zoom_reset` | Native | per-window zoom |
| View | Enter Full Screen | (AppKit predefined) | Native | works |
| **Shell** | New Terminal ⌥⌘T | `shell.new_terminal` | Cmd | new session at workspace cwd, default profile; opens the drawer if no terminal is visible |
| **Shell** | New Tab ⌘T | `shell.new_tab` | Cmd | new session with the focused tab's connection + cwd; copies profile/font prefs, not custom colors |
| **Shell** | New Command… | `shell.new_command` | Cmd | dialog → new tab → runs the command once its shell attaches |
| **Shell** | New Remote Connection… | `shell.new_remote` | Cmd | opens Settings ▸ Runtime (remote runtime sessions are created there) |
| **Shell** | Close Tab ⌥⌘W | `shell.close_tab` | Cmd | closes the focused session (⌘W stays Close Window) |
| **Shell** | Rename Tab… | `shell.rename_tab` | Cmd | in-app dialog |
| **Shell** | Select Previous/Next Tab ⌥⌘←/→ | `shell.prev_tab`, `shell.next_tab` | Cmd | |
| **Shell** | Use Profile ▸ Theme Default / Local / Remote / Sandbox | `shell.profile.cms`, `shell.profile.local`, `shell.profile.remote`, `shell.profile.sandbox` | Cmd | session profile |
| **Shell** | Use Profile as Default | `shell.use_profile_default` | Cmd | sets the default profile for sessions without an override |
| **Shell** | Edit Background Color… | `shell.edit_background_color` | Cmd | macOS: native `NSColorPanel` retargeted to the focused session (`native_color_panel_open`), live via `agentsam://native-color`; other hosts: in-app picker |
| **Shell** | Reset Appearance | `shell.reset_appearance` | Cmd | removes only the focused session's override |
| **Shell** | Clear Scrollback ⌥⌘K | `shell.clear_scrollback` | Cmd | `term.clear()` for the focused session (⌘K stays the command palette) |
| **Shell** | Open Terminal Workspace | `shell.open_workspace` | Cmd | `/cli` |
| Window | Minimize / Zoom / Bring All to Front | (AppKit predefined) | Native | works |
| Help | Documentation / What's New / Send Feedback | `documentation`, `whats_new`, `send_feedback` | Native | opens URL |
| Help | Keyboard Shortcuts ⌘/ | `shortcuts` | Native | dialog |
| Help | Troubleshooting / System Status | `runtime.open`, `runtime.open_status` | Cmd | Settings ▸ Runtime |
| Help | Task Manager / Start Performance Trace | `task_manager`, `performance_trace` | Off | |

Palette-only (no menu item): `shell.appearance` (Terminal Appearance…, also the palette button in the terminal toolbar —
profile, background, font size 10–24px, line height 1.0–2.0, contrast readout).

## Tray

| Item | Behaviour |
|---|---|
| Open Dashboard | `focus_or_open_window`: `main` → else any `studio-N` → else reopens a window |
| Check for Updates | broadcasts `agentsam://check-update-requested` with the target window label; only that window's bridge acts (reopened windows get it after mount) → `app.check_updates` |
| Quit | `app.exit(0)` |
| Notification click | same `focus_or_open_window` |

## Appearance layering

`account theme tokens (readTheme)` → `profile (Theme Default | Local | Remote | Sandbox, from src/ui/theme.js)` →
`per-session override`. Persisted in `localStorage["agentsam-terminal-appearance-v1"]` keyed by session id (session ids
already persist in `agentsam-terminal-sessions-v1`), pruned when sessions close.

## Event delivery (root cause found during acceptance)

The packaged app had **no Tauri capability file**, so `plugin:event|listen` was denied and *every* native event
(menu, tray check-update, color panel, pet) was silently dropped by the webview. `src-tauri/capabilities/native-events.json`
now grants `core:event:allow-listen/unlisten/emit` to `main`, `studio-*` and `agent-sam-pet`. Events are broadcast with the
target window label in the payload and each bridge ignores events for other windows (`emit_to` does not reach global
`__TAURI__.event.listen` listeners). Verified in the packaged build with `AGENTSAM_NATIVE_SELFTEST` (frontend acks
`shell.* -> ran`; session appearance persisted to LocalStorage).
