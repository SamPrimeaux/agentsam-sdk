//! Deterministic asset-reference perception (read-only, network-free).
//! Extracts literal + resolved local/remote references with usage evidence.

use crate::MachineReceipt;
use serde_json::json;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Clone)]
struct AssetHit {
    literal: String,
    resolved: String,
    origin_kind: &'static str,
    from_file: String,
    attribute: String,
    role: String,
}

pub fn enrich_assets(root: &Path, receipt: &mut MachineReceipt) {
    let mut hits: Vec<AssetHit> = Vec::new();

    let html_paths: Vec<String> = receipt
        .facts
        .iter()
        .filter(|f| f.source.type_id == "html")
        .map(|f| f.path.clone())
        .collect();
    let css_paths: Vec<String> = receipt
        .facts
        .iter()
        .filter(|f| {
            matches!(f.source.type_id.as_str(), "css")
                || f.extension
                    .as_deref()
                    .is_some_and(|e| matches!(e, "css" | "scss" | "less" | "sass"))
        })
        .map(|f| f.path.clone())
        .collect();
    let svg_paths: Vec<String> = receipt
        .facts
        .iter()
        .filter(|f| f.source.type_id == "svg")
        .map(|f| f.path.clone())
        .collect();
    let code_paths: Vec<String> = receipt
        .facts
        .iter()
        .filter(|f| {
            matches!(
                f.source.type_id.as_str(),
                "javascript" | "typescript" | "json" | "liquid"
            )
        })
        .map(|f| f.path.clone())
        .collect();

    for rel in &html_paths {
        let abs = root.join(rel);
        let Ok(text) = std::fs::read_to_string(&abs) else {
            continue;
        };
        collect_html_assets(rel, &text, &mut hits);
    }
    for rel in &css_paths {
        let abs = root.join(rel);
        let Ok(text) = std::fs::read_to_string(&abs) else {
            continue;
        };
        collect_css_urls(rel, &text, &mut hits);
    }
    for rel in &svg_paths {
        let abs = root.join(rel);
        let Ok(text) = std::fs::read_to_string(&abs) else {
            continue;
        };
        collect_svg_refs(rel, &text, &mut hits);
    }
    for rel in &code_paths {
        let abs = root.join(rel);
        let Ok(text) = std::fs::read_to_string(&abs) else {
            continue;
        };
        collect_code_asset_literals(rel, &text, &mut hits);
    }

    if hits.is_empty() {
        return;
    }

    // Aggregate by resolved identity
    let mut by_id: BTreeMap<String, AggregatedAsset> = BTreeMap::new();
    for hit in &hits {
        let id = asset_id(&hit.resolved);
        let entry = by_id.entry(id.clone()).or_insert_with(|| AggregatedAsset {
            id,
            origin_kind: hit.origin_kind,
            literal: hit.literal.clone(),
            resolved: hit.resolved.clone(),
            media_guess: guess_media(&hit.literal, &hit.role),
            references: Vec::new(),
        });
        entry.references.push(json!({
            "file": hit.from_file,
            "attribute": hit.attribute,
            "literal": hit.literal,
            "role": hit.role,
            "route": route_hint(&hit.from_file),
        }));
    }

    let mut remote = 0usize;
    let mut local = 0usize;
    let mut images = 0usize;
    let mut fonts = 0usize;
    let mut video = 0usize;
    let mut other = 0usize;

    for asset in by_id.values() {
        match asset.origin_kind {
            "remote" | "protocol_relative" => remote += 1,
            _ => local += 1,
        }
        match asset.media_guess.as_str() {
            "image" => images += 1,
            "font" => fonts += 1,
            "video" => video += 1,
            _ => other += 1,
        }

        for reference in &asset.references {
            let file = reference
                .get("file")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let attribute = reference
                .get("attribute")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let literal = reference
                .get("literal")
                .and_then(|v| v.as_str())
                .unwrap_or(&asset.literal);
            let role = reference
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("asset");

            receipt.edges.push(json!({
                "from": format!("file:{file}"),
                "to": format!("asset:{}", asset.resolved),
                "type": "asset_reference",
                "evidence": {
                    "file": file,
                    "attribute": attribute,
                    "literal": literal,
                    "role": role,
                    "origin_kind": asset.origin_kind,
                    "fact_ids": [format!("file:{file}")],
                }
            }));
        }
    }

    let assets_json: Vec<_> = by_id
        .values()
        .map(|a| {
            json!({
                "id": a.id,
                "mediaTypeGuess": a.media_guess,
                "origin": {
                    "kind": a.origin_kind,
                    "literal": a.literal,
                    "resolvedUrl": a.resolved,
                },
                "references": a.references,
                "usageCount": a.references.len(),
                "state": "discovered",
            })
        })
        .collect();

    let max_usage = by_id
        .values()
        .map(|a| a.references.len())
        .max()
        .unwrap_or(0);

    let evidence_fact_ids: Vec<String> = hits
        .iter()
        .map(|h| format!("file:{}", h.from_file))
        .collect::<std::collections::BTreeSet<_>>()
        .into_iter()
        .take(64)
        .collect();
    receipt.findings.push(json!({
        "id": "finding:asset_discovery",
        "kind": "asset_discovery",
        "schema": "agentsam.machine.finding.v1",
        "heuristic": false,
        "confidence": 1.0,
        "evidence": {
            "fact_ids": evidence_fact_ids,
            "asset_hits": hits.len(),
            "unique_assets": by_id.len(),
            "remote": remote,
            "local": local,
        },
        "summary": {
            "total": by_id.len(),
            "remote": remote,
            "local": local,
            "images": images,
            "fonts": fonts,
            "video": video,
            "other": other,
            "max_usage_count": max_usage,
        }
    }));

    receipt.artifacts.push(json!({
        "kind": "asset_manifest",
        "schema": "agentsam.machine.assets.v1",
        "summary": {
            "total": by_id.len(),
            "remote": remote,
            "local": local,
            "images": images,
            "fonts": fonts,
            "video": video,
            "other": other,
            "reference_hits": hits.len(),
            "network_used": false,
            "source_mutated": false,
        },
        "assets": assets_json,
    }));
}

