//! Native application menu. The OS owns standard text/window actions; Studio owns
//! product commands through one versioned event delivered to the focused webview.
//!
//! Contract (`agentsam://native-menu`, v1): `{ "v": 1, "command": "<id>", "window": "<label>" }`
//! where `<id>` is a dotted command id registered by the frontend command registry
//! (`apps/local-studio/frontend/src/lib/commands/native-commands.ts`). Items with
//! no real implementation stay disabled; nothing synthesizes keyboard events.
//!
//! Delivery: events are broadcast (`emit`) with the target window label in the
//! payload and each webview ignores events addressed to another window. Tauri's
//! `emit_to(label)` does not reach listeners registered through the global
//! `window.__TAURI__.event.listen` bridge that Studio uses.
//!
//! History: this menu was introduced in one commit (bc901e56, #333) and has no
//! earlier revision or worktree variant; every historical item is preserved below
//! as either an implemented command or a disabled placeholder (see the matrix in
//! `docs/native-capability-ledger.md`).
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, MenuItemBuilder, Submenu, SubmenuBuilder},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, Wry,
};

pub const EVENT: &str = "agentsam://native-menu";
static NEXT_WINDOW: AtomicUsize = AtomicUsize::new(1);
static WINDOW_ZOOMS: OnceLock<Mutex<HashMap<String, f64>>> = OnceLock::new();

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
pub struct MenuPayload {
    pub v: u8,
    pub command: String,
    pub window: String,
}

pub fn menu_payload(command: &str, window: &str) -> MenuPayload {
    MenuPayload {
        v: 1,
        command: command.to_owned(),
        window: window.to_owned(),
    }
}

fn action(
    app: &AppHandle,
    id: &str,
    title: &str,
    key: Option<&str>,
) -> tauri::Result<MenuItem<Wry>> {
    let mut item = MenuItemBuilder::with_id(id, title);
    if let Some(key) = key {
        item = item.accelerator(key);
    }
    item.build(app)
}

fn unavailable(app: &AppHandle, id: &str, title: &str) -> tauri::Result<MenuItem<Wry>> {
    MenuItemBuilder::with_id(id, title)
        .enabled(false)
        .build(app)
}

fn shell_menu(app: &AppHandle) -> tauri::Result<Submenu<Wry>> {
    let profiles = SubmenuBuilder::new(app, "Use Profile")
        .item(&action(app, "shell.profile.cms", "Theme Default", None)?)
        .item(&action(app, "shell.profile.local", "Local", None)?)
        .item(&action(app, "shell.profile.remote", "Remote", None)?)
        .item(&action(app, "shell.profile.sandbox", "Sandbox", None)?)
        .build()?;
    SubmenuBuilder::new(app, "Shell")
        .item(&action(
            app,
            "shell.new_terminal",
            "New Terminal",
            Some("CmdOrCtrl+Alt+T"),
        )?)
        .item(&action(app, "shell.new_tab", "New Tab", Some("CmdOrCtrl+T"))?)
        .item(&action(app, "shell.new_command", "New Command…", None)?)
        .item(&action(
            app,
            "shell.new_remote",
            "New Remote Connection…",
            None,
        )?)
        .separator()
        .item(&action(
            app,
            "shell.close_tab",
            "Close Tab",
            Some("CmdOrCtrl+Alt+W"),
        )?)
        .item(&action(app, "shell.rename_tab", "Rename Tab…", None)?)
        .item(&action(
            app,
            "shell.prev_tab",
            "Select Previous Tab",
            Some("CmdOrCtrl+Alt+Left"),
        )?)
        .item(&action(
            app,
            "shell.next_tab",
            "Select Next Tab",
            Some("CmdOrCtrl+Alt+Right"),
        )?)
        .separator()
        .item(&profiles)
        .item(&action(
            app,
            "shell.use_profile_default",
            "Use Profile as Default",
            None,
        )?)
        .item(&action(
            app,
            "shell.edit_background_color",
            "Edit Background Color…",
            None,
        )?)
        .item(&action(
            app,
            "shell.reset_appearance",
            "Reset Appearance",
            None,
        )?)
        .separator()
        .item(&action(
            app,
            "shell.clear_scrollback",
            "Clear Scrollback",
            Some("CmdOrCtrl+Alt+K"),
        )?)
        .item(&action(
            app,
            "shell.open_workspace",
            "Open Terminal Workspace",
            None,
        )?)
        .build()
}

pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let app_menu = SubmenuBuilder::new(app, "AgentSam Local Studio")
        .about(Some(AboutMetadata {
            name: Some("AgentSam Local Studio".into()),
            version: Some(app.package_info().version.to_string().into()),
            authors: Some(vec!["Inner Animal Media".into()]),
            ..Default::default()
        }))
        .item(&action(app, "app.check_updates", "Check for Updates…", None)?)
        .separator()
        .item(&action(app, "settings.open", "Settings…", Some("CmdOrCtrl+,"))?)
        .item(&action(
            app,
            "delete_cache",
            "Delete Local Cache…",
            Some("CmdOrCtrl+Shift+Backspace"),
        )?)
        .item(&unavailable(
            app,
            "import_workspace",
            "Import Settings & Workspaces…",
        )?)
        .separator()
        .services()
        .separator()
        .hide()
        .hide_others()
        .show_all()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "File")
        .item(&action(app, "new_window", "New Window", Some("CmdOrCtrl+Shift+N"))?)
        .item(&action(app, "chat.new", "New Chat", Some("CmdOrCtrl+N"))?)
        .item(&unavailable(app, "new_temp_chat", "New Temporary Chat")?)
        .item(&action(app, "project.new", "New Project…", None)?)
        .separator()
        .item(&action(
            app,
            "folder.open_in_terminal",
            "Open Folder in Terminal…",
            Some("CmdOrCtrl+Shift+O"),
        )?)
        .separator()
        .close_window()
        .build()?;

    // Tauri ships native edit responders for these actions. Do not replace them
    // with DOM key dispatch: that breaks accessibility, IME, and focused inputs.
    // AppKit appends Start Dictation… and Emoji & Symbols itself, so no duplicates.
    let substitutions = SubmenuBuilder::new(app, "Substitutions")
        .enabled(false)
        .build()?;
    let speech = SubmenuBuilder::new(app, "Speech").enabled(false).build()?;
    let writing_tools = SubmenuBuilder::new(app, "Writing Tools")
        .enabled(false)
        .build()?;
    let autofill = SubmenuBuilder::new(app, "AutoFill")
        .enabled(false)
        .build()?;
    let edit_menu = SubmenuBuilder::new(app, "Edit")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .item(&unavailable(app, "paste_match", "Paste and Match Style")?)
        .item(&unavailable(app, "delete_selection", "Delete")?)
        .separator()
        .select_all()
        .separator()
        .item(&substitutions)
        .item(&speech)
        .separator()
        .item(&writing_tools)
        .item(&autofill)
        .build()?;

    let browser_menu = SubmenuBuilder::new(app, "Browser")
        .item(&action(app, "view.open_browser", "Open Browser Tab", None)?)
        .item(&unavailable(app, "browser_back", "Back in Browser")?)
        .item(&unavailable(app, "browser_forward", "Forward in Browser")?)
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&unavailable(app, "toggle_sidebar", "Toggle Sidebar")?)
        .item(&action(
            app,
            "view.toggle_terminal",
            "Toggle Bottom Panel",
            Some("CmdOrCtrl+J"),
        )?)
        .item(&unavailable(
            app,
            "toggle_pinned_summary",
            "Toggle Pinned Summary",
        )?)
        .item(&action(app, "view.open_terminal", "Open Terminal", None)?)
        .item(&unavailable(
            app,
            "toggle_nav_panel",
            "Toggle Navigation Panel",
        )?)
        .item(&unavailable(
            app,
            "switch_chat_tabs",
            "Switch Between Chat and Tabs",
        )?)
        .separator()
        .item(&browser_menu)
        .separator()
        .item(&unavailable(app, "find", "Find")?)
        .separator()
        .item(&action(app, "back", "Back", Some("CmdOrCtrl+["))?)
        .item(&action(app, "forward", "Forward", Some("CmdOrCtrl+]"))?)
        .separator()
        .item(&unavailable(app, "prev_sidebar", "Previous Sidebar Item")?)
        .item(&unavailable(app, "next_sidebar", "Next Sidebar Item")?)
        .separator()
        .item(&unavailable(app, "prev_tab", "Previous Tab")?)
        .item(&unavailable(app, "next_tab", "Next Tab")?)
        .separator()
        .item(&action(app, "zoom_in", "Zoom In", Some("CmdOrCtrl+="))?)
        .item(&action(app, "zoom_out", "Zoom Out", Some("CmdOrCtrl+-"))?)
        .item(&action(
            app,
            "zoom_reset",
            "Actual Size",
            Some("CmdOrCtrl+0"),
        )?)
        .separator()
        .fullscreen()
        .build()?;

    let window_menu = SubmenuBuilder::new(app, "Window")
        .minimize()
        .maximize()
        .separator()
        .bring_all_to_front()
        .build()?;

    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&action(app, "documentation", "Documentation", None)?)
        .item(&action(
            app,
            "shortcuts",
            "Keyboard Shortcuts",
            Some("CmdOrCtrl+/"),
        )?)
        .item(&action(app, "whats_new", "What's New", None)?)
        .separator()
        .item(&action(app, "runtime.open", "Troubleshooting", None)?)
        .item(&action(app, "runtime.open_status", "System Status", None)?)
        .item(&action(app, "send_feedback", "Send Feedback", None)?)
        .separator()
        .item(&unavailable(app, "task_manager", "Task Manager")?)
        .item(&unavailable(
            app,
            "performance_trace",
            "Start Performance Trace",
        )?)
        .build()?;

    tauri::menu::MenuBuilder::new(app)
        .items(&[
            &app_menu,
            &file_menu,
            &edit_menu,
            &view_menu,
            &shell_menu(app)?,
            &window_menu,
            &help_menu,
        ])
        .build()
}

