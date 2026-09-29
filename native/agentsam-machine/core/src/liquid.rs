//! Deterministic Liquid template-structure enrichment (no LLM, no vendor coupling).
//! Proves relationships from Liquid/JSON literals only; does not invent edges.
//!
//! Directory names like templates/sections/snippets/layout are *detected conventions*
//! when present in the source tree — not universal Liquid requirements.
use crate::MachineReceipt;
use serde_json::json;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

/// Candidate convention directory names observed across common template themes.
/// Presence is evidence; absence is not an error.
const CONVENTION_CANDIDATES: &[(&str, &str)] = &[
    ("templates", "templatesDir"),
    ("sections", "sectionsDir"),
    ("snippets", "snippetsDir"),
    ("layout", "layoutDir"),
    ("layouts", "layoutDir"),
    ("partials", "snippetsDir"),
    ("components", "sectionsDir"),
];

/// Enrich Liquid template/section/snippet/layout relationships when present.
pub fn enrich_liquid_structure(root: &Path, receipt: &mut MachineReceipt) {
    let liquid_paths: Vec<String> = receipt
        .facts
        .iter()
        .filter(|f| f.source.type_id == "liquid")
        .map(|f| f.path.clone())
        .collect();
    if liquid_paths.is_empty() {
        return;
    }

    let profile = detect_template_structure(receipt, &liquid_paths);
    let section_ids = ids_under_dirs(receipt, "liquid", &profile.sections_dirs);
    let snippet_ids = ids_under_dirs(receipt, "liquid", &profile.snippets_dirs);
    let section_paths = named_paths(receipt, "liquid", &profile.sections_dirs);
    let snippet_paths = named_paths(receipt, "liquid", &profile.snippets_dirs);

    let mut template_section_edges = 0usize;
    let mut snippet_edges = 0usize;
    let mut stylesheet_edges = 0usize;
    let mut asset_edges = 0usize;
    let mut evidence_fact_ids: BTreeSet<String> = BTreeSet::new();

    for fact in receipt.facts.clone() {
        let path = fact.path.as_str();
        let abs = root.join(path);
        let Ok(text) = fs::read_to_string(&abs) else {
            continue;
        };

        let in_templates = profile
            .templates_dirs
            .iter()
            .any(|d| path_under_dir(path, d));
        let in_layout = profile.layout_dirs.iter().any(|d| path_under_dir(path, d));

        if in_templates && path.ends_with(".json") {
            for section_type in extract_json_section_types(&text) {
                if section_ids.contains(&section_type) {
                    if let Some(to_path) = section_paths.get(&section_type) {
                        receipt.edges.push(json!({
                            "id": format!("edge:template_contains_section:{}:{}", fact.id, section_type),
                            "from": fact.id,
                            "to": format!("file:{to_path}"),
                            "type": "template_contains_section",
                            "evidence": {
                                "file": path,
                                "literal": format!("\"type\": \"{section_type}\""),
                                "fact_ids": [fact.id.clone()],
                                "conventions": profile.conventions_json(),
                            }
                        }));
                        template_section_edges += 1;
                        evidence_fact_ids.insert(fact.id.clone());
                    }
                }
            }
        }

        let is_json_template = in_templates && path.ends_with(".json");
        if fact.source.type_id != "liquid" && !is_json_template {
            continue;
        }

        for (kind, name) in extract_liquid_references(&text) {
            match kind.as_str() {
                "render" | "include" => {
                    if snippet_ids.contains(&name) {
                        if let Some(to_path) = snippet_paths.get(&name) {
                            receipt.edges.push(json!({
                                "id": format!("edge:section_uses_snippet:{}:{name}", fact.id),
                                "from": fact.id,
                                "to": format!("file:{to_path}"),
                                "type": "section_uses_snippet",
                                "evidence": {
                                    "file": path,
                                    "literal": format!("{{% {kind} '{name}' %}}"),
                                    "fact_ids": [fact.id.clone()],
                                }
                            }));
                            snippet_edges += 1;
                            evidence_fact_ids.insert(fact.id.clone());
                        }
                    }
                }
                "section" => {
                    if section_ids.contains(&name) {
                        if let Some(to_path) = section_paths.get(&name) {
                            let edge_type = if in_layout {
                                "layout_contains_section"
                            } else {
                                "template_contains_section"
                            };
                            receipt.edges.push(json!({
                                "id": format!("edge:{edge_type}:{}:{name}", fact.id),
                                "from": fact.id,
                                "to": format!("file:{to_path}"),
                                "type": edge_type,
                                "evidence": {
                                    "file": path,
                                    "literal": format!("{{% section '{name}' %}}"),
                                    "fact_ids": [fact.id.clone()],
                                }
                            }));
                            template_section_edges += 1;
                            evidence_fact_ids.insert(fact.id.clone());
                        }
                    }
                }
                _ => {}
            }
        }

        for asset in extract_liquid_asset_literals(&text) {
            let edge_type = if looks_like_stylesheet(&asset) {
                stylesheet_edges += 1;
                "document_uses_stylesheet"
            } else {
                asset_edges += 1;
                "source_references_asset"
            };
            receipt.edges.push(json!({
                "id": format!("edge:{edge_type}:{}:{}", fact.id, short_hash(&asset)),
                "from": fact.id,
                "to": format!("asset:{asset}"),
                "type": edge_type,
                "evidence": {
                    "file": path,
                    "literal": asset,
                    "attribute": "asset_url",
                    "fact_ids": [fact.id.clone()],
                }
            }));
            evidence_fact_ids.insert(fact.id.clone());
        }
    }

    // Only emit structure finding when we actually observed composition evidence
    // (directories alone are not enough — absence of a convention is fine).
    if profile.section_files > 0
        || profile.snippet_files > 0
        || profile.template_files > 0
        || template_section_edges > 0
        || snippet_edges > 0
    {
        let fact_ids: Vec<String> = evidence_fact_ids.into_iter().collect();
        receipt.findings.push(json!({
            "id": "finding:structured_template_theme",
            "kind": "theme_structure",
            "type": "structured_template_theme",
            "schema": "agentsam.machine.finding.v1",
            "heuristic": true,
            "confidence": profile.confidence(),
            "evidence": {
                "fact_ids": fact_ids,
                "templateLanguage": "liquid",
                "conventions": profile.conventions_json(),
                "template_files": profile.template_files,
                "section_files": profile.section_files,
                "snippet_files": profile.snippet_files,
                "layout_files": profile.layout_files,
                "template_contains_section_edges": template_section_edges,
                "section_uses_snippet_edges": snippet_edges,
                "document_uses_stylesheet_edges": stylesheet_edges,
                "source_references_asset_edges": asset_edges,
            }
        }));
    }
}

