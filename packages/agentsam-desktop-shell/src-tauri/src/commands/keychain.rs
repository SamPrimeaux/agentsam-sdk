// Native token storage -- replaces localStorage/plaintext token files.
// Uses the OS credential store: Keychain (Mac), Credential Manager (Windows),
// Secret Service (Linux). Service name is namespaced per brand at runtime
// so Inner Animals and Meauxbility installs never collide on one machine.

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use serde::Serialize;

#[derive(Serialize)]
pub struct KeychainError {
    message: String,
}

#[cfg(not(target_os = "android"))]
fn entry(app_id: &str, account: &str) -> Result<Entry, KeychainError> {
    Entry::new(&format!("agentsam-desktop-{}", app_id), account)
        .map_err(|e| KeychainError { message: e.to_string() })
}

#[cfg(target_os = "android")]
fn android_secure_store_required<T>() -> Result<T, KeychainError> {
    Err(KeychainError {
        message: "android_secure_store_adapter_required".into(),
    })
}

#[tauri::command]
pub fn get_token(app_id: String, account: String) -> Result<Option<String>, KeychainError> {
    #[cfg(target_os = "android")]
    {
        let _ = app_id;
        let _ = account;
        return android_secure_store_required();
    }
    #[cfg(not(target_os = "android"))]
    {
        let e = entry(&app_id, &account)?;
        match e.get_password() {
            Ok(pw) => Ok(Some(pw)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(KeychainError { message: err.to_string() }),
        }
    }
}

#[tauri::command]
pub fn set_token(app_id: String, account: String, token: String) -> Result<(), KeychainError> {
    #[cfg(target_os = "android")]
    {
        let _ = app_id;
        let _ = account;
        let _ = token;
        return android_secure_store_required();
    }
    #[cfg(not(target_os = "android"))]
    {
        entry(&app_id, &account)?
            .set_password(&token)
            .map_err(|e| KeychainError { message: e.to_string() })
    }
}

#[tauri::command]
pub fn delete_token(app_id: String, account: String) -> Result<(), KeychainError> {
    #[cfg(target_os = "android")]
    {
        let _ = app_id;
        let _ = account;
        return android_secure_store_required();
    }
    #[cfg(not(target_os = "android"))]
    {
        entry(&app_id, &account)?
            .delete_credential()
            .map_err(|e| KeychainError { message: e.to_string() })
    }
}

// Portable command names. The desktop implementation uses the OS credential
// store (Keychain / Credential Manager / Secret Service). Mobile shells must
// implement the same contract with iOS Keychain / Android secure storage.
#[tauri::command]
pub fn secure_store_get(app_id: String, account: String) -> Result<Option<String>, KeychainError> {
    get_token(app_id, account)
}

#[tauri::command]
pub fn secure_store_set(app_id: String, account: String, value: String) -> Result<(), KeychainError> {
    set_token(app_id, account, value)
}

#[tauri::command]
pub fn secure_store_delete(app_id: String, account: String) -> Result<(), KeychainError> {
    delete_token(app_id, account)
}
