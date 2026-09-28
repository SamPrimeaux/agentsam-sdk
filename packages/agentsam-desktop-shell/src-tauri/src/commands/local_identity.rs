use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

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
    let env_authority = std::env::var("AGENTSAM_IDENTITY_AUTHORITY").ok();
    let env_origin = std::env::var("AGENTSAM_IDENTITY_SERVICE_ORIGIN").ok();

    let mut config = if let Ok(resources) = app.path().resource_dir() {
        let path = resources.join("runtime/identity/runtime.json");
        if path.is_file() {
            let raw = std::fs::read_to_string(&path)
                .map_err(|e| format!("identity_runtime_config_read_failed:{e}"))?;
            serde_json::from_str::<IdentityRuntimeConfig>(&raw)
                .map_err(|e| format!("identity_runtime_config_invalid:{e}"))?
        } else {
            IdentityRuntimeConfig {
                authority: default_authority(),
                service_origin: None,
            }
        }
    } else {
        IdentityRuntimeConfig {
            authority: default_authority(),
            service_origin: None,
        }
    };

    if let Some(authority) = env_authority {
        config.authority = authority;
    }
    if let Some(origin) = env_origin {
        config.service_origin = Some(origin);
    }
    config.authority = config.authority.trim().to_lowercase();
    config.service_origin = config
        .service_origin
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());
    Ok(config)
}

fn validate_service_origin(origin: &str) -> Result<(), String> {
    let parsed = reqwest::Url::parse(origin).map_err(|_| "identity_service_origin_invalid".to_string())?;
    let is_loopback = matches!(parsed.host_str(), Some("127.0.0.1") | Some("localhost") | Some("::1"));
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && is_loopback) {
        return Err("identity_service_origin_requires_https".into());
    }
    Ok(())
}

async fn service_identity_bridge(
    config: &IdentityRuntimeConfig,
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
    let session_id = request
        .get("session_id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .filter(|value| !value.is_empty());

    let (method, path, native_session) = match op.as_str() {
        "login" => (Method::POST, "/api/auth/login", true),
        "signup" => (Method::POST, "/api/auth/signup", true),
        "status" => (Method::GET, "/api/auth/me", false),
        "logout" => (Method::POST, "/api/auth/logout", false),
        "reset_request" => (Method::POST, "/api/auth/password-reset/request", false),
        "reset_confirm" => (Method::POST, "/api/auth/password-reset/confirm", false),
        _ => return Err("unsupported_identity_operation".into()),
    };

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
    if let Some(session_id) = session_id {
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
    if let Ok(p) = std::env::var("AGENTSAM_IDENTITY_BRIDGE") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        let packaged = resources.join("runtime/identity/scripts/local-identity-bridge.mjs");
        if packaged.is_file() {
            return Ok(packaged);
        }
    }
    let mut roots = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        roots.push(cwd.clone());
        if let Some(parent) = cwd.parent() {
            roots.push(parent.to_path_buf());
        }
    }
    for root in roots {
        let direct = root.join("packages/identity/scripts/local-identity-bridge.mjs");
        if direct.is_file() {
            return Ok(direct);
        }
    }
    Err("local_identity_bridge_script_not_found".into())
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn find_manifest(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(p) = std::env::var("AGENTSAM_IDENTITY_APP_MANIFEST") {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Ok(path);
        }
    }
    if let Ok(resources) = app.path().resource_dir() {
        let packaged = resources.join("runtime/identity/app.json");
        if packaged.is_file() {
            return Ok(packaged);
        }
    }
    let cwd = std::env::current_dir().map_err(|e| e.to_string())?;
    let path = cwd.join("apps/local-studio/agentsam.app.json");
    if path.is_file() {
        return Ok(path);
    }
    Err("local_identity_app_manifest_not_found".into())
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn node_binary(_app: &AppHandle) -> PathBuf {
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
    // Development fallback only; packaged desktop builds carry a node sidecar.
    [
        PathBuf::from("/opt/homebrew/bin/node"),
        PathBuf::from("/usr/local/bin/node"),
        PathBuf::from("/usr/bin/node"),
    ]
    .into_iter()
    .find(|path| path.is_file())
    .unwrap_or_else(|| PathBuf::from("node"))
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
async fn run_local_identity(app: AppHandle, request_json: String) -> Result<String, String> {
    let script = find_bridge_script(&app)?;
    let manifest = find_manifest(&app)?;
    let app_data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&app_data).map_err(|e| e.to_string())?;
    let db_path = app_data.join("identity.sqlite");

    let mut command = Command::new(node_binary(&app));
    command
        .arg(&script)
        .current_dir(&app_data)
        .env("AGENTSAM_IDENTITY_DB", &db_path)
        .env("AGENTSAM_IDENTITY_APP_MANIFEST", &manifest)
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
pub async fn identity_bridge(app: AppHandle, request_json: String) -> Result<String, String> {
    let config = load_runtime_config(&app)?;
    match config.authority.as_str() {
        "service" => service_identity_bridge(&config, &request_json).await,
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
