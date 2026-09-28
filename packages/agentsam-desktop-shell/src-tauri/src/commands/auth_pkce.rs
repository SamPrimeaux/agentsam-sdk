//! Desktop sign-in — Google Desktop PKCE, Cloudflare OAuth, and IAM platform OAuth.
//!
//! The packaged portal presents each provider explicitly. Desktop identity uses:
//!   - GOOGLE_DESKTOP_CLIENT_ID (public Desktop client, PKCE + loopback)
//!   - CLOUDFLARE_OAUTH_CLIENT_ID (Worker secret / public-config; offline_access via Studio)
//!   - IAM_CLIENT_ID (Studio Worker starts the InnerAnimalMedia platform flow)

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::collections::HashMap;
use std::sync::{mpsc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

const DEFAULT_STUDIO_ORIGIN: &str = "https://agentsam.inneranimalmedia.com";
const DEFAULT_GOOGLE_DESKTOP_CLIENT_ID: &str =
  "246811022042-cckq00b5seekpkv0in358jhu42n0b6u9.apps.googleusercontent.com";
const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPES: &str = "openid email profile https://www.googleapis.com/auth/cloud-platform";
const KEYCHAIN_ACCOUNT_REFRESH: &str = "oauth_refresh_token";
const KEYCHAIN_ACCOUNT_ACCESS: &str = "oauth_access_token";
const KEYCHAIN_PROVIDER: &str = "oauth_provider";
const DESKTOP_CLIENT_ID: &str = "local-studio";
const DESKTOP_REDIRECT_URI: &str = "agentsamstudio://callback";
const DESKTOP_CALLBACK_TIMEOUT: Duration = Duration::from_secs(300);

type DesktopCallbackSender = mpsc::Sender<Result<HashMap<String, String>, String>>;
static DESKTOP_CALLBACKS: OnceLock<Mutex<HashMap<String, DesktopCallbackSender>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopLoginRequest {
  /// Local Studio origin (public-config + exchange). Defaults to agentsam.inneranimalmedia.com.
  pub studio_origin: Option<String>,
  /// Override GOOGLE_DESKTOP_CLIENT_ID (else public-config / stock Desktop client).
  pub google_desktop_client_id: Option<String>,
  pub app_id: Option<String>,
  pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopLoginResult {
  pub ok: bool,
  pub provider: String,
  pub access_token_present: bool,
  pub refresh_stored: bool,
  pub client_id: String,
  pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DesktopAuthStatus {
  pub authenticated: bool,
  pub provider: Option<String>,
  pub access_token_present: bool,
  pub refresh_stored: bool,
  pub message: String,
}

#[derive(Debug, Deserialize)]
struct DesktopTokenResponse {
  access_token: Option<String>,
  refresh_token: Option<String>,
  provider: Option<String>,
  error: Option<String>,
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

fn open_system_browser(url: &str) -> Result<(), String> {
  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .arg(url)
      .spawn()
      .map_err(|e| format!("open_browser_failed: {e}"))?;
  }
  #[cfg(target_os = "windows")]
  {
    Command::new("cmd")
      .args(["/C", "start", "", url])
      .spawn()
      .map_err(|e| format!("open_browser_failed: {e}"))?;
  }
  #[cfg(all(unix, not(target_os = "macos")))]
  {
    Command::new("xdg-open")
      .arg(url)
      .spawn()
      .map_err(|e| format!("open_browser_failed: {e}"))?;
  }
  Ok(())
}

fn desktop_callbacks() -> &'static Mutex<HashMap<String, DesktopCallbackSender>> {
  DESKTOP_CALLBACKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn register_desktop_callback(
  state: &str,
) -> Result<mpsc::Receiver<Result<HashMap<String, String>, String>>, String> {
  let (tx, rx) = mpsc::channel();
  let mut pending = desktop_callbacks()
    .lock()
    .map_err(|_| "desktop_callback_lock_poisoned".to_string())?;
  if pending.insert(state.to_string(), tx).is_some() {
    return Err("desktop_callback_state_collision".into());
  }
  Ok(rx)
}

fn remove_desktop_callback(state: &str) {
  if let Ok(mut pending) = desktop_callbacks().lock() {
    pending.remove(state);
  }
}

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
  let mut map = std::collections::HashMap::new();
  for pair in query.split('&') {
    if let Some((k, v)) = pair.split_once('=') {
      map.insert(urlencoding_decode(k), urlencoding_decode(v));
    }
  }
  map
}

/// Called by the deep-link plugin when the OS opens agentsamstudio://callback.
/// Returns true only when the URL matched a currently pending desktop OAuth flow.
pub fn handle_desktop_oauth_callback(url: &str) -> bool {
  if !url.starts_with(DESKTOP_REDIRECT_URI) {
    return false;
  }
  let query = url.split_once('?').map(|(_, query)| query).unwrap_or("");
  let params = parse_query(query);
  let state = params.get("state").cloned().unwrap_or_default();
  if state.is_empty() {
    return false;
  }
  let sender = desktop_callbacks()
    .lock()
    .ok()
    .and_then(|mut pending| pending.remove(&state));
  let Some(sender) = sender else {
    return false;
  };
  let result = if let Some(error) = params.get("error") {
    Err(format!("oauth_error:{error}"))
  } else if params.get("code").map(String::as_str).unwrap_or("").is_empty() {
    Err("missing_code".into())
  } else {
    Ok(params)
  };
  let _ = sender.send(result);
  true
}

fn urlencoding_decode(s: &str) -> String {
  let mut out = String::new();
  let bytes = s.as_bytes();
  let mut i = 0;
  while i < bytes.len() {
    match bytes[i] {
      b'+' => {
        out.push(' ');
        i += 1;
      }
      b'%' if i + 2 < bytes.len() => {
        let hex = &s[i + 1..i + 3];
        if let Ok(v) = u8::from_str_radix(hex, 16) {
          out.push(v as char);
          i += 3;
        } else {
          out.push('%');
          i += 1;
        }
      }
      c => {
        out.push(c as char);
        i += 1;
      }
    }
  }
  out
}

fn urlencoding_encode(s: &str) -> String {
  let mut out = String::new();
  for b in s.bytes() {
    match b {
      b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => out.push(b as char),
      _ => out.push_str(&format!("%{b:02X}")),
    }
  }
  out
}

fn studio_origin(req: &DesktopLoginRequest) -> String {
  req
    .studio_origin
    .as_ref()
    .map(|s| s.trim().trim_end_matches('/').to_string())
    .filter(|s| !s.is_empty())
    .unwrap_or_else(|| DEFAULT_STUDIO_ORIGIN.to_string())
}

async fn resolve_google_desktop_client_id(req: &DesktopLoginRequest) -> String {
  if let Some(id) = req
    .google_desktop_client_id
    .as_ref()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
  {
    return id;
  }
  let origin = studio_origin(req);
  let url = format!("{origin}/api/public-config");
  let client = reqwest::Client::new();
  if let Ok(res) = client.get(&url).header("Accept", "application/json").send().await {
    if let Ok(body) = res.json::<serde_json::Value>().await {
      if let Some(id) = body
        .get("google_desktop_client_id")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
      {
        return id.to_string();
      }
    }
  }
  DEFAULT_GOOGLE_DESKTOP_CLIENT_ID.to_string()
}

fn accept_loopback_code(
  listener: TcpListener,
  expected_state: String,
) -> Result<String, String> {
  let (tx, rx) = mpsc::channel::<Result<String, String>>();
  thread::spawn(move || {
    match listener.accept() {
      Ok((mut stream, _)) => {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(180)));
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf).unwrap_or(0);
        let req_str = String::from_utf8_lossy(&buf[..n]);
        let first = req_str.lines().next().unwrap_or("");
        let path = first.split_whitespace().nth(1).unwrap_or("");
        let query = path.split('?').nth(1).unwrap_or("");
        let params = parse_query(query);
        let body = if params.get("error").is_some() {
          format!(
            "<html><body><h1>Sign-in failed</h1><p>{}</p></body></html>",
            params
              .get("error_description")
              .or_else(|| params.get("error"))
              .cloned()
              .unwrap_or_default()
          )
        } else {
          "<html><body><h1>AgentSam</h1><p>Signed in. You can close this window.</p></body></html>"
            .to_string()
        };
        let resp = format!(
          "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
          body.len(),
          body
        );
        let _ = stream.write_all(resp.as_bytes());
        if let Some(err) = params.get("error") {
          let _ = tx.send(Err(format!("oauth_error: {err}")));
          return;
        }
        let code = params.get("code").cloned().unwrap_or_default();
        let got_state = params.get("state").cloned().unwrap_or_default();
        if got_state != expected_state {
          let _ = tx.send(Err("state_mismatch".into()));
          return;
        }
        if code.is_empty() {
          let _ = tx.send(Err("missing_code".into()));
          return;
        }
        let _ = tx.send(Ok(code));
      }
      Err(e) => {
        let _ = tx.send(Err(format!("loopback_accept_failed: {e}")));
      }
    }
  });
  rx.recv_timeout(Duration::from_secs(180))
    .map_err(|_| "oauth_callback_timeout".to_string())?
}

