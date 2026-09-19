// Stub. Real implementation reuses the existing connection_token
// enrollment flow (same one samsmac/iam-tunnel use) rather than
// inventing a second one. Gated by manifest feature_flags.local_execution_node.

#[tauri::command]
pub async fn enroll_as_local_node() -> Result<(), String> {
    Err("not implemented".into())
}
