/**
 * Display adapter for a verified native OCCT mesh. Native B-rep remains the
 * geometry authority; this function only converts its tessellation for Three.js.
 * Contract: millimeters, Z-up, positions and normals per vertex, triangle indices.
 */
export function createOcctMeshGeometry(mesh, runtime, options = {}) {
  const THREE = runtime?.THREE ?? runtime;
  if (typeof THREE?.BufferGeometry !== 'function' || typeof THREE?.BufferAttribute !== 'function') {
    throw new Error('agentsam_occt_three_runtime_required');
  }
  if (mesh?.units !== 'mm' || mesh?.axes !== 'z-up') throw new Error('native_mesh_coordinate_contract_invalid');
  const positions = mesh.positions, normals = mesh.normals, indices = mesh.indices;
  if (!Array.isArray(positions) && !ArrayBuffer.isView(positions)) throw new Error('native_mesh_positions_invalid');
  if (!Array.isArray(normals) && !ArrayBuffer.isView(normals)) throw new Error('native_mesh_normals_invalid');
  if (!Array.isArray(indices) && !ArrayBuffer.isView(indices)) throw new Error('native_mesh_indices_invalid');
  if (positions.length === 0 || positions.length % 3 || normals.length !== positions.length || indices.length % 3) {
    throw new Error('native_mesh_topology_invalid');
  }
  const vertexCount = positions.length / 3;
  // Validate without duplicating potentially millions of vertex scalars.
  for (let i = 0; i < positions.length; i++) {
    if (!Number.isFinite(positions[i]) || !Number.isFinite(normals[i])) {
      throw new Error('native_mesh_values_invalid');
    }
  }
  for (let i = 0; i < indices.length; i++) {
    const index = indices[i];
    if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) {
      throw new Error('native_mesh_values_invalid');
    }
  }
  const sign = options.planYSign ?? -1;
  if (sign !== -1 && sign !== 1) throw new Error('native_mesh_axis_sign_invalid');
  const points = new Float32Array(positions.length);
  const shading = new Float32Array(normals.length);
  for (let i = 0; i < points.length; i += 3) {
    points[i] = positions[i] * .001;
    points[i+1] = positions[i+2] * .001;
    points[i+2] = positions[i+1] === 0 ? 0 : positions[i+1] * .001 * sign;
    shading[i] = normals[i];
    shading[i+1] = normals[i+2];
    shading[i+2] = normals[i+1] === 0 ? 0 : normals[i+1] * sign;
  }
  const triangles = Array.from(indices);
  if (sign === 1) {
    for (let i = 0; i < triangles.length; i += 3) [triangles[i+1], triangles[i+2]] = [triangles[i+2], triangles[i+1]];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(shading, 3));
  geometry.setIndex(triangles);
  geometry.computeBoundingSphere();
  return geometry;
}