fn store_tokens(app_id: &str, provider: &str, access: &str, refresh: &str) -> Result<bool, String> {
  let mut refresh_stored = false;
  if !refresh.is_empty() {
    let entry = Entry::new(&format!("agentsam-desktop-{app_id}"), KEYCHAIN_ACCOUNT_REFRESH)
      .map_err(|e| e.to_string())?;
    entry.set_password(refresh).map_err(|e| e.to_string())?;
    refresh_stored = true;
  }
  let access_entry = Entry::new(&format!("agentsam-desktop-{app_id}"), KEYCHAIN_ACCOUNT_ACCESS)
    .map_err(|e| e.to_string())?;
  access_entry
    .set_password(access)
    .map_err(|e| e.to_string())?;
  let provider_entry = Entry::new(&format!("agentsam-desktop-{app_id}"), KEYCHAIN_PROVIDER)
    .map_err(|e| e.to_string())?;
  provider_entry
    .set_password(provider)
    .map_err(|e| e.to_string())?;
  Ok(refresh_stored)
}

/// Google Desktop OAuth (PKCE + loopback). Uses GOOGLE_DESKTOP_CLIENT_ID.
/// Token exchange prefers Local Studio `/api/oauth/google/desktop-exchange`.
#[tauri::command]
pub async fn start_google_desktop_login(req: DesktopLoginRequest) -> Result<DesktopLoginResult, String> {
  let client_id = resolve_google_desktop_client_id(&req).await;
  let origin = studio_origin(&req);
  let app_id = req
    .app_id
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "local-studio".into());
  let scope = req
    .scope
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| GOOGLE_SCOPES.into());

  let state = random_url_safe(24);
  let verifier = random_url_safe(32);
  let challenge = pkce_challenge(&verifier);

  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("loopback_bind_failed: {e}"))?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let redirect_uri = format!("http://127.0.0.1:{port}/callback");

  let auth = format!(
    "{GOOGLE_AUTH_URL}?client_id={client_id}&redirect_uri={redirect}&response_type=code&scope={scope}&state={state}&code_challenge={challenge}&code_challenge_method=S256&access_type=offline&prompt=consent&include_granted_scopes=true",
    redirect = urlencoding_encode(&redirect_uri),
    scope = urlencoding_encode(&scope),
  );

  open_system_browser(&auth)?;
  let code = accept_loopback_code(listener, state)?;

  let client = reqwest::Client::new();
  let exchange_url = format!("{origin}/api/oauth/google/desktop-exchange");
  let exchange_body = serde_json::json!({
    "code": code,
    "code_verifier": verifier,
    "client_id": client_id,
    "redirect_uri": redirect_uri,
  });
  let res = client
    .post(&exchange_url)
    .header("Accept", "application/json")
    .header("Content-Type", "application/json")
    .json(&exchange_body)
    .send()
    .await
    .map_err(|e| format!("desktop_exchange_failed: {e}"))?;
  let status = res.status();
  let body: serde_json::Value = res.json().await.map_err(|e| format!("token_json_failed: {e}"))?;
  if !status.is_success() {
    return Err(format!(
      "desktop_exchange_http_{}: {}",
      status.as_u16(),
      body
        .get("error_description")
        .or_else(|| body.get("error"))
        .or_else(|| body.get("message"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
    ));
  }

  let access = body
    .get("access_token")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();
  let refresh = body
    .get("refresh_token")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .to_string();
  if access.is_empty() {
    return Err("oauth_token_response_missing_access_token".into());
  }

  let refresh_stored = store_tokens(&app_id, "google_desktop", &access, &refresh)?;
  Ok(DesktopLoginResult {
    ok: true,
    provider: "google_desktop".into(),
    access_token_present: true,
    refresh_stored,
    client_id,
    message: "signed_in_google_desktop".into(),
  })
}

async fn start_hosted_desktop_login(
  req: DesktopLoginRequest,
  provider_path: &str,
  provider_name: &str,
  client_id_label: &str,
) -> Result<DesktopLoginResult, String> {
  let origin = studio_origin(&req);
  let app_id = req
    .app_id
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| "local-studio".into());
  let state = random_url_safe(24);
  let verifier = random_url_safe(48);
  let challenge = pkce_challenge(&verifier);
  let receiver = register_desktop_callback(&state)?;
  let start = format!(
    "{origin}/api/oauth/{provider_path}/start?desktop=1&desktop_state={state}&desktop_code_challenge={challenge}&desktop_client_id={client_id}&desktop_redirect_uri={redirect}&next=/agentsam",
    client_id = urlencoding_encode(DESKTOP_CLIENT_ID),
    redirect = urlencoding_encode(DESKTOP_REDIRECT_URI),
  );
  if let Err(error) = open_system_browser(&start) {
    remove_desktop_callback(&state);
    return Err(error);
  }
  let callback = receiver.recv_timeout(DESKTOP_CALLBACK_TIMEOUT).map_err(|_| {
    remove_desktop_callback(&state);
    "oauth_callback_timeout".to_string()
  })??;
  if callback.get("state").map(String::as_str) != Some(state.as_str()) {
    return Err("state_mismatch".into());
  }
  let code = callback.get("code").cloned().unwrap_or_default();
  let exchange_url = format!("{origin}/api/oauth/desktop/exchange");
  let response = reqwest::Client::new()
    .post(exchange_url)
    .header("Accept", "application/json")
    .json(&serde_json::json!({
      "code": code,
      "state": state,
      "code_verifier": verifier,
      "client_id": DESKTOP_CLIENT_ID,
      "redirect_uri": DESKTOP_REDIRECT_URI,
    }))
    .send()
    .await
    .map_err(|error| format!("desktop_exchange_failed:{error}"))?;
  let status = response.status();
  let body: DesktopTokenResponse = response
    .json()
    .await
    .map_err(|error| format!("desktop_exchange_json_failed:{error}"))?;
  if !status.is_success() {
    return Err(body.error.unwrap_or_else(|| format!("desktop_exchange_http_{}", status.as_u16())));
  }
  let access = body.access_token.unwrap_or_default();
  let refresh = body.refresh_token.unwrap_or_default();
  if access.is_empty() || refresh.is_empty() {
    return Err("desktop_exchange_missing_credentials".into());
  }
  let stored_provider = body.provider.unwrap_or_else(|| provider_name.to_string());
  let refresh_stored = store_tokens(&app_id, &stored_provider, &access, &refresh)?;
  Ok(DesktopLoginResult {
    ok: true,
    provider: stored_provider,
    access_token_present: true,
    refresh_stored,
    client_id: client_id_label.into(),
    message: "signed_in_desktop_handoff".into(),
  })
}

