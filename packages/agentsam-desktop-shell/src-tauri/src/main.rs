// Deliberately thin. All business logic stays in packages/identity
// and the dashboard itself -- this file is window setup + command wiring.

mod commands;
mod menu;
mod tray;

use commands::{
    agent_sam_pet, agentsamd, cad, cad_engine, chrome_browser, cloudflare_desktop_identity,
    deep_link, google_desktop_identity, keychain, local_content, local_identity, local_lsp,
    local_node, local_provider, local_sqlite, native_capabilities, system, updater,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .manage(cloudflare_desktop_identity::PkceState::default())
        .manage(agentsamd::AgentsamdState::default())
        .manage(cad_engine::CadEngineState::default())
        .manage(local_lsp::LocalLspState::default())
        .manage(local_content::LocalContentState::default())
        .manage(deep_link::DeepLinkState::default())
        .manage(tray::NotificationState::default())
        .manage(keychain::IdentityPendingState::default())
        .manage(keychain::IdentitySessionState::default())
        .setup(|app| {
            let native_menu = menu::build_menu(app.handle())?;
            app.set_menu(native_menu)?;
            tray::setup_tray(app)?;
            // Tauri notification 2.6+ reports native banner clicks on desktop.
            // Bring the existing app forward rather than opening a second window.
            {
                use tauri::Manager;
                use tauri_plugin_notification::NotificationExt;
                let handle = app.handle().clone();
                app.notification().on_action(move |_action| {
                    if let Some(window) = handle.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                });
            }
            deep_link::register_scheme(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle_menu_event(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            keychain::identity_session_exists,
            keychain::identity_pending_set,
            keychain::identity_pending_get,
            keychain::identity_pending_delete,
            keychain::provider_key_exists,
            keychain::provider_key_status,
            keychain::provider_key_set,
            keychain::provider_key_delete,
            local_identity::provider_key_sync_to_account,
            local_identity::provider_key_sync_from_account,
            deep_link::handle_callback,
            deep_link::take_pending_deep_links,
            updater::check_for_update,
            local_node::enroll_as_local_node,
            agentsamd::ensure_agentsamd,
            agentsamd::agentsamd_health,
            agentsamd::agentsamd_language_packs,
            agentsamd::agentsamd_install_language_pack,
            agentsamd::agentsamd_pairing_token,
            local_sqlite::local_sqlite_bridge,
            local_lsp::local_lsp_bridge,
            local_provider::local_provider_bridge,
            local_identity::local_identity_bridge,
            local_identity::identity_runtime_config,
            local_identity::identity_bridge,
            local_identity::studio_service_bridge,
            local_sqlite::local_sqlite_pick_database,
            local_sqlite::local_sqlite_pick_directory,
            local_content::local_content_bridge,
            native_capabilities::native_capabilities,
            system::open_external_url,
            system::focus_main_window,
            chrome_browser::open_agent_browser,
            system::desktop_workspace_context,
            commands::autorag::autorag_workflow_bridge,
            commands::autorag::autorag_choose_repository,
            google_desktop_identity::google_desktop_identity_login,
            // Cloudflare Desktop Identity Commands
            cloudflare_desktop_identity::start_cloudflare_oauth,
            cloudflare_desktop_identity::handle_oauth_deep_link,
            cloudflare_desktop_identity::get_cloudflare_session,
            cloudflare_desktop_identity::logout_cloudflare,
            cloudflare_desktop_identity::silent_session_restore,
            // CAD Engine Commands
            cad_engine::cad_engine_request,
            cad::generate_cad_mesh,
            cad::export_step_file,
            agent_sam_pet::toggle_agent_sam_pet,
            agent_sam_pet::close_agent_sam_pet,
            tray::sync_native_notifications,
        ])
        .run(tauri::generate_context!())
        .expect("error while running agentsam desktop shell");
}
