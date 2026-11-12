//! Native in-window browsing for Side Stage. Remote pages never receive Studio IPC.
//! This is a child WKWebView/WebView2/WebKitGTK viewport, not an HTML iframe.
use serde::{Deserialize, Serialize};
use tauri::{
    webview::{NewWindowResponse, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Rect, Url, WebviewUrl, Window,
};

const LOCATION_EVENT: &str = "agentsam://embedded-browser-location";
const OPEN_TAB_EVENT: &str = "agentsam://embedded-browser-new-tab";

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct BrowserLocationEvent {
    session_id: String,
    url: String,
    title: Option<String>,
}

fn browser_label(window: &Window, session_id: &str) -> Result<String, String> {
    if session_id.is_empty()
        || session_id.len() > 80
        || !session_id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
    {
        return Err("invalid_browser_session_id".to_owned());
    }
    Ok(format!("embedded-browser-{}-{session_id}", window.label()))
}

fn web_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw.trim()).map_err(|_| "invalid_browser_url".to_owned())?;
    match url.scheme() {
        "http" | "https" if url.host_str().is_some() => Ok(url),
        _ => Err("browser_only_supports_http_and_https".to_owned()),
    }
}

fn browser_rect(window: &Window, bounds: BrowserBounds) -> Result<Rect, String> {
    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let inner = window.inner_size().map_err(|e| e.to_string())?;
    let max_w = inner.width as f64 / factor;
    let max_h = inner.height as f64 / factor;
    if ![bounds.x, bounds.y, bounds.width, bounds.height]
        .iter()
        .all(|v| v.is_finite())
    {
        return Err("invalid_browser_bounds".into());
    }
    let x = bounds.x.max(0.0).min(max_w);
    let y = bounds.y.max(0.0).min(max_h);
    let width = bounds.width.min((max_w - x).max(0.0));
    let height = bounds.height.min((max_h - y).max(0.0));
    if width < 2.0 || height < 2.0 {
        return Err("browser_viewport_not_visible".into());
    }
    Ok(Rect {
        position: LogicalPosition::new(x, y).into(),
        size: LogicalSize::new(width, height).into(),
    })
}

/// Create/reposition the browser inside the *existing* Studio window.
/// One session ID maps to one native child webview; resizing does not reload it.
#[tauri::command]
pub async fn embedded_browser_sync(
    app: AppHandle,
    window: Window,
    session_id: String,
    url: String,
    bounds: BrowserBounds,
) -> Result<(), String> {
    let label = browser_label(&window, &session_id)?;
    let url = web_url(&url)?;
    let rect = browser_rect(&window, bounds)?;
    if let Some(webview) = app.get_webview(&label) {
        if webview.window().label() != window.label() {
            return Err("browser_window_mismatch".into());
        }
        webview.set_bounds(rect).map_err(|e| e.to_string())?;
        webview.show().map_err(|e| e.to_string())?;
        if webview.url().map(|active| active != url).unwrap_or(true) {
            webview.navigate(url).map_err(|e| e.to_string())?;
        }
        return Ok(());
    }

    let event_session = session_id.clone();
    let target_window = window.label().to_string();
    let new_tab_session = session_id.clone();
    let new_tab_window = window.label().to_string();
    let builder = WebviewBuilder::new(label, WebviewUrl::External(url))
        .on_navigation(|next| {
            matches!(next.scheme(), "http" | "https") && next.host_str().is_some()
        })
        .on_page_load(move |webview, payload| {
            let _ = webview.app_handle().emit_to(
                &target_window,
                LOCATION_EVENT,
                BrowserLocationEvent {
                    session_id: event_session.clone(),
                    url: payload.url().to_string(),
                    title: None,
                },
            );
        })
        .on_document_title_changed({
            let target = window.label().to_string();
            let session = session_id.clone();
            move |webview, title| {
                if let Ok(url) = webview.url() {
                    let _ = webview.app_handle().emit_to(
                        &target,
                        LOCATION_EVENT,
                        BrowserLocationEvent {
                            session_id: session.clone(),
                            url: url.to_string(),
                            title: Some(title),
                        },
                    );
                }
            }
        })
        .on_new_window(move |next, _| {
            if matches!(next.scheme(), "http" | "https") && next.host_str().is_some() {
                let _ = app.emit_to(
                    &new_tab_window,
                    OPEN_TAB_EVENT,
                    BrowserLocationEvent {
                        session_id: new_tab_session.clone(),
                        url: next.to_string(),
                        title: None,
                    },
                );
            }
            NewWindowResponse::Deny
        });
    window
        .add_child(builder, rect.position, rect.size)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize an existing native browser after a split-pane drag without reloading the page.
#[tauri::command]
pub async fn embedded_browser_resize(
    app: AppHandle,
    window: Window,
    session_id: String,
    bounds: BrowserBounds,
) -> Result<(), String> {
    let label = browser_label(&window, &session_id)?;
    let rect = browser_rect(&window, bounds)?;
    if let Some(webview) = app.get_webview(&label) {
        if webview.window().label() != window.label() {
            return Err("browser_window_mismatch".into());
        }
        webview.set_bounds(rect).map_err(|e| e.to_string())?;
        webview.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn embedded_browser_hide(
    app: AppHandle,
    window: Window,
    session_id: String,
) -> Result<(), String> {
    let label = browser_label(&window, &session_id)?;
    if let Some(webview) = app.get_webview(&label) {
        if webview.window().label() != window.label() {
            return Err("browser_window_mismatch".into());
        }
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn embedded_browser_close(
    app: AppHandle,
    window: Window,
    session_id: String,
) -> Result<(), String> {
    let label = browser_label(&window, &session_id)?;
    if let Some(webview) = app.get_webview(&label) {
        if webview.window().label() != window.label() {
            return Err("browser_window_mismatch".into());
        }
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn embedded_browser_action(
    app: AppHandle,
    window: Window,
    session_id: String,
    action: String,
) -> Result<(), String> {
    let label = browser_label(&window, &session_id)?;
    let webview = app.get_webview(&label).ok_or("browser_session_not_open")?;
    if webview.window().label() != window.label() {
        return Err("browser_window_mismatch".into());
    }
    match action.as_str() {
        "back" => webview.eval("window.history.back()"),
        "forward" => webview.eval("window.history.forward()"),
        "reload" => webview.reload(),
        "focus" => webview.set_focus(),
        _ => return Err("unsupported_browser_action".into()),
    }
    .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::web_url;
    #[test]
    fn remote_navigation_accepts_web_urls_not_privileged_schemes() {
        assert!(web_url("https://github.com/").is_ok());
        assert!(web_url("http://localhost:3000/").is_ok());
        assert!(web_url("file:///etc/passwd").is_err());
        assert!(web_url("javascript:alert(1)").is_err());
        assert!(web_url("chrome://extensions/").is_err());
    }
}