/// Cloudflare provider authorization is completed by the Worker, then handed
/// to this public desktop client through a one-time PKCE-bound code.
#[tauri::command]
pub async fn start_cloudflare_oauth_login(req: DesktopLoginRequest) -> Result<DesktopLoginResult, String> {
  start_hosted_desktop_login(
    req,
    "cloudflare",
    "cloudflare",
    "CLOUDFLARE_OAUTH_CLIENT_ID",
  ).await
}

/// Open the Local Studio IAM-platform flow. The Studio Worker owns
/// IAM_CLIENT_ID/IAM_CLIENT_SECRET; the packaged app never embeds the secret.
/// A short-lived code returns through agentsamstudio://callback and is exchanged
/// for a renewable AgentSam desktop session.
#[tauri::command]
pub async fn start_iam_oauth_login(req: DesktopLoginRequest) -> Result<DesktopLoginResult, String> {
  start_hosted_desktop_login(
    req,
    "inneranimalmedia",
    "inneranimalmedia",
    "IAM_CLIENT_ID",
  ).await
}

/// Backward-compatible command name — routes to Google Desktop (never IAM web gate).
#[tauri::command]
pub async fn start_agentsam_pkce_login(req: DesktopLoginRequest) -> Result<DesktopLoginResult, String> {
  start_google_desktop_login(req).await
}

