//! Deterministic enrichment: findings, edges, artifacts from classified facts.
use crate::{FileFact, MachineReceipt};
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

pub fn enrich_receipt(root: &Path, receipt: &mut MachineReceipt) {
    let mut by_source: BTreeMap<String, usize> = BTreeMap::new();
    let mut by_kind: BTreeMap<String, usize> = BTreeMap::new();
    let mut html_paths: Vec<String> = Vec::new();
    let mut svg_paths: Vec<String> = Vec::new();
    let mut theme_json: Option<String> = None;

    for fact in &receipt.facts {
        if let Some(ref id) = fact.source.type_id {
            *by_source.entry(id.clone()).or_default() += 1;
        }
        if let Some(ref kind) = fact.source.kind {
            *by_kind.entry(kind.clone()).or_default() += 1;
        }
        match fact.source.type_id.as_deref() {
            Some("html") => html_paths.push(fact.path.clone()),
            Some("svg") => svg_paths.push(fact.path.clone()),
            Some("json") if fact.path.ends_with("theme.json") || fact.path == "theme.json" => {
                theme_json = Some(fact.path.clone());
            }
            _ => {}
        }
    }

    // Language / inventory summary finding
    receipt.findings.push(json!({
        "kind": "inventory_summary",
        "schema": "agentsam.machine.finding.v1",
        "source_type_counts": by_source,
        "source_kind_counts": by_kind,
        "file_count": receipt.stats.files,
        "bytes": receipt.stats.bytes,
        "excluded_subtrees": receipt.stats.excluded_subtrees,
    }));

    if !html_paths.is_empty() {
        enrich_static_site(root, receipt, &html_paths, &svg_paths, theme_json.as_deref());
    }

    // Derived inventory artifact always
    receipt.artifacts.push(json!({
        "kind": "inventory_summary",
        "schema": "agentsam.machine.inventory.v1",
        "data": {
            "source_type_counts": by_source,
            "source_kind_counts": by_kind,
            "files": receipt.stats.files,
            "bytes": receipt.stats.bytes,
            "ignored_directories": receipt.stats.ignored_directories,
            "excluded_subtrees": receipt.stats.excluded_subtrees,
        }
    }));
}

