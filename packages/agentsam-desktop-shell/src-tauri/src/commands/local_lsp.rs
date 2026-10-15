//! Native-only LSP bridge. Existing agentsam-ide LspHost owns allowed servers.
//! No public localhost endpoint, shell, install side effects, or cloud dependency.
use serde_json::Value;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct LocalLspState {
  child: Mutex<Option<LspChild>>,
}

impl Default for LocalLspState {
  fn default() -> Self {
    Self { child: Mutex::new(None) }
  }
}

struct LspChild {
  child: Child,
  stdin: ChildStdin,
  stdout: BufReader<ChildStdout>,
}

impl Drop for LspChild {
  fn drop(&mut self) {
    let _ = self.child.kill();
    let _ = self.child.wait();
  }
}

fn spawn_lsp(app: &AppHandle) -> Result<LspChild, String> {
  let resources = app.path().resource_dir()
    .map_err(|e| format!("lsp_resource_directory_unavailable:{e}"))?;
  let script = resources.join("runtime/lsp/native-lsp-bridge.mjs");
  let host = resources.join("runtime/lsp/host.mjs");
  if !script.is_file() || !host.is_file() {
    return Err("lsp_bundle_incomplete:missing_host_or_bridge".into());
  }
  let exe = std::env::current_exe().map_err(|e| format!("lsp_app_executable_unavailable:{e}"))?;
  let node = exe.parent()
    .ok_or("lsp_app_binary_dir_unavailable")?
    .join(if cfg!(windows) { "node.exe" } else { "node" });
  if !node.is_file() { return Err("lsp_bundled_node_missing".into()); }
  let mut child = Command::new(node)
    .arg(script)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|e| format!("lsp_node_spawn_failed:{e}"))?;
  let stdin = child.stdin.take().ok_or("lsp_node_stdin_missing")?;
  let stdout = child.stdout.take().ok_or("lsp_node_stdout_missing")?;
  Ok(LspChild { child, stdin, stdout: BufReader::new(stdout) })
}

#[tauri::command]
pub fn local_lsp_bridge(
  app: AppHandle,
  state: State<'_, LocalLspState>,
  request_json: String,
) -> Result<Value, String> {
  if request_json.len() > 2_000_000 {
    return Err("lsp_request_too_large".into());
  }
  let request: Value = serde_json::from_str(&request_json)
    .map_err(|e| format!("lsp_invalid_request:{e}"))?;
  let action = request.get("action").and_then(Value::as_str).unwrap_or("");
  if !["capabilities", "start", "send", "poll", "stop"].contains(&action) {
    return Err("lsp_invalid_action".into());
  }
  let mut lock = state.child.lock().map_err(|_| "lsp_state_poisoned")?;
  if lock.is_none() { *lock = Some(spawn_lsp(&app)?); }
  let process = lock.as_mut().ok_or("lsp_process_missing")?;
  process.stdin.write_all(request_json.as_bytes()).map_err(|e| format!("lsp_write_failed:{e}"))?;
  process.stdin.write_all(b"\n").map_err(|e| format!("lsp_write_failed:{e}"))?;
  process.stdin.flush().map_err(|e| format!("lsp_flush_failed:{e}"))?;
  let mut line = String::new();
  let size = process.stdout.read_line(&mut line)
    .map_err(|e| format!("lsp_read_failed:{e}"))?;
  if size == 0 {
    *lock = None;
    return Err("lsp_sidecar_exited".into());
  }
  if line.len() > 5_000_000 { return Err("lsp_response_too_large".into()); }
  let result: Value = serde_json::from_str(&line)
    .map_err(|e| format!("lsp_response_invalid:{e}"))?;
  Ok(result)
}
