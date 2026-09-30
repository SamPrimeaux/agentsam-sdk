use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::time::{Duration, Instant};

const DEFAULT_SERVICE_ORIGIN: &str = "https://agentsam.inneranimalmedia.com";
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_IDENTITY_SCOPES: &str = "openid email profile";
const CALLBACK_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleDesktopIdentityRequest {
    pub service_origin: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PublicConfig {
    google_desktop_client_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDesktopIdentityUser {
    pub id: String,
    pub email: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoogleDesktopIdentityResult {
    pub ok: bool,
    pub authenticated: bool,
    pub session_id: String,
    pub expires_at: Option<serde_json::Value>,
    pub user: Option<GoogleDesktopIdentityUser>,
}

fn random_url_safe(nbytes: usize) -> String {
    let mut buf = vec![0u8; nbytes];
    rand::thread_rng().fill_bytes(&mut buf);
    URL_SAFE_NO_PAD.encode(buf)
}

fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hasher.finalize())
}

fn validated_origin(raw: Option<String>) -> Result<String, String> {
    let value = raw
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SERVICE_ORIGIN.to_string());
    let parsed = reqwest::Url::parse(value.trim()).map_err(|_| "identity_service_origin_invalid".to_string())?;
    let loopback = matches!(parsed.host_str(), Some("127.0.0.1" | "localhost" | "::1"));
    if parsed.scheme() != "https" && !(parsed.scheme() == "http" && loopback) {
        return Err("identity_service_origin_requires_https".into());
    }
    Ok(parsed.origin().ascii_serialization())
}

fn callback_params(listener: TcpListener, expected_state: String) -> Result<String, String> {
    listener
        .set_nonblocking(true)
        .map_err(|error| format!("loopback_listener_failed:{error}"))?;
    let deadline = Instant::now() + CALLBACK_TIMEOUT;
    let (mut stream, _) = loop {
        match listener.accept() {
            Ok(connection) => break connection,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    return Err("google_oauth_callback_timeout".into());
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(error) => return Err(format!("loopback_accept_failed:{error}")),
        }
    };
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));

    let mut buf = [0u8; 8192];
    let n = stream
        .read(&mut buf)
        .map_err(|error| format!("loopback_read_failed:{error}"))?;
    let request = String::from_utf8_lossy(&buf[..n]);
    let request_target = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .ok_or_else(|| "loopback_request_invalid".to_string())?;
    let callback = reqwest::Url::parse(&format!("http://127.0.0.1{request_target}"))
        .map_err(|_| "loopback_callback_invalid".to_string())?;

    let params: std::collections::HashMap<String, String> =
        callback.query_pairs().into_owned().collect();

    let error = params.get("error").cloned();
    let state = params.get("state").cloned().unwrap_or_default();
    let code = params.get("code").cloned().unwrap_or_default();

    let (heading, message) = if let Some(ref error) = error {
        ("Sign-in failed", format!("Google returned {error}. You can close this window and return to AgentSam."))
    } else {
        ("AgentSam", "Sign-in received. You can close this window and return to AgentSam.".to_string())
    };
    let body = format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{heading}</title></head><body style=\"font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:48px;background:#111318;color:#f5f7fb\"><h1>{heading}</h1><p>{message}</p></body></html>"
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\n\r\n{}",
        body.len(),
        body
    );
    let _ = stream.write_all(response.as_bytes());

    if let Some(error) = error {
        return Err(format!("google_oauth_error:{error}"));
    }
    if state != expected_state {
        return Err("google_oauth_state_mismatch".into());
    }
    if code.is_empty() {
        return Err("google_oauth_code_missing".into());
    }
    Ok(code)
}

#[tauri::command]
pub async fn google_desktop_identity_login(
    request: GoogleDesktopIdentityRequest,
) -> Result<GoogleDesktopIdentityResult, String> {
    let origin = validated_origin(request.service_origin)?;
    let client = reqwest::Client::new();

    let config: PublicConfig = client
        .get(format!("{origin}/api/public-config"))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|error| format!("public_config_request_failed:{error}"))?
        .error_for_status()
        .map_err(|error| format!("public_config_http_failed:{error}"))?
        .json()
        .await
        .map_err(|error| format!("public_config_json_failed:{error}"))?;

    let client_id = config
        .google_desktop_client_id
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "google_desktop_client_not_configured".to_string())?;

    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|error| format!("loopback_bind_failed:{error}"))?;
    let port = listener
        .local_addr()
        .map_err(|error| format!("loopback_addr_failed:{error}"))?
        .port();
    let redirect_uri = format!("http://127.0.0.1:{port}/callback");

    let state = random_url_safe(24);
    let verifier = random_url_safe(48);
    let challenge = pkce_challenge(&verifier);

    let mut auth_url = reqwest::Url::parse(GOOGLE_AUTH_URL)
        .map_err(|_| "google_authorize_url_invalid".to_string())?;
    auth_url
        .query_pairs_mut()
        .append_pair("client_id", &client_id)
        .append_pair("redirect_uri", &redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", GOOGLE_IDENTITY_SCOPES)
        .append_pair("state", &state)
        .append_pair("code_challenge", &challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("prompt", "select_account");

    super::system::open_external_url(auth_url.to_string())?;

    let expected_state = state.clone();
    let code = tauri::async_runtime::spawn_blocking(move || callback_params(listener, expected_state))
        .await
        .map_err(|error| format!("loopback_task_failed:{error}"))??;

    let response = client
        .post(format!("{origin}/api/oauth/google/desktop-login-exchange"))
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "code": code,
            "code_verifier": verifier,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
        }))
        .send()
        .await
        .map_err(|error| format!("google_desktop_login_exchange_failed:{error}"))?;

    let status = response.status();
    let body: serde_json::Value = response
        .json()
        .await
        .map_err(|error| format!("google_desktop_login_json_failed:{error}"))?;
    if !status.is_success() {
        let detail = body
            .get("detail")
            .or_else(|| body.get("error"))
            .and_then(|value| value.as_str())
            .unwrap_or("google_desktop_login_failed");
        return Err(format!("google_desktop_login_http_{}:{detail}", status.as_u16()));
    }

    serde_json::from_value(body).map_err(|error| format!("google_desktop_login_contract_invalid:{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_is_s256_url_safe() {
        let verifier = "A".repeat(64);
        let challenge = pkce_challenge(&verifier);
        assert_eq!(challenge.len(), 43);
        assert!(!challenge.contains('='));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
    }

    #[test]
    fn service_origin_rejects_non_https_remote() {
        assert!(validated_origin(Some("http://example.com".into())).is_err());
        assert_eq!(
            validated_origin(Some("http://127.0.0.1:8787".into())).unwrap(),
            "http://127.0.0.1:8787"
        );
    }
}
