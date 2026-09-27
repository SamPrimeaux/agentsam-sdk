//! Native LocalContentHost filesystem for the packaged desktop shell.
//!
//! - Opaque `localref_*` / `localdir_*` refs (absolute paths never leave Rust)
//! - Native file/directory pickers via `rfd` (no browser base64 on pick)
//! - Explicit granted roots; browse in place; copy only on `import_to_library`
//! - No monorepo Node script / global Node requirement for FS ops
//!
//! Migration target: agentsamd native `/v1/fs` when available.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use rand::{distributions::Alphanumeric, Rng};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

const MAX_READ_BYTES: u64 = 32 * 1024 * 1024;
const GRANTS_FILE: &str = "content-grants.json";
const LIBRARY_DIR: &str = "content-library";

#[derive(Clone, Debug)]
struct GrantEntry {
  id: String,
  kind: GrantKind,
  abs_path: PathBuf,
  name: String,
  /// True when this is a user-selected root (persisted).
  is_root: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum GrantKind {
  File,
  Directory,
}

pub struct LocalContentState {
  grants: Mutex<HashMap<String, GrantEntry>>,
}

impl Default for LocalContentState {
  fn default() -> Self {
    Self {
      grants: Mutex::new(HashMap::new()),
    }
  }
}

fn mint_id(prefix: &str) -> String {
  let suffix: String = rand::thread_rng()
    .sample_iter(&Alphanumeric)
    .take(16)
    .map(char::from)
    .collect();
  format!("{prefix}_{suffix}")
}

fn app_content_root(app: &AppHandle) -> Result<PathBuf, String> {
  let base = app
    .path()
    .app_data_dir()
    .map_err(|e| format!("app_data_dir:{e}"))?;
  let root = base.join(".agentsam");
  fs::create_dir_all(&root).map_err(|e| format!("mkdir_agentsam:{e}"))?;
  Ok(root)
}

fn library_dir(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app_content_root(app)?.join(LIBRARY_DIR);
  fs::create_dir_all(&dir).map_err(|e| format!("mkdir_library:{e}"))?;
  Ok(dir)
}

fn grants_path(app: &AppHandle) -> Result<PathBuf, String> {
  Ok(app_content_root(app)?.join(GRANTS_FILE))
}

fn load_persisted_roots(app: &AppHandle, state: &LocalContentState) -> Result<(), String> {
  let path = grants_path(app)?;
  if !path.is_file() {
    return Ok(());
  }
  let raw = fs::read_to_string(&path).map_err(|e| format!("grants_read:{e}"))?;
  let value: Value = serde_json::from_str(&raw).map_err(|e| format!("grants_json:{e}"))?;
  let Some(arr) = value.get("roots").and_then(|v| v.as_array()) else {
    return Ok(());
  };
  let mut grants = state.grants.lock().map_err(|_| "grants_lock")?;
  for item in arr {
    let abs = item
      .get("abs_path")
      .and_then(|v| v.as_str())
      .map(PathBuf::from);
    let id = item.get("id").and_then(|v| v.as_str()).map(str::to_string);
    let name = item
      .get("name")
      .and_then(|v| v.as_str())
      .map(str::to_string);
    let (Some(abs), Some(id), Some(name)) = (abs, id, name) else {
      continue;
    };
    if !abs.is_dir() {
      continue;
    }
    grants.insert(
      id.clone(),
      GrantEntry {
        id,
        kind: GrantKind::Directory,
        abs_path: abs,
        name,
        is_root: true,
      },
    );
  }
  Ok(())
}

fn persist_roots(app: &AppHandle, state: &LocalContentState) -> Result<(), String> {
  let grants = state.grants.lock().map_err(|_| "grants_lock")?;
  let roots: Vec<Value> = grants
    .values()
    .filter(|g| g.is_root && g.kind == GrantKind::Directory)
    .map(|g| {
      json!({
        "id": g.id,
        "name": g.name,
        "abs_path": g.abs_path.to_string_lossy(),
      })
    })
    .collect();
  drop(grants);
  let path = grants_path(app)?;
  let body = serde_json::to_string_pretty(&json!({ "roots": roots })).map_err(|e| e.to_string())?;
  fs::write(&path, body).map_err(|e| format!("grants_write:{e}"))?;
  Ok(())
}

fn insert_grant(
  state: &LocalContentState,
  kind: GrantKind,
  abs_path: PathBuf,
  is_root: bool,
) -> Result<GrantEntry, String> {
  let name = abs_path
    .file_name()
    .map(|s| s.to_string_lossy().to_string())
    .unwrap_or_else(|| "item".into());
  let id = mint_id(match kind {
    GrantKind::File => "localref",
    GrantKind::Directory => "localdir",
  });
  let entry = GrantEntry {
    id: id.clone(),
    kind,
    abs_path,
    name,
    is_root,
  };
  let mut grants = state.grants.lock().map_err(|_| "grants_lock")?;
  grants.insert(id, entry.clone());
  Ok(entry)
}

fn resolve_ref(state: &LocalContentState, ref_id: &str) -> Result<GrantEntry, String> {
  let grants = state.grants.lock().map_err(|_| "grants_lock")?;
  grants
    .get(ref_id)
    .cloned()
    .ok_or_else(|| format!("unknown_ref:{ref_id}"))
}

fn guess_mime(name: &str) -> Option<&'static str> {
  let lower = name.to_lowercase();
  if lower.ends_with(".png") {
    Some("image/png")
  } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
    Some("image/jpeg")
  } else if lower.ends_with(".gif") {
    Some("image/gif")
  } else if lower.ends_with(".webp") {
    Some("image/webp")
  } else if lower.ends_with(".svg") {
    Some("image/svg+xml")
  } else if lower.ends_with(".mp4") {
    Some("video/mp4")
  } else if lower.ends_with(".webm") {
    Some("video/webm")
  } else if lower.ends_with(".glb") {
    Some("model/gltf-binary")
  } else if lower.ends_with(".gltf") {
    Some("model/gltf+json")
  } else if lower.ends_with(".pdf") {
    Some("application/pdf")
  } else if lower.ends_with(".json") {
    Some("application/json")
  } else {
    None
  }
}

