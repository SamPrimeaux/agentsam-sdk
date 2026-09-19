// Tray icon + menu: Open, Check for Updates, Quit. "Check for Updates"
// emits an event rather than calling check_for_update() directly, since
// menu click handlers aren't async -- the frontend listens for the event
// and invokes the real command, so the update-check logic lives in one
// place (commands::updater), not duplicated here.

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    App, Emitter, Manager,
};

pub fn setup_tray(app: &App) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Open Dashboard", true, None::<&str>)?;
    let update_item =
        MenuItem::with_id(app, "check_update", "Check for Updates", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open_item, &update_item, &quit_item])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "check_update" => {
                let _ = app.emit("agentsam://check-update-requested", ());
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
