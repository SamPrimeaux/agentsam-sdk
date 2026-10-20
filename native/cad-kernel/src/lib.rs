use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshData {
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub indices: Vec<u32>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CadPrimitive {
    Box { length: f32, width: f32, height: f32 },
    Cylinder { radius: f32, height: f32, segments: u32 },
}

/// Evaluates parametric primitives into triangular mesh geometry buffers
pub fn evaluate_primitive(primitive: &CadPrimitive) -> MeshData {
    match primitive {
        CadPrimitive::Box { length, width, height } => generate_box_mesh(*length, *width, *height),
        CadPrimitive::Cylinder { radius, height, segments } => generate_cylinder_mesh(*radius, *height, *segments),
    }
}

fn generate_box_mesh(l: f32, w: f32, h: f32) -> MeshData {
    let x = l / 2.0;
    let y = h / 2.0;
    let z = w / 2.0;

    let positions = vec![
        // Front face
        -x, -y,  z,   x, -y,  z,   x,  y,  z,  -x,  y,  z,
        // Back face
        -x, -y, -z,  -x,  y, -z,   x,  y, -z,   x, -y, -z,
        // Top face
        -x,  y, -z,  -x,  y,  z,   x,  y,  z,   x,  y, -z,
        // Bottom face
        -x, -y, -z,   x, -y, -z,   x, -y,  z,  -x, -y,  z,
        // Right face
         x, -y, -z,   x,  y, -z,   x,  y,  z,   x, -y,  z,
        // Left face
        -x, -y, -z,  -x, -y,  z,  -x,  y,  z,  -x,  y, -z,
    ];

    let normals = vec![
        0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  0.0, 0.0, 1.0,  0.0, 0.0, 1.0,
        0.0, 0.0,-1.0,  0.0, 0.0,-1.0,  0.0, 0.0,-1.0,  0.0, 0.0,-1.0,
        0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  0.0, 1.0, 0.0,  0.0, 1.0, 0.0,
        0.0,-1.0, 0.0,  0.0,-1.0, 0.0,  0.0,-1.0, 0.0,  0.0,-1.0, 0.0,
        1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  1.0, 0.0, 0.0,  1.0, 0.0, 0.0,
       -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0, -1.0, 0.0, 0.0,
    ];

    let mut indices = Vec::new();
    for i in 0..6 {
        let offset = i * 4;
        indices.extend_from_slice(&[offset, offset + 1, offset + 2, offset, offset + 2, offset + 3]);
    }

    MeshData { positions, normals, indices }
}

fn generate_cylinder_mesh(_radius: f32, _height: f32, _segments: u32) -> MeshData {
    // Basic fallback primitive (expand with OCCT/Manifold bindings)
    generate_box_mesh(_radius * 2.0, _radius * 2.0, _height)
}

// ------------------------------------------------------------------
// WebAssembly Target Exports (for Browser Web Workers)
// ------------------------------------------------------------------
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen]
pub fn evaluate_primitive_wasm(val: JsValue) -> Result<JsValue, JsValue> {
    let prim: CadPrimitive = serde_wasm_bindgen::from_value(val)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;
    let mesh = evaluate_primitive(&prim);
    serde_wasm_bindgen::to_value(&mesh)
        .map_err(|e| JsValue::from_str(&e.to_string()))
}
