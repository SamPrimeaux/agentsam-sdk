// Stub. Real implementation registers the brand's deep_link_scheme
// (from the resolved manifest) and forwards OAuth callback params to
// packages/identity's token-exchange call over HTTP.

use tauri::App;

pub fn register_scheme(_app: &App) -> tauri::Result<()> {
    Ok(())
}

#[tauri::command]
pub fn handle_callback(url: String) -> Result<(), String> {
    println!("deep link callback received: {}", url);
    Ok(())
}
