//! Bound stdout receipts by externalizing large detail to local artifact files.
use crate::{FileFact, MachineReceipt, ENGINE_VERSION};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub const DETAIL_SCHEMA: &str = "agentsam.machine.detail.v1";
pub const MAX_FACTS_IN_RECEIPT: usize = 48;
pub const MAX_EDGES_IN_RECEIPT: usize = 96;

#[derive(Debug, Clone)]
pub struct BoundLimits {
    pub max_facts: usize,
    pub max_edges: usize,
}

impl Default for BoundLimits {
    fn default() -> Self {
        Self {
            max_facts: MAX_FACTS_IN_RECEIPT,
            max_edges: MAX_EDGES_IN_RECEIPT,
        }
    }
}

/// Write full detail to `{root}/.agentsam/machine/runs/{run_id}/` and shrink the
/// in-memory receipt so CLI stdout stays bounded (avoids ENOBUFS on large donors).
pub fn externalize_and_bound(
    root: &Path,
    receipt: &mut MachineReceipt,
    limits: BoundLimits,
) -> io::Result<PathBuf> {
    let artifact_dir = root
        .join(".agentsam")
        .join("machine")
        .join("runs")
        .join(&receipt.run_id);
    fs::create_dir_all(&artifact_dir)?;

    let facts_total = receipt.facts.len();
    let edges_total = receipt.edges.len();
    let findings_total = receipt.findings.len();

    write_json(&artifact_dir.join("inventory.json"), &receipt.facts)?;
    write_json(&artifact_dir.join("findings.json"), &receipt.findings)?;
    write_json(&artifact_dir.join("graph.json"), &receipt.edges)?;

    // Pull structured manifests from enrich artifacts when present.
    let mut asset_manifest: Option<Value> = None;
    let mut route_manifest: Option<Value> = None;
    let mut frontend_manifest: Option<Value> = None;
    let mut theme_evidence: Option<Value> = None;
    for art in &receipt.artifacts {
        match art.get("kind").and_then(|v| v.as_str()) {
            Some("asset_manifest") => asset_manifest = Some(art.clone()),
            Some("route_manifest") => route_manifest = Some(art.clone()),
            Some("frontend_manifest") => frontend_manifest = Some(art.clone()),
            Some("theme_evidence") => theme_evidence = Some(art.clone()),
            _ => {}
        }
    }
    if let Some(ref m) = asset_manifest {
        write_json(&artifact_dir.join("asset-manifest.json"), m)?;
    }
    if let Some(ref m) = route_manifest {
        write_json(&artifact_dir.join("route-manifest.json"), m)?;
    }
    if let Some(ref m) = frontend_manifest {
        write_json(&artifact_dir.join("frontend-manifest.json"), m)?;
    }
    if let Some(ref m) = theme_evidence {
        write_json(&artifact_dir.join("theme-evidence.json"), m)?;
    }

    let source_type_counts = count_source_types(&receipt.facts);
    let summary = json!({
        "schema": "agentsam.machine.summary.v1",
        "files": receipt.stats.files,
        "symlinks": receipt.stats.symlinks,
        "directories": receipt.stats.directories,
        "bytes": receipt.stats.bytes,
        "ignored_directories": receipt.stats.ignored_directories,
        "skipped_noise_files": receipt.stats.skipped_noise_files,
        "excluded_subtrees": receipt.stats.excluded_subtrees.len(),
        "facts_total": facts_total,
        "edges_total": edges_total,
        "findings_total": findings_total,
        "source_type_counts": source_type_counts,
        "network_used": receipt.provenance.network_used,
        "source_mutated": receipt.provenance.source_mutated,
    });
    write_json(&artifact_dir.join("summary.json"), &summary)?;

    let detail_externalized = facts_total > limits.max_facts || edges_total > limits.max_edges;
    let bounded_facts = select_representative_facts(&receipt.facts, limits.max_facts);
    let bounded_edges = select_high_value_edges(&receipt.edges, limits.max_edges);

    let artifact_dir_text = artifact_dir.to_string_lossy().replace('\\', "/");
    let mut descriptors = vec![
        artifact_descriptor(
            "summary",
            "summary.json",
            &artifact_dir_text,
            Some(summary.clone()),
        ),
        artifact_descriptor("inventory", "inventory.json", &artifact_dir_text, None),
        artifact_descriptor("findings", "findings.json", &artifact_dir_text, None),
        artifact_descriptor("graph", "graph.json", &artifact_dir_text, None),
    ];
    if asset_manifest.is_some() {
        descriptors.push(artifact_descriptor(
            "asset_manifest",
            "asset-manifest.json",
            &artifact_dir_text,
            asset_manifest.as_ref().and_then(|m| m.get("summary").cloned()),
        ));
    }
    if route_manifest.is_some() {
        descriptors.push(artifact_descriptor(
            "route_manifest",
            "route-manifest.json",
            &artifact_dir_text,
            None,
        ));
    }
    if frontend_manifest.is_some() {
        descriptors.push(artifact_descriptor(
            "frontend_manifest",
            "frontend-manifest.json",
            &artifact_dir_text,
            None,
        ));
    }
    if theme_evidence.is_some() {
        descriptors.push(artifact_descriptor(
            "theme_evidence",
            "theme-evidence.json",
            &artifact_dir_text,
            None,
        ));
    }

    receipt.summary = Some(summary);
    receipt.detail = Some(json!({
        "schema": DETAIL_SCHEMA,
        "externalized": detail_externalized || true,
        "artifact_dir": artifact_dir_text,
        "engine_version": ENGINE_VERSION,
        "facts_in_receipt": bounded_facts.len(),
        "facts_total": facts_total,
        "edges_in_receipt": bounded_edges.len(),
        "edges_total": edges_total,
        "findings_in_receipt": receipt.findings.len(),
        "findings_total": findings_total,
        "note": if detail_externalized {
            "Full facts/edges written to artifacts; receipt contains representative subsets."
        } else {
            "Full detail also written to artifacts for AgentSam reuse."
        }
    }));
    receipt.facts = bounded_facts;
    receipt.edges = bounded_edges;
    receipt.artifacts = descriptors;
    Ok(artifact_dir)
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> io::Result<()> {
    let text = serde_json::to_string_pretty(value)
        .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
    fs::write(path, text)
}

fn artifact_descriptor(
    kind: &str,
    filename: &str,
    dir: &str,
    summary: Option<Value>,
) -> Value {
    let mut obj = json!({
        "kind": kind,
        "schema": "agentsam.machine.artifact_ref.v1",
        "id": format!("artifact:{kind}"),
        "path": format!("{dir}/{filename}"),
        "relative_path": filename,
    });
    if let Some(s) = summary {
        obj.as_object_mut().unwrap().insert("summary".into(), s);
    }
    obj
}

fn count_source_types(facts: &[FileFact]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for fact in facts {
        *counts.entry(fact.source.type_id.clone()).or_default() += 1;
    }
    counts
}

fn select_representative_facts(facts: &[FileFact], limit: usize) -> Vec<FileFact> {
    if facts.len() <= limit {
        return facts.to_vec();
    }
    let role_bonus = |role: &str| -> i32 {
        match role {
            "theme_manifest" | "page_candidate" | "stylesheet" | "frontend_source" => 100,
            "source" | "image" | "asset" => 40,
            _ => 10,
        }
    };
    let type_bonus = |t: &str| -> i32 {
        match t {
            "liquid" | "html" | "typescript" | "javascript" | "css" | "json" | "svg" => 50,
            "unknown" => 5,
            _ => 20,
        }
    };
    let mut scored: Vec<(i32, &FileFact)> = facts
        .iter()
        .map(|f| {
            let score = role_bonus(&f.classification.role) + type_bonus(&f.source.type_id);
            (score, f)
        })
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0).then_with(|| a.1.path.cmp(&b.1.path)));

    // Round-robin diversity: take best per source type first.
    let mut picked = Vec::new();
    let mut seen_types = std::collections::BTreeSet::new();
    for (score, fact) in &scored {
        if picked.len() >= limit {
            break;
        }
        if seen_types.insert(fact.source.type_id.clone()) || *score >= 90 {
            picked.push((*fact).clone());
        }
    }
    for (_, fact) in &scored {
        if picked.len() >= limit {
            break;
        }
        if picked.iter().any(|p| p.id == fact.id) {
            continue;
        }
        picked.push((*fact).clone());
    }
    picked.sort_by(|a, b| a.path.cmp(&b.path));
    picked
}

