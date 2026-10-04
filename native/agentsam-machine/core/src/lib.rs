//! AgentSam machine perception core — deterministic inspect receipts.
//! No Cloudflare, browser, Tauri, or network dependency.

mod assets;
mod bound;
mod enrich;
mod frontend;
mod liquid;
mod source_types;

use bound::{externalize_and_bound, BoundLimits};
use enrich::enrich_receipt;
use source_types::SourceTypeIndex;

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File, Metadata};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub const RECEIPT_SCHEMA: &str = "agentsam.machine.receipt.v1";
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const PARSER_VERSION: &str = "machine-parser.v1";
pub const ARTIFACT_SCHEMA_VERSION: &str = "machine-artifacts.v1";

/// Directories skipped during normal inspect (summarized, not flooded into facts).
const IGNORE_DIRS: &[&str] = &[
    ".git",
    ".agentsam",
    "node_modules",
    "python_modules",
    "vendor",
    "target",
    "build",
    "dist",
    ".next",
    ".wrangler",
    ".vinext",
    "__pycache__",
    ".cache",
    ".sites-runtime",
    "npm-cache",
    "_cacache",
    ".npm",
    ".pnpm-store",
    ".turbo",
    ".vite",
    ".parcel-cache",
    "coverage",
    ".venv",
    "venv",
    ".vercel",
    ".TemporaryItems",
    ".Trashes",
    ".Spotlight-V100",
    ".fseventsd",
];