fn content_kind(mime: Option<&str>, name: &str) -> &'static str {
  let m = mime.unwrap_or("");
  let n = name.to_lowercase();
  if m.starts_with("image/") || n.ends_with(".png") || n.ends_with(".jpg") || n.ends_with(".jpeg") {
    "image"
  } else if m.starts_with("video/") || n.ends_with(".mp4") || n.ends_with(".webm") {
    "video"
  } else if m.starts_with("model/") || n.ends_with(".glb") || n.ends_with(".gltf") {
    "model"
  } else if m.starts_with("audio/") {
    "audio"
  } else if m.starts_with("font/") {
    "font"
  } else if m.contains("pdf") || n.ends_with(".pdf") || n.ends_with(".md") || n.ends_with(".txt") {
    "document"
  } else {
    "other"
  }
}

fn entry_json(entry: &GrantEntry) -> Value {
  let meta = fs::metadata(&entry.abs_path).ok();
  let mime = if entry.kind == GrantKind::File {
    guess_mime(&entry.name)
  } else {
    None
  };
  json!({
    "ref": entry.id,
    "name": entry.name,
    "kind": if entry.kind == GrantKind::Directory { "directory" } else { "file" },
    "mime": mime,
    "bytes": meta.as_ref().and_then(|m| if m.is_file() { Some(m.len()) } else { None }),
    "mtime": meta.and_then(|m| m.modified().ok()).and_then(|t| {
      t.duration_since(std::time::UNIX_EPOCH).ok().map(|d| {
        chrono_like_iso(d.as_secs())
      })
    }),
    "contentKind": if entry.kind == GrantKind::File {
      Some(content_kind(mime, &entry.name))
    } else {
      None
    },
  })
}

