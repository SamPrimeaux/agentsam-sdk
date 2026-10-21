use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

#[derive(serde::Serialize)]
pub struct AgentBrowserLaunch {
    pub profile_path: String,
    pub chrome_path: String,
    pub target_url: String,
}

fn approved_target(raw: Option<String>) -> Result<String, String> {
    let target = raw.unwrap_or_else(|| "chrome://newtab/".to_string());
    let value = target.trim();
    let allowed_internal = [
        "chrome://newtab/",
        "chrome://downloads/",
        "chrome://extensions/",
        "chrome://settings/",
        "chrome://settings/content/",
    ];
    if allowed_internal.contains(&value) {
        return Ok(value.to_string());
    }
    let normalized = value.to_ascii_lowercase();
    let has_web_scheme = normalized.starts_with("https://") || normalized.starts_with("http://");
    if has_web_scheme && !value.chars().any(char::is_control) {
        return Ok(value.to_string());
    }
    Err("browser_url_not_allowed".to_string())
}

fn executable_candidates(home: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    #[cfg(target_os = "macos")]
    {
        candidates.push(PathBuf::from(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ));
        if let Some(home) = home {
            candidates
                .push(home.join("Applications/Google Chrome.app/Contents/MacOS/Google Chrome"));
        }
    }
    #[cfg(target_os = "windows")]
    {
        for variable in ["PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"] {
            if let Some(root) = std::env::var_os(variable) {
                candidates.push(PathBuf::from(root).join("Google/Chrome/Application/chrome.exe"));
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        for name in [
            "google-chrome",
            "google-chrome-stable",
            "chromium",
            "chromium-browser",
        ] {
            candidates.extend(
                std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
                    .map(|path| path.join(name)),
            );
        }
    }
    candidates
}

fn find_chrome(home: Option<&Path>) -> Result<PathBuf, String> {
    executable_candidates(home)
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| "google_chrome_not_found_install_google_chrome_to_continue".to_string())
}

#[tauri::command]
pub fn open_agent_browser(
    app: AppHandle,
    target_url: Option<String>,
) -> Result<AgentBrowserLaunch, String> {
    let target_url = approved_target(target_url)?;
    let home = app.path().home_dir().ok();
    let chrome = find_chrome(home.as_deref())?;
    let profile = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("browser_profile_path_unavailable:{error}"))?
        .join("browser")
        .join("chrome-profile");
    std::fs::create_dir_all(&profile)
        .map_err(|error| format!("browser_profile_create_failed:{error}"))?;

    Command::new(&chrome)
        .arg(format!("--user-data-dir={}", profile.display()))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--new-window")
        .arg(&target_url)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("google_chrome_launch_failed:{error}"))?;

    Ok(AgentBrowserLaunch {
        profile_path: profile.to_string_lossy().into_owned(),
        chrome_path: chrome.to_string_lossy().into_owned(),
        target_url,
    })
}

#[cfg(test)]
mod tests {
    use super::approved_target;

    #[test]
    fn accepts_web_urls_and_browser_management_pages() {
        assert_eq!(
            approved_target(Some("https://example.com".into())).unwrap(),
            "https://example.com"
        );
        assert_eq!(
            approved_target(Some("chrome://extensions/".into())).unwrap(),
            "chrome://extensions/"
        );
        assert_eq!(approved_target(None).unwrap(), "chrome://newtab/");
    }

    #[test]
    fn rejects_other_schemes_and_internal_pages() {
        assert!(approved_target(Some("file:///etc/passwd".into())).is_err());
        assert!(approved_target(Some("javascript:alert(1)".into())).is_err());
        assert!(approved_target(Some("chrome://version/".into())).is_err());
    }
}
