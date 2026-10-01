//! Local SQLite bridge — spawns Node + agentsam-database-editor bridge script.
//! Opaque path handling stays in the Node runtime; the webview only sees JSON.

use serde_json::Value;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

fn find_bridge_script(app: &AppHandle) -> Result<PathBuf, String> {
  if let Ok(resources) = app.path().resource_dir() {
    let packaged = resources.join("runtime/database/scripts/local-sqlite-bridge.mjs");
    if packaged.is_file() {
      return Ok(packaged);
    }
  }

  Err("local_sqlite_bridge_script_not_found".into())
}

fn find_project_cwd() -> PathBuf {
  if let Ok(cwd) = std::env::current_dir() {
    let mut dir = cwd.clone();
    for _ in 0..12 {
      if dir.join(".agentsam/config.json").is_file()
        || dir.join(".agentsam/data/agentsam.sqlite").is_file()
      {
        return dir;
      }
      if !dir.pop() {
        break;
      }
    }
    return cwd;
  }
  PathBuf::from(".")
}

#[tauri::command]
pub async fn local_sqlite_bridge(app: AppHandle, request_json: String) -> Result<String, String> {
  let script = find_bridge_script(&app)?;
  let cwd = find_project_cwd();

  // Ensure cwd is present in the request for the Node bridge.
  let mut payload: Value =
    serde_json::from_str(&request_json).map_err(|e| format!("invalid_json:{e}"))?;
  if payload.get("cwd").is_none() {
    if let Some(obj) = payload.as_object_mut() {
      obj.insert(
        "cwd".into(),
        Value::String(cwd.to_string_lossy().to_string()),
      );
    }
  }
  let body = serde_json::to_string(&payload).map_err(|e| e.to_string())?;

  let exe = std::env::current_exe()
    .map_err(|e| format!("packaged_node_executable_unavailable:{e}"))?;
  let dir = exe
    .parent()
    .ok_or_else(|| "packaged_node_directory_unavailable".to_string())?;
  let node = dir.join(if cfg!(windows) { "node.exe" } else { "node" });
  if !node.is_file() {
    return Err("packaged_node_runtime_missing".into());
  }

  let mut command = Command::new(node);
  command
    .arg(&script)
    .current_dir(&cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped());
  if let Ok(resources) = app.path().resource_dir() {
    let migrations = resources.join("runtime/migrations");
    if migrations.is_dir() {
      command.arg("--migrations").arg(migrations);
    }
  }
  let mut child = command
    .spawn()
    .map_err(|e| format!("node_spawn_failed:{e}"))?;

  if let Some(mut stdin) = child.stdin.take() {
    stdin
      .write_all(body.as_bytes())
      .map_err(|e| format!("stdin_write_failed:{e}"))?;
  }

  let output = child
    .wait_with_output()
    .map_err(|e| format!("node_wait_failed:{e}"))?;

  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

  if !output.status.success() && stdout.is_empty() {
    return Err(if stderr.is_empty() {
      format!("local_sqlite_bridge_failed:{}", output.status)
    } else {
      stderr
    });
  }

  if stdout.is_empty() {
    return Err(if stderr.is_empty() {
      "local_sqlite_bridge_empty".into()
    } else {
      stderr
    });
  }

  Ok(stdout)
}

fn opaque_ref(path: &Path) -> String {
  format!("ldbref:{}", URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes()))
}

#[tauri::command]
pub async fn local_sqlite_pick_database() -> Result<Option<Value>, String> {
  let picked = rfd::FileDialog::new()
    .set_title("Open SQLite Database")
    .add_filter("SQLite", &["sqlite", "sqlite3", "db"])
    .pick_file();
  Ok(picked.map(|path| serde_json::json!({
    "id": format!("local-sqlite:picked:{}", URL_SAFE_NO_PAD.encode(path.to_string_lossy().as_bytes())),
    "label": path.file_name().and_then(|name| name.to_str()).unwrap_or("SQLite database"),
    "ref": opaque_ref(&path),
    "pathHint": path.to_string_lossy(),
    "kind": "file",
    "writable": true,
  })))
}

#[tauri::command]
pub async fn local_sqlite_pick_directory() -> Result<Option<String>, String> {
  Ok(rfd::FileDialog::new()
    .set_title("Choose Database Folder")
    .pick_folder()
    .map(|path| opaque_ref(&path)))
}

#[allow(dead_code)]
fn script_exists(path: &Path) -> bool {
  path.is_file()
}
