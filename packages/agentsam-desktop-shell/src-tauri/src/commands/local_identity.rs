use base64::Engine;
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
    let parsed =
        reqwest::Url::parse(origin).map_err(|_| "identity_service_origin_invalid".to_string())?;
    let is_loopback = matches!(
        parsed.host_str(),
        Some("127.0.0.1") | Some("localhost") | Some("::1")
    );
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
    body_base64: Option<String>,
    #[serde(default)]
    content_type: Option<String>,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    body_base64: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    headers: Vec<(String, String)>,
}

fn studio_service_route(request: &StudioServiceBridgeRequest) -> Result<(Method, String), String> {
    match request.operation.trim() {
        "api" => {
            // The WebView uses the same application API paths as the web host.
            // Native only transports the authenticated request to the configured
            // AgentSam service; the Worker remains authoritative for routing,
            // permissions, application behavior, and data ownership.
            if request.account_id.is_some() {
                return Err("studio_service_api_account_override_forbidden".into());
            }
            if request.body.is_some() {
                return Err("studio_service_api_body_invalid".into());
            }
            let path = request.path.as_deref().unwrap_or("");
            let raw_path = path.split('?').next().unwrap_or("");
            let lower_path = raw_path.to_ascii_lowercase();
            let parsed = reqwest::Url::parse(&format!("https://console.invalid{path}"))
                .map_err(|_| "studio_service_api_path_invalid")?;
            let traversal = raw_path.split('/').any(|part| part == "." || part == "..")
                || lower_path.contains("%2e")
                || lower_path.contains("%2f")
                || lower_path.contains("%5c");
            if !path.starts_with("/api/")
                || !parsed.path().starts_with("/api/")
                || parsed.host_str() != Some("console.invalid")
                || parsed.fragment().is_some()
                || traversal
                || raw_path.contains("://")
                || raw_path.contains('\\')
                || path.chars().any(char::is_control)
            {
                return Err("studio_service_api_path_invalid".into());
            }
            let method = match request
                .method
                .as_deref()
                .unwrap_or("GET")
                .to_ascii_uppercase()
                .as_str()
            {
                "GET" => Method::GET,
                "HEAD" => Method::HEAD,
                "POST" => Method::POST,
                "PUT" => Method::PUT,
                "PATCH" => Method::PATCH,
                "DELETE" => Method::DELETE,
                _ => return Err("studio_service_api_method_invalid".into()),
            };
            if (method == Method::GET || method == Method::HEAD) && request.body_base64.is_some() {
                return Err("studio_service_api_body_invalid".into());
            }
            Ok((method, path.to_string()))
        }
        "chat" => {
            if request.account_id.is_some() {
                return Err("studio_service_chat_account_override_forbidden".into());
            }
            if request
                .path
                .as_deref()
                .is_some_and(|path| path != "/api/chat")
            {
                return Err("studio_service_chat_path_invalid".into());
            }
            if request
                .method
                .as_deref()
                .is_some_and(|method| !method.eq_ignore_ascii_case("POST"))
            {
                return Err("studio_service_chat_method_invalid".into());
            }
            if request.body.is_none() || request.body_base64.is_some() {
                return Err("studio_service_chat_body_invalid".into());
            }
            Ok((Method::POST, "/api/chat".to_string()))
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
        return Err(format!(
            "vault_sync_service_error:{}:{error}",
            status.as_u16()
        ));
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

fn parse_studio_service_api_options(
    request_value: &Value,
    operation: &str,
) -> Result<
    (
        bool,
        Vec<(reqwest::header::HeaderName, reqwest::header::HeaderValue)>,
    ),
    String,
> {
    let skip_auth = match request_value.get("skip_auth") {
        None => false,
        Some(Value::Bool(value)) => *value,
        Some(_) => return Err("studio_service_api_options_invalid".into()),
    };
    if skip_auth && operation != "api" {
        return Err("studio_service_api_options_invalid".into());
    }

    let Some(headers_value) = request_value.get("headers") else {
        return Ok((skip_auth, Vec::new()));
    };
    if headers_value.is_null() {
        return Ok((skip_auth, Vec::new()));
    }
    let headers = headers_value
        .as_array()
        .ok_or_else(|| "studio_service_api_headers_invalid".to_string())?;
    if operation != "api" && !headers.is_empty() {
        return Err("studio_service_api_headers_invalid".into());
    }
    if headers.len() > 32 {
        return Err("studio_service_api_headers_invalid".into());
    }

    let mut forwarded = Vec::with_capacity(headers.len());
    for entry in headers {
        let pair = entry
            .as_array()
            .filter(|pair| pair.len() == 2)
            .ok_or_else(|| "studio_service_api_headers_invalid".to_string())?;
        let name = pair[0]
            .as_str()
            .ok_or_else(|| "studio_service_api_headers_invalid".to_string())?
            .trim()
            .to_ascii_lowercase();
        let value = pair[1]
            .as_str()
            .ok_or_else(|| "studio_service_api_headers_invalid".to_string())?;
        if name.is_empty()
            || name.len() > 128
            || value.len() > 8192
            || value.chars().any(char::is_control)
        {
            return Err("studio_service_api_headers_invalid".into());
        }
        if name == "content-type" {
            // Content-Type is separately validated and forwarded from content_type.
            continue;
        }
        let forbidden = matches!(
            name.as_str(),
            "cookie"
                | "cookie2"
                | "host"
                | "origin"
                | "referer"
                | "content-length"
                | "connection"
                | "transfer-encoding"
                | "upgrade"
                | "proxy-authorization"
                | "proxy-authenticate"
                | "te"
                | "trailer"
                | "keep-alive"
                | "x-user-id"
                | "x-account-id"
                | "x-tenant-id"
                | "x-agentsam-native-client"
                | "x-forwarded-for"
                | "x-forwarded-host"
                | "x-forwarded-proto"
                | "x-forwarded-port"
                | "x-original-url"
                | "x-rewrite-url"
        ) || name.starts_with("sec-")
            || name.starts_with("proxy-")
            || name.starts_with("access-control-")
            || name.starts_with("x-forwarded-")
            || (name == "authorization" && !skip_auth);
        if forbidden {
            return Err("studio_service_api_header_forbidden".into());
        }
        let header_name = reqwest::header::HeaderName::from_bytes(name.as_bytes())
            .map_err(|_| "studio_service_api_headers_invalid")?;
        let header_value = reqwest::header::HeaderValue::from_bytes(value.as_bytes())
            .map_err(|_| "studio_service_api_headers_invalid")?;
        forwarded.push((header_name, header_value));
    }

    Ok((skip_auth, forwarded))
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

    let request_value: Value = serde_json::from_str(request_json)
        .map_err(|e| format!("studio_service_request_invalid:{e}"))?;
    let request: StudioServiceBridgeRequest = serde_json::from_value(request_value.clone())
        .map_err(|e| format!("studio_service_request_invalid:{e}"))?;
    let (skip_auth, api_headers) =
        parse_studio_service_api_options(&request_value, request.operation.trim())?;
    let (method, path) = studio_service_route(&request)?;
    let url = format!("{origin}{path}");
    let has_accept = api_headers
        .iter()
        .any(|(name, _)| name == reqwest::header::ACCEPT);
    let mut builder = reqwest::Client::new()
        .request(method.clone(), url)
        .header("X-AgentSam-Native-Client", "1");
    if request.operation.trim() != "api" {
        builder = builder.header("accept", "application/json");
    } else if !has_accept {
        builder = builder.header("accept", "*/*");
    }
    for (name, value) in api_headers {
        builder = builder.header(name, value);
    }

    if !skip_auth {
        if let Some(session_id) = super::keychain::identity_session_get_internal(session_state)? {
            let session_id = session_id.trim();
            if !session_id.is_empty() {
                if session_id.len() > 2048
                    || session_id
                        .as_bytes()
                        .iter()
                        .any(|byte| *byte == 13 || *byte == 10)
                {
                    return Err("studio_service_session_invalid".into());
                }
                builder = builder.bearer_auth(session_id);
            }
        }
    }

    if request.operation.trim() == "api" {
        if let Some(encoded) = request.body_base64.as_deref() {
            let content_type = request.content_type.as_deref().unwrap_or("");
            if encoded.len() > 32 * 1024 * 1024
                || content_type.len() > 512
                || content_type.chars().any(char::is_control)
            {
                return Err("studio_service_api_body_invalid".into());
            }
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(encoded)
                .map_err(|_| "studio_service_api_body_invalid")?;
            if !content_type.is_empty() {
                builder = builder.header("content-type", content_type);
            }
            builder = builder.body(bytes);
        } else if let Some(content_type) = request.content_type.as_deref() {
            if content_type.len() > 512 || content_type.chars().any(char::is_control) {
                return Err("studio_service_api_body_invalid".into());
            }
            builder = builder.header("content-type", content_type);
        }
    } else if method != Method::GET && method != Method::HEAD {
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
    let headers = response
        .headers()
        .iter()
        .filter_map(|(name, value)| {
            let name = name.as_str();
            if matches!(
                name,
                "content-type"
                    | "content-disposition"
                    | "content-length"
                    | "cache-control"
                    | "etag"
                    | "last-modified"
                    | "content-range"
                    | "accept-ranges"
                    | "retry-after"
                    | "vary"
            ) {
                value
                    .to_str()
                    .ok()
                    .map(|value| (name.to_string(), value.to_string()))
            } else {
                None
            }
        })
        .collect::<Vec<_>>();
    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("studio_service_response_read_failed:{e}"))?;
    let text_response = content_type.starts_with("text/")
        || content_type.contains("json")
        || content_type.contains("xml")
        || content_type.contains("javascript")
        || content_type.contains("svg+xml")
        || std::str::from_utf8(&bytes).is_ok();
    let (body, body_base64) = if text_response {
        (String::from_utf8_lossy(&bytes).into_owned(), None)
    } else {
        (
            String::new(),
            Some(base64::engine::general_purpose::STANDARD.encode(&bytes)),
        )
    };

    serde_json::to_string(&StudioServiceBridgeResponse {
        ok: status.is_success(),
        status: status.as_u16(),
        content_type,
        body,
        body_base64,
        headers,
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

    let mut request: Value =
        serde_json::from_str(request_json).map_err(|e| format!("identity_request_invalid:{e}"))?;
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
        return serde_json::to_string(&value)
            .map_err(|e| format!("identity_response_encode_failed:{e}"));
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
    let exe =
        std::env::current_exe().map_err(|e| format!("packaged_node_executable_unavailable:{e}"))?;
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

/// The renderer supplies only an app ID and intent. Package identity is resolved
/// from the authenticated account catalog, not caller-controlled download URLs.
#[tauri::command]
pub async fn desktop_app_package(
    app: AppHandle,
    webview: tauri::Webview,
    session_state: State<'_, super::keychain::IdentitySessionState>,
    key: String,
    action: String,
) -> Result<Value, String> {
    if !matches!(webview.label(), "main") && !webview.label().starts_with("studio-") {
        return Err("app_package_host_only".into());
    }
    let origin = webview.url().map_err(|_| "app_package_host_origin_unavailable")?;
    if !((origin.scheme() == "tauri" && origin.host_str() == Some("localhost")) ||
        (matches!(origin.scheme(), "http" | "https") && origin.host_str() == Some("tauri.localhost"))) {
        return Err("app_package_host_origin_forbidden".into());
    }
    if !matches!(action.as_str(), "install" | "status" | "open") {
        return Err("app_package_action_invalid".into());
    }
    let config = load_runtime_config(&app)?;
    if config.authority != "service" { return Err("app_package_account_required".into()); }
    let raw = service_studio_bridge(&config, &session_state, &json!({
        "operation":"apps", "path":"/api/apps/launcher", "method":"GET"
    }).to_string()).await?;
    let response: Value = serde_json::from_str(&raw).map_err(|_| "app_package_catalog_invalid")?;
    if response["ok"] != true { return Err("app_package_catalog_unavailable".into()); }
    let catalog: Value = serde_json::from_str(response["body"].as_str().unwrap_or("")).map_err(|_| "app_package_catalog_invalid")?;
    let account = catalog["account_id"].as_str().filter(|v| !v.is_empty()).ok_or("app_package_account_required")?;
    let row = catalog["apps"].as_array().and_then(|rows| rows.iter().find(|row| row["key"].as_str() == Some(key.as_str()))).ok_or("app_package_not_in_catalog")?;
    if row["delivery"]["kind"] != "npm-static" || row["installable"] != true { return Err("app_package_delivery_unavailable".into()); }
    if action == "open" && (row["installed"] != true || row["enabled"] != true) { return Err("app_package_account_not_enabled".into()); }
    let package = row["delivery"]["package"].as_str().ok_or("app_package_identity_missing")?;
    use sha2::{Digest, Sha256};
    let scope = format!("{:x}", Sha256::digest(account.as_bytes()));
    let token = super::agentsamd::agentsamd_pairing_token()?;
    let result = reqwest::Client::new().post("http://127.0.0.1:18765/v1/apps/package")
        .header("X-Agentsamd-Token", token)
        .json(&json!({"action":action,"id":key,"package":package,"scope":scope}))
        .timeout(std::time::Duration::from_secs(210)).send().await.map_err(|e| format!("app_package_device_unavailable:{e}"))?;
    let status = result.status();
    let payload: Value = result.json().await.map_err(|_| "app_package_device_response_invalid")?;
    if !status.is_success() || payload["ok"] != true { return Err(format!("app_package_failed:{}", payload["error"].as_str().unwrap_or("unknown"))); }
    Ok(payload)
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
    fn generic_api_transport_preserves_safe_headers_and_credential_mode() {
        let value = json!({
            "headers": [
                ["If-Match", "\"rev-7\""],
                ["Accept", "application/json"],
                ["x-agentsam-workspace-capability", "cap_scoped_123"]
            ]
        });
        let (skip_auth, headers) = parse_studio_service_api_options(&value, "api").unwrap();
        assert!(!skip_auth);
        assert!(headers.iter().any(|(name, value)| {
            name.as_str() == "if-match" && value.to_str().ok() == Some("\"rev-7\"")
        }));
        assert!(headers.iter().any(|(name, value)| {
            name.as_str() == "accept" && value.to_str().ok() == Some("application/json")
        }));
        assert!(headers.iter().any(|(name, value)| {
            name.as_str() == "x-agentsam-workspace-capability"
                && value.to_str().ok() == Some("cap_scoped_123")
        }));

        let omitted = json!({"skip_auth": true});
        assert!(parse_studio_service_api_options(&omitted, "api").unwrap().0);
        assert!(parse_studio_service_api_options(&omitted, "work").is_err());
    }

    #[test]
    fn generic_api_transport_rejects_identity_and_hop_by_hop_headers() {
        for name in [
            "Authorization",
            "Cookie",
            "X-User-Id",
            "X-Account-Id",
            "X-AgentSam-Native-Client",
            "Host",
        ] {
            let value = json!({"headers": [[name, "not-allowed"]]});
            assert!(
                parse_studio_service_api_options(&value, "api").is_err(),
                "{name}"
            );
        }
        let auth_without_session = json!({
            "headers": [["Authorization", "Bearer explicit"]],
            "skip_auth": false
        });
        assert!(parse_studio_service_api_options(&auth_without_session, "api").is_err());

        let explicit_auth_without_cookie_session = json!({
            "headers": [["Authorization", "Bearer explicit"]],
            "skip_auth": true
        });
        assert!(
            parse_studio_service_api_options(&explicit_auth_without_cookie_session, "api").is_ok()
        );

        let invalid_value = json!({"headers": [["If-Match", "bad\r\nX-User-Id: forged"]]});
        assert!(parse_studio_service_api_options(&invalid_value, "api").is_err());
    }

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
    fn generic_api_transport_accepts_same_origin_api_paths_without_app_route_allowlists() {
        for (path, method) in [
            ("/api/admin/store/online", "GET"),
            ("/api/admin/website-themes", "GET"),
            (
                "/api/admin/website-themes?return_to=https://themes.inneranimalmedia.com",
                "GET",
            ),
            ("/api/cms/sites", "GET"),
            ("/api/admin/cms/theme-projects", "GET"),
            ("/api/apps/launcher", "GET"),
            ("/api/apps/install", "POST"),
            ("/api/plugins/catalog", "GET"),
            ("/api/plugins/tools/execute", "POST"),
            ("/api/work/snapshot", "GET"),
            ("/api/work/ide/sources", "GET"),
            ("/api/connections/cloudflare/resources", "GET"),
            ("/api/settings/mcps", "GET"),
            ("/api/notifications", "GET"),
            ("/api/vault/secrets", "GET"),
            ("/api/llm/inventory", "GET"),
            ("/api/database/sources", "GET"),
            ("/api/example/write", "PATCH"),
            ("/api/example/upload", "POST"),
        ] {
            let request = StudioServiceBridgeRequest {
                operation: "api".into(),
                account_id: None,
                body: None,
                body_base64: None,
                content_type: None,
                path: Some(path.into()),
                method: Some(method.into()),
            };
            let (actual, target) = studio_service_route(&request).expect("same-origin API path");
            assert_eq!(actual.as_str(), method);
            assert_eq!(target, path);
        }
    }

    #[test]
    fn chat_service_bridge_is_limited_to_authenticated_chat_posts() {
        let valid = StudioServiceBridgeRequest {
            operation: "chat".into(),
            account_id: None,
            body: Some(json!({"messages": []})),
            body_base64: None,
            content_type: Some("application/json".into()),
            path: None,
            method: None,
        };
        assert_eq!(
            studio_service_route(&valid).unwrap(),
            (Method::POST, "/api/chat".into())
        );

        let invalid_path = StudioServiceBridgeRequest {
            operation: "chat".into(),
            account_id: None,
            body: Some(json!({"messages": []})),
            body_base64: None,
            content_type: Some("application/json".into()),
            path: Some("/api/admin/website-themes".into()),
            method: None,
        };
        assert!(studio_service_route(&invalid_path).is_err());

        let invalid_method = StudioServiceBridgeRequest {
            operation: "chat".into(),
            account_id: None,
            body: Some(json!({"messages": []})),
            body_base64: None,
            content_type: Some("application/json".into()),
            path: None,
            method: Some("GET".into()),
        };
        assert!(studio_service_route(&invalid_method).is_err());

        let forged_identity = StudioServiceBridgeRequest {
            operation: "chat".into(),
            account_id: Some("another-account".into()),
            body: Some(json!({"messages": []})),
            body_base64: None,
            content_type: Some("application/json".into()),
            path: None,
            method: None,
        };
        assert!(studio_service_route(&forged_identity).is_err());
    }

    #[test]
    fn generic_api_transport_rejects_non_api_paths_traversal_and_account_overrides() {
        for path in [
            "/admin",
            "//evil.example/api/admin",
            "https://evil.example/api/admin",
            "/api/../admin",
            "/api/%2e%2e/admin",
            "/api/%2f%2fevil.example/path",
            "/api/%5c%5cevil.example/path",
            "/api/example#fragment",
            "/api/example\\..\\vault",
        ] {
            let request = StudioServiceBridgeRequest {
                operation: "api".into(),
                account_id: None,
                body: None,
                body_base64: None,
                content_type: None,
                path: Some(path.into()),
                method: Some("GET".into()),
            };
            assert!(studio_service_route(&request).is_err(), "must deny {path}");
        }

        let forged = StudioServiceBridgeRequest {
            operation: "api".into(),
            account_id: Some("another-account".into()),
            body: None,
            body_base64: None,
            content_type: None,
            path: Some("/api/apps/launcher".into()),
            method: Some("GET".into()),
        };
        assert_eq!(
            studio_service_route(&forged).unwrap_err(),
            "studio_service_api_account_override_forbidden"
        );

        let mut bad_method = forged;
        bad_method.account_id = None;
        bad_method.method = Some("TRACE".into());
        assert_eq!(
            studio_service_route(&bad_method).unwrap_err(),
            "studio_service_api_method_invalid"
        );

        let mut get_with_body = bad_method;
        get_with_body.method = Some("GET".into());
        get_with_body.body_base64 = Some("e30=".into());
        assert_eq!(
            studio_service_route(&get_with_body).unwrap_err(),
            "studio_service_api_body_invalid"
        );
    }
}