fn chrono_like_iso(secs: u64) -> String {
  // Stable opaque timestamp string without pulling chrono.
  format!("{secs}")
}

fn accept_matches(path: &Path, accept: &[String]) -> bool {
  if accept.is_empty() {
    return true;
  }
  let name = path
    .file_name()
    .map(|s| s.to_string_lossy().to_lowercase())
    .unwrap_or_default();
  let mime = guess_mime(&name).unwrap_or("");
  accept.iter().any(|a| {
    let a = a.trim().to_lowercase();
    if a.starts_with('.') {
      name.ends_with(&a)
    } else if a.ends_with("/*") {
      let prefix = a.trim_end_matches("/*");
      mime.starts_with(prefix)
    } else {
      mime.contains(&a) || name.ends_with(&a)
    }
  })
}

fn op_status(app: &AppHandle, state: &LocalContentState) -> Result<Value, String> {
  let _ = load_persisted_roots(app, state);
  let lib = library_dir(app)?;
  let machine = hostname::get()
    .map(|h| h.to_string_lossy().to_string())
    .unwrap_or_else(|_| "local".into());
  let safe: String = machine
    .chars()
    .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
    .take(48)
    .collect();
  Ok(json!({
    "ok": true,
    "status": "available",
    "availability": "available",
    "machineId": format!("host_{safe}"),
    "label": "Local Studio · native FS",
    "watchSupported": false,
    "processSupported": true,
    "nativeFs": true,
    "requiresNode": false,
    "library": lib.to_string_lossy(),
    "browserImportFallback": false,
  }))
}

fn op_pick_files(state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let multiple = req
    .get("multiple")
    .and_then(|v| v.as_bool())
    .unwrap_or(true);
  let accept: Vec<String> = req
    .get("accept")
    .and_then(|v| v.as_array())
    .map(|arr| {
      arr
        .iter()
        .filter_map(|x| x.as_str().map(str::to_string))
        .collect()
    })
    .unwrap_or_default();

  let mut dialog = rfd::FileDialog::new().set_title("Open File");
  // Extension filters when accept looks like .ext
  let exts: Vec<String> = accept
    .iter()
    .filter(|a| a.starts_with('.') || (!a.contains('/') && a.contains('.')))
    .map(|a| a.trim_start_matches('.').to_string())
    .collect();
  if !exts.is_empty() {
    let owned = exts.clone();
    dialog = dialog.add_filter("Accepted", &owned.iter().map(|s| s.as_str()).collect::<Vec<_>>());
  }

  let paths = if multiple {
    dialog.pick_files().unwrap_or_default()
  } else {
    dialog.pick_file().into_iter().collect::<Vec<_>>()
  };

  let mut refs = Vec::new();
  let mut entries = Vec::new();
  for path in paths {
    if !accept_matches(&path, &accept) {
      continue;
    }
    if !path.is_file() {
      continue;
    }
    let entry = insert_grant(state, GrantKind::File, path, false)?;
    refs.push(Value::String(entry.id.clone()));
    entries.push(entry_json(&entry));
  }
  Ok(json!({
    "ok": true,
    "refs": refs,
    "entries": entries,
    "copied": false,
    "note": "Opaque local refs only — original remains in place until import_to_library",
  }))
}

fn op_pick_directory(
  app: &AppHandle,
  state: &LocalContentState,
  req: &Value,
) -> Result<Value, String> {
  let title = req
    .get("title")
    .and_then(|v| v.as_str())
    .unwrap_or("Open Folder");
  let path = rfd::FileDialog::new()
    .set_title(title)
    .pick_folder()
    .ok_or_else(|| "pick_cancelled".to_string())?;
  if !path.is_dir() {
    return Err("not_a_directory".into());
  }
  let entry = insert_grant(state, GrantKind::Directory, path, true)?;
  persist_roots(app, state)?;
  Ok(json!({
    "ok": true,
    "ref": entry.id,
    "name": entry.name,
    "kind": "directory",
    "copied": false,
  }))
}

