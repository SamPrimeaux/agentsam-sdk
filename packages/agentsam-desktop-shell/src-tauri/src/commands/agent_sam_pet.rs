use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub fn toggle_agent_sam_pet(app: AppHandle) -> Result<bool, String> {
    if let Some(window) = app.get_webview_window("agent-sam-pet") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|error| error.to_string())?;
            return Ok(false);
        }
        window.show().map_err(|error| error.to_string())?;
        return Ok(true);
    }
    let window = WebviewWindowBuilder::new(&app, "agent-sam-pet", WebviewUrl::App("index.html?window=agent-sam-pet".into()))
        .title("AgentSam Pet")
        .inner_size(220.0, 190.0)
        .min_inner_size(150.0, 130.0)
        .max_inner_size(260.0, 220.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .visible_on_all_workspaces(true)
        .resizable(false)
        .shadow(false)
        .focused(false)
        .visible(true)
        .build()
        .map_err(|error| error.to_string())?;
    if let Ok(Some(monitor)) = app.primary_monitor() {
        let origin = monitor.position();
        let size = monitor.size();
        let scale = monitor.scale_factor();
        let width = (220.0 * scale).round() as i32;
        let height = (190.0 * scale).round() as i32;
        let x = origin.x + (size.width as i32 - width - (20.0 * scale) as i32).max(0);
        let y = origin.y + (size.height as i32 - height - (56.0 * scale) as i32).max(0);
        let _ = window.set_position(tauri::PhysicalPosition::new(x, y));
    }
    Ok(true)
}
#[tauri::command]
pub fn close_agent_sam_pet(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("agent-sam-pet") {
        window.close().map_err(|error| error.to_string())?;
    }
    Ok(())
}
