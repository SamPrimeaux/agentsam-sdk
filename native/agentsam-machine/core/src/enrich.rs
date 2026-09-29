//! Deterministic enrichment: findings, edges, artifacts from classified facts.
use crate::assets::enrich_assets;
use crate::frontend::enrich_frontend_source_candidates;
use crate::liquid::enrich_liquid_structure;
use crate::{FileFact, MachineReceipt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

pub fn enrich_receipt(root: &Path, receipt: &mut MachineReceipt) {
    let mut by_source: BTreeMap<String, usize> = BTreeMap::new();
    let mut by_kind: BTreeMap<String, usize> = BTreeMap::new();
    let mut html_paths: Vec<String> = Vec::new();
    let mut svg_paths: Vec<String> = Vec::new();
    let mut liquid_paths: Vec<String> = Vec::new();
    let mut ts_paths: Vec<String> = Vec::new();
    let mut theme_json: Option<String> = None;
    let mut package_json: Option<String> = None;
    let mut all_fact_ids: Vec<String> = Vec::new();

    for fact in &receipt.facts {
        all_fact_ids.push(fact.id.clone());
        *by_source.entry(fact.source.type_id.clone()).or_default() += 1;
        if let Some(ref kind) = fact.source.kind {
            *by_kind.entry(kind.clone()).or_default() += 1;
        }
        match fact.source.type_id.as_str() {
            "html" => html_paths.push(fact.path.clone()),
            "svg" => svg_paths.push(fact.path.clone()),
            "liquid" => liquid_paths.push(fact.path.clone()),
            "typescript" | "javascript" => ts_paths.push(fact.path.clone()),
            "json" if fact.path.ends_with("theme.json") || fact.path == "theme.json" => {
                theme_json = Some(fact.path.clone());
            }
            "json" if fact.path == "package.json" || fact.path.ends_with("/package.json") => {
                package_json = Some(fact.path.clone());
            }
            _ => {}
        }
    }

    receipt.findings.push(json!({
        "id": "finding:inventory_summary",
        "kind": "inventory_summary",
        "schema": "agentsam.machine.finding.v1",
        "basis": "observed",
        "evidence": {
            "fact_ids": all_fact_ids.iter().take(64).cloned().collect::<Vec<_>>(),
            "fact_count": all_fact_ids.len(),
            "stats_files": receipt.stats.files,
            "stats_bytes": receipt.stats.bytes,
        },
        "source_type_counts": by_source,
        "source_kind_counts": by_kind,
        "file_count": receipt.stats.files,
        "bytes": receipt.stats.bytes,
        "excluded_subtrees": receipt.stats.excluded_subtrees,
        "skipped_noise_files": receipt.stats.skipped_noise_files,
    }));

    emit_composition_observations(
        receipt,
        &html_paths,
        &liquid_paths,
        &ts_paths,
        theme_json.as_deref(),
        package_json.as_deref(),
        &by_source,
    );

    if !html_paths.is_empty() {
        enrich_html_documents(root, receipt, &html_paths, &svg_paths, theme_json.as_deref());
    }

    enrich_liquid_structure(root, receipt);
    enrich_assets(root, receipt);
    // Transitional: line-oriented import literals only. Do not expand into regex.
    // Target: TS/JS/JSX/TSX → AST → ImportDeclaration/ExportDeclaration → edges.
    enrich_ts_imports_transitional(root, receipt, &ts_paths);
    enrich_frontend_source_candidates(root, receipt);

    receipt.artifacts.push(json!({
        "kind": "inventory_summary",
        "schema": "agentsam.machine.inventory.v1",
        "data": {
            "source_type_counts": by_source,
            "source_kind_counts": by_kind,
            "files": receipt.stats.files,
            "bytes": receipt.stats.bytes,
            "ignored_directories": receipt.stats.ignored_directories,
            "skipped_noise_files": receipt.stats.skipped_noise_files,
            "excluded_subtrees": receipt.stats.excluded_subtrees,
        }
    }));

    finalize_edge_ids(receipt);
}

/// Emit literal composition observations — never premature capability labels,
/// never a single exclusive project bucket.
fn emit_composition_observations(
    receipt: &mut MachineReceipt,
    html_paths: &[String],
    liquid_paths: &[String],
    ts_paths: &[String],
    theme_json: Option<&str>,
    package_json: Option<&str>,
    by_source: &BTreeMap<String, usize>,
) {
    let mut composition = serde_json::Map::new();

    if !html_paths.is_empty() {
        let fact_ids: Vec<String> = html_paths
            .iter()
            .take(32)
            .map(|p| format!("file:{p}"))
            .collect();
        let obs = json!({
            "basis": "observed",
            "evidence": {
                "fact_ids": fact_ids,
                "fact_count": html_paths.len(),
                "count": html_paths.len(),
            }
        });
        composition.insert("html_documents".into(), obs.clone());
        receipt.findings.push(json!({
            "id": "finding:observation.html_documents",
            "kind": "composition_observation",
            "observation": "html_documents",
            "schema": "agentsam.machine.finding.v1",
            "basis": "observed",
            "evidence": obs["evidence"],
        }));
    }

    if !ts_paths.is_empty() {
        let fact_ids: Vec<String> = ts_paths
            .iter()
            .take(24)
            .map(|p| format!("file:{p}"))
            .collect();
        let obs = json!({
            "basis": "observed",
            "evidence": {
                "fact_ids": fact_ids,
                "fact_count": ts_paths.len(),
                "count": ts_paths.len(),
            }
        });
        composition.insert("javascript_typescript_source".into(), obs.clone());
        receipt.findings.push(json!({
            "id": "finding:observation.javascript_typescript_source",
            "kind": "composition_observation",
            "observation": "javascript_typescript_source",
            "schema": "agentsam.machine.finding.v1",
            "basis": "observed",
            "evidence": obs["evidence"],
        }));
    }

    if let Some(pkg) = package_json {
        let obs = json!({
            "basis": "observed",
            "evidence": {
                "fact_ids": [format!("file:{pkg}")],
                "fact_count": 1,
                "path": pkg,
            }
        });
        composition.insert("package_manifest".into(), obs.clone());
        receipt.findings.push(json!({
            "id": "finding:observation.package_manifest",
            "kind": "composition_observation",
            "observation": "package_manifest",
            "schema": "agentsam.machine.finding.v1",
            "basis": "observed",
            "evidence": obs["evidence"],
        }));
    }

    if let Some(theme) = theme_json {
        let obs = json!({
            "basis": "observed",
            "evidence": {
                "fact_ids": [format!("file:{theme}")],
                "fact_count": 1,
                "path": theme,
                "note": "Manifest file observed; application/usage relationships are not implied by presence alone.",
            }
        });
        composition.insert("theme_manifest".into(), obs.clone());
        receipt.findings.push(json!({
            "id": "finding:observation.theme_manifest",
            "kind": "composition_observation",
            "observation": "theme_manifest",
            "schema": "agentsam.machine.finding.v1",
            "basis": "observed",
            "evidence": obs["evidence"],
        }));
    }

    let liquid_count = *by_source.get("liquid").unwrap_or(&0);
    if liquid_count > 0 {
        let profile = crate::liquid::detect_template_structure(receipt, liquid_paths);
        let has_structure = profile.section_files > 0
            || profile.template_files > 0
            || profile.snippet_files > 0
            || profile.layout_files > 0;
        if has_structure {
            let matched = profile.matched_signals();
            let fact_ids: Vec<String> = profile
                .evidence_paths
                .iter()
                .take(48)
                .map(|p| format!("file:{p}"))
                .collect();
            let derived = json!({
                "basis": "derived",
                "derivation": {
                    "method": "deterministic_rules",
                    "rule_id": "structured_template_collections.v1",
                    "matched_signals": matched.clone(),
                    "signal_count": matched.len(),
                },
                "evidence": {
                    "fact_ids": fact_ids.clone(),
                    "fact_count": fact_ids.len(),
                    "templateLanguage": "liquid",
                    "conventions": {
                        "templatesDir": profile.templates_dirs.first(),
                        "sectionsDir": profile.sections_dirs.first(),
                        "snippetsDir": profile.snippets_dirs.first(),
                        "layoutDir": profile.layout_dirs.first(),
                    },
                    "template_files": profile.template_files,
                    "section_files": profile.section_files,
                    "snippet_files": profile.snippet_files,
                    "layout_files": profile.layout_files,
                }
            });
            // Derived claim from observed Liquid collections — not a vendor/platform identity.
            composition.insert("structured_template_collections".into(), derived.clone());
            receipt.findings.push(json!({
                "id": "finding:derived.structured_template_collections",
                "kind": "composition_derived",
                "claim": "structured_template_collections",
                "schema": "agentsam.machine.finding.v1",
                "basis": "derived",
                "derivation": derived["derivation"],
                "evidence": derived["evidence"],
            }));
        }
    }

    if !composition.is_empty() {
        let signals: Vec<String> = composition.keys().cloned().collect();
        receipt.findings.push(json!({
            "id": "finding:composition",
            "kind": "composition",
            "schema": "agentsam.machine.finding.v1",
            "basis": "derived",
            "derivation": {
                "method": "deterministic_rules",
                "rule_id": "composition.aggregate.v1",
                "matched_signals": signals.clone(),
                "signal_count": signals.len(),
            },
            "composition": composition,
        }));
    }
}

fn enrich_html_documents(
    root: &Path,
    receipt: &mut MachineReceipt,
    html_paths: &[String],
    svg_paths: &[String],
    theme_json: Option<&str>,
) {
    let mut route_candidates: BTreeSet<String> = BTreeSet::new();
    let mut nav_pairs: BTreeSet<(String, String, String)> = BTreeSet::new();
    let mut shared_nav_labels: BTreeMap<String, usize> = BTreeMap::new();
    let mut css_var_hits = 0usize;
    let mut header_hits = 0usize;
    let mut footer_hits = 0usize;
    let mut nav_edge_ids: Vec<String> = Vec::new();
    let mut href_literals = 0usize;

    for rel in html_paths {
        route_candidates.insert(route_candidate_from_html_path(rel));
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
                continue;
            }
            href_literals += 1;
            if let Some(route) = href_to_route_candidate(&href) {
                nav_pairs.insert((rel.clone(), route.clone(), label.clone()));
                if !label.is_empty() {
                    *shared_nav_labels.entry(label.clone()).or_default() += 1;
                }
                let edge_id = format!(
                    "edge:navigation_link:file:{rel}:{route}:{}",
                    short_hash(&format!("{href}\0{label}"))
                );
                nav_edge_ids.push(edge_id.clone());
                // Edge is proven by literal href → route candidate mapping.
                receipt.edges.push(json!({
                    "id": edge_id,
                    "from": format!("file:{rel}"),
                    "to": format!("route_candidate:{route}"),
                    "type": "navigation_link",
                    "label": label,
                    "evidence": {
                        "file": rel,
                        "attribute": "href",
                        "literal": href,
                        "fact_ids": [format!("file:{rel}")],
                    }
                }));
            }
        }
    }

    // theme.json coexistence is a candidate finding only — never invent applies_to edges.
    if let Some(theme) = theme_json {
        receipt.findings.push(json!({
            "id": "finding:theme_manifest_candidate",
            "kind": "theme_manifest_candidate",
            "schema": "agentsam.machine.finding.v1",
            "basis": "observed",
            "evidence": {
                "fact_ids": [format!("file:{theme}")],
                "theme_manifest": theme,
                "coexisting_html_documents": html_paths.len(),
                "svg_assets": svg_paths.len(),
                "note": "Manifest observed; application to specific pages requires reference/config evidence.",
            },
        }));
    }

    let shared_nav_candidates: Vec<String> = shared_nav_labels
        .into_iter()
        .filter(|(_, c)| *c >= 2)
        .map(|(label, _)| label)
        .collect();

    let html_fact_ids: Vec<String> = html_paths.iter().map(|p| format!("file:{p}")).collect();
    receipt.findings.push(json!({
        "id": "finding:frontend_evidence",
        "kind": "frontend_evidence",
        "schema": "agentsam.machine.finding.v1",
        "observations": {
            "basis": "observed",
            "html_documents": html_paths.len(),
            "header_tags": header_hits,
            "footer_tags": footer_hits,
            "css_custom_property_pages": css_var_hits,
            "href_literals": href_literals,
            "fact_ids": html_fact_ids,
            "edge_ids": nav_edge_ids.iter().take(32).cloned().collect::<Vec<_>>(),
            "navigation_edge_count": nav_pairs.len(),
        },
        "derived": {
            "basis": "derived",
            "derivation": {
                "method": "deterministic_rules",
                "rule_id": "frontend_evidence.route_and_nav_candidates.v1",
                "matched_signals": ["filename_route_stem", "repeated_anchor_labels"],
                "signal_count": 2,
            },
            "evidence": {
                "fact_count": html_paths.len(),
                "edge_count": nav_pairs.len(),
                "route_candidate_count": route_candidates.len(),
                "shared_navigation_candidate_count": shared_nav_candidates.len(),
            },
            "route_candidates": route_candidates.iter().cloned().collect::<Vec<_>>(),
            "shared_navigation_candidates": shared_nav_candidates,
        }
    }));

    if !svg_paths.is_empty() {
        let svg_ids: Vec<String> = svg_paths.iter().map(|p| format!("file:{p}")).collect();
        receipt.findings.push(json!({
            "id": "finding:asset_family_svg",
            "kind": "asset_family",
            "type": "svg_icons",
            "schema": "agentsam.machine.finding.v1",
            "basis": "observed",
            "count": svg_paths.len(),
            "paths": svg_paths,
            "evidence": { "fact_ids": svg_ids }
        }));
    }

    let route_list: Vec<String> = route_candidates.iter().cloned().collect();
    receipt.artifacts.push(json!({
        "kind": "route_manifest",
        "schema": "agentsam.machine.routes.v1",
        "data": {
            "route_candidates": route_list,
            "note": "Candidates derived from HTML filenames / href literals — not proven router config.",
        }
    }));

    receipt.artifacts.push(json!({
        "kind": "frontend_manifest",
        "schema": "agentsam.machine.frontend.v1",
        "data": {
            "html_pages": html_paths,
            "svg_assets": svg_paths,
            "theme_manifest_candidate": theme_json,
            "navigation_edge_count": nav_pairs.len(),
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
                "coexisting_html_documents": html_paths.len(),
                "css_custom_property_pages": css_var_hits,
                "note": "Candidate only; no unproven applies_to edges.",
            }
        }));
    }
}