/// Window that should receive an app-level action: the focused window, else the
/// primary `main` window, else any remaining Studio window.
pub fn target_window(app: &AppHandle) -> Option<WebviewWindow> {
    let windows = app.webview_windows();
    windows
        .values()
        .find(|window| window.is_focused().unwrap_or(false))
        .cloned()
        .or_else(|| windows.get("main").cloned())
        .or_else(|| {
            let mut labels: Vec<_> = windows.keys().cloned().collect();
            labels.sort();
            labels.first().and_then(|label| windows.get(label).cloned())
        })
}

pub fn open_studio_window(app: &AppHandle) -> Result<WebviewWindow, String> {
    let label = format!("studio-{}", NEXT_WINDOW.fetch_add(1, Ordering::Relaxed));
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("AgentSam Local Studio")
        .inner_size(1200.0, 800.0)
        .build()
        .map_err(|e| e.to_string())
}

/// Bring Studio forward for tray / notification actions. Prefers `main`; falls
/// back to any `studio-N` window; reopens a window if all were closed so the tray
/// "Open" item never silently does nothing.
pub fn focus_or_open_window(app: &AppHandle) -> Option<WebviewWindow> {
    let window = app
        .get_webview_window("main")
        .or_else(|| target_window(app))
        .or_else(|| open_studio_window(app).map_err(|e| eprintln!("Reopen failed: {e}")).ok())?;
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
    Some(window)
}

fn emit_command(app: &AppHandle, label: &str, command: &str) {
    if let Err(err) = app.emit(EVENT, menu_payload(command, label)) {
        eprintln!("Studio menu dispatch failed ({command}): {err}");
    }
}

