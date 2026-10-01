// Native secure storage backed by the OS credential store.
// The webview surface is deliberately narrow:
// - native identity session reads/writes are Rust-internal only.
// - OAuth pending state is write/delete only from the webview.
// - provider keys expose exists/set/delete only; provider_key_get is Rust-internal.

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

const KEYCHAIN_APP_ID: &str = "local-studio";
const IDENTITY_SESSION_ACCOUNT: &str = "identity_session";
const PROVIDER_PREFIX: &str = "provider:";

#[derive(Debug, Serialize)]
pub struct KeychainError {
    message: String,
}

#[derive(Default)]
pub struct IdentityPendingState {
    value: Mutex<Option<String>>,
}

#[derive(Default)]
pub struct IdentitySessionState {
    cache: Mutex<IdentitySessionCache>,
}

#[derive(Default)]
struct IdentitySessionCache {
    loaded: bool,
    value: Option<String>,
}

fn state_lock_error() -> KeychainError {
    KeychainError { message: "identity_secure_state_poisoned".into() }
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

fn session_get_cached(state: &IdentitySessionState) -> Result<Option<String>, KeychainError> {
    {
        let cache = state.cache.lock().map_err(|_| state_lock_error())?;
        if cache.loaded {
            return Ok(cache.value.clone());
        }
    }
    let value = get_value(IDENTITY_SESSION_ACCOUNT)?;
    let mut cache = state.cache.lock().map_err(|_| state_lock_error())?;
    cache.loaded = true;
    cache.value = value.clone();
    Ok(value)
}

fn session_set_cached(state: &IdentitySessionState, value: &str) -> Result<(), KeychainError> {
    set_value(IDENTITY_SESSION_ACCOUNT, value)?;
    let mut cache = state.cache.lock().map_err(|_| state_lock_error())?;
    cache.loaded = true;
    cache.value = Some(value.to_string());
    Ok(())
}

fn session_delete_cached(state: &IdentitySessionState) -> Result<(), KeychainError> {
    delete_value(IDENTITY_SESSION_ACCOUNT)?;
    let mut cache = state.cache.lock().map_err(|_| state_lock_error())?;
    cache.loaded = true;
    cache.value = None;
    Ok(())
}

#[tauri::command]
pub fn identity_session_exists(state: State<'_, IdentitySessionState>) -> Result<bool, KeychainError> {
    Ok(session_get_cached(&state)?.is_some())
}

#[tauri::command]
pub fn identity_pending_set(
    state: State<'_, IdentityPendingState>,
    value: String,
) -> Result<(), KeychainError> {
    if value.trim().is_empty() {
        return Err(KeychainError { message: "identity_pending_value_required".into() });
    }
    let mut pending = state.value.lock().map_err(|_| state_lock_error())?;
    *pending = Some(value);
    Ok(())
}

#[tauri::command]
pub fn identity_pending_get(
    state: State<'_, IdentityPendingState>,
) -> Result<Option<String>, KeychainError> {
    let pending = state.value.lock().map_err(|_| state_lock_error())?;
    Ok(pending.clone())
}

#[tauri::command]
pub fn identity_pending_delete(
    state: State<'_, IdentityPendingState>,
) -> Result<(), KeychainError> {
    let mut pending = state.value.lock().map_err(|_| state_lock_error())?;
    *pending = None;
    Ok(())
}

pub(crate) fn identity_session_get_internal(
    state: &IdentitySessionState,
) -> Result<Option<String>, String> {
    session_get_cached(state).map_err(|error| error.message)
}

pub(crate) fn identity_session_set_internal(
    state: &IdentitySessionState,
    value: &str,
) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("identity_session_value_required".into());
    }
    session_set_cached(state, value).map_err(|error| error.message)
}

pub(crate) fn identity_session_delete_internal(
    state: &IdentitySessionState,
) -> Result<(), String> {
    session_delete_cached(state).map_err(|error| error.message)
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

pub(crate) fn provider_key_get_internal(provider: &str) -> Result<Option<String>, String> {
    let account = provider_account(provider).map_err(|error| error.message)?;
    get_value(account.as_str()).map_err(|error| error.message)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_accounts_use_canonical_ids() {
        assert_eq!(provider_account("openai").unwrap(), "provider:openai");
        assert_eq!(provider_account("xai").unwrap(), "provider:xai");
        assert!(provider_account("grok").is_err());
        assert!(provider_account("other").is_err());
    }
}