/// Transitional line-scan for relative import/require literals.
/// Do not grow into a regex architecture — replace with AST-backed extraction.
fn enrich_ts_imports_transitional(root: &Path, receipt: &mut MachineReceipt, ts_paths: &[String]) {
    let known: BTreeSet<String> = receipt.facts.iter().map(|f| f.path.clone()).collect();
    for rel in ts_paths {
        let abs = root.join(rel);
        let Ok(text) = fs::read_to_string(&abs) else {
            continue;
        };
        for spec in extract_import_specifiers_line_scan(&text) {
            if !(spec.starts_with("./") || spec.starts_with("../")) {
                continue;
            }
            if let Some(resolved) = resolve_relative_import(rel, &spec, &known) {
                receipt.edges.push(json!({
                    "id": format!("edge:imports:file:{rel}:file:{resolved}"),
                    "from": format!("file:{rel}"),
                    "to": format!("file:{resolved}"),
                    "type": "imports",
                    "evidence": {
                        "file": rel,
                        "literal": spec,
                        "fact_ids": [format!("file:{rel}"), format!("file:{resolved}")],
                        "parser": "line_scan_transitional",
                    }
                }));
            }
        }
    }
}

fn extract_import_specifiers_line_scan(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in text.lines() {
        let trimmed = line.trim();
        if let Some(rest) = trimmed.strip_prefix("import ") {
            if let Some(spec) = quoted_from_from(rest).or_else(|| first_quoted_anywhere(rest)) {
                out.push(spec);
            }
        } else if trimmed.starts_with("export ") && trimmed.contains(" from ") {
            if let Some(spec) = quoted_from_from(trimmed) {
                out.push(spec);
            }
        } else if let Some(rest) = trimmed.strip_prefix("require(") {
            if let Some(spec) = first_quoted_anywhere(rest) {
                out.push(spec);
            }
        }
    }
    out
}