struct AggregatedAsset {
    id: String,
    origin_kind: &'static str,
    literal: String,
    resolved: String,
    media_guess: String,
    references: Vec<serde_json::Value>,
}

fn collect_html_assets(rel: &str, text: &str, hits: &mut Vec<AssetHit>) {
    for src in extract_attr(text, "src") {
        if looks_like_script(&src) {
            continue;
        }
        record_hit(rel, &src, "src", &infer_role_from_attr("src", &src), hits);
    }
    for src in extract_attr(text, "srcset") {
        for candidate in split_srcset(&src) {
            record_hit(rel, &candidate, "srcset", "image", hits);
        }
    }
    for poster in extract_attr(text, "poster") {
        record_hit(rel, &poster, "poster", "video_poster", hits);
    }
    // Anchors that point at media files (not navigation HTML)
    for (href, _) in extract_anchors(text) {
        if looks_like_static_asset_path(&href) {
            record_hit(rel, &href, "a.href", &guess_media(&href, "asset"), hits);
        }
    }
    // link/meta structured refs (icon, stylesheet, og:image)
    collect_meta_images(rel, text, hits);
    // CSS url(...) embedded in <style>
    collect_css_urls(rel, text, hits);
}

fn collect_meta_images(rel: &str, text: &str, hits: &mut Vec<AssetHit>) {
    let lower = text.to_ascii_lowercase();
    let mut search = text;
    let mut lower_search = lower.as_str();
    while let Some(idx) = lower_search.find("<meta") {
        let slice = &search[idx..];
        let end = slice.find('>').unwrap_or(slice.len());
        let tag = &slice[..end];
        let tag_l = tag.to_ascii_lowercase();
        let prop = attr_value(tag, "property")
            .or_else(|| attr_value(tag, "name"))
            .unwrap_or_default()
            .to_ascii_lowercase();
        if prop == "og:image"
            || prop == "twitter:image"
            || prop == "twitter:image:src"
            || prop == "og:image:url"
        {
            if let Some(content) = attr_value(tag, "content") {
                record_hit(rel, &content, "meta.content", "og_image", hits);
            }
        }
        // also catch link rel=icon via separate path; skip here
        let _ = tag_l;
        search = &slice[1..];
        lower_search = &lower_search[idx + 1..];
    }

    // <link rel="icon" …>
    let mut search = text;
    let lower = text.to_ascii_lowercase();
    let mut lower_search = lower.as_str();
    while let Some(idx) = lower_search.find("<link") {
        let slice = &search[idx..];
        let end = slice.find('>').unwrap_or(slice.len());
        let tag = &slice[..end];
        let rel_attr = attr_value(tag, "rel")
            .unwrap_or_default()
            .to_ascii_lowercase();
        if rel_attr.contains("icon") || rel_attr.contains("apple-touch-icon") {
            if let Some(href) = attr_value(tag, "href") {
                record_hit(rel, &href, "link.href", "icon", hits);
            }
        }
        if rel_attr.contains("stylesheet") {
            if let Some(href) = attr_value(tag, "href") {
                record_hit(rel, &href, "link.href", "stylesheet", hits);
            }
        }
        search = &slice[1..];
        lower_search = &lower_search[idx + 1..];
    }
}

