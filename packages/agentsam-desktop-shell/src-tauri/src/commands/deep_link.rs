// Scheme is registered declaratively via tauri.conf.json
// (plugins.deep-link.desktop.schemes) -- real per-brand scheme comes
// from the resolved manifest at build time, not hand-edited here.
//
// on_open_url fires when the OS hands us a
// {scheme}://callback?code=...&state=... URL. We don't parse or
// exchange the OAuth code here -- we just forward the raw URL to the
// frontend, which already has packages/identity's token-exchange call
// built for the browser flow. One code path, not two.

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

// Manual invoke path -- lets the frontend simulate a callback during
// dev/testing without needing a real OS-level deep link event.
#[tauri::command]
pub fn handle_callback(app: AppHandle, url: String) -> Result<(), String> {
    app.emit("agentsam://deep-link", url).map_err(|e| e.to_string())
}