fn quoted_from_from(s: &str) -> Option<String> {
    let idx = s.find(" from ")?;
    first_quoted_anywhere(&s[idx + 6..])
}

fn first_quoted_anywhere(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'\'' || b == b'"' {
            let q = b as char;
            let rest = &s[i + 1..];
            let end = rest.find(q)?;
            return Some(rest[..end].to_string());
        }
        i += 1;
    }
    None
}

fn resolve_relative_import(from: &str, spec: &str, known: &BTreeSet<String>) -> Option<String> {
    let from_dir = Path::new(from).parent().unwrap_or_else(|| Path::new(""));
    let joined = from_dir.join(spec);
    let norm = joined.to_string_lossy().replace('\\', "/");
    let candidates = [
        norm.clone(),
        format!("{norm}.ts"),
        format!("{norm}.tsx"),
        format!("{norm}.js"),
        format!("{norm}.jsx"),
        format!("{norm}.mts"),
        format!("{norm}.cts"),
        format!("{norm}/index.ts"),
        format!("{norm}/index.tsx"),
        format!("{norm}/index.js"),
    ];
    candidates.into_iter().find(|c| known.contains(c))
}

fn route_candidate_from_html_path(rel: &str) -> String {
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

fn href_to_route_candidate(href: &str) -> Option<String> {
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

fn extract_anchors(html: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut search = html;
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

fn short_hash(s: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    format!("{:x}", hasher.finalize())[..12].to_string()
}

/// Every graph edge must have a non-null, globally unique `id`.
fn finalize_edge_ids(receipt: &mut MachineReceipt) {
    let mut seen: BTreeSet<String> = BTreeSet::new();
    for (idx, edge) in receipt.edges.iter_mut().enumerate() {
        let literal = edge
            .pointer("/evidence/literal")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let Some(obj) = edge.as_object_mut() else {
            continue;
        };
        let base = obj
            .get("id")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .unwrap_or_else(|| {
                let etype = obj
                    .get("type")
                    .and_then(|v| v.as_str())
                    .unwrap_or("edge");
                let from = obj.get("from").and_then(|v| v.as_str()).unwrap_or("");
                let to = obj.get("to").and_then(|v| v.as_str()).unwrap_or("");
                format!(
                    "edge:{etype}:{from}:{to}:{}",
                    short_hash(&format!("{idx}\0{literal}"))
                )
            });
        let mut unique = base.clone();
        let mut n = 2u32;
        while !seen.insert(unique.clone()) {
            unique = format!("{base}#{n}");
            n += 1;
        }
        obj.insert("id".into(), Value::String(unique));
    }
}

#[allow(dead_code)]
pub fn fact_by_path<'a>(facts: &'a [FileFact], path: &str) -> Option<&'a FileFact> {
    facts.iter().find(|f| f.path == path)
}
