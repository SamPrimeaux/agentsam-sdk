// Native secure storage backed by the OS credential store.
// Refactored to a single-envelope JSON vault to prevent multiple OS security prompts.

#[cfg(not(target_os = "android"))]
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::State;

const KEYCHAIN_APP_ID: &str = "local-studio";
const UNIFIED_VAULT_ACCOUNT: &str = "unified_vault";

// Legacy keys for migration
const IDENTITY_SESSION_ACCOUNT: &str = "identity_session";
const PROVIDER_PREFIX: &str = "provider:";
const PROVIDER_SYNC_PREFIX: &str = "provider-sync:";

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
    pub cache: Mutex<IdentitySessionCache>,
}

#[derive(Default)]
struct IdentitySessionCache {
    loaded: bool,
    value: Option<String>,
}

/// Consolidated single-item vault payload stored in the OS Keychain
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LocalVaultEnvelope {
    #[serde(default)]
    pub identity_session: Option<String>,
    #[serde(default)]
    pub provider_keys: HashMap<String, String>,
    #[serde(default)]
    pub sync_markers: HashMap<String, ProviderSyncMarker>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSyncMarker {
    pub secret_id: String,
    #[serde(default)]
    pub last4: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProviderKeyStatus {
    pub exists: bool,
    pub last4: Option<String>,
    pub synced_secret_id: Option<String>,
    pub synced_last4: Option<String>,
}

fn state_lock_error() -> KeychainError {
    KeychainError {
        message: "identity_secure_state_poisoned".into(),
    }
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
        _ => Err(KeychainError {
            message: "provider_key_provider_invalid".into(),
        }),
    }
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
// Core Single Envelope Vault Operations
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
            Err(keyring::Error::NoEntry) => {
                // Attempt automatic migration from legacy multi-entry keychain items
                let migrated = migrate_legacy_vault()?;
                save_vault(&migrated)?;
                Ok(migrated)
            }
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

/// Fallback migration for existing installations with individual Keychain entries
fn migrate_legacy_vault() -> Result<LocalVaultEnvelope, KeychainError> {
    #[cfg(target_os = "android")]
    {
        return android_secure_store_required();
    }

    #[cfg(not(target_os = "android"))]
    {
        let mut vault = LocalVaultEnvelope::default();

        // 1. Migrate Identity Session
        if let Ok(item) = entry(IDENTITY_SESSION_ACCOUNT) {
            if let Ok(val) = item.get_password() {
                vault.identity_session = Some(val);
            }
        }

        // 2. Migrate Provider Keys
        let providers = ["openai", "anthropic", "gemini", "cursor", "xai", "cloudflare", "inneranimalmedia"];
        for provider in providers {
            let key_account = format!("{PROVIDER_PREFIX}{provider}");
            if let Ok(item) = entry(&key_account) {
                if let Ok(val) = item.get_password() {
                    vault.provider_keys.insert(provider.to_string(), val);
                }
            }

            let sync_account = format!("{PROVIDER_SYNC_PREFIX}{provider}");
            if let Ok(item) = entry(&sync_account) {
                if let Ok(raw_marker) = item.get_password() {
                    if let Ok(marker) = serde_json::from_str::<ProviderSyncMarker>(&raw_marker) {
                        vault.sync_markers.insert(provider.to_string(), marker);
                    }
                }
            }
        }

        Ok(vault)
    }
}

// ------------------------------------------------------------------
// Identity & Session Handlers
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
// Provider Keys IPC Operations
// ------------------------------------------------------------------

#[tauri::command]
pub fn provider_key_exists(provider: String) -> Result<bool, KeychainError> {
    let canon = canonical_provider(&provider)?;
    let vault = load_vault()?;
    Ok(vault.provider_keys.contains_key(canon))
}

#[tauri::command]
pub fn provider_key_status(provider: String) -> Result<ProviderKeyStatus, KeychainError> {
    let canon = canonical_provider(&provider)?;
    let vault = load_vault()?;

    let value = vault.provider_keys.get(canon);
    let marker = vault.sync_markers.get(canon);

    Ok(ProviderKeyStatus {
        exists: value.is_some(),
        last4: value.as_deref().and_then(secret_last4),
        synced_secret_id: marker.as_ref().map(|m| m.secret_id.clone()),
        synced_last4: marker.and_then(|m| m.last4.clone()),
    })
}

#[tauri::command]
pub fn provider_key_set(provider: String, value: String) -> Result<(), KeychainError> {
    if value.trim().is_empty() {
        return Err(KeychainError { message: "provider_key_value_required".into() });
    }
    let canon = canonical_provider(&provider)?;
    let mut vault = load_vault()?;

    vault.provider_keys.insert(canon.to_string(), value);
    vault.sync_markers.remove(canon); // Local edit invalidates sync marker
    save_vault(&vault)?;

    Ok(())
}

#[tauri::command]
pub fn provider_key_delete(provider: String) -> Result<(), KeychainError> {
    let canon = canonical_provider(&provider)?;
    let mut vault = load_vault()?;

    vault.provider_keys.remove(canon);
    vault.sync_markers.remove(canon);
    save_vault(&vault)?;

    Ok(())
}

pub(crate) fn provider_key_get_internal(provider: &str) -> Result<Option<String>, String> {
    let canon = canonical_provider(provider).map_err(|e| e.message)?;
    let vault = load_vault().map_err(|e| e.message)?;
    Ok(vault.provider_keys.get(canon).cloned())
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
    let canon = canonical_provider(provider).map_err(|e| e.message)?;
    let secret_id = secret_id.trim();
    if secret_id.is_empty() || secret_id.len() > 256 {
        return Err("provider_sync_secret_id_invalid".into());
    }

    let mut vault = load_vault().map_err(|e| e.message)?;
    vault.provider_keys.insert(canon.to_string(), value.to_string());
    vault.sync_markers.insert(
        canon.to_string(),
        ProviderSyncMarker {
            secret_id: secret_id.to_string(),
            last4: last4.map(str::to_string),
        },
    );

    save_vault(&vault).map_err(|e| e.message)
}

pub(crate) fn provider_sync_marker_set_internal(
    provider: &str,
    secret_id: &str,
    last4: Option<&str>,
) -> Result<(), String> {
    let canon = canonical_provider(provider).map_err(|e| e.message)?;
    let secret_id = secret_id.trim();
    if secret_id.is_empty() || secret_id.len() > 256 {
        return Err("provider_sync_secret_id_invalid".into());
    }

    let mut vault = load_vault().map_err(|e| e.message)?;
    vault.sync_markers.insert(
        canon.to_string(),
        ProviderSyncMarker {
            secret_id: secret_id.to_string(),
            last4: last4.map(str::to_string),
        },
    );

    save_vault(&vault).map_err(|e| e.message)
}

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_canonical_ids_validate() {
        assert_eq!(canonical_provider("openai").unwrap(), "openai");
        assert_eq!(canonical_provider("xai").unwrap(), "xai");
        assert!(canonical_provider("grok").is_err());
        assert!(canonical_provider("other").is_err());
    }

    #[test]
    fn provider_status_last4_never_returns_full_secret() {
        assert_eq!(secret_last4("sk-example-1234").as_deref(), Some("1234"));
        assert_eq!(secret_last4("abc").as_deref(), Some("abc"));
        assert_eq!(secret_last4(""), None);
    }
}
