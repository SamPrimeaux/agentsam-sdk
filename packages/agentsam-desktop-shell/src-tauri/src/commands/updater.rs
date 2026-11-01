// Real check against tauri-plugin-updater. The signed Local Studio
// update endpoint is configured in tauri.conf.json and served by
// updates.inneranimalmedia.com. Product-specific channels should reuse
// that authority rather than introducing alternate updater hosts.
//
// Both the application menu ("Check for Updates…") and the tray reach these
// commands through the frontend `app.check_updates` command, so there is exactly
// one check/install path.

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

/// Download, verify (minisign pubkey in tauri.conf.json), and install the update
/// found by the same updater, then relaunch. Called only after the user confirms.
#[tauri::command]
pub async fn install_update(app: AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Err("no_update_available".into());
    };
    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    // `restart` relaunches the new bundle and never returns.
    app.restart()
}
