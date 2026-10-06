use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

#[cfg(not(any(target_os = "ios", target_os = "android")))]
use std::io::Write;
#[cfg(not(any(target_os = "ios", target_os = "android")))]
use std::process::{Command, Stdio};

#[derive(Debug, Deserialize)]
struct IdentityRuntimeConfig {
    #[serde(default = "default_authority")]
    authority: String,
    #[serde(default)]
    service_origin: Option<String>,
}

fn default_authority() -> String {
    "service".into()
}

fn load_runtime_config(app: &AppHandle) -> Result<IdentityRuntimeConfig, String> {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|e| format!("identity_runtime_resource_dir_unavailable:{e}"))?;
    let path = resources.join("runtime/identity/runtime.json");
    if !path.is_file() {
        return Err("identity_runtime_config_missing".into());
    }
    let raw = std::fs::read_to_string(&path)
        .map_err(|e| format!("identity_runtime_config_read_failed:{e}"))?;
    let mut config = serde_json::from_str::<IdentityRuntimeConfig>(&raw)
        .map_err(|e| format!("identity_runtime_config_invalid:{e}"))?;

    config.authority = config.authority.trim().to_lowercase();
    config.service_origin = config
        .service_origin
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());
    Ok(config)
}

#[tauri::command]
pub fn identity_runtime_config(app: AppHandle) -> Result<Value, String> {
    let config = load_runtime_config(&app)?;
    if config.authority == "service" {
        let origin = config
            .service_origin
            .as_deref()
            .ok_or_else(|| "identity_service_not_configured".to_string())?;
        validate_service_origin(origin)?;
    }
    Ok(json!({
        "authority": config.authority,
        "service_origin": config.service_origin,
    }))
}

fn validate_service_origin(origin: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(origin).map_err(|_| "identity_service_origin_invalid".to_string())?;
    let is_loopback = matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost") | Some("::1"));
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && is_loopback) {
        return Err("identity_service_origin_requires_https".into());
    }
    Ok(())
}


#[derive(Debug, Deserialize)]
struct StudioServiceBridgeRequest {
    operation: String,
    #[serde(default)]
    account_id: Option<String>,
    #[serde(default)]
    body: Option<Value>,
    #[serde(default)]
    path: Option<String>,
    #[serde(default)]
    method: Option<String>,
}

#[derive(Debug, Serialize)]
struct StudioServiceBridgeResponse {
    ok: bool,
    status: u16,
    content_type: String,
    body: String,
}