fn select_high_value_edges(edges: &[Value], limit: usize) -> Vec<Value> {
    if edges.len() <= limit {
        return edges.to_vec();
    }
    let priority = |t: &str| -> i32 {
        match t {
            "template_contains_section" | "layout_contains_section" | "section_uses_snippet"
            | "document_uses_stylesheet" | "loads_stylesheet" | "imports" | "source_references_asset" => 100,
            "navigation_link" => 60,
            "asset_reference" => 40,
            _ => 20,
        }
    };
    let mut scored: Vec<(i32, &Value)> = edges
        .iter()
        .map(|e| {
            let t = e.get("type").and_then(|v| v.as_str()).unwrap_or("");
            (priority(t), e)
        })
        .collect();
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0).then_with(|| {
            let af = a.1.get("from").and_then(|v| v.as_str()).unwrap_or("");
            let bf = b.1.get("from").and_then(|v| v.as_str()).unwrap_or("");
            af.cmp(bf)
        })
    });
    // Cap asset_reference share so structural edges survive.
    let mut out = Vec::new();
    let mut asset_refs = 0usize;
    let asset_cap = limit / 3;
    for (p, e) in scored {
        if out.len() >= limit {
            break;
        }
        let t = e.get("type").and_then(|v| v.as_str()).unwrap_or("");
        if t == "asset_reference" {
            if asset_refs >= asset_cap && p < 100 {
                continue;
            }
            asset_refs += 1;
        }
        out.push(e.clone());
    }
    out
}