#[derive(Debug, Clone, Default)]
pub struct TemplateStructureProfile {
    pub template_language: String,
    pub templates_dirs: Vec<String>,
    pub sections_dirs: Vec<String>,
    pub snippets_dirs: Vec<String>,
    pub layout_dirs: Vec<String>,
    pub template_files: usize,
    pub section_files: usize,
    pub snippet_files: usize,
    pub layout_files: usize,
    pub evidence_paths: Vec<String>,
}

impl TemplateStructureProfile {
    fn conventions_json(&self) -> serde_json::Value {
        let mut map = BTreeMap::new();
        if let Some(d) = self.templates_dirs.first() {
            map.insert("templatesDir", d.clone());
        }
        if let Some(d) = self.sections_dirs.first() {
            map.insert("sectionsDir", d.clone());
        }
        if let Some(d) = self.snippets_dirs.first() {
            map.insert("snippetsDir", d.clone());
        }
        if let Some(d) = self.layout_dirs.first() {
            map.insert("layoutDir", d.clone());
        }
        json!(map)
    }

    pub fn confidence(&self) -> f64 {
        let _ = &self.template_language;
        let dirs = [
            !self.templates_dirs.is_empty(),
            !self.sections_dirs.is_empty(),
            !self.snippets_dirs.is_empty(),
            !self.layout_dirs.is_empty(),
        ]
        .iter()
        .filter(|&&b| b)
        .count();
        match dirs {
            0 => 0.5,
            1 => 0.7,
            2 => 0.82,
            3 => 0.9,
            _ => 0.94,
        }
    }
}

/// Discover template composition conventions from observed paths.
/// Missing candidate directories are simply not reported — never treated as broken.
pub fn detect_template_structure(
    receipt: &MachineReceipt,
    liquid_paths: &[String],
) -> TemplateStructureProfile {
    let mut profile = TemplateStructureProfile {
        template_language: "liquid".to_string(),
        ..Default::default()
    };

    let mut templates = BTreeSet::new();
    let mut sections = BTreeSet::new();
    let mut snippets = BTreeSet::new();
    let mut layouts = BTreeSet::new();
    let mut evidence = BTreeSet::new();

    for path in liquid_paths {
        if let Some((dir, role)) = first_convention_dir(path) {
            evidence.insert(path.clone());
            match role {
                "templatesDir" => {
                    templates.insert(dir.to_string());
                    profile.template_files += 1;
                }
                "sectionsDir" => {
                    sections.insert(dir.to_string());
                    profile.section_files += 1;
                }
                "snippetsDir" => {
                    snippets.insert(dir.to_string());
                    profile.snippet_files += 1;
                }
                "layoutDir" => {
                    layouts.insert(dir.to_string());
                    profile.layout_files += 1;
                }
                _ => {}
            }
        }
    }

    // JSON templates under a discovered (or candidate) templates dir.
    for fact in &receipt.facts {
        if !fact.path.ends_with(".json") {
            continue;
        }
        if let Some((dir, role)) = first_convention_dir(&fact.path) {
            if role == "templatesDir" {
                templates.insert(dir.to_string());
                profile.template_files += 1;
                evidence.insert(fact.path.clone());
            }
        }
    }

    profile.templates_dirs = templates.into_iter().collect();
    profile.sections_dirs = sections.into_iter().collect();
    profile.snippets_dirs = snippets.into_iter().collect();
    profile.layout_dirs = layouts.into_iter().collect();
    profile.evidence_paths = evidence.into_iter().take(48).collect();
    profile
}