fn studio_service_route(request: &StudioServiceBridgeRequest) -> Result<(Method, String), String> {
    match request.operation.trim() {
        "inventory" => Ok((Method::GET, "/api/llm/inventory".to_string())),
        "chat" => Ok((Method::POST, "/api/chat".to_string())),
        "vault" => {
            let path = request.path.as_deref().unwrap_or("").trim();
            if !(path == "/api/vault/secrets"
                || path.starts_with("/api/vault/secrets/")
                || path == "/api/vault/credentials"
                || path.starts_with("/api/vault/credentials/"))
                || path.contains("://")
                || path.contains('\\')
                || path.as_bytes().iter().any(|byte| *byte == 13 || *byte == 10)
            {
                return Err("studio_service_vault_path_invalid".into());
            }
            let method = match request.method.as_deref().unwrap_or("GET").to_ascii_uppercase().as_str() {
                "GET" => Method::GET,
                "POST" => Method::POST,
                "DELETE" => Method::DELETE,
                _ => return Err("studio_service_vault_method_invalid".into()),
            };
            Ok((method, path.to_string()))
        }
        "connections" => {
            let path = request.path.as_deref().unwrap_or("").trim();
            if !(path == "/api/connections" || path.starts_with("/api/connections/"))
                || path.contains("://")
                || path.contains('\\')
                || path.as_bytes().iter().any(|byte| *byte == 13 || *byte == 10)
            {
                return Err("studio_service_connections_path_invalid".into());
            }
            let method = match request.method.as_deref().unwrap_or("GET").to_ascii_uppercase().as_str() {
                "GET" => Method::GET,
                "POST" => Method::POST,
                "DELETE" => Method::DELETE,
                _ => return Err("studio_service_connections_method_invalid".into()),
            };
            Ok((method, path.to_string()))
        }
        "plugins" => {
            let path = request.path.as_deref().unwrap_or("").trim();
            if path.contains("://")
                || path.contains('\\')
                || path.as_bytes().iter().any(|byte| *byte == 13 || *byte == 10)
            {
                return Err("studio_service_plugins_path_invalid".into());
            }

            // Catalog/install routes are exact and remain Worker-authenticated.
            // Never pass a caller-supplied absolute URL through this bridge.
            match path {
                "/api/plugins/catalog" => {
                    if request.method.as_deref().unwrap_or("GET").to_ascii_uppercase() != "GET" {
                        return Err("studio_service_plugins_method_invalid".into());
                    }
                    return Ok((Method::GET, path.to_string()));
                }
                "/api/plugins/install" => {
                    if request.method.as_deref().unwrap_or("POST").to_ascii_uppercase() != "POST" {
                        return Err("studio_service_plugins_method_invalid".into());
                    }
                    return Ok((Method::POST, path.to_string()));
                }
                _ => {}
            }

            if path == "/api/plugins/tools/execute" {
                if request.method.as_deref().unwrap_or("POST").to_ascii_uppercase() != "POST" {
                    return Err("studio_service_plugins_method_invalid".into());
                }
                return Ok((Method::POST, path.to_string()));
            }

            if let Some(remainder) = path.strip_prefix("/api/plugins/") {
                if let Some((plugin_id, action)) = remainder.split_once("/oauth/") {
                    let valid_id = plugin_id.starts_with("plg_")
                        && plugin_id.chars().all(|value| value.is_ascii_alphanumeric() || value == '_');
                    if !valid_id || !matches!(action, "start" | "disconnect")
                        || request.method.as_deref().unwrap_or("POST").to_ascii_uppercase() != "POST" {
                        return Err("studio_service_plugins_path_invalid".into());
                    }
                    return Ok((Method::POST, path.to_string()));
                }
            }

            let plugin_id = path.strip_prefix("/api/plugins/").unwrap_or("");
            let valid_plugin_id = plugin_id.starts_with("plg_")
                && !plugin_id.contains('/')
                && plugin_id
                    .chars()
                    .all(|value| value.is_ascii_alphanumeric() || value == '_');
            if !valid_plugin_id {
                return Err("studio_service_plugins_path_invalid".into());
            }
            let method = match request.method.as_deref().unwrap_or("PATCH").to_ascii_uppercase().as_str() {
                "PATCH" => Method::PATCH,
                "DELETE" => Method::DELETE,
                _ => return Err("studio_service_plugins_method_invalid".into()),
            };
            Ok((method, path.to_string()))
        }
        "database" => {
            let path = request.path.as_deref().unwrap_or("").trim();
            if !path.starts_with("/api/database/")
                || path.contains("://")
                || path.contains('\\')
                || path.as_bytes().iter().any(|byte| *byte == 13 || *byte == 10)
            {
                return Err("studio_service_database_path_invalid".into());
            }
            let method = match request.method.as_deref().unwrap_or("GET").to_ascii_uppercase().as_str() {
                "GET" => Method::GET,
                "POST" => Method::POST,
                "PATCH" => Method::PATCH,
                "DELETE" => Method::DELETE,
                _ => return Err("studio_service_database_method_invalid".into()),
            };
            Ok((method, path.to_string()))
        }
        "cms" => {
            let path = request.path.as_deref().unwrap_or("").trim();
            if !path.starts_with("/api/cms/")
                || path.contains("://")
                || path.contains('\\')
                || path.as_bytes().iter().any(|byte| *byte == 13 || *byte == 10)
            {
                return Err("studio_service_cms_path_invalid".into());
            }
            let method = match request.method.as_deref().unwrap_or("GET").to_ascii_uppercase().as_str() {
                "GET" => Method::GET,
                "POST" => Method::POST,
                "PUT" => Method::PUT,
                "PATCH" => Method::PATCH,
                "DELETE" => Method::DELETE,
                _ => return Err("studio_service_cms_method_invalid".into()),
            };
            Ok((method, path.to_string()))
        }
        _ => Err("unsupported_studio_service_operation".into()),
    }
}

const PROVIDER_SYNC_SECRET_NAME: &str = "AgentSam synced";

