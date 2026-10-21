//! Native CAD Tauri commands. Preview geometry is produced in Rust.
//! STEP requires a packaged OCCT executable; never fake a successful export.
use cad_kernel::{evaluate_primitive, CadPrimitive, MeshData};
use rand::{distributions::Alphanumeric, Rng};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{fs, path::PathBuf, process::Command};
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize)]
pub struct StepExport {
    format: String,
    engine: String,
    sha256: String,
    size_bytes: usize,
    path: String,
    volume_mm3: f64,
}

#[tauri::command]
pub fn generate_cad_mesh(primitive: CadPrimitive) -> Result<MeshData, String> {
    evaluate_primitive(&primitive)
}

fn mm(value: f64, units: &str) -> Result<f64, String> {
    let size = match units {
        "mm" => value,
        "in" => value * 25.4,
        _ => return Err("cad_explicit_units_required".into()),
    };
    if size.is_finite() && size > 0.0 && size <= 1_000_000.0 {
        Ok(size)
    } else {
        Err("cad_invalid_dimensions".into())
    }
}

fn parse_receipt(out: &[u8], operation: Option<&str>) -> Result<Value, String> {
    let text = std::str::from_utf8(out).map_err(|_| "occt_receipt_encoding_invalid")?;
    let body = text.lines().rev().find_map(|line| line.strip_prefix("AGENTSAM_RESULT="))
        .ok_or("occt_receipt_missing")?;
    let value: Value = serde_json::from_str(body).map_err(|_| "occt_receipt_json_invalid")?;
    if value["ok"].as_bool() != Some(true) || value["engine"].as_str() != Some("occt")
        || operation.is_some_and(|op| value["operation"].as_str() != Some(op)) {
        return Err("occt_receipt_unverified".into());
    }
    Ok(value)
}

fn run(bin: &PathBuf, args: &[&str], operation: Option<&str>) -> Result<Value, String> {
    let output = Command::new(bin).args(args).output().map_err(|e| format!("occt_launch_failed:{e}"))?;
    if !output.status.success() {
        return Err("occt_native_command_failed".into());
    }
    parse_receipt(&output.stdout, operation)
}

fn resolve_occt(app: &AppHandle) -> Result<PathBuf, String> {
    let mut candidates = Vec::new();
    if cfg!(debug_assertions) {
        if let Ok(value) = std::env::var("AGENTSAM_OCCT_BIN") {
            let path = PathBuf::from(value);
            if path.is_absolute() { candidates.push(path); }
        }
    }
    if let Ok(root) = app.path().resource_dir() {
        candidates.push(root.join("runtime/cad/agentsam-occt"));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() { candidates.push(parent.join("agentsam-occt")); }
    }
    candidates.into_iter().find(|path| path.is_file())
        .ok_or_else(|| "occt_binary_not_packaged".into())
}

/// Writes an OCCT STEP box into app-controlled storage, returning a verified receipt.
#[tauri::command]
pub fn export_step_file(app: AppHandle, width: f64, depth: f64, height: f64, units: String)
    -> Result<StepExport, String> {
    let dims = [mm(width, &units)?, mm(depth, &units)?, mm(height, &units)?];
    let engine = resolve_occt(&app)?;
    let health = run(&engine, &["--doctor"], None)?;
    if !health["capabilities"].as_array()
        .is_some_and(|items| items.iter().any(|item| item.as_str() == Some("solid.box.create"))) {
        return Err("occt_capability_unavailable".into());
    }
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?.join("cad/artifacts");
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    let name: String = rand::thread_rng().sample_iter(&Alphanumeric).take(24).map(char::from).collect();
    let path = root.join(format!("{name}.step"));
    let file = path.to_str().ok_or("cad_artifact_path_invalid")?;
    let sizes = dims.map(|value| value.to_string());
    let built = run(&engine, &["--box", &sizes[0], &sizes[1], &sizes[2], file], Some("solid.box.create"))?;
    let checked = run(&engine, &["--inspect", file], Some("solid.inspect.step"))?;
    let actual = checked["volume_mm3"].as_f64().ok_or("occt_volume_missing")?;
    let reported = built["volume_mm3"].as_f64().ok_or("occt_created_volume_missing")?;
    let expected: f64 = dims.iter().product();
    let tolerance = (expected * 1e-6).max(1e-5);
    if !actual.is_finite() || actual <= 0.0 || (actual - expected).abs() > tolerance
        || (reported - actual).abs() > tolerance {
        return Err("occt_step_roundtrip_failed".into());
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    if bytes.is_empty() { return Err("occt_step_empty".into()); }
    Ok(StepExport {
        format: "step".into(), engine: "occt".into(),
        sha256: format!("{:x}", Sha256::digest(&bytes)),
        size_bytes: bytes.len(), path: file.to_string(), volume_mm3: actual,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_units_dimensions_fail() {
        assert!(mm(1.0, "cm").is_err());
        assert!(mm(f64::NAN, "mm").is_err());
        assert!(mm(-1.0, "mm").is_err());
        assert_eq!(mm(10.0, "in").unwrap(), 254.0);
    }
    #[test]
    fn invalid_receipts_fail_closed() {
        assert!(parse_receipt(b"AGENTSAM_RESULT={\"ok\":true,\"engine\":\"occt\",\"operation\":\"other\"}", Some("solid.box.create")).is_err());
    }
}