fn enrich_static_site(
    root: &Path,
    receipt: &mut MachineReceipt,
    html_paths: &[String],
    svg_paths: &[String],
    theme_json: Option<&str>,
) {
    let mut routes: BTreeSet<String> = BTreeSet::new();
    let mut nav_pairs: BTreeSet<(String, String, String)> = BTreeSet::new();
    let mut asset_refs: BTreeSet<(String, String)> = BTreeSet::new();
    let mut shared_nav_labels: BTreeMap<String, usize> = BTreeMap::new();
    let mut css_var_hits = 0usize;
    let mut header_hits = 0usize;
    let mut footer_hits = 0usize;

    for rel in html_paths {
        routes.insert(route_from_html_path(rel));
        let abs = root.join(rel);
        let Ok(text) = fs::read_to_string(&abs) else {
            continue;
        };
        if text.contains(":root") && text.contains("--") {
            css_var_hits += 1;
        }
        if text.to_ascii_lowercase().contains("<header") {
            header_hits += 1;
        }
        if text.to_ascii_lowercase().contains("<footer") {
            footer_hits += 1;
        }

        for (href, label) in extract_anchors(&text) {
            if href.starts_with("mailto:") || href.starts_with("tel:") || href.starts_with('#') {
                continue;
            }
            if looks_like_asset(&href) {
                let target = normalize_ref(rel, &href);
                asset_refs.insert((rel.clone(), target));
                continue;
            }
            if let Some(route) = href_to_route(&href) {
                nav_pairs.insert((rel.clone(), route.clone(), label.clone()));
                if !label.is_empty() {
                    *shared_nav_labels.entry(label.clone()).or_default() += 1;
                }
                receipt.edges.push(json!({
                    "from": format!("file:{rel}"),
                    "to": format!("route:{route}"),
                    "type": "navigation_link",
                    "label": label,
                }));
            }
        }

        for src in extract_attr(&text, "src") {
            if looks_like_asset(&src) {
                let target = normalize_ref(rel, &src);
                asset_refs.insert((rel.clone(), target.clone()));
                receipt.edges.push(json!({
                    "from": format!("file:{rel}"),
                    "to": format!("file:{target}"),
                    "type": "asset_reference",
                }));
            }
        }
    }

    for (from, to) in &asset_refs {
        // Already pushed for src; ensure href-based assets are edged too
        if receipt.edges.iter().any(|e| {
            e.get("from") == Some(&json!(format!("file:{from}")))
                && e.get("to") == Some(&json!(format!("file:{to}")))
                && e.get("type") == Some(&json!("asset_reference"))
        }) {
            continue;
        }
        receipt.edges.push(json!({
            "from": format!("file:{from}"),
            "to": format!("file:{to}"),
            "type": "asset_reference",
        }));
    }

    if let Some(theme) = theme_json {
        for rel in html_paths {
            receipt.edges.push(json!({
                "from": format!("file:{theme}"),
                "to": format!("file:{rel}"),
                "type": "theme_applies_to",
            }));
        }
        receipt.findings.push(json!({
            "kind": "theme_candidate",
            "schema": "agentsam.machine.finding.v1",
            "confidence": 0.95,
            "evidence": [
                format!("theme_manifest:{theme}"),
                format!("html_pages:{}", html_paths.len()),
                format!("svg_assets:{}", svg_paths.len()),
            ],
        }));
    }

    let shared_nav: Vec<String> = shared_nav_labels
        .into_iter()
        .filter(|(_, c)| *c >= 2)
        .map(|(label, _)| label)
        .collect();

    receipt.findings.push(json!({
        "kind": "project",
        "type": "static_website",
        "confidence": if theme_json.is_some() { 0.99 } else { 0.9 },
        "html_pages": html_paths.len(),
        "routes": routes.len(),
    }));

    receipt.findings.push(json!({
        "kind": "frontend",
        "pages": html_paths.len(),
        "routes": routes.iter().cloned().collect::<Vec<_>>(),
        "shared_navigation_labels": shared_nav,
        "header_pages": header_hits,
        "footer_pages": footer_hits,
        "css_custom_property_pages": css_var_hits,
    }));

    if !svg_paths.is_empty() {
        receipt.findings.push(json!({
            "kind": "asset_family",
            "type": "svg_icons",
            "count": svg_paths.len(),
            "paths": svg_paths,
        }));
    }

    let route_list: Vec<String> = routes.iter().cloned().collect();
    receipt.artifacts.push(json!({
        "kind": "route_manifest",
        "schema": "agentsam.machine.routes.v1",
        "data": { "routes": route_list }
    }));

    receipt.artifacts.push(json!({
        "kind": "frontend_manifest",
        "schema": "agentsam.machine.frontend.v1",
        "data": {
            "html_pages": html_paths,
            "svg_assets": svg_paths,
            "theme_manifest": theme_json,
            "navigation_edge_count": nav_pairs.len(),
            "asset_reference_count": asset_refs.len(),
        }
    }));

    if !svg_paths.is_empty() {
        receipt.artifacts.push(json!({
            "kind": "asset_inventory",
            "schema": "agentsam.machine.assets.v1",
            "data": {
                "count": svg_paths.len(),
                "paths": svg_paths,
                "type": "svg",
            }
        }));
    }

    if let Some(theme) = theme_json {
        receipt.artifacts.push(json!({
            "kind": "theme_evidence",
            "schema": "agentsam.machine.theme.v1",
            "data": {
                "manifest": theme,
                "page_count": html_paths.len(),
                "css_custom_property_pages": css_var_hits,
            }
        }));
    }
}

