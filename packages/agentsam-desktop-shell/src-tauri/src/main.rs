// Deliberately thin. All business logic stays in packages/identity
// and the dashboard itself -- this file is window setup + command wiring.

mod commands;
mod tray;

use commands::{agentsamd, deep_link, google_desktop_identity, keychain, local_content, local_identity, local_node, local_sqlite, native_capabilities, system, updater};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(agentsamd::AgentsamdState::default())
        .manage(local_content::LocalContentState::default())
        .manage(deep_link::DeepLinkState::default())
        .setup(|app| {
            tray::setup_tray(app)?;
            deep_link::register_scheme(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            keychain::get_token,
            keychain::set_token,
            keychain::delete_token,
            keychain::secure_store_get,
            keychain::secure_store_set,
            keychain::secure_store_delete,
            deep_link::handle_callback,
            deep_link::take_pending_deep_links,
            updater::check_for_update,
            local_node::enroll_as_local_node,
            agentsamd::ensure_agentsamd,
            agentsamd::agentsamd_health,
            agentsamd::agentsamd_pairing_token,
            local_sqlite::local_sqlite_bridge,
            local_identity::local_identity_bridge,
            local_identity::identity_bridge,
            local_identity::studio_service_bridge,
            local_sqlite::local_sqlite_pick_database,
            local_sqlite::local_sqlite_pick_directory,
            local_content::local_content_bridge,
            native_capabilities::native_capabilities,
            system::open_external_url,
            google_desktop_identity::google_desktop_identity_login,
        ])
        .run(tauri::generate_context!())
        .expect("error while running agentsam desktop shell");
}