fn collect_css_urls(rel: &str, text: &str, hits: &mut Vec<AssetHit>) {
    let mut search = text;
    while let Some(idx) = search.to_ascii_lowercase().find("url(") {
        let after = &search[idx + 4..];
        let trimmed = after.trim_start();
        let (raw, rest) = if trimmed.starts_with('"') || trimmed.starts_with('\'') {
            let q = trimmed.as_bytes()[0] as char;
            if let Some(end) = trimmed[1..].find(q) {
                (&trimmed[1..1 + end], &trimmed[2 + end..])
            } else {
                search = &search[idx + 1..];
                continue;
            }
        } else if let Some(end) = trimmed.find(')') {
            (trimmed[..end].trim(), &trimmed[end..])
        } else {
            search = &search[idx + 1..];
            continue;
        };
        let _ = rest;
        let value = raw.trim();
        if !value.is_empty() && !value.starts_with("data:") {
            let role = if looks_like_font(value) {
                "font".to_string()
            } else {
                guess_media(value, "css_url")
            };
            let attr = if role == "font" {
                "css.@font-face"
            } else {
                "css.url"
            };
            record_hit(rel, value, attr, role.as_str(), hits);
        }
        search = &search[idx + 1..];
    }
}

fn collect_svg_refs(rel: &str, text: &str, hits: &mut Vec<AssetHit>) {
    for href in extract_attr(text, "href") {
        if is_asset_candidate(&href) || href.starts_with('#') {
            if !href.starts_with('#') {
                record_hit(rel, &href, "href", "svg_href", hits);
            }
        }
    }
    for href in extract_attr(text, "xlink:href") {
        if !href.starts_with('#') && (is_asset_candidate(&href) || is_remote_url(&href)) {
            record_hit(rel, &href, "xlink:href", "svg_href", hits);
        }
    }
}

fn collect_code_asset_literals(rel: &str, text: &str, hits: &mut Vec<AssetHit>) {
    // Obvious full remote media URLs in quotes
    for (q_start, q_end) in [('"', '"'), ('\'', '\'')] {
        let mut search = text;
        while let Some(idx) = search.find(q_start) {
            let rest = &search[idx + 1..];
            if let Some(end) = rest.find(q_end) {
                let lit = &rest[..end];
                if (lit.starts_with("http://") || lit.starts_with("https://") || lit.starts_with("//"))
                    && is_asset_candidate(lit)
                {
                    record_hit(rel, lit, "string_literal", &guess_media(lit, "code_literal"), hits);
                } else if looks_like_static_asset_path(lit) {
                    record_hit(rel, lit, "string_literal", &guess_media(lit, "code_literal"), hits);
                }
                search = &rest[end + 1..];
            } else {
                break;
            }
        }
    }
}

fn record_hit(from_file: &str, literal: &str, attribute: &str, role: &str, hits: &mut Vec<AssetHit>) {
    let clean = literal.trim();
    if clean.is_empty() || clean.starts_with("data:") || clean.starts_with("javascript:") {
        return;
    }
    let (origin_kind, resolved) = resolve_ref(from_file, clean);
    hits.push(AssetHit {
        literal: clean.to_string(),
        resolved,
        origin_kind,
        from_file: from_file.to_string(),
        attribute: attribute.to_string(),
        role: role.to_string(),
    });
}

fn resolve_ref(from_rel: &str, href: &str) -> (&'static str, String) {
    if href.starts_with("https://") || href.starts_with("http://") {
        // Keep query string (fonts, image transforms); drop only fragments.
        let resolved = href.split('#').next().unwrap_or(href).to_string();
        return ("remote", resolved);
    }
    if href.starts_with("//") {
        let rest = href.split('#').next().unwrap_or(href);
        return ("protocol_relative", format!("https:{rest}"));
    }
    ("local", normalize_local(from_rel, href))
}

