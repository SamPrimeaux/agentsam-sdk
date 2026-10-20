use crate::commands::keychain::{self, IdentitySessionState};
use rand::{distributions::Alphanumeric, Rng};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use tauri::{command, AppHandle, State};

#[derive(Default)]
pub struct PkceState {
    pub verifier: Mutex<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
    pub user_id: String,
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
    let challenge = base64::encode_config(hasher.finalize(), base64::URL_SAFE_NO_PAD);

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
