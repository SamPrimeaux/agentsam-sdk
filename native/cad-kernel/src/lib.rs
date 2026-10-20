use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct BoxParams {
    pub length: f64,
    pub width: f64,
    pub height: f64,
}

// Core Rust logic (shared across Wasm, Tauri, and Server)
pub fn generate_solid_mesh(params: BoxParams) -> Vec<f32> {
    // 1. Evaluate B-Rep or Manifold mesh in memory
    // 2. Output raw vertex triangle buffers (glTF compatible)
    vec![/* float array of vertices */]
}

// -------------------------------------------------------------
// Target 1: WebAssembly export (for Browser Web Worker)
// -------------------------------------------------------------
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn generate_mesh_wasm(val: JsValue) -> JsValue {
    let params: BoxParams = serde_wasm_bindgen::from_value(val).unwrap();
    let mesh = generate_solid_mesh(params);
    serde_wasm_bindgen::to_value(&mesh).unwrap()
}
