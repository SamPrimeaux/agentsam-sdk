use serde::{Deserialize, Serialize};
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};

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
    if path.is_dir() {
        Some(path)
    } else {
        None
    }
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

#[derive(Debug, Deserialize)]
struct WorkspaceHandoffRecord {
    workspace_path: String,
    expires_at_ms: u64,
}

fn unix_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

/// Atomically claims a CLI-created handoff file, deletes it after reading, checks expiry,
/// and validates the real workspace path. The deep-link URL never supplies filesystem paths.
pub fn consume_workspace_handoff(app_data_dir: &Path, token: &str) -> Result<PathBuf, String> {
    if token.len() != 64 || !token.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("workspace_handoff_token_invalid".into());
    }
    let handoff_dir = app_data_dir.join("handoffs");
    let directory_metadata = std::fs::symlink_metadata(&handoff_dir)
        .map_err(|_| "workspace_handoff_not_found".to_string())?;
    if !directory_metadata.file_type().is_dir() {
        return Err("workspace_handoff_invalid_directory".into());
    }
    #[cfg(unix)]
    if directory_metadata.permissions().mode() & 0o077 != 0 {
        return Err("workspace_handoff_directory_permissions_invalid".into());
    }
    let handoff_path = handoff_dir.join(format!("{token}.json"));
    let metadata = std::fs::symlink_metadata(&handoff_path)
        .map_err(|_| "workspace_handoff_not_found".to_string())?;
    if !metadata.file_type().is_file() || metadata.len() > 8192 {
        return Err("workspace_handoff_invalid_file".into());
    }
    #[cfg(unix)]
    if metadata.permissions().mode() & 0o077 != 0 {
        return Err("workspace_handoff_file_permissions_invalid".into());
    }
    let claimed_path = handoff_dir.join(format!(
        ".{token}.{}.{}.consuming",
        std::process::id(),
        unix_time_ms()
    ));
    std::fs::rename(&handoff_path, &claimed_path)
        .map_err(|_| "workspace_handoff_not_found".to_string())?;
    let claimed_metadata = std::fs::symlink_metadata(&claimed_path)
        .map_err(|_| "workspace_handoff_invalid_file".to_string())?;
    if !claimed_metadata.file_type().is_file() || claimed_metadata.len() > 8192 {
        let _ = std::fs::remove_file(&claimed_path);
        return Err("workspace_handoff_invalid_file".into());
    }
    let bytes = std::fs::read(&claimed_path);
    let _ = std::fs::remove_file(&claimed_path);
    let bytes = bytes.map_err(|_| "workspace_handoff_invalid_file".to_string())?;
    let record: WorkspaceHandoffRecord = serde_json::from_slice(&bytes)
        .map_err(|_| "workspace_handoff_invalid_record".to_string())?;
    let now = unix_time_ms();
    if record.expires_at_ms < now {
        return Err("workspace_handoff_expired".into());
    }
    if record.expires_at_ms > now.saturating_add(120_000) {
        return Err("workspace_handoff_expiry_invalid".into());
    }
    validate_workspace_dir(&record.workspace_path)
}

#[tauri::command]
pub fn desktop_open_workspace(
    token: String,
    app: AppHandle,
    state: State<'_, WorkspaceOpenState>,
) -> Result<DesktopWorkspaceContext, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "workspace_handoff_storage_unavailable".to_string())?;
    let real = consume_workspace_handoff(&app_data_dir, &token)?;
    *state
        .0
        .lock()
        .map_err(|_| "workspace_state_unavailable".to_string())? = Some(real.clone());
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
        for bad in [
            "",
            "   ",
            "relative/dir",
            "./x",
            "~/x",
            "/definitely/not/here-agentsam",
            "/etc/passwd-not-dir\0x",
        ] {
            assert!(
                validate_workspace_dir(bad).is_err(),
                "should reject {bad:?}"
            );
        }
        assert_eq!(
            validate_workspace_dir("/").unwrap_err(),
            "workspace_path_root_not_allowed"
        );
        let file = scratch("file").join("f.txt");
        std::fs::write(&file, "x").unwrap();
        assert_eq!(
            validate_workspace_dir(file.to_str().unwrap()).unwrap_err(),
            "workspace_path_not_directory"
        );
        assert!(validate_workspace_dir(&"/a".repeat(3000)).is_err());
    }

    #[test]
    fn accepts_a_real_directory_and_returns_its_canonical_path() {
        let dir = scratch("ok");
        let got = validate_workspace_dir(dir.to_str().unwrap()).expect("valid dir");
        assert_eq!(got, std::fs::canonicalize(&dir).unwrap());
    }

    fn write_handoff(app_data_dir: &Path, token: &str, workspace: &Path, expires_at_ms: u64) {
        let directory = app_data_dir.join("handoffs");
        std::fs::create_dir_all(&directory).expect("handoff directory");
        #[cfg(unix)]
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700))
            .expect("private handoff directory");
        let record = serde_json::json!({
            "workspace_path": workspace.to_string_lossy(),
            "expires_at_ms": expires_at_ms,
        });
        let path = directory.join(format!("{token}.json"));
        std::fs::write(&path, record.to_string()).expect("handoff record");
        #[cfg(unix)]
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .expect("private handoff file");
    }

    #[test]
    fn workspace_handoff_is_redeemed_once_and_returns_a_canonical_path() {
        let app_data = scratch("handoff-app-data");
        let workspace = scratch("handoff-workspace");
        let token = "a".repeat(64);
        write_handoff(
            &app_data,
            &token,
            &workspace,
            unix_time_ms().saturating_add(60_000),
        );
        let expected = std::fs::canonicalize(&workspace).unwrap();
        assert_eq!(
            consume_workspace_handoff(&app_data, &token).unwrap(),
            expected
        );
        assert_eq!(
            consume_workspace_handoff(&app_data, &token).unwrap_err(),
            "workspace_handoff_not_found"
        );
    }

    #[test]
    fn workspace_handoff_rejects_invalid_tokens_expired_records_and_bad_paths() {
        let app_data = scratch("handoff-invalid-app-data");
        assert_eq!(
            consume_workspace_handoff(&app_data, "short").unwrap_err(),
            "workspace_handoff_token_invalid"
        );
        let expired = "b".repeat(64);
        write_handoff(
            &app_data,
            &expired,
            &scratch("handoff-expired-workspace"),
            unix_time_ms().saturating_sub(1),
        );
        assert_eq!(
            consume_workspace_handoff(&app_data, &expired).unwrap_err(),
            "workspace_handoff_expired"
        );
        let invalid_path = "c".repeat(64);
        write_handoff(
            &app_data,
            &invalid_path,
            Path::new("relative/workspace"),
            unix_time_ms().saturating_add(60_000),
        );
        assert_eq!(
            consume_workspace_handoff(&app_data, &invalid_path).unwrap_err(),
            "workspace_path_not_absolute"
        );
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
