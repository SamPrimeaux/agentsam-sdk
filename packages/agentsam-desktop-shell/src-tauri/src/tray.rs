// Stub. Real tray icon + menu wiring lands once per-brand icon sets exist
// (manifests/*.json -> icon_set) and build-brand.mjs can resolve them.

use tauri::App;

pub fn setup_tray(_app: &App) -> tauri::Result<()> {
    Ok(())
}