fn canonical_sync_provider(provider: &str) -> Result<&'static str, String> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "openai" => Ok("openai"),
        "anthropic" => Ok("anthropic"),
        "gemini" | "google" => Ok("gemini"),
        "cursor" => Ok("cursor"),
        "xai" | "grok" => Ok("xai"),
        "cloudflare" => Ok("cloudflare"),
        _ => Err("provider_key_provider_invalid".into()),
    }
}

async fn native_vault_session_request(
    config: &IdentityRuntimeConfig,
    session_state: &super::keychain::IdentitySessionState,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<Value, String> {
    if config.authority != "service" {
        return Err("vault_sync_requires_connected_authority".into());
    }
    let origin = config
        .service_origin
        .as_deref()
        .ok_or_else(|| "identity_service_not_configured".to_string())?;
    validate_service_origin(origin)?;

    let session_id = super::keychain::identity_session_get_internal(session_state)?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "vault_sync_requires_identity_session".to_string())?;
    if session_id.len() > 2048
        || session_id
            .as_bytes()
            .iter()
            .any(|byte| *byte == 13 || *byte == 10)
    {
        return Err("studio_service_session_invalid".into());
    }

    let url = format!("{origin}{path}");
    let mut builder = reqwest::Client::new()
        .request(method.clone(), url)
        .header("accept", "application/json")
        .header("X-AgentSam-Native-Client", "1")
        .bearer_auth(session_id);

    if method != Method::GET {
        builder = builder.json(&body.unwrap_or_else(|| json!({})));
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("vault_sync_service_request_failed:{e}"))?;
    let status = response.status();
    let raw = response.text().await.unwrap_or_default();
    let data = if raw.trim().is_empty() {
        json!({})
    } else {
        serde_json::from_str::<Value>(&raw)
            .map_err(|_| format!("vault_sync_service_response_invalid:{}", status.as_u16()))?
    };

    if !status.is_success() {
        let error = data
            .get("error")
            .and_then(Value::as_str)
            .unwrap_or("request_failed");
        return Err(format!("vault_sync_service_error:{}:{error}", status.as_u16()));
    }
    Ok(data)
}

#[tauri::command]
pub async fn provider_key_sync_to_account(
    app: AppHandle,
    session_state: State<'_, super::keychain::IdentitySessionState>,
    provider: String,
) -> Result<Value, String> {
    let provider = canonical_sync_provider(provider.as_str())?;
    let value = super::keychain::provider_key_get_internal(provider)?
        .ok_or_else(|| "provider_key_not_stored".to_string())?;
    let config = load_runtime_config(&app)?;
    let data = native_vault_session_request(
        &config,
        &session_state,
        Method::POST,
        "/api/vault/secrets",
        Some(json!({
            "service_name": provider,
            "secret_name": PROVIDER_SYNC_SECRET_NAME,
            "secret_type": "api_key",
            "value": value,
            "description": "Synchronized with AgentSam Local Studio",
        })),
    )
    .await?;

    let secret_id = data
        .get("vault_item_id")
        .or_else(|| data.get("id"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "vault_sync_secret_id_missing".to_string())?;
    let last4 = data.get("last4").and_then(Value::as_str);
    super::keychain::provider_sync_marker_set_internal(provider, secret_id, last4)?;

    Ok(json!({
        "ok": true,
        "provider": provider,
        "direction": "device_to_account",
        "secret_id": secret_id,
        "last4": last4,
    }))
}

#[tauri::command]
pub async fn provider_key_sync_from_account(
    app: AppHandle,
    session_state: State<'_, super::keychain::IdentitySessionState>,
    provider: String,
    secret_id: String,
) -> Result<Value, String> {
    let provider = canonical_sync_provider(provider.as_str())?;
    let secret_id = secret_id.trim();
    if secret_id.is_empty() || secret_id.len() > 256 {
        return Err("vault_sync_secret_id_invalid".into());
    }

    let config = load_runtime_config(&app)?;
    let data = native_vault_session_request(
        &config,
        &session_state,
        Method::POST,
        "/api/vault/unwrap",
        Some(json!({ "id": secret_id })),
    )
    .await?;

    let service = data
        .get("service")
        .and_then(Value::as_str)
        .ok_or_else(|| "vault_sync_service_missing".to_string())?;
    if canonical_sync_provider(service)? != provider {
        return Err("vault_sync_provider_mismatch".into());
    }
    let value = data
        .get("value")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "vault_sync_value_missing".to_string())?;
    let last4 = data.get("last4").and_then(Value::as_str);
    super::keychain::provider_key_set_synced_internal(provider, value, secret_id, last4)?;

    Ok(json!({
        "ok": true,
        "provider": provider,
        "direction": "account_to_device",
        "secret_id": secret_id,
        "last4": last4,
    }))
}

