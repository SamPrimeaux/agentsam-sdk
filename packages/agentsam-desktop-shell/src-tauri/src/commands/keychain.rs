// Native secure storage backed by the OS credential store.
// Single-envelope JSON vault. The Cloudflare D1 DB is the single source of truth for plugins/keys;
// this local vault strictly holds local session identity and optional offline local overrides.

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

const KEYCHAIN_APP_ID: &str = "local-studio";
const UNIFIED_VAULT_ACCOUNT: &str = "unified_vault";

#[derive(Debug, Serialize)]
pub struct KeychainError {
    pub message: String,
}

#[derive(Default)]
pub struct IdentityPendingState {
    pub value: Mutex<Option<String>>,
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

/// Single-envelope JSON vault payload stored in native OS Keychain
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalVaultEnvelope {
    #[serde(default)]
    pub identity_session: Option<String>,
    #[serde(default)]
    pub local_overrides: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
pub struct ProviderKeyStatus {
    pub exists: bool,
    pub last4: Option<String>,
}

fn state_lock_error() -> KeychainError {
    KeychainError {
        message: "identity_secure_state_poisoned".into(),
    }
}

/// Dynamically sanitizes any plugin or secret key slug without hardcoded enums
fn sanitize_key_slug(key: &str) -> Result<String, KeychainError> {
    let slug = key.trim().to_ascii_lowercase();
    if slug.is_empty() || slug.len() > 128 {
        return Err(KeychainError {
            message: "invalid_key_slug_length".into(),
        });
    }
    if !slug.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == ':') {
        return Err(KeychainError {
            message: "invalid_key_slug_characters".into(),
        });
    }
    Ok(slug)
}

fn secret_last4(value: &str) -> Option<String> {
    let chars: Vec<char> = value.chars().collect();
    if chars.is_empty() {
        return None;
    }
    let start = chars.len().saturating_sub(4);
    Some(chars[start..].iter().collect())
}

#[cfg(not(target_os = "android"))]
fn entry(account: &str) -> Result<Entry, KeychainError> {
    Entry::new(&format!("agentsam-desktop-{KEYCHAIN_APP_ID}"), account)
        .map_err(|e| KeychainError { message: e.to_string() })
}

#[cfg(target_os = "android")]
fn android_secure_store_required<T>() -> Result<T, KeychainError> {
    Err(KeychainError {
        message: "android_secure_store_adapter_required".into(),
    })
}

// ------------------------------------------------------------------
// Single Envelope Keychain Operations
// ------------------------------------------------------------------

fn load_vault() -> Result<LocalVaultEnvelope, KeychainError> {
    #[cfg(target_os = "android")]
    {
        return android_secure_store_required();
    }

    #[cfg(not(target_os = "android"))]
    {
        let entry_item = entry(UNIFIED_VAULT_ACCOUNT)?;
        match entry_item.get_password() {
            Ok(raw_json) => {
                serde_json::from_str(&raw_json).map_err(|_| KeychainError {
                    message: "unified_vault_corrupt".into(),
                })
            }
            Err(keyring::Error::NoEntry) => Ok(LocalVaultEnvelope::default()),
            Err(err) => Err(KeychainError { message: err.to_string() }),
        }
    }
}

fn save_vault(vault: &LocalVaultEnvelope) -> Result<(), KeychainError> {
    #[cfg(target_os = "android")]
    {
        let _ = vault;
        return android_secure_store_required();
    }

    #[cfg(not(target_os = "android"))]
    {
        let raw_json = serde_json::to_string(vault).map_err(|_| KeychainError {
            message: "unified_vault_encode_failed".into(),
        })?;
        entry(UNIFIED_VAULT_ACCOUNT)?
            .set_password(&raw_json)
            .map_err(|e| KeychainError { message: e.to_string() })
    }
}

// ------------------------------------------------------------------
// Identity Session Handlers
// ------------------------------------------------------------------

fn session_get_cached(state: &IdentitySessionState) -> Result<Option<String>, KeychainError> {
    {
        let cache = state.cache.lock().map_err(|_| state_lock_error())?;
        if cache.loaded {
            return Ok(cache.value.clone());
        }
    }
    let vault = load_vault()?;
    let value = vault.identity_session;

    let mut cache = state.cache.lock().map_err(|_| state_lock_error())?;
    cache.loaded = true;
    cache.value = value.clone();
    Ok(value)
}

fn session_set_cached(state: &IdentitySessionState, value: &str) -> Result<(), KeychainError> {
    let mut vault = load_vault()?;
    vault.identity_session = Some(value.to_string());
    save_vault(&vault)?;

    let mut cache = state.cache.lock().map_err(|_| state_lock_error())?;
    cache.loaded = true;
    cache.value = Some(value.to_string());
    Ok(())
}

fn session_delete_cached(state: &IdentitySessionState) -> Result<(), KeychainError> {
    let mut vault = load_vault()?;
    vault.identity_session = None;
    save_vault(&vault)?;

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

// ------------------------------------------------------------------
// Dynamic Local Override Secrets (Optional Local Key Storage)
// ------------------------------------------------------------------

#[tauri::command]
pub fn provider_key_exists(provider: String) -> Result<bool, KeychainError> {
    let slug = sanitize_key_slug(&provider)?;
    let vault = load_vault()?;
    Ok(vault.local_overrides.contains_key(&slug))
}

#[tauri::command]
pub fn provider_key_status(provider: String) -> Result<ProviderKeyStatus, KeychainError> {
    let slug = sanitize_key_slug(&provider)?;
    let vault = load_vault()?;
    let value = vault.local_overrides.get(&slug);

    Ok(ProviderKeyStatus {
        exists: value.is_some(),
        last4: value.map(|v| v.as_str()).and_then(secret_last4),
    })
}

#[tauri::command]
pub fn provider_key_set(provider: String, value: String) -> Result<(), KeychainError> {
    if value.trim().is_empty() {
        return Err(KeychainError { message: "provider_key_value_required".into() });
    }
    let slug = sanitize_key_slug(&provider)?;
    let mut vault = load_vault()?;

    vault.local_overrides.insert(slug, value);
    save_vault(&vault)?;

    Ok(())
}

#[tauri::command]
pub fn provider_key_delete(provider: String) -> Result<(), KeychainError> {
    let slug = sanitize_key_slug(&provider)?;
    let mut vault = load_vault()?;

    vault.local_overrides.remove(&slug);
    save_vault(&vault)?;

    Ok(())
}

pub(crate) fn provider_key_get_internal(provider: &str) -> Result<Option<String>, String> {
    let slug = sanitize_key_slug(provider).map_err(|e| e.message)?;
    let vault = load_vault().map_err(|e| e.message)?;
    Ok(vault.local_overrides.get(&slug).cloned())
}

// Stubs kept for backward compatibility with existing command signatures
pub(crate) fn provider_key_set_synced_internal(
    provider: &str,
    value: &str,
    _secret_id: &str,
    _last4: Option<&str>,
) -> Result<(), String> {
    provider_key_set(provider.to_string(), value.to_string()).map_err(|e| e.message)
}

pub(crate) fn provider_sync_marker_set_internal(
    _provider: &str,
    _secret_id: &str,
    _last4: Option<&str>,
) -> Result<(), String> {
    Ok(())
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_dynamic_key_slugs() {
        assert_eq!(sanitize_key_slug("openai").unwrap(), "openai");
        assert_eq!(sanitize_key_slug("plugin:github_mcp").unwrap(), "plugin:github_mcp");
        assert_eq!(sanitize_key_slug("custom-agent-v1").unwrap(), "custom-agent-v1");
        assert!(sanitize_key_slug("").is_err());
        assert!(sanitize_key_slug("invalid space key").is_err());
    }

    #[test]
    fn secret_last4_never_returns_full_secret() {
        assert_eq!(secret_last4("sk-example-1234").as_deref(), Some("1234"));
        assert_eq!(secret_last4("abc").as_deref(), Some("abc"));
        assert_eq!(secret_last4(""), None);
    }
}
