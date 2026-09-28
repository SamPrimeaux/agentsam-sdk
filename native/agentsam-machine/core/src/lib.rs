use std::collections::BTreeMap;
use std::fs::{self, File, Metadata};
use std::io::{self, Read};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};

pub const RECEIPT_SCHEMA: &str = "agentsam.machine.receipt.v1";
pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
const IGNORE_DIRS: &[&str] = &[
    ".git",
    ".agentsam",
    "node_modules",
    "target",
    "build",
    "dist",
    ".next",
    ".wrangler",
    ".vinext",
    "__pycache__",
    ".cache",
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

#[derive(Debug, Clone, Serialize)]
pub struct MachineReceipt {
    pub schema: String,
    pub capability: String,
    pub root: String,
    pub run_id: String,
    pub inputs: BTreeMap<String, String>,
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
    pub kind: String,
    pub path: String,
    pub size: u64,
    pub mtime_unix_ms: Option<u64>,
    pub sha256: String,
    pub extension: Option<String>,
    pub type_evidence: TypeEvidence,
}

#[derive(Debug, Clone, Serialize)]
pub struct TypeEvidence {
    pub content_kind: String,
    pub magic: Option<String>,
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
    pub bytes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Provenance {
    pub engine: String,
    pub engine_version: String,
    pub source_mutated: bool,
    pub network_used: bool,
}

pub fn inspect_path(target: &Path, requested_run_id: Option<&str>) -> io::Result<MachineReceipt> {
    let root = fs::canonicalize(target)?;
    let root_text = root.to_string_lossy().into_owned();
    let run_id = requested_run_id
        .filter(|value| !value.trim().is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| default_run_id(&root_text));

    let mut inputs = BTreeMap::new();
    inputs.insert("target".to_string(), root_text.clone());

    let mut receipt = MachineReceipt {
        schema: RECEIPT_SCHEMA.to_string(),
        capability: "machine.inspect".to_string(),
        root: root_text,
        run_id,
        inputs,
        facts: Vec::new(),
        edges: Vec::new(),
        findings: Vec::new(),
        artifacts: Vec::new(),
        errors: Vec::new(),
        stats: InspectStats::default(),
        provenance: Provenance {
            engine: "agentsam-machine".to_string(),
            engine_version: ENGINE_VERSION.to_string(),
            source_mutated: false,
            network_used: false,
        },
    };

    let metadata = fs::symlink_metadata(&root)?;
    if metadata.is_file() {
        let fact_root = root.parent().unwrap_or_else(|| Path::new(""));
        inspect_file(fact_root, &root, &metadata, &mut receipt);
    } else if metadata.is_dir() {
        walk_directory(&root, &root, &mut receipt)?;
    }

    receipt.facts.sort_by(|a, b| a.path.cmp(&b.path));
    receipt.errors.sort_by(|a, b| {
        a.path
            .cmp(&b.path)
            .then_with(|| a.operation.cmp(&b.operation))
            .then_with(|| a.message.cmp(&b.message))
    });
    Ok(receipt)
}

fn walk_directory(root: &Path, current: &Path, receipt: &mut MachineReceipt) -> io::Result<()> {
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
            if is_ignored_directory(&file_name) {
                receipt.stats.ignored_directories += 1;
                continue;
            }
            walk_directory(root, &path, receipt)?;
            continue;
        }

        if metadata.is_file() {
            inspect_file(root, &path, &metadata, receipt);
        }
    }

    Ok(())
}