fn op_list(state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let ref_id = req
    .get("ref")
    .or_else(|| req.get("path"))
    .and_then(|v| v.as_str())
    .unwrap_or("");

  // Empty / library sentinel → list granted roots (not a fake fixed library path).
  if ref_id.is_empty() || ref_id == "." || ref_id == ".agentsam/content-library" {
    let grants = state.grants.lock().map_err(|_| "grants_lock")?;
    let entries: Vec<Value> = grants
      .values()
      .filter(|g| g.is_root && g.kind == GrantKind::Directory)
      .map(entry_json)
      .collect();
    return Ok(json!({ "ok": true, "entries": entries, "path": "grants" }));
  }

  let parent = resolve_ref(state, ref_id)?;
  if parent.kind != GrantKind::Directory {
    return Err("not_a_directory".into());
  }
  let mut entries = Vec::new();
  let rd = fs::read_dir(&parent.abs_path).map_err(|e| format!("read_dir:{e}"))?;
  for item in rd.flatten() {
    let path = item.path();
    // Skip traversal components
    if path
      .file_name()
      .and_then(|n| n.to_str())
      .map(|n| n == "." || n == "..")
      .unwrap_or(false)
    {
      continue;
    }
    let kind = if path.is_dir() {
      GrantKind::Directory
    } else if path.is_file() {
      GrantKind::File
    } else {
      continue;
    };
    let entry = insert_grant(state, kind, path, false)?;
    entries.push(entry_json(&entry));
  }
  Ok(json!({ "ok": true, "entries": entries, "path": parent.id }))
}

fn op_stat(state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let ref_id = req
    .get("ref")
    .or_else(|| req.get("path"))
    .and_then(|v| v.as_str())
    .ok_or_else(|| "ref_required".to_string())?;
  let entry = resolve_ref(state, ref_id)?;
  let mut value = entry_json(&entry);
  if let Some(obj) = value.as_object_mut() {
    obj.insert("ok".into(), Value::Bool(true));
  }
  Ok(value)
}

fn op_read(state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let ref_id = req
    .get("ref")
    .or_else(|| req.get("path"))
    .and_then(|v| v.as_str())
    .ok_or_else(|| "ref_required".to_string())?;
  let entry = resolve_ref(state, ref_id)?;
  if entry.kind != GrantKind::File {
    return Err("is_directory".into());
  }
  let meta = fs::metadata(&entry.abs_path).map_err(|e| format!("stat:{e}"))?;
  let max = req
    .get("maxBytes")
    .and_then(|v| v.as_u64())
    .unwrap_or(MAX_READ_BYTES)
    .min(MAX_READ_BYTES);
  if meta.len() > max {
    return Err(format!("file_too_large:{}>{}", meta.len(), max));
  }
  let mut file = fs::File::open(&entry.abs_path).map_err(|e| format!("open:{e}"))?;
  let mut buf = Vec::with_capacity(meta.len() as usize);
  file
    .read_to_end(&mut buf)
    .map_err(|e| format!("read:{e}"))?;
  let mime = guess_mime(&entry.name);
  Ok(json!({
    "ok": true,
    "ref": entry.id,
    "mime": mime,
    "bytes": buf.len(),
    "encoding": "base64",
    "data": B64.encode(&buf),
  }))
}

