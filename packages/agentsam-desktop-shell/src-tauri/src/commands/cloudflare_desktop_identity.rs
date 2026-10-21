use crate::commands::keychain::{self, IdentitySessionState};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::{command, AppHandle, State};

#[derive(Default)]
pub struct PkceState {
    pub verifier: Mutex<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub user_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudflareUserSession {
    pub is_authenticated: bool,
    pub access_token: Option<String>,
}

/// Generates a high-entropy PKCE code verifier and SHA-256 code challenge
fn generate_pkce_pair() -> (String, String) {
    let verifier: String = rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(64)
        .map(char::from)
        .collect();

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());

    (verifier, challenge)
}

/// 1. Triggered when user clicks "Log In" in Desktop Studio UI
#[command]
pub async fn start_cloudflare_oauth(
    pkce_state: State<'_, PkceState>,
    app_handle: AppHandle,
) -> Result<String, String> {
    let (verifier, challenge) = generate_pkce_pair();

    // Store verifier safely in memory until deep link returns
    if let Ok(mut guard) = pkce_state.verifier.lock() {
        *guard = Some(verifier);
    }

    let auth_url = format!(
        "https://auth.inneranimalmedia.com/oauth/authorize?\
        response_type=code&\
        client_id=agentsam_desktop_shell&\
        redirect_uri=agentsam://oauth/callback&\
        scope=offline_access%20openid%20profile&\
        code_challenge={}&\
        code_challenge_method=S256",
        challenge
    );

    // Open native browser
    tauri_plugin_shell::ShellExt::shell(&app_handle)
        .open(auth_url, None)
        .map_err(|e| format!("Failed to open browser: {}", e))?;

    Ok("OAuth flow initiated".into())
}

/// 2. Triggered when `deep_link::handle_callback` receives `agentsam://oauth/callback?code=XYZ`
pub async fn handle_oauth_deep_link(
    code: String,
    pkce_state: &PkceState,
    session_state: &IdentitySessionState,
) -> Result<OAuthTokenResponse, String> {
    let verifier = {
        let mut guard = pkce_state.verifier.lock().map_err(|_| "PKCE lock failed")?;
        guard.take().ok_or("No pending PKCE verifier found")?
    };

    // Exchange auth code + PKCE verifier directly with Cloudflare Auth Worker
    let client = reqwest::Client::new();
    let res = client
        .post("https://auth.inneranimalmedia.com/oauth/token")
        .form(&[
            ("grant_type", "authorization_code"),
            ("client_id", "agentsam_desktop_shell"),
            ("redirect_uri", "agentsam://oauth/callback"),
            ("code", &code),
            ("code_verifier", &verifier),
        ])
        .send()
        .await
        .map_err(|e| format!("Token request failed: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("OAuth exchange failed with status: {}", res.status()));
    }

    let tokens: OAuthTokenResponse = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {}", e))?;

    // Store the long-lived refresh token in native Keychain (1 write, 0 prompt loops)
    keychain::identity_session_set_internal(session_state, &tokens.refresh_token)?;

    Ok(tokens)
}

/// 3. Silent restore triggered by the frontend on app boot
#[command]
pub async fn silent_session_restore(
    session_state: State<'_, IdentitySessionState>,
) -> Result<String, String> {
    let Some(refresh_token) = keychain::identity_session_get_internal(&session_state)? else {
        return Err("No_session_found".into());
    };

    let client = reqwest::Client::new();
    let res = client
        .post("https://auth.inneranimalmedia.com/oauth/token")
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", "agentsam_desktop_shell"),
            ("refresh_token", &refresh_token),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        let tokens: OAuthTokenResponse = res.json().await.map_err(|e| e.to_string())?;
        // Refresh token rotation: save updated refresh token if provider issued a new one
        let _ = keychain::identity_session_set_internal(&session_state, &tokens.refresh_token);
        Ok(tokens.access_token)
    } else {
        // Token revoked or expired; clear local vault
        let _ = keychain::identity_session_delete_internal(&session_state);
        Err("Session_expired".into())
    }
}

/// 4. Returns current session state or attempts silent refresh
#[command]
pub async fn get_cloudflare_session(
    session_state: State<'_, IdentitySessionState>,
) -> Result<CloudflareUserSession, String> {
    match silent_session_restore(session_state).await {
        Ok(access_token) => Ok(CloudflareUserSession {
            is_authenticated: true,
            access_token: Some(access_token),
        }),
        Err(_) => Ok(CloudflareUserSession {
            is_authenticated: false,
            access_token: None,
        }),
    }
}

/// 5. Clears active refresh session from native OS Keychain
#[command]
pub async fn logout_cloudflare(
    session_state: State<'_, IdentitySessionState>,
) -> Result<(), String> {
    keychain::identity_session_delete_internal(&session_state)
}