fn inspect_file(root: &Path, path: &Path, metadata: &Metadata, receipt: &mut MachineReceipt) {
    match hash_file(path) {
        Ok((sha256, prefix)) => {
            let evidence = classify_prefix(&prefix);
            receipt.stats.files += 1;
            receipt.stats.bytes = receipt.stats.bytes.saturating_add(metadata.len());
            receipt.facts.push(FileFact {
                kind: "file".to_string(),
                path: relative_path(root, path),
                size: metadata.len(),
                mtime_unix_ms: modified_ms(metadata),
                sha256,
                extension: path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase()),
                type_evidence: evidence,
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
            receipt.stats.symlinks += 1;
            receipt.facts.push(FileFact {
                kind: "symlink".to_string(),
                path: relative_path(root, path),
                size: literal.len() as u64,
                mtime_unix_ms: modified_ms(metadata),
                sha256: digest,
                extension: path
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase()),
                type_evidence: TypeEvidence {
                    content_kind: "symlink".to_string(),
                    magic: None,
                },
            });
        }
        Err(error) => receipt.errors.push(MachineError {
            path: relative_path(root, path),
            operation: "read_link".to_string(),
            message: error.to_string(),
        }),
    }
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

fn classify_prefix(prefix: &[u8]) -> TypeEvidence {
    let (content_kind, magic) = if prefix.starts_with(b"\x89PNG\r\n\x1a\n") {
        ("image", Some("png"))
    } else if prefix.starts_with(&[0xff, 0xd8, 0xff]) {
        ("image", Some("jpeg"))
    } else if prefix.starts_with(b"GIF87a") || prefix.starts_with(b"GIF89a") {
        ("image", Some("gif"))
    } else if prefix.starts_with(b"%PDF-") {
        ("document", Some("pdf"))
    } else if prefix.starts_with(b"PK\x03\x04") {
        ("archive", Some("zip"))
    } else if prefix.starts_with(&[0x1f, 0x8b]) {
        ("archive", Some("gzip"))
    } else if prefix.starts_with(b"\0asm") {
        ("binary", Some("wasm"))
    } else if prefix.starts_with(b"SQLite format 3\0") {
        ("database", Some("sqlite"))
    } else if prefix.starts_with(&[0x7f, b'E', b'L', b'F']) {
        ("binary", Some("elf"))
    } else if !prefix.contains(&0) && std::str::from_utf8(prefix).is_ok() {
        ("text", Some("utf8"))
    } else {
        ("binary", None)
    };

    TypeEvidence {
        content_kind: content_kind.to_string(),
        magic: magic.map(ToOwned::to_owned),
    }
}

fn is_ignored_directory(name: &str) -> bool {
    IGNORE_DIRS.iter().any(|candidate| *candidate == name)
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn normalizes_keys_deterministically() {
        assert_eq!(normalize_resource_key("  Hello / World  "), "hello-world");
    }

    #[test]
    fn inspect_is_sorted_hashed_and_ignores_operational_or_generated_dirs() {
        let temp = tempfile::tempdir().unwrap();
        fs::create_dir_all(temp.path().join("src")).unwrap();
        fs::create_dir_all(temp.path().join("target")).unwrap();
        fs::create_dir_all(temp.path().join(".agentsam")).unwrap();
        fs::write(
            temp.path().join("src/lib.rs"),
            b"pub fn answer() -> u32 { 42 }\n",
        )
        .unwrap();
        fs::write(temp.path().join("README.md"), b"# Example\n").unwrap();
        fs::write(temp.path().join("target/generated.rs"), b"generated").unwrap();
        fs::write(temp.path().join(".agentsam/state.json"), b"state").unwrap();

        let receipt = inspect_path(temp.path(), Some("run_test")).unwrap();
        let paths = receipt
            .facts
            .iter()
            .map(|fact| fact.path.as_str())
            .collect::<Vec<_>>();

        assert_eq!(receipt.schema, RECEIPT_SCHEMA);
        assert_eq!(receipt.capability, "machine.inspect");
        assert_eq!(receipt.run_id, "run_test");
        assert_eq!(paths, vec!["README.md", "src/lib.rs"]);
        assert_eq!(receipt.stats.files, 2);
        assert_eq!(receipt.stats.ignored_directories, 2);
        assert!(!receipt.provenance.source_mutated);
        assert!(!receipt.provenance.network_used);
        assert_eq!(
            receipt
                .facts
                .iter()
                .find(|fact| fact.path == "src/lib.rs")
                .unwrap()
                .type_evidence
                .magic
                .as_deref(),
            Some("utf8")
        );
    }

    #[test]
    fn explicit_file_target_produces_one_file_fact() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("single.rs");
        fs::write(&path, b"pub fn single() {}\n").unwrap();

        let receipt = inspect_path(&path, Some("run_file")).unwrap();
        assert_eq!(
            receipt.root,
            fs::canonicalize(&path).unwrap().to_string_lossy()
        );
        assert_eq!(receipt.stats.files, 1);
        assert_eq!(receipt.facts.len(), 1);
        assert_eq!(receipt.facts[0].path, "single.rs");
        assert_eq!(receipt.facts[0].extension.as_deref(), Some("rs"));
    }

    #[test]
    fn magic_bytes_are_evidence_not_semantic_language_authority() {
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("module.bin");
        let mut file = File::create(&path).unwrap();
        file.write_all(b"\0asm\x01\0\0\0").unwrap();

        let receipt = inspect_path(temp.path(), Some("run_magic")).unwrap();
        let fact = receipt.facts.first().unwrap();
        assert_eq!(fact.extension.as_deref(), Some("bin"));
        assert_eq!(fact.type_evidence.content_kind, "binary");
        assert_eq!(fact.type_evidence.magic.as_deref(), Some("wasm"));
    }
}
