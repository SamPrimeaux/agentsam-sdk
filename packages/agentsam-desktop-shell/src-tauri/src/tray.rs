// Tray icon + menu: Open, Check for Updates, Quit. "Check for Updates"
// emits an event rather than calling check_for_update() directly, since
// menu click handlers aren't async -- the frontend listens for the event
// and runs the same `app.check_updates` command as the application menu, so
// the update-check logic lives in one place (commands::updater), not
// duplicated here. The event goes to exactly one window: with several Studio
// windows a broadcast would run (and toast) the check once per window.

use crate::menu::{focus_or_open_window, target_window};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Emitter, State,
};

pub const CHECK_UPDATE_EVENT: &str = "agentsam://check-update-requested";

#[derive(serde::Serialize, Clone)]
struct CheckUpdatePayload {
    window: String,
}

fn emit_check_update(app: &AppHandle, label: &str) {
    // Broadcast with the target label: see menu.rs for why this is not `emit_to`.
    let _ = app.emit(
        CHECK_UPDATE_EVENT,
        CheckUpdatePayload {
            window: label.to_owned(),
        },
    );
}

fn request_update_check(app: &AppHandle) {
    let already_open = target_window(app).is_some();
    let Some(window) = focus_or_open_window(app) else {
        return;
    };
    let label = window.label().to_owned();
    let app = app.clone();
    if already_open {
        emit_check_update(&app, &label);
        return;
    }
    // A reopened window needs time to mount its listener before the request lands.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(3000));
        emit_check_update(&app, &label);
    });
}

pub fn setup_tray(app: &App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Dashboard", true, None::<&str>)?;
    let update_item =
        MenuItem::with_id(app, "check_update", "Check for Updates", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &update_item, &quit_item])?;

    TrayIconBuilder::with_id("agentsam-notification-tray")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                focus_or_open_window(app);
            }
            "check_update" => request_update_check(app),
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}

// In-memory notification state is account-bound: never carry a badge or an alert
// watermark across sign-outs. Historical notices must not banner on startup.
use serde::Deserialize;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri_plugin_notification::NotificationExt;

#[derive(Default)]
pub struct NotificationState(Mutex<NotificationSession>);

#[derive(Default)]
struct NotificationSession {
    account_id: String,
    initialized: bool,
    known_ids: HashSet<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAlert {
    id: String,
    title: String,
    message: String,
    created_at: i64,
}

#[tauri::command]
pub fn sync_native_notifications(
    app: AppHandle,
    state: State<'_, NotificationState>,
    account_id: String,
    unread_count: i64,
    alerts: Vec<NativeAlert>,
) -> Result<(), String> {
    if account_id.len() > 128 || unread_count < 0 || unread_count > 1_000_000 || alerts.len() > 50 {
        return Err("notification_state_invalid".into());
    }
    let mut session = state.0.lock().map_err(|_| "notification_state_locked")?;
    if session.account_id != account_id {
        session.account_id = account_id.clone();
        session.known_ids.clear();
        session.initialized = false;
    }
    let initial = !session.initialized;
    session.initialized = true;
    let mut new_alerts = Vec::new();
    for alert in alerts {
        if alert.id.is_empty()
            || alert.id.len() > 128
            || alert.title.len() > 200
            || alert.message.len() > 600
        {
            continue;
        }
        if session.known_ids.insert(alert.id.clone()) && !initial && alert.created_at > 0 {
            new_alerts.push(alert);
        }
    }
    // Read and delivered notifications are absent from the next snapshot;
    // limit retained IDs to avoid an unbounded long-running tray process.
    if session.known_ids.len() > 2000 {
        session.known_ids.clear();
    }
    drop(session);

    let count = if account_id.is_empty() {
        0
    } else {
        unread_count
    };
    if let Some(tray) = app.tray_by_id("agentsam-notification-tray") {
        let _ = tray.set_tooltip(Some(if count > 0 {
            format!("AgentSam — {count} unread")
        } else {
            "AgentSam — no unread notifications".into()
        }));
        #[cfg(target_os = "macos")]
        let _ = tray.set_title(if count > 0 { Some("🔴") } else { None });
    }
    if let Some(window) = target_window(&app) {
        let _ = window.set_badge_count(if count > 0 { Some(count) } else { None });
    }
    if !account_id.is_empty() {
        // Native OS notifications are reserved for newly observed high-priority items.
        // The frontend filters by the server's high/urgent priority field.
        for alert in new_alerts.into_iter().take(3) {
            let _ = app
                .notification()
                .builder()
                .title(&alert.title)
                .body(&alert.message)
                .show();
        }
    }
    Ok(())
}
