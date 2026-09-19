// Calls the SAME device-enrollment endpoint the Mac/ExecOS local-device
// pairing flow already uses -- POST {base_url}/api/terminal/connections/enroll
// (see inneranimalmedia/backend/agentsam/terminal/enrollment.js
// consumeTerminalEnrollmentToken, wired at
// inneranimalmedia/backend/http/terminal/control-plane-routes.js).
// No new enrollment mechanism invented here.
//
// The enrollment_token itself is minted browser-side, authenticated,
// via POST /api/terminal/connections/enrollment-token (the dashboard's
// existing "pair a device" UI) -- this command only performs the
// consuming half, on the device being paired. Gated by manifest
// feature_flags.local_execution_node; most brand installs never call this.

use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct EnrollRequest {
    enrollment_token: String,
    hostname: Option<String>,
    platform: String,
    arch: String,
}

#[derive(Deserialize, Serialize)]
pub struct EnrollResult {
    ok: bool,
    auth_mode: Option<String>,
    account_id: Option<String>,
    instance_id: Option<String>,
    connection_id: Option<String>,
    connection_key: Option<String>,
    endpoint_url: Option<String>,
    transport_provider: Option<String>,
}

#[tauri::command]
pub async fn enroll_as_local_node(
    base_url: String,
    enrollment_token: String,
) -> Result<EnrollResult, String> {
    let hostname = hostname::get().ok().and_then(|h| h.into_string().ok());

    let payload = EnrollRequest {
        enrollment_token,
        hostname,
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    };

    let url = format!(
        "{}/api/terminal/connections/enroll",
        base_url.trim_end_matches('/')
    );

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("enrollment failed ({}): {}", status, body));
    }

    response
        .json::<EnrollResult>()
        .await
        .map_err(|e| e.to_string())
}
