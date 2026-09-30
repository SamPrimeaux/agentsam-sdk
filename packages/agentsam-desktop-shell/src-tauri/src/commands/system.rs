use std::process::Command;

fn validate_external_url(url: &str) -> Result<&str, String> {
    let url = url.trim();
    let parsed = reqwest::Url::parse(url).map_err(|_| "external_url_invalid".to_string())?;
    if parsed.scheme() != "https" && parsed.scheme() != "http" {
        return Err("external_url_scheme_not_allowed".into());
    }
    Ok(url)
}

#[tauri::command]
pub fn open_external_url(url: String) -> Result<(), String> {
    let url = validate_external_url(&url)?;

    #[cfg(target_os = "macos")]
    let status = Command::new("/usr/bin/open")
        .arg(url)
        .status()
        .map_err(|e| format!("external_url_open_failed:{e}"))?;

    #[cfg(target_os = "windows")]
    let status = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .status()
        .map_err(|e| format!("external_url_open_failed:{e}"))?;

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open")
        .arg(url)
        .status()
        .map_err(|e| format!("external_url_open_failed:{e}"))?;

    if !status.success() {
        return Err("external_url_open_failed".into());
    }
    Ok(())
}
