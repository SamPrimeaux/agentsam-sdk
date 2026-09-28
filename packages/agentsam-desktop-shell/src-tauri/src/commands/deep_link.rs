// Scheme is registered declaratively via tauri.conf.json.
// Deep links are transport only. Identity/provider packages own interpretation.
use tauri::{App, AppHandle, Emitter};
use tauri_plugin_deep_link::DeepLinkExt;

pub fn register_scheme(app: &App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        for url in event.urls() {
            let _ = handle.emit("agentsam://deep-link", url.to_string());
        }
    });
    Ok(())
}

#[tauri::command]
pub fn handle_callback(app: AppHandle, url: String) -> Result<(), String> {
    app.emit("agentsam://deep-link", url).map_err(|e| e.to_string())
}
