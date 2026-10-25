//! A serialized, persistent OCCT process per project. The versioned project document
//! owns the feature log; the app-data checkpoint supports restart/offline recovery.
use rand::{distributions::Alphanumeric, Rng};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Write},
    path::PathBuf,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Manager, State};

#[derive(Default)]
pub struct CadEngineState {
    sessions: Arc<Mutex<HashMap<String, Session>>>,
}
struct Session {
    child: Child,
    stdin: ChildStdin,
    output: mpsc::Receiver<String>,
}
impl Drop for Session {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Session {
    fn start(binary: PathBuf) -> Result<Self, String> {
        let mut child = Command::new(binary)
            .arg("--serve")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| format!("occt_launch_failed:{e}"))?;
        let stdin = child.stdin.take().ok_or("occt_stdin_missing")?;
        let stdout = child.stdout.take().ok_or("occt_stdout_missing")?;
        let (tx, output) = mpsc::sync_channel(2);
        std::thread::spawn(move || {
            for line in BufReader::new(stdout).lines() {
                let Ok(line) = line else { break };
                if line.starts_with("AGENTSAM_RESULT=") && tx.send(line).is_err() {
                    break;
                }
            }
        });
        Ok(Self {
            child,
            stdin,
            output,
        })
    }
    fn request(&mut self, request: &Value) -> Result<Value, String> {
        let line = serde_json::to_string(request).map_err(|e| e.to_string())?;
        if line.len() > 8 * 1024 * 1024 {
            return Err("cad_request_budget_exceeded".into());
        }
        writeln!(self.stdin, "{line}")
            .and_then(|_| self.stdin.flush())
            .map_err(|e| format!("occt_write_failed:{e}"))?;
        let response = self
            .output
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "occt_response_timeout_or_closed")?;
        let receipt: Value = serde_json::from_str(
            response
                .strip_prefix("AGENTSAM_RESULT=")
                .ok_or("occt_receipt_missing")?,
        )
        .map_err(|_| "occt_receipt_invalid")?;
        if receipt["engine"] != "occt" {
            return Err("occt_receipt_unverified".into());
        }
        if receipt["ok"] != true {
            return Err(receipt["error"]
                .as_str()
                .unwrap_or("occt_request_failed")
                .to_string());
        }
        Ok(receipt)
    }
}
fn project_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "_.:-".contains(c))
}
fn root(app: &AppHandle, project: &str) -> Result<PathBuf, String> {
    if !project_id(project) {
        return Err("cad_project_id_invalid".into());
    }
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("cad/projects")
        .join(project))
}
fn checkpoint(path: &PathBuf, value: &Value) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    let bytes = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let mut file = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    file.write_all(&bytes)
        .and_then(|_| file.sync_all())
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, path).map_err(|e| e.to_string())
}
fn dispatch(
    app: &AppHandle,
    sessions: &mut HashMap<String, Session>,
    project: &str,
    mut request: Value,
) -> Result<Value, String> {
    let directory = root(app, project)?;
    fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
    let log_path = directory.join("engine.json");
    let action = request["action"]
        .as_str()
        .ok_or("cad_action_required")?
        .to_string();
    if ![
        "open",
        "state",
        "apply",
        "replace",
        "syncPlan",
        "undo",
        "redo",
        "mesh",
        "export",
        "solveSketch",
    ]
    .contains(&action.as_str())
    {
        return Err("cad_action_unsupported".into());
    }
    if !sessions.contains_key(project) {
        if sessions.len() >= 8 {
            return Err("cad_open_project_limit".into());
        }
        let mut session = Session::start(super::cad::resolve_occt(app)?)?;
        if action != "open" {
            let mut open = if log_path.exists() {
                serde_json::from_slice::<Value>(&fs::read(&log_path).map_err(|e| e.to_string())?)
                    .map_err(|_| "cad_checkpoint_invalid")?
            } else {
                json!({})
            };
            open["action"] = json!("open");
            open["projectId"] = json!(project);
            session.request(&open)?;
        }
        sessions.insert(project.into(), session);
    }
    if action == "open" {
        request["projectId"] = json!(project);
    }
    let mut artifact = None;
    if action == "export" {
        let format = request["format"]
            .as_str()
            .ok_or("cad_export_format_required")?;
        if !["step", "brep", "gltf", "ifc", "svg"].contains(&format) {
            return Err("cad_export_format_invalid".into());
        }
        let name: String = rand::thread_rng()
            .sample_iter(&Alphanumeric)
            .take(24)
            .map(char::from)
            .collect();
        let path = directory.join(format!("{name}.{format}"));
        request["path"] = json!(path.to_string_lossy());
        artifact = Some(path);
    }
    let outcome = (|| {
        let session = sessions.get_mut(project).ok_or("cad_session_missing")?;
        let mut result = session.request(&request)?;
        if ["open", "apply", "replace", "syncPlan", "undo", "redo"].contains(&action.as_str()) {
            let state = session.request(&json!({"action":"state"}))?;
            checkpoint(&log_path, &state)?;
            result["operations"] = state["operations"].clone();
        }
        if let Some(path) = artifact.as_ref() {
            let bytes = fs::read(path).map_err(|e| e.to_string())?;
            if bytes.is_empty() {
                return Err("cad_export_empty".into());
            }
            result["artifact"] = json!({"path":path.to_string_lossy(),"sizeBytes":bytes.len(),"sha256":format!("{:x}",Sha256::digest(&bytes))});
        }
        if action == "export" && request["saveAs"] == true {
            if let Some(source) = artifact.as_ref() {
                let name = format!(
                    "{}.{}",
                    request["id"].as_str().unwrap_or("solid"),
                    request["format"].as_str().unwrap_or("step")
                );
                if let Some(destination) = rfd::FileDialog::new().set_file_name(&name).save_file() {
                    fs::copy(source, &destination).map_err(|e| e.to_string())?;
                    result["artifact"]["path"] = json!(destination.to_string_lossy());
                    result["path"] = json!(destination.to_string_lossy());
                } else {
                    result["cancelled"] = json!(true);
                }
            }
        }
        Ok(result)
    })();
    // Close after any failure. The last durable checkpoint is replayed on the next request.
    if outcome.is_err() {
        sessions.remove(project);
        if let Some(path) = artifact {
            let _ = fs::remove_file(path);
        }
    }
    outcome
}
#[tauri::command]
pub async fn cad_engine_request(
    app: AppHandle,
    state: State<'_, CadEngineState>,
    project_id: String,
    request: Value,
) -> Result<Value, String> {
    let sessions = state.sessions.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut guard = sessions.lock().map_err(|_| "cad_engine_lock_failed")?;
        dispatch(&app, &mut guard, &project_id, request)
    })
    .await
    .map_err(|e| e.to_string())?
}
pub fn primitive_mesh(
    app: &AppHandle,
    state: &CadEngineState,
    primitive: cad_kernel::CadPrimitive,
) -> Result<cad_kernel::MeshData, String> {
    let operation = match primitive {
        cad_kernel::CadPrimitive::Box {
            length,
            width,
            height,
        } => {
            json!({"id":"preview-solid","type":"box","width":length,"depth":width,"height":height})
        }
        cad_kernel::CadPrimitive::Cylinder { radius, height, .. } => {
            json!({"id":"preview-solid","type":"cylinder","radius":radius,"height":height})
        }
    };
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "cad_engine_lock_failed")?;
    dispatch(
        app,
        &mut sessions,
        "primitive-preview",
        json!({"action":"open","operations":[operation]}),
    )?;
    let mesh = dispatch(
        app,
        &mut sessions,
        "primitive-preview",
        json!({"action":"mesh","id":"preview-solid"}),
    )?;
    serde_json::from_value(mesh).map_err(|_| "occt_mesh_contract_invalid".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn project_paths_are_scoped() {
        assert!(project_id("proj_mrb5shkc_3kos2c"));
        assert!(!project_id("../other"));
        assert!(!project_id("/tmp/other"));
        assert!(!project_id(""));
    }
}
