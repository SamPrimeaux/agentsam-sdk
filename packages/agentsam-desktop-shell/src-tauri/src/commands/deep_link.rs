// Scheme is registered declaratively via tauri.conf.json.
// Deep links are transport only. Identity/provider packages own interpretation.

use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{App, AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;

#[derive(Default)]
pub struct DeepLinkState {
    queued: Mutex<Vec<String>>,
    delivered: Mutex<HashSet<String>>,
}

impl DeepLinkState {
    fn queue(&self, url: String) {
        if let Ok(mut queued) = self.queued.lock() {
            queued.push(url);
        }
    }

    fn take_new(&self, mut candidates: Vec<String>) -> Vec<String> {
        if let Ok(mut queued) = self.queued.lock() {
            candidates.extend(queued.drain(..));
        }

        let Ok(mut delivered) = self.delivered.lock() else {
            return Vec::new();
        };

        candidates
            .into_iter()
            .filter(|url| delivered.insert(url.clone()))
            .collect()
    }
}

pub fn register_scheme(app: &App) -> tauri::Result<()> {
    let handle = app.handle().clone();
    app.deep_link().on_open_url(move |event| {
        let state = handle.state::<DeepLinkState>();
        for url in event.urls() {
            let url = url.to_string();
            state.queue(url.clone());
            // Best-effort fast path. The frontend also drains the native queue,
            // so event delivery is not the correctness boundary.
            let _ = handle.emit("agentsam://deep-link", url);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn take_pending_deep_links(
    app: AppHandle,
    state: State<'_, DeepLinkState>,
) -> Result<Vec<String>, String> {
    let mut candidates = Vec::new();
    if let Some(urls) = app
        .deep_link()
        .get_current()
        .map_err(|error| format!("deep_link_current_failed:{error}"))?
    {
        candidates.extend(urls.into_iter().map(|url| url.to_string()));
    }
    Ok(state.take_new(candidates))
}

#[tauri::command]
pub fn handle_callback(
    app: AppHandle,
    state: State<'_, DeepLinkState>,
    url: String,
) -> Result<(), String> {
    state.queue(url.clone());
    app.emit("agentsam://deep-link", url)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_delivers_each_url_once() {
        let state = DeepLinkState::default();
        state.queue("agentsamstudio://auth/callback?handoff=one".into());
        assert_eq!(
            state.take_new(Vec::new()),
            vec!["agentsamstudio://auth/callback?handoff=one"]
        );
        assert!(state
            .take_new(vec!["agentsamstudio://auth/callback?handoff=one".into()])
            .is_empty());
    }
}
