use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
pub struct DesktopWorkspaceContext {
    pub home_dir: String,
    pub process_cwd: String,
    pub default_cwd: String,
    pub source: String,
}

fn existing_dir(value: Option<String>) -> Option<PathBuf> {
    let value = value?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    let path = PathBuf::from(value);
    if path.is_dir() { Some(path) } else { None }
}

#[tauri::command]
pub fn desktop_workspace_context() -> DesktopWorkspaceContext {
    let explicit = existing_dir(std::env::var("AGENTSAM_PROJECT_ROOT").ok());
    let process_cwd = std::env::current_dir().ok().filter(|path| path.is_dir());
    let home = existing_dir(
        std::env::var("HOME")
            .ok()
            .or_else(|| std::env::var("USERPROFILE").ok()),
    );

    let useful_process_cwd = process_cwd
        .as_ref()
        .filter(|path| path.as_path() != Path::new("/"))
        .cloned();

    let (default_cwd, source) = if let Some(path) = explicit {
        (path, "AGENTSAM_PROJECT_ROOT")
    } else if let Some(path) = useful_process_cwd {
        (path, "process_cwd")
    } else if let Some(path) = home.clone() {
        (path, "home")
    } else if let Some(path) = process_cwd.clone() {
        (path, "process_cwd_fallback")
    } else {
        (PathBuf::from("."), "relative_fallback")
    };

    DesktopWorkspaceContext {
        home_dir: home
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default(),
        process_cwd: process_cwd
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default(),
        default_cwd: default_cwd.to_string_lossy().to_string(),
        source: source.to_string(),
    }
}

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