fn normalize_local(from_rel: &str, href: &str) -> String {
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

fn asset_id(resolved: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(resolved.as_bytes());
    let digest = hasher.finalize();
    format!("asset_{}", hex_prefix(&digest, 12))
}

fn hex_prefix(bytes: &[u8], n: usize) -> String {
    bytes
        .iter()
        .take((n + 1) / 2)
        .map(|b| format!("{b:02x}"))
        .collect::<String>()
        .chars()
        .take(n)
        .collect()
}

fn is_remote_url(s: &str) -> bool {
    let t = s.trim();
    t.starts_with("http://") || t.starts_with("https://") || t.starts_with("//")
}

fn is_asset_candidate(s: &str) -> bool {
    if s.starts_with("data:") {
        return false;
    }
    if is_remote_url(s) {
        return remote_looks_like_media(s);
    }
    looks_like_static_asset_path(s)
}

/// Media-ish remote URLs, including extensionless Cloudflare Images paths.
fn remote_looks_like_media(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    if looks_like_static_asset_path(&lower) || looks_like_font(&lower) {
        return true;
    }
    const HOST_HINTS: &[&str] = &[
        "imagedelivery.net",
        "images.unsplash.com",
        "cloudinary.com",
        "imgix.net",
        "googleusercontent.com",
        "/cdn-cgi/image/",
        "/uploads/",
        "/images/",
        "/assets/",
        "/media/",
        "/static/",
        "fonts.googleapis.com",
        "fonts.gstatic.com",
    ];
    if HOST_HINTS.iter().any(|h| lower.contains(h)) {
        return true;
    }
    // Path tail often used by CF Images variants
    const TAILS: &[&str] = &[
        "/public", "/thumbnail", "/avatar", "/small", "/medium", "/large", "/hero",
    ];
    TAILS.iter().any(|t| lower.ends_with(t))
}

fn looks_like_static_asset_path(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    const EXTS: &[&str] = &[
        ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".ico", ".bmp", ".tif",
        ".tiff", ".mp4", ".webm", ".mov", ".mp3", ".wav", ".ogg", ".woff", ".woff2", ".ttf",
        ".otf", ".eot", ".css", ".pdf",
    ];
    EXTS.iter().any(|ext| lower.contains(ext))
}

fn looks_like_font(s: &str) -> bool {
    let lower = s.to_ascii_lowercase();
    [".woff", ".woff2", ".ttf", ".otf", ".eot"].iter().any(|e| lower.contains(e))
        || lower.contains("fonts.googleapis.com")
        || lower.contains("fonts.gstatic.com")
}

fn looks_like_script(s: &str) -> bool {
    let lower = s.to_ascii_lowercase().split(['?', '#']).next().unwrap_or("").to_string();
    lower.ends_with(".js")
        || lower.ends_with(".mjs")
        || lower.ends_with(".cjs")
        || lower.ends_with(".ts")
        || lower.ends_with(".jsx")
        || lower.ends_with(".tsx")
}

fn guess_media(literal: &str, fallback: &str) -> String {
    let lower = literal.to_ascii_lowercase();
    if looks_like_font(&lower) {
        return "font".into();
    }
    if [".mp4", ".webm", ".mov"].iter().any(|e| lower.contains(e)) {
        return "video".into();
    }
    if [".mp3", ".wav", ".ogg", ".m4a"].iter().any(|e| lower.contains(e)) {
        return "audio".into();
    }
    if [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif", ".ico", ".bmp"]
        .iter()
        .any(|e| lower.contains(e))
        || lower.contains("imagedelivery.net")
        || lower.contains("/image")
        || fallback == "image"
        || fallback == "og_image"
        || fallback == "video_poster"
        || fallback == "src"
    {
        return "image".into();
    }
    if lower.contains(".css") || fallback == "stylesheet" {
        return "stylesheet".into();
    }
    fallback.to_string()
}

fn infer_role_from_attr(attr: &str, literal: &str) -> String {
    match attr {
        "poster" => "video_poster".into(),
        "srcset" => "image".into(),
        _ => guess_media(literal, "image"),
    }
}

fn route_hint(path: &str) -> String {
    let name = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("page");
    if name.eq_ignore_ascii_case("index") || name.eq_ignore_ascii_case("home") {
        "/".into()
    } else {
        format!("/{}", name.to_ascii_lowercase().replace(' ', "-"))
    }
}

fn split_srcset(value: &str) -> Vec<String> {
    // Srcset commas can appear inside CF Images / CDN transform URLs
    // (e.g. ".../w=1280,format=webp 1280w"). Only start a new candidate when
    // the next segment looks like a new URL/path.
    let mut out = Vec::new();
    let mut current = String::new();
    for part in value.split(',') {
        let trimmed = part.trim();
        if trimmed.is_empty() {
            continue;
        }
        if current.is_empty() {
            current = trimmed.to_string();
            continue;
        }
        let looks_new = trimmed.starts_with("http://")
            || trimmed.starts_with("https://")
            || trimmed.starts_with("//")
            || trimmed.starts_with('/')
            || trimmed.starts_with('.')
            || trimmed.starts_with("data:");
        if looks_new {
            if let Some(url) = current.split_whitespace().next() {
                if !url.is_empty() {
                    out.push(url.to_string());
                }
            }
            current = trimmed.to_string();
        } else {
            current.push(',');
            current.push_str(trimmed);
        }
    }
    if !current.is_empty() {
        if let Some(url) = current.split_whitespace().next() {
            if !url.is_empty() {
                out.push(url.to_string());
            }
        }
    }
    out
}

fn extract_anchors(html: &str) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let mut search = html;
    while let Some(idx) = search.find("<a ") {
        let slice = &search[idx..];
        let end = slice.find('>').unwrap_or(slice.len());
        let tag = &slice[..end];
        let href = attr_value(tag, "href").unwrap_or_default();
        if !href.is_empty() {
            out.push((href, String::new()));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{inspect_path_with_options, InspectOptions};
    use std::fs;

    #[test]
    fn discovers_remote_urls_without_extensions_and_counts_reuse() {
        let temp = tempfile::tempdir().unwrap();
        let html = r#"<!doctype html><html><head>
<meta property="og:image" content="https://cdn.example.com/og/hero">
<link rel="icon" href="/favicon.ico">
<style>.hero{background-image:url("../images/local-hero.png")}</style>
</head><body>
<img src="https://imagedelivery.net/abc/public" alt="a">
<img src="https://imagedelivery.net/abc/public" alt="b">
<img src="https://imagedelivery.net/abc/public" alt="c">
<img
  src="https://old-site.com/uploads/hero.jpg"
  srcset="https://old-site.com/uploads/hero-800.jpg 800w, https://old-site.com/uploads/hero-1600.jpg 1600w"
>
</body></html>"#;
        fs::write(temp.path().join("index.html"), html).unwrap();
        fs::create_dir_all(temp.path().join("images")).unwrap();
        fs::write(temp.path().join("images/local-hero.png"), b"\x89PNG").unwrap();

        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_assets".into());
        opts.externalize = false;
        let receipt = inspect_path_with_options(temp.path(), opts).unwrap();
        assert!(!receipt.provenance.network_used);
        assert!(!receipt.provenance.source_mutated);

        let manifest = receipt
            .artifacts
            .iter()
            .find(|a| a.get("kind") == Some(&json!("asset_manifest")))
            .expect("asset_manifest artifact");
        let summary = manifest.get("summary").unwrap();
        assert!(summary.get("total").and_then(|v| v.as_u64()).unwrap() > 0);
        assert!(summary.get("remote").and_then(|v| v.as_u64()).unwrap() >= 4);

        let assets = manifest.get("assets").and_then(|v| v.as_array()).unwrap();
        let reused = assets.iter().find(|a| {
            a.get("origin")
                .and_then(|o| o.get("resolvedUrl"))
                .and_then(|u| u.as_str())
                == Some("https://imagedelivery.net/abc/public")
        });
        assert!(reused.is_some());
        assert_eq!(
            reused.unwrap().get("usageCount").and_then(|v| v.as_u64()),
            Some(3)
        );

        assert!(receipt.edges.iter().any(|e| {
            e.get("type") == Some(&json!("asset_reference"))
                && e.pointer("/evidence/literal")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.contains("imagedelivery.net"))
        }));
        assert!(receipt.edges.iter().any(|e| {
            e.pointer("/evidence/attribute")
                .and_then(|v| v.as_str())
                == Some("srcset")
        }));
        assert!(receipt.edges.iter().any(|e| {
            e.pointer("/evidence/attribute")
                .and_then(|v| v.as_str())
                == Some("meta.content")
        }));
    }

    #[test]
    fn srcset_preserves_commas_inside_transform_urls() {
        let parts = split_srcset(
            "https://cdn.example.com/img/w=640,format=webp 640w, https://cdn.example.com/img/w=1280,format=webp 1280w",
        );
        assert_eq!(
            parts,
            vec![
                "https://cdn.example.com/img/w=640,format=webp".to_string(),
                "https://cdn.example.com/img/w=1280,format=webp".to_string(),
            ]
        );
    }
}
