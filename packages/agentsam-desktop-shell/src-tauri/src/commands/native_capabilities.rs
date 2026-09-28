//! Read-only native capability discovery for the installed AgentSam desktop host.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize)]
pub struct NativeTool {
  pub id: String,
  pub available: bool,
  pub path: Option<String>,
  pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NativeCapabilityReport {
  pub schema: String,
  pub os: String,
  pub arch: String,
  pub tools: BTreeMap<String, NativeTool>,
  pub capabilities: BTreeMap<String, bool>,
}

fn is_executable_file(path: &Path) -> bool {
  path.is_file()
}

fn from_path(names: &[&str]) -> Option<PathBuf> {
  let path = std::env::var_os("PATH")?;
  for dir in std::env::split_paths(&path) {
    for name in names {
      let candidate = dir.join(name);
      if is_executable_file(&candidate) {
        return Some(candidate);
      }
      if cfg!(windows) {
        let exe = dir.join(format!("{name}.exe"));
        if is_executable_file(&exe) {
          return Some(exe);
        }
      }
    }
  }
  None
}

fn first_existing(paths: &[&str]) -> Option<PathBuf> {
  paths
    .iter()
    .map(PathBuf::from)
    .find(|path| is_executable_file(path))
}

fn bundled_sibling(name: &str) -> Option<PathBuf> {
  let current = std::env::current_exe().ok()?;
  let dir = current.parent()?;
  let direct = dir.join(name);
  if is_executable_file(&direct) {
    return Some(direct);
  }
  let resources = dir.parent()?.join("Resources").join(name);
  is_executable_file(&resources).then_some(resources)
}

fn detect(id: &str, path_names: &[&str], fixed: &[&str], bundled_name: Option<&str>) -> NativeTool {
  if let Some(name) = bundled_name {
    if let Some(path) = bundled_sibling(name) {
      return NativeTool {
        id: id.into(),
        available: true,
        path: Some(path.to_string_lossy().to_string()),
        source: Some("bundled".into()),
      };
    }
  }

  if let Some(path) = first_existing(fixed) {
    return NativeTool {
      id: id.into(),
      available: true,
      path: Some(path.to_string_lossy().to_string()),
      source: Some("application".into()),
    };
  }

  if let Some(path) = from_path(path_names) {
    return NativeTool {
      id: id.into(),
      available: true,
      path: Some(path.to_string_lossy().to_string()),
      source: Some("path".into()),
    };
  }

  NativeTool {
    id: id.into(),
    available: false,
    path: None,
    source: None,
  }
}

#[tauri::command]
pub fn native_capabilities() -> NativeCapabilityReport {
  let mut tools = BTreeMap::new();

  let definitions: &[(&str, &[&str], &[&str], Option<&str>)] = &[
    ("git", &["git"], &[], None),
    ("node", &["node"], &[], None),
    ("npm", &["npm"], &[], None),
    ("python", &["python3", "python"], &[], None),
    ("rustc", &["rustc"], &[], None),
    ("cargo", &["cargo"], &[], None),
    ("go", &["go"], &[], None),
    ("docker", &["docker"], &[], None),
    ("agentsamd", &["agentsamd"], &[], Some(if cfg!(windows) { "agentsamd.exe" } else { "agentsamd" })),
    ("agentsam-machine", &["agentsam-machine"], &[], Some(if cfg!(windows) { "agentsam-machine.exe" } else { "agentsam-machine" })),
    (
      "freecad",
      &["FreeCADCmd", "freecadcmd", "freecad"],
      &[
        "/Applications/FreeCAD.app/Contents/Resources/bin/FreeCADCmd",
        "/usr/bin/FreeCADCmd",
        "/usr/bin/freecadcmd",
      ],
      None,
    ),
    (
      "openscad",
      &["openscad"],
      &[
        "/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD",
        "/usr/bin/openscad",
      ],
      None,
    ),
    (
      "blender",
      &["blender"],
      &[
        "/Applications/Blender.app/Contents/MacOS/Blender",
        "/usr/bin/blender",
      ],
      None,
    ),
  ];

  for (id, names, fixed, bundled) in definitions {
    let tool = detect(id, names, fixed, *bundled);
    tools.insert((*id).to_string(), tool);
  }

  let has = |id: &str| tools.get(id).map(|tool| tool.available).unwrap_or(false);
  let mut capabilities = BTreeMap::new();
  capabilities.insert("runtime.exec".into(), has("agentsamd"));
  capabilities.insert("runtime.pty".into(), has("agentsamd"));
  capabilities.insert("coding.git".into(), has("git"));
  capabilities.insert("coding.node".into(), has("node"));
  capabilities.insert("coding.rust".into(), has("rustc") && has("cargo"));
  capabilities.insert("coding.go".into(), has("go"));
  capabilities.insert("machine.inspect".into(), has("agentsam-machine"));
  capabilities.insert("cad.openscad".into(), has("openscad"));
  capabilities.insert("cad.freecad".into(), has("freecad"));
  capabilities.insert("cad.blender".into(), has("blender"));

  NativeCapabilityReport {
    schema: "agentsam.native-capabilities.v1".into(),
    os: std::env::consts::OS.into(),
    arch: std::env::consts::ARCH.into(),
    tools,
    capabilities,
  }
}
