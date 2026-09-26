//! AgentSam product OAuth (PKCE + loopback) for Local Studio.
//! Client: IAM_CLIENT_ID=iam_agentsam_sdk_web (same as CLI / Worker).
//! Providers (Google/GitHub) stay on IAM — this module only speaks AgentSam.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PkceLoginRequest {
    /// Issuer origin, e.g. https://inneranimalmedia.com
    pub issuer: String,
    /// Defaults to iam_agentsam_sdk_web when empty.
    pub client_id: Option<String>,
    /// Optional — confidential exchange via Worker-mediated path preferred for .app.
    pub client_secret: Option<String>,
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

/// Placeholder command — full loopback listener + system browser lands next cut.
/// UI should call this after offline shell boots; do not invent iam_cli_agentsam.
#[tauri::command]
pub async fn start_agentsam_pkce_login(req: PkceLoginRequest) -> Result<PkceLoginResult, String> {
    let client_id = req
        .client_id
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_STUDIO_CLIENT_ID.to_string());

    if req.issuer.trim().is_empty() {
        return Err("issuer_required".into());
    }

    Ok(PkceLoginResult {
        ok: false,
        access_token_present: false,
        refresh_stored: false,
        client_id,
        message: "pkce_loopback_not_wired_yet — use hosted /auth/login until Phase 3 desktop cut completes"
            .into(),
    })
}
