//! Supervise bundled/local agentsamd: probe → spawn → protocol handshake.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::State;

const DEFAULT_LISTEN: &str = "127.0.0.1:18765";
const UI_PROTOCOL: &str = "workspace.v1";
const DAEMON_PROTOCOL: &str = "workspace.v1";

#[derive(Default)]
pub struct AgentsamdState {
  child: Mutex<Option<Child>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DaemonHandshake {
  pub ok: bool,
  pub ui_protocol: String,
  pub daemon_protocol: String,
  pub daemon_version: String,
  pub listen: String,
  pub capabilities: serde_json::Value,
  pub message: String,
}

fn health_url(listen: &str) -> String {
  let host = listen
    .trim()
    .trim_start_matches("http://")
    .trim_start_matches("https://");
  format!("http://{host}/health")
}

fn runtime_url(listen: &str) -> String {
  let host = listen
    .trim()
    .trim_start_matches("http://")
    .trim_start_matches("https://");
  format!("http://{host}/v1/runtime")
}

async fn probe_health(listen: &str) -> Option<serde_json::Value> {
  let client = reqwest::Client::new();
  let res = client
    .get(health_url(listen))
    .timeout(Duration::from_secs(2))
    .send()
    .await
    .ok()?;
  if !res.status().is_success() {
    return None;
  }
  res.json().await.ok()
}

fn bundled_agentsamd_candidates() -> Vec<PathBuf> {
  let mut out = Vec::new();
  let name = if cfg!(windows) { "agentsamd.exe" } else { "agentsamd" };
  if let Ok(current) = std::env::current_exe() {
    if let Some(dir) = current.parent() {
      out.push(dir.join(name));
      if let Some(contents) = dir.parent() {
        out.push(contents.join("Resources").join(name));
      }
    }
  }
  out
}

fn resolve_agentsamd_binary(explicit: Option<String>) -> (PathBuf, &'static str) {
  if let Some(value) = explicit.filter(|s| !s.trim().is_empty()) {
    return (PathBuf::from(value), "explicit");
  }
  for candidate in bundled_agentsamd_candidates() {
    if candidate.is_file() {
      return (candidate, "bundled");
    }
  }
  (PathBuf::from("agentsamd"), "path")
}

/// Probe agentsamd; if down, spawn `binary` (or PATH `agentsamd`) then handshake.
#[tauri::command]
pub async fn ensure_agentsamd(
  state: State<'_, AgentsamdState>,
  binary: Option<String>,
  listen: Option<String>,
) -> Result<DaemonHandshake, String> {
  let listen = listen
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| DEFAULT_LISTEN.to_string());

  if let Some(body) = probe_health(&listen).await {
    let version = body
      .get("version")
      .and_then(|v| v.as_str())
      .unwrap_or("0.1.0")
      .to_string();
    let runtime = match reqwest::Client::new()
      .get(runtime_url(&listen))
      .timeout(Duration::from_secs(2))
      .send()
      .await
    {
      Ok(r) => r.json::<serde_json::Value>().await.ok(),
      Err(_) => None,
    };
    let capabilities = runtime
      .as_ref()
      .and_then(|r| r.get("capabilities").cloned())
      .unwrap_or(serde_json::json!({}));
    return Ok(DaemonHandshake {
      ok: true,
      ui_protocol: UI_PROTOCOL.into(),
      daemon_protocol: DAEMON_PROTOCOL.into(),
      daemon_version: version,
      listen,
      capabilities,
      message: "agentsamd_already_running".into(),
    });
  }

  let (bin, bin_source) = resolve_agentsamd_binary(binary);

  {
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    let child = Command::new(&bin)
      .arg("--listen")
      .arg(&listen)
      .env("AGENTSAMD_ROLE", "machine")
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
      .map_err(|e| format!("agentsamd_spawn_failed: {e}"))?;
    *guard = Some(child);
  }

  // Give the daemon a moment before health probe (no extra tokio dep).
  std::thread::sleep(Duration::from_millis(500));

  if let Some(body) = probe_health(&listen).await {
    let version = body
      .get("version")
      .and_then(|v| v.as_str())
      .unwrap_or("0.1.0")
      .to_string();
    return Ok(DaemonHandshake {
      ok: true,
      ui_protocol: UI_PROTOCOL.into(),
      daemon_protocol: DAEMON_PROTOCOL.into(),
      daemon_version: version,
      listen,
      capabilities: serde_json::json!({}),
      message: format!("agentsamd_spawned_{bin_source}"),
    });
  }

  Ok(DaemonHandshake {
    ok: false,
    ui_protocol: UI_PROTOCOL.into(),
    daemon_protocol: DAEMON_PROTOCOL.into(),
    daemon_version: String::new(),
    listen,
    capabilities: serde_json::json!({}),
    message: "agentsamd_unreachable_after_spawn".into(),
  })
}


fn agentsam_home() -> Option<PathBuf> {
  if let Ok(value) = std::env::var("AGENTSAM_HOME") {
    let trimmed = value.trim();
    if !trimmed.is_empty() {
      return Some(PathBuf::from(trimmed));
    }
  }
  std::env::var("HOME")
    .ok()
    .filter(|v| !v.trim().is_empty())
    .map(PathBuf::from)
    .or_else(|| {
      std::env::var("USERPROFILE")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
    })
    .map(|home| home.join(".agentsam"))
}

#[tauri::command]
pub fn agentsamd_pairing_token() -> Result<String, String> {
  let home = agentsam_home().ok_or_else(|| "agentsamd_home_unavailable".to_string())?;
  let path = home.join("agentsamd.token");
  let token = std::fs::read_to_string(&path)
    .map_err(|e| format!("agentsamd_token_read_failed:{}:{e}", path.display()))?;
  let token = token.trim().to_string();
  let valid = token.len() == 64 && token.chars().all(|c| c.is_ascii_hexdigit());
  if !valid {
    return Err("agentsamd_token_invalid".into());
  }
  Ok(token)
}

#[tauri::command]
pub async fn agentsamd_health(listen: Option<String>) -> Result<DaemonHandshake, String> {
  let listen = listen
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| DEFAULT_LISTEN.to_string());
  if let Some(body) = probe_health(&listen).await {
    let version = body
      .get("version")
      .and_then(|v| v.as_str())
      .unwrap_or("0.1.0")
      .to_string();
    return Ok(DaemonHandshake {
      ok: true,
      ui_protocol: UI_PROTOCOL.into(),
      daemon_protocol: DAEMON_PROTOCOL.into(),
      daemon_version: version,
      listen,
      capabilities: body,
      message: "ok".into(),
    });
  }
  Ok(DaemonHandshake {
    ok: false,
    ui_protocol: UI_PROTOCOL.into(),
    daemon_protocol: DAEMON_PROTOCOL.into(),
    daemon_version: String::new(),
    listen,
    capabilities: serde_json::json!({}),
    message: "unreachable".into(),
  })
}
