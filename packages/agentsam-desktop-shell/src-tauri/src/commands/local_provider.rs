//! Device-local provider bridge.
//! Provider credentials are read from the OS keychain in Rust and are passed
//! only to the bundled Node bridge over private stdin. They are never returned
//! to the webview.

use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Manager};

const PROVIDERS: &[&str] = &["openai", "anthropic", "gemini", "cursor", "xai", "cloudflare"];
const MAX_BRIDGE_OUTPUT_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocalProviderBridgeRequest {
    operation: String,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    model_id: Option<String>,
    #[serde(default)]
    messages: Option<Vec<LocalProviderMessage>>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LocalProviderMessage {
    role: String,
    content: String,
}

fn canonical_provider(value: &str) -> Result<&str, String> {
    let value = value.trim().to_ascii_lowercase();
    PROVIDERS
        .iter()
        .copied()
        .find(|provider| *provider == value)
        .ok_or_else(|| "local_provider_invalid".to_string())
}

fn find_bridge_script(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(resources) = app.path().resource_dir() {
        let packaged = resources.join("runtime/provider/local-provider-bridge.mjs");
        if packaged.is_file() {
            return Ok(packaged);
        }
    }

    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd);
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let mut current = dir.to_path_buf();
            for _ in 0..8 {
                roots.push(current.clone());
                if !current.pop() {
                    break;
                }
            }
        }
    }
    for root in roots {
        let candidate = root.join("packages/agentsam-desktop-shell/scripts/local-provider-bridge.mjs");
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err("local_provider_bridge_script_not_found".into())
}

fn find_node_binary() -> PathBuf {
    if let Ok(path) = std::env::var("AGENTSAM_NODE_BINARY") {
        let candidate = PathBuf::from(path);
        if candidate.is_file() {
            return candidate;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidate = dir.join(if cfg!(windows) { "node.exe" } else { "node" });
            if candidate.is_file() {
                return candidate;
            }
        }
    }
    [
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/usr/bin/node"),
    ]
    .into_iter()
    .find(|path| path.is_file())
    .unwrap_or_else(|| PathBuf::from("node"))
}

fn credential_object(operation: &str, selected_provider: Option<&str>) -> Result<Map<String, Value>, String> {
    let mut credentials = Map::new();
    let providers: Vec<&str> = if operation == "chat" {
        vec![selected_provider.ok_or_else(|| "local_provider_required".to_string())?]
    } else {
        PROVIDERS.to_vec()
    };
    for provider in providers {
        if let Some(value) = super::keychain::provider_key_get_internal(provider)? {
            if !value.trim().is_empty() {
                credentials.insert(provider.to_string(), Value::String(value));
            }
        }
    }
    Ok(credentials)
}

fn child_payload(request: LocalProviderBridgeRequest) -> Result<Value, String> {
    let operation = request.operation.trim().to_ascii_lowercase();
    if operation != "inventory" && operation != "chat" {
        return Err("local_provider_operation_invalid".into());
    }

    let provider = request
        .provider
        .as_deref()
        .map(canonical_provider)
        .transpose()?;
    if operation == "chat" && provider.is_none() {
        return Err("local_provider_required".into());
    }
    let model_id = request.model_id.unwrap_or_default().trim().to_string();
    if operation == "chat" && model_id.is_empty() {
        return Err("local_provider_model_required".into());
    }

    let messages = request
        .messages
        .unwrap_or_default()
        .into_iter()
        .map(|row| json!({ "role": row.role, "content": row.content }))
        .collect::<Vec<_>>();

    Ok(json!({
        "operation": operation,
        "provider": provider,
        "model_id": model_id,
        "messages": messages,
        "credentials": Value::Object(credential_object(operation.as_str(), provider)?),
    }))
}

#[tauri::command]
pub async fn local_provider_bridge(app: AppHandle, request_json: String) -> Result<String, String> {
    let request: LocalProviderBridgeRequest = serde_json::from_str(&request_json)
        .map_err(|_| "local_provider_request_invalid".to_string())?;
    let payload = child_payload(request)?;
    let body = serde_json::to_vec(&payload).map_err(|_| "local_provider_request_encode_failed".to_string())?;
    let script = find_bridge_script(&app)?;

    let mut child = Command::new(find_node_binary())
        .arg(script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "local_provider_node_spawn_failed".to_string())?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&body)
            .map_err(|_| "local_provider_stdin_failed".to_string())?;
    }

    let output = child
        .wait_with_output()
        .map_err(|_| "local_provider_wait_failed".to_string())?;
    if output.stdout.len() > MAX_BRIDGE_OUTPUT_BYTES {
        return Err("local_provider_response_too_large".into());
    }
    let stdout = String::from_utf8(output.stdout)
        .map_err(|_| "local_provider_response_invalid_utf8".to_string())?;
    let parsed: Value = serde_json::from_str(stdout.trim())
        .map_err(|_| "local_provider_response_invalid_json".to_string())?;
    if !parsed.is_object() {
        return Err("local_provider_response_invalid".into());
    }
    serde_json::to_string(&parsed).map_err(|_| "local_provider_response_encode_failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn request_rejects_secret_fields_from_webview() {
        let raw = r#"{"operation":"inventory","credentials":{"openai":"secret"}}"#;
        assert!(serde_json::from_str::<LocalProviderBridgeRequest>(raw).is_err());
    }

    #[test]
    fn provider_ids_are_canonical() {
        assert_eq!(canonical_provider("openai").unwrap(), "openai");
        assert_eq!(canonical_provider("xai").unwrap(), "xai");
        assert!(canonical_provider("grok").is_err());
        assert!(canonical_provider("other").is_err());
    }
}
