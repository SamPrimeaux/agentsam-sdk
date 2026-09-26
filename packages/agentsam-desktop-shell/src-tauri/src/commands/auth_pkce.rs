//! AgentSam product OAuth — authorization code + PKCE + RFC 8252 loopback.
//! Client: IAM_CLIENT_ID=iam_agentsam_sdk_web (same as CLI / Local Studio Worker).
//! Providers (Google/GitHub) stay on IAM; this module only speaks AgentSam.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use keyring::Entry;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::net::TcpListener;
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkceLoginRequest {
  /// Issuer origin, e.g. https://inneranimalmedia.com
  pub issuer: String,
  /// Defaults to iam_agentsam_sdk_web when empty.
  pub client_id: Option<String>,
  /// Confidential exchange — from vault / Worker; never hardcode in source.
  pub client_secret: Option<String>,
  /// Keychain app id namespace (default local-studio).
  pub app_id: Option<String>,
  /// OAuth scope string.
  pub scope: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkceLoginResult {
  pub ok: bool,
  pub access_token_present: bool,
  pub refresh_stored: bool,
  pub client_id: String,
  pub message: String,
}

pub const DEFAULT_STUDIO_CLIENT_ID: &str = "iam_agentsam_sdk_web";
const KEYCHAIN_ACCOUNT_REFRESH: &str = "oauth_refresh_token";
const KEYCHAIN_ACCOUNT_ACCESS: &str = "oauth_access_token";

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

fn parse_query(query: &str) -> std::collections::HashMap<String, String> {
  let mut map = std::collections::HashMap::new();
  for pair in query.split('&') {
    if let Some((k, v)) = pair.split_once('=') {
      map.insert(
        urlencoding_decode(k),
        urlencoding_decode(v),
      );
    }
  }
  map
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

/// Bind 127.0.0.1:0, open system browser to IAM authorize (via /auth/login gate),
/// exchange code+PKCE, store refresh in Keychain.
#[tauri::command]
pub async fn start_agentsam_pkce_login(req: PkceLoginRequest) -> Result<PkceLoginResult, String> {
  let client_id = req
    .client_id
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| DEFAULT_STUDIO_CLIENT_ID.to_string());
  let issuer = req.issuer.trim().trim_end_matches('/').to_string();
  if issuer.is_empty() {
    return Err("issuer_required".into());
  }
  let app_id = req
    .app_id
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "local-studio".into());
  let scope = req
    .scope
    .filter(|s| !s.trim().is_empty())
    .unwrap_or_else(|| "openid profile email offline_access".into());
  let client_secret = req.client_secret.filter(|s| !s.trim().is_empty());

  let state = random_url_safe(24);
  let verifier = random_url_safe(32);
  let challenge = pkce_challenge(&verifier);

  let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("loopback_bind_failed: {e}"))?;
  let port = listener.local_addr().map_err(|e| e.to_string())?.port();
  let redirect_uri = format!("http://127.0.0.1:{port}/callback");

  let authorize = format!(
    "{issuer}/api/oauth/authorize?response_type=code&client_id={client_id}&redirect_uri={redirect}&code_challenge={challenge}&code_challenge_method=S256&state={state}&scope={scope}",
    redirect = urlencoding_encode(&redirect_uri),
    scope = urlencoding_encode(&scope),
  );
  // Gate through IAM login page; preserve authorize in next.
  let login_gate = format!(
    "{issuer}/auth/login?next={next}",
    next = urlencoding_encode(
      authorize
        .strip_prefix(&issuer)
        .unwrap_or(authorize.as_str()),
    ),
  );

  let (tx, rx) = mpsc::channel::<Result<(String, String), String>>();
  let expected_state = state.clone();
  thread::spawn(move || {
    match listener.accept() {
      Ok((mut stream, _)) => {
        let _ = stream.set_read_timeout(Some(Duration::from_secs(180)));
        let mut buf = [0u8; 8192];
        let n = stream.read(&mut buf).unwrap_or(0);
        let req_str = String::from_utf8_lossy(&buf[..n]);
        let first = req_str.lines().next().unwrap_or("");
        // GET /callback?code=...&state=... HTTP/1.1
        let path = first.split_whitespace().nth(1).unwrap_or("");
        let query = path.split('?').nth(1).unwrap_or("");
        let params = parse_query(query);
        let body = if params.get("error").is_some() {
          format!(
            "<html><body><h1>Sign-in failed</h1><p>{}</p></body></html>",
            params.get("error_description").or_else(|| params.get("error")).cloned().unwrap_or_default()
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
        let _ = tx.send(Ok((code, got_state)));
      }
      Err(e) => {
        let _ = tx.send(Err(format!("loopback_accept_failed: {e}")));
      }
    }
  });

  open_system_browser(&login_gate)?;

  let (code, _) = rx
    .recv_timeout(Duration::from_secs(180))
    .map_err(|_| "oauth_callback_timeout".to_string())?
    ?;

  let mut form = vec![
    ("grant_type", "authorization_code".to_string()),
    ("client_id", client_id.clone()),
    ("redirect_uri", redirect_uri),
    ("code", code),
    ("code_verifier", verifier),
  ];
  if let Some(secret) = client_secret {
    form.push(("client_secret", secret));
  }

  let client = reqwest::Client::new();
  let token_url = format!("{issuer}/api/oauth/token");
  let res = client
    .post(&token_url)
    .header("Accept", "application/json")
    .form(&form)
    .send()
    .await
    .map_err(|e| format!("token_exchange_failed: {e}"))?;
  let status = res.status();
  let body: serde_json::Value = res.json().await.map_err(|e| format!("token_json_failed: {e}"))?;
  if !status.is_success() {
    return Err(format!(
      "token_http_{}: {}",
      status.as_u16(),
      body.get("error_description")
        .or_else(|| body.get("error"))
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

  let mut refresh_stored = false;
  if !refresh.is_empty() {
    let entry = Entry::new(&format!("agentsam-desktop-{app_id}"), KEYCHAIN_ACCOUNT_REFRESH)
      .map_err(|e| e.to_string())?;
    entry.set_password(&refresh).map_err(|e| e.to_string())?;
    refresh_stored = true;
  }
  // Access token in keychain briefly is ok for desktop; prefer memory in UI layer.
  let access_entry = Entry::new(&format!("agentsam-desktop-{app_id}"), KEYCHAIN_ACCOUNT_ACCESS)
    .map_err(|e| e.to_string())?;
  access_entry
    .set_password(&access)
    .map_err(|e| e.to_string())?;

  Ok(PkceLoginResult {
    ok: true,
    access_token_present: true,
    refresh_stored,
    client_id,
    message: "signed_in_agentsam".into(),
  })
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