fn op_materialize(state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let ref_id = req
    .get("ref")
    .or_else(|| req.get("path"))
    .and_then(|v| v.as_str())
    .ok_or_else(|| "ref_required".to_string())?;
  let entry = resolve_ref(state, ref_id)?;
  if entry.kind != GrantKind::File {
    return Err("is_directory".into());
  }
  let meta = fs::metadata(&entry.abs_path).map_err(|e| format!("stat:{e}"))?;
  Ok(json!({
    "ok": true,
    "ref": entry.id,
    "mime": guess_mime(&entry.name),
    "bytes": meta.len(),
    // Opaque hint only — never absolute path for remote/model contexts.
    "pathHint": entry.id,
  }))
}

fn op_reveal(state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let ref_id = req
    .get("ref")
    .or_else(|| req.get("path"))
    .and_then(|v| v.as_str())
    .ok_or_else(|| "ref_required".to_string())?;
  let entry = resolve_ref(state, ref_id)?;
  let abs = &entry.abs_path;
  #[cfg(target_os = "macos")]
  {
    Command::new("open")
      .args(["-R", &abs.to_string_lossy()])
      .spawn()
      .map_err(|e| format!("reveal:{e}"))?;
  }
  #[cfg(target_os = "windows")]
  {
    Command::new("explorer")
      .args(["/select,", &abs.to_string_lossy()])
      .spawn()
      .map_err(|e| format!("reveal:{e}"))?;
  }
  #[cfg(all(unix, not(target_os = "macos")))]
  {
    let parent = abs.parent().unwrap_or(abs);
    Command::new("xdg-open")
      .arg(parent)
      .spawn()
      .map_err(|e| format!("reveal:{e}"))?;
  }
  Ok(json!({ "ok": true, "revealed": entry.id }))
}

fn op_import_to_library(
  app: &AppHandle,
  state: &LocalContentState,
  req: &Value,
) -> Result<Value, String> {
  let ref_id = req
    .get("ref")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "ref_required".to_string())?;
  let entry = resolve_ref(state, ref_id)?;
  if entry.kind != GrantKind::File {
    return Err("import_requires_file".into());
  }
  // resolve_ref already proved this opaque ref is a user-granted path.

  let lib = library_dir(app)?;
  let mut dest_name = entry.name.clone();
  // Sanitize path separators
  dest_name = dest_name.replace(['/', '\\'], "_");
  let dest = unique_dest(&lib, &dest_name)?;
  fs::copy(&entry.abs_path, &dest).map_err(|e| format!("copy:{e}"))?;
  let imported = insert_grant(state, GrantKind::File, dest, false)?;
  let mime = guess_mime(&imported.name);
  Ok(json!({
    "ok": true,
    "ref": imported.id,
    "assetId": imported.id,
    "name": imported.name,
    "mime": mime,
    "bytes": fs::metadata(&imported.abs_path).map(|m| m.len()).unwrap_or(0),
    "contentKind": content_kind(mime, &imported.name),
    "copied": true,
  }))
}

fn unique_dest(dir: &Path, name: &str) -> Result<PathBuf, String> {
  let candidate = dir.join(name);
  if !candidate.exists() {
    return Ok(candidate);
  }
  let stem = Path::new(name)
    .file_stem()
    .map(|s| s.to_string_lossy().to_string())
    .unwrap_or_else(|| "file".into());
  let ext = Path::new(name)
    .extension()
    .map(|s| format!(".{}", s.to_string_lossy()))
    .unwrap_or_default();
  for i in 1..10_000 {
    let alt = dir.join(format!("{stem}-{i}{ext}"));
    if !alt.exists() {
      return Ok(alt);
    }
  }
  Err("unique_dest_exhausted".into())
}

