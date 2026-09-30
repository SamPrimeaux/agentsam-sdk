//! Deterministic frontend-source candidate extraction (TS/JS/TSX/JSX).
//! Emits observed literals and generic *_candidate findings only.
//! Does NOT invent CMS theme identities (hero.cinematic, etc.) — refinery owns that.

use crate::MachineReceipt;
use serde_json::{json, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

const ZONES: &[&str] = &["HEADER", "BODY", "FOOTER", "TEMPLATE"];

pub fn enrich_frontend_source_candidates(root: &Path, receipt: &mut MachineReceipt) {
    let ts_paths: Vec<String> = receipt
        .facts
        .iter()
        .filter(|f| matches!(f.source.type_id.as_str(), "typescript" | "javascript"))
        .map(|f| f.path.clone())
        .collect();
    if ts_paths.is_empty() {
        return;
    }

    let mut route_candidates: BTreeSet<String> = BTreeSet::new();
    let mut shell_candidates: BTreeSet<String> = BTreeSet::new();
    let mut section_keys: BTreeSet<String> = BTreeSet::new();
    let mut section_candidates: Vec<Value> = Vec::new();
    let mut component_candidates: BTreeSet<String> = BTreeSet::new();
    let mut interaction_candidates: BTreeSet<String> = BTreeSet::new();
    let mut design_tokens: BTreeSet<String> = BTreeSet::new();
    let mut repeater_candidates: BTreeSet<String> = BTreeSet::new();
    let mut evidence_fact_ids: BTreeSet<String> = BTreeSet::new();

    for rel in &ts_paths {
        let abs = root.join(rel);
        let Ok(text) = fs::read_to_string(&abs) else {
            continue;
        };
        evidence_fact_ids.insert(format!("file:{rel}"));

        if let Some(route) = app_router_route_from_path(rel) {
            route_candidates.insert(route);
        }

        for slug in extract_slug_literals(&text) {
            route_candidates.insert(slug);
        }

        for zone in ZONES {
            if text.contains(&format!("\"{zone}\"")) || text.contains(&format!("'{zone}'")) {
                shell_candidates.insert((*zone).to_string());
            }
        }

        for cand in extract_section_object_candidates(&text) {
            let key = cand.to_string();
            if section_keys.insert(key) {
                section_candidates.push(cand);
            }
        }

        for name in extract_quoted_string_array_after(&text, "components") {
            component_candidates.insert(name);
        }
        for name in extract_quoted_string_array_after(&text, "templateCards") {
            component_candidates.insert(name);
        }

        for msg in extract_cms_message_types(&text) {
            interaction_candidates.insert(msg);
        }

        for token in extract_css_custom_properties(&text) {
            design_tokens.insert(token);
        }
        for color in extract_hex_colors(&text) {
            design_tokens.insert(color);
        }

        if text.contains(".map(") && (text.contains("sections") || text.contains("pages")) {
            repeater_candidates.insert(format!("file:{rel}"));
        }
    }

    if route_candidates.is_empty()
        && shell_candidates.is_empty()
        && section_candidates.is_empty()
        && component_candidates.is_empty()
        && interaction_candidates.is_empty()
        && design_tokens.is_empty()
    {
        return;
    }

    let route_list: Vec<String> = route_candidates.into_iter().collect();
    let shell_list: Vec<String> = shell_candidates.into_iter().collect();
    let component_list: Vec<String> = component_candidates.into_iter().collect();
    let interaction_list: Vec<String> = interaction_candidates.into_iter().collect();
    let token_list: Vec<String> = design_tokens.into_iter().take(128).collect();
    let repeater_list: Vec<String> = repeater_candidates.into_iter().collect();
    let fact_ids: Vec<String> = evidence_fact_ids.into_iter().collect();

    receipt.findings.push(json!({
        "id": "finding:frontend_source_candidates",
        "kind": "frontend_source_candidates",
        "schema": "agentsam.machine.finding.v1",
        "basis": "observed",
        "evidence": {
            "fact_ids": fact_ids,
            "note": "Generic candidates from TS/JS literals only; CMS identity mapping belongs to the refinery.",
        },
        "candidates": {
            "route_candidate": route_list.clone(),
            "shell_candidate": shell_list.clone(),
            "section_candidate": section_candidates.clone(),
            "component_candidate": component_list.clone(),
            "repeater_candidate": repeater_list.clone(),
            "interaction_candidate": interaction_list.clone(),
            "design_token_evidence": token_list.clone(),
        }
    }));

    // Merge into / refresh frontend_manifest artifact when present.
    let mut merged = false;
    for art in &mut receipt.artifacts {
        if art.get("kind").and_then(|v| v.as_str()) == Some("frontend_manifest") {
            if let Some(data) = art.get_mut("data").and_then(|d| d.as_object_mut()) {
                data.insert("route_candidates".into(), json!(route_list));
                data.insert("shell_candidates".into(), json!(shell_list));
                data.insert("section_candidates".into(), json!(section_candidates));
                data.insert("component_candidates".into(), json!(component_list));
                data.insert("interaction_candidates".into(), json!(interaction_list));
                data.insert("design_token_evidence".into(), json!(token_list));
                data.insert("repeater_candidates".into(), json!(repeater_list));
                merged = true;
            }
        }
    }
    if !merged {
        receipt.artifacts.push(json!({
            "kind": "frontend_manifest",
            "schema": "agentsam.machine.frontend.v1",
            "data": {
                "route_candidates": route_list,
                "shell_candidates": shell_list,
                "section_candidates": section_candidates,
                "component_candidates": component_list,
                "interaction_candidates": interaction_list,
                "design_token_evidence": token_list,
                "repeater_candidates": repeater_list,
                "note": "Candidates from frontend source literals — not normalized CMS primitives.",
            }
        }));
    }
}

fn app_router_route_from_path(rel: &str) -> Option<String> {
    let norm = rel.replace('\\', "/");
    let marker = "/app/";
    let idx = norm.find(marker).or_else(|| {
        if norm.starts_with("app/") {
            Some(0)
        } else {
            None
        }
    })?;
    let after = if norm[idx..].starts_with("app/") {
        &norm[idx + 4..]
    } else {
        &norm[idx + marker.len()..]
    };
    let file = after.rsplit('/').next().unwrap_or(after);
    if !(file == "page.tsx"
        || file == "page.jsx"
        || file == "page.ts"
        || file == "page.js"
        || file == "route.ts"
        || file == "route.js")
    {
        return None;
    }
    let dir = after.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
    if dir.is_empty() {
        return Some("/".to_string());
    }
    let mut parts = Vec::new();
    for seg in dir.split('/') {
        if seg.is_empty() || seg.starts_with('(') && seg.ends_with(')') {
            continue; // route groups
        }
        if seg.starts_with('@') {
            continue; // parallel routes
        }
        if seg.starts_with('[') && seg.ends_with(']') {
            parts.push(format!(
                ":{}",
                seg.trim_matches(|c| c == '[' || c == ']' || c == '.')
            ));
            continue;
        }
        parts.push(seg.to_string());
    }
    if parts.is_empty() {
        Some("/".to_string())
    } else {
        Some(format!("/{}", parts.join("/")))
    }
}

fn extract_slug_literals(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for (prefix, quote) in [
        ("slug: \"", '"'),
        ("slug: '", '\''),
        ("slug:\"", '"'),
        ("slug:'", '\''),
    ] {
        let mut search = text;
        while let Some(idx) = search.find(prefix) {
            let rest = &search[idx + prefix.len()..];
            if let Some(end) = rest.find(quote) {
                let slug = &rest[..end];
                if slug.starts_with('/') && slug.len() < 128 && !slug.contains(' ') {
                    out.push(slug.to_string());
                }
                search = &rest[end + 1..];
            } else {
                break;
            }
        }
    }
    out
}

fn floor_char_boundary(text: &str, index: usize) -> usize {
    let mut boundary = index.min(text.len());
    while boundary > 0 && !text.is_char_boundary(boundary) {
        boundary -= 1;
    }
    boundary
}

fn extract_section_object_candidates(text: &str) -> Vec<Value> {
    // Look for compact object literals with type + zone nearby: type: "Hero", zone: "BODY"
    let mut out = Vec::new();
    let mut search = text;
    while let Some(type_idx) = find_type_literal(search) {
        let window_start = floor_char_boundary(search, type_idx.saturating_sub(80));
        let window_end = floor_char_boundary(search, (type_idx + 200).min(search.len()));
        let window = &search[window_start..window_end];
        let Some((section_type, _)) = quoted_after(window, "type:") else {
            search = &search[type_idx + 5..];
            continue;
        };
        let zone = quoted_after(window, "zone:")
            .map(|(z, _)| z)
            .filter(|z| ZONES.contains(&z.as_str()));
        let name = quoted_after(window, "name:").map(|(n, _)| n);
        // Require an explicit layout zone so Toast/Page status types are not candidates.
        if let Some(z) = zone {
            let mut obj = serde_json::Map::new();
            obj.insert("type".into(), json!(section_type));
            obj.insert("zone".into(), json!(z));
            if let Some(n) = name {
                obj.insert("name".into(), json!(n));
            }
            out.push(Value::Object(obj));
        }
        search = &search[type_idx + 5..];
        if out.len() >= 64 {
            break;
        }
    }
    out
}

fn find_type_literal(text: &str) -> Option<usize> {
    text.find("type: \"")
        .or_else(|| text.find("type: '"))
        .or_else(|| text.find("type:\"").or_else(|| text.find("type:'")))
}

fn quoted_after(text: &str, key: &str) -> Option<(String, usize)> {
    let idx = text.find(key)?;
    let rest = text[idx + key.len()..].trim_start();
    let quote = rest.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let inner = &rest[1..];
    let end = inner.find(quote)?;
    Some((inner[..end].to_string(), idx))
}

fn extract_quoted_string_array_after(text: &str, binding: &str) -> Vec<String> {
    let patterns = [
        format!("const {binding} = ["),
        format!("const {binding}=["),
        format!("let {binding} = ["),
        format!("{binding}: ["),
    ];
    let mut out = Vec::new();
    for pat in &patterns {
        if let Some(idx) = text.find(pat) {
            let rest = &text[idx + pat.len()..];
            let end = rest.find(']').unwrap_or(rest.len().min(2000));
            let body = &rest[..end];
            out.extend(extract_quoted_strings(body));
            break;
        }
    }
    out
}

fn extract_quoted_strings(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'"' || b == b'\'' {
            let q = b;
            i += 1;
            let start = i;
            while i < bytes.len() && bytes[i] != q {
                if bytes[i] == b'\\' && i + 1 < bytes.len() {
                    i += 2;
                    continue;
                }
                i += 1;
            }
            if i <= bytes.len() {
                let s = &text[start..i.min(text.len())];
                if !s.is_empty() && s.len() < 120 {
                    out.push(s.to_string());
                }
            }
        }
        i += 1;
    }
    out
}