/// Pure Rust domain logic: no Cloudflare, browser, Tauri, or network dependency.
pub fn normalize_resource_key(input: &str) -> String {
    input
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

#[derive(Debug, Clone, Default)]
pub struct InspectOptions {
    pub run_id: Option<String>,
    /// When true, walk generated/cache trees instead of summarizing them.
    pub include_generated: bool,
    /// When false, skip writing artifacts / bounding (tests only).
    pub externalize: bool,
}

impl InspectOptions {
    pub fn new() -> Self {
        Self {
            run_id: None,
            include_generated: false,
            externalize: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct MachineReceipt {
    pub schema: String,
    pub capability: String,
    pub root: String,
    pub run_id: String,
    pub inputs: BTreeMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<Value>,
    pub facts: Vec<FileFact>,
    pub edges: Vec<Value>,
    pub findings: Vec<Value>,
    pub artifacts: Vec<Value>,
    pub errors: Vec<MachineError>,
    pub stats: InspectStats,
    pub provenance: Provenance,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileFact {
    pub id: String,
    /// Filesystem object kind: file | symlink
    pub fs_kind: String,
    pub path: String,
    pub size: u64,
    pub mtime_unix_ms: Option<u64>,
    pub sha256: String,
    pub extension: Option<String>,
    pub source: SourceInfo,
    pub content: ContentEvidence,
    pub classification: Classification,
    /// Execution provenance for this fact (not file-content classification).
    pub analysis: FileAnalysis,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileAnalysis {
    /// True when Machine reused a prior analysis cache entry for this SHA.
    pub cache_hit: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SourceInfo {
    #[serde(rename = "type")]
    pub type_id: String,
    pub language: Option<String>,
    pub syntax: Option<String>,
    /// code | document | asset | binary
    pub kind: Option<String>,
    pub ast_capable: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContentEvidence {
    /// text | image | archive | binary | database | symlink
    pub kind: String,
    /// Character encoding when content is text (e.g. utf-8). Not a magic signature.
    pub encoding: Option<String>,
    /// Binary magic signature when known (png, zip, wasm, …).
    pub signature: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Classification {
    pub category: String,
    pub role: String,
    pub generated: bool,
    pub include_by_default: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct MachineError {
    pub path: String,
    pub operation: String,
    pub message: String,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct InspectStats {
    pub files: u64,
    pub symlinks: u64,
    pub directories: u64,
    pub ignored_directories: u64,
    pub skipped_noise_files: u64,
    pub bytes: u64,
    pub excluded_subtrees: Vec<ExcludedSubtree>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ExcludedSubtree {
    pub path: String,
    pub reason: String,
    pub files: u64,
    pub bytes: u64,
    pub default_disposition: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct Provenance {
    pub engine: String,
    pub engine_version: String,
    pub parser_version: String,
    pub artifact_schema_version: String,
    pub source_mutated: bool,
    pub network_used: bool,
    pub cache: CacheProvenance,
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheProvenance {
    pub schema: String,
    pub hits: u64,
    pub misses: u64,
    pub enabled: bool,
}

pub fn inspect_path(target: &Path, requested_run_id: Option<&str>) -> io::Result<MachineReceipt> {
    let mut opts = InspectOptions::new();
    opts.run_id = requested_run_id.map(str::to_owned);
    inspect_path_with_options(target, opts)
}

pub fn inspect_path_with_options(
    target: &Path,
    options: InspectOptions,
) -> io::Result<MachineReceipt> {
    let inspection_target = fs::canonicalize(target)?;
    let metadata = fs::symlink_metadata(&inspection_target)?;

    // Single-file inspect: perception walks the file, but cache/artifacts live under
    // the containing directory (never `<file>/.agentsam/...`).
    let content_root: PathBuf = if metadata.is_file() {
        let parent = inspection_target
            .parent()
            .filter(|p| !p.as_os_str().is_empty())
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "cannot determine parent directory for file inspect target",
                )
            })?;
        fs::canonicalize(parent)?
    } else {
        inspection_target.clone()
    };

    let root_text = inspection_target.to_string_lossy().into_owned();
    let content_root_text = content_root.to_string_lossy().into_owned();
    let run_id = options
        .run_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| default_run_id(&root_text));

    let mut inputs = BTreeMap::new();
    inputs.insert("target".to_string(), root_text.clone());
    inputs.insert("content_root".to_string(), content_root_text.clone());
    inputs.insert(
        "include_generated".to_string(),
        options.include_generated.to_string(),
    );

    let mut receipt = MachineReceipt {
        schema: RECEIPT_SCHEMA.to_string(),
        capability: "machine.inspect".to_string(),
        root: root_text,
        run_id,
        inputs,
        summary: None,
        detail: None,
        facts: Vec::new(),
        edges: Vec::new(),
        findings: Vec::new(),
        artifacts: Vec::new(),
        errors: Vec::new(),
        stats: InspectStats::default(),
        provenance: Provenance {
            engine: "agentsam-machine".to_string(),
            engine_version: ENGINE_VERSION.to_string(),
            parser_version: PARSER_VERSION.to_string(),
            artifact_schema_version: ARTIFACT_SCHEMA_VERSION.to_string(),
            source_mutated: false,
            network_used: false,
            cache: CacheProvenance {
                schema: "agentsam.machine.cache.v1".to_string(),
                hits: 0,
                misses: 0,
                enabled: true,
            },
        },
    };

    if metadata.is_file() {
        inspect_file(&content_root, &inspection_target, &metadata, &mut receipt);
    } else if metadata.is_dir() {
        walk_directory(
            &content_root,
            &content_root,
            &mut receipt,
            options.include_generated,
        )?;
    }

    receipt.facts.sort_by(|a, b| a.path.cmp(&b.path));
    receipt.errors.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then_with(|| a.operation.cmp(&b.operation))
            .then_with(|| a.message.cmp(&b.message))
    });

    // Incrementality hook: reuse prior fact cache entries when sha256 + parser match.
    apply_fact_cache(&content_root, &mut receipt);

    enrich_receipt(&content_root, &mut receipt);
    persist_fact_cache(&content_root, &receipt);

    if options.externalize {
        externalize_and_bound(&content_root, &mut receipt, BoundLimits::default())?;
    }

    Ok(receipt)
}

fn walk_directory(
    root: &Path,
    current: &Path,
    receipt: &mut MachineReceipt,
    include_generated: bool,
) -> io::Result<()> {
    receipt.stats.directories += 1;
    let mut entries = match fs::read_dir(current) {
        Ok(entries) => entries.filter_map(Result::ok).collect::<Vec<_>>(),
        Err(error) => {
            receipt.errors.push(MachineError {
                path: relative_path(root, current),
                operation: "read_dir".to_string(),
                message: error.to_string(),
            });
            return Ok(());
        }
    };
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let path = entry.path();
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(error) => {
                receipt.errors.push(MachineError {
                    path: relative_path(root, &path),
                    operation: "metadata".to_string(),
                    message: error.to_string(),
                });
                continue;
            }
        };

        if metadata.file_type().is_symlink() {
            inspect_symlink(root, &path, &metadata, receipt);
            continue;
        }

        if metadata.is_dir() {
            if !include_generated && is_ignored_directory(&file_name) {
                receipt.stats.ignored_directories += 1;
                let (files, bytes) = summarize_tree(&path);
                receipt.stats.excluded_subtrees.push(ExcludedSubtree {
                    path: relative_path(root, &path),
                    reason: format!("ignored_directory:{file_name}"),
                    files,
                    bytes,
                    default_disposition: "exclude".to_string(),
                });
                continue;
            }
            // Never recurse into our own machine artifact store even with --include-generated,
            // unless the user pointed inspect directly at it (handled by root walk start).
            if file_name == ".agentsam" && current == root && include_generated {
                // allow if explicitly including generated — still skip machine runs flood
                let machine_runs = path.join("machine").join("runs");
                if machine_runs.exists() {
                    receipt.stats.ignored_directories += 1;
                    let (files, bytes) = summarize_tree(&machine_runs);
                    receipt.stats.excluded_subtrees.push(ExcludedSubtree {
                        path: relative_path(root, &machine_runs),
                        reason: "ignored_directory:machine_runs".to_string(),
                        files,
                        bytes,
                        default_disposition: "exclude".to_string(),
                    });
                }
            }
            walk_directory(root, &path, receipt, include_generated)?;
            continue;
        }

        if metadata.is_file() {
            if is_noise_file(&file_name) {
                receipt.stats.skipped_noise_files += 1;
                continue;
            }
            inspect_file(root, &path, &metadata, receipt);
        }
    }

    Ok(())
}

fn summarize_tree(path: &Path) -> (u64, u64) {
    let mut files = 0u64;
    let mut bytes = 0u64;
    let mut stack = vec![path.to_path_buf()];
    while let Some(current) = stack.pop() {
        let Ok(entries) = fs::read_dir(&current) else {
            continue;
        };
        for entry in entries.flatten() {
            let p = entry.path();
            let name = entry.file_name().to_string_lossy().into_owned();
            if is_noise_file(&name) {
                continue;
            }
            let Ok(meta) = fs::symlink_metadata(&p) else {
                continue;
            };
            if meta.is_dir() {
                if is_ignored_directory(&name) {
                    continue;
                }
                stack.push(p);
            } else if meta.is_file() {
                files += 1;
                bytes = bytes.saturating_add(meta.len());
            }
        }
    }
    (files, bytes)
}

fn inspect_file(root: &Path, path: &Path, metadata: &Metadata, receipt: &mut MachineReceipt) {
    match hash_file(path) {
        Ok((sha256, prefix)) => {
            let rel = relative_path(root, path);
            let content = classify_content_prefix(&prefix);
            let (source, classification) = classify_semantic(&rel, &content);
            receipt.stats.files += 1;
            receipt.stats.bytes = receipt.stats.bytes.saturating_add(metadata.len());
            receipt.facts.push(FileFact {
                id: format!("file:{rel}"),
                fs_kind: "file".to_string(),
                path: rel.clone(),
                size: metadata.len(),
                mtime_unix_ms: modified_ms(metadata),
                sha256,
                extension: path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase()),
                source,
                content,
                classification,
                analysis: FileAnalysis { cache_hit: false },
            });
        }
        Err(error) => receipt.errors.push(MachineError {
            path: relative_path(root, path),
            operation: "hash".to_string(),
            message: error.to_string(),
        }),
    }
}

fn inspect_symlink(root: &Path, path: &Path, metadata: &Metadata, receipt: &mut MachineReceipt) {
    match fs::read_link(path) {
        Ok(target) => {
            let literal = target.to_string_lossy().into_owned();
            let digest = sha256_bytes(literal.as_bytes());
            let rel = relative_path(root, path);
            receipt.stats.symlinks += 1;
            receipt.facts.push(FileFact {
                id: format!("symlink:{rel}"),
                fs_kind: "symlink".to_string(),
                path: rel,
                size: literal.len() as u64,
                mtime_unix_ms: modified_ms(metadata),
                sha256: digest,
                extension: path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase()),
                source: SourceInfo {
                    type_id: "unknown".to_string(),
                    language: None,
                    syntax: None,
                    kind: Some("binary".to_string()),
                    ast_capable: false,
                },
                content: ContentEvidence {
                    kind: "symlink".to_string(),
                    encoding: None,
                    signature: None,
                },
                classification: Classification {
                    category: "link".to_string(),
                    role: "symlink".to_string(),
                    generated: false,
                    include_by_default: false,
                },
                analysis: FileAnalysis { cache_hit: false },
            });
        }
        Err(error) => receipt.errors.push(MachineError {
            path: relative_path(root, path),
            operation: "read_link".to_string(),
            message: error.to_string(),
        }),
    }
}

fn classify_semantic(rel: &str, content: &ContentEvidence) -> (SourceInfo, Classification) {
    let index = SourceTypeIndex::global();
    if let Some(def) = index.for_path(rel) {
        let syntax = index.syntax_for(rel, def);
        let role = match def.kind.as_str() {
            "code" if rel.contains("frontend/") || rel.contains("/src/") => "frontend_source",
            "code" => "source",
            "document" if def.id == "html" => "page_candidate",
            "document" if def.id == "liquid" && rel.starts_with("sections/") => "section_candidate",
            "document" if def.id == "liquid" && rel.starts_with("snippets/") => "snippet_candidate",
            "document" if def.id == "liquid" && rel.starts_with("layout/") => "layout_shell",
            "document" if def.id == "liquid" && rel.starts_with("templates/") => "template_candidate",
            "document" if def.id == "json" && rel.ends_with("theme.json") => "theme_manifest",
            "document" if def.id == "json" && rel.starts_with("templates/") => "template_candidate",
            "document" if def.id == "css" => "stylesheet",
            "asset" if def.id == "svg" => "image",
            "asset" => "asset",
            "binary" => "binary",
            _ => "file",
        };
        let category = match def.kind.as_str() {
            "code" => "source",
            "document" if def.id == "markdown" => "docs",
            "document" => "source",
            "asset" => "asset",
            "binary" => "binary",
            _ => "other",
        };
        return (
            SourceInfo {
                type_id: def.id.clone(),
                language: Some(def.label.clone()),
                syntax,
                kind: Some(def.kind.clone()),
                ast_capable: def.ast,
            },
            Classification {
                category: category.to_string(),
                role: role.to_string(),
                generated: false,
                include_by_default: true,
            },
        );
    }

    // Unknown is first-class — never emit null type.
    let (kind, category, role) = match content.kind.as_str() {
        "image" => ("asset", "asset", "image"),
        "archive" => ("binary", "archive", "archive"),
        "database" => ("binary", "data", "database"),
        "text" => ("document", "source", "text"),
        _ => ("binary", "binary", "binary"),
    };
    (
        SourceInfo {
            type_id: "unknown".to_string(),
            language: None,
            syntax: None,
            kind: Some(kind.to_string()),
            ast_capable: false,
        },
        Classification {
            category: category.to_string(),
            role: role.to_string(),
            generated: false,
            include_by_default: kind != "binary",
        },
    )
}

fn hash_file(path: &Path) -> io::Result<(String, Vec<u8>)> {
    let mut file = File::open(path)?;
    let mut hasher = Sha256::new();
    let mut prefix = Vec::with_capacity(64);
    let mut buffer = [0u8; 64 * 1024];

    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        if prefix.len() < 64 {
            let remaining = 64 - prefix.len();
            prefix.extend_from_slice(&buffer[..read.min(remaining)]);
        }
        hasher.update(&buffer[..read]);
    }

    Ok((format!("{:x}", hasher.finalize()), prefix))
}

fn sha256_bytes(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn classify_content_prefix(prefix: &[u8]) -> ContentEvidence {
    if prefix.starts_with(b"\x89PNG\r\n\x1a\n") {
        return ContentEvidence {
            kind: "image".into(),
            encoding: None,
            signature: Some("png".into()),
        };
    }
    if prefix.starts_with(&[0xff, 0xd8, 0xff]) {
        return ContentEvidence {
            kind: "image".into(),
            encoding: None,
            signature: Some("jpeg".into()),
        };
    }
    if prefix.starts_with(b"GIF87a") || prefix.starts_with(b"GIF89a") {
        return ContentEvidence {
            kind: "image".into(),
            encoding: None,
            signature: Some("gif".into()),
        };
    }
    if prefix.starts_with(b"%PDF-") {
        return ContentEvidence {
            kind: "document".into(),
            encoding: None,
            signature: Some("pdf".into()),
        };
    }
    if prefix.starts_with(b"PK\x03\x04") {
        return ContentEvidence {
            kind: "archive".into(),
            encoding: None,
            signature: Some("zip".into()),
        };
    }
    if prefix.starts_with(&[0x1f, 0x8b]) {
        return ContentEvidence {
            kind: "archive".into(),
            encoding: None,
            signature: Some("gzip".into()),
        };
    }
    if prefix.starts_with(b"\0asm") {
        return ContentEvidence {
            kind: "binary".into(),
            encoding: None,
            signature: Some("wasm".into()),
        };
    }
    if prefix.starts_with(b"SQLite format 3\0") {
        return ContentEvidence {
            kind: "database".into(),
            encoding: None,
            signature: Some("sqlite".into()),
        };
    }
    if prefix.starts_with(&[0x7f, b'E', b'L', b'F']) {
        return ContentEvidence {
            kind: "binary".into(),
            encoding: None,
            signature: Some("elf".into()),
        };
    }
    if !prefix.contains(&0) && std::str::from_utf8(prefix).is_ok() {
        return ContentEvidence {
            kind: "text".into(),
            encoding: Some("utf-8".into()),
            signature: None,
        };
    }
    ContentEvidence {
        kind: "binary".into(),
        encoding: None,
        signature: None,
    }
}

fn is_ignored_directory(name: &str) -> bool {
    IGNORE_DIRS.iter().any(|candidate| *candidate == name)
}

fn is_noise_file(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    name == ".DS_Store"
        || name == "Thumbs.db"
        || name == "desktop.ini"
        || name.starts_with("._")
        || lower.ends_with(".min.js")
        || lower.ends_with(".bundle.js")
        || lower.ends_with(".map")
}

fn relative_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn modified_ms(metadata: &Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
}

fn default_run_id(root: &str) -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let seed = format!("{root}:{now}:{}", std::process::id());
    format!("run_{}", &sha256_bytes(seed.as_bytes())[..16])
}

fn cache_dir(root: &Path) -> std::path::PathBuf {
    root.join(".agentsam")
        .join("machine")
        .join("cache")
        .join(PARSER_VERSION)
}

fn apply_fact_cache(root: &Path, receipt: &mut MachineReceipt) {
    let dir = cache_dir(root);
    if !dir.exists() {
        receipt.provenance.cache.misses = receipt.facts.len() as u64;
        return;
    }
    for fact in &mut receipt.facts {
        let path = dir.join(format!("{}.json", fact.sha256));
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(cached) = serde_json::from_str::<CachedFact>(&text) {
                if cached.parser_version == PARSER_VERSION
                    && cached.engine_version == ENGINE_VERSION
                    && cached.source_type == fact.source.type_id
                {
                    fact.analysis.cache_hit = true;
                    receipt.provenance.cache.hits += 1;
                    continue;
                }
            }
        }
        receipt.provenance.cache.misses += 1;
    }
}

fn persist_fact_cache(root: &Path, receipt: &MachineReceipt) {
    let dir = cache_dir(root);
    let _ = fs::create_dir_all(&dir);
    for fact in &receipt.facts {
        let cached = CachedFact {
            parser_version: PARSER_VERSION.to_string(),
            engine_version: ENGINE_VERSION.to_string(),
            sha256: fact.sha256.clone(),
            path: fact.path.clone(),
            source_type: fact.source.type_id.clone(),
            role: fact.classification.role.clone(),
        };
        if let Ok(text) = serde_json::to_string(&cached) {
            let _ = fs::write(dir.join(format!("{}.json", fact.sha256)), text);
        }
    }
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct CachedFact {
    parser_version: String,
    engine_version: String,
    sha256: String,
    path: String,
    source_type: String,
    role: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn normalizes_keys_deterministically() {
        assert_eq!(normalize_resource_key("  Hello / World  "), "hello-world");
    }

    #[test]
    fn inspect_classifies_source_types_and_splits_encoding_from_signature() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir_all(temp.path().join("src")).unwrap();
        fs::create_dir_all(temp.path().join("target")).unwrap();
        fs::write(
            temp.path().join("src/lib.rs"),
            b"pub fn answer() -> u32 { 42 }\n",
        )
        .unwrap();
        fs::write(temp.path().join("README.md"), b"# Example\n").unwrap();
        fs::write(temp.path().join("target/generated.rs"), b"generated").unwrap();
        fs::write(temp.path().join("._noise"), b"appledouble").unwrap();

        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_test".into());
        opts.externalize = false;
        let receipt = inspect_path_with_options(temp.path(), opts).unwrap();
        let paths: Vec<_> = receipt.facts.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, vec!["README.md", "src/lib.rs"]);
        assert!(receipt.stats.skipped_noise_files >= 1);

        let rust = receipt.facts.iter().find(|f| f.path == "src/lib.rs").unwrap();
        assert_eq!(rust.fs_kind, "file");
        assert_eq!(rust.source.type_id, "rust");
        assert_eq!(rust.source.language.as_deref(), Some("Rust"));
        assert_eq!(rust.source.kind.as_deref(), Some("code"));
        assert_eq!(rust.content.encoding.as_deref(), Some("utf-8"));
        assert!(rust.content.signature.is_none());
        assert!(!receipt.findings.is_empty());
        assert!(!receipt.artifacts.is_empty());
        assert_eq!(receipt.stats.excluded_subtrees.len(), 1);
        assert_eq!(receipt.stats.excluded_subtrees[0].path, "target");
    }

    #[test]
    fn unknown_type_never_null() {
        let temp = tempfile::tempdir().unwrap();
        fs::write(temp.path().join("mystery"), b"not a known type\n").unwrap();
        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_unknown".into());
        opts.externalize = false;
        let receipt = inspect_path_with_options(temp.path(), opts).unwrap();
        let fact = receipt.facts.first().unwrap();
        assert_eq!(fact.source.type_id, "unknown");
    }

    #[test]
    fn include_generated_walks_ignored_dirs() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir_all(temp.path().join("dist")).unwrap();
        fs::write(temp.path().join("dist/out.js"), b"console.log(1)\n").unwrap();
        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_inc".into());
        opts.include_generated = true;
        opts.externalize = false;
        let receipt = inspect_path_with_options(temp.path(), opts).unwrap();
        assert!(receipt.facts.iter().any(|f| f.path == "dist/out.js"));
    }

    #[test]
    fn binary_signature_is_not_called_magic_utf8() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("module.bin");
        let mut file = File::create(&path).unwrap();
        file.write_all(b"\0asm\x01\0\0\0").unwrap();

        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_magic".into());
        opts.externalize = false;
        let receipt = inspect_path_with_options(temp.path(), opts).unwrap();
        let fact = receipt.facts.first().unwrap();
        assert_eq!(fact.content.kind, "binary");
        assert_eq!(fact.content.signature.as_deref(), Some("wasm"));
        assert!(fact.content.encoding.is_none());
        assert_eq!(fact.source.type_id, "unknown");
    }

    #[test]
    fn church_site_fixture_produces_semantic_perception() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../apps/client-cms-editor/fixtures/donor-themes/cypress");
        assert!(
            fixture.join("site/index.html").exists(),
            "cypress fixture missing at {}",
            fixture.display()
        );

        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_church".into());
        // Keep full facts in-memory for assertions; still exercise enrichment.
        opts.externalize = false;
        let receipt = inspect_path_with_options(&fixture, opts).unwrap();

        let html = receipt
            .facts
            .iter()
            .filter(|f| f.source.type_id == "html")
            .count();
        let svg = receipt
            .facts
            .iter()
            .filter(|f| f.source.type_id == "svg")
            .count();
        let json = receipt
            .facts
            .iter()
            .filter(|f| f.source.type_id == "json")
            .count();

        assert_eq!(html, 5, "expected 5 HTML pages");
        assert_eq!(svg, 9, "expected 9 SVG assets");
        assert_eq!(json, 1, "expected theme.json");
        assert!(receipt.edges.len() > 0, "edges must not be empty");
        assert!(receipt.findings.len() > 0, "findings must not be empty");
        assert!(receipt.artifacts.len() > 0, "artifacts must not be empty");

        assert!(receipt
            .findings
            .iter()
            .any(|f| f.get("kind") == Some(&serde_json::json!("theme_manifest_candidate"))
                || f.get("observation") == Some(&serde_json::json!("theme_manifest"))));
        assert!(receipt
            .findings
            .iter()
            .any(|f| f.get("kind") == Some(&serde_json::json!("composition"))
                || f.get("observation") == Some(&serde_json::json!("html_documents"))));
        assert!(!receipt.edges.iter().any(|e| {
            e.get("type") == Some(&serde_json::json!("theme_applies_to"))
        }));
        assert!(receipt
            .artifacts
            .iter()
            .any(|a| a.get("kind") == Some(&serde_json::json!("route_manifest"))
                || a.get("kind") == Some(&serde_json::json!("asset_manifest"))));
        assert!(receipt.edges.iter().any(|e| {
            e.get("type") == Some(&serde_json::json!("asset_reference"))
                && e
                    .pointer("/evidence/literal")
                    .and_then(|v| v.as_str())
                    .is_some_and(|s| s.starts_with("https://"))
        }));
        assert!(!receipt.provenance.network_used);

        for finding in &receipt.findings {
            let has_support = finding.get("evidence").is_some()
                || finding.get("observations").is_some()
                || finding.get("composition").is_some();
            assert!(
                has_support,
                "finding missing evidence/observations/composition: {finding}"
            );
        }

        let beliefs = receipt
            .facts
            .iter()
            .find(|f| f.path == "site/beliefs.html")
            .unwrap();
        assert_eq!(beliefs.fs_kind, "file");
        assert_eq!(beliefs.source.type_id, "html");
        assert_eq!(beliefs.classification.role, "page_candidate");
        assert!(!beliefs.classification.generated);
        assert_eq!(beliefs.content.encoding.as_deref(), Some("utf-8"));
        assert!(beliefs.content.signature.is_none());
        // analysis.cache_hit is execution provenance, not "this file is cache content"
        assert!(!beliefs.analysis.cache_hit || receipt.provenance.cache.hits > 0);

        assert_graph_edge_ids_unique(&receipt.edges);
    }

    #[test]
    fn single_file_inspect_externalizes_under_parent_not_file() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join(
            "../../../apps/client-cms-editor/fixtures/frontend-perception/page.tsx",
        );
        assert!(fixture.exists(), "missing fixture {}", fixture.display());

        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_single_file".into());
        opts.externalize = true;
        let receipt = inspect_path_with_options(&fixture, opts).unwrap();

        assert_eq!(receipt.stats.files, 1);
        assert!(receipt.facts.iter().any(|f| f.path.ends_with("page.tsx")));
        assert!(
            receipt
                .inputs
                .get("content_root")
                .is_some_and(|r| Path::new(r).is_dir()),
            "content_root must be a directory"
        );
        let artifact_dir = receipt
            .detail
            .as_ref()
            .and_then(|d| d.get("artifact_dir"))
            .and_then(|v| v.as_str())
            .expect("artifact_dir");
        assert!(
            artifact_dir.contains("/.agentsam/machine/runs/"),
            "unexpected artifact_dir: {artifact_dir}"
        );
        assert!(
            !artifact_dir.contains("page.tsx/.agentsam"),
            "must not nest .agentsam under the file path: {artifact_dir}"
        );
        assert!(Path::new(artifact_dir).is_dir());
    }

    #[test]
    fn frontend_perception_page_tsx_emits_generic_candidates() {
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join(
            "../../../apps/client-cms-editor/fixtures/frontend-perception/page.tsx",
        );
        let mut opts = InspectOptions::new();
        opts.run_id = Some("run_frontend_perception".into());
        opts.externalize = false;
        let receipt = inspect_path_with_options(&fixture, opts).unwrap();

        let finding = receipt
            .findings
            .iter()
            .find(|f| f.get("kind") == Some(&serde_json::json!("frontend_source_candidates")))
            .expect("frontend_source_candidates finding");
        let candidates = finding.get("candidates").expect("candidates");
        let routes = candidates
            .get("route_candidate")
            .and_then(|v| v.as_array())
            .expect("route_candidate");
        assert!(
            routes.iter().any(|r| r.as_str() == Some("/")),
            "expected slug / in routes: {routes:?}"
        );
        assert!(routes.iter().any(|r| r.as_str() == Some("/work")));

        let shells = candidates
            .get("shell_candidate")
            .and_then(|v| v.as_array())
            .expect("shell_candidate");
        for zone in ["HEADER", "BODY", "FOOTER"] {
            assert!(
                shells.iter().any(|s| s.as_str() == Some(zone)),
                "missing shell zone {zone}"
            );
        }

        let sections = candidates
            .get("section_candidate")
            .and_then(|v| v.as_array())
            .expect("section_candidate");
        assert!(
            sections.iter().any(|s| {
                s.get("type").and_then(|t| t.as_str()) == Some("Hero")
                    && s.get("zone").and_then(|z| z.as_str()) == Some("BODY")
            }),
            "expected Hero BODY section candidate: {sections:?}"
        );

        let tokens = candidates
            .get("design_token_evidence")
            .and_then(|v| v.as_array())
            .expect("design_token_evidence");
        assert!(tokens.iter().any(|t| {
            t.as_str()
                .is_some_and(|s| s.starts_with("--") || s.starts_with('#'))
        }));

        // Must stay generic — no CMS identity productization in Machine.
        let blob = serde_json::to_string(&receipt.findings).unwrap();
        assert!(!blob.contains("hero.cinematic"));
        assert!(!blob.contains("navigation.minimal"));

        assert_graph_edge_ids_unique(&receipt.edges);
    }

    fn assert_graph_edge_ids_unique(edges: &[Value]) {
        use std::collections::BTreeSet;
        let mut seen = BTreeSet::new();
        for edge in edges {
            let id = edge
                .get("id")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| panic!("edge missing non-empty id: {edge}"));
            assert!(
                seen.insert(id.to_string()),
                "duplicate edge id: {id}"
            );
        }
    }
}
