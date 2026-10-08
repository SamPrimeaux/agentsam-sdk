//! Native host adapter for the reusable AutoRAG dialog.
//! Only named SDK CLI workflows may execute. No shell, arbitrary binary,
//! caller supplied process environment, generic command or privileged Worker keys.
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::process::Command;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AutoRagRequest {
    operation: String,
    root: String,
    scope: Option<Vec<String>>,
    provider: Option<String>,
    backend: Option<String>,
    model: Option<String>,
    dimensions: Option<u32>,
    semantic: Option<bool>,
    allow_paid: Option<bool>,
}

fn validate_root(raw: &str) -> Result<PathBuf, String> {
    if raw.is_empty() || raw.len() > 4096 {
        return Err("autorag_project_path_required".into());
    }
    let root = PathBuf::from(raw)
        .canonicalize()
        .map_err(|_| "autorag_project_path_unavailable".to_string())?;
    if !root.is_dir() { return Err("autorag_project_directory_required".into()); }
    Ok(root)
}

fn valid_scope(value: &str) -> bool {
    !value.is_empty() && value.len() <= 255 && !value.starts_with('/')
        && !value.contains('\\') && !value.contains('\0')
        && !value.contains('*') && !value.contains('?')
        && !value.split('/').any(|part| part == "..")
}

fn execute(request: AutoRagRequest) -> Result<Value, String> {
    let root = validate_root(&request.root)?;
    let mut args = match request.operation.as_str() {
        "inspect" => vec!["autorag".to_string(), "inspect".to_string()],
        "configure" => vec!["autorag".to_string(), "setup".to_string(), "--yes".to_string()],
        "execute" => vec!["autorag".to_string(), "execute".to_string(), "--yes".to_string()],
        _ => return Err("autorag_operation_not_allowlisted".into()),
    };
    if request.operation == "execute" && request.semantic.unwrap_or(false) {
        if !request.allow_paid.unwrap_or(false) { return Err("autorag_paid_operation_approval_required".into()); }
        args.extend(["--semantic".into(), "--allow-paid".into()]);
    }
    if request.operation == "configure" {
        let scope = request.scope.ok_or("autorag_scope_required")?;
        if scope.is_empty() || scope.len() > 256 || !scope.iter().all(|s| valid_scope(s)) {
            return Err("autorag_scope_invalid".into());
        }
        let provider = request.provider.unwrap_or_else(|| "none".into());
        // Semantic provider selection requires a separate capability/model/dimension
        // approval step; native quick-start never guesses values or invokes paid APIs.
        if provider != "none" {
            let model = request.model.ok_or("autorag_explicit_model_required")?;
            let dimensions = request.dimensions.ok_or("autorag_explicit_dimensions_required")?;
            if model.is_empty() || model.len() > 160 || dimensions == 0 || dimensions > 4096 {
                return Err("autorag_model_or_dimensions_invalid".into());
            }
            args.extend(["--model".into(), model, "--dimensions".into(), dimensions.to_string()]);
        }
        let backend = request.backend.unwrap_or_else(|| "local_exact".into());
        if backend != "local_exact" { return Err("autorag_remote_requires_authorized_host".into()); }
        args.extend(["--scope".into(), scope.join(","), "--provider".into(), provider, "--backend".into(), backend]);
    }
    args.extend(["--cwd".into(), root.to_string_lossy().into_owned()]);
    // A release/provisioner can set the absolute executable path. No user
    // input can select it. PATH-based installation remains supported.
    let program = std::env::var("AGENTSAM_CLI_BIN").unwrap_or_else(|_| "agentsam".into());
    let output = Command::new(program)
        .args(&args).current_dir(&root).output()
        .map_err(|_| "autorag_cli_not_installed_or_not_executable".to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("autorag_cli_operation_failed: {}", stderr.chars().take(400).collect::<String>()));
    }
    if output.stdout.len() > 2_000_000 { return Err("autorag_response_size_exceeded".into()); }
    let output: Value = serde_json::from_slice(&output.stdout)
        .map_err(|_| "autorag_cli_invalid_json_receipt".to_string())?;
    Ok(json!({ "ok": true, "result": output }))
}

#[tauri::command]
pub async fn autorag_workflow_bridge(request_json: String) -> Result<String, String> {
    if request_json.len() > 20_000 { return Err("autorag_request_size_exceeded".into()); }
    let request: AutoRagRequest = serde_json::from_str(&request_json)
        .map_err(|_| "autorag_request_invalid".to_string())?;
    tauri::async_runtime::spawn_blocking(move || execute(request))
        .await
        .map_err(|_| "autorag_cli_task_failed".to_string())?
        .map(|result| result.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_command_refuses_untrusted_scope_and_unsupported_operations() {
        assert!(!valid_scope("../secrets"));
        assert!(!valid_scope("/etc"));
        assert!(!valid_scope("foo/*"));
        assert!(valid_scope("packages/agentsam-knowledge"));
        let result = execute(AutoRagRequest { operation: "bash".into(), root: ".".into(), scope: None, provider: None, backend: None, model: None, dimensions: None, semantic: None, allow_paid: None });
        assert_eq!(result.unwrap_err(), "autorag_operation_not_allowlisted");
    }
}

#[tauri::command]
pub async fn autorag_choose_repository() -> Result<Option<String>, String> {
    Ok(rfd::FileDialog::new().set_title("Choose project repository").pick_folder().map(|p| p.to_string_lossy().into_owned()))
}
