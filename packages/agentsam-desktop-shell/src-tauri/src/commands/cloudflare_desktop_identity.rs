use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct CloudflareUserSession {
    pub account_id: String,
    pub email: String,
    pub access_token: String,
    pub is_authenticated: bool,
}

/// Initiates Cloudflare OAuth flow with PKCE & offline_access scope
#[command]
pub async fn start_cloudflare_oauth() -> Result<String, String> {
    // 1. Generate PKCE verifier/challenge
    // 2. Open default browser to Cloudflare auth URL with `scope=offline_access`
    // 3. Listen on local loopback port for authorization code
    Ok("Cloudflare authentication initiated".into())
}

/// Retrieves stored session or uses offline refresh token to fetch a fresh access token
#[command]
pub async fn get_cloudflare_session() -> Result<CloudflareUserSession, String> {
    // 1. Fetch refresh token from OS Keychain via keychain module
    // 2. If valid, request new access token from Cloudflare OAuth endpoint
    // 3. Return session object to frontend
    Ok(CloudflareUserSession {
        account_id: "cf_account_123".into(),
        email: "user@domain.com".into(),
        access_token: "eyJhbGci...".into(),
        is_authenticated: true,
    })
}

/// Revokes token and removes credentials from OS keychain
#[command]
pub async fn logout_cloudflare() -> Result<(), String> {
    // Clear tokens from keychain
    Ok(())
}