fn route_from_html_path(rel: &str) -> String {
    let name = Path::new(rel)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("page");
    if name.eq_ignore_ascii_case("index") || name.eq_ignore_ascii_case("home") {
        "/".to_string()
    } else {
        format!("/{}", name.to_ascii_lowercase().replace(' ', "-"))
    }
}

fn href_to_route(href: &str) -> Option<String> {
    let clean = href.split(['?', '#']).next().unwrap_or(href).trim();
    if clean.is_empty() || clean.starts_with("http://") || clean.starts_with("https://") {
        return None;
    }
    if clean.ends_with(".html") || clean.ends_with(".htm") {
        let name = Path::new(clean)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("page");
        return Some(if name.eq_ignore_ascii_case("index") {
            "/".to_string()
        } else {
            format!("/{}", name.to_ascii_lowercase())
        });
    }
    if clean.starts_with('/') {
        let trimmed = clean.trim_end_matches('/');
        return Some(if trimmed.is_empty() {
            "/".to_string()
        } else {
            trimmed.to_string()
        });
    }
    None
}

fn looks_like_asset(href: &str) -> bool {
    let lower = href.to_ascii_lowercase();
    [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".css", ".js", ".woff", ".woff2"]
        .iter()
        .any(|ext| lower.contains(ext))
}

fn normalize_ref(from_rel: &str, href: &str) -> String {
    let clean = href.split(['?', '#']).next().unwrap_or(href).trim();
    if clean.starts_with('/') {
        return clean.trim_start_matches('/').to_string();
    }
    let parent = Path::new(from_rel).parent().unwrap_or_else(|| Path::new(""));
    parent
        .join(clean)
        .components()
        .fold(std::path::PathBuf::new(), |mut acc, c| {
            use std::path::Component;
            match c {
                Component::ParentDir => {
                    acc.pop();
                }
                Component::Normal(s) => acc.push(s),
                Component::CurDir => {}
                _ => {}
            }
            acc
        })
        .to_string_lossy()
        .replace('\\', "/")
}

fn extract_anchors(html: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let lower = html;
    let mut search = lower;
    while let Some(idx) = search.find("<a ") {
        let slice = &search[idx..];
        let end = slice.find('>').unwrap_or(slice.len());
        let tag = &slice[..end];
        let href = attr_value(tag, "href").unwrap_or_default();
        let after = &slice[end.saturating_add(1)..];
        let label = if let Some(close) = after.to_ascii_lowercase().find("</a>") {
            strip_tags(&after[..close]).trim().to_string()
        } else {
            String::new()
        };
        if !href.is_empty() {
            out.push((href, label));
        }
        search = &slice[1..];
    }
    out
}

fn extract_attr(html: &str, name: &str) -> Vec<String> {
    let mut out = Vec::new();
    let needle = format!("{name}=");
    let mut search = html;
    while let Some(idx) = search.to_ascii_lowercase().find(&needle) {
        let slice = &search[idx + needle.len()..];
        if let Some(v) = quoted_value(slice) {
            out.push(v);
        }
        search = &search[idx + 1..];
    }
    out
}

fn attr_value(tag: &str, name: &str) -> Option<String> {
    let needle = format!("{name}=");
    let lower = tag.to_ascii_lowercase();
    let idx = lower.find(&needle)?;
    quoted_value(&tag[idx + needle.len()..])
}

fn quoted_value(slice: &str) -> Option<String> {
    let bytes = slice.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let q = bytes[0];
    if q == b'"' || q == b'\'' {
        let rest = &slice[1..];
        let end = rest.find(q as char)?;
        return Some(rest[..end].to_string());
    }
    None
}

fn strip_tags(input: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out
}

#[allow(dead_code)]
pub fn fact_by_path<'a>(facts: &'a [FileFact], path: &str) -> Option<&'a FileFact> {
    facts.iter().find(|f| f.path == path)
}