pub fn handle_menu_event(app: &AppHandle, id: &str) {
    if id == "new_window" {
        if let Err(err) = open_studio_window(app) {
            eprintln!("New Studio window failed: {err}");
        }
        return;
    }
    // macOS installs one menu for the app, but actions must target the active window.
    let window = target_window(app);
    if id == "delete_cache" {
        let Some(window) = window else {
            return;
        };
        let label = window.label().to_owned();
        let confirmation = rfd::MessageDialog::new()
            .set_title("Delete AgentSam Cache")
            .set_description("Clear application cache files? This does not delete projects, files, sessions, or credentials.")
            .set_buttons(rfd::MessageButtons::YesNo)
            .show();
        if confirmation != rfd::MessageDialogResult::Yes {
            return;
        }
        let app = app.clone();
        std::thread::spawn(move || {
            let outcome = app
                .path()
                .app_cache_dir()
                .map_err(|e| e.to_string())
                .and_then(|path| {
                    if path.exists() {
                        std::fs::remove_dir_all(path).map_err(|e| e.to_string())
                    } else {
                        Ok(())
                    }
                });
            if let Err(error) = &outcome {
                eprintln!("Cache deletion failed: {error}");
            }
            let command = if outcome.is_ok() {
                "app.cache_deleted"
            } else {
                "app.cache_delete_failed"
            };
            emit_command(&app, &label, command);
        });
        return;
    }
    if matches!(id, "zoom_in" | "zoom_out" | "zoom_reset") {
        if let Some(window) = window {
            let map = WINDOW_ZOOMS.get_or_init(|| Mutex::new(HashMap::new()));
            if let Ok(mut map) = map.lock() {
                let factor = map.entry(window.label().to_owned()).or_insert(1.0);
                let next = match id {
                    "zoom_in" => (*factor + 0.1).min(2.0),
                    "zoom_out" => (*factor - 0.1).max(0.6),
                    _ => 1.0,
                };
                if window.set_zoom(next).is_ok() {
                    *factor = next;
                }
            }
        }
        return;
    }
    if let Some(url) = match id {
        "documentation" => Some("https://github.com/SamPrimeaux/agentsam-sdk#readme"),
        "whats_new" => Some("https://github.com/SamPrimeaux/agentsam-sdk/releases"),
        "send_feedback" => Some("https://github.com/SamPrimeaux/agentsam-sdk/issues/new"),
        _ => None,
    } {
        #[cfg(target_os = "macos")]
        if let Err(error) = std::process::Command::new("open").arg(url).spawn() {
            eprintln!("Could not open {url}: {error}");
        }
        return;
    }
    if id == "shortcuts" {
        rfd::MessageDialog::new()
            .set_title("AgentSam Local Studio · Keyboard Shortcuts")
            .set_description(SHORTCUTS_HELP)
            .set_buttons(rfd::MessageButtons::Ok)
            .show();
        return;
    }
    if matches!(id, "back" | "forward") {
        if let Some(window) = &window {
            let js = if id == "back" {
                "history.back()"
            } else {
                "history.forward()"
            };
            if let Err(error) = window.eval(js) {
                eprintln!("Navigation failed: {error}");
            }
        }
        return;
    }
    // Everything else is a product command owned by the frontend registry.
    if let Some(window) = window {
        emit_command(app, window.label(), id);
    }
}

const SHORTCUTS_HELP: &str = "⌘N — New Chat\n⇧⌘N — New Window\n⇧⌘O — Open Folder in Terminal\n⌘, — Settings\n⌘J — Toggle Bottom Panel\n⌘[ / ⌘] — Back / Forward\n⌘+ / ⌘- / ⌘0 — Zoom\n⌃⌘F — Full Screen\n\nShell\n⌘T — New Tab\n⌥⌘T — New Terminal\n⌥⌘W — Close Tab\n⌥⌘← / ⌥⌘→ — Previous / Next Tab\n⌥⌘K — Clear Scrollback";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn event_id_is_stable() {
        assert_eq!(EVENT, "agentsam://native-menu");
    }

    #[test]
    fn payload_is_versioned_command_contract() {
        let json = serde_json::to_string(&menu_payload("shell.new_tab", "main")).unwrap();
        assert_eq!(json, r#"{"v":1,"command":"shell.new_tab","window":"main"}"#);
    }

    #[test]
    fn new_chat_never_uses_synthetic_keyboard_events() {
        let source = include_str!("menu.rs");
        let forbidden = ["Keyboard", "Event('keydown'"].concat();
        let occurrences = source.matches(forbidden.as_str()).count();
        // The only occurrence is the literal built for this assertion above.
        assert_eq!(occurrences, 0);
    }
}