fn op_import_bytes(app: &AppHandle, state: &LocalContentState, req: &Value) -> Result<Value, String> {
  // Browser-import fallback path — desktop prefers pick_files without copy.
  let name = req
    .get("name")
    .and_then(|v| v.as_str())
    .unwrap_or("upload.bin")
    .replace(['/', '\\'], "_");
  let encoding = req
    .get("encoding")
    .and_then(|v| v.as_str())
    .unwrap_or("base64");
  if encoding != "base64" {
    return Err("encoding_must_be_base64".into());
  }
  let data = req
    .get("data")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "data_required".to_string())?;
  let buf = B64
    .decode(data.as_bytes())
    .map_err(|e| format!("base64:{e}"))?;
  if buf.is_empty() {
    return Err("empty_bytes".into());
  }
  if buf.len() as u64 > MAX_READ_BYTES {
    return Err("file_too_large".into());
  }
  let lib = library_dir(app)?;
  let dest = unique_dest(&lib, &name)?;
  let mut file = fs::File::create(&dest).map_err(|e| format!("create:{e}"))?;
  file.write_all(&buf).map_err(|e| format!("write:{e}"))?;
  let entry = insert_grant(state, GrantKind::File, dest, false)?;
  let mime = guess_mime(&entry.name);
  Ok(json!({
    "ok": true,
    "ref": entry.id,
    "name": entry.name,
    "mime": mime,
    "bytes": buf.len(),
    "contentKind": content_kind(mime, &entry.name),
    "browserImport": true,
    "copied": true,
  }))
}

/// Desktop image optimize — no Nitro, no hosted Studio.
/// macOS: `sips` → JPEG (max edge 2048). Elsewhere: try `magick`, else copy as derivative.
fn op_optimize_image(app: &AppHandle, state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let filename = req
    .get("filename")
    .and_then(|v| v.as_str())
    .unwrap_or("image.bin")
    .replace(['/', '\\'], "_");
  let mime = req.get("mime").and_then(|v| v.as_str()).unwrap_or("");
  if !mime.is_empty() && !mime.starts_with("image/") {
    return Ok(json!({ "ok": true, "skipped": true }));
  }
  let encoding = req
    .get("encoding")
    .and_then(|v| v.as_str())
    .unwrap_or("base64");
  if encoding != "base64" {
    return Err("encoding_must_be_base64".into());
  }
  let data = req
    .get("data")
    .and_then(|v| v.as_str())
    .ok_or_else(|| "data_required".to_string())?;
  let buf = B64
    .decode(data.as_bytes())
    .map_err(|e| format!("base64:{e}"))?;
  if buf.is_empty() {
    return Err("empty_bytes".into());
  }
  if buf.len() as u64 > MAX_READ_BYTES {
    return Err("file_too_large".into());
  }

  let opt_dir = library_dir(app)?.join("optimized");
  fs::create_dir_all(&opt_dir).map_err(|e| format!("mkdir_optimized:{e}"))?;

  let stem = Path::new(&filename)
    .file_stem()
    .map(|s| s.to_string_lossy().to_string())
    .unwrap_or_else(|| "image".into());
  let stamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| d.as_millis())
    .unwrap_or(0);

  let src_ext = Path::new(&filename)
    .extension()
    .map(|s| format!(".{}", s.to_string_lossy()))
    .unwrap_or_else(|| ".bin".into());
  let src_path = opt_dir.join(format!("src-{stem}-{stamp}{src_ext}"));
  fs::write(&src_path, &buf).map_err(|e| format!("write_src:{e}"))?;

  let out_name = format!("{stem}-{stamp}.jpg");
  let out_path = unique_dest(&opt_dir, &out_name)?;
  let mut processor = "sips";

  #[cfg(target_os = "macos")]
  {
    let status = Command::new("sips")
      .args([
        "-s",
        "format",
        "jpeg",
        "-Z",
        "2048",
        &src_path.to_string_lossy(),
        "--out",
        &out_path.to_string_lossy(),
      ])
      .status()
      .map_err(|e| format!("sips:{e}"))?;
    if !status.success() {
      fs::copy(&src_path, &out_path).map_err(|e| format!("copy_fallback:{e}"))?;
      processor = "copy-fallback";
    }
  }

  #[cfg(not(target_os = "macos"))]
  {
    processor = "magick";
    let magick = Command::new("magick")
      .args([
        &src_path.to_string_lossy().to_string(),
        "-resize",
        "2048x2048>",
        "-quality",
        "82",
        &out_path.to_string_lossy().to_string(),
      ])
      .status();
    match magick {
      Ok(st) if st.success() => {}
      _ => {
        let convert = Command::new("convert")
          .args([
            &src_path.to_string_lossy().to_string(),
            "-resize",
            "2048x2048>",
            "-quality",
            "82",
            &out_path.to_string_lossy().to_string(),
          ])
          .status();
        if convert.map(|s| s.success()).unwrap_or(false) {
          processor = "imagemagick";
        } else {
          fs::copy(&src_path, &out_path).map_err(|e| format!("copy_fallback:{e}"))?;
          processor = "copy-fallback";
        }
      }
    }
  }

  let _ = fs::remove_file(&src_path);
  let meta = fs::metadata(&out_path).map_err(|e| format!("stat_out:{e}"))?;
  let entry = insert_grant(state, GrantKind::File, out_path, false)?;

  let mut width: Option<u64> = None;
  let mut height: Option<u64> = None;
  #[cfg(target_os = "macos")]
  {
    if let Ok(out) = Command::new("sips")
      .args(["-g", "pixelWidth", "-g", "pixelHeight", &entry.abs_path.to_string_lossy()])
      .output()
    {
      let text = String::from_utf8_lossy(&out.stdout);
      for line in text.lines() {
        if let Some(v) = line.strip_prefix("  pixelWidth: ") {
          width = v.trim().parse().ok();
        }
        if let Some(v) = line.strip_prefix("  pixelHeight: ") {
          height = v.trim().parse().ok();
        }
      }
    }
  }

  Ok(json!({
    "ok": true,
    "ref": entry.id,
    "format": "jpeg",
    "bytes": meta.len(),
    "width": width,
    "height": height,
    "processor": processor,
    "name": entry.name,
  }))
}

