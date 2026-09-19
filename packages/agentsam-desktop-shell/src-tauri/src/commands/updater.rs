// Stub. Real implementation queries the Worker-hosted version manifest
// (R2-backed) and compares against the running build's version.

#[tauri::command]
pub async fn check_for_update() -> Result<bool, String> {
    Ok(false)
}
