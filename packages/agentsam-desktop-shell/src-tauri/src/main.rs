// Deliberately thin. All business logic stays in packages/identity
// and the dashboard itself -- this file is window setup + command wiring.

mod commands;
mod tray;

use commands::{agentsamd, auth_pkce, deep_link, keychain, local_content, local_node, local_sqlite, updater};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(agentsamd::AgentsamdState::default())
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
            auth_pkce::start_agentsam_pkce_login,
            agentsamd::ensure_agentsamd,
            agentsamd::agentsamd_health,
            local_sqlite::local_sqlite_bridge,
            local_content::local_content_bridge,
        ])
        .run(tauri::generate_context!())
        .expect("error while running agentsam desktop shell");
}
