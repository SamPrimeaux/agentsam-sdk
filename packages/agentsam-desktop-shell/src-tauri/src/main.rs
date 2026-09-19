// Deliberately thin. All business logic stays in packages/identity
// and the dashboard itself -- this file is window setup + command wiring.

mod commands;
mod tray;

use commands::{deep_link, keychain, local_node, updater};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            tray::setup_tray(app)?;
            deep_link::register_scheme(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            keychain::get_token,
            keychain::set_token,
            keychain::delete_token,
            deep_link::handle_callback,
            updater::check_for_update,
            local_node::enroll_as_local_node,
        ])
        .run(tauri::generate_context!())
        .expect("error while running agentsam desktop shell");
}
