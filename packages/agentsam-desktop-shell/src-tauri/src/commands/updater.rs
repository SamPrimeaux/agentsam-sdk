// Real check against tauri-plugin-updater. The signed Local Studio
// update endpoint is configured in tauri.conf.json and served by
// updates.inneranimalmedia.com. Product-specific channels should reuse
// that authority rather than introducing alternate updater hosts.

use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> Result<bool, String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    match updater.check().await {
        Ok(Some(_update)) => Ok(true),
        Ok(None) => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}
