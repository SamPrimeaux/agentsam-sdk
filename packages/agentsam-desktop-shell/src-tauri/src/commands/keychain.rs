// Native token storage -- replaces localStorage/plaintext token files.
// Uses the OS credential store: Keychain (Mac), Credential Manager (Windows),
// Secret Service (Linux). Service name is namespaced per brand at runtime
// so Inner Animals and Meauxbility installs never collide on one machine.

use keyring::Entry;
use serde::Serialize;

#[derive(Serialize)]
pub struct KeychainError {
    message: String,
}

fn entry(app_id: &str, account: &str) -> Result<Entry, KeychainError> {
    Entry::new(&format!("agentsam-desktop-{}", app_id), account)
        .map_err(|e| KeychainError { message: e.to_string() })
}

#[tauri::command]
pub fn get_token(app_id: String, account: String) -> Result<Option<String>, KeychainError> {
    let e = entry(&app_id, &account)?;
    match e.get_password() {
        Ok(pw) => Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(KeychainError { message: err.to_string() }),
    }
}

#[tauri::command]
pub fn set_token(app_id: String, account: String, token: String) -> Result<(), KeychainError> {
    entry(&app_id, &account)?
        .set_password(&token)
        .map_err(|e| KeychainError { message: e.to_string() })
}

#[tauri::command]
pub fn delete_token(app_id: String, account: String) -> Result<(), KeychainError> {
    entry(&app_id, &account)?
        .delete_credential()
        .map_err(|e| KeychainError { message: e.to_string() })
}