async fn service_studio_bridge(
    config: &IdentityRuntimeConfig,
    session_state: &super::keychain::IdentitySessionState,
    request_json: &str,
) -> Result<String, String> {
    let origin = config
        .service_origin
        .as_deref()
        .ok_or_else(|| "identity_service_not_configured".to_string())?;
    validate_service_origin(origin)?;

    let request: StudioServiceBridgeRequest = serde_json::from_str(request_json)
        .map_err(|e| format!("studio_service_request_invalid:{e}"))?;
    let (method, path) = studio_service_route(&request)?;
    let url = format!("{origin}{path}");
    let mut builder = reqwest::Client::new()
        .request(method.clone(), url)
        .header("accept", "application/json")
        .header("X-AgentSam-Native-Client", "1");

    if request.operation.trim() == "connections"
        && request.path.as_deref().unwrap_or("").split('?').next().unwrap_or("").ends_with("/start")
    {
        builder = builder.header("X-Agentsam-Oauth", "json");
    }

    if let Some(account_id) = request.account_id {
        let account_id = account_id.trim();
        if !account_id.is_empty() {
            if account_id.len() > 256 || account_id.as_bytes().iter().any(|byte| *byte == 13 || *byte == 10) {
                return Err("studio_service_account_id_invalid".into());
            }
            builder = builder.header("X-User-Id", account_id);
        }
    }

    if let Some(session_id) = super::keychain::identity_session_get_internal(session_state)? {
        let session_id = session_id.trim();
        if !session_id.is_empty() {
            if session_id.len() > 2048 || session_id.as_bytes().iter().any(|byte| *byte == 13 || *byte == 10) {
                return Err("studio_service_session_invalid".into());
            }
            builder = builder.bearer_auth(session_id);
        }
    }

    if method != Method::GET {
        builder = builder.json(&request.body.unwrap_or_else(|| json!({})));
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("studio_service_request_failed:{e}"))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response.text().await.unwrap_or_default();

    serde_json::to_string(&StudioServiceBridgeResponse {
        ok: status.is_success(),
        status: status.as_u16(),
        content_type,
        body,
    })
    .map_err(|e| format!("studio_service_response_encode_failed:{e}"))
}

fn identity_service_route(op: &str) -> Result<(Method, &'static str, bool), String> {
    match op {
        "login" => Ok((Method::POST, "/api/auth/login", true)),
        "signup" => Ok((Method::POST, "/api/auth/signup", true)),
        "status" => Ok((Method::GET, "/api/auth/me", false)),
        "logout" => Ok((Method::POST, "/api/auth/logout", false)),
        "reset_request" => Ok((Method::POST, "/api/auth/password-reset/request", false)),
        "reset_confirm" => Ok((Method::POST, "/api/auth/password-reset/confirm", false)),
        "native_exchange" => Ok((Method::POST, "/api/oauth/native/exchange", false)),
        _ => Err("unsupported_identity_operation".into()),
    }
}

