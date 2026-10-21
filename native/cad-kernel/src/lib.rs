//! Portable, deterministic preview tessellation for CAD primitives.
//! Exact B-Rep and STEP remain the responsibility of the OCCT backend.
//! Never mistake these f32 display triangles for editable precision solids.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeshData {
    pub positions: Vec<f32>,
    pub normals: Vec<f32>,
    pub indices: Vec<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CadPrimitive {
    Box { length: f32, width: f32, height: f32 },
    Cylinder { radius: f32, height: f32, segments: u32 },
}

fn positive_dimension(value: f32) -> bool {
    value.is_finite() && value > 0.0 && value <= 1_000_000.0
}

/// Evaluate a preview mesh with explicit errors for invalid or unsupported geometry.
pub fn evaluate_primitive(primitive: &CadPrimitive) -> Result<MeshData, String> {
    match *primitive {
        CadPrimitive::Box { length, width, height } => {
            if ![length, width, height].iter().copied().all(positive_dimension) {
                return Err("cad_invalid_box_dimensions".into());
            }
            Ok(generate_box_mesh(length, width, height))
        }
        CadPrimitive::Cylinder { radius, height, segments } => {
            if !positive_dimension(radius) || !positive_dimension(height) || !(3..=4096).contains(&segments) {
                return Err("cad_invalid_cylinder_dimensions".into());
            }
            Ok(generate_cylinder_mesh(radius, height, segments))
        }
    }
}

fn generate_box_mesh(l: f32, w: f32, h: f32) -> MeshData {
    let x = l / 2.0;
    let y = h / 2.0;
    let z = w / 2.0;
    let positions = vec![
        -x, -y,  z,   x, -y,  z,   x,  y,  z,  -x,  y,  z,
        -x, -y, -z,  -x,  y, -z,   x,  y, -z,   x, -y, -z,
        -x,  y, -z,  -x,  y,  z,   x,  y,  z,   x,  y, -z,
        -x, -y, -z,   x, -y, -z,   x, -y,  z,  -x, -y,  z,
         x, -y, -z,   x,  y, -z,   x,  y,  z,   x, -y,  z,
        -x, -y, -z,  -x, -y,  z,  -x,  y,  z,  -x,  y, -z,
    ];
    let normals = vec![
        0., 0., 1.,  0., 0., 1.,  0., 0., 1.,  0., 0., 1.,
        0., 0.,-1.,  0., 0.,-1.,  0., 0.,-1.,  0., 0.,-1.,
        0., 1., 0.,  0., 1., 0.,  0., 1., 0.,  0., 1., 0.,
        0.,-1., 0.,  0.,-1., 0.,  0.,-1., 0.,  0.,-1., 0.,
        1., 0., 0.,  1., 0., 0.,  1., 0., 0.,  1., 0., 0.,
       -1., 0., 0., -1., 0., 0., -1., 0., 0., -1., 0., 0.,
    ];
    let mut indices = Vec::with_capacity(36);
    for i in 0..6 {
        let offset = i * 4;
        indices.extend_from_slice(&[offset, offset + 1, offset + 2, offset, offset + 2, offset + 3]);
    }
    MeshData { positions, normals, indices }
}

fn generate_cylinder_mesh(radius: f32, height: f32, segments: u32) -> MeshData {
    let n = segments as usize;
    let mut positions = Vec::with_capacity((4*n+2)*3);
    let mut normals = Vec::with_capacity((4*n+2)*3);
    let mut indices = Vec::with_capacity(n*12);
    let y = height / 2.0;
    // Non-index-shared side vertices provide smooth radial normals.
    for i in 0..n {
        let theta = std::f32::consts::TAU * i as f32 / n as f32;
        let (s,c) = theta.sin_cos();
        for y_pos in [-y,y] {
            positions.extend_from_slice(&[radius*c,y_pos,radius*s]);
            normals.extend_from_slice(&[c,0.0,s]);
        }
    }
    for i in 0..n {
        let j = (i+1)%n;
        let a = (2*i) as u32;
        let b = (2*j) as u32;
        indices.extend_from_slice(&[a,b,a+1,b,b+1,a+1]);
    }
    // Separate planar cap vertices provide correct flat normals.
    for (top, normal_y) in [(false,-1.0),(true,1.0)] {
        let center = (positions.len()/3) as u32;
        positions.extend_from_slice(&[0.0,if top {y} else {-y},0.0]);
        normals.extend_from_slice(&[0.0,normal_y,0.0]);
        for i in 0..n {
            let theta = std::f32::consts::TAU * i as f32 / n as f32;
            let (s,c) = theta.sin_cos();
            positions.extend_from_slice(&[radius*c,if top {y} else {-y},radius*s]);
            normals.extend_from_slice(&[0.0,normal_y,0.0]);
        }
        for i in 0..n {
            let a = center + 1 + i as u32;
            let b = center + 1 + ((i+1)%n) as u32;
            if top { indices.extend_from_slice(&[center,b,a]); }
            else { indices.extend_from_slice(&[center,a,b]); }
        }
    }
    MeshData { positions, normals, indices }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn evaluate_primitive_wasm(val: wasm_bindgen::JsValue) -> Result<wasm_bindgen::JsValue, wasm_bindgen::JsValue> {
    let prim: CadPrimitive = serde_wasm_bindgen::from_value(val)
        .map_err(|e| wasm_bindgen::JsValue::from_str(&e.to_string()))?;
    let mesh = evaluate_primitive(&prim).map_err(|e| wasm_bindgen::JsValue::from_str(&e))?;
    serde_wasm_bindgen::to_value(&mesh).map_err(|e| wasm_bindgen::JsValue::from_str(&e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn box_is_real_dimensions_and_indexed() {
        let mesh = evaluate_primitive(&CadPrimitive::Box {length:6.0,width:4.0,height:2.0}).unwrap();
        assert_eq!(mesh.indices.len(), 36);
        assert_eq!(mesh.positions.len(), mesh.normals.len());
        assert!(mesh.positions.chunks_exact(3).all(|p| p[0].abs()<=3.0 && p[1].abs()<=1.0 && p[2].abs()<=2.0));
    }
    #[test]
    fn cylinder_is_not_a_box_and_has_true_radial_normals() {
        let segments = 32;
        let mesh = evaluate_primitive(&CadPrimitive::Cylinder {radius:3.0,height:7.0,segments}).unwrap();
        assert_eq!(mesh.indices.len(), (segments*12) as usize);
        assert_eq!(mesh.positions.len(),mesh.normals.len());
        assert!(mesh.indices.iter().all(|i| (*i as usize)<mesh.positions.len()/3));
        let xs: Vec<f32> = mesh.positions.chunks_exact(3).map(|p| p[0]).collect();
        assert!(xs.iter().any(|x| *x > 2.9) && xs.iter().any(|x| *x < -2.9));
        assert!(mesh.normals.chunks_exact(3).any(|p| p[0].abs()>0.1 && p[2].abs()>0.1));
    }
    #[test]
    fn dimensions_cannot_be_silent_invalid_meshes() {
        assert!(evaluate_primitive(&CadPrimitive::Box {length:f32::NAN,width:2.0,height:3.0}).is_err());
        assert!(evaluate_primitive(&CadPrimitive::Cylinder {radius:1.0,height:2.0,segments:2}).is_err());
        assert!(evaluate_primitive(&CadPrimitive::Cylinder {radius:-1.0,height:2.0,segments:32}).is_err());
    }
}