fn first_convention_dir(path: &str) -> Option<(&str, &str)> {
    let first = path.split('/').next()?;
    for (candidate, role) in CONVENTION_CANDIDATES {
        if first == *candidate {
            return Some((*candidate, *role));
        }
    }
    None
}

fn path_under_dir(path: &str, dir: &str) -> bool {
    path == dir || path.starts_with(&format!("{dir}/"))
}

fn ids_under_dirs(
    receipt: &MachineReceipt,
    type_id: &str,
    dirs: &[String],
) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for fact in &receipt.facts {
        if fact.source.type_id != type_id {
            continue;
        }
        if dirs.iter().any(|d| path_under_dir(&fact.path, d)) {
            if let Some(name) = stem_name(&fact.path) {
                out.insert(name);
            }
        }
    }
    out
}

fn named_paths(
    receipt: &MachineReceipt,
    type_id: &str,
    dirs: &[String],
) -> BTreeMap<String, String> {
    let mut out = BTreeMap::new();
    for fact in &receipt.facts {
        if fact.source.type_id != type_id {
            continue;
        }
        if !dirs.iter().any(|d| path_under_dir(&fact.path, d)) {
            continue;
        }
        if let Some(name) = stem_name(&fact.path) {
            out.entry(name).or_insert_with(|| fact.path.clone());
        }
    }
    out
}

fn stem_name(path: &str) -> Option<String> {
    Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())
}

fn extract_json_section_types(text: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let bytes = text.as_bytes();
    let needle = b"\"type\"";
    let mut i = 0;
    while i + needle.len() < bytes.len() {
        if &bytes[i..i + needle.len()] == needle {
            let rest = &text[i + needle.len()..];
            if let Some(val) = parse_json_string_after_colon(rest) {
                if !val.is_empty()
                    && !val.starts_with("{{")
                    && val
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                {
                    out.insert(val);
                }
            }
            i += needle.len();
        } else {
            i += 1;
        }
    }
    out
}

fn parse_json_string_after_colon(rest: &str) -> Option<String> {
    let mut chars = rest.chars().peekable();
    while let Some(c) = chars.peek() {
        if c.is_whitespace() || *c == ':' {
            chars.next();
            continue;
        }
        break;
    }
    let quote = chars.next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let mut out = String::new();
    for c in chars {
        if c == quote {
            break;
        }
        out.push(c);
    }
    Some(out)
}

/// Extract Liquid `{% render|include|section 'name' %}` references.
pub fn extract_liquid_references(text: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let lower = text.to_ascii_lowercase();
    for keyword in ["render", "include", "section"] {
        let mut search_from = 0;
        let pattern = format!("{{% {keyword}");
        let pattern2 = format!("{{%{keyword}");
        while let Some(rel) = lower[search_from..]
            .find(&pattern)
            .or_else(|| lower[search_from..].find(&pattern2))
        {
            let abs = search_from + rel;
            let slice = &text[abs..];
            let end = slice.find("%}").unwrap_or(slice.len().min(120));
            let tag = &slice[..end];
            if let Some(name) = first_quoted(tag) {
                out.push((keyword.to_string(), name));
            }
            search_from = abs + 2;
        }
    }
    out
}

fn first_quoted(tag: &str) -> Option<String> {
    let bytes = tag.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'\'' || b == b'"' {
            let q = b as char;
            let rest = &tag[i + 1..];
            let end = rest.find(q)?;
            return Some(rest[..end].to_string());
        }
        i += 1;
    }
    None
}

fn extract_liquid_asset_literals(text: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let mut search = text;
    while let Some(idx) = search.find("| asset_url") {
        let before = &search[..idx];
        if let Some(name) = trailing_quoted_literal(before) {
            out.insert(name);
        }
        search = &search[idx + 1..];
    }
    for name in extract_filter_quoted(text, "stylesheet_tag") {
        out.insert(name);
    }
    out
}

fn trailing_quoted_literal(before: &str) -> Option<String> {
    let trimmed = before.trim_end();
    let bytes = trimmed.as_bytes();
    if bytes.is_empty() {
        return None;
    }
    let q = *bytes.last()?;
    if q != b'\'' && q != b'"' {
        return None;
    }
    let inner = &trimmed[..trimmed.len() - 1];
    let start = inner.rfind(q as char)?;
    Some(inner[start + 1..].to_string())
}

fn extract_filter_quoted(text: &str, filter: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut search_from = 0;
    let lower = text.to_ascii_lowercase();
    while let Some(rel) = lower[search_from..].find(filter) {
        let abs = search_from + rel;
        let window_start = abs.saturating_sub(80);
        let window = &text[window_start..abs.saturating_add(filter.len() + 40).min(text.len())];
        if let Some(name) = first_quoted(window) {
            out.push(name);
        }
        search_from = abs + filter.len();
    }
    out
}

fn looks_like_stylesheet(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".css") || lower.ends_with(".scss")
}

fn short_hash(s: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(s.as_bytes());
    format!("{:x}", hasher.finalize())[..12].to_string()
}
