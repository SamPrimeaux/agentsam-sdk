// Native secure storage backed by the OS credential store.
// The webview surface is deliberately narrow:
// - native identity session reads/writes are Rust-internal only.
// - OAuth pending state is write/delete only from the webview.
// - provider keys expose exists/set/delete only; provider_key_get is Rust-internal.

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

const KEYCHAIN_APP_ID: &str = "local-studio";
const IDENTITY_SESSION_ACCOUNT: &str = "identity_session";
const PROVIDER_PREFIX: &str = "provider:";
const PROVIDER_SYNC_PREFIX: &str = "provider-sync:";

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

fn provider_sync_account(provider: &str) -> Result<String, KeychainError> {
    Ok(format!("{PROVIDER_SYNC_PREFIX}{}", canonical_provider(provider)?))
}

fn secret_last4(value: &str) -> Option<String> {
    let chars: Vec<char> = value.chars().collect();
    if chars.is_empty() {
        return None;
    }
    let start = chars.len().saturating_sub(4);
    Some(chars[start..].iter().collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProviderSyncMarker {
    secret_id: String,
    #[serde(default)]
    last4: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProviderKeyStatus {
    exists: bool,
    last4: Option<String>,
    synced_secret_id: Option<String>,
    synced_last4: Option<String>,
}

fn provider_sync_marker_get(provider: &str) -> Result<Option<ProviderSyncMarker>, KeychainError> {
    let Some(raw) = get_value(provider_sync_account(provider)?.as_str())? else {
        return Ok(None);
    };
    let marker = serde_json::from_str::<ProviderSyncMarker>(&raw)
        .map_err(|_| KeychainError { message: "provider_sync_marker_invalid".into() })?;
    Ok(Some(marker))
}

fn provider_sync_marker_set(
    provider: &str,
    secret_id: &str,
    last4: Option<&str>,
) -> Result<(), KeychainError> {
    let secret_id = secret_id.trim();
    if secret_id.is_empty() || secret_id.len() > 256 {
        return Err(KeychainError { message: "provider_sync_secret_id_invalid".into() });
    }
    let marker = ProviderSyncMarker {
        secret_id: secret_id.to_string(),
        last4: last4.map(str::to_string),
    };
    let raw = serde_json::to_string(&marker)
        .map_err(|_| KeychainError { message: "provider_sync_marker_encode_failed".into() })?;
    set_value(provider_sync_account(provider)?.as_str(), raw.as_str())
}

fn provider_sync_marker_delete(provider: &str) -> Result<(), KeychainError> {
    delete_value(provider_sync_account(provider)?.as_str())
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
pub fn provider_key_status(provider: String) -> Result<ProviderKeyStatus, KeychainError> {
    let value = get_value(provider_account(provider.as_str())?.as_str())?;
    let marker = provider_sync_marker_get(provider.as_str())?;
    Ok(ProviderKeyStatus {
        exists: value.is_some(),
        last4: value.as_deref().and_then(secret_last4),
        synced_secret_id: marker.as_ref().map(|value| value.secret_id.clone()),
        synced_last4: marker.and_then(|value| value.last4),
    })
}

#[tauri::command]
pub fn provider_key_set(provider: String, value: String) -> Result<(), KeychainError> {
    if value.trim().is_empty() {
        return Err(KeychainError { message: "provider_key_value_required".into() });
    }
    set_value(provider_account(provider.as_str())?.as_str(), value.as_str())?;
    // A direct device edit is unsynced until the service confirms the account copy.
    provider_sync_marker_delete(provider.as_str())?;
    Ok(())
}

#[tauri::command]
pub fn provider_key_delete(provider: String) -> Result<(), KeychainError> {
    delete_value(provider_account(provider.as_str())?.as_str())?;
    provider_sync_marker_delete(provider.as_str())?;
    Ok(())
}

pub(crate) fn provider_key_get_internal(provider: &str) -> Result<Option<String>, String> {
    let account = provider_account(provider).map_err(|error| error.message)?;
    get_value(account.as_str()).map_err(|error| error.message)
}

pub(crate) fn provider_key_set_synced_internal(
    provider: &str,
    value: &str,
    secret_id: &str,
    last4: Option<&str>,
) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err("provider_key_value_required".into());
    }
    let account = provider_account(provider).map_err(|error| error.message)?;
    set_value(account.as_str(), value).map_err(|error| error.message)?;
    if let Err(error) = provider_sync_marker_set(provider, secret_id, last4) {
        let _ = delete_value(account.as_str());
        return Err(error.message);
    }
    Ok(())
}

pub(crate) fn provider_sync_marker_set_internal(
    provider: &str,
    secret_id: &str,
    last4: Option<&str>,
) -> Result<(), String> {
    provider_sync_marker_set(provider, secret_id, last4).map_err(|error| error.message)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_accounts_use_canonical_ids() {
        assert_eq!(provider_account("openai").unwrap(), "provider:openai");
        assert_eq!(provider_account("xai").unwrap(), "provider:xai");
        assert_eq!(provider_sync_account("openai").unwrap(), "provider-sync:openai");
        assert!(provider_account("grok").is_err());
        assert!(provider_account("other").is_err());
    }

    #[test]
    fn provider_status_last4_never_returns_full_secret() {
        assert_eq!(secret_last4("sk-example-1234").as_deref(), Some("1234"));
        assert_eq!(secret_last4("abc").as_deref(), Some("abc"));
        assert_eq!(secret_last4(""), None);
    }
}