fn keychain_token(app_id: &str, account: &str) -> Result<Option<String>, String> {
  let entry = Entry::new(&format!("agentsam-desktop-{app_id}"), account)
    .map_err(|error| error.to_string())?;
  match entry.get_password() {
    Ok(value) => Ok(Some(value)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(error.to_string()),
  }
}

async fn validate_desktop_session(origin: &str, access: &str) -> Result<bool, String> {
  let response = reqwest::Client::new()
    .get(format!("{origin}/api/oauth/desktop/session"))
    .bearer_auth(access)
    .header("Accept", "application/json")
    .send()
    .await
    .map_err(|error| format!("desktop_session_check_failed:{error}"))?;
  Ok(response.status().is_success())
}

/// Restore desktop account state from Keychain. Hosted desktop refresh tokens
/// rotate on use; browser cookies are never consulted.
#[tauri::command]
pub async fn desktop_auth_status(req: DesktopLoginRequest) -> Result<DesktopAuthStatus, String> {
  let origin = studio_origin(&req);
  let app_id = req
    .app_id
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| "local-studio".into());
  let access = keychain_token(&app_id, KEYCHAIN_ACCOUNT_ACCESS)?.unwrap_or_default();
  let refresh = keychain_token(&app_id, KEYCHAIN_ACCOUNT_REFRESH)?.unwrap_or_default();
  let provider = keychain_token(&app_id, KEYCHAIN_PROVIDER)?;
  if access.is_empty() {
    return Ok(DesktopAuthStatus {
      authenticated: false,
      provider,
      access_token_present: false,
      refresh_stored: !refresh.is_empty(),
      message: "signed_out".into(),
    });
  }
  if provider.as_deref() == Some("google_desktop") {
    return Ok(DesktopAuthStatus {
      authenticated: true,
      provider,
      access_token_present: true,
      refresh_stored: !refresh.is_empty(),
      message: "restored_google_desktop_keychain".into(),
    });
  }
  if validate_desktop_session(&origin, &access).await.unwrap_or(false) {
    return Ok(DesktopAuthStatus {
      authenticated: true,
      provider,
      access_token_present: true,
      refresh_stored: !refresh.is_empty(),
      message: "restored_desktop_session".into(),
    });
  }
  if refresh.is_empty() {
    return Ok(DesktopAuthStatus {
      authenticated: false,
      provider,
      access_token_present: true,
      refresh_stored: false,
      message: "desktop_session_expired".into(),
    });
  }
  let response = reqwest::Client::new()
    .post(format!("{origin}/api/oauth/desktop/refresh"))
    .header("Accept", "application/json")
    .json(&serde_json::json!({
      "refresh_token": refresh,
      "client_id": DESKTOP_CLIENT_ID,
    }))
    .send()
    .await
    .map_err(|error| format!("desktop_refresh_failed:{error}"))?;
  let status = response.status();
  let body: DesktopTokenResponse = response
    .json()
    .await
    .map_err(|error| format!("desktop_refresh_json_failed:{error}"))?;
  if !status.is_success() {
    return Ok(DesktopAuthStatus {
      authenticated: false,
      provider,
      access_token_present: true,
      refresh_stored: true,
      message: body.error.unwrap_or_else(|| "desktop_refresh_rejected".into()),
    });
  }
  let next_access = body.access_token.unwrap_or_default();
  let next_refresh = body.refresh_token.unwrap_or_default();
  let next_provider = body.provider.or(provider).unwrap_or_else(|| "desktop".into());
  if next_access.is_empty() || next_refresh.is_empty() {
    return Err("desktop_refresh_missing_credentials".into());
  }
  store_tokens(&app_id, &next_provider, &next_access, &next_refresh)?;
  Ok(DesktopAuthStatus {
    authenticated: true,
    provider: Some(next_provider),
    access_token_present: true,
    refresh_stored: true,
    message: "refreshed_desktop_session".into(),
  })
}
