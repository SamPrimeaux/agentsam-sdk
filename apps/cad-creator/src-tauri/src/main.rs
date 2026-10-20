// Target 2: Desktop native command in Tauri
#[tauri::command]
fn create_geometry(params: BoxParams) -> Vec<f32> {
    // Calls native Rust kernel directly in process
    cad_kernel::generate_solid_mesh(params)
}