fn dispatch(app: &AppHandle, state: &LocalContentState, req: &Value) -> Result<Value, String> {
  let op = req
    .get("op")
    .and_then(|v| v.as_str())
    .unwrap_or("")
    .trim();
  match op {
    "status" => op_status(app, state),
    "pick_files" => op_pick_files(state, req),
    "pick_directory" => op_pick_directory(app, state, req),
    "list" => {
      let _ = load_persisted_roots(app, state);
      op_list(state, req)
    }
    "stat" => op_stat(state, req),
    "read" => op_read(state, req),
    "materialize" => op_materialize(state, req),
    "reveal" => op_reveal(state, req),
    "import_to_library" => op_import_to_library(app, state, req),
    "import_bytes" => op_import_bytes(app, state, req),
    "optimize_image" => op_optimize_image(app, state, req),
    "pick_probe" => Ok(json!({
      "ok": true,
      "pickSupported": true,
      "nativePicker": true,
      "note": "Native rfd picker; opaque refs; no copy until import_to_library",
    })),
    "" => Err("unknown_op:missing".into()),
    other => Err(format!("unknown_op:{other}")),
  }
}

#[tauri::command]
pub async fn local_content_bridge(
  app: AppHandle,
  state: State<'_, LocalContentState>,
  request_json: String,
) -> Result<String, String> {
  let req: Value =
    serde_json::from_str(&request_json).map_err(|e| format!("invalid_json:{e}"))?;
  match dispatch(&app, &state, &req) {
    Ok(value) => serde_json::to_string(&value).map_err(|e| e.to_string()),
    Err(err) => Ok(
      json!({
        "ok": false,
        "error": err,
        "status": 400,
      })
      .to_string(),
    ),
  }
}

#[allow(dead_code)]
fn reject_path_escape(rel: &str) -> Result<(), String> {
  let path = Path::new(rel);
  for c in path.components() {
    if matches!(c, Component::ParentDir) {
      return Err("path_escape".into());
    }
  }
  Ok(())
}