async fn service_identity_bridge(
    config: &IdentityRuntimeConfig,
    session_state: &super::keychain::IdentitySessionState,
    request_json: &str,
) -> Result<String, String> {
    let origin = config
        .service_origin
        .as_deref()
        .ok_or_else(|| "identity_service_not_configured".to_string())?;
    validate_service_origin(origin)?;

    let mut request: Value = serde_json::from_str(request_json)
        .map_err(|e| format!("identity_request_invalid:{e}"))?;
    let op = request
        .get("op")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let stored_session = if matches!(op.as_str(), "status" | "logout") {
        super::keychain::identity_session_get_internal(session_state)?
    } else {
        None
    };

    let (method, path, native_session) = identity_service_route(op.as_str())?;

    if let Value::Object(ref mut map) = request {
        map.remove("op");
        map.remove("session_id");
    }

    let url = format!("{origin}{path}");
    let client = reqwest::Client::new();
    let mut builder = client.request(method.clone(), url);
    if native_session {
        builder = builder.header("X-AgentSam-Native-Client", "1");
    }
    if let Some(session_id) = stored_session.as_deref() {
        builder = builder.bearer_auth(session_id);
    }
    if method != Method::GET {
        builder = builder.json(&request);
    }

    let response = builder
        .send()
        .await
        .map_err(|e| format!("identity_service_request_failed:{e}"))?;
    let status = response.status();
    let body = response.text().await.unwrap_or_default();

    if status.is_success() && matches!(op.as_str(), "login" | "signup" | "native_exchange") {
        let mut value: Value = serde_json::from_str(&body)
            .map_err(|_| "identity_session_response_invalid".to_string())?;
        let session_id = value
            .get("session_id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| "identity_session_missing".to_string())?;
        super::keychain::identity_session_set_internal(session_state, session_id)?;
        if let Value::Object(ref mut map) = value {
            map.remove("session_id");
        }
        return serde_json::to_string(&value).map_err(|e| format!("identity_response_encode_failed:{e}"));
    }

    if op == "logout" {
        super::keychain::identity_session_delete_internal(session_state)?;
    } else if op == "status" && status.as_u16() == 401 {
        let _ = super::keychain::identity_session_delete_internal(session_state);
    }

    if !body.trim().is_empty() {
        return Ok(body);
    }
    Ok(json!({
        "ok": status.is_success(),
        "status": status.as_u16(),
    })
    .to_string())
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn find_bridge_script(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(resources) = app.path().resource_dir() {
        let packaged = resources.join("runtime/identity/scripts/local-identity-bridge.mjs");
        if packaged.is_file() {
            return Ok(packaged);
        }
    }
    Err("local_identity_bridge_script_not_found".into())
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn find_manifest(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(resources) = app.path().resource_dir() {
        let packaged = resources.join("runtime/identity/app.json");
        if packaged.is_file() {
            return Ok(packaged);
        }
    }
    Err("local_identity_app_manifest_not_found".into())
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn node_binary(_app: &AppHandle) -> Result<PathBuf, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("packaged_node_executable_unavailable:{e}"))?;
    let dir = exe
        .parent()
        .ok_or_else(|| "packaged_node_directory_unavailable".to_string())?;
    let candidate = dir.join(if cfg!(windows) { "node.exe" } else { "node" });
    if !candidate.is_file() {
        return Err("packaged_node_runtime_missing".into());
    }
    Ok(candidate)
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
async fn run_local_identity(app: AppHandle, request_json: String) -> Result<String, String> {
    let script = find_bridge_script(&app)?;
    let manifest = find_manifest(&app)?;
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
    let db_path = app_data.join("identity.sqlite");

    let mut command = Command::new(node_binary(&app)?);
    command
        .arg(&script)
        .arg("--db")
        .arg(&db_path)
        .arg("--manifest")
        .arg(&manifest)
        .current_dir(&app_data)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("identity_node_spawn_failed:{e}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(request_json.as_bytes())
            .map_err(|e| format!("identity_stdin_write_failed:{e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("identity_node_wait_failed:{e}"))?;
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stdout.is_empty() {
        return Err(if stderr.is_empty() {
            format!("local_identity_bridge_failed:{}", output.status)
        } else {
            stderr
        });
    }
    Ok(stdout)
}

#[tauri::command]
pub async fn studio_service_bridge(
    app: AppHandle,
    session_state: State<'_, super::keychain::IdentitySessionState>,
    request_json: String,
) -> Result<String, String> {
    let config = load_runtime_config(&app)?;
    if config.authority != "service" {
        return Err("studio_service_requires_connected_authority".into());
    }
    service_studio_bridge(&config, &session_state, &request_json).await
}

#[tauri::command]
pub async fn identity_bridge(
    app: AppHandle,
    session_state: State<'_, super::keychain::IdentitySessionState>,
    request_json: String,
) -> Result<String, String> {
    let config = load_runtime_config(&app)?;
    match config.authority.as_str() {
        "service" => service_identity_bridge(&config, &session_state, &request_json).await,
        "standalone" => {
            #[cfg(not(any(target_os = "ios", target_os = "android")))]
            {
                run_local_identity(app, request_json).await
            }
            #[cfg(any(target_os = "ios", target_os = "android"))]
            {
                Err("standalone_identity_requires_mobile_native_adapter".into())
            }
        }
        _ => Err("identity_authority_invalid".into()),
    }
}

#[tauri::command]
pub async fn local_identity_bridge(app: AppHandle, request_json: String) -> Result<String, String> {
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        return run_local_identity(app, request_json).await;
    }
    #[cfg(any(target_os = "ios", target_os = "android"))]
    {
        let _ = app;
        let _ = request_json;
        Err("standalone_identity_requires_mobile_native_adapter".into())
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn native_exchange_uses_canonical_identity_handoff_route() {
        let (method, path, native_session) =
            identity_service_route("native_exchange").expect("native exchange route");
        assert_eq!(method, Method::POST);
        assert_eq!(path, "/api/oauth/native/exchange");
        assert!(!native_session);
    }

    #[test]
    fn unknown_identity_operation_fails_closed() {
        assert_eq!(
            identity_service_route("desktop_magic").unwrap_err(),
            "unsupported_identity_operation"
        );
    }

    #[test]
    fn vault_sync_provider_aliases_are_canonical() {
        assert_eq!(canonical_sync_provider("openai").unwrap(), "openai");
        assert_eq!(canonical_sync_provider("google").unwrap(), "gemini");
        assert_eq!(canonical_sync_provider("grok").unwrap(), "xai");
        assert!(canonical_sync_provider("other").is_err());
    }

    #[test]
    fn plugin_bridge_accepts_bounded_catalog_install_and_remove() {
        for (path, method) in [
            ("/api/plugins/catalog", "GET"),
            ("/api/plugins/install", "POST"),
            ("/api/plugins/plg_test123", "DELETE"),
        ] {
            let request = StudioServiceBridgeRequest {
                operation: "plugins".into(),
                account_id: None,
                body: None,
                path: Some(path.into()),
                method: Some(method.into()),
            };
            assert_eq!(studio_service_route(&request).unwrap().0.as_str(), method);
        }
        let invalid = StudioServiceBridgeRequest {
            operation: "plugins".into(),
            account_id: None,
            body: None,
            path: Some("/api/plugins/install/https://localhost".into()),
            method: Some("POST".into()),
        };
        assert!(studio_service_route(&invalid).is_err());
    }

    #[test]
    fn plugin_bridge_allows_bounded_settings_patch_and_tool_execution() {
        let settings = StudioServiceBridgeRequest {
            operation: "plugins".into(),
            account_id: None,
            body: None,
            path: Some("/api/plugins/plg_test123".into()),
            method: Some("PATCH".into()),
        };
        let (method, path) = studio_service_route(&settings).expect("plugin settings route");
        assert_eq!(method, Method::PATCH);
        assert_eq!(path, "/api/plugins/plg_test123");

        let execute = StudioServiceBridgeRequest {
            operation: "plugins".into(),
            account_id: None,
            body: None,
            path: Some("/api/plugins/tools/execute".into()),
            method: Some("POST".into()),
        };
        let (method, path) = studio_service_route(&execute).expect("plugin execute route");
        assert_eq!(method, Method::POST);
        assert_eq!(path, "/api/plugins/tools/execute");

        let mut bad = settings;
        bad.path = Some("/api/plugins/plg_test123/../../vault".into());
        assert_eq!(
            studio_service_route(&bad).unwrap_err(),
            "studio_service_plugins_path_invalid"
        );
    }

    #[test]
    fn vault_bridge_is_strictly_scoped_to_vault_paths() {
        let request = StudioServiceBridgeRequest {
            operation: "vault".into(),
            account_id: None,
            body: None,
            path: Some("/api/vault/secrets/usec_test".into()),
            method: Some("DELETE".into()),
        };
        let (method, path) = studio_service_route(&request).expect("vault route");
        assert_eq!(method, Method::DELETE);
        assert_eq!(path, "/api/vault/secrets/usec_test");

        let mut bad = request;
        bad.path = Some("/api/database/query".into());
        assert_eq!(
            studio_service_route(&bad).unwrap_err(),
            "studio_service_vault_path_invalid"
        );

        bad.path = Some("/api/vault/unwrap".into());
        bad.method = Some("POST".into());
        assert_eq!(
            studio_service_route(&bad).unwrap_err(),
            "studio_service_vault_path_invalid"
        );
    }
}