fn extract_cms_message_types(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut search = text;
    while let Some(idx) = search.find("cms:") {
        let rest = &search[idx..];
        let end = rest
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == ':' || c == '-' || c == '_'))
            .unwrap_or(rest.len().min(48));
        let token = &rest[..end];
        if token.starts_with("cms:") && token.len() > 4 {
            out.push(token.to_string());
        }
        search = &search[idx + 4..];
    }
    out
}

fn extract_css_custom_properties(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut search = text;
    while let Some(idx) = search.find("--") {
        let rest = &search[idx..];
        let name_end = rest[2..]
            .find(|c: char| !(c.is_ascii_alphanumeric() || c == '-' || c == '_'))
            .map(|i| i + 2)
            .unwrap_or(rest.len().min(64));
        if name_end > 3 {
            let name = &rest[..name_end];
            if name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                out.push(name.to_string());
            }
        }
        search = &search[idx + 2..];
        if out.len() >= 64 {
            break;
        }
    }
    out
}

fn extract_hex_colors(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'#' {
            let start = i;
            i += 1;
            let mut len = 0;
            while i < bytes.len() && bytes[i].is_ascii_hexdigit() && len < 8 {
                i += 1;
                len += 1;
            }
            if len == 3 || len == 6 || len == 8 {
                out.push(text[start..start + 1 + len].to_ascii_lowercase());
            }
            continue;
        }
        i += 1;
        if out.len() >= 64 {
            break;
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_router_route_from_studio_page() {
        assert_eq!(
            app_router_route_from_path("app/studio/page.tsx").as_deref(),
            Some("/studio")
        );
        assert_eq!(
            app_router_route_from_path("app/page.tsx").as_deref(),
            Some("/")
        );
    }

    #[test]
    fn section_candidate_windows_are_utf8_safe() {
        for tail in ["a", "\u{00a0}", "é", "🙂"] {
            let source = format!(
                "const section = {{ type: \"Hero\", zone: \"BODY\", name: \"Café\" }};{}",
                tail.repeat(220)
            );
            let candidates = extract_section_object_candidates(&source);
            assert_eq!(candidates.len(), 1, "failed for tail {tail:?}");
            assert_eq!(candidates[0]["type"], "Hero");
            assert_eq!(candidates[0]["zone"], "BODY");
        }
    }
}
