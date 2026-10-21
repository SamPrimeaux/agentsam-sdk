//! Native application menu. The OS owns standard text/window actions; Studio owns
//! navigation through a single versioned event delivered to the focused webview.
use std::collections::HashMap;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{
    menu::{AboutMetadata, Menu, MenuItem, MenuItemBuilder, SubmenuBuilder},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Wry,
};

pub const EVENT: &str = "agentsam://native-menu";
static NEXT_WINDOW: AtomicUsize = AtomicUsize::new(1);
static WINDOW_ZOOMS: OnceLock<Mutex<HashMap<String, f64>>> = OnceLock::new();

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

pub fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let app_menu = SubmenuBuilder::new(app, "AgentSam Local Studio")
        .about(Some(AboutMetadata {
            name: Some("AgentSam Local Studio".into()),
            version: Some(app.package_info().version.to_string().into()),
            authors: Some(vec!["Inner Animal Media".into()]),
            ..Default::default()
        }))
        .separator()
        .item(&action(app, "settings", "Settings…", Some("CmdOrCtrl+,"))?)
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
        .item(&action(app, "new_window", "New Window", None)?)
        .item(&action(app, "new_chat", "New Chat", Some("CmdOrCtrl+N"))?)
        .item(&unavailable(app, "new_temp_chat", "New Temporary Chat")?)
        .item(&unavailable(app, "new_project", "New Project…")?)
        .separator()
        .item(&unavailable(app, "open_folder", "Open Folder…")?)
        .separator()
        .close_window()
        .build()?;

    // Tauri ships native edit responders for these actions. Do not replace them
    // with DOM key dispatch: that breaks accessibility, IME, and focused inputs.
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
        .item(&unavailable(app, "start_dictation", "Start Dictation…")?)
        .item(&unavailable(app, "emoji_symbols", "Emoji & Symbols")?)
        .build()?;

    let browser_menu = SubmenuBuilder::new(app, "Browser")
        .item(&unavailable(app, "browser_open", "Open Browser Tab")?)
        .item(&unavailable(app, "browser_back", "Back in Browser")?)
        .item(&unavailable(app, "browser_forward", "Forward in Browser")?)
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .item(&unavailable(app, "toggle_sidebar", "Toggle Sidebar")?)
        .item(&unavailable(
            app,
            "toggle_bottom_panel",
            "Toggle Bottom Panel",
        )?)
        .item(&unavailable(
            app,
            "toggle_pinned_summary",
            "Toggle Pinned Summary",
        )?)
        .item(&unavailable(app, "open_terminal", "Open Terminal")?)
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
        .item(&action(app, "troubleshooting", "Troubleshooting", None)?)
        .item(&action(app, "system_status", "System Status", None)?)
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
            &window_menu,
            &help_menu,
        ])
        .build()
}

pub fn handle_menu_event(app: &AppHandle, id: &str) {
    if id == "new_window" {
        let label = format!("studio-{}", NEXT_WINDOW.fetch_add(1, Ordering::Relaxed));
        if let Err(err) =
            WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
                .title("AgentSam Local Studio")
                .inner_size(1200.0, 800.0)
                .build()
        {
            eprintln!("New Studio window failed: {err}");
        }
        return;
    }
    // macOS installs one menu for the app, but actions must target the active window.
    let window = app
        .webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false));
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
            let message = if outcome.is_ok() {
                "cache_deleted"
            } else {
                "cache_delete_failed"
            };
            let _ = app.emit_to(label, EVENT, message);
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
    if let Some(window) = &window {
        if id == "shortcuts" {
            rfd::MessageDialog::new()
                .set_title("AgentSam Local Studio · Keyboard Shortcuts")
                .set_description("⌘N — New Chat\n⌘, — Settings\n⌘[ / ⌘] — Back / Forward\n⌘+ / ⌘- / ⌘0 — Zoom\n⌃⌘F — Full Screen")
                .set_buttons(rfd::MessageButtons::Ok)
                .show();
            return;
        }
        if matches!(id, "back" | "forward") {
            let js = if id == "back" {
                "history.back()"
            } else {
                "history.forward()"
            };
            if let Err(error) = window.eval(js) {
                eprintln!("Navigation failed: {error}");
            }
            return;
        }
        if id == "new_chat" {
            // The existing desktop shell listens for Cmd+N; preserve that working path
            // until the Studio application exposes a dedicated native command handler.
            let _ = window.eval("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', metaKey: true, bubbles: true }))");
            return;
        }
        if let Some(route) = match id {
            "settings" => Some("/settings/general"),
            "troubleshooting" | "system_status" => Some("/settings/runtime"),
            _ => None,
        } {
            // The existing desktop frontend already consumes this navigation event.
            let script = format!("window.dispatchEvent(new CustomEvent('agentsam:navigate', {{ detail: {{ to: '{}' }} }}))", route);
            if let Err(error) = window.eval(&script) {
                eprintln!("Native menu navigation failed: {error}");
            }
            return;
        }
    }
    // Studio-specific commands are emitted as a contract, not guessed DOM clicks.
    if let Some(window) = window {
        if let Err(err) = app.emit_to(window.label(), EVENT, id) {
            eprintln!("Studio menu dispatch failed ({id}): {err}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn event_id_is_stable() {
        assert_eq!(EVENT, "agentsam://native-menu");
    }
}
