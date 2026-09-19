// Real check against tauri-plugin-updater. Update endpoint (R2/Worker
// -hosted version manifest) isn't configured yet -- plugins.updater
// isn't set in tauri.conf.json -- so this compiles and runs but will
// error at call time until that's wired up per-brand. That's a
// deployment-config gap, not a code gap.

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
