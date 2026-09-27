//! Local SQLite bridge — spawns Node + agentsam-database-editor bridge script.
//! Opaque path handling stays in the Node runtime; the webview only sees JSON.

use serde_json::Value;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

fn find_bridge_script() -> Result<PathBuf, String> {
  // Prefer env override for packaged apps.
  if let Ok(p) = std::env::var("AGENTSAM_SQLITE_BRIDGE") {
    let path = PathBuf::from(p);
    if path.is_file() {
      return Ok(path);
    }
  }

  // Dev: walk up from cwd / executable for monorepo package script.
  let mut candidates: Vec<PathBuf> = Vec::new();
  if let Ok(cwd) = std::env::current_dir() {
    candidates.push(cwd.clone());
    if let Some(parent) = cwd.parent() {
      candidates.push(parent.to_path_buf());
    }
  }
  if let Ok(exe) = std::env::current_exe() {
    if let Some(dir) = exe.parent() {
      candidates.push(dir.to_path_buf());
      for _ in 0..6 {
        if let Some(parent) = candidates.last().and_then(|p| p.parent().map(|x| x.to_path_buf())) {
          candidates.push(parent);
        }
      }
    }
  }

  for root in candidates {
    let path = root.join("packages/agentsam-database-editor/scripts/local-sqlite-bridge.mjs");
    if path.is_file() {
      return Ok(path);
    }
    let alt = root
      .join("../agentsam-database-editor/scripts/local-sqlite-bridge.mjs");
    if alt.is_file() {
      return Ok(alt.canonicalize().unwrap_or(alt));
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
pub async fn local_sqlite_bridge(request_json: String) -> Result<String, String> {
  let script = find_bridge_script()?;
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

  let mut child = Command::new("node")
    .arg(&script)
    .current_dir(&cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
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

#[allow(dead_code)]
fn script_exists(path: &Path) -> bool {
  path.is_file()
}
