// Native secure storage backed by the OS credential store.
// The webview surface is deliberately narrow:
// - native identity session reads/writes are Rust-internal only.
// - OAuth pending state is write/delete only from the webview.
// - provider keys expose exists/set/delete only; provider_key_get is Rust-internal.

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use serde::Serialize;

const KEYCHAIN_APP_ID: &str = "local-studio";
const IDENTITY_SESSION_ACCOUNT: &str = "identity_session";
const PROVIDER_PREFIX: &str = "provider:";

#[derive(Debug, Serialize)]
pub struct KeychainError {
    message: String,
}

fn identity_account_allowed(account: &str) -> bool {
    account == IDENTITY_SESSION_ACCOUNT || account.starts_with("identity_native_")
}

fn canonical_provider(provider: &str) -> Result<&'static str, KeychainError> {
    match provider.trim().to_ascii_lowercase().as_str() {
        "openai" => Ok("openai"),
        "anthropic" => Ok("anthropic"),
        "gemini" => Ok("gemini"),
        "cursor" => Ok("cursor"),
        "xai" => Ok("xai"),
        "cloudflare" => Ok("cloudflare"),
        "inneranimalmedia" => Ok("inneranimalmedia"),
        _ => Err(KeychainError { message: "provider_key_provider_invalid".into() }),
    }
}

fn provider_account(provider: &str) -> Result<String, KeychainError> {
    Ok(format!("{PROVIDER_PREFIX}{}", canonical_provider(provider)?))
}

#[cfg(not(target_os = "android"))]
fn entry(account: &str) -> Result<Entry, KeychainError> {
    Entry::new(&format!("agentsam-desktop-{KEYCHAIN_APP_ID}"), account)
        .map_err(|e| KeychainError { message: e.to_string() })
}

#[cfg(target_os = "android")]
fn android_secure_store_required<T>() -> Result<T, KeychainError> {
    Err(KeychainError { message: "android_secure_store_adapter_required".into() })
}

fn get_value(account: &str) -> Result<Option<String>, KeychainError> {
    #[cfg(target_os = "android")]
    {
        let _ = account;
        return android_secure_store_required();
    }
    #[cfg(not(target_os = "android"))]
    {
        match entry(account)?.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(KeychainError { message: err.to_string() }),
        }
    }
}

fn set_value(account: &str, value: &str) -> Result<(), KeychainError> {
    #[cfg(target_os = "android")]
    {
        let _ = account;
        let _ = value;
        return android_secure_store_required();
    }
    #[cfg(not(target_os = "android"))]
    {
        entry(account)?.set_password(value).map_err(|e| KeychainError { message: e.to_string() })
    }
}

fn delete_value(account: &str) -> Result<(), KeychainError> {
    #[cfg(target_os = "android")]
    {
        let _ = account;
        return android_secure_store_required();
    }
    #[cfg(not(target_os = "android"))]
    {
        match entry(account)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(KeychainError { message: err.to_string() }),
        }
    }
}

#[tauri::command]
pub fn identity_pending_set(value: String) -> Result<(), KeychainError> {
    if value.trim().is_empty() {
        return Err(KeychainError { message: "identity_pending_value_required".into() });
    }
    set_value(IDENTITY_PENDING_ACCOUNT, value.as_str())
}

#[tauri::command]
pub fn identity_pending_delete() -> Result<(), KeychainError> {
    delete_value(IDENTITY_PENDING_ACCOUNT)
}

pub(crate) fn identity_session_get_internal() -> Result<Option<String>, String> {
    get_value(IDENTITY_SESSION_ACCOUNT).map_err(|error| error.message)
}

pub(crate) fn identity_session_set_internal(value: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("identity_session_value_required".into());
    }
    set_value(IDENTITY_SESSION_ACCOUNT, value).map_err(|error| error.message)
}

pub(crate) fn identity_session_delete_internal() -> Result<(), String> {
    delete_value(IDENTITY_SESSION_ACCOUNT).map_err(|error| error.message)
}

pub(crate) fn identity_pending_get_internal() -> Result<Option<String>, String> {
    get_value(IDENTITY_PENDING_ACCOUNT).map_err(|error| error.message)
}

pub(crate) fn identity_pending_delete_internal() -> Result<(), String> {
    delete_value(IDENTITY_PENDING_ACCOUNT).map_err(|error| error.message)
}

#[tauri::command]
pub fn provider_key_exists(provider: String) -> Result<bool, KeychainError> {
    Ok(get_value(provider_account(provider.as_str())?.as_str())?.is_some())
}

#[tauri::command]
pub fn provider_key_set(provider: String, value: String) -> Result<(), KeychainError> {
    if value.trim().is_empty() {
        return Err(KeychainError { message: "provider_key_value_required".into() });
    }
    set_value(provider_account(provider.as_str())?.as_str(), value.as_str())
}

#[tauri::command]
pub fn provider_key_delete(provider: String) -> Result<(), KeychainError> {
    delete_value(provider_account(provider.as_str())?.as_str())
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identity_store_is_allowlisted() {
        assert!(identity_account_allowed(IDENTITY_SESSION_ACCOUNT));
        assert!(identity_account_allowed("identity_native_auth_pending"));
        assert!(identity_account_allowed("identity_native_pkce_pending"));
        assert!(!identity_account_allowed("provider:openai"));
        assert!(!identity_account_allowed("anything_else"));
    }

    #[test]
    fn provider_accounts_use_canonical_ids() {
        assert_eq!(provider_account("openai").unwrap(), "provider:openai");
        assert_eq!(provider_account("xai").unwrap(), "provider:xai");
        assert!(provider_account("grok").is_err());
        assert!(provider_account("other").is_err());
    }
}
