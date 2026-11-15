use std::sync::Mutex;
use tauri::{AppHandle, State};
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

/// Folder opened through `agentsam <dir>` (agentsamstudio://open deep link). Held for this app
/// session only; `desktop_workspace_context` is the single place every consumer reads it from.
#[derive(Default)]
pub struct WorkspaceOpenState(Mutex<Option<PathBuf>>);

/// Deep links can be fired by any local app or web page, so the path is untrusted input:
/// it must be absolute, resolve to a real directory, and not be the filesystem root.
pub fn validate_workspace_dir(raw: &str) -> Result<PathBuf, String> {
    let raw = raw.trim();
    if raw.is_empty() || raw.len() > 4096 || raw.contains('\0') {
        return Err("workspace_path_invalid".into());
    }
    let path = Path::new(raw);
    if !path.is_absolute() {
        return Err("workspace_path_not_absolute".into());
    }
    let real = std::fs::canonicalize(path).map_err(|_| "workspace_path_not_found".to_string())?;
    if !real.is_dir() {
        return Err("workspace_path_not_directory".into());
    }
    if real.parent().is_none() {
        return Err("workspace_path_root_not_allowed".into());
    }
    Ok(real)
}

#[tauri::command]
pub fn desktop_workspace_context(state: State<'_, WorkspaceOpenState>) -> DesktopWorkspaceContext {
    compute_workspace_context(state.0.lock().ok().and_then(|opened| opened.clone()))
}

#[tauri::command]
pub fn desktop_open_workspace(
    path: String,
    state: State<'_, WorkspaceOpenState>,
) -> Result<DesktopWorkspaceContext, String> {
    let real = validate_workspace_dir(&path)?;
    *state.0.lock().map_err(|_| "workspace_state_unavailable".to_string())? = Some(real.clone());
    Ok(compute_workspace_context(Some(real)))
}

fn compute_workspace_context(opened: Option<PathBuf>) -> DesktopWorkspaceContext {
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

    let (default_cwd, source) = if let Some(path) = opened {
        (path, "opened_project")
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

/// Bring the existing Local Studio shell forward for native companion actions.
#[tauri::command]
pub fn focus_main_window(app: AppHandle) -> Result<(), String> {
    crate::menu::focus_or_open_window(&app)
        .map(|_| ())
        .ok_or_else(|| "studio_window_unavailable".to_string())
}

#[cfg(test)]
mod workspace_tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("agentsam-ws-{}-{}", name, std::process::id()));
        std::fs::create_dir_all(&dir).expect("scratch dir");
        dir
    }

    #[test]
    fn rejects_untrusted_paths() {
        for bad in ["", "   ", "relative/dir", "./x", "~/x", "/definitely/not/here-agentsam", "/etc/passwd-not-dir\0x"] {
            assert!(validate_workspace_dir(bad).is_err(), "should reject {bad:?}");
        }
        assert_eq!(validate_workspace_dir("/").unwrap_err(), "workspace_path_root_not_allowed");
        let file = scratch("file").join("f.txt");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(validate_workspace_dir(file.to_str().unwrap()).unwrap_err(), "workspace_path_not_directory");
        assert!(validate_workspace_dir(&"/a".repeat(3000)).is_err());
    }

    #[test]
    fn accepts_a_real_directory_and_returns_its_canonical_path() {
        let dir = scratch("ok");
        let got = validate_workspace_dir(dir.to_str().unwrap()).expect("valid dir");
        assert_eq!(got, std::fs::canonicalize(&dir).unwrap());
    }

    #[test]
    fn opened_workspace_overrides_the_process_cwd_for_every_consumer() {
        let dir = std::fs::canonicalize(scratch("ctx")).unwrap();
        let opened = compute_workspace_context(Some(dir.clone()));
        assert_eq!(opened.default_cwd, dir.to_string_lossy());
        assert_eq!(opened.source, "opened_project");
        assert_ne!(compute_workspace_context(None).source, "opened_project");
    }
}
